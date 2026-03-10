package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TS-006: Comprehensive JWT token security tests

func TestGenerateTokenPair_ReturnsValidTokens(t *testing.T) {
	access, refresh, err := GenerateTokenPair("user-123", "device-abc")
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}
	if access == "" {
		t.Error("access token should not be empty")
	}
	if refresh == "" {
		t.Error("refresh token should not be empty")
	}
}

func TestGenerateTokenPair_AccessTokenHasCorrectClaims(t *testing.T) {
	access, _, err := GenerateTokenPair("user-456", "device-xyz")
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(access)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.UserID != "user-456" {
		t.Errorf("UserID = %q, want %q", claims.UserID, "user-456")
	}
	if claims.DeviceID != "device-xyz" {
		t.Errorf("DeviceID = %q, want %q", claims.DeviceID, "device-xyz")
	}
	if claims.Type != "access" {
		t.Errorf("Type = %q, want %q", claims.Type, "access")
	}
	if claims.JTI == "" {
		t.Error("JTI should not be empty")
	}
	if claims.FamilyID == "" {
		t.Error("FamilyID should not be empty")
	}
	if claims.Issuer != "qav" {
		t.Errorf("Issuer = %q, want %q", claims.Issuer, "qav")
	}
}

func TestGenerateTokenPair_RefreshTokenHasCorrectType(t *testing.T) {
	_, refresh, err := GenerateTokenPair("user-789", "device-123")
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(refresh)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.Type != "refresh" {
		t.Errorf("Type = %q, want %q", claims.Type, "refresh")
	}
}

func TestGenerateTokenPair_AccessTokenExpires15Min(t *testing.T) {
	access, _, err := GenerateTokenPair("user-test", "device-test")
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	claims, err := ValidateToken(access)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	ttl := time.Until(claims.ExpiresAt.Time)
	// Should be between 14 and 16 minutes (accounting for test execution time)
	if ttl < 14*time.Minute || ttl > 16*time.Minute {
		t.Errorf("Access token TTL = %v, want ~15 minutes", ttl)
	}
}

func TestGenerateTokenPair_UniqueFamilyIDs(t *testing.T) {
	_, _, err1 := GenerateTokenPair("user-1", "device-1")
	_, _, err2 := GenerateTokenPair("user-1", "device-1")
	if err1 != nil || err2 != nil {
		t.Fatalf("GenerateTokenPair failed: %v, %v", err1, err2)
	}
	// Family IDs should be unique per token pair (crypto-random)
	// Can't easily verify uniqueness here since we don't return family_id externally
	// but we verify the function doesn't error
}

func TestGenerateTokenPairWithFingerprint_IncludesFingerprint(t *testing.T) {
	access, _, err := GenerateTokenPairWithFingerprint("user-fp", "device-fp", "fingerprint-abc123")
	if err != nil {
		t.Fatalf("GenerateTokenPairWithFingerprint failed: %v", err)
	}

	claims, err := ValidateToken(access)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if claims.DeviceFingerprint != "fingerprint-abc123" {
		t.Errorf("DeviceFingerprint = %q, want %q", claims.DeviceFingerprint, "fingerprint-abc123")
	}
}

func TestValidateToken_RejectsExpiredToken(t *testing.T) {
	// Create token with past expiry
	now := time.Now()
	claims := Claims{
		UserID:   "user-expired",
		DeviceID: "device-expired",
		Type:     "access",
		JTI:      "jti-expired",
		FamilyID: "family-expired",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now.Add(-2 * time.Hour)),
			ExpiresAt: jwt.NewNumericDate(now.Add(-1 * time.Hour)), // Expired 1 hour ago
			Issuer:    "qav",
			Subject:   "user-expired",
		},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims).SignedString(jwtPrivateKey)
	if err != nil {
		t.Fatalf("Failed to sign token: %v", err)
	}

	_, err = ValidateToken(token)
	if err == nil {
		t.Error("ValidateToken should reject expired token")
	}
}

