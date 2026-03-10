-- DE-017 FIX: Migration version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum TEXT
);

-- Record existing migrations
INSERT INTO schema_migrations (version, description) VALUES
    (1, 'initial schema'),
    (2, 'security events table'),
    (3, 'composite indexes'),
    (4, 'audit log archive')
ON CONFLICT (version) DO NOTHING;
