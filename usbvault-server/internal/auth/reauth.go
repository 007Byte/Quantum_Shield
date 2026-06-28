package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// H-5 — step-up before enrolling a new credential.
//
// Adding a NEW passkey/device is a persistence-granting, sensitive operation: a
// bearer access token alone must NOT be enough, or a stolen/replayed token could
// silently enroll an attacker-controlled authenticator. We therefore require a FRESH
// strong authentication — a successful SRP verify OR FIDO2 assertion — within a short
// window before enrollment. (Decision: ANY strong auth, not strictly SRP, so that
// passkey-login users are not locked out of adding a second passkey.)
//
// The marker is a short-TTL Redis key set on every successful SRP/FIDO2 verify and
// checked at enrollment. First-credential enrollment (a user with zero existing
// authenticators) is exempt — there is no prior factor to step up with yet, and the
// account is still gated by its primary auth.

const recentReauthTTL = 5 * time.Minute

func recentReauthKey(userID string) string { return "reauth:" + userID }

// markRecentReauth records that the user just completed a strong authentication.
// Best-effort: a nil client / empty user is a no-op, and the caller treats a Redis
// error as non-fatal (login must not fail because the step-up marker could not be set).
func markRecentReauth(ctx context.Context, redisClient *redis.Client, userID string) error {
	if redisClient == nil || userID == "" {
		return nil
	}
	return redisClient.Set(ctx, recentReauthKey(userID), "1", recentReauthTTL).Err()
}

// hasRecentReauth reports whether the user strong-authenticated within the window.
func hasRecentReauth(ctx context.Context, redisClient *redis.Client, userID string) (bool, error) {
	if redisClient == nil {
		return false, nil
	}
	n, err := redisClient.Exists(ctx, recentReauthKey(userID)).Result()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// writeStepUpRequired tells the client it must re-authenticate (fresh password or
// passkey) before the sensitive operation. The session token alone is insufficient.
func writeStepUpRequired(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"code":    "STEP_UP_REQUIRED",
		"message": "re-authenticate (password or passkey) before adding a new credential",
	})
}
