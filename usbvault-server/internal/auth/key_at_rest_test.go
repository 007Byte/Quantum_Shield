package auth

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func setTestKEK(t *testing.T) {
	t.Helper()
	kek := make([]byte, 32)
	if _, err := rand.Read(kek); err != nil {
		t.Fatal(err)
	}
	t.Setenv(jwtKEKEnv, base64.StdEncoding.EncodeToString(kek))
}

func TestSealOpenSigningKey_RoundTripWithKEK(t *testing.T) {
	setTestKEK(t)
	_, priv, _ := ed25519.GenerateKey(rand.Reader)

	sealed, err := sealSigningKey(priv)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if !bytes.HasPrefix(sealed, sealedKeyMagic) {
		t.Fatal("sealed value should carry the magic prefix")
	}
	if bytes.Contains(sealed, priv) {
		t.Fatal("sealed value must NOT contain the plaintext private key")
	}

	opened, err := openSigningKey(sealed)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if !bytes.Equal(opened, priv) {
		t.Fatal("round-trip mismatch")
	}
}

func TestOpenSigningKey_LegacyBase64(t *testing.T) {
	t.Setenv(jwtKEKEnv, "") // KEK irrelevant for a legacy (non-magic) row
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	legacy := []byte(base64.StdEncoding.EncodeToString(priv))

	opened, err := openSigningKey(legacy)
	if err != nil {
		t.Fatalf("open legacy: %v", err)
	}
	if !bytes.Equal(opened, priv) {
		t.Fatal("legacy round-trip mismatch")
	}
}

func TestSealSigningKey_NoKEKFallsBackToBase64(t *testing.T) {
	t.Setenv(jwtKEKEnv, "")
	_, priv, _ := ed25519.GenerateKey(rand.Reader)

	sealed, err := sealSigningKey(priv)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if bytes.HasPrefix(sealed, sealedKeyMagic) {
		t.Fatal("no-KEK seal must NOT be magic-prefixed (it is legacy base64)")
	}
	opened, err := openSigningKey(sealed)
	if err != nil || !bytes.Equal(opened, priv) {
		t.Fatalf("no-KEK round-trip failed: err=%v", err)
	}
}

func TestJWTKEK_InvalidLengthErrors(t *testing.T) {
	t.Setenv(jwtKEKEnv, base64.StdEncoding.EncodeToString([]byte("too-short")))
	if _, err := jwtKEK(); err == nil {
		t.Fatal("expected error for a non-32-byte KEK")
	}
}

func TestOpenSigningKey_EncryptedButNoKEKErrors(t *testing.T) {
	setTestKEK(t)
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	sealed, err := sealSigningKey(priv)
	if err != nil {
		t.Fatal(err)
	}

	t.Setenv(jwtKEKEnv, "") // KEK now missing
	if _, err := openSigningKey(sealed); err == nil {
		t.Fatal("expected error opening an encrypted key with no KEK configured")
	}
}
