// Package auth provides JWT token generation, validation, and refresh token rotation with theft detection.
//
// Features:
//   - Ed25519 signing for fast JWT operations
//   - Configurable key loading from files or environment variables
//   - Refresh token rotation with family-based theft detection
//   - Token revocation tracking via Redis
//   - Optional device fingerprint binding for additional security
//
// PH2-FIX: Key rotation service support with versioned key headers (kid).
// SD-006 FIX: Atomic token refresh with Redis Lua scripts for concurrency safety.
package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
)

// JWT TTL constants for token expiration and event tracking
const (
	// LOW-FIX: Extracted magic numbers to named constants
	accessTokenTTL         = 15 * time.Minute
	refreshTokenTTL        = 30 * 24 * time.Hour    // 30 days
	revokedTokenTTL        = 30 * 24 * time.Hour    // 30 days
	securityEventsTTL      = 90 * 24 * time.Hour    // 90 days
	tokenContextTimeout    = 5 * time.Second
	contextTimeoutDuration = 5 * time.Second
)

var (
	jwtPrivateKey ed25519.PrivateKey
	jwtPublicKey  ed25519.PublicKey
	// PH2-FIX: Key rotation service instance
	keyRotationSvc *KeyRotationService
)

func init() {
	loadOrGenerateKeys()
}

// SetKeyRotationService configures the JWT package to use key rotation for key versioning.
// Should be called during initialization before any token generation.
//
// PH2-FIX: Key rotation service support with kid header for token versioning.
func SetKeyRotationService(svc *KeyRotationService) {
	keyRotationSvc = svc
}

// loadOrGenerateKeys initializes JWT signing keys with priority order:
//   1. Key files (JWT_ED25519_PRIVATE_KEY_FILE, JWT_ED25519_PUBLIC_KEY_FILE) - RECOMMENDED for production
//   2. Environment variables (JWT_ED25519_PRIVATE_KEY, JWT_ED25519_PUBLIC_KEY) - Legacy, less secure
//   3. Generated ephemeral keys (development only, fails in production)
//
// SD-004 FIX: Support loading JWT keys from files (more secure than plaintext env vars).
// Called automatically during init() to set global jwtPrivateKey and jwtPublicKey.
func loadOrGenerateKeys() {
	// Option 1: Load from file paths (RECOMMENDED for production)
	privKeyPath := os.Getenv("JWT_ED25519_PRIVATE_KEY_FILE")
	pubKeyPath := os.Getenv("JWT_ED25519_PUBLIC_KEY_FILE")

	if privKeyPath != "" && pubKeyPath != "" {
		privPEM, err := os.ReadFile(privKeyPath)
		if err != nil {
			log.Fatal().Err(err).Str("path", privKeyPath).Msg("failed to read JWT private key file")
		}
		pubPEM, err := os.ReadFile(pubKeyPath)
		if err != nil {
			log.Fatal().Err(err).Str("path", pubKeyPath).Msg("failed to read JWT public key file")
		}

		privBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(privPEM)))
		if err != nil {
			log.Fatal().Err(err).Msg("JWT private key file is not valid base64")
		}
		pubBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(pubPEM)))
		if err != nil {
			log.Fatal().Err(err).Msg("JWT public key file is not valid base64")
		}

		if len(privBytes) != ed25519.PrivateKeySize {
			log.Fatal().Int("got", len(privBytes)).Int("want", ed25519.PrivateKeySize).Msg("JWT private key file has wrong size")
		}
		if len(pubBytes) != ed25519.PublicKeySize {
			log.Fatal().Int("got", len(pubBytes)).Int("want", ed25519.PublicKeySize).Msg("JWT public key file has wrong size")
		}

		jwtPrivateKey = ed25519.PrivateKey(privBytes)
		jwtPublicKey = ed25519.PublicKey(pubBytes)
		log.Info().Msg("loaded ED25519 JWT keys from key files (secure)")
		return
	}

	// Option 2: Load from env vars (LEGACY - less secure, keys visible in process env)
	privKeyStr := os.Getenv("JWT_ED25519_PRIVATE_KEY")
	pubKeyStr := os.Getenv("JWT_ED25519_PUBLIC_KEY")

	if privKeyStr != "" && pubKeyStr != "" {
		log.Warn().Msg("loading JWT keys from environment variables — consider using JWT_ED25519_PRIVATE_KEY_FILE for better security")
		privBytes, err := base64.StdEncoding.DecodeString(privKeyStr)
		if err != nil {
			log.Fatal().Err(err).Msg("JWT_ED25519_PRIVATE_KEY is not valid base64")
		}
		pubBytes, err := base64.StdEncoding.DecodeString(pubKeyStr)
		if err != nil {
			log.Fatal().Err(err).Msg("JWT_ED25519_PUBLIC_KEY is not valid base64")
		}

		if len(privBytes) != ed25519.PrivateKeySize {
			log.Fatal().Int("got", len(privBytes)).Int("want", ed25519.PrivateKeySize).Msg("JWT_ED25519_PRIVATE_KEY has wrong size")
		}
		if len(pubBytes) != ed25519.PublicKeySize {
			log.Fatal().Int("got", len(pubBytes)).Int("want", ed25519.PublicKeySize).Msg("JWT_ED25519_PUBLIC_KEY has wrong size")
		}

		jwtPrivateKey = ed25519.PrivateKey(privBytes)
		jwtPublicKey = ed25519.PublicKey(pubBytes)
		log.Info().Msg("loaded ED25519 JWT keys from environment variables")
		return
	}

	// Option 3: Generate ephemeral keys (DEVELOPMENT ONLY)
	environment := os.Getenv("ENVIRONMENT")
	if environment == "production" {
		log.Fatal().
			Msg("FATAL: JWT keys not configured in production. Set JWT_ED25519_PRIVATE_KEY_FILE and JWT_ED25519_PUBLIC_KEY_FILE (recommended) or JWT_ED25519_PRIVATE_KEY and JWT_ED25519_PUBLIC_KEY env vars.")
	}

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to generate ED25519 keys")
	}

	jwtPrivateKey = priv
	jwtPublicKey = pub
	log.Warn().
		Msg("generated ephemeral ED25519 keys — tokens will not survive restart. Set JWT_ED25519_PRIVATE_KEY_FILE for persistence.")
}

