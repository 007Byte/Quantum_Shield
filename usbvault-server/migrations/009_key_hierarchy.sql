-- Migration 009: Key hierarchy support for vault encryption
-- PH1-FIX: Dedicated columns for wrappedMek/kekSalt server-side storage

ALTER TABLE vaults ADD COLUMN IF NOT EXISTS wrapped_mek BYTEA;
ALTER TABLE vaults ADD COLUMN IF NOT EXISTS kek_salt BYTEA;
ALTER TABLE vaults ADD COLUMN IF NOT EXISTS key_version INTEGER DEFAULT 1;
ALTER TABLE vaults ADD COLUMN IF NOT EXISTS key_rotated_at TIMESTAMP WITH TIME ZONE;

-- Index for key rotation queries
CREATE INDEX IF NOT EXISTS idx_vaults_key_version ON vaults(key_version) WHERE deleted_at IS NULL;

COMMENT ON COLUMN vaults.wrapped_mek IS 'XChaCha20-Poly1305 wrapped Master Encryption Key (MEK)';
COMMENT ON COLUMN vaults.kek_salt IS '32-byte Argon2id salt for Key Encryption Key (KEK) derivation';
COMMENT ON COLUMN vaults.key_version IS 'Monotonic key version counter for rotation tracking';
COMMENT ON COLUMN vaults.key_rotated_at IS 'Timestamp of last successful key rotation';

-- Table for tracking key rotation jobs
CREATE TABLE IF NOT EXISTS key_rotation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_files INTEGER DEFAULT 0,
    processed_files INTEGER DEFAULT 0,
    failed_files INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back'))
);

CREATE INDEX IF NOT EXISTS idx_key_rotation_jobs_vault ON key_rotation_jobs(vault_id, status);
CREATE INDEX IF NOT EXISTS idx_key_rotation_jobs_user ON key_rotation_jobs(user_id, created_at DESC);

COMMENT ON TABLE key_rotation_jobs IS 'Tracks key rotation job progress and status';
COMMENT ON COLUMN key_rotation_jobs.status IS 'Job status: pending, in_progress, completed, failed, rolled_back';
COMMENT ON COLUMN key_rotation_jobs.processed_files IS 'Number of files successfully re-encrypted during rotation';
COMMENT ON COLUMN key_rotation_jobs.failed_files IS 'Number of files that failed re-encryption';
