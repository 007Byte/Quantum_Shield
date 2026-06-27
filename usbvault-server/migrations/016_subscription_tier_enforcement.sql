-- Migration 016: Authoritative server-side subscription tier (F3)
--
-- F3 enforces per-tier resource limits (vault count, file size, storage, and
-- boolean feature gates such as sharing / audit_export) using a tier value
-- sourced ONLY from trusted server-side state — never a client header or body.
--
-- The authoritative per-user tier lives on users.subscription_tier. This column
-- was originally created in migration 001 (subscription_tier subscription_tier
-- DEFAULT 'free'); this migration is an idempotent safeguard that guarantees the
-- column exists with the correct enum type and the free-tier default on any
-- database whose schema may have diverged, and documents its role as the F3
-- source of truth.
--
-- INTEGRATION FLAG: keeping users.subscription_tier in sync with the upstream
-- billing provider (Stripe) is a SEPARATE integration. The Stripe webhook
-- handler currently updates the `subscriptions` table; a follow-up must also
-- propagate the active tier onto users.subscription_tier (or the enforcement
-- path must continue to fall back to subscriptions.tier, as it does today).

-- Ensure the enum type exists (created in 001; guard for divergent schemas).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
        CREATE TYPE subscription_tier AS ENUM ('free', 'individual', 'team', 'enterprise');
    END IF;
END$$;

-- Ensure the authoritative per-user tier column exists with a free default.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier NOT NULL DEFAULT 'free';

-- Backfill any NULLs (defensive; column is NOT NULL DEFAULT 'free' above).
UPDATE users SET subscription_tier = 'free' WHERE subscription_tier IS NULL;

-- Index to keep tier lookups cheap on the enforcement hot path.
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);

COMMENT ON COLUMN users.subscription_tier IS 'F3: authoritative server-side subscription tier (free|individual|team|enterprise) used for per-tier limit/feature enforcement. Syncing from Stripe billing is a separate integration.';
