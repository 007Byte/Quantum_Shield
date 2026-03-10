-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE subscription_tier AS ENUM ('free', 'individual', 'team', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled');
CREATE TYPE vault_member_role AS ENUM ('owner', 'editor', 'viewer');

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash VARCHAR(64) UNIQUE NOT NULL,
    srp_verifier BYTEA NOT NULL,
    srp_salt BYTEA NOT NULL,
    public_key BYTEA,
    webauthn_credentials JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    subscription_tier subscription_tier DEFAULT 'free',
    role VARCHAR(32) DEFAULT 'user' NOT NULL
);

CREATE INDEX idx_users_email_hash ON users(email_hash);

-- Vaults table
CREATE TABLE vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_metadata BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_vaults_owner_id ON vaults(owner_id);
CREATE INDEX idx_vaults_deleted_at ON vaults(deleted_at);

-- Blobs (files) table
CREATE TABLE blobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    s3_key VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    encryption_key_encrypted BYTEA NOT NULL
);

CREATE INDEX idx_blobs_vault_id ON blobs(vault_id);
CREATE INDEX idx_blobs_deleted_at ON blobs(deleted_at);
CREATE INDEX idx_blobs_expires_at ON blobs(expires_at);

-- Vault members (shared access) table
CREATE TABLE vault_members (
    id SERIAL PRIMARY KEY,
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_key BYTEA NOT NULL,
    role vault_member_role NOT NULL DEFAULT 'viewer',
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_vault_members_vault_id ON vault_members(vault_id);
CREATE INDEX idx_vault_members_user_id ON vault_members(user_id);

-- Share records (E2E encrypted file sharing) table
CREATE TABLE share_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blob_id UUID NOT NULL REFERENCES blobs(id) ON DELETE CASCADE,
    encrypted_key BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_share_records_sender_id ON share_records(sender_id);
CREATE INDEX idx_share_records_recipient_id ON share_records(recipient_id);
CREATE INDEX idx_share_records_blob_id ON share_records(blob_id);

-- Public keys table (for E2E sharing)
CREATE TABLE public_keys (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_type VARCHAR(32) NOT NULL,
    public_key_bytes BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_public_keys_user_id ON public_keys(user_id);

-- Audit log table (tamper-evident hash chain)
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    encrypted_detail BYTEA,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    prev_hash BYTEA NOT NULL,
    hash BYTEA NOT NULL
) PARTITION BY RANGE (EXTRACT(YEAR_MONTH FROM timestamp));

-- Create monthly partitions for audit_log
CREATE TABLE audit_log_2024_01 PARTITION OF audit_log
    FOR VALUES FROM ('2024-01') TO ('2024-02');

CREATE TABLE audit_log_2024_02 PARTITION OF audit_log
    FOR VALUES FROM ('2024-02') TO ('2024-03');

CREATE TABLE audit_log_2024_03 PARTITION OF audit_log
    FOR VALUES FROM ('2024-03') TO ('2024-04');

-- Continue for all months as needed
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);

-- Sessions table
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id VARCHAR(255) NOT NULL,
    token_hash BYTEA NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Devices (push notification) table
CREATE TABLE devices (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(512) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_token)
);

CREATE INDEX idx_devices_user_id ON devices(user_id);

-- Subscriptions table
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255) UNIQUE,
    tier subscription_tier NOT NULL,
    status subscription_status NOT NULL DEFAULT 'active',
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vaults_updated_at BEFORE UPDATE ON vaults
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blobs_updated_at BEFORE UPDATE ON blobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