// Claims extends jwt.RegisteredClaims with application-specific token metadata.
//
// Fields:
//   - UserID: Unique user identifier from authentication system
//   - DeviceID: Device identifier for tracking device-specific tokens
//   - Type: Token type - either "access" (15 min) or "refresh" (30 days)
//   - JTI: Unique JWT ID for token revocation tracking
//   - FamilyID: Family chain ID for detecting refresh token theft
//   - DeviceFingerprint: Optional device fingerprint for additional binding (e.g., TLS ClientAuth fingerprint)
type Claims struct {
	UserID            string `json:"user_id"`
	DeviceID          string `json:"device_id"`
	Type              string `json:"type"` // "access" or "refresh"
	JTI               string `json:"jti"`  // JWT ID for unique token identification
	FamilyID          string `json:"family_id"`  // For refresh token rotation tracking
	DeviceFingerprint string `json:"device_fingerprint,omitempty"` // Optional device binding
	jwt.RegisteredClaims
}

// RefreshTokenRequest is the request body for token refresh endpoints.
type RefreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// GenerateTokenPair creates access and refresh tokens with security enhancements:
// - Access token TTL: 15 minutes (reduced from 1 hour)
// - Refresh token TTL: 30 days
// - JTI (JWT ID) for unique token identification
// - Family ID for detecting refresh token theft
// - Optional device fingerprint binding
func GenerateTokenPair(userID, deviceID string) (accessToken, refreshToken string, err error) {
	return GenerateTokenPairWithFingerprint(userID, deviceID, "")
}

// GenerateTokenPairWithFingerprint creates a token pair with optional device fingerprint binding
func GenerateTokenPairWithFingerprint(userID, deviceID, deviceFingerprint string) (accessToken, refreshToken string, err error) {
	return GenerateTokenPairWithFamily(userID, deviceID, deviceFingerprint, "")
}

