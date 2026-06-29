package auth

import (
	"crypto/hmac"
	"crypto/sha256"

	"github.com/usbvault/usbvault-server/internal/config"
)

// enumSecret returns the server secret used to key the deterministic decoy
// salt for non-existent accounts. It is read from SRP_ENUM_SECRET. In
// production this MUST be set to >=32 bytes (enforced at startup in
// cmd/api/app.go); in dev/test it falls back to empty so existing tests need
// no env. With an empty secret the salt is still deterministic (just not
// secret-keyed), which is acceptable outside production.
func enumSecret() []byte {
	return []byte(config.GetEnvOrDefault("SRP_ENUM_SECRET", ""))
}

// deterministicPseudoSalt returns a stable 32-byte HMAC-derived salt for an
// email hash, used as a decoy salt for non-existent accounts so /auth/srp/init
// is indistinguishable from a real account. A real account always returns its
// stored srp_salt; a non-existent one must likewise return the SAME value on
// every probe of the same email, so the HMAC is keyed only on the email hash
// (and the server secret). The output width (32 bytes) matches the real
// srp_salt width.
func deterministicPseudoSalt(emailHash string) []byte {
	h := hmac.New(sha256.New, append([]byte("srp-pseudo-salt|"), enumSecret()...))
	h.Write([]byte(emailHash))
	return h.Sum(nil) // 32 bytes
}
