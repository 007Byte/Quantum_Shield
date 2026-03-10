package auth

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// RegisterRequest contains the data needed to create a new account
type RegisterRequest struct {
	Email           string `json:"email"`
	SRPSalt         string `json:"srp_salt"`         // hex-encoded 32-byte salt
	SRPVerifier     string `json:"srp_verifier"`      // hex-encoded verifier
	PublicKeyX25519 string `json:"public_key_x25519"` // base64-encoded X25519 public key
	PublicKeyEd25519 string `json:"public_key_ed25519"` // base64-encoded Ed25519 public key
}

// RegisterResponse contains the new user ID
type RegisterResponse struct {
	UserID string `json:"user_id"`
}

// HandleRegister creates a new user account with SRP credentials and public keys.
// This is a complete implementation (TD-001 fix) replacing the previous stub.
func HandleRegister(pool *pgxpool.Pool, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req RegisterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		// Validate email
		req.Email = strings.TrimSpace(strings.ToLower(req.Email))
		if req.Email == "" || len(req.Email) > 254 || !strings.Contains(req.Email, "@") {
			http.Error(w, "invalid email address", http.StatusBadRequest)
			return
		}

		// Validate SRP salt (must be 32 bytes = 64 hex chars)
		srpSalt, err := hex.DecodeString(req.SRPSalt)
		if err != nil || len(srpSalt) != 32 {
			http.Error(w, "invalid SRP salt: must be 64 hex characters (32 bytes)", http.StatusBadRequest)
			return
		}

		// Validate SRP verifier (must be non-empty hex)
		srpVerifier, err := hex.DecodeString(req.SRPVerifier)
		if err != nil || len(srpVerifier) == 0 || len(srpVerifier) > 512 {
			http.Error(w, "invalid SRP verifier", http.StatusBadRequest)
			return
		}

		// Validate public keys
		pubKeyX25519, err := base64.StdEncoding.DecodeString(req.PublicKeyX25519)
		if err != nil || len(pubKeyX25519) != 32 {
			http.Error(w, "invalid X25519 public key: must be 32 bytes base64-encoded", http.StatusBadRequest)
			return
		}

		pubKeyEd25519, err := base64.StdEncoding.DecodeString(req.PublicKeyEd25519)
		if err != nil || len(pubKeyEd25519) != 32 {
			http.Error(w, "invalid Ed25519 public key: must be 32 bytes base64-encoded", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		// Hash email for lookup (email itself is not stored in plaintext)
		emailHash := hashEmail(req.Email)

		// Check if user already exists
		var existingID string
		err = pool.QueryRow(ctx,
			`SELECT id FROM users WHERE email_hash = $1 AND deleted_at IS NULL`,
			emailHash,
		).Scan(&existingID)
		if err == nil {
			// User exists
			http.Error(w, "account already exists", http.StatusConflict)
			return
		}

		// Generate user ID
		userID := uuid.New().String()

		// Insert user record in transaction
		tx, err := pool.Begin(ctx)
		if err != nil {
			log.Error().Err(err).Msg("failed to begin registration transaction")
			http.Error(w, "registration failed", http.StatusInternalServerError)
			return
		}
		defer tx.Rollback(ctx)

		// Insert user
		_, err = tx.Exec(ctx,
			`INSERT INTO users (id, email_hash, srp_salt, srp_verifier, public_key_x25519, public_key_ed25519, role, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, $5, $6, 'user', NOW(), NOW())`,
			userID, emailHash, srpSalt, srpVerifier, pubKeyX25519, pubKeyEd25519,
		)
		if err != nil {
			log.Error().Err(err).Str("email_hash", emailHash).Msg("failed to insert user")
			http.Error(w, "registration failed", http.StatusInternalServerError)
			return
		}

		// Commit transaction
		if err := tx.Commit(ctx); err != nil {
			log.Error().Err(err).Msg("failed to commit registration")
			http.Error(w, "registration failed", http.StatusInternalServerError)
			return
		}

		// Audit log
		auditSvc.LogAction(ctx, userID, "ACCOUNT_CREATED", nil)

		log.Info().Str("user_id", userID).Msg("new user registered")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(RegisterResponse{UserID: userID})
	}
}

// DV-010 FIX: ValidRole checks if a role string is a known valid role
func ValidRole(role string) bool {
	switch role {
	case "user", "admin", "owner":
		return true
	default:
		return false
	}
}
