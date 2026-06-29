package auth

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

// testClientIP is the fixed client IP threaded through every lockout call after
// the per-IP keying fix (lockout keys are now lockout:{emailHash}:{clientIP}).
const testClientIP = "192.0.2.10"

func TestLockout_NoAttempts(t *testing.T) {
	// Fresh user should have no lockout
	mr := miniredis.NewMiniRedis()
	if err := mr.Start(); err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer redisClient.Close()

	svc := NewAccountLockoutService(redisClient)

	status, err := svc.CheckLockout(context.Background(), "test-email-hash", testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout failed: %v", err)
	}

	if status.Locked {
		t.Error("fresh user should not be locked")
	}
	if status.Attempts != 0 {
		t.Errorf("fresh user should have 0 attempts, got %d", status.Attempts)
	}
	if status.Delay != 0 {
		t.Errorf("fresh user should have 0 delay, got %v", status.Delay)
	}
}

func TestLockout_ProgressiveDelay(t *testing.T) {
	mr := miniredis.NewMiniRedis()
	if err := mr.Start(); err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer redisClient.Close()

	svc := NewAccountLockoutService(redisClient)

	tests := []struct {
		attempts int
		expected time.Duration
	}{
		{1, 1 * time.Second},
		{2, 2 * time.Second},
		{3, 4 * time.Second},
		{4, 8 * time.Second},
		{5, 16 * time.Second},
		{6, 32 * time.Second},
		{7, 32 * time.Second}, // Capped at 32s
		{10, 32 * time.Second},
	}

	for _, tt := range tests {
		delay := svc.GetProgressiveDelay(tt.attempts)
		if delay != tt.expected {
			t.Errorf("GetProgressiveDelay(%d) = %v, want %v", tt.attempts, delay, tt.expected)
		}
	}
}

func TestLockout_AccountLocked(t *testing.T) {
	// After 10 failed attempts, account should be locked
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

	// Record 9 failed attempts
	for i := 0; i < 9; i++ {
		status, err := svc.RecordFailedAttempt(ctx, emailHash, testClientIP)
		if err != nil {
			t.Fatalf("RecordFailedAttempt %d failed: %v", i+1, err)
		}
		if status.Locked {
			t.Fatalf("account should not be locked at attempt %d", i+1)
		}
	}

	// 10th attempt should lock the account
	status, err := svc.RecordFailedAttempt(ctx, emailHash, testClientIP)
	if err != nil {
		t.Fatalf("RecordFailedAttempt 10 failed: %v", err)
	}

	if !status.Locked {
		t.Error("account should be locked after 10 attempts")
	}
	if status.Attempts != 10 {
		t.Errorf("expected 10 attempts, got %d", status.Attempts)
	}

	// Check that subsequent CheckLockout call also reports locked status
	checkStatus, err := svc.CheckLockout(ctx, emailHash, testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout failed: %v", err)
	}
	if !checkStatus.Locked {
		t.Error("CheckLockout should report account as locked")
	}
}

func TestLockout_LockExpiry(t *testing.T) {
	// Lock should expire after 15 minutes
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

	// Record 10 failed attempts to lock the account
	for i := 0; i < 10; i++ {
		_, err := svc.RecordFailedAttempt(ctx, emailHash, testClientIP)
		if err != nil {
			t.Fatalf("RecordFailedAttempt failed: %v", err)
		}
	}

	// Verify account is locked
	status, err := svc.CheckLockout(ctx, emailHash, testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout failed: %v", err)
	}
	if !status.Locked {
		t.Fatal("account should be locked")
	}

	// Simulate time passing by setting LockedUntil to a past time in Redis
	// (FastForward only affects Redis TTL, not time.Now() used by CheckLockout)
	pastLockTime := time.Now().Add(-1 * time.Minute).Unix()
	lockData := fmt.Sprintf(`{"attempts":10,"locked_until":%d}`, pastLockTime)
	redisClient.Set(ctx, "lockout:"+emailHash+":"+testClientIP, lockData, 0)

	// After lock expires, account should no longer be locked
	expiredStatus, err := svc.CheckLockout(ctx, emailHash, testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout failed after expiry: %v", err)
	}

	if expiredStatus.Locked {
		t.Error("account should not be locked after lock expiry")
	}
	// Attempts should still be preserved
	if expiredStatus.Attempts != 10 {
		t.Errorf("attempts should be preserved after lock expiry, got %d", expiredStatus.Attempts)
	}
}

func TestLockout_ResetOnSuccess(t *testing.T) {
	// Counter should reset on successful login
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

	// Record 3 failed attempts
	for i := 0; i < 3; i++ {
		_, err := svc.RecordFailedAttempt(ctx, emailHash, testClientIP)
		if err != nil {
			t.Fatalf("RecordFailedAttempt failed: %v", err)
		}
	}

	status, err := svc.CheckLockout(ctx, emailHash, testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout failed: %v", err)
	}
	if status.Attempts != 3 {
		t.Errorf("expected 3 attempts before reset, got %d", status.Attempts)
	}

	// Reset on successful login
	if err := svc.ResetAttempts(ctx, emailHash, testClientIP); err != nil {
		t.Fatalf("ResetAttempts failed: %v", err)
	}

	// Check that attempts are reset
	resetStatus, err := svc.CheckLockout(ctx, emailHash, testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout failed after reset: %v", err)
	}

	if resetStatus.Attempts != 0 {
		t.Errorf("expected 0 attempts after reset, got %d", resetStatus.Attempts)
	}
	if resetStatus.Locked {
		t.Error("account should not be locked after reset")
	}
}

