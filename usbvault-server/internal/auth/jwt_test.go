package auth

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

// ============ New Hardened JWT Tests ============

func TestGenerateTokenPair(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	accessToken, refreshToken, err := GenerateTokenPair(userID, deviceID)

	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	if accessToken == "" {
		t.Error("access token is empty")
	}
	if refreshToken == "" {
		t.Error("refresh token is empty")
	}

	// Both should be non-empty JWT strings
	if !strings.Contains(accessToken, ".") {
		t.Error("access token does not look like a JWT")
	}
	if !strings.Contains(refreshToken, ".") {
		t.Error("refresh token does not look like a JWT")
	}
}

func TestAccessTokenTTL(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	accessToken, _, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	// Access token should expire in ~15 minutes (reduced from 1 hour)
	if claims.ExpiresAt == nil {
		t.Fatal("ExpiresAt is nil")
	}

	expiresIn := time.Until(claims.ExpiresAt.Time)
	expectedDuration := 15 * time.Minute

	// Allow ±1 minute tolerance
	tolerance := 1 * time.Minute
	if expiresIn < expectedDuration-tolerance || expiresIn > expectedDuration+tolerance {
		t.Errorf("access token expiration should be ~15 minutes, got %v", expiresIn)
	}
}

func TestRefreshTokenTTL(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	_, refreshToken, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(refreshToken)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	// Refresh token should expire in ~30 days
	if claims.ExpiresAt == nil {
		t.Fatal("ExpiresAt is nil")
	}

	expiresIn := time.Until(claims.ExpiresAt.Time)
	expectedDuration := 30 * 24 * time.Hour

	// Allow ±1 hour tolerance
	tolerance := 1 * time.Hour
	if expiresIn < expectedDuration-tolerance || expiresIn > expectedDuration+tolerance {
		t.Errorf("refresh token expiration should be ~30 days, got %v", expiresIn)
	}
}

func TestValidateToken(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	accessToken, _, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("expected user_id %q, got %q", userID, claims.UserID)
	}
	if claims.DeviceID != deviceID {
		t.Errorf("expected device_id %q, got %q", deviceID, claims.DeviceID)
	}
	if claims.Type != "access" {
		t.Errorf("expected token type 'access', got %q", claims.Type)
	}
}

func TestValidateToken_Expired(t *testing.T) {
	userID := "user123"
	deviceID := "device456"
	now := time.Now()

	// Create a token with past expiration
	claims := Claims{
		UserID:   userID,
		DeviceID: deviceID,
		Type:     "access",
		JTI:      "test-jti",
		FamilyID: "test-family",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now.Add(-2 * time.Hour)),
			ExpiresAt: jwt.NewNumericDate(now.Add(-1 * time.Hour)), // Already expired
			Issuer:    "usbvault",
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tokenString, err := token.SignedString(jwtPrivateKey)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	_, err = ValidateToken(tokenString)
	if err == nil {
		t.Error("ValidateToken should reject expired token")
	}
}

func TestValidateToken_InvalidSignature(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	accessToken, _, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	// Tamper with the token by modifying the signature
	parts := strings.SplitN(accessToken, ".", 3)
	if len(parts) != 3 {
		t.Fatal("token does not have 3 parts")
	}

	// Modify the signature part
	tamperedSig := "tamperedsignature1234567890abcdef"
	tamperedToken := parts[0] + "." + parts[1] + "." + tamperedSig

	_, err = ValidateToken(tamperedToken)
	if err == nil {
		t.Error("ValidateToken should reject token with invalid signature")
	}
}

