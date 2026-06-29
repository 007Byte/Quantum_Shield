package auth

import (
	"encoding/hex"
	"testing"
)

// TestDeterministicPseudoSalt_Deterministic verifies the anti-enumeration decoy
// salt is stable per email hash (so two /auth/srp/init probes of the same
// non-existent email return the SAME salt, exactly like a real account would)
// and is 32 bytes wide (matching the real srp_salt width). This primitive is
// load-bearing for the enumeration fix in HandleSRPInit.
func TestDeterministicPseudoSalt_Deterministic(t *testing.T) {
	emailHash := hashEmail("nonexistent@example.com")

	s1 := deterministicPseudoSalt(emailHash)
	s2 := deterministicPseudoSalt(emailHash)

	if len(s1) != 32 {
		t.Fatalf("pseudo-salt width: expected 32 bytes, got %d", len(s1))
	}
	if hex.EncodeToString(s1) != hex.EncodeToString(s2) {
		t.Errorf("pseudo-salt is not deterministic: %x != %x", s1, s2)
	}
}

// TestDeterministicPseudoSalt_DiffersPerEmail verifies different emails yield
// different decoy salts (so the decoy does not collapse all non-existent
// accounts to one value, which would itself be a tell).
func TestDeterministicPseudoSalt_DiffersPerEmail(t *testing.T) {
	a := deterministicPseudoSalt(hashEmail("alice@example.com"))
	b := deterministicPseudoSalt(hashEmail("bob@example.com"))

	if hex.EncodeToString(a) == hex.EncodeToString(b) {
		t.Error("pseudo-salt should differ across distinct emails")
	}
}
