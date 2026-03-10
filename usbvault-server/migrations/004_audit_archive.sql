-- DE-002 FIX: Audit log archive table for retention management
CREATE TABLE IF NOT EXISTS audit_log_archive (
    id BIGINT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    encrypted_detail BYTEA,
    timestamp TIMESTAMPTZ NOT NULL,
    prev_hash BYTEA,
    hash BYTEA NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_archive_timestamp ON audit_log_archive (timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_archive_user ON audit_log_archive (user_id, timestamp);

-- Partition hint for future partitioning:
-- ALTER TABLE audit_log RENAME TO audit_log_old;
-- CREATE TABLE audit_log (...) PARTITION BY RANGE (timestamp);
-- CREATE TABLE audit_log_y2026_q1 PARTITION OF audit_log FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
