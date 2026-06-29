-- 022: Durable multipart upload state so resumable uploads survive server
-- restarts and work across replicas (previously in-memory only in
-- MultipartService.uploads). The authoritative S3 multipart upload already
-- survives in S3; this table lets the server rehydrate its tracking state.
CREATE TABLE IF NOT EXISTS multipart_uploads (
    upload_id     TEXT PRIMARY KEY,            -- S3 multipart UploadId
    bucket        TEXT NOT NULL,
    object_key    TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    vault_id      TEXT NOT NULL,
    file_id       TEXT NOT NULL,
    total_size    BIGINT NOT NULL,
    part_size     BIGINT NOT NULL,
    total_parts   INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress|completed|aborted
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL
);
-- IDOR scoping + cleanup query support
CREATE INDEX IF NOT EXISTS idx_multipart_uploads_user_vault ON multipart_uploads (user_id, vault_id);
CREATE INDEX IF NOT EXISTS idx_multipart_uploads_expiry ON multipart_uploads (status, expires_at);

CREATE TABLE IF NOT EXISTS multipart_upload_parts (
    upload_id    TEXT NOT NULL REFERENCES multipart_uploads(upload_id) ON DELETE CASCADE,
    part_number  INTEGER NOT NULL,
    etag         TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (upload_id, part_number)   -- upsert key: fixes duplicate-part bug on resume/retry
);
