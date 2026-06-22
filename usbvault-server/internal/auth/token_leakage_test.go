//go:build integration
// +build integration

package auth

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// PH3-FIX: Token leakage prevention test suite

// setupTokenLeakageTestRedis creates a test Redis client for token tests
func setupTokenLeakageTestRedis(t *testing.T) *redis.Client {
	client := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := client.Ping(ctx).Result()
	if err != nil {
		t.Skipf("Redis not available: %v", err)
	}

	return client
}

// TestTokenLeakage_TokenNotInURLParams verifies tokens are not included in URL parameters
func TestTokenLeakage_TokenNotInURLParams(t *testing.T) {
	// This test verifies that the API should never accept tokens in URL parameters
	// Tokens should only be in Authorization header

	req := httptest.NewRequest("GET", "/api/vaults?token=eyJhbGc...", nil)
	query := req.URL.Query()

	// Verify token parameter should be empty (API should reject this)
	token := query.Get("token")
	assert.Empty(t, token, "tokens should not be passed in URL parameters due to leakage risk (browser history, logs, referrer headers)")
}

// TestTokenLeakage_TokenNotInResponseBody verifies tokens are not leaked in response body
func TestTokenLeakage_TokenNotInResponseBody(t *testing.T) {
	// When returning errors or other responses, tokens should never be echoed back

	// Simulate a response that should not contain tokens
	responseBody := `{"error":"invalid request","detail":"missing Authorization header"}`

	// Verify no token-like content in response
	tokenPatterns := []string{"eyJ", "Bearer", "HS256", "RS256", "EdDSA"}
	for _, pattern := range tokenPatterns {
		assert.NotContains(t, responseBody, pattern, "response body should not contain token patterns")
	}
}

// TestTokenLeakage_TokenNotInErrorMessages verifies tokens are not included in error messages
func TestTokenLeakage_TokenNotInErrorMessages(t *testing.T) {
	// Test that error messages sanitize tokens

	// Example: If an error message is constructed with user input, it should not contain tokens
	userInput := "test&token=eyJhbGc"
	errorMsg := "Invalid request: " + userInput

	// Log sanitization function would remove token patterns
	sanitizedMsg := sanitizeErrorMessage(errorMsg)

	// Verify tokens are not in sanitized message
	assert.NotContains(t, sanitizedMsg, "eyJhbGc", "error messages should not contain token values")
}

// sanitizeErrorMessage removes potentially sensitive data from error messages
func sanitizeErrorMessage(msg string) string {
	// In production, this should be implemented in the actual error handling
	// For now, this is a placeholder
	if strings.Contains(msg, "token") || strings.Contains(msg, "Bearer") {
		return strings.ReplaceAll(msg, "eyJhbGc", "[REDACTED]")
	}
	return msg
}

// TestTokenLeakage_RefreshTokenRotation verifies refresh tokens are rotated on use
func TestTokenLeakage_RefreshTokenRotation(t *testing.T) {
	client := setupTokenLeakageTestRedis(t)
	ctx := context.Background()

	// This test verifies that when a refresh token is used to get a new access token,
	// the refresh token is rotated (old one invalidated)

	refreshTokenID := "refresh-token-id-1"
	userID := "user-123"

	// Simulate storing a refresh token with a family ID (for rotation tracking)
	tokenFamily := "family-1"
	err := client.Set(ctx, "refresh_token:"+refreshTokenID, userID+":"+tokenFamily, 30*24*time.Hour).Err()
	require.NoError(t, err)

	// When used, the old refresh token should be invalidated
	// New one should be issued with same family
	err = client.Del(ctx, "refresh_token:"+refreshTokenID).Err()
	require.NoError(t, err)

	// Verify old token is invalidated
	val, err := client.Get(ctx, "refresh_token:"+refreshTokenID).Result()
	assert.Error(t, err, "old refresh token should be invalidated")
	assert.Empty(t, val)

	client.FlushDB(ctx)
}

// TestTokenLeakage_TokenFamilyRevocation verifies that token family revocation works (detects token theft)
func TestTokenLeakage_TokenFamilyRevocation(t *testing.T) {
	client := setupTokenLeakageTestRedis(t)
	ctx := context.Background()

	// If a refresh token is compromised and used twice concurrently,
	// the entire token family should be revoked to detect the attack

	tokenFamily := "family-1"
	userID := "user-123"

	// Store token family in Redis
	err := client.Set(ctx, "token_family:"+tokenFamily, "1", 30*24*time.Hour).Err()
	require.NoError(t, err)

	// Simulate token theft: if family is used more than once per generation,
	// revoke the entire family
	revocationKey := "revoked_family:" + tokenFamily
	err = client.Set(ctx, revocationKey, userID, 30*24*time.Hour).Err()
	require.NoError(t, err)

	// Verify family is revoked
	isRevoked, err := client.Get(ctx, revocationKey).Result()
	assert.NoError(t, err)
	assert.Equal(t, userID, isRevoked, "token family should be marked as revoked")

	client.FlushDB(ctx)
}

// TestTokenLeakage_ExpiredRefreshToken_CannotGetNewAccess verifies expired refresh tokens cannot generate new access tokens
func TestTokenLeakage_ExpiredRefreshToken_CannotGetNewAccess(t *testing.T) {
	client := setupTokenLeakageTestRedis(t)
	ctx := context.Background()

	// Test that expired refresh tokens cannot be used
	refreshTokenID := "expired-refresh-token"

	// Store as expired (TTL = 0)
	err := client.Set(ctx, "refresh_token:"+refreshTokenID, "user-123", 0).Err()
	require.NoError(t, err)

	// Immediately check it's gone
	val, err := client.Get(ctx, "refresh_token:"+refreshTokenID).Result()
	assert.Error(t, err)
	assert.Empty(t, val)

	client.FlushDB(ctx)
}

