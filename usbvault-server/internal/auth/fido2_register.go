package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/config"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
	"github.com/usbvault/usbvault-server/internal/database"
)

type FIDO2RegisterChallengeRequest struct {
	// No email required - user is authenticated via JWT
}

type FIDO2RegisterChallengeResponse struct {
	Challenge string `json:"challenge"`
	SessionID string `json:"session_id"`
}

type FIDO2RegisterVerifyRequest struct {
	SessionID               string `json:"session_id"`
	AttestationResponseJSON string `json:"attestation_response"`
	CredentialName          string `json:"credential_name"` // Optional user-friendly name
}

type FIDO2RegisterVerifyResponse struct {
	CredentialID string `json:"credential_id"`
	Message      string `json:"message"`
}

type FIDO2Credential struct {
	ID         string    `json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	LastUsedAt time.Time `json:"last_used_at"`
	Name       string    `json:"name"`
}

// HandleFIDO2RegisterChallenge initiates credential registration for an authenticated user
// Requires authenticated user (JWT in context)
func HandleFIDO2RegisterChallenge(pool database.TransactionExecutor, redisClient *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract user_id from context (set by AuthMiddleware)
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		// Get user info from database
		var emailHash string
		err := pool.QueryRow(ctx,
			`SELECT email_hash FROM users WHERE id = $1`,
			userID,
		).Scan(&emailHash)

		if err != nil {
			log.Warn().Str("user_id", userID).Err(err).Msg("user not found for FIDO2 registration")
			// Constant-time delay to prevent timing-based user enumeration
			time.Sleep(50 * time.Millisecond)
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}

		// Initialize WebAuthn
		wau, err := webauthn.New(&webauthn.Config{
			RPID:          config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ID", "usbvault.io"),
			RPDisplayName: config.GetEnvOrDefault("FIDO2_RELYING_PARTY_NAME", "Quantum_Shield"),
			RPOrigins:     []string{config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ORIGIN", "https://usbvault.io")},
		})
		if err != nil {
			http.Error(w, "webauthn initialization failed", http.StatusInternalServerError)
			return
		}

		// Get existing credentials for exclusion list (prevent duplicate registration)
		var credentialsJSON []byte
		err = pool.QueryRow(ctx,
			`SELECT webauthn_credentials FROM users WHERE id = $1`,
			userID,
		).Scan(&credentialsJSON)

		var credentials []webauthn.Credential
		if err == nil && credentialsJSON != nil {
			if err := json.Unmarshal(credentialsJSON, &credentials); err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to unmarshal existing credentials during FIDO2 registration challenge")
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
		}

		// H-5: enrolling a NEW credential requires a recent strong authentication (SRP
		// or FIDO2) — a bearer access token alone must not be enough to add a passkey/
		// device (which would grant an attacker persistent access). The FIRST credential
		// is exempt: a user with zero existing authenticators has no prior factor to step
		// up with, and the account is still gated by its primary auth. Fail closed if the
		// marker lookup errors.
		if len(credentials) > 0 {
			recent, rerr := hasRecentReauth(ctx, redisClient, userID)
			if rerr != nil {
				log.Error().Err(rerr).Str("user_id", userID).Msg("H-5: recent-reauth check failed — denying enrollment")
				http.Error(w, "authorization check failed", http.StatusInternalServerError)
				return
			}
			if !recent {
				log.Warn().Str("user_id", userID).Msg("H-5: enrollment blocked — step-up (recent strong-auth) required")
				writeStepUpRequired(w)
				return
			}
		}

		// Create WebAuthn user wrapper
		waUser := &fido2User{
			id:          []byte(userID),
			name:        emailHash,
			credentials: credentials,
		}

		// Create credential creation options
		options, sessionData, err := wau.BeginRegistration(waUser)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to create registration challenge")
			http.Error(w, "failed to create challenge", http.StatusInternalServerError)
			return
		}

		// Store session in Redis with 10 minute TTL
		sessionID := uuid.New().String()
		sessionJSON, err := json.Marshal(sessionData)
		if err != nil {
			log.Error().Err(err).Msg("failed to marshal FIDO2 registration session data")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		err = redisClient.Set(ctx, "fido2reg:"+sessionID, sessionJSON, 2*time.Minute).Err()
		if err != nil {
			log.Error().Err(err).Msg("failed to store registration session in redis")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(FIDO2RegisterChallengeResponse{
			Challenge: string(options.Response.Challenge),
			SessionID: sessionID,
		})
	}
}

// HandleFIDO2RegisterVerify completes credential registration
// Requires authenticated user and valid registration session
func HandleFIDO2RegisterVerify(pool database.TransactionExecutor, redisClient *redis.Client, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract user_id from context
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req FIDO2RegisterVerifyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		if req.SessionID == "" || req.AttestationResponseJSON == "" {
			http.Error(w, "missing session_id or attestation_response", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		// Retrieve session from Redis and delete immediately (replay prevention)
		sessionJSON, err := redisClient.Get(ctx, "fido2reg:"+req.SessionID).Bytes()
		if err != nil {
			log.Warn().Str("user_id", userID).Str("session_id", req.SessionID).Msg("FIDO2 registration session not found or expired")
			http.Error(w, "session expired or invalid", http.StatusUnauthorized)
			return
		}

		// Delete session immediately
		redisClient.Del(ctx, "fido2reg:"+req.SessionID)

		var sessionData webauthn.SessionData
		if err := json.Unmarshal(sessionJSON, &sessionData); err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("corrupted registration session")
			http.Error(w, "corrupted session", http.StatusInternalServerError)
			return
		}

		// Initialize WebAuthn
		wau, err := webauthn.New(&webauthn.Config{
			RPID:          config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ID", "usbvault.io"),
			RPDisplayName: config.GetEnvOrDefault("FIDO2_RELYING_PARTY_NAME", "Quantum_Shield"),
			RPOrigins:     []string{config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ORIGIN", "https://usbvault.io")},
		})
		if err != nil {
			http.Error(w, "webauthn initialization failed", http.StatusInternalServerError)
			return
		}

		// Get user and existing credentials
		var credentialsJSON []byte
		var emailHash string
		err = pool.QueryRow(ctx,
			`SELECT webauthn_credentials, email_hash FROM users WHERE id = $1`,
			userID,
		).Scan(&credentialsJSON, &emailHash)

		if err != nil {
			log.Warn().Str("user_id", userID).Err(err).Msg("user not found during FIDO2 registration verify")
			// Constant-time delay to prevent timing-based user enumeration
			time.Sleep(50 * time.Millisecond)
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}

		var credentials []webauthn.Credential
		credentialCount := 0
		if credentialsJSON != nil {
			if err := json.Unmarshal(credentialsJSON, &credentials); err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to unmarshal credentials during FIDO2 registration verify")
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			credentialCount = len(credentials)
		}

		// Check max credentials limit (10 per user)
		if credentialCount >= 10 {
			log.Warn().Str("user_id", userID).Int("count", credentialCount).Msg("user has reached max FIDO2 credentials")
			auditSvc.LogAction(ctx, userID, "FIDO2_REGISTER_FAILED", []byte("max credentials exceeded"))
			http.Error(w, "maximum credentials reached", http.StatusBadRequest)
			return
		}

		// Create WebAuthn user wrapper
		waUser := &fido2User{
			id:          []byte(userID),
			name:        emailHash,
			credentials: credentials,
		}

		// Verify attestation
		credential, err := wau.FinishRegistration(waUser, sessionData, r)
		if err != nil {
			log.Warn().Err(err).Str("user_id", userID).Msg("FIDO2 attestation verification failed")
			auditSvc.LogAction(ctx, userID, "FIDO2_REGISTER_FAILED", nil)
			http.Error(w, "registration failed", http.StatusBadRequest)
			return
		}

		// Append new credential to list
		credentials = append(credentials, *credential)

		// Store updated credentials in database
		updatedJSON, err := json.Marshal(credentials)
		if err != nil {
			log.Error().Err(err).Msg("failed to marshal updated credentials after registration")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		err = pool.QueryRow(ctx,
			`UPDATE users SET webauthn_credentials = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
			updatedJSON, userID,
		).Scan(&userID)

		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to save credential")
			http.Error(w, "failed to save credential", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(ctx, userID, "FIDO2_REGISTER_SUCCESS", nil)
		log.Info().Str("user_id", userID).Str("credential_id", string(credential.ID)).Msg("FIDO2 credential registered successfully")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(FIDO2RegisterVerifyResponse{
			CredentialID: string(credential.ID),
			Message:      "credential registered successfully",
		})
	}
}

