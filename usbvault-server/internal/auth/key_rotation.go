package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// SigningKey represents a versioned JWT signing key with status tracking.
//
// Fields:
//   - KID: Key ID generated from SHA256 hash of public key (16-char hex)
//   - PublicKey: Ed25519 public key for verification
//   - PrivateKey: Ed25519 private key for signing (envelope-encrypted at rest in DB)
//   - Status: Key lifecycle state (active, rotated, revoked)
//   - ActivatedAt: When this key became active
type SigningKey struct {
	KID         string
	PublicKey   ed25519.PublicKey
	PrivateKey  ed25519.PrivateKey
	Status      string // active, rotated, revoked
	ActivatedAt time.Time
}

// KeyRotationService manages JWT key versioning and rotation lifecycle.
//
// Features:
//   - Loads existing keys from database or generates new keys
//   - Maintains active key for signing and cache of verification keys
//   - Supports automatic rotation on schedule
//   - Tracks key status (active, rotated, revoked)
//   - Thread-safe with RWMutex
//
// PH2-FIX: JWT signing key rotation with kid header support.
// Signing private keys are envelope-encrypted at rest (AES-256-GCM under the KEK
// from JWT_KEY_ENCRYPTION_KEY; see key_at_rest.go), not stored as plaintext.
type KeyRotationService struct {
	pool      *pgxpool.Pool
	mu        sync.RWMutex
	activeKey *SigningKey            // Current signing key
	keyCache  map[string]*SigningKey // kid -> key for verification
}

// NewKeyRotationService creates a new key rotation service for managing JWT key versions.
func NewKeyRotationService(pool *pgxpool.Pool) *KeyRotationService {
	return &KeyRotationService{
		pool:     pool,
		keyCache: make(map[string]*SigningKey),
	}
}

