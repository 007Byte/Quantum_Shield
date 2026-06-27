package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// SD-008 FIX: Backup code constants
const (
	BackupCodeLength    = 8
	BackupCodeCount     = 10
	BackupCodeCharset   = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
)

type GenerateBackupCodesRequest struct {
	// Empty - just a POST to the endpoint
}

type GenerateBackupCodesResponse struct {
	BackupCodes []string `json:"backup_codes"` // Plain text codes (only shown once)
	ExpiresAt   string   `json:"expires_at"`
}

type VerifyBackupCodeRequest struct {
	Email      string `json:"email"`
	BackupCode string `json:"backup_code"`
}

type VerifyBackupCodeResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// SD-008 FIX: Generate random backup codes - crypto-random 8 character codes
func generateBackupCodes(count int) ([]string, error) {
	codes := make([]string, count)
	for i := 0; i < count; i++ {
		code := make([]byte, BackupCodeLength)
		for j := range code {
			b := make([]byte, 1)
			_, err := rand.Read(b)
			if err != nil {
				return nil, err
			}
			code[j] = BackupCodeCharset[b[0]%byte(len(BackupCodeCharset))]
		}
		codes[i] = string(code)
	}
	return codes, nil
}

// SD-008 FIX: Hash backup code using SHA-256
// DE-007 FIX: Hash backup code with per-user salt to prevent rainbow table attacks
func hashBackupCode(code string, salt string) string {
	h := sha256.Sum256([]byte(salt + ":" + code))
	return hex.EncodeToString(h[:])
}

// SD-008 FIX: HandleGenerateBackupCodes generates 10 single-use backup codes
// These are stored as hashed values in the database
func HandleGenerateBackupCodes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		// Generate random backup codes
		plainCodes, err := generateBackupCodes(BackupCodeCount)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to generate backup codes")
			http.Error(w, "failed to generate backup codes", http.StatusInternalServerError)
			return
		}

		// Hash the codes for storage
		hashedCodes := make([]string, len(plainCodes))
		for i, code := range plainCodes {
			hashedCodes[i] = hashBackupCode(code, userID)
		}

		// Store as JSON array of hashes in backup_codes column
		codesJSON, err := json.Marshal(hashedCodes)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to marshal backup codes")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Update user record with new backup codes
		_, err = pool.Exec(ctx,
			`UPDATE users SET backup_codes = $1, backup_codes_generated_at = NOW() WHERE id = $2`,
			codesJSON, userID,
		)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to store backup codes")
			http.Error(w, "failed to store backup codes", http.StatusInternalServerError)
			return
		}

		log.Info().Str("user_id", userID).Int("code_count", len(plainCodes)).Msg("SD-008 FIX: backup codes generated")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(GenerateBackupCodesResponse{
			BackupCodes: plainCodes, // Only shown once to user
			ExpiresAt:   time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		})
	}
}