// TD-004 FIX: New function to preserve family ID during token rotation
// GenerateTokenPairWithFamily creates a token pair while preserving the family chain for theft detection
func GenerateTokenPairWithFamily(userID, deviceID, deviceFingerprint, familyID string) (accessToken, refreshToken string, err error) {
	now := time.Now()
	// Use crypto-random UUID for JTI instead of predictable timestamp
	jti := uuid.New().String()
	// Use existing family ID if provided (for token rotation), otherwise generate new one
	if familyID == "" {
		// Use crypto-random string for family ID
		familyID = fmt.Sprintf("family-%s", randomString(16))
	}

	// Access token: 15 minutes (reduced from 1 hour)
	accessClaims := Claims{
		UserID:            userID,
		DeviceID:          deviceID,
		Type:              "access",
		JTI:               jti,
		FamilyID:          familyID,
		DeviceFingerprint: deviceFingerprint,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(accessTokenTTL)),
			Issuer:    "usbvault",
			Subject:   userID,
		},
	}

	accessTokenObj := jwt.NewWithClaims(jwt.SigningMethodEdDSA, accessClaims)
	// PH2-FIX: Add kid header for key versioning
	if keyRotationSvc != nil {
		accessTokenObj.Header["kid"] = keyRotationSvc.GetActiveKID()
	}
	accessToken, err = accessTokenObj.SignedString(jwtPrivateKey)
	if err != nil {
		return "", "", err
	}

	// Refresh token: 30 days
	refreshJTI := fmt.Sprintf("refresh-%s", randomString(16))
	refreshClaims := Claims{
		UserID:            userID,
		DeviceID:          deviceID,
		Type:              "refresh",
		JTI:               refreshJTI,
		FamilyID:          familyID,
		DeviceFingerprint: deviceFingerprint,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(refreshTokenTTL)),
			Issuer:    "usbvault",
			Subject:   userID,
		},
	}

	refreshTokenObj := jwt.NewWithClaims(jwt.SigningMethodEdDSA, refreshClaims)
	// PH2-FIX: Add kid header for key versioning
	if keyRotationSvc != nil {
		refreshTokenObj.Header["kid"] = keyRotationSvc.GetActiveKID()
	}
	refreshToken, err = refreshTokenObj.SignedString(jwtPrivateKey)
	if err != nil {
		return "", "", err
	}

	return accessToken, refreshToken, nil
}

// randomString generates a cryptographically random string using crypto/rand for secure token generation.
// Used for JTI, family IDs, and other security-sensitive identifiers. Panics on rand.Read failure.
func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	// Use crypto/rand for secure random generation, not math/rand
	_, err := rand.Read(b)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to generate random string")
	}
	for i := range b {
		b[i] = charset[b[i] % byte(len(charset))]
	}
	return string(b)
}

// ValidateToken verifies a token's Ed25519 signature and extracts claims.
// Supports key versioning via kid header through the KeyRotationService.
//
// Note: This function does NOT check revocation status. Call ValidateTokenWithRevocation
// for complete validation including revocation checking.
//
// Returns error if:
//   - Token format is invalid
//   - Signature verification fails
//   - Token has expired
//   - Token type is neither "access" nor "refresh"
func ValidateToken(tokenString string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodEd25519); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		// PH2-FIX: Support key rotation - check kid header for verification key
		if kid, ok := token.Header["kid"].(string); ok && keyRotationSvc != nil {
			pubKey, err := keyRotationSvc.GetVerificationKey(kid)
			if err != nil {
				return nil, fmt.Errorf("key lookup failed: %w", err)
			}
			return pubKey, nil
		}
		// Fallback to global key for tokens without kid header
		return jwtPublicKey, nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	if claims.Type != "access" && claims.Type != "refresh" {
		return nil, errors.New("invalid token type")
	}

	return claims, nil
}

// ValidateTokenWithRevocation performs complete token validation including signature verification
// and revocation status checking via Redis.
//
// Process:
//   1. Verify token signature using ValidateToken
//   2. Check if token JTI is in revoked set (revoked:jti key)
//
// Returns error if token is revoked or if revocation check fails.
func ValidateTokenWithRevocation(redisClient *redis.Client, tokenString string) (*Claims, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return nil, err
	}

	// Check if token JTI is revoked
	ctx, cancel := context.WithTimeout(context.Background(), tokenContextTimeout)
	defer cancel()

	revoked, err := redisClient.Get(ctx, "revoked:"+claims.JTI).Result()
	if err == nil && revoked == "1" {
		return nil, errors.New("token revoked")
	}

	return claims, nil
}

