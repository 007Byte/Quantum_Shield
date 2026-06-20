package recovery

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// generateCode tests
// ---------------------------------------------------------------------------

func TestGenerateCode_Format(t *testing.T) {
	code := generateCode()

	parts := strings.Split(code, "-")
	if len(parts) != CodeSegments {
		t.Fatalf("expected %d segments, got %d in code %q", CodeSegments, len(parts), code)
	}
	for i, seg := range parts {
		if len(seg) != CodeSegmentLength {
			t.Errorf("segment %d length: got %d, want %d (code %q)", i, len(seg), CodeSegmentLength, code)
		}
	}
}

func TestGenerateCode_CharsetExclusions(t *testing.T) {
	// Characters that must never appear: I, 1, O, 0
	excluded := "I1O0"

	// Generate many codes to exercise randomness
	for i := 0; i < 200; i++ {
		code := generateCode()
		for _, ch := range code {
			if ch == '-' {
				continue
			}
			if strings.ContainsRune(excluded, ch) {
				t.Errorf("code %q contains excluded char %q", code, string(ch))
			}
		}
	}
}

func TestGenerateCode_AllUppercase(t *testing.T) {
	for i := 0; i < 100; i++ {
		code := generateCode()
		clean := strings.ReplaceAll(code, "-", "")
		if clean != strings.ToUpper(clean) {
			t.Errorf("code %q contains lowercase characters", code)
		}
	}
}

func TestGenerateCode_Uniqueness(t *testing.T) {
	seen := make(map[string]bool)
	n := 500
	for i := 0; i < n; i++ {
		code := generateCode()
		if seen[code] {
			t.Errorf("duplicate code generated: %q", code)
		}
		seen[code] = true
	}
}

func TestGenerateCode_TotalLength(t *testing.T) {
	code := generateCode()
	clean := strings.ReplaceAll(code, "-", "")
	expected := CodeSegmentLength * CodeSegments
	if len(clean) != expected {
		t.Errorf("clean code length: got %d, want %d", len(clean), expected)
	}
}

// ---------------------------------------------------------------------------
// hashCode tests
// ---------------------------------------------------------------------------

func TestHashCode_Deterministic(t *testing.T) {
	h1 := hashCode("ABCD-EFGH-JKLM")
	h2 := hashCode("ABCD-EFGH-JKLM")
	if !equalBytes(h1, h2) {
		t.Error("same input should produce same hash")
	}
}

func TestHashCode_SHA256Length(t *testing.T) {
	h := hashCode("ABCD-EFGH-JKLM")
	if len(h) != sha256.Size {
		t.Errorf("hash length: got %d, want %d", len(h), sha256.Size)
	}
}

func TestHashCode_NormalizesDashes(t *testing.T) {
	h1 := hashCode("ABCD-EFGH-JKLM")
	h2 := hashCode("ABCDEFGHJKLM")
	if !equalBytes(h1, h2) {
		t.Error("hashing with and without dashes should be equivalent")
	}
}

func TestHashCode_NormalizesCase(t *testing.T) {
	h1 := hashCode("abcd-efgh-jklm")
	h2 := hashCode("ABCD-EFGH-JKLM")
	if !equalBytes(h1, h2) {
		t.Error("hashing should be case-insensitive")
	}
}

func TestHashCode_NormalizesMixedCase(t *testing.T) {
	h1 := hashCode("AbCd-EfGh-JkLm")
	h2 := hashCode("ABCDEFGHJKLM")
	if !equalBytes(h1, h2) {
		t.Error("mixed case should normalize to same hash as uppercase no-dash")
	}
}

func TestHashCode_DifferentInputsDifferentHashes(t *testing.T) {
	h1 := hashCode("AAAA-BBBB-CCCC")
	h2 := hashCode("XXXX-YYYY-ZZZZ")
	if equalBytes(h1, h2) {
		t.Error("different inputs should produce different hashes")
	}
}

func TestHashCode_MatchesManualSHA256(t *testing.T) {
	// hashCode normalizes by uppercasing and removing dashes, then SHA-256
	input := "test-code-here"
	normalized := strings.ToUpper(strings.ReplaceAll(input, "-", ""))
	expected := sha256.Sum256([]byte(normalized))

	got := hashCode(input)
	if !equalBytes(got, expected[:]) {
		t.Errorf("hash mismatch:\n  got  %x\n  want %x", got, expected[:])
	}
}

// ---------------------------------------------------------------------------
// FormatCodeForDisplay tests
// ---------------------------------------------------------------------------

func TestFormatCodeForDisplay_AlreadyFormatted(t *testing.T) {
	code := "ABCD-EFGH-JKLM"
	got := FormatCodeForDisplay(code)
	if got != "ABCD-EFGH-JKLM" {
		t.Errorf("got %q, want %q", got, "ABCD-EFGH-JKLM")
	}
}

