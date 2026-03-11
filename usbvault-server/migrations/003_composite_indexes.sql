-- DE-001 FIX: Composite indexes for high-frequency query patterns
-- Note: CONCURRENTLY removed — cannot run inside a transaction (which the migrator uses).
CREATE INDEX IF NOT EXISTS idx_blobs_vault_deleted ON blobs (vault_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_shares_recipient_expires ON share_records (recipient_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_log (user_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_blobs_deleted_at_asc ON blobs (deleted_at ASC) WHERE deleted_at IS NOT NULL;
-- idx_security_events_user_timestamp moved to 012_security_events.sql (table created there)
CREATE INDEX IF NOT EXISTS idx_key_rotation_vault_status ON key_rotation_jobs (vault_id, status);