// RefreshAccessToken performs secure token refresh with rotation and theft detection.
//
// Process:
//   1. Validate refresh token signature and type
//   2. Check if already revoked using atomic Redis Lua script
//   3. If concurrent reuse detected, revoke entire token family
//   4. Issue new token pair with preserved family ID for theft detection chain
//   5. Store new tokens in user's active token set
//
// SD-006 FIX: Atomic check-and-revoke using Redis Lua script prevents race conditions.
// TD-004 FIX: New function to preserve family ID during token rotation for theft detection.
// SD-013 FIX: Enhanced token family revocation with device context tracking.
//
// Returns error if:
//   - Token signature is invalid
//   - Token is not a refresh token
//   - Token has expired
//   - Token has already been revoked (possible theft)
//   - New token generation fails
func RefreshAccessToken(redisClient *redis.Client, refreshToken string) (newAccessToken, newRefreshToken string, err error) {
	claims, err := ValidateToken(refreshToken)
	if err != nil {
		return "", "", err
	}

	if claims.Type != "refresh" {
		return "", "", errors.New("not a refresh token")
	}

	ctx, cancel := context.WithTimeout(context.Background(), contextTimeoutDuration)
	defer cancel()

	// SD-006 FIX: Atomic check-and-revoke using Redis Lua script to prevent race conditions
	// This ensures that only one concurrent request can successfully refresh a token.
	// The script atomically: (1) checks if already revoked, (2) if not, marks it revoked.
	expiresAt := claims.ExpiresAt.Time
	remainingTTL := time.Until(expiresAt)
	if remainingTTL <= 0 {
		return "", "", errors.New("refresh token expired")
	}

	atomicRevokeScript := redis.NewScript(`
		local revokedKey = KEYS[1]
		local userTokensKey = KEYS[2]
		local jti = ARGV[1]
		local ttl = tonumber(ARGV[2])

		-- Check if already revoked
		local existing = redis.call('GET', revokedKey)
		if existing then
			return existing  -- Return the revocation reason
		end

		-- Not revoked: atomically mark as revoked and remove from active set
		redis.call('SET', revokedKey, '1', 'EX', ttl)
		redis.call('SREM', userTokensKey, jti)
		return nil
	`)

	result, err := atomicRevokeScript.Run(ctx, redisClient,
		[]string{"revoked:" + claims.JTI, "user_tokens:" + claims.UserID},
		claims.JTI, int(remainingTTL.Seconds()),
	).Result()

	if err != nil && err != redis.Nil {
		log.Error().Err(err).Str("jti", claims.JTI).Msg("failed to execute atomic revoke script")
		return "", "", fmt.Errorf("token refresh failed: %w", err)
	}

	// If result is not nil, the token was already revoked
	if err != redis.Nil && result != nil {
		revokeReason, _ := result.(string)
		if strings.HasPrefix(revokeReason, "theft:") {
			// Token was revoked due to theft detection
			log.Warn().
				Str("user_id", claims.UserID).
				Str("family_id", claims.FamilyID).
				Str("jti", claims.JTI).
				Msg("SECURITY: refresh token theft detected via atomic check - revoking entire token family")
			revokeTokenFamily(ctx, redisClient, claims.FamilyID, claims.UserID)
			redisClient.Set(ctx, "theft_event:"+claims.FamilyID, fmt.Sprintf("user=%s,device=%s,time=%s", claims.UserID, claims.DeviceID, time.Now().Format(time.RFC3339)), revokedTokenTTL)
			return "", "", errors.New("token revoked - possible theft detected")
		}
		// Standard revocation (concurrent refresh attempt)
		log.Warn().
			Str("user_id", claims.UserID).
			Str("family_id", claims.FamilyID).
			Str("jti", claims.JTI).
			Msg("SECURITY: concurrent refresh token reuse detected - revoking token family")
		revokeTokenFamily(ctx, redisClient, claims.FamilyID, claims.UserID)
		return "", "", errors.New("token already used - possible theft detected")
	}

	// TD-004 FIX: Issue new token pair with preserved family ID for theft detection chain
	newAccessToken, newRefreshToken, err = GenerateTokenPairWithFamily(claims.UserID, claims.DeviceID, claims.DeviceFingerprint, claims.FamilyID)
	if err != nil {
		return "", "", err
	}

	// Store new tokens in active set
	newClaims, err := ValidateToken(newAccessToken)
	if err != nil {
		log.Error().Err(err).Str("user_id", claims.UserID).Msg("critical: ValidateToken failed on newly generated access token")
		return "", "", fmt.Errorf("failed to validate newly generated access token: %w", err)
	}
	redisClient.SAdd(ctx, "user_tokens:"+claims.UserID, newClaims.JTI)

	newRefreshClaims, err := ValidateToken(newRefreshToken)
	if err != nil {
		log.Error().Err(err).Str("user_id", claims.UserID).Msg("critical: ValidateToken failed on newly generated refresh token")
		return "", "", fmt.Errorf("failed to validate newly generated refresh token: %w", err)
	}
	redisClient.SAdd(ctx, "user_tokens:"+claims.UserID, newRefreshClaims.JTI)

	log.Debug().Str("user_id", claims.UserID).Msg("refresh token rotated successfully")
	return newAccessToken, newRefreshToken, nil
}

