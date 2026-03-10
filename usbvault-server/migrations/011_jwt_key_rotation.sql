-- PH2-FIX: JWT signing key rotation support
CREATE TABLE IF NOT EXISTS jwt_signing_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kid VARCHAR(64) NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    private_key_encrypted BYTEA NOT NULL,
    algorithm VARCHAR(20) NOT NULL DEFAULT 'EdDSA',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotated', 'revoked')),
    activated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    rotated_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jwt_signing_keys_status ON jwt_signing_keys(status);
CREATE INDEX IF NOT EXISTS idx_jwt_signing_keys_kid ON jwt_signing_keys(kid);