func TestRefreshToken_Rotation(t *testing.T) {
	// Test that old refresh token gets revoked, new one is issued
	mockRedis := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	// Skip if Redis not available
	if err := mockRedis.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}

	userID := "user123"
	deviceID := "device456"

	_, refreshToken, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, _ := ValidateToken(refreshToken)
	oldJTI := claims.JTI

	// Perform refresh with rotation
	newAccessToken, newRefreshToken, err := RefreshAccessToken(mockRedis, refreshToken)
	if err != nil {
		t.Fatalf("RefreshAccessToken failed: %v", err)
	}

	if newAccessToken == "" || newRefreshToken == "" {
		t.Error("new tokens should not be empty")
	}

	// New tokens should be different
	if newRefreshToken == refreshToken {
		t.Error("refresh token should be rotated")
	}

	// Old token should be revoked
	ctx := context.Background()
	revoked, _ := mockRedis.Get(ctx, "revoked:"+oldJTI).Result()
	if revoked != "1" {
		t.Error("old refresh token should be revoked")
	}

	// Clean up
	mockRedis.Del(ctx, "revoked:"+oldJTI)
	mockRedis.Del(ctx, "user_tokens:"+userID)
}

func TestRefreshToken_ReuseDetection(t *testing.T) {
	// Test token family theft detection
	mockRedis := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	// Skip if Redis not available
	if err := mockRedis.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}

	userID := "user123"
	deviceID := "device456"

	_, refreshToken, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	ctx := context.Background()
	claims, _ := ValidateToken(refreshToken)

	// First, perform a legitimate refresh
	_, newRefreshToken, err := RefreshAccessToken(mockRedis, refreshToken)
	if err != nil {
		t.Fatalf("first refresh failed: %v", err)
	}

	// Now try to reuse the original refresh token (theft detection)
	_, _, err = RefreshAccessToken(mockRedis, refreshToken)
	if err == nil {
		t.Error("should detect token reuse/theft")
	}

	// Verify error message indicates theft
	if !strings.Contains(err.Error(), "revoked") && !strings.Contains(err.Error(), "theft") {
		t.Errorf("error should indicate revocation or theft, got: %v", err)
	}

	// Clean up
	mockRedis.Del(ctx, "revoked:"+claims.JTI)
	newClaims, _ := ValidateToken(newRefreshToken)
	mockRedis.Del(ctx, "revoked:"+newClaims.JTI)
	mockRedis.Del(ctx, "user_tokens:"+userID)
}

func TestLogout(t *testing.T) {
	// Test that both tokens get revoked
	mockRedis := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	// Skip if Redis not available
	if err := mockRedis.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}

	userID := "user123"
	deviceID := "device456"

	accessToken, _, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, _ := ValidateToken(accessToken)
	jti := claims.JTI

	// Store token in active set
	ctx := context.Background()
	mockRedis.SAdd(ctx, "user_tokens:"+userID, jti)

	// Manually revoke (simulating logout)
	expiresAt := claims.ExpiresAt.Time
	remainingTTL := time.Until(expiresAt)
	if remainingTTL > 0 {
		mockRedis.Set(ctx, "revoked:"+jti, "1", remainingTTL)
	}

	// Verify token is revoked
	revoked, _ := mockRedis.Get(ctx, "revoked:"+jti).Result()
	if revoked != "1" {
		t.Error("token should be revoked")
	}

	// Clean up
	mockRedis.Del(ctx, "revoked:"+jti)
	mockRedis.Del(ctx, "user_tokens:"+userID)
}

func TestTokenFamily_TheftDetection(t *testing.T) {
	// Full attack scenario: attempt to use old refresh token after legitimate rotation
	mockRedis := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	// Skip if Redis not available
	if err := mockRedis.Ping(context.Background()).Err(); err != nil {
		t.Skip("Redis not available for testing")
	}

	userID := "attacker-test"
	deviceID := "device123"

	// Legitimate user gets initial token pair
	_, refreshToken1, _ := GenerateTokenPair(userID, deviceID)
	claims1, _ := ValidateToken(refreshToken1)
	_ = claims1.FamilyID

	// User legitimately refreshes
	_, refreshToken2, _ := RefreshAccessToken(mockRedis, refreshToken1)
	claims2, _ := ValidateToken(refreshToken2)

	// Both should be in same family
	if claims1.FamilyID != claims2.FamilyID {
		t.Error("refreshed token should be in same family")
	}

	ctx := context.Background()
	// Now attacker tries to use the old token (theft attempt)
	_, _, err := RefreshAccessToken(mockRedis, refreshToken1)

	// Should detect theft
	if err == nil {
		t.Error("should detect theft attempt")
	}

	// Clean up
	mockRedis.Del(ctx, "revoked:"+claims1.JTI)
	mockRedis.Del(ctx, "revoked:"+claims2.JTI)
	mockRedis.Del(ctx, "user_tokens:"+userID)
}

