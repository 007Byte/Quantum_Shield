package ctxkeys

import (
	"context"
	"testing"
)

func TestKeysAreDistinct(t *testing.T) {
	keys := []Key{UserID, DeviceID, TokenType, JTI, UserTier, RequestID}
	seen := make(map[Key]bool)

	for _, k := range keys {
		if seen[k] {
			t.Errorf("duplicate context key: %q", k)
		}
		seen[k] = true
	}
}

func TestContextValueStorage(t *testing.T) {
	ctx := context.Background()

	// Store a value under UserID
	ctx = context.WithValue(ctx, UserID, "user-123")

	// Retrieve it
	val := ctx.Value(UserID)
	if val == nil {
		t.Fatal("expected non-nil value for UserID")
	}
	if val.(string) != "user-123" {
		t.Errorf("expected %q, got %q", "user-123", val)
	}
}

func TestContextKeyTypeSafety(t *testing.T) {
	ctx := context.Background()

	// Store under typed key
	ctx = context.WithValue(ctx, UserID, "user-123")

	// A raw string key with the same underlying value should NOT retrieve it
	rawKey := "user_id"
	val := ctx.Value(rawKey)
	if val != nil {
		t.Error("raw string key should not collide with typed Key — type safety violated")
	}
}

func TestAllKeysNonEmpty(t *testing.T) {
	keys := map[string]Key{
		"UserID":    UserID,
		"DeviceID":  DeviceID,
		"TokenType": TokenType,
		"JTI":       JTI,
		"UserTier":  UserTier,
		"RequestID": RequestID,
	}

	for name, k := range keys {
		if k == "" {
			t.Errorf("context key %s has empty value", name)
		}
	}
}

func TestMultipleKeysInSameContext(t *testing.T) {
	ctx := context.Background()
	ctx = context.WithValue(ctx, UserID, "user-1")
	ctx = context.WithValue(ctx, DeviceID, "device-1")
	ctx = context.WithValue(ctx, RequestID, "req-abc")

	if ctx.Value(UserID).(string) != "user-1" {
		t.Error("UserID value corrupted after adding other keys")
	}
	if ctx.Value(DeviceID).(string) != "device-1" {
		t.Error("DeviceID value corrupted")
	}
	if ctx.Value(RequestID).(string) != "req-abc" {
		t.Error("RequestID value corrupted")
	}
}