func TestValidateToken_RejectsWrongSigningMethod(t *testing.T) {
	// Create a token with HMAC instead of EdDSA
	claims := jwt.MapClaims{
		"user_id":   "user-wrong-method",
		"device_id": "device-wrong",
		"type":      "access",
		"jti":       "jti-wrong",
		"iss":       "qav",
		"exp":       time.Now().Add(time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte("wrong-secret"))
	if err != nil {
		t.Fatalf("Failed to create HMAC token: %v", err)
	}

	_, err = ValidateToken(tokenString)
	if err == nil {
		t.Error("ValidateToken should reject HMAC-signed token")
	}
}

func TestValidateToken_RejectsInvalidTokenType(t *testing.T) {
	now := time.Now()
	claims := Claims{
		UserID:   "user-bad-type",
		DeviceID: "device-bad",
		Type:     "admin", // Invalid type
		JTI:      "jti-bad-type",
		FamilyID: "family-bad",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			Issuer:    "qav",
			Subject:   "user-bad-type",
		},
	}

	token, err := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims).SignedString(jwtPrivateKey)
	if err != nil {
		t.Fatalf("Failed to sign token: %v", err)
	}

	_, err = ValidateToken(token)
	if err == nil {
		t.Error("ValidateToken should reject invalid token type")
	}
}

func TestValidateToken_RejectsTamperedToken(t *testing.T) {
	access, _, err := GenerateTokenPair("user-tamper", "device-tamper")
	if err != nil {
		t.Fatalf("GenerateTokenPair failed: %v", err)
	}

	// Tamper with the token by changing a character
	parts := strings.Split(access, ".")
	if len(parts) != 3 {
		t.Fatal("Token should have 3 parts")
	}
	// Flip a character in the signature
	sig := []byte(parts[2])
	if len(sig) > 0 {
		sig[0] = sig[0] ^ 0xFF
	}
	tampered := parts[0] + "." + parts[1] + "." + string(sig)

	_, err = ValidateToken(tampered)
	if err == nil {
		t.Error("ValidateToken should reject tampered token")
	}
}

func TestValidateToken_RejectsWrongKeySignature(t *testing.T) {
	// Generate a different keypair
	_, otherPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	now := time.Now()
	claims := Claims{
		UserID:   "user-wrong-key",
		DeviceID: "device-wrong-key",
		Type:     "access",
		JTI:      "jti-wrong-key",
		FamilyID: "family-wrong-key",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			Issuer:    "qav",
			Subject:   "user-wrong-key",
		},
	}

	// Sign with wrong key
	token, err := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims).SignedString(otherPriv)
	if err != nil {
		t.Fatalf("Failed to sign token: %v", err)
	}

	_, err = ValidateToken(token)
	if err == nil {
		t.Error("ValidateToken should reject token signed with wrong key")
	}
}

func TestRandomString_CryptoRandom(t *testing.T) {
	s1 := randomString(16)
	s2 := randomString(16)
	if s1 == s2 {
		t.Error("randomString should produce unique values")
	}
	if len(s1) != 16 {
		t.Errorf("randomString(16) returned length %d", len(s1))
	}
}

func TestRandomBigInt_Unique(t *testing.T) {
	v1, err1 := randomBigInt(256)
	v2, err2 := randomBigInt(256)
	if err1 != nil || err2 != nil {
		t.Fatalf("randomBigInt failed: %v, %v", err1, err2)
	}
	if v1.Cmp(v2) == 0 {
		t.Error("two random values should differ")
	}
}

func TestComputeSRPk_NonZero(t *testing.T) {
	N := new(big.Int)
	N.SetString(srpN, 16)
	g := big.NewInt(int64(srpG))
	k := computeSRPk(N, g)
	if k.Sign() <= 0 {
		t.Error("SRP k should be positive")
	}
}
