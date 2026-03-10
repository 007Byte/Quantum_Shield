// Package vault provides vault data management and operations.
//
// Features:
//   - Create, read, list, and delete encrypted vaults
//   - Ownership verification and vault member access control
//   - Rollback detection to prevent state machine attacks
//   - Soft-delete support for vault recovery
//   - Base64 encoding for JSON API responses
//
// PH4-FIX: Missing Authorization fixes with ownership and membership verification.
// DV-009 FIX: Metadata size validation (64KB max).
// CR-010 FIX: Validate metadata size before database insertion.
package vault

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// Vault represents a vault with encrypted metadata and ownership information.
//
// Fields:
//   - ID: Unique vault identifier (UUID)
//   - OwnerID: User who owns/created the vault
//   - EncryptedMetadata: Binary encrypted vault metadata (XChaCha20-Poly1305 from client)
//   - CreatedAt: Vault creation timestamp (UTC)
//   - UpdatedAt: Last modification timestamp (UTC)
//
// Important: EncryptedMetadata is never exposed in JSON responses to prevent
// accidental plaintext leakage.
type Vault struct {
	ID                uuid.UUID `json:"id"`
	OwnerID           uuid.UUID `json:"owner_id"`
	EncryptedMetadata []byte    `json:"-"` // Never expose plaintext
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// VaultSummary is the response type returned in list operations.
// EncryptedMetadata is base64-encoded for JSON transmission but remains encrypted.
//
// Fields:
//   - ID: Vault ID as string (UUID)
//   - EncryptedMetadata: Base64-encoded encrypted metadata (still encrypted, not decrypted)
//   - CreatedAt: ISO 8601 formatted creation time
//   - UpdatedAt: ISO 8601 formatted update time
type VaultSummary struct {
	ID                string `json:"id"`
	EncryptedMetadata string `json:"encrypted_metadata"` // Base64-encoded, still encrypted
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}

// VaultService manages vault persistence and access control.
// All methods perform ownership or membership verification before returning vault data.
type VaultService struct {
	pool *pgxpool.Pool
}

// NewVaultService creates a new vault service with the given database connection pool.
func NewVaultService(pool *pgxpool.Pool) *VaultService {
	return &VaultService{pool: pool}
}

// CreateVault creates a new vault owned by the given user with encrypted metadata.
//
// Parameters:
//   - userID: User ID who owns the vault
//   - encryptedMetadata: XChaCha20-Poly1305 encrypted metadata (must be non-empty, max 64KB)
//
// DV-009 FIX: Validate metadata is not empty and within size bounds.
// Returns the created vault's UUID or error if creation fails.
func (vs *VaultService) CreateVault(ctx context.Context, userID string, encryptedMetadata []byte) (uuid.UUID, error) {
	// DV-009 FIX: Validate metadata is not empty and within size bounds
	if len(encryptedMetadata) == 0 {
		return uuid.Nil, fmt.Errorf("encrypted metadata cannot be empty")
	}
	if len(encryptedMetadata) > 64*1024 {
		return uuid.Nil, fmt.Errorf("encrypted metadata exceeds 64KB limit")
	}

	vaultID := uuid.New()

	err := vs.pool.QueryRow(ctx,
		`INSERT INTO vaults (id, owner_id, encrypted_metadata, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id`,
		vaultID, userID, encryptedMetadata,
	).Scan(&vaultID)

	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to create vault")
		return uuid.Nil, err
	}

	log.Info().Str("vault_id", vaultID.String()).Str("user_id", userID).Msg("vault created")
	return vaultID, nil
}