// Initialize loads existing keys from the database or generates an initial key.
// Should be called once during application startup.
//
// Process:
//  1. Query database for active and rotated keys
//  2. Load keys into memory cache
//  3. Set most recently activated key as active
//  4. If no active key exists, generate and store new initial key
//  5. Update global jwtPrivateKey/jwtPublicKey for backward compatibility
//
// Returns error if database queries or key parsing fails.
func (krs *KeyRotationService) Initialize(ctx context.Context) error {
	krs.mu.Lock()
	defer krs.mu.Unlock()

	// Load all active and recently rotated keys from DB
	rows, err := krs.pool.Query(ctx,
		`SELECT kid, public_key, private_key_encrypted, status, activated_at
		 FROM jwt_signing_keys
		 WHERE status IN ('active', 'rotated')
		 ORDER BY activated_at DESC`)
	if err != nil {
		return fmt.Errorf("failed to query signing keys: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var kid, status string
		var pubKeyBytes, privKeyEncrypted []byte
		var activatedAt time.Time

		if err := rows.Scan(&kid, &pubKeyBytes, &privKeyEncrypted, &status, &activatedAt); err != nil {
			return fmt.Errorf("failed to scan signing key: %w", err)
		}

		// Envelope-decrypt the signing key (or read a legacy base64 row). See
		// key_at_rest.go; the KEK comes from JWT_KEY_ENCRYPTION_KEY.
		privKeyBytes, err := openSigningKey(privKeyEncrypted)
		if err != nil {
			log.Warn().Err(err).Str("kid", kid).Msg("skipping signing key that failed to decrypt/decode")
			continue
		}

		key := &SigningKey{
			KID:         kid,
			PublicKey:   ed25519.PublicKey(pubKeyBytes),
			PrivateKey:  ed25519.PrivateKey(privKeyBytes),
			Status:      status,
			ActivatedAt: activatedAt,
		}

		krs.keyCache[kid] = key
		if status == "active" && krs.activeKey == nil {
			krs.activeKey = key
		}
	}

	// If no active key exists, generate one
	if krs.activeKey == nil {
		log.Info().Msg("PH2-FIX: No active JWT signing key found, generating initial key")
		return krs.generateAndStoreKey(ctx)
	}

	// Also set the global keys for backward compatibility
	jwtPrivateKey = krs.activeKey.PrivateKey
	jwtPublicKey = krs.activeKey.PublicKey

	log.Info().
		Str("active_kid", krs.activeKey.KID).
		Int("cached_keys", len(krs.keyCache)).
		Msg("PH2-FIX: JWT key rotation service initialized")

	return nil
}

// generateAndStoreKey creates a new Ed25519 key pair, derives a KID from its public key,
// stores it in the database with active status, and updates the in-memory cache.
//
// KID generation: First 8 bytes of SHA256(public_key) encoded as 16-char hex string.
// Private key: envelope-encrypted at rest via sealSigningKey (key_at_rest.go).
//
// Returns error if key generation or database insertion fails.
func (krs *KeyRotationService) generateAndStoreKey(ctx context.Context) error {
	pubKey, privKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return fmt.Errorf("failed to generate Ed25519 key: %w", err)
	}

	// Generate KID from public key hash
	hash := sha256.Sum256(pubKey)
	kid := hex.EncodeToString(hash[:8]) // 16-char hex KID

	// Envelope-encrypt the private key at rest (AES-256-GCM under the KEK from
	// JWT_KEY_ENCRYPTION_KEY; see key_at_rest.go). Falls back to legacy base64 only
	// when no KEK is configured (non-production).
	sealed, err := sealSigningKey(privKey)
	if err != nil {
		return fmt.Errorf("failed to seal signing key: %w", err)
	}

	_, err = krs.pool.Exec(ctx,
		`INSERT INTO jwt_signing_keys (kid, public_key, private_key_encrypted, algorithm, status, activated_at)
		 VALUES ($1, $2, $3, 'EdDSA', 'active', NOW())`,
		kid, []byte(pubKey), sealed)
	if err != nil {
		return fmt.Errorf("failed to store signing key: %w", err)
	}

	key := &SigningKey{
		KID:         kid,
		PublicKey:   pubKey,
		PrivateKey:  privKey,
		Status:      "active",
		ActivatedAt: time.Now(),
	}

	krs.activeKey = key
	krs.keyCache[kid] = key

	// Update global keys for backward compatibility — under jwtKeyMu, the same lock
	// the signing/validation readers hold, to avoid a data race during rotation.
	jwtKeyMu.Lock()
	jwtPrivateKey = privKey
	jwtPublicKey = pubKey
	jwtKeyMu.Unlock()

	log.Info().Str("kid", kid).Msg("PH2-FIX: Generated new JWT signing key")
	return nil
}

// RotateKey generates a new active signing key and marks the current key as rotated.
// Called on schedule (e.g., every 90 days) for key management.
//
// Process:
//  1. Mark current active key as rotated with timestamp
//  2. Generate and store new key as active
//  3. Update in-memory active key reference
//
// Old rotated keys remain in database for verification of previously-signed tokens.
// Returns error if key rotation fails.
func (krs *KeyRotationService) RotateKey(ctx context.Context) error {
	krs.mu.Lock()
	defer krs.mu.Unlock()

	if krs.pool == nil {
		return fmt.Errorf("database pool not configured")
	}

	if krs.activeKey != nil {
		// Mark current key as rotated
		_, err := krs.pool.Exec(ctx,
			`UPDATE jwt_signing_keys SET status = 'rotated', rotated_at = NOW() WHERE kid = $1`,
			krs.activeKey.KID)
		if err != nil {
			return fmt.Errorf("failed to rotate current key: %w", err)
		}
		krs.activeKey.Status = "rotated"
		log.Info().Str("old_kid", krs.activeKey.KID).Msg("PH2-FIX: Rotated old JWT signing key")
	}

	// Generate new active key
	return krs.generateAndStoreKey(ctx)
}

// GetActiveKID returns the KID (key ID) of the currently active signing key.
// This KID is embedded in the token header for key versioning.
func (krs *KeyRotationService) GetActiveKID() string {
	krs.mu.RLock()
	defer krs.mu.RUnlock()
	if krs.activeKey != nil {
		return krs.activeKey.KID
	}
	return ""
}

