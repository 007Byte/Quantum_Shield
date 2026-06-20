-- Migration 014: OIDC Provider Support for Enterprise SSO
-- Enables OAuth 2.0 / OIDC integration alongside existing SRP-6a auth.
-- OIDC handles identity verification; SRP handles cryptographic key derivation.

-- OIDC Identity Provider configurations (multi-tenant)
CREATE TABLE IF NOT EXISTS oidc_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    issuer_url VARCHAR(512) NOT NULL,
    client_id VARCHAR(256) NOT NULL,
    client_secret_encrypted BYTEA NOT NULL,
    allowed_domains JSONB DEFAULT '[]',
    scopes JSONB DEFAULT '["openid","email","profile"]'::jsonb,
    claim_mapping JSONB DEFAULT '{"sub":"sub","email":"email","name":"name"}'::jsonb,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oidc_providers_issuer ON oidc_providers(issuer_url);
CREATE INDEX IF NOT EXISTS idx_oidc_providers_enabled ON oidc_providers(enabled) WHERE enabled = true;

-- Link OIDC identities to USBVault user accounts
CREATE TABLE IF NOT EXISTS oidc_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES oidc_providers(id) ON DELETE CASCADE,
    oidc_subject VARCHAR(256) NOT NULL,
    oidc_email VARCHAR(256),
    oidc_metadata JSONB DEFAULT '{}',
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    UNIQUE(provider_id, oidc_subject)
);

CREATE INDEX IF NOT EXISTS idx_oidc_identities_user ON oidc_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_oidc_identities_lookup ON oidc_identities(provider_id, oidc_subject);

-- Extend users table for OIDC support
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_method VARCHAR(16) DEFAULT 'srp' NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wrapped_kek_escrow BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kek_escrow_salt BYTEA;

-- Make SRP fields nullable for OIDC-only users
ALTER TABLE users ALTER COLUMN srp_verifier DROP NOT NULL;
ALTER TABLE users ALTER COLUMN srp_salt DROP NOT NULL;