func TestFormatCodeForDisplay_NoDashes(t *testing.T) {
	got := FormatCodeForDisplay("ABCDEFGHJKLM")
	if got != "ABCD-EFGH-JKLM" {
		t.Errorf("got %q, want %q", got, "ABCD-EFGH-JKLM")
	}
}

func TestFormatCodeForDisplay_WrongLength(t *testing.T) {
	// If the clean length is wrong, the input is returned as-is
	tests := []string{"SHORT", "A", "", "ABCDEFGHJKLMN"} // too short or too long
	for _, input := range tests {
		got := FormatCodeForDisplay(input)
		if got != input {
			t.Errorf("input %q: expected passthrough, got %q", input, got)
		}
	}
}

func TestFormatCodeForDisplay_ExactSegmentLength(t *testing.T) {
	// Exactly CodeSegmentLength * CodeSegments = 12 chars
	got := FormatCodeForDisplay("AABBCCDDEEFF")
	want := "AABB-CCDD-EEFF"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

// ---------------------------------------------------------------------------
// HexHash tests
// ---------------------------------------------------------------------------

func TestHexHash_MatchesStdlib(t *testing.T) {
	data := []byte{0xDE, 0xAD, 0xBE, 0xEF}
	got := HexHash(data)
	want := hex.EncodeToString(data)
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestHexHash_EmptySlice(t *testing.T) {
	got := HexHash([]byte{})
	if got != "" {
		t.Errorf("expected empty string for empty slice, got %q", got)
	}
}

func TestHexHash_SHA256OutputLength(t *testing.T) {
	hash := hashCode("ABCDEFGHJKLM")
	hexStr := HexHash(hash)
	// SHA-256 produces 32 bytes = 64 hex characters
	if len(hexStr) != 64 {
		t.Errorf("hex length: got %d, want 64", len(hexStr))
	}
}

func TestHexHash_Lowercase(t *testing.T) {
	hash := []byte{0xAB, 0xCD, 0xEF}
	got := HexHash(hash)
	if got != strings.ToLower(got) {
		t.Errorf("expected lowercase hex, got %q", got)
	}
}

// ---------------------------------------------------------------------------
// Constants sanity checks
// ---------------------------------------------------------------------------

func TestConstants(t *testing.T) {
	if NumRecoveryCodes != 10 {
		t.Errorf("NumRecoveryCodes: got %d, want 10", NumRecoveryCodes)
	}
	if CodeSegmentLength != 4 {
		t.Errorf("CodeSegmentLength: got %d, want 4", CodeSegmentLength)
	}
	if CodeSegments != 3 {
		t.Errorf("CodeSegments: got %d, want 3", CodeSegments)
	}
}

// ---------------------------------------------------------------------------
// NewService constructor
// ---------------------------------------------------------------------------

func TestNewService_NilDB(t *testing.T) {
	svc := NewService(nil)
	if svc == nil {
		t.Fatal("expected non-nil Service")
	}
	if svc.db != nil {
		t.Error("expected nil db when constructed with nil")
	}
}

// ---------------------------------------------------------------------------
// RecoveryCode struct fields
// ---------------------------------------------------------------------------

func TestRecoveryCode_ZeroValue(t *testing.T) {
	var rc RecoveryCode
	if rc.ID != 0 {
		t.Error("zero value ID should be 0")
	}
	if rc.UsedAt != nil {
		t.Error("zero value UsedAt should be nil")
	}
	if rc.CodeIndex != 0 {
		t.Error("zero value CodeIndex should be 0")
	}
}

// ---------------------------------------------------------------------------
// Integration-style: generate then hash, then verify format round-trip
// ---------------------------------------------------------------------------

func TestGenerateAndHash_RoundTrip(t *testing.T) {
	code := generateCode()

	// Hash the code
	h := hashCode(code)
	if len(h) != sha256.Size {
		t.Fatalf("hash length %d, want %d", len(h), sha256.Size)
	}

	// Hash again -- should match
	h2 := hashCode(code)
	if !equalBytes(h, h2) {
		t.Error("hashing the same generated code twice should match")
	}

	// Format round-trip
	clean := strings.ReplaceAll(code, "-", "")
	formatted := FormatCodeForDisplay(clean)
	if formatted != code {
		t.Errorf("format round-trip failed: %q -> %q -> %q", code, clean, formatted)
	}

	// Hash of formatted version should match original
	h3 := hashCode(formatted)
	if !equalBytes(h, h3) {
		t.Error("hash of formatted code should match original")
	}
}

func TestGenerateCode_AllSegmentsValidChars(t *testing.T) {
	validChars := "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	for i := 0; i < 100; i++ {
		code := generateCode()
		clean := strings.ReplaceAll(code, "-", "")
		for _, ch := range clean {
			if !strings.ContainsRune(validChars, ch) {
				t.Errorf("code %q contains invalid char %q", code, string(ch))
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func equalBytes(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
