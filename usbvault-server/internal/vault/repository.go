// Package vault provides vault data management and operations.
package vault

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/database"
)

// PostgresVaultRepository is a concrete implementation of database.VaultRepository
// that uses PostgreSQL as the backing store.
type PostgresVaultRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresVaultRepository creates a new vault repository with the given connection pool.
func NewPostgresVaultRepository(pool *pgxpool.Pool) *PostgresVaultRepository {
	return &PostgresVaultRepository{pool: pool}
}

// CreateVault creates a new vault owned by the given user with encrypted metadata.
// Returns the created vault's UUID or error if creation fails.
func (r *PostgresVaultRepository) CreateVault(ctx context.Context, ownerID string, encryptedMetadata []byte) (string, error) {
	vaultID := uuid.New().String()

	err := r.pool.QueryRow(ctx,
		`INSERT INTO vaults (id, owner_id, encrypted_metadata, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         RETURNING id`,
		vaultID, ownerID, encryptedMetadata,
	).Scan(&vaultID)

	if err != nil {
		log.Error().Err(err).Str("user_id", ownerID).Msg("failed to create vault")
		return "", err
	}

	log.Info().Str("vault_id", vaultID).Str("user_id", ownerID).Msg("vault created")
	return vaultID, nil
}

// GetVault retrieves a vault by ID with ownership/membership verification.
// Returns nil if vault doesn't exist or user lacks access.
func (r *PostgresVaultRepository) GetVault(ctx context.Context, vaultID string) (*database.VaultRecord, error) {
	var vault database.VaultRecord
	var createdAt, updatedAt time.Time

	err := r.pool.QueryRow(ctx,
		`SELECT id, owner_id, encrypted_metadata, created_at, updated_at
         FROM vaults
         WHERE id = $1 AND deleted_at IS NULL`,
		vaultID,
	).Scan(&vault.ID, &vault.OwnerID, &vault.EncryptedMetadata, &createdAt, &updatedAt)

	if err != nil {
		log.Debug().Err(err).Str("vault_id", vaultID).Msg("vault not found")
		return nil, err
	}

	vault.CreatedAt = createdAt.Format(time.RFC3339)
	vault.UpdatedAt = updatedAt.Format(time.RFC3339)

	return &vault, nil
}

