package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/config"
	"github.com/usbvault/usbvault-server/internal/database"
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
	AccessToken string `json:"access_token"`
	// F4: omitempty — populated only for native clients; web clients receive the
	// refresh token in the HttpOnly cookie instead of the JSON body.
	RefreshToken string `json:"refresh_token,omitempty"`
}

func HandleFIDO2Challenge(pool database.TransactionExecutor, redisClient *redis.Client) http.HandlerFunc {
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
			log.Debug().Err(err).Str("email_hash", emailHash).Msg("user not found for FIDO2")
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

func HandleFIDO2Verify(pool database.TransactionExecutor, redisClient *redis.Client, auditSvc interface {
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
			RPDisplayName: config.GetEnvOrDefault("FIDO2_RELYING_PARTY_NAME", "Quantum_Shield"),
			RPOrigins:     []string{config.GetEnvOrDefault("FIDO2_RELYING_PARTY_ORIGIN", "https://usbvault.io")},
		})
		if err != nil {
			http.Error(w, "webauthn initialization failed", http.StatusInternalServerError)
			return
		}

		// 3. SECURITY: this is a client-side discoverable login. We must NOT
		// trust sessionData.UserID (which is empty for discoverable login and
		// not bound to any credential). Instead, the authenticating identity is
		// derived from the assertion itself: the resolver below looks up the
		// user by the asserted user handle AND verifies that the user actually
		// owns a credential whose ID equals the asserted credential ID. This
		// binds verification to the owning user of the presented credential.
		var (
			userID      string
			credentials []webauthn.Credential
			resolverErr error
		)
		resolver := func(rawID, userHandle []byte) (webauthn.User, error) {
			// userHandle is the WebAuthnID we set at registration: []byte(userID).
			resolvedUserID := string(userHandle)
			if resolvedUserID == "" {
				return nil, fmt.Errorf("empty user handle in assertion")
			}

			var credentialsJSON []byte
			var displayName string
			if dbErr := pool.QueryRow(ctx,
				`SELECT webauthn_credentials, email_hash FROM users WHERE id = $1`,
				resolvedUserID,
			).Scan(&credentialsJSON, &displayName); dbErr != nil {
				resolverErr = dbErr
				return nil, fmt.Errorf("user not found for asserted handle")
			}
			if credentialsJSON == nil {
				return nil, fmt.Errorf("no credentials registered")
			}

			var creds []webauthn.Credential
			if jsonErr := json.Unmarshal(credentialsJSON, &creds); jsonErr != nil {
				resolverErr = jsonErr
				return nil, fmt.Errorf("corrupted credentials")
			}

			// Bind to the asserted credential: the user MUST own a credential
			// whose ID matches the presented rawID.
			ownsCredential := false
			for _, c := range creds {
				if string(c.ID) == string(rawID) {
					ownsCredential = true
					break
				}
			}
			if !ownsCredential {
				return nil, fmt.Errorf("asserted credential not owned by resolved user")
			}

			userID = resolvedUserID
			credentials = creds
			return &fido2User{
				id:          userHandle,
				name:        displayName,
				credentials: creds,
			}, nil
		}

		// 4 & 5. Validate the assertion response (signature verification) and
		// resolve/bind the user via the discoverable-login resolver above.
		updatedCredential, err := wau.FinishDiscoverableLogin(resolver, sessionData, r)
		if err != nil {
			if resolverErr != nil {
				log.Warn().Err(resolverErr).Msg("FIDO2 user resolution failed during verify")
			}
			log.Warn().Err(err).Msg("FIDO2 assertion verification failed")
			if userID != "" {
				auditSvc.LogAction(ctx, userID, "FIDO2_VERIFY_FAILED", nil)
			}
			http.Error(w, "authentication failed", http.StatusUnauthorized)
			return
		}

		// #65: enforce forced re-registration on the passkey path too. The account is
		// resolved and cryptographically verified above, but a flagged account must NOT
		// receive tokens — doing so would silently bypass the SRP-modulus re-registration
		// policy. Fail closed: if the flag lookup errors, deny rather than mint tokens.
		if needs, ferr := userNeedsReRegistration(ctx, pool, userID); ferr != nil || needs {
			if ferr != nil {
				log.Error().Err(ferr).Str("user_id", userID).Msg("#65: re-registration flag lookup failed on FIDO2 verify — denying")
				http.Error(w, "authentication failed", http.StatusUnauthorized)
				return
			}
			log.Info().Str("user_id", userID).Msg("#65: FIDO2 login blocked — account must re-register after SRP modulus fix")
			auditSvc.LogAction(ctx, userID, "FIDO2_LOGIN_BLOCKED_REREGISTRATION", nil)
			writeReRegistrationRequired(w)
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
			if _, execErr := pool.Exec(ctx,
				`UPDATE users SET webauthn_credentials = $1 WHERE id = $2`,
				updatedJSON, userID,
			); execErr != nil {
				log.Error().Err(execErr).Str("user_id", userID).Msg("failed to update FIDO2 credential sign count")
				// Non-fatal: login succeeds but cloning detection may be weakened
			}
		}

		// 7. Issue tokens only after successful cryptographic verification
		accessToken, refreshToken, err := GenerateTokenPair(userID, "web")
		if err != nil {
			http.Error(w, "token generation failed", http.StatusInternalServerError)
			return
		}

		// H-5: a FIDO2 assertion is a fresh strong authentication — record it so the user
		// may enroll a new credential within the step-up window (any-strong-auth, not
		// strictly SRP, so passkey-login users can still add another passkey).
		if rerr := markRecentReauth(ctx, redisClient, userID); rerr != nil {
			log.Warn().Err(rerr).Str("user_id", userID).Msg("H-5: failed to set recent-reauth marker (non-fatal)")
		}

		auditSvc.LogAction(ctx, userID, "FIDO2_LOGIN", nil)
		log.Info().Str("user_id", userID).Msg("FIDO2 authentication successful")

		// F4 (cookie coverage): mirror the SRP web flow — set the refresh token as
		// an HttpOnly, Secure, SameSite=Strict cookie so web/passkey clients keep
		// the long-lived credential out of JS reach (XSS cannot exfiltrate it).
		setRefreshCookie(w, refreshToken)

		// F4 (no refresh token in web responses): include the refresh token in the
		// JSON body ONLY for native clients (no browser Origin/Referer/cookie).
		// Web clients rely on the cookie set above.
		resp := FIDO2VerifyResponse{AccessToken: accessToken}
		if !IsWebRequest(r) {
			resp.RefreshToken = refreshToken
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
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