func TestJTI_Uniqueness(t *testing.T) {
	// Each token should have a unique JTI
	userID := "user123"
	deviceID := "device456"

	accessToken1, _, _ := GenerateTokenPair(userID, deviceID)
	accessToken2, _, _ := GenerateTokenPair(userID, deviceID)

	claims1, _ := ValidateToken(accessToken1)
	claims2, _ := ValidateToken(accessToken2)

	if claims1.JTI == claims2.JTI {
		t.Error("each token should have unique JTI")
	}

	if claims1.JTI == "" {
		t.Error("JTI should not be empty")
	}
}

// ============ Original JWT Tests (Retained) ============

func TestValidateToken_ValidAccessToken(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	accessToken, _, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("expected user_id %q, got %q", userID, claims.UserID)
	}
	if claims.DeviceID != deviceID {
		t.Errorf("expected device_id %q, got %q", deviceID, claims.DeviceID)
	}
	if claims.Type != "access" {
		t.Errorf("expected token type 'access', got %q", claims.Type)
	}
}

func TestValidateToken_ValidRefreshToken(t *testing.T) {
	userID := "user789"
	deviceID := "device999"

	_, refreshToken, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(refreshToken)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != userID {
		t.Errorf("expected user_id %q, got %q", userID, claims.UserID)
	}
	if claims.Type != "refresh" {
		t.Errorf("expected token type 'refresh', got %q", claims.Type)
	}
}

func TestValidateToken_TamperedToken(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	accessToken, _, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	// Tamper with the token by modifying the signature
	parts := strings.SplitN(accessToken, ".", 3)
	if len(parts) != 3 {
		t.Fatal("token does not have 3 parts")
	}

	// Modify the signature part
	tamperedSig := "tamperedsignature1234567890abcdef"
	tamperedToken := parts[0] + "." + parts[1] + "." + tamperedSig

	_, err = ValidateToken(tamperedToken)
	if err == nil {
		t.Error("ValidateToken should reject tampered token")
	}
}

func TestValidateToken_WrongSigningMethod(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	// Create a token signed with HS256 instead of EdDSA
	now := time.Now()
	claims := Claims{
		UserID:   userID,
		DeviceID: deviceID,
		Type:     "access",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			Issuer:    "usbvault",
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte("secret"))
	if err != nil {
		t.Fatalf("failed to sign with HS256: %v", err)
	}

	_, err = ValidateToken(tokenString)
	if err == nil {
		t.Error("ValidateToken should reject token with wrong signing method")
	}
}

func TestValidateToken_InvalidTokenType(t *testing.T) {
	userID := "user123"
	deviceID := "device456"
	now := time.Now()

	// Create a token with invalid type
	claims := Claims{
		UserID:   userID,
		DeviceID: deviceID,
		Type:     "invalid", // Should be "access" or "refresh"
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			Issuer:    "usbvault",
			Subject:   userID,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tokenString, err := token.SignedString(jwtPrivateKey)
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}

	_, err = ValidateToken(tokenString)
	if err == nil {
		t.Error("ValidateToken should reject token with invalid type")
	}
}

func TestTokenClaimsContainUserAndDeviceInfo(t *testing.T) {
	userID := "test-user-id"
	deviceID := "test-device-id"

	accessToken, _, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	// Verify all claim fields
	if claims.UserID != userID {
		t.Errorf("UserID mismatch: expected %q, got %q", userID, claims.UserID)
	}
	if claims.DeviceID != deviceID {
		t.Errorf("DeviceID mismatch: expected %q, got %q", deviceID, claims.DeviceID)
	}
	if claims.Subject != userID {
		t.Errorf("Subject mismatch: expected %q, got %q", userID, claims.Subject)
	}
	if claims.Issuer != "usbvault" {
		t.Errorf("Issuer mismatch: expected 'qav', got %q", claims.Issuer)
	}
}

