package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
	"github.com/usbvault/usbvault-server/internal/database"
)

// ---------------------------------------------------------------------------
// F1 session-revocation gap: per-user token epoch tests.
//
// These prove: (1) the epoch is embedded in both access and refresh tokens;
// (2) an account-deletion / stale-epoch refresh token is rejected on the
// durable DB path even without Redis; (3) native logout bumps the epoch so an
// outstanding (untracked) token is rejected; (4) a current-epoch login and
// refresh still work normally.
// ---------------------------------------------------------------------------

// scanRow is a minimal pgx.Row that scans preconfigured column values into the
// destination pointers. It supports exactly the destination types used by the
// epoch queries (*int64 and **time.Time).
type scanRow struct {
	vals []interface{}
	err  error
}

func (r scanRow) Scan(dest ...interface{}) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) != len(r.vals) {
		return fmt.Errorf("scanRow: got %d dest, have %d vals", len(dest), len(r.vals))
	}
	for i := range dest {
		switch d := dest[i].(type) {
		case *int64:
			*d = r.vals[i].(int64)
		case **time.Time:
			*d = r.vals[i].(*time.Time)
		default:
			return fmt.Errorf("scanRow: unsupported dest type %T", dest[i])
		}
	}
	return nil
}

// epochPool returns a mock DB whose row yields (epoch, deletedAt) — matching the
// two-column SELECT used by RefreshAccessToken's durable check.
func epochPool(epoch int64, deletedAt *time.Time) *database.MockDB {
	return &database.MockDB{
		QueryRowFunc: func(_ context.Context, _ string, _ ...interface{}) pgx.Row {
			return scanRow{vals: []interface{}{epoch, deletedAt}}
		},
	}
}

// bumpPool returns a mock DB whose row yields a single epoch — matching the
// RETURNING token_epoch of BumpUserTokenEpoch. onCall (optional) fires per query.
func bumpPool(newEpoch int64, onCall func()) *database.MockDB {
	return &database.MockDB{
		QueryRowFunc: func(_ context.Context, _ string, _ ...interface{}) pgx.Row {
			if onCall != nil {
				onCall()
			}
			return scanRow{vals: []interface{}{newEpoch}}
		},
	}
}

func TestGenerateTokenPairWithEpoch_EmbedsEpochInBothTokens(t *testing.T) {
	access, refresh, err := GenerateTokenPairWithEpoch("user-e", "web", "", "", 7)
	if err != nil {
		t.Fatalf("GenerateTokenPairWithEpoch failed: %v", err)
	}

	ac, err := ValidateToken(access)
	if err != nil {
		t.Fatalf("validate access: %v", err)
	}
	if ac.TokenEpoch != 7 {
		t.Errorf("access token epoch = %d, want 7", ac.TokenEpoch)
	}

	rc, err := ValidateToken(refresh)
	if err != nil {
		t.Fatalf("validate refresh: %v", err)
	}
	if rc.TokenEpoch != 7 {
		t.Errorf("refresh token epoch = %d, want 7", rc.TokenEpoch)
	}
}

// TestRefreshAccessToken_RejectsDeletedAccount proves the GDPR right-to-delete
// fix: a soft-deleted account cannot mint new sessions from an otherwise-valid
// refresh token. This path is durable (DB-backed) and does not depend on Redis.
func TestRefreshAccessToken_RejectsDeletedAccount(t *testing.T) {
	_, refresh, err := GenerateTokenPairWithEpoch("user-del", "web", "", "", 0)
	if err != nil {
		t.Fatalf("issue refresh: %v", err)
	}

	deletedAt := time.Now()
	pool := epochPool(0, &deletedAt)

	_, _, err = RefreshAccessToken(pool, nil, refresh)
	if !errors.Is(err, ErrAccountDeleted) {
		t.Fatalf("expected ErrAccountDeleted, got %v", err)
	}
}

// TestRefreshAccessToken_RejectsStaleEpoch proves that a refresh token issued
// before an epoch bump (e.g. logout-everywhere) can no longer mint sessions,
// enforced against the durable DB epoch even with no Redis client.
func TestRefreshAccessToken_RejectsStaleEpoch(t *testing.T) {
	_, refresh, err := GenerateTokenPairWithEpoch("user-stale", "web", "", "", 1)
	if err != nil {
		t.Fatalf("issue refresh: %v", err)
	}

	// Current durable epoch is 3; the token carries epoch 1.
	pool := epochPool(3, nil)

	_, _, err = RefreshAccessToken(pool, nil, refresh)
	if !errors.Is(err, ErrTokenEpochStale) {
		t.Fatalf("expected ErrTokenEpochStale, got %v", err)
	}
}

