package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// TD-007 FIX: Account deletion now revokes all active tokens
func HandleDeleteAccount(pool *pgxpool.Pool, redisClient *redis.Client, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
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

		// 3. Mark user as deleted in database
		_, err = tx.Exec(r.Context(),
			`UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
			userID,
		)
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