// GetSigningKey returns the active private key for signing new tokens.
// Falls back to global jwtPrivateKey for backward compatibility.
func (krs *KeyRotationService) GetSigningKey() ed25519.PrivateKey {
	krs.mu.RLock()
	defer krs.mu.RUnlock()
	if krs.activeKey != nil {
		return krs.activeKey.PrivateKey
	}
	return jwtPrivateKey // Fallback to global
}

// GetVerificationKey returns the public key for verifying a token signed with a specific KID.
// Looks up the key in the cache and checks if it's not revoked.
//
// Returns error if:
//   - KID is not found in cache
//   - Key with that KID has been revoked
func (krs *KeyRotationService) GetVerificationKey(kid string) (ed25519.PublicKey, error) {
	krs.mu.RLock()
	defer krs.mu.RUnlock()

	if key, ok := krs.keyCache[kid]; ok {
		if key.Status == "revoked" {
			return nil, fmt.Errorf("key %s has been revoked", kid)
		}
		return key.PublicKey, nil
	}
	return nil, fmt.Errorf("unknown key ID: %s", kid)
}

// RevokeKey marks a specific key as revoked in an emergency (e.g., key compromise).
// Revoked keys can no longer be used for token verification.
// This is a rare operation used only when a key is suspected to be compromised.
//
// Returns error if database update fails.
func (krs *KeyRotationService) RevokeKey(ctx context.Context, kid string) error {
	krs.mu.Lock()
	defer krs.mu.Unlock()

	_, err := krs.pool.Exec(ctx,
		`UPDATE jwt_signing_keys SET status = 'revoked', revoked_at = NOW() WHERE kid = $1`,
		kid)
	if err != nil {
		return fmt.Errorf("failed to revoke key: %w", err)
	}

	if key, ok := krs.keyCache[kid]; ok {
		key.Status = "revoked"
	}

	log.Warn().Str("kid", kid).Msg("PH2-FIX: JWT signing key revoked")
	return nil
}

// CleanupExpiredKeys removes keys that were rotated more than 60 days ago.
// This cleanup is important for key rotation hygiene (reducing table size) and compliance.
// Called automatically during key rotation operations.
//
// Returns error if database deletion fails.
func (krs *KeyRotationService) CleanupExpiredKeys(ctx context.Context) error {
	krs.mu.Lock()
	defer krs.mu.Unlock()

	if krs.pool == nil {
		return fmt.Errorf("database pool not configured")
	}

	result, err := krs.pool.Exec(ctx,
		`DELETE FROM jwt_signing_keys WHERE status = 'rotated' AND rotated_at < NOW() - INTERVAL '60 days'`)
	if err != nil {
		return fmt.Errorf("failed to cleanup expired keys: %w", err)
	}

	deleted := result.RowsAffected()
	if deleted > 0 {
		log.Info().Int64("deleted", deleted).Msg("PH2-FIX: Cleaned up expired JWT signing keys")
	}

	return nil
}

// StartAutoRotation starts a background goroutine that rotates keys on the specified interval.
// Common interval: 90 days for best-practice key rotation.
// Also runs cleanup of expired keys after each rotation.
//
// The goroutine exits when ctx.Done() is signaled (e.g., on application shutdown).
func (krs *KeyRotationService) StartAutoRotation(ctx context.Context, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Info().Msg("PH2-FIX: JWT key auto-rotation stopped")
				return
			case <-ticker.C:
				if err := krs.RotateKey(ctx); err != nil {
					log.Error().Err(err).Msg("PH2-FIX: Auto key rotation failed")
				} else {
					log.Info().Msg("PH2-FIX: Auto key rotation completed")
				}
				// Also cleanup old keys
				if err := krs.CleanupExpiredKeys(ctx); err != nil {
					log.Error().Err(err).Msg("PH2-FIX: Key cleanup failed")
				}
			}
		}
	}()
}
