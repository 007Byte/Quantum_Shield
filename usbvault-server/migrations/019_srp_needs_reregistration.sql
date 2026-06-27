-- Migration 019: Flag accounts that must re-register after the SRP modulus fix (#65)
--
-- PR #64 replaced a fabricated, non-prime SRP modulus with the real RFC 7919
-- ffdhe3072 prime (internal/auth/srp.go). An SRP verifier is v = g^x mod N; any
-- verifier created against the OLD bogus N is invalid under the new N, x is not
-- recoverable server-side, and the server cannot distinguish "verifier made against
-- the old N" from "wrong password" at login. The product decision (#65) is to FORCE
-- re-registration on next login.

-- PREREQUISITE FIX: users.deleted_at has been referenced by code for a while
-- (account.go soft-deletes via `UPDATE users SET deleted_at`, register.go and
-- fido2_backup.go filter on `deleted_at IS NULL`) but was NEVER created by any
-- migration (001 creates users without it). Those queries currently throw SQLSTATE
-- 42703, which silently breaks account deletion AND the registration "already
-- exists" check (and would make #65 re-registration impossible). Add it here.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

-- The re-registration flag.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS srp_needs_reregistration BOOLEAN NOT NULL DEFAULT false;

-- Flag only PRE-EXISTING SRP-password accounts (those created before this migration
-- that actually have an SRP verifier). OIDC-only / passkey-primary rows have no SRP
-- verifier to invalidate and no way to clear the flag, so they must NOT be flagged.
-- New registrations after this migration default to false.
UPDATE users
SET srp_needs_reregistration = true
WHERE srp_needs_reregistration = false
  AND srp_verifier IS NOT NULL
  AND COALESCE(auth_method, 'srp') = 'srp'
  AND deleted_at IS NULL;

COMMENT ON COLUMN users.srp_needs_reregistration IS '#65: true when an SRP account predates the ffdhe3072 modulus fix and must re-register a fresh verifier before it can log in. Cleared on re-registration. INVARIANT: only this migration ever sets it true — no runtime path may, or the unauthenticated re-registration window would reopen for arbitrary accounts.';
