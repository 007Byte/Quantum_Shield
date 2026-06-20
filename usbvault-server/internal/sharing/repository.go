// Package sharing provides secure file sharing with encrypted key exchange.
package sharing

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

// PostgresSharingRepository is a concrete implementation of database.ShareRepository
// that uses PostgreSQL as the backing store.
type PostgresSharingRepository struct {
	pool *pgxpool.Pool
}

// NewPostgresSharingRepository creates a new sharing repository with the given connection pool.
func NewPostgresSharingRepository(pool *pgxpool.Pool) *PostgresSharingRepository {
	return &PostgresSharingRepository{pool: pool}
}

// CreateShare creates a new share record with a 30-day expiration by default.
func (r *PostgresSharingRepository) CreateShare(ctx context.Context, senderID, recipientID, blobID string, encryptedKey []byte) (string, error) {
	shareID := uuid.New().String()
	expiresAt := time.Now().Add(shareDefaultTTL)

	err := r.pool.QueryRow(ctx,
		`INSERT INTO share_records (id, sender_id, recipient_id, blob_id, encrypted_key, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)
         RETURNING id`,
		shareID, senderID, recipientID, blobID, encryptedKey, expiresAt,
	).Scan(&shareID)

	if err != nil {
		log.Error().Err(err).Str("sender_id", senderID).Msg("failed to create share")
		return "", err
	}

	log.Info().Str("share_id", shareID).Str("sender_id", senderID).Str("recipient_id", recipientID).Msg("share created")
	return shareID, nil
}

// ListReceivedShares lists all shares received by a user that haven't expired.
func (r *PostgresSharingRepository) ListReceivedShares(ctx context.Context, recipientID string) ([]database.ShareRecord, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, sender_id, recipient_id, blob_id, created_at, expires_at
         FROM share_records
         WHERE recipient_id = $1 AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC`,
		recipientID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shares []database.ShareRecord
	for rows.Next() {
		var s database.ShareRecord
		var createdAt time.Time
		var expiresAt *time.Time

		if err := rows.Scan(&s.ID, &s.SenderID, &s.RecipientID, &s.BlobID, &createdAt, &expiresAt); err != nil {
			return nil, err
		}

		s.CreatedAt = createdAt.Format(time.RFC3339)
		if expiresAt != nil {
			expiresAtStr := expiresAt.Format(time.RFC3339)
			s.ExpiresAt = &expiresAtStr
		}

		shares = append(shares, s)
	}

	return shares, rows.Err()
}

// ListSentShares lists all shares sent by a user.
func (r *PostgresSharingRepository) ListSentShares(ctx context.Context, senderID string) ([]database.ShareRecord, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, sender_id, recipient_id, blob_id, created_at, expires_at
         FROM share_records
         WHERE sender_id = $1
         ORDER BY created_at DESC`,
		senderID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var shares []database.ShareRecord
	for rows.Next() {
		var s database.ShareRecord
		var createdAt time.Time
		var expiresAt *time.Time

		if err := rows.Scan(&s.ID, &s.SenderID, &s.RecipientID, &s.BlobID, &createdAt, &expiresAt); err != nil {
			return nil, err
		}

		s.CreatedAt = createdAt.Format(time.RFC3339)
		if expiresAt != nil {
			expiresAtStr := expiresAt.Format(time.RFC3339)
			s.ExpiresAt = &expiresAtStr
		}

		shares = append(shares, s)
	}

	return shares, rows.Err()
}

// RevokeShare revokes a share record (only the sender can revoke).
// Returns error if the share does not exist or sender is not the owner.
func (r *PostgresSharingRepository) RevokeShare(ctx context.Context, senderID, shareID string) error {
	result, err := r.pool.Exec(ctx,
		`DELETE FROM share_records WHERE id = $1 AND sender_id = $2`,
		shareID, senderID,
	)

	if err != nil {
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrShareNotFound
	}

	log.Info().Str("share_id", shareID).Msg("share revoked")
	return nil
}

// GetPublicKey retrieves a user's public key for encrypting shares to them.
// Returns the most recently created public key for the user.
func (r *PostgresSharingRepository) GetPublicKey(ctx context.Context, userID string) ([]byte, error) {
	var publicKey []byte

	err := r.pool.QueryRow(ctx,
		`SELECT public_key_bytes FROM public_keys WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
		userID,
	).Scan(&publicKey)

	if err != nil {
		log.Debug().Err(err).Str("user_id", userID).Msg("public key not found")
		return nil, err
	}

	return publicKey, nil
}

// PublishPublicKey stores a user's public key for encryption.
// Validates that the key is exactly 32 bytes (X25519 standard) and not all zeros/ones.
func (r *PostgresSharingRepository) PublishPublicKey(ctx context.Context, userID string, publicKeyBytes []byte) error {
	// PH5-FIX: Validate key is exactly 32 bytes (X25519 public key size)
	if len(publicKeyBytes) != 32 {
		return fmt.Errorf("invalid public key size: expected 32 bytes, got %d", len(publicKeyBytes))
	}

	// PH5-FIX: Validate key is not all zeros or all 0xFF
	allZeros := true
	allOnes := true
	for _, b := range publicKeyBytes {
		if b != 0 {
			allZeros = false
		}
		if b != 0xFF {
			allOnes = false
		}
	}

	if allZeros {
		return fmt.Errorf("public key is all zeros (invalid)")
	}
	if allOnes {
		return fmt.Errorf("public key is all ones (invalid)")
	}

	// PH5-FIX: Insert into public_keys table
	err := r.pool.QueryRow(ctx,
		`INSERT INTO public_keys (user_id, key_type, public_key_bytes, created_at)
		 VALUES ($1, $2, $3, NOW())
		 RETURNING user_id`,
		userID, "x25519", publicKeyBytes,
	).Scan(&userID)

	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to publish public key")
		return err
	}

	log.Info().Str("user_id", userID).Msg("public key published")
	return nil
}

// AcceptShare marks a share as accepted by the recipient.
// Only the recipient can accept a share.
func (r *PostgresSharingRepository) AcceptShare(ctx context.Context, recipientID, shareID string) error {
	result, err := r.pool.Exec(ctx,
		`UPDATE share_records SET accepted_at = NOW() WHERE id = $1 AND recipient_id = $2`,
		shareID, recipientID,
	)

	if err != nil {
		log.Error().Err(err).Str("share_id", shareID).Str("recipient_id", recipientID).Msg("failed to accept share")
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrShareNotFound
	}

	log.Info().Str("share_id", shareID).Str("recipient_id", recipientID).Msg("share accepted")
	return nil
}

// RejectShare deletes a share record or marks it as rejected.
// Only the recipient can reject a share.
func (r *PostgresSharingRepository) RejectShare(ctx context.Context, recipientID, shareID string) error {
	result, err := r.pool.Exec(ctx,
		`DELETE FROM share_records WHERE id = $1 AND recipient_id = $2`,
		shareID, recipientID,
	)

	if err != nil {
		log.Error().Err(err).Str("share_id", shareID).Str("recipient_id", recipientID).Msg("failed to reject share")
		return err
	}

	if result.RowsAffected() == 0 {
		return ErrShareNotFound
	}

	log.Info().Str("share_id", shareID).Str("recipient_id", recipientID).Msg("share rejected")
	return nil
}

// BeginTx starts a new database transaction.
func (r *PostgresSharingRepository) BeginTx(ctx context.Context) (pgx.Tx, error) {
	return r.pool.Begin(ctx)
}