// HandleFIDO2ListCredentials lists registered FIDO2 credentials without exposing secrets
func HandleFIDO2ListCredentials(pool database.TransactionExecutor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract user_id from context
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		// Get credentials from database
		var credentialsJSON []byte
		err := pool.QueryRow(ctx,
			`SELECT webauthn_credentials FROM users WHERE id = $1`,
			userID,
		).Scan(&credentialsJSON)

		if err != nil {
			log.Warn().Str("user_id", userID).Err(err).Msg("user not found")
			// Constant-time delay to prevent timing-based user enumeration
			time.Sleep(50 * time.Millisecond)
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}

		var credentials []webauthn.Credential
		credentialList := make([]FIDO2Credential, 0)

		if credentialsJSON != nil {
			if err := json.Unmarshal(credentialsJSON, &credentials); err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to unmarshal credentials during FIDO2 list credentials")
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}

			for _, cred := range credentials {
				fido2Cred := FIDO2Credential{
					ID:   string(cred.ID),
					Name: "FIDO2 Key",
				}
				credentialList = append(credentialList, fido2Cred)
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(credentialList)
	}
}

// HandleFIDO2DeleteCredential removes a registered credential
func HandleFIDO2DeleteCredential(pool database.TransactionExecutor, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract user_id from context
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Get credential ID from URL parameter
		credentialID := r.URL.Query().Get("id")
		if credentialID == "" {
			http.Error(w, "missing credential id", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		// Get user's current credentials and password status
		var credentialsJSON []byte
		var hasPassword bool
		err := pool.QueryRow(ctx,
			`SELECT webauthn_credentials, password_hash IS NOT NULL FROM users WHERE id = $1`,
			userID,
		).Scan(&credentialsJSON, &hasPassword)

		if err != nil {
			log.Warn().Str("user_id", userID).Err(err).Msg("user not found")
			// Constant-time delay to prevent timing-based user enumeration
			time.Sleep(50 * time.Millisecond)
			http.Error(w, "invalid credentials", http.StatusUnauthorized)
			return
		}

		var credentials []webauthn.Credential
		credentialIndex := -1

		if credentialsJSON != nil {
			if err := json.Unmarshal(credentialsJSON, &credentials); err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to unmarshal credentials during FIDO2 delete credential")
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}

			// Find credential to delete
			for i, cred := range credentials {
				if string(cred.ID) == credentialID {
					credentialIndex = i
					break
				}
			}
		}

		if credentialIndex == -1 {
			http.Error(w, "credential not found", http.StatusNotFound)
			return
		}

		// Check if user would lose all auth methods
		remainingCredentials := len(credentials) - 1
		if remainingCredentials == 0 && !hasPassword {
			http.Error(w, "cannot delete last credential without password backup", http.StatusBadRequest)
			auditSvc.LogAction(ctx, userID, "FIDO2_DELETE_FAILED", []byte("last credential without password"))
			return
		}

		// Remove credential
		credentials = append(credentials[:credentialIndex], credentials[credentialIndex+1:]...)

		// Update database
		var updatedJSON []byte
		if len(credentials) > 0 {
			updatedJSON, err = json.Marshal(credentials)
			if err != nil {
				log.Error().Err(err).Msg("failed to marshal credentials during delete")
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
		} else {
			updatedJSON = nil
		}

		err = pool.QueryRow(ctx,
			`UPDATE users SET webauthn_credentials = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
			updatedJSON, userID,
		).Scan(&userID)

		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to delete credential")
			http.Error(w, "failed to delete credential", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(ctx, userID, "FIDO2_CREDENTIAL_DELETED", nil)
		log.Info().Str("user_id", userID).Str("credential_id", credentialID).Msg("FIDO2 credential deleted")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"message": "credential deleted successfully",
		})
	}
}
