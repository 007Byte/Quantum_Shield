-- Migration 008: Vault rollback protection
-- PHASE 2.1: Monotonic versioning to prevent state rollback attacks

ALTER TABLE vaults ADD COLUMN IF NOT EXISTS max_state_version BIGINT DEFAULT 0;
ALTER TABLE vaults ADD COLUMN IF NOT EXISTS state_nonce BYTEA;

CREATE INDEX IF NOT EXISTS idx_vaults_state_version ON vaults(max_state_version);

COMMENT ON COLUMN vaults.max_state_version IS 'Monotonic counter to prevent vault state rollback attacks';
COMMENT ON COLUMN vaults.state_nonce IS 'Random nonce associated with current state version';