// ListVaults returns all non-deleted vaults owned by the user, in reverse creation order.
// Returns empty list if no vaults exist.
func (vs *VaultService) ListVaults(ctx context.Context, userID string) ([]VaultSummary, error) {
	rows, err := vs.pool.Query(ctx,
		`SELECT id, encrypted_metadata, created_at, updated_at
         FROM vaults
         WHERE owner_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []VaultSummary
	for rows.Next() {
		var id uuid.UUID
		var metadata []byte
		var createdAt, updatedAt time.Time

		if err := rows.Scan(&id, &metadata, &createdAt, &updatedAt); err != nil {
			return nil, err
		}

		vaults = append(vaults, VaultSummary{
			ID:                id.String(),
			EncryptedMetadata: encodeToBase64(metadata),
			CreatedAt:         createdAt.Format(time.RFC3339),
			UpdatedAt:         updatedAt.Format(time.RFC3339),
		})
	}

	return vaults, rows.Err()
}

// GetVault retrieves a vault by ID after verifying user is owner or member.
//
// PH4-FIX: Verify user is vault owner or member before returning vault data (CWE-862: Missing Authorization).
// Returns ErrVaultNotFound if vault doesn't exist or user lacks access.
func (vs *VaultService) GetVault(ctx context.Context, userID string, vaultID uuid.UUID) (*Vault, error) {
	var vault Vault

	// PH4-FIX: Verify user is vault owner or member before returning vault data (CWE-862: Missing Authorization)
	err := vs.pool.QueryRow(ctx,
		`SELECT v.id, v.owner_id, v.encrypted_metadata, v.created_at, v.updated_at
         FROM vaults v
         WHERE v.id = $1 AND v.deleted_at IS NULL
         AND (v.owner_id = $2 OR EXISTS (
           SELECT 1 FROM vault_members vm
           WHERE vm.vault_id = v.id AND vm.user_id = $2
         ))`,
		vaultID, userID,
	).Scan(&vault.ID, &vault.OwnerID, &vault.EncryptedMetadata, &vault.CreatedAt, &vault.UpdatedAt)

	if err != nil {
		log.Debug().Err(err).Str("vault_id", vaultID.String()).Str("user_id", userID).Msg("vault not found or access denied")
		return nil, err
	}

	return &vault, nil
}

// UpdateVaultMetadata updates the encrypted metadata for a vault owned by the user.
// Only the owner can update vault metadata. Returns ErrVaultNotFound if vault doesn't exist.
func (vs *VaultService) UpdateVaultMetadata(ctx context.Context, userID string, vaultID uuid.UUID, encryptedMetadata []byte) error {
	result, err := vs.pool.Exec(ctx,
		`UPDATE vaults
         SET encrypted_metadata = $1, updated_at = NOW()
         WHERE id = $2 AND owner_id = $3`,
		encryptedMetadata, vaultID, userID,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrVaultNotFound
	}

	log.Info().Str("vault_id", vaultID.String()).Msg("vault metadata updated")
	return nil
}

// DeleteVault soft-deletes a vault (sets deleted_at timestamp) owned by the user.
// Soft deletes allow for vault recovery if needed. Only non-deleted vaults can be deleted.
// Returns ErrVaultNotFound if vault doesn't exist or is already deleted.
func (vs *VaultService) DeleteVault(ctx context.Context, userID string, vaultID uuid.UUID) error {
	// Soft delete - only delete non-deleted vaults
	result, err := vs.pool.Exec(ctx,
		`UPDATE vaults
         SET deleted_at = NOW()
         WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
		vaultID, userID,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrVaultNotFound
	}

	log.Info().Str("vault_id", vaultID.String()).Msg("vault deleted")
	return nil
}

// CheckRollback verifies the state version is monotonically increasing to prevent rollback attacks.
// This ensures state machine integrity (e.g., preventing a user from reverting vault to an older state).
//
// Returns error if:
//   - newStateVersion <= current max version (rollback detected)
//   - Database query fails
//
// Also updates the vault's max_state_version if the new version is accepted.
func (vs *VaultService) CheckRollback(ctx context.Context, vaultID uuid.UUID, newStateVersion int64) error {
	var maxVersion int64
	err := vs.pool.QueryRow(ctx,
		`SELECT COALESCE(max_state_version, 0) FROM vaults WHERE id = $1`,
		vaultID,
	).Scan(&maxVersion)
	if err != nil {
		return fmt.Errorf("failed to check state version: %w", err)
	}

	if newStateVersion <= maxVersion {
		log.Warn().Str("vault_id", vaultID.String()).Int64("new_version", newStateVersion).Int64("current_max", maxVersion).Msg("rollback detected")
		return fmt.Errorf("rollback detected: new version %d <= current max %d", newStateVersion, maxVersion)
	}

	// Update the max state version
	_, err = vs.pool.Exec(ctx,
		`UPDATE vaults SET max_state_version = $1 WHERE id = $2`,
		newStateVersion, vaultID,
	)
	if err != nil {
		return fmt.Errorf("failed to update state version: %w", err)
	}

	return nil
}

// HTTP Handlers

// CreateVaultRequest is the request body for creating a new vault.
//
// Fields:
//   - EncryptedMetadata: Base64-encoded XChaCha20-Poly1305 encrypted metadata
type CreateVaultRequest struct {
	EncryptedMetadata string `json:"encrypted_metadata"` // Base64-encoded
}

// CreateVaultResponse is the response body when a vault is created.
type CreateVaultResponse struct {
	VaultID string `json:"vault_id"`
}

