// F1 FIX (session-revocation gap): per-user token epoch.
//
// Every issued access and refresh token embeds the user's current token epoch
// (Claims.TokenEpoch). A token is only honoured while its epoch matches the
// user's current epoch; bumping the epoch instantly invalidates every
// outstanding token for that user — web cookie AND native keychain — without
// tracking individual JTIs. This closes the gap where login-issued refresh
// tokens (never registered in the user_tokens set) survived account deletion
// and logout.
//
// Storage:
//   - users.token_epoch (migration 023) is the DURABLE source of truth. It is
//     read at issuance and refresh, and bumped on deletion / logout-everywhere.
//     Surviving a Redis flush is what makes GDPR right-to-delete enforceable.
//   - user_epoch:<userID> in Redis mirrors it for the hot access-token
//     validation path (middleware) so we never hit the DB per request.
package auth

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/database"
)

const (
	// epochKeyPrefix namespaces the Redis mirror of users.token_epoch.
	epochKeyPrefix = "user_epoch:"
	// epochRedisTTL bounds the lifetime of the Redis mirror. It is refreshed on
	// every login/bump. 30 days matches the longest-lived token (refreshTokenTTL)
	// so the mirror always outlives any token it must gate; after that no
	// outstanding token can exist, so letting the key expire reclaims memory.
	epochRedisTTL = refreshTokenTTL
)

// ErrTokenEpochStale indicates the presented token's epoch is older than the
// user's current epoch — i.e. it was invalidated by an account deletion or a
// logout-everywhere. Callers must treat this exactly like a revoked token.
var ErrTokenEpochStale = errors.New("token revoked: superseded by newer token epoch")

// ErrAccountDeleted indicates the user owning the token has been soft-deleted.
var ErrAccountDeleted = errors.New("token revoked: account deleted")

// epochRedisKey returns the Redis key mirroring a user's token epoch.
func epochRedisKey(userID string) string { return epochKeyPrefix + userID }

// LoadUserTokenEpoch returns the user's current token epoch, reading the durable
// users.token_epoch column and refreshing the Redis mirror. It is called on the
// login/issuance path (which already touches the DB) so freshly issued tokens
// always carry the authoritative epoch.
//
// If the DB read fails it returns the error so callers fail closed rather than
// mint a token with a wrong (stale) epoch.
func LoadUserTokenEpoch(ctx context.Context, db database.QueryExecutor, redisClient *redis.Client, userID string) (int64, error) {
	if db == nil {
		// No DB available (unit tests): fall back to the Redis mirror.
		return currentEpochFromRedis(ctx, redisClient, userID), nil
	}

	var epoch int64
	err := db.QueryRow(ctx, `SELECT token_epoch FROM users WHERE id = $1`, userID).Scan(&epoch)
	if err != nil {
		return 0, err
	}

	setEpochMirror(ctx, redisClient, userID, epoch)
	return epoch, nil
}

// currentEpochFromRedis reads the Redis mirror of the user's epoch. A missing
// key (never logged in since the mirror expired, or Redis was flushed) is
// treated as epoch 0 — the same value new users start at — so tokens minted at
// epoch 0 still validate. Any parse/Redis error also degrades to 0 rather than
// spuriously revoking a valid token; the durable DB check on the refresh path
// remains the authoritative backstop.
func currentEpochFromRedis(ctx context.Context, redisClient *redis.Client, userID string) int64 {
	if redisClient == nil {
		return 0
	}
	val, err := redisClient.Get(ctx, epochRedisKey(userID)).Result()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			log.Warn().Err(err).Str("user_id", userID).Msg("F1: failed to read token epoch mirror; treating as epoch 0")
		}
		return 0
	}
	epoch, perr := strconv.ParseInt(val, 10, 64)
	if perr != nil {
		log.Warn().Err(perr).Str("user_id", userID).Str("value", val).Msg("F1: malformed token epoch mirror; treating as epoch 0")
		return 0
	}
	return epoch
}

