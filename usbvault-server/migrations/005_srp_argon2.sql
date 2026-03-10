-- Migration 005: Upgrade SRP verifier hashing from SHA-256 to Argon2id
-- PHASE 2.1: SRP Verifier hardening for offline attack resistance
-- This adds columns to track the verifier hash algorithm and Argon2 parameters

ALTER TABLE users ADD COLUMN IF NOT EXISTS srp_verifier_hash_algorithm VARCHAR(32) DEFAULT 'sha256';
ALTER TABLE users ADD COLUMN IF NOT EXISTS srp_argon2_params JSONB DEFAULT '{"memory": 65536, "time": 3, "parallelism": 4}';

-- Index for efficient lookup during migration
CREATE INDEX IF NOT EXISTS idx_users_srp_hash_algo ON users(srp_verifier_hash_algorithm);

-- Comments explaining the columns
COMMENT ON COLUMN users.srp_verifier_hash_algorithm IS 'Hash algorithm for SRP verifier: sha256 (legacy) or argon2id (current)';
COMMENT ON COLUMN users.srp_argon2_params IS 'Argon2id parameters for verifier hashing';