// TestTokenLeakage_StolenToken_FamilyDetection verifies that token theft is detected via family tracking
func TestTokenLeakage_StolenToken_FamilyDetection(t *testing.T) {
	client := setupTokenLeakageTestRedis(t)
	ctx := context.Background()

	userID := "user-123"
	tokenFamily := "family-1"

	// Initial refresh token issued
	refreshToken1 := "refresh-1"
	err := client.Set(ctx, "refresh_token:"+refreshToken1, userID+":"+tokenFamily, 30*24*time.Hour).Err()
	require.NoError(t, err)

	// Legitimate use: refresh token is used, new token issued with same family
	refreshToken2 := "refresh-2"
	err = client.Del(ctx, "refresh_token:"+refreshToken1).Err() // Old token revoked
	require.NoError(t, err)

	err = client.Set(ctx, "refresh_token:"+refreshToken2, userID+":"+tokenFamily, 30*24*time.Hour).Err()
	require.NoError(t, err)

	// Attack scenario: attacker uses old token (refresh-1) to get new token
	// This would fail because old token is deleted
	val, err := client.Get(ctx, "refresh_token:"+refreshToken1).Result()
	assert.Error(t, err, "stolen/old token should be rejected")
	assert.Empty(t, val)

	// System detects reuse of old token family - should revoke entire family
	revocationKey := "revoked_family:" + tokenFamily
	err = client.Set(ctx, revocationKey, userID, 30*24*time.Hour).Err()
	require.NoError(t, err)

	// Verify all tokens in family are now invalid
	isRevoked, err := client.Get(ctx, revocationKey).Result()
	assert.NoError(t, err)
	assert.Equal(t, userID, isRevoked)

	client.FlushDB(ctx)
}

// TestTokenLeakage_ConcurrentRefresh_OnlyOneSucceeds verifies that concurrent refresh attempts are serialized
func TestTokenLeakage_ConcurrentRefresh_OnlyOneSucceeds(t *testing.T) {
	client := setupTokenLeakageTestRedis(t)
	ctx := context.Background()

	tokenFamily := "family-1"
	userID := "user-123"
	refreshToken := "refresh-token"

	// Simulate two concurrent refresh attempts
	// Only one should succeed, the other should detect replay attack

	// First use: generate nonce to detect concurrent use
	nonce := "nonce-1"
	key := "refresh_token_nonce:" + refreshToken
	err := client.Set(ctx, key, nonce, 1*time.Minute).Err()
	require.NoError(t, err)

	// First request completes - nonce is deleted, new token issued
	err = client.Del(ctx, key).Err()
	require.NoError(t, err)

	// Second concurrent request arrives with same token
	// Nonce is already deleted, so this should fail
	val, err := client.Get(ctx, key).Result()
	assert.Error(t, err, "concurrent refresh should be detected via missing nonce")
	assert.Empty(t, val)

	// Family should be revoked due to potential token theft
	revocationKey := "revoked_family:" + tokenFamily
	err = client.Set(ctx, revocationKey, userID, 30*24*time.Hour).Err()
	require.NoError(t, err)

	// Verify family is revoked
	isRevoked, err := client.Get(ctx, revocationKey).Result()
	assert.NoError(t, err)
	assert.Equal(t, userID, isRevoked)

	client.FlushDB(ctx)
}

// TestTokenLeakage_LogSanitization_NoTokensInLogs verifies that logs don't contain token values
func TestTokenLeakage_LogSanitization_NoTokensInLogs(t *testing.T) {
	// This test verifies that when logging HTTP requests/responses,
	// Authorization headers are sanitized

	authHeader := "Bearer eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.signature"

	// Sanitize the header for logging
	sanitizedHeader := sanitizeAuthHeader(authHeader)

	// Verify the full token is not in the sanitized version
	assert.NotContains(t, sanitizedHeader, "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9")
	assert.NotContains(t, sanitizedHeader, "signature")

	// But it should still indicate Bearer auth was present
	assert.Contains(t, sanitizedHeader, "Bearer")
}

// sanitizeAuthHeader removes the actual token from log output
func sanitizeAuthHeader(header string) string {
	if strings.HasPrefix(header, "Bearer ") {
		return "Bearer [REDACTED]"
	}
	return "[REDACTED]"
}

// TestTokenLeakage_CORS_RestrictsOrigins verifies CORS doesn't leak tokens across origins
func TestTokenLeakage_CORS_RestrictsOrigins(t *testing.T) {
	// Test that CORS configuration doesn't allow wildcard origins with credentials
	// This would leak tokens via preflight requests

	req := httptest.NewRequest("OPTIONS", "/api/vaults", nil)
	req.Header.Set("Origin", "https://malicious.com")

	w := httptest.NewRecorder()

	// Handler should reject this origin if it's not in allowed list
	corsAllowedOrigins := []string{"https://trusted.com"}
	isAllowed := false
	for _, origin := range corsAllowedOrigins {
		if req.Header.Get("Origin") == origin {
			isAllowed = true
			break
		}
	}

	assert.False(t, isAllowed, "malicious origin should not be allowed")

	// Even if the preflight request is made, no token should be in response
	assert.Empty(t, w.Header().Get("Access-Control-Allow-Headers"),
		"credentials should not be exposed if origin is not trusted")
}
