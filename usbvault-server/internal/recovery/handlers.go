package recovery

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// HandleGenerateCodes generates a new set of recovery codes for the authenticated user.
// Old codes are deleted and replaced with 10 new ones. The plaintext codes are returned
// exactly once in the response; only their SHA-256 hashes are stored.
func HandleGenerateCodes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		// Delete existing codes
		_, err := pool.Exec(ctx,
			`DELETE FROM recovery_codes WHERE user_id = $1`, userID,
		)
		if err != nil {
			http.Error(w, "failed to generate codes", http.StatusInternalServerError)
			return
		}

		// Generate and store new codes
		codes := make([]string, NumRecoveryCodes)
		for i := 0; i < NumRecoveryCodes; i++ {
			code := generateCode()
			codes[i] = code

			hash := hashCode(code)
			_, err := pool.Exec(ctx,
				`INSERT INTO recovery_codes (user_id, code_hash, code_index, created_at)
				 VALUES ($1, $2, $3, $4)`,
				userID, hash, i, time.Now(),
			)
			if err != nil {
				http.Error(w, "failed to generate codes", http.StatusInternalServerError)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"codes": codes,
		})
	}
}

// HandleVerifyCode checks a recovery code against the user's stored hashes using
// constant-time comparison. If valid, the code is marked as used.
func HandleVerifyCode(pool *pgxpool.Pool, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req struct {
			Code string `json:"code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Code == "" {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()

		// Normalize code and compute hash
		normalized := strings.ToUpper(strings.ReplaceAll(req.Code, "-", ""))
		h := sha256.Sum256([]byte(normalized))
		inputHash := h[:]

		// Fetch all unused codes for this user
		rows, err := pool.Query(ctx,
			`SELECT id, code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
			userID,
		)
		if err != nil {
			http.Error(w, "verification failed", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var matchedID int
		found := false
		for rows.Next() {
			var id int
			var storedHash []byte
			if err := rows.Scan(&id, &storedHash); err != nil {
				continue
			}
			if subtle.ConstantTimeCompare(inputHash, storedHash) == 1 {
				matchedID = id
				found = true
				// Don't break - continue iterating to maintain constant time
			}
		}
		rows.Close()

		if found {
			// Mark matched code as used
			_, err = pool.Exec(ctx,
				`UPDATE recovery_codes SET used_at = $1 WHERE id = $2`,
				time.Now(), matchedID,
			)
			if err != nil {
				http.Error(w, "verification failed", http.StatusInternalServerError)
				return
			}
		}

		// Audit log the recovery attempt
		if found {
			auditSvc.LogAction(ctx, userID, "RECOVERY_CODE_USED", nil)
		} else {
			auditSvc.LogAction(ctx, userID, "RECOVERY_CODE_FAILED", nil)
		}

		// Count remaining unused codes
		var remaining int
		err = pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
			userID,
		).Scan(&remaining)
		if err != nil {
			http.Error(w, "verification failed", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"valid":     found,
			"remaining": remaining,
		})
	}
}

// HandleGetRemainingCodes returns the count of unused recovery codes for the
// authenticated user and whether they have any codes at all.
func HandleGetRemainingCodes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		var remaining int
		err := pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL`,
			userID,
		).Scan(&remaining)
		if err != nil {
			http.Error(w, "failed to check codes", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"remaining": remaining,
			"has_codes": remaining > 0,
		})
	}
}

// generateCodeForHandler creates a random recovery code in format XXXX-XXXX-XXXX
// This is intentionally kept as a package-level function shared with service.go
// via the unexported generateCode function.
func init() {
	// Verify crypto/rand is working at startup
	buf := make([]byte, 1)
	if _, err := rand.Read(buf); err != nil {
		panic("crypto/rand is not available")
	}
}
