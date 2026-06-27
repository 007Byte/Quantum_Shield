-- Migration 018: Reconcile vault_members with the RBAC code model
--
-- internal/auth/rbac.go (AssignRole, GetUserRole, the VaultMember struct) and the
-- vault permission system expect vault_members to have granted_at + granted_by
-- columns and a unique (vault_id, user_id) for its ON CONFLICT upsert, and treat
-- encrypted_key as OPTIONAL (the owner holds the vault key directly and has no
-- wrapped copy; only shared members carry an encrypted_key). The original schema
-- (migration 001) defined vault_members with encrypted_key NOT NULL and
-- invited_at/accepted_at but NONE of granted_at/granted_by, and no unique
-- constraint — so AssignRole and the owner-role grant at vault creation could
-- never execute (the full-stack suite that would have caught this never ran).
-- This reconciles the table with the code. Idempotent.

ALTER TABLE vault_members ADD COLUMN IF NOT EXISTS granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE vault_members ADD COLUMN IF NOT EXISTS granted_by UUID;

-- The owner's membership has no wrapped key; only shared members do.
ALTER TABLE vault_members ALTER COLUMN encrypted_key DROP NOT NULL;

-- Required for the ON CONFLICT (vault_id, user_id) upsert in AssignRole and for
-- the owner-membership grant in TierLimiter.CreateVaultAtomic.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vault_members_vault_user ON vault_members(vault_id, user_id);
