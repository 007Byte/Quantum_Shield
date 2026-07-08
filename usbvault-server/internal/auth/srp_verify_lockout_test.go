package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// TestSRPVerify_LockedAccountRejected is the F2 regression guard: an account
// that is locked out (via failed verify attempts) must be rejected at
// /srp/verify with 429, even when the caller presents a valid, pre-banked SRP
// session. Before the fix, HandleSRPVerify never called CheckLockout, so an
// attacker could bank many /srp/init sessions before any failure was recorded
// and then submit proof guesses to /srp/verify unthrottled by the lock.
func TestSRPVerify_LockedAccountRejected(t *testing.T) {
	mr := miniredis.NewMiniRedis()
	if err := mr.Start(); err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer redisClient.Close()

	svc := NewAccountLockoutService(redisClient)
	ctx := context.Background()
	emailHash := "test-email-hash"

	// Lock the account (10 failed attempts) under the client IP the request below
	// presents via RemoteAddr — lockout is keyed on (emailHash, clientIP).
	for i := 0; i < 10; i++ {
		if _, err := svc.RecordFailedAttempt(ctx, emailHash, testClientIP); err != nil {
			t.Fatalf("RecordFailedAttempt %d: %v", i+1, err)
		}
	}
	if status, err := svc.CheckLockout(ctx, emailHash, testClientIP); err != nil || !status.Locked {
		t.Fatalf("precondition: account should be locked (locked=%v err=%v)", status.Locked, err)
	}

	// Pre-bank a valid SRP session for the same account, as an attacker would
	// before triggering the lock.
	const sessionID = "banked-session-id"
	state := srpServerState{
		B:                "12345",
		BPrivate:         "67890",
		Salt:             []byte("saltsaltsaltsalt"),
		SRPVerifier:      []byte("verifierverifierverifierverifier"),
		EmailHash:        emailHash,
		UserID:           "user-1",
		CreatedAt:        time.Now(),
		VerifierHashAlgo: "argon2id",
	}
	stateJSON, _ := json.Marshal(state)
	redisClient.Set(ctx, "srp:"+sessionID, stateJSON, time.Minute)

	// pool is nil: the lockout check must return 429 before any DB access.
	handler := HandleSRPVerify(nil, redisClient, svc, nil)
	body, _ := json.Marshal(map[string]string{"session_id": sessionID, "A": "12345"})
	req := httptest.NewRequest(http.MethodPost, "/auth/srp/verify", bytes.NewReader(body))
	req.RemoteAddr = testClientIP + ":5555"
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("verify on locked account: status = %d, want %d (429)", w.Code, http.StatusTooManyRequests)
	}
	if retryAfter := w.Header().Get("Retry-After"); retryAfter == "" {
		t.Errorf("locked verify response missing Retry-After header")
	}
}
