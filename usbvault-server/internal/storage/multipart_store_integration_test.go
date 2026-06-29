//go:build integration
// +build integration

package storage

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/usbvault/usbvault-server/internal/testutil"
)

// setupMultipartTestDB connects to the integration database and provisions the
// multipart_uploads / multipart_upload_parts tables from migration 022 so the
// DB-backed store can be exercised end-to-end.
func setupMultipartTestDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)

	pool, err := pgxpool.New(ctx, testutil.IntegrationDSN())
	require.NoError(t, err, "failed to connect to test database")
	t.Cleanup(pool.Close)

	_, err = pool.Exec(ctx, `
		DROP TABLE IF EXISTS multipart_upload_parts CASCADE;
		DROP TABLE IF EXISTS multipart_uploads CASCADE;
		CREATE TABLE multipart_uploads (
			upload_id     TEXT PRIMARY KEY,
			bucket        TEXT NOT NULL,
			object_key    TEXT NOT NULL,
			user_id       TEXT NOT NULL,
			vault_id      TEXT NOT NULL,
			file_id       TEXT NOT NULL,
			total_size    BIGINT NOT NULL,
			part_size     BIGINT NOT NULL,
			total_parts   INTEGER NOT NULL,
			status        TEXT NOT NULL DEFAULT 'in_progress',
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			expires_at    TIMESTAMPTZ NOT NULL
		);
		CREATE INDEX idx_multipart_uploads_user_vault ON multipart_uploads (user_id, vault_id);
		CREATE INDEX idx_multipart_uploads_expiry ON multipart_uploads (status, expires_at);
		CREATE TABLE multipart_upload_parts (
			upload_id    TEXT NOT NULL REFERENCES multipart_uploads(upload_id) ON DELETE CASCADE,
			part_number  INTEGER NOT NULL,
			etag         TEXT NOT NULL,
			size_bytes   BIGINT NOT NULL,
			updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (upload_id, part_number)
		);
	`)
	require.NoError(t, err, "failed to provision multipart tables")
	return pool, ctx
}

func newTestUpload(uploadID string) *MultipartUpload {
	now := time.Now()
	return &MultipartUpload{
		UploadID:      uploadID,
		Bucket:        "test-bucket",
		Key:           "vaults/v1/files/f1",
		UserID:        "u1",
		VaultID:       "v1",
		FileID:        "f1",
		TotalSize:     200,
		PartSize:      DefaultPartSize,
		TotalParts:    1,
		CompleteParts: make([]CompletedPart, 0),
		Status:        "in_progress",
		CreatedAt:     now,
		UpdatedAt:     now,
		ExpiresAt:     now.Add(UploadExpiryTTL),
	}
}

// TestMultipartStore_InsertGetRehydrate is the core resume-across-restart proof:
// an upload + its parts are persisted, then a FRESH MultipartService (empty
// in-memory map, same pool) rehydrates the upload from the DB on lookup.
// UpsertPart of the same part number twice must yield exactly one part row.
func TestMultipartStore_InsertGetRehydrate(t *testing.T) {
	pool, ctx := setupMultipartTestDB(t)
	store := newPgMultipartStore(pool)

	u := newTestUpload("upload-rehydrate")
	require.NoError(t, store.Insert(ctx, u))

	require.NoError(t, store.UpsertPart(ctx, u.UploadID, CompletedPart{PartNumber: 1, ETag: "etag-old", Size: 100}))
	// Re-record the same part number (resume/retry): must replace, not duplicate.
	require.NoError(t, store.UpsertPart(ctx, u.UploadID, CompletedPart{PartNumber: 1, ETag: "etag-new", Size: 200}))

	got, err := store.Get(ctx, u.UploadID)
	require.NoError(t, err)
	require.NotNil(t, got)
	require.Equal(t, "u1", got.UserID)
	require.Equal(t, "v1", got.VaultID)
	require.Len(t, got.CompleteParts, 1, "duplicate part number must upsert to a single row")
	require.Equal(t, "etag-new", got.CompleteParts[0].ETag)
	require.Equal(t, int64(200), got.CompleteParts[0].Size)

	// Simulate a server restart: a brand new service with an EMPTY map but the
	// same durable store must serve progress by rehydrating from the DB.
	restarted := &MultipartService{
		uploads: make(map[string]*MultipartUpload),
		store:   store,
	}
	prog, err := restarted.GetUploadProgress(ctx, "u1", "v1", u.UploadID)
	require.NoError(t, err, "fresh service must rehydrate the upload from the store")
	require.Equal(t, u.UploadID, prog.UploadID)
	require.Len(t, prog.CompleteParts, 1)
	// And it must now be cached in memory.
	_, cached := restarted.uploads[u.UploadID]
	require.True(t, cached, "rehydrated upload should be repopulated into the cache")

	// IDOR: a different tenant must get the same ErrUploadNotFound, never the row.
	_, err = restarted.GetUploadProgress(ctx, "attacker", "v1", u.UploadID)
	require.ErrorIs(t, err, ErrUploadNotFound)
}

// TestMultipartStore_ListExpired verifies only in_progress + past-expiry rows are
// returned, and that Delete cascades to the child parts.
func TestMultipartStore_ListExpired(t *testing.T) {
	pool, ctx := setupMultipartTestDB(t)
	store := newPgMultipartStore(pool)

	expired := newTestUpload("upload-expired")
	expired.ExpiresAt = time.Now().Add(-time.Hour)
	require.NoError(t, store.Insert(ctx, expired))

	fresh := newTestUpload("upload-fresh")
	fresh.ExpiresAt = time.Now().Add(time.Hour)
	require.NoError(t, store.Insert(ctx, fresh))

	done := newTestUpload("upload-completed")
	done.ExpiresAt = time.Now().Add(-time.Hour)
	require.NoError(t, store.Insert(ctx, done))
	require.NoError(t, store.SetStatus(ctx, done.UploadID, "completed"))

	list, err := store.ListExpired(ctx, time.Now())
	require.NoError(t, err)
	require.Len(t, list, 1, "only the in_progress past-expiry upload should be listed")
	require.Equal(t, "upload-expired", list[0].UploadID)
}

// TestMultipartStore_Delete verifies Delete removes the upload and cascades its
// parts (Get returns nil afterward).
func TestMultipartStore_Delete(t *testing.T) {
	pool, ctx := setupMultipartTestDB(t)
	store := newPgMultipartStore(pool)

	u := newTestUpload("upload-delete")
	require.NoError(t, store.Insert(ctx, u))
	require.NoError(t, store.UpsertPart(ctx, u.UploadID, CompletedPart{PartNumber: 1, ETag: "e", Size: 10}))

	require.NoError(t, store.Delete(ctx, u.UploadID))

	got, err := store.Get(ctx, u.UploadID)
	require.NoError(t, err)
	require.Nil(t, got, "deleted upload must be absent")

	var partCount int
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM multipart_upload_parts WHERE upload_id = $1`, u.UploadID).Scan(&partCount))
	require.Equal(t, 0, partCount, "ON DELETE CASCADE must remove child parts")
}