// SD-008 FIX: HandleVerifyBackupCode verifies a backup code during FIDO2 key loss scenario
func HandleVerifyBackupCode(pool *pgxpool.Pool, redisClient *redis.Client, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req VerifyBackupCodeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		req.BackupCode = strings.TrimSpace(req.BackupCode)
		if req.BackupCode == "" {
			http.Error(w, "backup code required", http.StatusBadRequest)
			return
		}

		req.Email = strings.TrimSpace(req.Email)
		if req.Email == "" {
			http.Error(w, "email required", http.StatusBadRequest)
			return
		}

		// DV-001 FIX: Validate email format, length, and normalize
		req.Email = strings.ToLower(req.Email)
		if len(req.Email) > 254 {
			http.Error(w, "email too long", http.StatusBadRequest)
			return
		}
		if !strings.Contains(req.Email, "@") || !strings.Contains(req.Email, ".") {
			http.Error(w, "invalid email format", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		// DV-005 FIX: Rate limit backup code attempts (5 per minute per email)
		rateLimitKey := "ratelimit:backup:" + hashEmail(req.Email)
		attempts, err := redisClient.Incr(ctx, rateLimitKey).Result()
		if err != nil {
			log.Error().Err(err).Msg("DV-005 FIX: failed to check rate limit")
		}
		if attempts == 1 {
			redisClient.Expire(ctx, rateLimitKey, time.Minute)
		}
		if attempts > 5 {
			log.Warn().Str("email_hash", hashEmail(req.Email)).Int64("attempts", attempts).
				Msg("DV-005 FIX: backup code rate limit exceeded")
			http.Error(w, "too many attempts, try again later", http.StatusTooManyRequests)
			return
		}

		// Query for users with matching backup codes
		var userID string
		var backupCodesJSON []byte
		var usedCodesJSON []byte
		// MEDIUM-FIX: Read backup_codes_generated_at to check expiration
		var backupCodesGeneratedAt *time.Time

		emailHash := hashEmail(req.Email)
		err = pool.QueryRow(ctx,
			`SELECT id, backup_codes, backup_codes_used, backup_codes_generated_at FROM users
			 WHERE email_hash = $1 AND backup_codes IS NOT NULL AND deleted_at IS NULL`,
			emailHash,
		).Scan(&userID, &backupCodesJSON, &usedCodesJSON, &backupCodesGeneratedAt)

		if err != nil {
			log.Warn().Err(err).Msg("user not found for backup code verification")
			http.Error(w, "authentication failed", http.StatusUnauthorized)
			return
		}

		// #65: a flagged account must re-register before ANY login path issues tokens,
		// backup-code recovery included. This handler is not currently routed, but the
		// gate belongs here so the policy can never be bypassed if it is ever wired.
		// Fail closed on a lookup error.
		if needs, ferr := userNeedsReRegistration(ctx, pool, userID); ferr != nil || needs {
			if ferr != nil {
				log.Error().Err(ferr).Str("user_id", userID).Msg("#65: re-registration flag lookup failed on backup-code verify — denying")
				http.Error(w, "authentication failed", http.StatusUnauthorized)
				return
			}
			log.Info().Str("user_id", userID).Msg("#65: backup-code login blocked — account must re-register after SRP modulus fix")
			writeReRegistrationRequired(w)
			return
		}

		// MEDIUM-FIX: Check if backup codes have expired (24-hour window)
		// Backup codes must be generated within the last 24 hours to be valid.
		// This prevents reuse of old codes and enforces users to generate fresh codes periodically.
		if backupCodesGeneratedAt != nil {
			expirationTime := backupCodesGeneratedAt.Add(24 * time.Hour)
			if time.Now().After(expirationTime) {
				log.Warn().Str("user_id", userID).Time("generated_at", *backupCodesGeneratedAt).Msg("backup codes expired")
				auditSvc.LogAction(ctx, userID, "BACKUP_CODE_EXPIRED", nil)
				http.Error(w, "backup codes expired", http.StatusUnauthorized)
				return
			}
		}

		// Unmarshal stored backup codes
		var storedCodes []string
		if err := json.Unmarshal(backupCodesJSON, &storedCodes); err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to unmarshal backup codes")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Load used codes (if any)
		usedCodes := make(map[string]bool)
		if usedCodesJSON != nil {
			if err := json.Unmarshal(usedCodesJSON, &usedCodes); err != nil {
				log.Error().Err(err).Str("user_id", userID).Msg("failed to unmarshal used codes")
			}
		}

		// Hash the provided code
		providedHash := hashBackupCode(req.BackupCode, userID)

		// Check if code is valid and not already used
		codeFound := false
		codeUsed := false

		for _, storedHash := range storedCodes {
			if storedHash == providedHash {
				codeFound = true
				if usedCodes[providedHash] {
					codeUsed = true
				}
				break
			}
		}

		if !codeFound {
			log.Warn().Str("user_id", userID).Msg("invalid backup code provided")
			auditSvc.LogAction(ctx, userID, "BACKUP_CODE_VERIFY_FAILED", nil)
			http.Error(w, "authentication failed", http.StatusUnauthorized)
			return
		}

		if codeUsed {
			log.Warn().Str("user_id", userID).Msg("backup code already used")
			auditSvc.LogAction(ctx, userID, "BACKUP_CODE_ALREADY_USED", nil)
			http.Error(w, "backup code already used", http.StatusUnauthorized)
			return
		}

		// Mark code as used
		usedCodes[providedHash] = true
		usedCodesJSON, err = json.Marshal(usedCodes)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to marshal used codes")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Update user record with used code
		_, err = pool.Exec(ctx,
			`UPDATE users SET backup_codes_used = $1 WHERE id = $2`,
			usedCodesJSON, userID,
		)
		if err != nil {
			log.Error().Err(err).Str("user_id", userID).Msg("failed to mark backup code as used")
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		// Issue tokens
		accessToken, refreshToken, err := GenerateTokenPair(userID, "web")
		if err != nil {
			http.Error(w, "token generation failed", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(ctx, userID, "BACKUP_CODE_LOGIN", nil)
		log.Info().Str("user_id", userID).Msg("SD-008 FIX: user authenticated via backup code")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(VerifyBackupCodeResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
		})
	}
}
