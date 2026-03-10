package storage

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/config"
)

// BlobLifecycleService manages blob expiry, soft delete, and cleanup
type BlobLifecycleService struct {
	s3Client *s3.Client
	pool     *pgxpool.Pool
	bucket   string
}

// DeletedBlobInfo represents a soft-deleted blob
type DeletedBlobInfo struct {
	ID        uuid.UUID `json:"id"`
	VaultID   uuid.UUID `json:"vault_id"`
	DeletedAt time.Time `json:"deleted_at"`
	SizeBytes int64     `json:"size_bytes"`
	DeletedBy string    `json:"deleted_by"`
}

// NewBlobLifecycleService creates a new blob lifecycle service
func NewBlobLifecycleService(s3Client *s3.Client, pool *pgxpool.Pool) *BlobLifecycleService {
	return &BlobLifecycleService{
		s3Client: s3Client,
		pool:     pool,
		bucket:   config.GetEnvOrDefault("S3_BUCKET", "qav-prod"),
	}
}

// SoftDeleteBlob marks a blob as deleted without removing from S3 (implements soft delete)
func (s *BlobLifecycleService) SoftDeleteBlob(ctx context.Context, vaultID, blobID uuid.UUID, userID string) error {
	result, err := s.pool.Exec(ctx,
		`UPDATE blobs
		 SET deleted_at = NOW(), deleted_by = $1
		 WHERE id = $2 AND vault_id = $3 AND deleted_at IS NULL`,
		userID, blobID, vaultID)

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID.String()).
			Str("blob_id", blobID.String()).
			Str("user_id", userID).
			Msg("failed to soft delete blob")
		return err
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("blob not found or already deleted")
	}

	log.Info().
		Str("vault_id", vaultID.String()).
		Str("blob_id", blobID.String()).
		Str("deleted_by", userID).
		Msg("blob soft deleted")

	return nil
}

// RestoreBlob un-deletes a soft-deleted blob within retention period
func (s *BlobLifecycleService) RestoreBlob(ctx context.Context, vaultID, blobID uuid.UUID) error {
	result, err := s.pool.Exec(ctx,
		`UPDATE blobs
		 SET deleted_at = NULL, deleted_by = NULL
		 WHERE id = $1 AND vault_id = $2 AND deleted_at IS NOT NULL`,
		blobID, vaultID)

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID.String()).
			Str("blob_id", blobID.String()).
			Msg("failed to restore blob")
		return err
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("blob not found or not deleted")
	}

	log.Info().
		Str("vault_id", vaultID.String()).
		Str("blob_id", blobID.String()).
		Msg("blob restored")

	return nil
}

// PermanentlyDeleteBlob removes a blob from both DB and S3 (irreversible)
func (s *BlobLifecycleService) PermanentlyDeleteBlob(ctx context.Context, vaultID, blobID uuid.UUID) error {
	// Start a transaction
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		log.Error().Err(err).Msg("failed to begin transaction")
		return err
	}
	defer tx.Rollback(ctx)

	// Delete from database
	result, err := tx.Exec(ctx,
		`DELETE FROM blobs WHERE id = $1 AND vault_id = $2`,
		blobID, vaultID)

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID.String()).
			Str("blob_id", blobID.String()).
			Msg("failed to delete blob from database")
		return err
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("blob not found")
	}

	// Delete from S3
	s3Key := "vaults/" + vaultID.String() + "/" + blobID.String()
	_, err = s.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(s3Key),
	})

	if err != nil {
		log.Error().Err(err).
			Str("s3_key", s3Key).
			Msg("failed to delete blob from S3")
		return err
	}

	// Commit transaction
	err = tx.Commit(ctx)
	if err != nil {
		log.Error().Err(err).Msg("failed to commit permanent delete transaction")
		return err
	}

	log.Info().
		Str("vault_id", vaultID.String()).
		Str("blob_id", blobID.String()).
		Str("s3_key", s3Key).
		Msg("blob permanently deleted from database and S3")

	return nil
}

