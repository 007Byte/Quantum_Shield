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
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
	"github.com/usbvault/usbvault-server/internal/database"
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
	repo database.VaultRepository
	// F3: optional per-tier limit enforcement. When nil, vault creation is
	// unrestricted (preserves prior behavior and keeps unit tests that construct
	// the service without a pool working).
	tierLimiter *TierLimiter
}

// NewVaultService creates a new vault service with the given vault repository.
func NewVaultService(repo database.VaultRepository) *VaultService {
	return &VaultService{repo: repo}
}

// SetTierLimiter installs the F3 server-side tier-limit enforcer. The limiter
// resolves the user's authoritative tier from trusted server state and enforces
// the per-tier MaxVaults cap on creation.
func (vs *VaultService) SetTierLimiter(tl *TierLimiter) {
	vs.tierLimiter = tl
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

	// F3: authoritative server-side tier enforcement. When a tier limiter is
	// configured we perform the cap check and the insert atomically inside one
	// transaction (under a per-user advisory lock) so concurrent creates cannot
	// race past MaxVaults (TOCTOU fix). When no limiter is configured (e.g. unit
	// tests with a mock repo), fall back to the plain repository insert.
	var vaultID string
	var err error
	if vs.tierLimiter != nil {
		vaultID, err = vs.tierLimiter.CreateVaultAtomic(ctx, userID, encryptedMetadata)
	} else {
		vaultID, err = vs.repo.CreateVault(ctx, userID, encryptedMetadata)
	}
	if err != nil {
		return uuid.Nil, err
	}

	// TD-3 FIX: Validate uuid.Parse return to catch corrupted IDs from the repository layer.
	parsedID, parseErr := uuid.Parse(vaultID)
	if parseErr != nil {
		return uuid.Nil, fmt.Errorf("repository returned invalid vault ID %q: %w", vaultID, parseErr)
	}
	return parsedID, nil
}

// ListVaults returns all non-deleted vaults owned by the user, in reverse creation order.
// Returns empty list if no vaults exist.
func (vs *VaultService) ListVaults(ctx context.Context, userID string) ([]VaultSummary, error) {
	records, err := vs.repo.ListVaults(ctx, userID)
	if err != nil {
		return nil, err
	}
	return vs.recordsToSummaries(records), nil
}

// M-5 FIX: ListVaultsPaginated returns a page of vaults using cursor-based pagination.
// cursor is the vault ID to start after (empty for first page).
// limit is the max number of results to return.
func (vs *VaultService) ListVaultsPaginated(ctx context.Context, userID, cursor string, limit int) ([]VaultSummary, error) {
	records, err := vs.repo.ListVaultsPaginated(ctx, userID, cursor, limit)
	if err != nil {
		return nil, err
	}
	return vs.recordsToSummaries(records), nil
}

func (vs *VaultService) recordsToSummaries(records []database.VaultRecord) []VaultSummary {
	var vaults []VaultSummary
	for _, record := range records {
		vaults = append(vaults, VaultSummary{
			ID:                record.ID,
			EncryptedMetadata: encodeToBase64(record.EncryptedMetadata),
			CreatedAt:         record.CreatedAt,
			UpdatedAt:         record.UpdatedAt,
		})
	}
	return vaults
}

// GetVault retrieves a vault by ID after verifying user is owner or member.
//
// PH4-FIX: Verify user is vault owner or member before returning vault data (CWE-862: Missing Authorization).
// Returns ErrVaultNotFound if vault doesn't exist or user lacks access.
func (vs *VaultService) GetVault(ctx context.Context, userID string, vaultID uuid.UUID) (*Vault, error) {
	record, err := vs.repo.GetVaultWithAccess(ctx, vaultID.String(), userID)
	if err != nil {
		return nil, err
	}

	ownerID, _ := uuid.Parse(record.OwnerID)
	createdAt, _ := time.Parse(time.RFC3339, record.CreatedAt)
	updatedAt, _ := time.Parse(time.RFC3339, record.UpdatedAt)

	vault := &Vault{
		ID:                vaultID,
		OwnerID:           ownerID,
		EncryptedMetadata: record.EncryptedMetadata,
		CreatedAt:         createdAt,
		UpdatedAt:         updatedAt,
	}

	return vault, nil
}

// UpdateVaultMetadata updates the encrypted metadata for a vault owned by the user.
// Only the owner can update vault metadata. Returns ErrVaultNotFound if vault doesn't exist.
func (vs *VaultService) UpdateVaultMetadata(ctx context.Context, userID string, vaultID uuid.UUID, encryptedMetadata []byte) error {
	return vs.repo.UpdateVaultByOwner(ctx, vaultID.String(), userID, encryptedMetadata)
}

// DeleteVault soft-deletes a vault (sets deleted_at timestamp) owned by the user.
// Soft deletes allow for vault recovery if needed. Only non-deleted vaults can be deleted.
// Returns ErrVaultNotFound if vault doesn't exist or is already deleted.
func (vs *VaultService) DeleteVault(ctx context.Context, userID string, vaultID uuid.UUID) error {
	return vs.repo.DeleteVaultByOwner(ctx, vaultID.String(), userID)
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
	return vs.repo.CheckRollback(ctx, vaultID.String(), newStateVersion)
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

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
			// F3: tier limit reached -> 402 Payment Required (upgrade needed).
			if errors.Is(err, ErrVaultLimitReached) {
				http.Error(w, "vault limit reached for your subscription tier; upgrade required", http.StatusPaymentRequired)
				return
			}
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

// M-5 FIX: Paginated vault list response with cursor for efficient large-collection traversal.
type PaginatedVaultResponse struct {
	Vaults     []VaultSummary `json:"vaults"`
	NextCursor string         `json:"next_cursor,omitempty"`
	HasMore    bool           `json:"has_more"`
}

// HandleListVaults returns an HTTP handler for listing vaults (GET /vaults).
// Supports cursor-based pagination via ?cursor=<id>&limit=<n> query params.
// Returns a paginated response with next_cursor for efficient traversal.
func HandleListVaults(vs *VaultService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// M-5 FIX: Parse pagination params
		cursor := r.URL.Query().Get("cursor")
		limitStr := r.URL.Query().Get("limit")
		limit := 50 // default page size
		if limitStr != "" {
			if parsed, err := fmt.Sscanf(limitStr, "%d", &limit); err != nil || parsed != 1 {
				limit = 50
			}
		}
		if limit < 1 {
			limit = 1
		}
		if limit > 200 {
			limit = 200
		}

		// Fetch limit+1 to determine if there are more pages
		vaults, err := vs.ListVaultsPaginated(r.Context(), userID, cursor, limit+1)
		if err != nil {
			http.Error(w, "failed to list vaults", http.StatusInternalServerError)
			return
		}

		hasMore := len(vaults) > limit
		if hasMore {
			vaults = vaults[:limit]
		}

		var nextCursor string
		if hasMore && len(vaults) > 0 {
			nextCursor = vaults[len(vaults)-1].ID
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(PaginatedVaultResponse{
			Vaults:     vaults,
			NextCursor: nextCursor,
			HasMore:    hasMore,
		})
	}
}

// HandleGetVault returns an HTTP handler for retrieving a single vault (GET /vaults/{vaultID}).
// Returns 404 if vault doesn't exist or user lacks access.
func HandleGetVault(vs *VaultService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
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

		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
		userID, ok := r.Context().Value(ctxkeys.UserID).(string)
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
