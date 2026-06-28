package auth

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"

	"github.com/rs/zerolog/log"
)

// Envelope encryption for JWT signing private keys at rest.
//
// Previously jwt_signing_keys.private_key_encrypted held the raw base64 of the
// Ed25519 private key, so a database read yielded full token-forgery material.
// These keys are now wrapped with AES-256-GCM under a key-encryption-key (KEK)
// sourced from the deployment's secret store (the JWT_KEY_ENCRYPTION_KEY env var),
// which lives OUTSIDE the database — so a DB-only compromise no longer exposes the
// signing keys.
//
// Backward compatible: rows are tagged with a 4-byte magic prefix when encrypted;
// values without it are read as legacy base64. When the KEK is not configured the
// code falls back to the legacy plaintext path (with a loud warning) so dev/test
// keep working; production MUST set JWT_KEY_ENCRYPTION_KEY.

// jwtKEKEnv holds the base64-encoded 32-byte (AES-256) key-encryption-key.
const jwtKEKEnv = "JWT_KEY_ENCRYPTION_KEY"

// sealedKeyMagic prefixes envelope-encrypted signing keys, distinguishing them
// from legacy base64 rows.
var sealedKeyMagic = []byte("JWK1")

// jwtKEK loads and validates the KEK from the environment. Returns (nil, nil) when
// unset (legacy/unencrypted mode); returns an error when set but malformed, so a
// misconfigured KEK fails loudly rather than silently degrading to plaintext.
func jwtKEK() ([]byte, error) {
	v := os.Getenv(jwtKEKEnv)
	if v == "" {
		return nil, nil
	}
	kek, err := base64.StdEncoding.DecodeString(v)
	if err != nil {
		return nil, fmt.Errorf("%s must be base64: %w", jwtKEKEnv, err)
	}
	if len(kek) != 32 {
		return nil, fmt.Errorf("%s must decode to 32 bytes (AES-256), got %d", jwtKEKEnv, len(kek))
	}
	return kek, nil
}

func gcmFor(kek []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(kek)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// sealSigningKey envelope-encrypts a signing private key for storage. With a KEK
// configured it returns magic||nonce||AES-256-GCM(privKey); without a KEK it falls
// back to legacy base64 (and warns) so non-production environments keep working.
func sealSigningKey(privKey []byte) ([]byte, error) {
	kek, err := jwtKEK()
	if err != nil {
		return nil, err
	}
	if kek == nil {
		// Fail closed in production: never persist the token-signing private key as
		// plaintext when ENVIRONMENT=production. Dev/test (KEK unset) keep the legacy
		// base64 path with a loud warning so they continue to work.
		if os.Getenv("ENVIRONMENT") == "production" {
			return nil, fmt.Errorf("refusing to store JWT signing key unencrypted in production: set %s (base64-encoded 32 bytes)", jwtKEKEnv)
		}
		log.Warn().Msgf("JWT signing key stored UNENCRYPTED at rest — set %s (base64 32 bytes) to envelope-encrypt", jwtKEKEnv)
		return []byte(base64.StdEncoding.EncodeToString(privKey)), nil
	}
	gcm, err := gcmFor(kek)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	ct := gcm.Seal(nil, nonce, privKey, nil)
	out := make([]byte, 0, len(sealedKeyMagic)+len(nonce)+len(ct))
	out = append(out, sealedKeyMagic...)
	out = append(out, nonce...)
	out = append(out, ct...)
	return out, nil
}

// openSigningKey reverses sealSigningKey. A magic-prefixed value is decrypted with
// the KEK (which must be configured); anything else is treated as legacy base64.
func openSigningKey(stored []byte) ([]byte, error) {
	if !bytes.HasPrefix(stored, sealedKeyMagic) {
		return base64.StdEncoding.DecodeString(string(stored)) // legacy
	}
	kek, err := jwtKEK()
	if err != nil {
		return nil, err
	}
	if kek == nil {
		return nil, fmt.Errorf("encrypted JWT signing key found but %s is not set", jwtKEKEnv)
	}
	gcm, err := gcmFor(kek)
	if err != nil {
		return nil, err
	}
	body := stored[len(sealedKeyMagic):]
	if len(body) < gcm.NonceSize() {
		return nil, errors.New("sealed JWT signing key too short")
	}
	nonce, ct := body[:gcm.NonceSize()], body[gcm.NonceSize():]
	return gcm.Open(nil, nonce, ct, nil)
}
