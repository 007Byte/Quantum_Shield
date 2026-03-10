package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a registered user
type User struct {
	ID               uuid.UUID `db:"id"`
	EmailHash        string    `db:"email_hash"`
	SRPVerifier      []byte    `db:"srp_verifier"`
	SRPSalt          []byte    `db:"srp_salt"`
	PublicKey        []byte    `db:"public_key"` // X25519 key for E2E sharing
	WebAuthnCreds    []byte    `db:"webauthn_credentials"` // JSON-encoded
	CreatedAt        time.Time `db:"created_at"`
	UpdatedAt        time.Time `db:"updated_at"`
	SubscriptionTier string    `db:"subscription_tier"`
	Role             string    `db:"role"` // "user", "moderator", or "admin"
}

// Vault represents an encrypted vault
type Vault struct {
	ID                uuid.UUID `db:"id"`
	OwnerID           uuid.UUID `db:"owner_id"`
	EncryptedMetadata []byte    `db:"encrypted_metadata"`
	CreatedAt         time.Time `db:"created_at"`
	UpdatedAt         time.Time `db:"updated_at"`
	DeletedAt         *time.Time `db:"deleted_at"`
}

// Blob represents a file stored in S3
type Blob struct {
	ID                      uuid.UUID `db:"id"`
	VaultID                 uuid.UUID `db:"vault_id"`
	S3Key                   string    `db:"s3_key"`
	SizeBytes               int64     `db:"size_bytes"`
	CreatedAt               time.Time `db:"created_at"`
	UpdatedAt               time.Time `db:"updated_at"`
	DeletedAt               *time.Time `db:"deleted_at"`
	DeletedBy               *uuid.UUID `db:"deleted_by"` // User who deleted the blob
	ExpiresAt               *time.Time `db:"expires_at"` // Optional expiration time
	EncryptionKeyEncrypted  []byte    `db:"encryption_key_encrypted"` // Blob key encrypted with vault key
}

// ShareRecord represents a shared file
type ShareRecord struct {
	ID           uuid.UUID `db:"id"`
	SenderID     uuid.UUID `db:"sender_id"`
	RecipientID  uuid.UUID `db:"recipient_id"`
	BlobID       uuid.UUID `db:"blob_id"`
	EncryptedKey []byte    `db:"encrypted_key"` // File key re-encrypted with recipient's public key
	CreatedAt    time.Time `db:"created_at"`
	ExpiresAt    *time.Time `db:"expires_at"`
	RevokedAt    *time.Time `db:"revoked_at"`
}

// AuditEntry represents a tamper-evident audit log entry
type AuditEntry struct {
	ID              int64     `db:"id"`
	UserID          uuid.UUID `db:"user_id"`
	ActionType      string    `db:"action_type"`
	EncryptedDetail []byte    `db:"encrypted_detail"`
	Timestamp       time.Time `db:"timestamp"`
	PrevHash        []byte    `db:"prev_hash"`
	Hash            []byte    `db:"hash"`
}

// PublicKey represents a user's public key for sharing
type PublicKey struct {
	ID        int       `db:"id"`
	UserID    uuid.UUID `db:"user_id"`
	KeyType   string    `db:"key_type"` // "x25519" for E2E sharing
	PublicKeyBytes []byte `db:"public_key_bytes"`
	CreatedAt time.Time `db:"created_at"`
}

// Session represents an active user session
type Session struct {
	ID        uuid.UUID `db:"id"`
	UserID    uuid.UUID `db:"user_id"`
	DeviceID  string    `db:"device_id"`
	TokenHash []byte    `db:"token_hash"`
	ExpiresAt time.Time `db:"expires_at"`
	CreatedAt time.Time `db:"created_at"`
}

// Device represents a registered push notification device
type Device struct {
	ID          int       `db:"id"`
	UserID      uuid.UUID `db:"user_id"`
	DeviceToken string    `db:"device_token"`
	Platform    string    `db:"platform"` // "ios" or "android"
	RegisteredAt time.Time `db:"registered_at"`
}

// Subscription represents a user's billing subscription
type Subscription struct {
	ID             uuid.UUID `db:"id"`
	UserID         uuid.UUID `db:"user_id"`
	StripeCustomerID string  `db:"stripe_customer_id"`
	StripeSubscriptionID string `db:"stripe_subscription_id"`
	Tier           string    `db:"tier"` // "individual", "team", "enterprise"
	Status         string    `db:"status"` // "active", "past_due", "cancelled"
	CurrentPeriodEnd time.Time `db:"current_period_end"`
	CancelledAt    *time.Time `db:"cancelled_at"`
	CreatedAt      time.Time `db:"created_at"`
	UpdatedAt      time.Time `db:"updated_at"`
}

// VaultMember represents shared access to a vault
type VaultMember struct {
	ID        string     `db:"id"`
	VaultID   string     `db:"vault_id"`
	UserID    string     `db:"user_id"`
	Role      string     `db:"role"` // "owner", "editor", "viewer"
	GrantedAt time.Time  `db:"granted_at"`
	GrantedBy string     `db:"granted_by"`
	AcceptedAt *time.Time `db:"accepted_at"`
}
