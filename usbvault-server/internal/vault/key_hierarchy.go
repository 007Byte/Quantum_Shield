package vault

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// PH1-FIX: Key hierarchy request/response types for wrappedMek/kekSalt storage

type StoreKeyHierarchyRequest struct {
	WrappedMekB64 string `json:"wrappedMekB64"` // Base64-encoded XChaCha20-Poly1305 wrapped MEK
	KekSaltHex    string `json:"kekSaltHex"`     // Hex-encoded 32-byte Argon2id salt
	KeyVersion    int    `json:"keyVersion"`     // Monotonically increasing key version
}

type KeyHierarchyResponse struct {
	WrappedMekB64   string `json:"wrappedMekB64,omitempty"`
	KekSaltHex      string `json:"kekSaltHex,omitempty"`
	KeyVersion      int    `json:"keyVersion"`
	HasKeyHierarchy bool   `json:"hasKeyHierarchy"`
}

// HandleStoreKeyHierarchy stores wrappedMek and kekSalt for a vault.
// POST /api/v1/vaults/{vaultID}/key-hierarchy
// PH1-FIX: Dedicated endpoint for key hierarchy persistence (SG-004).
func HandleStoreKeyHierarchy(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vaultID := chi.URLParam(r, "vaultID")
		userID, ok := r.Context().Value("user_id").(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var req StoreKeyHierarchyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		// Validate wrappedMek is valid base64
		wrappedMek, err := base64.StdEncoding.DecodeString(req.WrappedMekB64)
		if err != nil {
			http.Error(w, "invalid wrappedMekB64: must be valid base64", http.StatusBadRequest)
			return
		}

		// PH1-FIX: Validate MEK blob size (64-byte MEK + 24-byte nonce + 16-byte tag = 104 bytes for XChaCha20-Poly1305)
		if len(wrappedMek) < 80 || len(wrappedMek) > 200 {
			http.Error(w, "invalid wrappedMek size", http.StatusBadRequest)
			return
		}

		// Validate kekSalt is valid hex (32 bytes = 64 hex chars)
		kekSalt, err := hex.DecodeString(req.KekSaltHex)
		if err != nil || len(kekSalt) != 32 {
			http.Error(w, "invalid kekSaltHex: must be 64-char hex (32 bytes)", http.StatusBadRequest)
			return
		}

		// Validate key version
		if req.KeyVersion < 1 {
			http.Error(w, "keyVersion must be >= 1", http.StatusBadRequest)
			return
		}

		// PH1-FIX: Verify vault ownership before storing key hierarchy
		var ownerID string
		err = pool.QueryRow(r.Context(),
			"SELECT owner_id FROM vaults WHERE id = $1 AND deleted_at IS NULL", vaultID).Scan(&ownerID)
		if err != nil {
			http.Error(w, "vault not found", http.StatusNotFound)
			return
		}
		if ownerID != userID {
			log.Warn().Str("user_id", userID).Str("vault_id", vaultID).Msg("PH1-FIX: unauthorized key hierarchy store attempt")
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		// PH1-FIX: Enforce monotonic key version to prevent rollback attacks
		var currentVersion int
		err = pool.QueryRow(r.Context(),
			"SELECT COALESCE(key_version, 0) FROM vaults WHERE id = $1", vaultID).Scan(&currentVersion)
		if err == nil && req.KeyVersion <= currentVersion {
			http.Error(w, "keyVersion must be greater than current version (rollback protection)", http.StatusConflict)
			return
		}

		// Store key hierarchy data
		_, err = pool.Exec(r.Context(),
			`UPDATE vaults
			 SET wrapped_mek = $1, kek_salt = $2, key_version = $3, key_rotated_at = NOW(), updated_at = NOW()
			 WHERE id = $4 AND owner_id = $5 AND deleted_at IS NULL`,
			wrappedMek, kekSalt, req.KeyVersion, vaultID, userID)
		if err != nil {
			log.Error().Err(err).Str("vault_id", vaultID).Msg("PH1-FIX: failed to store key hierarchy")
			http.Error(w, "failed to store key hierarchy", http.StatusInternalServerError)
			return
		}

		log.Info().Str("vault_id", vaultID).Int("key_version", req.KeyVersion).Msg("PH1-FIX: key hierarchy stored successfully")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "stored"})
	}
}

// HandleGetKeyHierarchy retrieves wrappedMek and kekSalt for vault unlock.
// GET /api/v1/vaults/{vaultID}/key-hierarchy
// PH1-FIX: Allows client to retrieve key hierarchy for vault unlock (SG-005).
func HandleGetKeyHierarchy(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vaultID := chi.URLParam(r, "vaultID")
		userID, ok := r.Context().Value("user_id").(string)
		if !ok || userID == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// PH1-FIX: Verify vault ownership before returning key hierarchy
		var ownerID string
		var wrappedMek, kekSalt []byte
		var keyVersion *int

		err := pool.QueryRow(r.Context(),
			`SELECT owner_id, wrapped_mek, kek_salt, key_version
			 FROM vaults WHERE id = $1 AND deleted_at IS NULL`, vaultID).
			Scan(&ownerID, &wrappedMek, &kekSalt, &keyVersion)
		if err != nil {
			http.Error(w, "vault not found", http.StatusNotFound)
			return
		}

		if ownerID != userID {
			log.Warn().Str("user_id", userID).Str("vault_id", vaultID).Msg("PH1-FIX: unauthorized key hierarchy access attempt")
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		resp := KeyHierarchyResponse{
			HasKeyHierarchy: wrappedMek != nil && kekSalt != nil,
		}

		if resp.HasKeyHierarchy {
			resp.WrappedMekB64 = base64.StdEncoding.EncodeToString(wrappedMek)
			resp.KekSaltHex = hex.EncodeToString(kekSalt)
			if keyVersion != nil {
				resp.KeyVersion = *keyVersion
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}