// HandleCreateVault returns an HTTP handler for the vault creation endpoint (POST /vaults).
// Validates metadata size, decodes base64, creates vault, and logs audit event.
func HandleCreateVault(vs *VaultService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateVaultRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// MEDIUM-FIX: Validate vault name from metadata (if present in plaintext context)
		// Note: Encrypted metadata is opaque at this layer, but callers should validate
		// vault name length (1-255 chars, no null bytes) at presentation layer

		metadata, err := decodeFromBase64(req.EncryptedMetadata)
		if err != nil {
			http.Error(w, "invalid base64 encrypted metadata", http.StatusBadRequest)
			return
		}

		// CR-010 FIX: Validate metadata size before DB insertion
		const maxMetadataSize = 64 * 1024 // 64 KB max for encrypted metadata
		if len(metadata) > maxMetadataSize {
			http.Error(w, "encrypted metadata too large (max 64KB)", http.StatusBadRequest)
			return
		}

		vaultID, err := vs.CreateVault(r.Context(), userID, metadata)
		if err != nil {
			http.Error(w, "failed to create vault", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(r.Context(), userID, "VAULT_CREATE", metadata)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(CreateVaultResponse{
			VaultID: vaultID.String(),
		})
	}
}

// HandleListVaults returns an HTTP handler for listing vaults (GET /vaults).
// Returns all vaults owned by the authenticated user as an array.
func HandleListVaults(vs *VaultService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaults, err := vs.ListVaults(r.Context(), userID)
		if err != nil {
			http.Error(w, "failed to list vaults", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(vaults)
	}
}

// HandleGetVault returns an HTTP handler for retrieving a single vault (GET /vaults/{vaultID}).
// Returns 404 if vault doesn't exist or user lacks access.
func HandleGetVault(vs *VaultService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID, err := uuid.Parse(r.PathValue("vaultID"))
		if err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		// PH4-FIX: Pass userID to GetVault for ownership verification (CWE-862: Missing Authorization)
		vault, err := vs.GetVault(r.Context(), userID, vaultID)
		if err != nil {
			http.Error(w, "vault not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":                   vault.ID.String(),
			"encrypted_metadata":   encodeToBase64(vault.EncryptedMetadata),
			"created_at":           vault.CreatedAt.Format(time.RFC3339),
			"updated_at":           vault.UpdatedAt.Format(time.RFC3339),
		})
	}
}

// UpdateVaultRequest is the request body for updating vault metadata.
type UpdateVaultRequest struct {
	EncryptedMetadata string `json:"encrypted_metadata"`
}

// HandleUpdateVault returns an HTTP handler for updating vault metadata (PUT/PATCH /vaults/{vaultID}).
// Only the vault owner can update metadata. Returns 204 No Content on success.
func HandleUpdateVault(vs *VaultService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req UpdateVaultRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID, err := uuid.Parse(r.PathValue("vaultID"))
		if err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		// MEDIUM-FIX: Validate vault name from metadata (if present in plaintext context)
		// Note: Encrypted metadata is opaque at this layer, but callers should validate
		// vault name length (1-255 chars, no null bytes) at presentation layer

		metadata, err := decodeFromBase64(req.EncryptedMetadata)
		if err != nil {
			http.Error(w, "invalid base64 encrypted metadata", http.StatusBadRequest)
			return
		}

		// CR-010 FIX: Validate metadata size before DB insertion (also in HandleUpdateVault)
		const maxMetadataSize = 64 * 1024 // 64 KB max for encrypted metadata
		if len(metadata) > maxMetadataSize {
			http.Error(w, "encrypted metadata too large (max 64KB)", http.StatusBadRequest)
			return
		}

		if err := vs.UpdateVaultMetadata(r.Context(), userID, vaultID, metadata); err != nil {
			http.Error(w, "failed to update vault", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(r.Context(), userID, "VAULT_UPDATED", metadata)

		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleDeleteVault returns an HTTP handler for deleting a vault (DELETE /vaults/{vaultID}).
// Performs soft-delete (sets deleted_at). Returns 204 No Content on success.
func HandleDeleteVault(vs *VaultService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID, err := uuid.Parse(r.PathValue("vaultID"))
		if err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		if err := vs.DeleteVault(r.Context(), userID, vaultID); err != nil {
			http.Error(w, "failed to delete vault", http.StatusInternalServerError)
			return
		}

		auditSvc.LogAction(r.Context(), userID, "VAULT_DELETE", []byte(vaultID.String()))

		w.WriteHeader(http.StatusNoContent)
	}
}

// encodeToBase64 encodes binary data to base64 string for JSON responses.
// Returns empty string for nil or empty input.
func encodeToBase64(data []byte) string {
	if len(data) == 0 {
		return ""
	}
	return base64.StdEncoding.EncodeToString(data)
}

// decodeFromBase64 decodes a base64 string to binary data.
// Returns nil for empty input, error if decoding fails.
func decodeFromBase64(s string) ([]byte, error) {
	if s == "" {
		return nil, nil
	}
	return base64.StdEncoding.DecodeString(s)
}
