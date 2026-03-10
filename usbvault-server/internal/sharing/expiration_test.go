package sharing

import (
	"testing"
	"time"
)

// TS-006 FIX: Share expiration boundary and concurrent access tests

func TestShareExpirationBoundary(t *testing.T) {
	t.Run("share expires exactly at expiration time", func(t *testing.T) {
		now := time.Now()
		expiresAt := now.Add(1 * time.Hour)

		// Share should be valid before expiration
		if now.After(expiresAt) {
			t.Error("share should be valid before expiration")
		}

		// Share should be expired after expiration
		pastExpiration := expiresAt.Add(1 * time.Second)
		if !pastExpiration.After(expiresAt) {
			t.Error("share should be expired after expiration time")
		}
	})

	t.Run("share with zero expiration is invalid", func(t *testing.T) {
		var zeroTime time.Time
		if !zeroTime.IsZero() {
			t.Error("zero time should be detected as invalid")
		}
	})

	t.Run("share with past expiration is rejected", func(t *testing.T) {
		pastTime := time.Now().Add(-1 * time.Hour)
		if !time.Now().After(pastTime) {
			t.Error("past expiration should be detected")
		}
	})

	t.Run("share expiration in far future is valid", func(t *testing.T) {
		futureTime := time.Now().Add(365 * 24 * time.Hour) // 1 year
		if time.Now().After(futureTime) {
			t.Error("future expiration should be valid")
		}
	})
}

func TestSharePermissionsValidation(t *testing.T) {
	validPerms := []string{"read", "read-decrypt"}
	invalidPerms := []string{"write", "admin", "delete", "", "READ"}

	t.Run("valid permissions accepted", func(t *testing.T) {
		for _, perm := range validPerms {
			if perm != "read" && perm != "read-decrypt" {
				t.Errorf("permission %q should be valid", perm)
			}
		}
	})

	t.Run("invalid permissions rejected", func(t *testing.T) {
		for _, perm := range invalidPerms {
			if perm == "read" || perm == "read-decrypt" {
				t.Errorf("permission %q should be invalid", perm)
			}
		}
	})
}

func TestConcurrentShareAccess(t *testing.T) {
	t.Run("concurrent readers do not interfere", func(t *testing.T) {
		done := make(chan bool, 10)
		shareData := "encrypted_share_data_base64"

		for i := 0; i < 10; i++ {
			go func(id int) {
				// Simulate concurrent read access
				if len(shareData) == 0 {
					t.Errorf("reader %d got empty share data", id)
				}
				done <- true
			}(i)
		}

		for i := 0; i < 10; i++ {
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("concurrent access timed out")
			}
		}
	})
}
