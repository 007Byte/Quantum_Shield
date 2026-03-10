package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/config"
)

type FIDO2ChallengeRequest struct {
	Email string `json:"email"`
}

type FIDO2ChallengeResponse struct {
	Challenge string `json:"challenge"`
	SessionID string `json:"session_id"`
}

type FIDO2VerifyRequest struct {
	SessionID             string `json:"session_id"`
	AssertionResponseJSON string `json:"assertion_response"`
}

type FIDO2VerifyResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func HandleFIDO2Challenge(pool *pgxpool.Pool, redisClient *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req FIDO2ChallengeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		// Look up user
		emailHash := hashEmail(req.Email)
		var userID string

		err := pool.QueryRow(ctx,
			`SELECT id FROM users WHERE email_hash = $1`,
			emailHash,
		).Scan(&userID)

		if err != nil {
			log.Debug().Err(err).Str("email", req.Email).Msg("user not found for FIDO2")
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}

		// Initialize WebAuthn
		wau, err := webauthn.New(&webauthn.Config{
			RPID:     config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ID", "usbvault.io"),
			RPDisplayName: config.GetEnvOrDefault("FIDO2_RELYING_PARTY_NAME", "QAV"),
			RPOrigins:     []string{config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ORIGIN", "https://usbvault.io")},
		})
		if err != nil {
			http.Error(w, "webauthn initialization failed", http.StatusInternalServerError)
			return
		}

		// Get user credentials
		var credentialsJSON []byte
		err = pool.QueryRow(ctx,
			`SELECT webauthn_credentials FROM users WHERE id = $1`,
			userID,
		).Scan(&credentialsJSON)

		if err != nil || credentialsJSON == nil {
			http.Error(w, "no credentials registered", http.StatusBadRequest)
			return
		}

		var credentials []webauthn.Credential
		if err := json.Unmarshal(credentialsJSON, &credentials); err != nil {
			log.Error().Err(err).Msg("failed to unmarshal credentials during FIDO2 challenge")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Create assertion options
		options, sessionData, err := wau.BeginDiscoverableLogin()
		if err != nil {
			http.Error(w, "failed to create assertion challenge", http.StatusInternalServerError)
			return
		}

		// Store session in Redis
		sessionID := uuid.New().String()
		sessionJSON, err := json.Marshal(sessionData)
		if err != nil {
			log.Error().Err(err).Msg("failed to marshal FIDO2 session data")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
	// DV-018 FIX: Reduce FIDO2 challenge TTL from 10 minutes to 2 minutes for tighter security
	if err := redisClient.Set(ctx, "fido2:"+sessionID, sessionJSON, 2*time.Minute).Err(); err != nil {
			log.Error().Err(err).Msg("failed to store FIDO2 session in Redis")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(FIDO2ChallengeResponse{
			Challenge: string(options.Response.Challenge),
			SessionID: sessionID,
		})
	}
}

func HandleFIDO2Verify(pool *pgxpool.Pool, redisClient *redis.Client, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req FIDO2VerifyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		if req.SessionID == "" || req.AssertionResponseJSON == "" {
			http.Error(w, "missing session_id or assertion_response", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		// 1. Retrieve session from Redis (now passed directly as parameter)
		if redisClient == nil {
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		sessionJSON, err := redisClient.Get(ctx, "fido2:"+req.SessionID).Bytes()
		if err != nil {
			log.Warn().Str("session_id", req.SessionID).Msg("FIDO2 session not found or expired")
			http.Error(w, "session expired or invalid", http.StatusUnauthorized)
			return
		}

		// Delete session immediately to prevent replay
		redisClient.Del(ctx, "fido2:"+req.SessionID)

		var sessionData webauthn.SessionData
		if err := json.Unmarshal(sessionJSON, &sessionData); err != nil {
			http.Error(w, "corrupted session", http.StatusInternalServerError)
			return
		}

		// 2. Initialize WebAuthn with same config
		wau, err := webauthn.New(&webauthn.Config{
			RPID:          config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ID", "usbvault.io"),
			RPDisplayName: config.GetEnvOrDefault("FIDO2_RELYING_PARTY_NAME", "QAV"),
			RPOrigins:     []string{config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ORIGIN", "https://usbvault.io")},
		})
		if err != nil {
			http.Error(w, "webauthn initialization failed", http.StatusInternalServerError)
			return
		}

		// 3. Look up user and credentials from session's UserID
		userIDBytes := sessionData.UserID
		userID := string(userIDBytes)

		var credentialsJSON []byte
		var displayName string
		err = pool.QueryRow(ctx,
			`SELECT webauthn_credentials, email_hash FROM users WHERE id = $1`,
			userID,
		).Scan(&credentialsJSON, &displayName)
		if err != nil {
			log.Warn().Str("user_id", userID).Msg("user not found during FIDO2 verify")
			http.Error(w, "authentication failed", http.StatusUnauthorized)
			return
		}

		if credentialsJSON == nil {
			http.Error(w, "no credentials registered", http.StatusUnauthorized)
			return
		}

		var credentials []webauthn.Credential
		if err := json.Unmarshal(credentialsJSON, &credentials); err != nil {
			http.Error(w, "corrupted credentials", http.StatusInternalServerError)
			return
		}

		// 4. Create a WebAuthn user wrapper for validation
		waUser := &fido2User{
			id:          userIDBytes,
			name:        displayName,
			credentials: credentials,
		}

		// 5. Validate the assertion response (signature verification)
		updatedCredential, err := wau.FinishLogin(waUser, sessionData, r)
		if err != nil {
			log.Warn().Err(err).Str("user_id", userID).Msg("FIDO2 assertion verification failed")
			auditSvc.LogAction(ctx, userID, "FIDO2_VERIFY_FAILED", nil)
			http.Error(w, "authentication failed", http.StatusUnauthorized)
			return
		}

		// 6. Update sign count on the credential to detect cloned keys
		if updatedCredential != nil {
			for i, c := range credentials {
				if string(c.ID) == string(updatedCredential.ID) {
					credentials[i].Authenticator.SignCount = updatedCredential.Authenticator.SignCount
					break
				}
			}
			updatedJSON, err := json.Marshal(credentials)
			if err != nil {
				log.Error().Err(err).Msg("failed to marshal updated credentials")
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			pool.Exec(ctx,
				`UPDATE users SET webauthn_credentials = $1 WHERE id = $2`,
				updatedJSON, userID,
			)
		}

		// 7. Issue tokens only after successful cryptographic verification
		accessToken, refreshToken, err := GenerateTokenPair(userID, "web")
		if err != nil {
			http.Error(w, "token generation failed", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(ctx, userID, "FIDO2_LOGIN", nil)
		log.Info().Str("user_id", userID).Msg("FIDO2 authentication successful")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(FIDO2VerifyResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
		})
	}
}

// fido2User implements the webauthn.User interface
type fido2User struct {
	id          []byte
	name        string
	credentials []webauthn.Credential
}

func (u *fido2User) WebAuthnID() []byte                         { return u.id }
func (u *fido2User) WebAuthnName() string                       { return u.name }
func (u *fido2User) WebAuthnDisplayName() string                { return u.name }
func (u *fido2User) WebAuthnIcon() string                       { return "" }
func (u *fido2User) WebAuthnCredentials() []webauthn.Credential { return u.credentials }

// TD-011 FIX: Removed unused getRedisFromContext - Redis client is now passed directly as parameter
// func getRedisFromContext(ctx context.Context) *redis.Client {
//	if client, ok := ctx.Value("redis_client").(*redis.Client); ok {
//		return client
//	}
//	return nil
// }
