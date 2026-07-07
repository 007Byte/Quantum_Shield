package auth

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// TD-007 FIX: Account deletion now revokes all active tokens
func HandleDeleteAccount(pool *pgxpool.Pool, redisClient *redis.Client, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Use transaction for atomicity
		tx, err := pool.Begin(r.Context())
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to begin transaction")
			http.Error(w, "deletion failed", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(r.Context())

		// 1. Soft delete all user's vaults
		_, err = tx.Exec(r.Context(),
			`UPDATE vaults SET deleted_at = NOW() WHERE owner_id = $1 AND deleted_at IS NULL`,
			userID,
		)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to delete vaults")
			http.Error(w, "deletion failed", http.StatusInternalServerError)
			return
		}

		// 2. Remove user from all shared vaults
		_, err = tx.Exec(r.Context(),
			`DELETE FROM vault_members WHERE user_id = $1`,
			userID,
		)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to remove from vault memberships")
			http.Error(w, "deletion failed", http.StatusInternalServerError)
			return
		}

		// 3. Mark user as deleted in database AND bump the token epoch (F1).
		// Bumping token_epoch in the same transaction instantly invalidates EVERY
		// outstanding token for this user — web cookie and native keychain refresh
		// tokens included — even though those login-issued tokens were never
		// tracked per-JTI. This is the durable (Redis-flush-proof) guarantee that a
		// deleted account can no longer mint sessions (GDPR right-to-delete).
		var newEpoch int64
		err = tx.QueryRow(r.Context(),
			`UPDATE users SET deleted_at = NOW(), updated_at = NOW(), token_epoch = token_epoch + 1 WHERE id = $1 RETURNING token_epoch`,
			userID,
		).Scan(&newEpoch)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to mark user as deleted")
			http.Error(w, "deletion failed", http.StatusInternalServerError)
			return
		}

		// 4. Log audit event
		err = auditSvc.LogAction(r.Context(), userID, "ACCOUNT_DELETED", []byte("user_deleted_account"))
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to log audit event")
		}

		// Commit transaction
		err = tx.Commit(r.Context())
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to commit account deletion")
			http.Error(w, "deletion failed", http.StatusInternalServerError)
			return
		}

		// TD-007 FIX: Revoke all active tokens in Redis after successful DB commit
		revokeCtx, revokeCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer revokeCancel()

		// F1: mirror the bumped epoch into Redis so the hot access-token validation
		// path (middleware) rejects outstanding tokens immediately, without waiting
		// for the mirror to be refreshed on a (now impossible) login.
		setEpochMirror(revokeCtx, redisClient, userID, newEpoch)

		// F1: explicitly clear the web refresh cookie and revoke the caller's
		// current access-header + refresh-cookie JTIs. The epoch bump already
		// invalidates them logically, but clearing the cookie stops the browser
		// from replaying it and revoking the JTIs keeps the revocation list
		// consistent for the token's remaining lifetime.
		clearRefreshCookie(w)
		if authHeader := r.Header.Get("Authorization"); authHeader != "" {
			if parts := strings.SplitN(authHeader, " ", 2); len(parts) == 2 && parts[0] == "Bearer" {
				if ac, verr := ValidateToken(parts[1]); verr == nil && ac.ExpiresAt != nil {
					if ttl := time.Until(ac.ExpiresAt.Time); ttl > 0 {
						redisClient.Set(revokeCtx, "revoked:"+ac.JTI, "account_deleted", ttl)
					}
				}
			}
		}
		if c, cerr := r.Cookie(RefreshCookieName); cerr == nil && c.Value != "" {
			if rc, verr := ValidateToken(c.Value); verr == nil && rc.ExpiresAt != nil {
				if ttl := time.Until(rc.ExpiresAt.Time); ttl > 0 {
					redisClient.Set(revokeCtx, "revoked:"+rc.JTI, "account_deleted", ttl)
				}
			}
		}

		tokens, err := redisClient.SMembers(revokeCtx, "user_tokens:"+userID).Result()
		if err == nil {
			pipe := redisClient.Pipeline()
			for _, jti := range tokens {
				pipe.Set(revokeCtx, "revoked:"+jti, "account_deleted", 30*24*time.Hour)
			}
			pipe.Del(revokeCtx, "user_tokens:"+userID)
			if _, err := pipe.Exec(revokeCtx); err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to revoke tokens after account deletion")
			} else {
				log.Info().Str("user_id", userID).Int("tokens_revoked", len(tokens)).Msg("all tokens revoked after account deletion")
			}
		}

		log.Info().Str("user_id", userID).Msg("user account deleted (GDPR)")

		// 5. Return 204 No Content
		w.WriteHeader(http.StatusNoContent)
	}
}
