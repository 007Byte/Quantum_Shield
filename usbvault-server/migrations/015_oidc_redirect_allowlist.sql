-- Migration 015: Per-provider OIDC redirect_uri allowlist
-- Adds a per-provider exact-match allowlist of redirect_uri values so that
-- redirect_uri validation no longer depends solely on the single global
-- OIDCConfig.CallbackBaseURL. SECURITY: redirect_uri must never be used
-- verbatim from the client; it must match one of these entries exactly to
-- prevent authorization-code interception / open redirect.
--
-- Note: migration 014 already (a) made users.srp_verifier / users.srp_salt
-- NULLABLE and (b) added the users.auth_method discriminator
-- (VARCHAR(16) NOT NULL DEFAULT 'srp'), so OIDC-only users can be created with
-- NULL SRP credentials and auth_method = 'oidc'. This migration only adds the
-- remaining per-provider redirect allowlist column.

ALTER TABLE oidc_providers
    ADD COLUMN IF NOT EXISTS allowed_redirect_uris TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN oidc_providers.allowed_redirect_uris IS 'Exact-match allowlist of redirect_uri values accepted for this provider. Empty array falls back to the global OIDC callback base URL.';