func TestLockout_AtomicIncrement(t *testing.T) {
	// Concurrent attempts should be handled atomically
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

	// Launch 5 concurrent failed attempts
	var wg sync.WaitGroup
	attemptCount := 5
	wg.Add(attemptCount)

	for i := 0; i < attemptCount; i++ {
		go func() {
			defer wg.Done()
			_, err := svc.RecordFailedAttempt(ctx, emailHash, testClientIP)
			if err != nil {
				t.Errorf("RecordFailedAttempt failed: %v", err)
			}
		}()
	}

	wg.Wait()

	// Verify that all attempts were counted correctly
	status, err := svc.CheckLockout(ctx, emailHash, testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout failed: %v", err)
	}

	if status.Attempts != attemptCount {
		t.Errorf("expected %d attempts after concurrent operations, got %d", attemptCount, status.Attempts)
	}
}

func TestLockout_MultipleUsers(t *testing.T) {
	// Different users should have independent lockout states
	mr := miniredis.NewMiniRedis()
	if err := mr.Start(); err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer redisClient.Close()

	svc := NewAccountLockoutService(redisClient)
	ctx := context.Background()

	user1 := "user1-hash"
	user2 := "user2-hash"

	// Record 5 attempts for user1
	for i := 0; i < 5; i++ {
		_, err := svc.RecordFailedAttempt(ctx, user1, testClientIP)
		if err != nil {
			t.Fatalf("RecordFailedAttempt for user1 failed: %v", err)
		}
	}

	// Record 3 attempts for user2
	for i := 0; i < 3; i++ {
		_, err := svc.RecordFailedAttempt(ctx, user2, testClientIP)
		if err != nil {
			t.Fatalf("RecordFailedAttempt for user2 failed: %v", err)
		}
	}

	// Check user1
	status1, err := svc.CheckLockout(ctx, user1, testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout for user1 failed: %v", err)
	}
	if status1.Attempts != 5 {
		t.Errorf("user1 should have 5 attempts, got %d", status1.Attempts)
	}

	// Check user2
	status2, err := svc.CheckLockout(ctx, user2, testClientIP)
	if err != nil {
		t.Fatalf("CheckLockout for user2 failed: %v", err)
	}
	if status2.Attempts != 3 {
		t.Errorf("user2 should have 3 attempts, got %d", status2.Attempts)
	}
}

func TestLockout_DelayCalculation(t *testing.T) {
	// Verify progressive delay is correctly reported
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

	// Test delays after each attempt
	expectedDelays := []time.Duration{
		1 * time.Second,
		2 * time.Second,
		4 * time.Second,
		8 * time.Second,
	}

	for i, expectedDelay := range expectedDelays {
		_, err := svc.RecordFailedAttempt(ctx, emailHash, testClientIP)
		if err != nil {
			t.Fatalf("RecordFailedAttempt %d failed: %v", i+1, err)
		}

		status, err := svc.CheckLockout(ctx, emailHash, testClientIP)
		if err != nil {
			t.Fatalf("CheckLockout failed: %v", err)
		}

		if status.Delay != expectedDelay {
			t.Errorf("attempt %d: expected delay %v, got %v", i+1, expectedDelay, status.Delay)
		}
	}
}

// TestLockout_PerIPIsolation proves the HIGH account-lockout DoS fix: lockout
// state is keyed on (emailHash + clientIP), so 10 failed attempts from one IP
// lock only that (email, IP) bucket and DO NOT lock the same email from a
// different IP. Without the fix, any off-path attacker who knows the victim's
// email could lock the victim out from every IP.
func TestLockout_PerIPIsolation(t *testing.T) {
	mr := miniredis.NewMiniRedis()
	if err := mr.Start(); err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	defer mr.Close()

	redisClient := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer redisClient.Close()

	svc := NewAccountLockoutService(redisClient)
	ctx := context.Background()
	emailHash := "victim-email-hash"
	const ipA = "198.51.100.1" // attacker IP
	const ipB = "203.0.113.7"  // victim IP

	// Attacker fires 10 failed attempts from ipA — locks (emailHash, ipA).
	for i := 0; i < 10; i++ {
		if _, err := svc.RecordFailedAttempt(ctx, emailHash, ipA); err != nil {
			t.Fatalf("RecordFailedAttempt from ipA failed: %v", err)
		}
	}

	statusA, err := svc.CheckLockout(ctx, emailHash, ipA)
	if err != nil {
		t.Fatalf("CheckLockout for ipA failed: %v", err)
	}
	if !statusA.Locked {
		t.Error("(emailHash, ipA) should be locked after 10 failed attempts")
	}

	// The SAME email from a DIFFERENT IP must NOT be locked — the DoS is contained.
	statusB, err := svc.CheckLockout(ctx, emailHash, ipB)
	if err != nil {
		t.Fatalf("CheckLockout for ipB failed: %v", err)
	}
	if statusB.Locked {
		t.Error("(emailHash, ipB) must NOT be locked — off-path attacker on ipA cannot lock the victim's ipB")
	}
	if statusB.Attempts != 0 {
		t.Errorf("(emailHash, ipB) should have 0 attempts, got %d", statusB.Attempts)
	}
}