// setEpochMirror writes the Redis mirror. Best-effort: a failure only weakens
// the hot-path optimisation, never correctness (the DB column is authoritative
// and the refresh path reads it directly).
func setEpochMirror(ctx context.Context, redisClient *redis.Client, userID string, epoch int64) {
	if redisClient == nil {
		return
	}
	if err := redisClient.Set(ctx, epochRedisKey(userID), strconv.FormatInt(epoch, 10), epochRedisTTL).Err(); err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("F1: failed to update token epoch mirror (non-fatal)")
	}
}

// checkTokenEpochRedis rejects a token whose embedded epoch is older than the
// user's current epoch as recorded in the Redis mirror. Used on the hot
// access-token validation path (middleware) to avoid a per-request DB hit.
func checkTokenEpochRedis(ctx context.Context, redisClient *redis.Client, tokenEpoch int64, userID string) error {
	if redisClient == nil {
		return nil
	}
	if tokenEpoch < currentEpochFromRedis(ctx, redisClient, userID) {
		return ErrTokenEpochStale
	}
	return nil
}

// BumpUserTokenEpoch atomically increments the user's durable token epoch and
// refreshes the Redis mirror, instantly invalidating every outstanding token
// for that user. Returns the new epoch. Used by logout-everywhere; account
// deletion performs the equivalent bump inside its own transaction.
func BumpUserTokenEpoch(ctx context.Context, db database.QueryExecutor, redisClient *redis.Client, userID string) (int64, error) {
	if db == nil {
		return 0, errors.New("cannot bump token epoch: no database handle")
	}
	var newEpoch int64
	err := db.QueryRow(ctx,
		`UPDATE users SET token_epoch = token_epoch + 1, updated_at = NOW() WHERE id = $1 RETURNING token_epoch`,
		userID,
	).Scan(&newEpoch)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// User row is gone (hard-deleted); nothing to invalidate durably, and
			// the Redis mirror will expire on its own.
			return 0, nil
		}
		return 0, err
	}
	setEpochMirror(ctx, redisClient, userID, newEpoch)
	return newEpoch, nil
}

// RegisterIssuedTokens records the access and refresh JTIs of a freshly issued
// login token pair in the user_tokens:<id> set. Before F1, login-issuance paths
// (SRP/FIDO2/OIDC) skipped this — only RefreshAccessToken populated the set — so
// bulk per-JTI revocation on logout/deletion missed the original login tokens.
// Registering them here restores the belt-and-suspenders per-JTI revocation
// alongside the epoch mechanism. Best-effort: the epoch check is the primary,
// Redis-flush-durable guarantee.
func RegisterIssuedTokens(ctx context.Context, redisClient *redis.Client, userID, accessToken, refreshToken string) {
	if redisClient == nil {
		return
	}
	jtis := make([]interface{}, 0, 2)
	for _, tok := range []string{accessToken, refreshToken} {
		claims, err := ValidateToken(tok)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("F1: failed to parse freshly issued token for JTI registration")
			continue
		}
		jtis = append(jtis, claims.JTI)
	}
	if len(jtis) == 0 {
		return
	}
	if err := redisClient.SAdd(ctx, "user_tokens:"+userID, jtis...).Err(); err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("F1: failed to register issued token JTIs (non-fatal)")
	}
}

// userEpochAndDeleted reads the durable epoch AND deleted_at for a user in one
// query. Used by the refresh path to enforce, without depending on Redis:
//   - a soft-deleted account cannot mint new sessions (GDPR right-to-delete);
//   - a token issued before an epoch bump cannot mint new sessions.
func userEpochAndDeleted(ctx context.Context, db database.QueryExecutor, userID string) (epoch int64, deleted bool, err error) {
	var deletedAt *time.Time
	err = db.QueryRow(ctx,
		`SELECT token_epoch, deleted_at FROM users WHERE id = $1`, userID,
	).Scan(&epoch, &deletedAt)
	if err != nil {
		return 0, false, err
	}
	return epoch, deletedAt != nil, nil
}
