package storage

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// multipartStore is the durable source of truth for multipart upload tracking
// state. MultipartService uses it as a write-through backing store behind its
// in-memory map so that resumable uploads survive server restarts and work
// across replicas. When a MultipartService has a nil store it operates purely
// in-memory (preserves the prior behavior and the struct-literal unit tests).
//
// SECURITY: the store is keyed by the S3 uploadID only; cross-tenant
// authorization (UserID/VaultID match) is enforced by the caller in
// MultipartService.loadUpload, which returns the same ErrUploadNotFound for
// both "absent" and "not yours" to avoid cross-tenant enumeration.
type multipartStore interface {
	// Insert persists a newly initiated upload (without parts).
	Insert(ctx context.Context, u *MultipartUpload) error
	// Get returns the upload including its recorded parts, or (nil, nil) when
	// the uploadID is absent.
	Get(ctx context.Context, uploadID string) (*MultipartUpload, error)
	// UpsertPart records (or replaces) a completed part keyed by
	// (upload_id, part_number) — fixes the duplicate-part bug on resume/retry.
	UpsertPart(ctx context.Context, uploadID string, p CompletedPart) error
	// SetStatus updates the upload status (in_progress|completed|aborted).
	SetStatus(ctx context.Context, uploadID, status string) error
	// Delete removes the upload and (via ON DELETE CASCADE) its parts.
	Delete(ctx context.Context, uploadID string) error
	// ListExpired returns in_progress uploads whose expires_at is before now.
	ListExpired(ctx context.Context, now time.Time) ([]*MultipartUpload, error)
}

// pgMultipartStore is the Postgres-backed implementation of multipartStore.
type pgMultipartStore struct {
	pool *pgxpool.Pool
}

// newPgMultipartStore constructs a Postgres-backed multipart store.
func newPgMultipartStore(pool *pgxpool.Pool) *pgMultipartStore {
	return &pgMultipartStore{pool: pool}
}

// Insert persists a newly initiated multipart upload row. Parts are recorded
// separately via UpsertPart as they complete.
func (s *pgMultipartStore) Insert(ctx context.Context, u *MultipartUpload) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO multipart_uploads (
			upload_id, bucket, object_key, user_id, vault_id, file_id,
			total_size, part_size, total_parts, status,
			created_at, updated_at, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
	`,
		u.UploadID, u.Bucket, u.Key, u.UserID, u.VaultID, u.FileID,
		u.TotalSize, u.PartSize, u.TotalParts, u.Status,
		u.CreatedAt, u.UpdatedAt, u.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("multipart store: insert upload: %w", err)
	}
	return nil
}

// Get loads an upload and its recorded parts (ordered ascending by part number).
// Returns (nil, nil) when the upload does not exist.
func (s *pgMultipartStore) Get(ctx context.Context, uploadID string) (*MultipartUpload, error) {
	u := &MultipartUpload{CompleteParts: make([]CompletedPart, 0)}
	err := s.pool.QueryRow(ctx, `
		SELECT upload_id, bucket, object_key, user_id, vault_id, file_id,
		       total_size, part_size, total_parts, status,
		       created_at, updated_at, expires_at
		FROM multipart_uploads
		WHERE upload_id = $1
	`, uploadID).Scan(
		&u.UploadID, &u.Bucket, &u.Key, &u.UserID, &u.VaultID, &u.FileID,
		&u.TotalSize, &u.PartSize, &u.TotalParts, &u.Status,
		&u.CreatedAt, &u.UpdatedAt, &u.ExpiresAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("multipart store: get upload: %w", err)
	}

	rows, err := s.pool.Query(ctx, `
		SELECT part_number, etag, size_bytes
		FROM multipart_upload_parts
		WHERE upload_id = $1
		ORDER BY part_number
	`, uploadID)
	if err != nil {
		return nil, fmt.Errorf("multipart store: get parts: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var p CompletedPart
		if err := rows.Scan(&p.PartNumber, &p.ETag, &p.Size); err != nil {
			return nil, fmt.Errorf("multipart store: scan part: %w", err)
		}
		u.CompleteParts = append(u.CompleteParts, p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("multipart store: iterate parts: %w", err)
	}
	return u, nil
}

// UpsertPart records a completed part, replacing any prior entry for the same
// (upload_id, part_number). This is the durable counterpart to the in-memory
// upsert and fixes the duplicate-part S3 rejection on resume/retry. It also
// bumps the parent upload's updated_at so expiry/activity tracking stays fresh.
func (s *pgMultipartStore) UpsertPart(ctx context.Context, uploadID string, p CompletedPart) error {
	if _, err := s.pool.Exec(ctx, `
		INSERT INTO multipart_upload_parts (upload_id, part_number, etag, size_bytes, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (upload_id, part_number)
		DO UPDATE SET etag = EXCLUDED.etag, size_bytes = EXCLUDED.size_bytes, updated_at = NOW()
	`, uploadID, p.PartNumber, p.ETag, p.Size); err != nil {
		return fmt.Errorf("multipart store: upsert part: %w", err)
	}
	if _, err := s.pool.Exec(ctx, `
		UPDATE multipart_uploads SET updated_at = NOW() WHERE upload_id = $1
	`, uploadID); err != nil {
		return fmt.Errorf("multipart store: touch upload: %w", err)
	}
	return nil
}

// SetStatus updates the upload status.
func (s *pgMultipartStore) SetStatus(ctx context.Context, uploadID, status string) error {
	if _, err := s.pool.Exec(ctx, `
		UPDATE multipart_uploads SET status = $2, updated_at = NOW() WHERE upload_id = $1
	`, uploadID, status); err != nil {
		return fmt.Errorf("multipart store: set status: %w", err)
	}
	return nil
}

// Delete removes the upload row; ON DELETE CASCADE removes its parts.
func (s *pgMultipartStore) Delete(ctx context.Context, uploadID string) error {
	if _, err := s.pool.Exec(ctx, `
		DELETE FROM multipart_uploads WHERE upload_id = $1
	`, uploadID); err != nil {
		return fmt.Errorf("multipart store: delete upload: %w", err)
	}
	return nil
}

// ListExpired returns in_progress uploads whose expires_at is before now, so a
// replica that did not initiate the upload can still abort it on cleanup.
func (s *pgMultipartStore) ListExpired(ctx context.Context, now time.Time) ([]*MultipartUpload, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT upload_id, bucket, object_key, user_id, vault_id, file_id,
		       total_size, part_size, total_parts, status,
		       created_at, updated_at, expires_at
		FROM multipart_uploads
		WHERE status = 'in_progress' AND expires_at < $1
	`, now)
	if err != nil {
		return nil, fmt.Errorf("multipart store: list expired: %w", err)
	}
	defer rows.Close()

	var out []*MultipartUpload
	for rows.Next() {
		u := &MultipartUpload{CompleteParts: make([]CompletedPart, 0)}
		if err := rows.Scan(
			&u.UploadID, &u.Bucket, &u.Key, &u.UserID, &u.VaultID, &u.FileID,
			&u.TotalSize, &u.PartSize, &u.TotalParts, &u.Status,
			&u.CreatedAt, &u.UpdatedAt, &u.ExpiresAt,
		); err != nil {
			return nil, fmt.Errorf("multipart store: scan expired: %w", err)
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("multipart store: iterate expired: %w", err)
	}
	return out, nil
}