// CleanupExpiredBlobs runs as a background job, deletes blobs past retention period
// SQ-006/SQ-010 FIX: Processes in configurable batches to control memory and transaction size
// SQ-007 FIX: Uses S3 batch delete (DeleteObjects) for efficiency
// SQ-008 FIX: S3 deletions happen outside the database transaction
// DE-009 FIX: Logs S3 failures for orphan cleanup reconciliation
func (s *BlobLifecycleService) CleanupExpiredBlobs(ctx context.Context, retentionDays int) (int, error) {
	// DV-012 FIX: Validate retentionDays parameter
	if retentionDays <= 0 {
		return 0, fmt.Errorf("retentionDays must be positive, got %d", retentionDays)
	}

	const batchSize = 100
	cutoffTime := time.Now().UTC().AddDate(0, 0, -retentionDays)
	totalDeleted := 0

	for {
		// Check context cancellation
		select {
		case <-ctx.Done():
			log.Warn().Int("deleted_so_far", totalDeleted).Msg("cleanup cancelled by context")
			return totalDeleted, ctx.Err()
		default:
		}

		// SQ-008 FIX: Query and delete from DB in a tight transaction, then clean S3 outside
		blobsToClean, dbDeleted, err := s.cleanupBatch(ctx, cutoffTime, batchSize)
		if err != nil {
			log.Error().Err(err).Int("deleted_so_far", totalDeleted).Msg("cleanup batch failed")
			return totalDeleted, err
		}

		totalDeleted += dbDeleted

		// SQ-007 FIX: Batch delete from S3 (outside DB transaction)
		if len(blobsToClean) > 0 {
			s.batchDeleteFromS3(ctx, blobsToClean)
		}

		// If we got fewer than batchSize, we're done
		if dbDeleted < batchSize {
			break
		}
	}

	log.Info().
		Int("deleted_count", totalDeleted).
		Time("cutoff_time", cutoffTime).
		Msg("SQ-006 FIX: batch cleanup expired blobs completed")

	return totalDeleted, nil
}

// cleanupBatch deletes one batch of expired blobs from the database
func (s *BlobLifecycleService) cleanupBatch(ctx context.Context, cutoffTime time.Time, batchSize int) ([]struct{ id, vaultID uuid.UUID }, int, error) {
	// SQ-008 FIX: Tight DB transaction - query + delete only
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to begin cleanup transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// SQ-009 FIX: Uses idx_blobs_deleted_at_asc index, with LIMIT for batch control
	rows, err := tx.Query(ctx,
		`SELECT id, vault_id FROM blobs
		 WHERE deleted_at IS NOT NULL AND deleted_at < $1
		 ORDER BY deleted_at ASC
		 LIMIT $2`,
		cutoffTime, batchSize)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query expired blobs: %w", err)
	}

	var blobIDs []uuid.UUID
	var blobsToClean []struct{ id, vaultID uuid.UUID }

	for rows.Next() {
		var id, vaultID uuid.UUID
		if err := rows.Scan(&id, &vaultID); err != nil {
			rows.Close()
			return nil, 0, fmt.Errorf("failed to scan blob row: %w", err)
		}
		blobIDs = append(blobIDs, id)
		blobsToClean = append(blobsToClean, struct{ id, vaultID uuid.UUID }{id, vaultID})
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("error iterating expired blobs: %w", err)
	}

	if len(blobIDs) == 0 {
		return nil, 0, nil
	}

	// Delete the batch from database
	result, err := tx.Exec(ctx,
		`DELETE FROM blobs WHERE id = ANY($1)`,
		blobIDs)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to delete expired blobs batch: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, 0, fmt.Errorf("failed to commit cleanup batch: %w", err)
	}

	return blobsToClean, int(result.RowsAffected()), nil
}

