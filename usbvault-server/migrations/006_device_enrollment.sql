-- Migration 006: Device enrollment and trust management
-- PHASE 2.1: Support for device fingerprinting and trust chains

CREATE TABLE IF NOT EXISTS device_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint BYTEA NOT NULL,
    device_public_key BYTEA NOT NULL,
    device_name VARCHAR(255),
    platform VARCHAR(64),
    enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_trusted BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, device_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_device_enrollments_user_id ON device_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_device_enrollments_fingerprint ON device_enrollments(device_fingerprint);