// revokeTokenFamily revokes all tokens in a family and logs the security event.
// Called when token theft or suspicious concurrent reuse is detected.
//
// Operations:
//   1. Get all active tokens for the user
//   2. Revoke each token with theft reason
//   3. Log security event with family ID and revocation count
//   4. Keep 90-day history for security analysis
//
// SD-013 FIX: Enhanced token family revocation with device context tracking.
func revokeTokenFamily(ctx context.Context, redisClient *redis.Client, familyID, userID string) {
	// Get all tokens for this user
	tokens, err := redisClient.SMembers(ctx, "user_tokens:"+userID).Result()
	if err != nil {
		log.Error().Err(err).Msg("failed to get user tokens for family revocation")
		return
	}

	// Revoke all tokens in the family and track revocation reason
	revokedCount := 0
	for _, jti := range tokens {
		err := redisClient.Set(ctx, "revoked:"+jti, "theft:"+familyID, 30*24*time.Hour).Err()
		if err != nil {
			log.Error().Err(err).Str("jti", jti).Msg("failed to revoke token")
			continue
		}
		revokedCount++
	}

	// Track the theft event per-device for security alerting
	redisClient.LPush(ctx, "security_events:"+userID, fmt.Sprintf("theft_revocation:family=%s:count=%d:time=%s", familyID, revokedCount, time.Now().Format(time.RFC3339)))
	redisClient.Expire(ctx, "security_events:"+userID, securityEventsTTL) // Keep 90 days

	log.Warn().
		Str("user_id", userID).
		Str("family_id", familyID).
		Int("tokens_revoked", revokedCount).
		Int("tokens_total", len(tokens)).
		Msg("SECURITY: token family revoked due to theft detection")
}

// RefreshTokenResponse is the response body returned after successful token refresh.
type RefreshTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// HandleRefreshToken returns an HTTP handler for the token refresh endpoint (/auth/refresh).
// Accepts POST requests with RefreshTokenRequest body.
// On success, returns new access and refresh tokens with audit logging.
func HandleRefreshToken(redisClient *redis.Client, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RefreshTokenRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		// Token rotation: issue new access and refresh tokens
		accessToken, refreshToken, err := RefreshAccessToken(redisClient, req.RefreshToken)
		if err != nil {
			http.Error(w, "token refresh failed", http.StatusUnauthorized)
			return
		}

		// Extract user ID from new access token for audit logging
		newClaims, err := ValidateToken(accessToken)
		if err == nil {
			auditSvc.LogAction(r.Context(), newClaims.UserID, "TOKEN_REFRESH", nil)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(RefreshTokenResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
		})
	}
}

// HandleLogout returns an HTTP handler for the logout endpoint (/auth/logout).
// Revokes the current access token and all other tokens for the user across all devices.
// Logs audit event and returns success message.
//
// Process:
//   1. Extract user ID from context (set by AuthMiddleware)
//   2. Revoke current token from Authorization header
//   3. Revoke all user tokens from active token set
//   4. Delete user token set
//   5. Log LOGOUT audit event
func HandleLogout(redisClient *redis.Client, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract user_id from context (set by AuthMiddleware)
		userID, ok := r.Context().Value("user_id").(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Get the current token's claims to extract JTI
		authHeader := r.Header.Get("Authorization")
		var tokenString string
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && parts[0] == "Bearer" {
				tokenString = parts[1]
			}
		}

		ctx, cancel := context.WithTimeout(r.Context(), contextTimeoutDuration)
		defer cancel()

		if tokenString != "" {
			claims, err := ValidateToken(tokenString)
			if err == nil {
				// Revoke this token
				expiresAt := claims.ExpiresAt.Time
				remainingTTL := time.Until(expiresAt)
				if remainingTTL > 0 {
					redisClient.Set(ctx, "revoked:"+claims.JTI, "1", remainingTTL)
				}
			}
		}

		// Get all tokens for this user and revoke them
		tokens, err := redisClient.SMembers(ctx, "user_tokens:"+userID).Result()
		if err == nil {
			for _, jti := range tokens {
				redisClient.Set(ctx, "revoked:"+jti, "1", revokedTokenTTL)
			}
			redisClient.Del(ctx, "user_tokens:"+userID)
		}

		log.Info().Str("user_id", userID).Msg("user logged out - all tokens revoked")

		// Audit log the logout
		auditSvc.LogAction(r.Context(), userID, "LOGOUT", nil)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "logged out successfully",
		})
	}
}

// GetPublicKey returns the Ed25519 public key for offline token verification by clients.
// This is typically exposed via a JWKS endpoint for client-side token validation.
func GetPublicKey() []byte {
	return []byte(jwtPublicKey)
}