// batchDeleteFromS3 deletes blobs from S3 using batch delete for efficiency
// DE-009 FIX: Logs failures for orphan reconciliation instead of blocking
func (s *BlobLifecycleService) batchDeleteFromS3(ctx context.Context, blobs []struct{ id, vaultID uuid.UUID }) {
	// SQ-007 FIX: Build batch of S3 object identifiers
	objects := make([]s3types.ObjectIdentifier, 0, len(blobs))
	for _, blob := range blobs {
		s3Key := "vaults/" + blob.vaultID.String() + "/" + blob.id.String()
		objects = append(objects, s3types.ObjectIdentifier{
			Key: aws.String(s3Key),
		})
	}

	// S3 DeleteObjects supports up to 1000 objects per call
	_, err := s.s3Client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
		Bucket: aws.String(s.bucket),
		Delete: &s3types.Delete{
			Objects: objects,
			Quiet:   aws.Bool(true),
		},
	})

	if err != nil {
		// DE-009 FIX: Log S3 failures for orphan cleanup reconciliation
		// These blobs are already deleted from DB, so S3 objects are orphaned
		log.Warn().Err(err).
			Int("blob_count", len(blobs)).
			Msg("DE-009 FIX: S3 batch delete failed - orphaned objects need reconciliation")

		// Fall back to individual deletes for reliability
		for _, blob := range blobs {
			s3Key := "vaults/" + blob.vaultID.String() + "/" + blob.id.String()
			if _, err := s.s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
				Bucket: aws.String(s.bucket),
				Key:    aws.String(s3Key),
			}); err != nil {
				log.Warn().Err(err).Str("s3_key", s3Key).
					Msg("individual S3 delete failed during fallback")
			}
		}
	} else {
		log.Debug().Int("blob_count", len(blobs)).Msg("SQ-007 FIX: S3 batch delete succeeded")
	}
}

// SetBlobExpiry sets an auto-expiry time on a blob
func (s *BlobLifecycleService) SetBlobExpiry(ctx context.Context, vaultID, blobID uuid.UUID, expiresAt time.Time) error {
	// DV-015 FIX: Validate expiry is in the future
	if expiresAt.Before(time.Now()) {
		return fmt.Errorf("expiry time must be in the future")
	}

	result, err := s.pool.Exec(ctx,
		`UPDATE blobs
		 SET expires_at = $1
		 WHERE id = $2 AND vault_id = $3`,
		expiresAt, blobID, vaultID)

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID.String()).
			Str("blob_id", blobID.String()).
			Msg("failed to set blob expiry")
		return err
	}

	if result.RowsAffected() == 0 {
		return fmt.Errorf("blob not found")
	}

	log.Info().
		Str("vault_id", vaultID.String()).
		Str("blob_id", blobID.String()).
		Time("expires_at", expiresAt).
		Msg("blob expiry set")

	return nil
}

// ListDeletedBlobs returns soft-deleted blobs for a vault (trash view)
func (s *BlobLifecycleService) ListDeletedBlobs(ctx context.Context, vaultID uuid.UUID, limit, offset int) ([]DeletedBlobInfo, error) {
	// DV-013 FIX: Add pagination with sensible defaults
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, vault_id, deleted_at, COALESCE(size_bytes, 0), COALESCE(deleted_by, '')
		 FROM blobs
		 WHERE vault_id = $1 AND deleted_at IS NOT NULL
		 ORDER BY deleted_at DESC
		 LIMIT $2 OFFSET $3`,
		vaultID, limit, offset)

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID.String()).
			Msg("failed to list deleted blobs")
		return nil, err
	}
	defer rows.Close()

	var deletedBlobs []DeletedBlobInfo
	for rows.Next() {
		var info DeletedBlobInfo
		err := rows.Scan(
			&info.ID,
			&info.VaultID,
			&info.DeletedAt,
			&info.SizeBytes,
			&info.DeletedBy,
		)
		if err != nil {
			log.Error().Err(err).
				Str("vault_id", vaultID.String()).
				Msg("failed to scan deleted blob")
			return nil, err
		}
		deletedBlobs = append(deletedBlobs, info)
	}

	if err = rows.Err(); err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID.String()).
			Msg("error iterating deleted blobs")
		return nil, err
	}

	return deletedBlobs, nil
}

// BlobExistsInDatabase checks if a blob exists in the database (not soft-deleted)
func (s *BlobLifecycleService) BlobExistsInDatabase(ctx context.Context, vaultID, blobID uuid.UUID) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM blobs
			WHERE id = $1 AND vault_id = $2 AND deleted_at IS NULL
		)`,
		blobID, vaultID).Scan(&exists)

	// SQ-014 FIX: EXISTS always returns a row, so ErrNoRows is dead code
	if err != nil {
		log.Error().Err(err).
			Str("blob_id", blobID.String()).
			Str("vault_id", vaultID.String()).
			Msg("failed to check blob existence")
		return false, err
	}

	return exists, nil
}