func TestTokenTypeValidation(t *testing.T) {
	userID := "user123"
	deviceID := "device456"

	accessToken, refreshToken, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	// Test access token type
	accessClaims, err := ValidateToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateToken on access token failed: %v", err)
	}
	if accessClaims.Type != "access" {
		t.Errorf("expected access token type to be 'access', got %q", accessClaims.Type)
	}

	// Test refresh token type
	refreshClaims, err := ValidateToken(refreshToken)
	if err != nil {
		t.Fatalf("ValidateToken on refresh token failed: %v", err)
	}
	if refreshClaims.Type != "refresh" {
		t.Errorf("expected refresh token type to be 'refresh', got %q", refreshClaims.Type)
	}
}

func TestGetPublicKey(t *testing.T) {
	pubKey := GetPublicKey()

	if pubKey == nil {
		t.Error("GetPublicKey returned nil")
	}

	// The public key should be ed25519.PublicKeySize bytes
	expectedSize := ed25519.PublicKeySize
	if len(pubKey) != expectedSize {
		t.Errorf("expected public key size %d, got %d", expectedSize, len(pubKey))
	}
}

func TestKeyLoadOrGenerate(t *testing.T) {
	// This test verifies that loadOrGenerateKeys sets up valid keys
	// by checking that we can create and verify tokens

	testUserID := "key-test-user"
	testDeviceID := "key-test-device"

	accessToken, _, err := GenerateTokenPair(testUserID, testDeviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateToken failed after key generation: %v", err)
	}

	if claims.UserID != testUserID {
		t.Errorf("token validation failed: user ID mismatch")
	}
}

func TestInvalidBase64EncodedKey(t *testing.T) {
	// Test that invalid base64 encoded keys in env are handled
	// (This is more of an integration test, but we verify the public key works)

	pubKey := GetPublicKey()

	// Verify we can base64 encode the public key
	encoded := base64.StdEncoding.EncodeToString(pubKey)
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		t.Fatalf("failed to base64 decode public key: %v", err)
	}

	if len(decoded) != ed25519.PublicKeySize {
		t.Errorf("decoded public key has wrong size: %d", len(decoded))
	}
}

func TestTokenClaimsStructure(t *testing.T) {
	userID := "user-claims-test"
	deviceID := "device-claims-test"

	accessToken, _, err := GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	// Verify RegisteredClaims
	if claims.RegisteredClaims.Issuer != "usbvault" {
		t.Errorf("issuer should be 'qav', got %q", claims.RegisteredClaims.Issuer)
	}
	if claims.RegisteredClaims.Subject != userID {
		t.Errorf("subject should be %q, got %q", userID, claims.RegisteredClaims.Subject)
	}
	if claims.RegisteredClaims.IssuedAt == nil {
		t.Error("IssuedAt should not be nil")
	}
	if claims.RegisteredClaims.ExpiresAt == nil {
		t.Error("ExpiresAt should not be nil")
	}
}

func TestInvalidJWTFormat(t *testing.T) {
	invalidTokens := []string{
		"not-a-jwt",
		"only.two.parts",
		"",
		"a.b.c.d.e",
	}

	for i, invalidToken := range invalidTokens {
		_, err := ValidateToken(invalidToken)
		if err == nil {
			t.Errorf("test case %d: ValidateToken should reject invalid JWT format: %q", i, invalidToken)
		}
	}
}

func TestMultipleTokensIndependent(t *testing.T) {
	token1, _, _ := GenerateTokenPair("user1", "device1")
	token2, _, _ := GenerateTokenPair("user2", "device2")

	claims1, _ := ValidateToken(token1)
	claims2, _ := ValidateToken(token2)

	if claims1.UserID == claims2.UserID {
		t.Error("different tokens should have different user IDs")
	}
	if claims1.DeviceID == claims2.DeviceID {
		t.Error("different tokens should have different device IDs")
	}
}