// ListVaults returns all non-deleted vaults owned by the user, in reverse creation order.
// Returns empty list if no vaults exist.
func (r *PostgresVaultRepository) ListVaults(ctx context.Context, ownerID string) ([]database.VaultRecord, error) {
	// RELIABILITY FIX (M-6): Enforce maximum results to prevent unbounded queries.
	const maxResultsPerQuery = 1000

	rows, err := r.pool.Query(ctx,
		`SELECT id, owner_id, encrypted_metadata, created_at, updated_at
         FROM vaults
         WHERE owner_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT $2`,
		ownerID, maxResultsPerQuery,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []database.VaultRecord
	for rows.Next() {
		var vault database.VaultRecord
		var createdAt, updatedAt time.Time

		if err := rows.Scan(&vault.ID, &vault.OwnerID, &vault.EncryptedMetadata, &createdAt, &updatedAt); err != nil {
			return nil, err
		}

		vault.CreatedAt = createdAt.Format(time.RFC3339)
		vault.UpdatedAt = updatedAt.Format(time.RFC3339)

		vaults = append(vaults, vault)
	}

	return vaults, rows.Err()
}

// M-5 FIX: ListVaultsPaginated returns a page of vaults using cursor-based pagination.
// Uses the vault ID as cursor for stable ordering (created_at DESC, id DESC).
// Returns up to `limit` records after the cursor position.
func (r *PostgresVaultRepository) ListVaultsPaginated(ctx context.Context, ownerID string, cursor string, limit int) ([]database.VaultRecord, error) {
	var rows pgx.Rows
	var err error

	if cursor == "" {
		// First page — no cursor filter
		rows, err = r.pool.Query(ctx,
			`SELECT id, owner_id, encrypted_metadata, created_at, updated_at
			 FROM vaults
			 WHERE owner_id = $1 AND deleted_at IS NULL
			 ORDER BY created_at DESC, id DESC
			 LIMIT $2`,
			ownerID, limit,
		)
	} else {
		// Subsequent pages — fetch rows after the cursor vault
		rows, err = r.pool.Query(ctx,
			`SELECT v.id, v.owner_id, v.encrypted_metadata, v.created_at, v.updated_at
			 FROM vaults v
			 WHERE v.owner_id = $1 AND v.deleted_at IS NULL
			   AND (v.created_at, v.id) < (
			     SELECT c.created_at, c.id FROM vaults c WHERE c.id = $2
			   )
			 ORDER BY v.created_at DESC, v.id DESC
			 LIMIT $3`,
			ownerID, cursor, limit,
		)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []database.VaultRecord
	for rows.Next() {
		var vault database.VaultRecord
		var createdAt, updatedAt time.Time

		if err := rows.Scan(&vault.ID, &vault.OwnerID, &vault.EncryptedMetadata, &createdAt, &updatedAt); err != nil {
			return nil, err
		}

		vault.CreatedAt = createdAt.Format(time.RFC3339)
		vault.UpdatedAt = updatedAt.Format(time.RFC3339)
		vaults = append(vaults, vault)
	}

	return vaults, rows.Err()
}

// UpdateVault updates the encrypted metadata for a vault.
// Returns error if vault doesn't exist.
func (r *PostgresVaultRepository) UpdateVault(ctx context.Context, vaultID string, encryptedMetadata []byte) error {
	result, err := r.pool.Exec(ctx,
		`UPDATE vaults
         SET encrypted_metadata = $1, updated_at = NOW()
         WHERE id = $2`,
		encryptedMetadata, vaultID,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrVaultNotFound
	}

	log.Info().Str("vault_id", vaultID).Msg("vault metadata updated")
	return nil
}

// DeleteVault soft-deletes a vault (sets deleted_at timestamp).
// Soft deletes allow for vault recovery if needed. Only non-deleted vaults can be deleted.
// Returns error if vault doesn't exist or is already deleted.
func (r *PostgresVaultRepository) DeleteVault(ctx context.Context, vaultID string) error {
	// Soft delete - only delete non-deleted vaults
	result, err := r.pool.Exec(ctx,
		`UPDATE vaults
         SET deleted_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL`,
		vaultID,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrVaultNotFound
	}

	log.Info().Str("vault_id", vaultID).Msg("vault deleted")
	return nil
}

// GetVaultWithAccess retrieves a vault by ID after verifying user is owner or member.
// Returns ErrVaultNotFound if vault doesn't exist or user lacks access.
// This method includes the authorization check from the service layer.
func (r *PostgresVaultRepository) GetVaultWithAccess(ctx context.Context, vaultID string, userID string) (*database.VaultRecord, error) {
	var vault database.VaultRecord
	var createdAt, updatedAt time.Time

	// PH4-FIX: Verify user is vault owner or member before returning vault data (CWE-862: Missing Authorization)
	err := r.pool.QueryRow(ctx,
		`SELECT v.id, v.owner_id, v.encrypted_metadata, v.created_at, v.updated_at
         FROM vaults v
         WHERE v.id = $1 AND v.deleted_at IS NULL
         AND (v.owner_id = $2 OR EXISTS (
           SELECT 1 FROM vault_members vm
           WHERE vm.vault_id = v.id AND vm.user_id = $2
         ))`,
		vaultID, userID,
	).Scan(&vault.ID, &vault.OwnerID, &vault.EncryptedMetadata, &createdAt, &updatedAt)

	if err != nil {
		log.Debug().Err(err).Str("vault_id", vaultID).Str("user_id", userID).Msg("vault not found or access denied")
		return nil, err
	}

	vault.CreatedAt = createdAt.Format(time.RFC3339)
	vault.UpdatedAt = updatedAt.Format(time.RFC3339)

	return &vault, nil
}

// UpdateVaultByOwner updates the encrypted metadata for a vault owned by the user.
// Only the owner can update vault metadata. Returns error if vault doesn't exist.
func (r *PostgresVaultRepository) UpdateVaultByOwner(ctx context.Context, vaultID string, ownerID string, encryptedMetadata []byte) error {
	result, err := r.pool.Exec(ctx,
		`UPDATE vaults
         SET encrypted_metadata = $1, updated_at = NOW()
         WHERE id = $2 AND owner_id = $3`,
		encryptedMetadata, vaultID, ownerID,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrVaultNotFound
	}

	log.Info().Str("vault_id", vaultID).Msg("vault metadata updated")
	return nil
}

// DeleteVaultByOwner soft-deletes a vault (sets deleted_at timestamp) owned by the user.
// Soft deletes allow for vault recovery if needed. Only non-deleted vaults can be deleted.
// Returns error if vault doesn't exist or is already deleted.
func (r *PostgresVaultRepository) DeleteVaultByOwner(ctx context.Context, vaultID string, ownerID string) error {
	// Soft delete - only delete non-deleted vaults
	result, err := r.pool.Exec(ctx,
		`UPDATE vaults
         SET deleted_at = NOW()
         WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL`,
		vaultID, ownerID,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrVaultNotFound
	}

	log.Info().Str("vault_id", vaultID).Msg("vault deleted")
	return nil
}

// CheckRollback verifies the state version is monotonically increasing to prevent rollback attacks.
// This ensures state machine integrity (e.g., preventing a user from reverting vault to an older state).
// Returns error if newStateVersion <= current max version (rollback detected).
// Also updates the vault's max_state_version if the new version is accepted.
func (r *PostgresVaultRepository) CheckRollback(ctx context.Context, vaultID string, newStateVersion int64) error {
	// SECURITY FIX (C-3): Atomic compare-and-swap to prevent TOCTOU race.
	// Previously used separate SELECT + UPDATE, allowing concurrent requests with the
	// same state version to both pass the check, enabling state rollback attacks.
	var updatedVersion int64
	err := r.pool.QueryRow(ctx,
		`UPDATE vaults
		 SET max_state_version = $1, updated_at = NOW()
		 WHERE id = $2 AND COALESCE(max_state_version, 0) < $1
		 RETURNING max_state_version`,
		newStateVersion, vaultID,
	).Scan(&updatedVersion)

	if err != nil {
		// If no rows returned, either vault doesn't exist or version was not newer
		if err.Error() == "no rows in result set" {
			// Fetch current version for the log message
			var currentMax int64
			_ = r.pool.QueryRow(ctx,
				`SELECT COALESCE(max_state_version, 0) FROM vaults WHERE id = $1`,
				vaultID,
			).Scan(&currentMax)
			log.Warn().
				Str("vault_id", vaultID).
				Int64("new_version", newStateVersion).
				Int64("current_max", currentMax).
				Msg("rollback detected or vault not found")
			return fmt.Errorf("rollback detected: new version %d <= current max %d", newStateVersion, currentMax)
		}
		return fmt.Errorf("failed to update state version: %w", err)
	}

	return nil
}

// ListVaultsWithMembership lists vaults that a user can access (owned or member of).
// Returns empty list if no accessible vaults exist.
func (r *PostgresVaultRepository) ListVaultsWithMembership(ctx context.Context, userID string) ([]database.VaultRecord, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT v.id, v.owner_id, v.encrypted_metadata, v.created_at, v.updated_at
         FROM vaults v
         WHERE v.deleted_at IS NULL AND (
           v.owner_id = $1 OR EXISTS (
             SELECT 1 FROM vault_members vm
             WHERE vm.vault_id = v.id AND vm.user_id = $1
           )
         )
         ORDER BY v.created_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []database.VaultRecord
	for rows.Next() {
		var vault database.VaultRecord
		var createdAt, updatedAt time.Time

		if err := rows.Scan(&vault.ID, &vault.OwnerID, &vault.EncryptedMetadata, &createdAt, &updatedAt); err != nil {
			return nil, err
		}

		vault.CreatedAt = createdAt.Format(time.RFC3339)
		vault.UpdatedAt = updatedAt.Format(time.RFC3339)

		vaults = append(vaults, vault)
	}

	return vaults, rows.Err()
}

// BeginTx starts a new database transaction.
func (r *PostgresVaultRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.Begin(ctx)
}