// TestRefreshAccessToken_CurrentEpochSucceeds proves normal refresh still works
// when the token's epoch matches the user's current epoch, and that the rotated
// tokens carry that same epoch. Requires Redis (atomic rotation script).
func TestRefreshAccessToken_CurrentEpochSucceeds(t *testing.T) {
	rc := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	if err := rc.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}
	ctx := context.Background()

	userID := "user-current"
	_, refresh, err := GenerateTokenPairWithEpoch(userID, "web", "", "", 2)
	if err != nil {
		t.Fatalf("issue refresh: %v", err)
	}
	oldClaims, _ := ValidateToken(refresh)
	pool := epochPool(2, nil) // db epoch matches token epoch

	newAccess, newRefresh, err := RefreshAccessToken(pool, rc, refresh)
	if err != nil {
		t.Fatalf("refresh should succeed: %v", err)
	}

	na, err := ValidateToken(newAccess)
	if err != nil {
		t.Fatalf("validate new access: %v", err)
	}
	if na.TokenEpoch != 2 {
		t.Errorf("rotated access epoch = %d, want 2 (preserved)", na.TokenEpoch)
	}
	nr, _ := ValidateToken(newRefresh)
	if nr.TokenEpoch != 2 {
		t.Errorf("rotated refresh epoch = %d, want 2 (preserved)", nr.TokenEpoch)
	}

	// cleanup
	rc.Del(ctx, "revoked:"+oldClaims.JTI)
	rc.Del(ctx, "user_tokens:"+userID)
	rc.Del(ctx, epochRedisKey(userID))
}

// TestValidateTokenWithRevocation_RejectsStaleEpoch proves the hot access-token
// path rejects a superseded token via the Redis epoch mirror. Requires Redis.
func TestValidateTokenWithRevocation_RejectsStaleEpoch(t *testing.T) {
	rc := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	if err := rc.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}
	ctx := context.Background()
	userID := "user-hotpath"

	// Bump the mirror to epoch 5 (as a deletion/logout would).
	setEpochMirror(ctx, rc, userID, 5)
	defer rc.Del(ctx, epochRedisKey(userID))

	// A token issued at epoch 4 (before the bump) must be rejected...
	staleAccess, _, err := GenerateTokenPairWithEpoch(userID, "web", "", "", 4)
	if err != nil {
		t.Fatalf("issue stale: %v", err)
	}
	if _, verr := ValidateTokenWithRevocation(rc, staleAccess); !errors.Is(verr, ErrTokenEpochStale) {
		t.Fatalf("stale token should be rejected, got %v", verr)
	}

	// ...while a token at the current epoch 5 is accepted.
	freshAccess, _, err := GenerateTokenPairWithEpoch(userID, "web", "", "", 5)
	if err != nil {
		t.Fatalf("issue fresh: %v", err)
	}
	if _, verr := ValidateTokenWithRevocation(rc, freshAccess); verr != nil {
		t.Fatalf("current-epoch token should validate, got %v", verr)
	}
}

// TestHandleLogout_BumpsEpochAndInvalidatesUntrackedToken proves the native
// logout / logout-everywhere path invalidates an outstanding refresh token that
// was never registered in the user_tokens set (the original reported bug for
// native keychain tokens). Requires Redis; the DB bump is mocked.
func TestHandleLogout_BumpsEpochAndInvalidatesUntrackedToken(t *testing.T) {
	rc := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	if err := rc.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}
	ctx := context.Background()
	userID := "user-logout"
	defer rc.Del(ctx, epochRedisKey(userID))
	defer rc.Del(ctx, "user_tokens:"+userID)

	// An access token (epoch 0) authenticates the logout request; a separate,
	// UNTRACKED refresh token (also epoch 0) represents the native keychain.
	access, _, _ := GenerateTokenPairWithEpoch(userID, "web", "", "", 0)
	_, keychainRefresh, _ := GenerateTokenPairWithEpoch(userID, "native", "", "", 0)

	// Mock pool that bumps epoch 0 -> 1 on the RETURNING update.
	var bumped bool
	pool := bumpPool(1, func() { bumped = true })

	handler := HandleLogout(pool, rc, &mockAuditService{})
	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.Header.Set("Authorization", "Bearer "+access)
	// Inject user_id into context as AuthMiddleware would.
	req = req.WithContext(context.WithValue(req.Context(), ctxkeys.UserID, userID))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("logout status = %d, want 200", rec.Code)
	}
	if !bumped {
		t.Fatal("logout did not bump the token epoch")
	}

	// The untracked keychain refresh token must now be rejected by the hot path.
	if _, verr := ValidateTokenWithRevocation(rc, keychainRefresh); !errors.Is(verr, ErrTokenEpochStale) {
		t.Fatalf("keychain refresh token should be invalidated by logout epoch bump, got %v", verr)
	}
}

// TestBumpUserTokenEpoch_UpdatesRedisMirror proves the durable bump also writes
// the Redis mirror so the hot path sees it immediately. Requires Redis.
func TestBumpUserTokenEpoch_UpdatesRedisMirror(t *testing.T) {
	rc := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	if err := rc.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}
	ctx := context.Background()
	userID := "user-bump"
	defer rc.Del(ctx, epochRedisKey(userID))

	pool := bumpPool(9, nil) // RETURNING token_epoch = 9

	newEpoch, err := BumpUserTokenEpoch(ctx, pool, rc, userID)
	if err != nil {
		t.Fatalf("bump failed: %v", err)
	}
	if newEpoch != 9 {
		t.Errorf("new epoch = %d, want 9", newEpoch)
	}
	if got := currentEpochFromRedis(ctx, rc, userID); got != 9 {
		t.Errorf("redis mirror = %d, want 9", got)
	}
}
