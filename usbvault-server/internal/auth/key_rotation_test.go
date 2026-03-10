package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"testing"
	"time"
)

// PH2-FIX: Tests for JWT key rotation service

// TestKeyRotationService_Initialize_CreatesInitialKey tests that a new key is created on first initialization
func TestKeyRotationService_Initialize_CreatesInitialKey(t *testing.T) {
	// Note: This test requires a PostgreSQL database connection
	// In a real test environment, use testcontainers or a test database
	t.Skip("Requires PostgreSQL database - run with integration tests")

	// This is a placeholder test showing the expected behavior
	// pool := setupTestDatabase(t)
	// defer pool.Close()

	// krs := NewKeyRotationService(pool)
	// ctx := context.Background()

	// err := krs.Initialize(ctx)
	// if err != nil {
	// 	t.Fatalf("Initialize failed: %v", err)
	// }

	// if krs.activeKey == nil {
	// 	t.Error("activeKey should not be nil after Initialize")
	// }

	// if krs.GetActiveKID() == "" {
	// 	t.Error("GetActiveKID should return non-empty string")
	// }
}

// TestKeyRotationService_GetActiveKID_ReturnsCurrentKey tests that GetActiveKID returns the active key's KID
func TestKeyRotationService_GetActiveKID_ReturnsCurrentKey(t *testing.T) {
	krs := NewKeyRotationService(nil) // Pool not needed for this test

	// Manually set an active key for testing
	krs.activeKey = &SigningKey{
		KID:    "test-kid-123",
		Status: "active",
	}

	kid := krs.GetActiveKID()
	if kid != "test-kid-123" {
		t.Errorf("GetActiveKID = %q, want %q", kid, "test-kid-123")
	}
}

// TestKeyRotationService_GetActiveKID_EmptyWhenNoKey tests that GetActiveKID returns empty string when no active key
func TestKeyRotationService_GetActiveKID_EmptyWhenNoKey(t *testing.T) {
	krs := NewKeyRotationService(nil)

	kid := krs.GetActiveKID()
	if kid != "" {
		t.Errorf("GetActiveKID should return empty string when no active key, got %q", kid)
	}
}

// TestKeyRotationService_GetVerificationKey_ReturnsPublicKey tests that GetVerificationKey returns the correct public key
func TestKeyRotationService_GetVerificationKey_ReturnsPublicKey(t *testing.T) {
	krs := NewKeyRotationService(nil)

	// Create a test public key
	pub, _, _ := GenerateTestKeyPair()
	pubKey := pub.(ed25519.PublicKey)

	krs.keyCache["test-kid"] = &SigningKey{
		KID:       "test-kid",
		PublicKey: pubKey,
		Status:    "active",
	}

	retrievedKey, err := krs.GetVerificationKey("test-kid")
	if err != nil {
		t.Fatalf("GetVerificationKey failed: %v", err)
	}

	if !retrievedKey.Equal(pubKey) {
		t.Error("GetVerificationKey should return the correct public key")
	}
}

// TestKeyRotationService_GetVerificationKey_RejectsRevokedKey tests that GetVerificationKey rejects revoked keys
func TestKeyRotationService_GetVerificationKey_RejectsRevokedKey(t *testing.T) {
	krs := NewKeyRotationService(nil)

	pub, _, _ := GenerateTestKeyPair()
	pubKey := pub.(ed25519.PublicKey)

	krs.keyCache["revoked-kid"] = &SigningKey{
		KID:       "revoked-kid",
		PublicKey: pubKey,
		Status:    "revoked",
	}

	_, err := krs.GetVerificationKey("revoked-kid")
	if err == nil {
		t.Error("GetVerificationKey should reject revoked keys")
	}
}

// TestKeyRotationService_GetVerificationKey_UnknownKID tests that GetVerificationKey rejects unknown KIDs
func TestKeyRotationService_GetVerificationKey_UnknownKID(t *testing.T) {
	krs := NewKeyRotationService(nil)

	_, err := krs.GetVerificationKey("unknown-kid")
	if err == nil {
		t.Error("GetVerificationKey should reject unknown KIDs")
	}
}

// TestKeyRotationService_GetSigningKey_ReturnsFallbackGlobal tests that GetSigningKey falls back to global key
func TestKeyRotationService_GetSigningKey_ReturnsFallbackGlobal(t *testing.T) {
	krs := NewKeyRotationService(nil)
	// Don't set an active key, should use global

	key := krs.GetSigningKey()
	if key == nil {
		t.Error("GetSigningKey should return global key as fallback")
	}
}

// Helper function to generate test key pairs
func GenerateTestKeyPair() (interface{}, interface{}, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	return pub, priv, nil
}

// TestKeyRotationService_RevokeKey_UpdatesStatus tests that RevokeKey updates key status
func TestKeyRotationService_RevokeKey_UpdatesStatus(t *testing.T) {
	t.Skip("Requires PostgreSQL database - run with integration tests")

	// pool := setupTestDatabase(t)
	// defer pool.Close()

	// krs := NewKeyRotationService(pool)
	// ctx := context.Background()

	// krs.keyCache["test-kid"] = &SigningKey{
	// 	KID:    "test-kid",
	// 	Status: "active",
	// }

	// err := krs.RevokeKey(ctx, "test-kid")
	// if err != nil {
	// 	t.Fatalf("RevokeKey failed: %v", err)
	// }

	// if krs.keyCache["test-kid"].Status != "revoked" {
	// 	t.Error("RevokeKey should update status to revoked")
	// }
}

// TestKeyRotationService_CleanupExpiredKeys tests that old rotated keys are cleaned up
func TestKeyRotationService_CleanupExpiredKeys(t *testing.T) {
	t.Skip("Requires PostgreSQL database - run with integration tests")

	// pool := setupTestDatabase(t)
	// defer pool.Close()

	// krs := NewKeyRotationService(pool)
	// ctx := context.Background()

	// // Should not error even if no keys exist
	// err := krs.CleanupExpiredKeys(ctx)
	// if err != nil {
	// 	t.Fatalf("CleanupExpiredKeys failed: %v", err)
	// }
}

// TestKeyRotationService_StartAutoRotation tests that auto-rotation goroutine starts
func TestKeyRotationService_StartAutoRotation(t *testing.T) {
	krs := NewKeyRotationService(nil)

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	// Should not panic
	krs.StartAutoRotation(ctx, 10*time.Millisecond)

	// Give goroutine time to start
	time.Sleep(50 * time.Millisecond)
}

// TestSetKeyRotationService tests that the global service can be set
func TestSetKeyRotationService(t *testing.T) {
	originalSvc := keyRotationSvc
	defer func() { keyRotationSvc = originalSvc }()

	krs := NewKeyRotationService(nil)
	SetKeyRotationService(krs)

	if keyRotationSvc != krs {
		t.Error("SetKeyRotationService should update the global keyRotationSvc")
	}
}
