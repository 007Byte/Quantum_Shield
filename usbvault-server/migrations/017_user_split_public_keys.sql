-- Migration 017: Split per-user public keys (X25519 + Ed25519)
--
-- Registration (internal/auth/register.go) inserts two distinct 32-byte public
-- keys per user: an X25519 key (key agreement / sharing) and an Ed25519 key
-- (signature verification). The original users table (migration 001) only had a
-- single generic `public_key BYTEA` column, so the registration INSERT failed at
-- runtime with `column "public_key_x25519" of relation "users" does not exist`
-- (SQLSTATE 42703) — the register/login flow had no schema to run against, which
-- is why the full-stack integration suite could never pass. These columns add it.
--
-- Both are stored as raw 32-byte values (register.go base64-decodes the request
-- and rejects anything that is not exactly 32 bytes). Nullable on purpose: any
-- pre-existing rows predate the split-key flow and carry only the legacy
-- `public_key`; every new registration sets both. Idempotent so re-running the
-- migration set is safe.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS public_key_x25519 BYTEA;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS public_key_ed25519 BYTEA;

COMMENT ON COLUMN users.public_key_x25519 IS 'Raw 32-byte X25519 public key (key agreement / sharing), set at registration.';
COMMENT ON COLUMN users.public_key_ed25519 IS 'Raw 32-byte Ed25519 public key (signature verification), set at registration.';
