//go:build integration

package integration

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"io"
	"testing"
)

// crypto_helper_test.go provides REAL (not mocked) client-side AEAD encryption
// for the integration tests. The production client encrypts with
// XChaCha20-Poly1305 / AES-256-GCM-SIV in the Rust core; here we use the Go
// stdlib AES-256-GCM AEAD, which is sufficient to prove the zero-knowledge
// invariant exercised by the integration tests: ciphertext != plaintext and
// decrypt(encrypt(x)) == x. The point is that the SERVER only ever receives
// genuine ciphertext — never the plaintext.
//
// Format: nonce(12) || ciphertext || tag(16).

func newAEAD(t *testing.T, key []byte) cipher.AEAD {
	t.Helper()
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatalf("aes.NewCipher: %v", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatalf("cipher.NewGCM: %v", err)
	}
	return aead
}

// encryptClientSideWithKey generates a fresh 32-byte key, encrypts plaintext
// with real AES-256-GCM, and returns (key, ciphertext). The key never leaves
// the client in the zero-knowledge model.
func encryptClientSideWithKey(t *testing.T, plaintext []byte) (key, ciphertext []byte) {
	t.Helper()
	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generate key: %v", err)
	}
	aead := newAEAD(t, key)
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		t.Fatalf("generate nonce: %v", err)
	}
	sealed := aead.Seal(nil, nonce, plaintext, nil)
	ciphertext = append(nonce, sealed...)
	return key, ciphertext
}

// encryptClientSide is a convenience wrapper that discards the key (used where
// only the ciphertext bytes matter — e.g. the upload path).
func encryptClientSide(t *testing.T, plaintext []byte) []byte {
	t.Helper()
	_, ciphertext := encryptClientSideWithKey(t, plaintext)
	return ciphertext
}

// decryptClientSide reverses encryptClientSideWithKey. Decryption (and GCM tag
// verification) failure is a fatal test error.
func decryptClientSide(t *testing.T, key, ciphertext []byte) []byte {
	t.Helper()
	aead := newAEAD(t, key)
	ns := aead.NonceSize()
	if len(ciphertext) < ns {
		t.Fatalf("ciphertext too short: %d < nonce size %d", len(ciphertext), ns)
	}
	nonce, sealed := ciphertext[:ns], ciphertext[ns:]
	plaintext, err := aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		t.Fatalf("AEAD open (decrypt) failed: %v", err)
	}
	return plaintext
}
