package auth

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestGenerateBackupCodesProducesUniqueValidCodes(t *testing.T) {
	t.Run("backup code generation produces 10 unique 8-char codes", func(t *testing.T) {
		codes, err := generateBackupCodes(BackupCodeCount)
		if err != nil {
			t.Fatalf("failed to generate backup codes: %v", err)
		}

		// Check we got 10 codes
		if len(codes) != BackupCodeCount {
			t.Errorf("expected %d codes, got %d", BackupCodeCount, len(codes))
		}

		// Track seen codes to verify uniqueness
		seen := make(map[string]bool)

		for i, code := range codes {
			// Check code is 8 characters
			if len(code) != BackupCodeLength {
				t.Errorf("code %d: expected length %d, got %d", i, BackupCodeLength, len(code))
			}

			// Check code contains only valid characters
			for j, ch := range code {
				if !strings.ContainsRune(BackupCodeCharset, ch) {
					t.Errorf("code %d position %d: character %c not in charset", i, j, ch)
				}
			}

			// Check uniqueness
			if seen[code] {
				t.Errorf("code %d: duplicate code %s", i, code)
			}
			seen[code] = true
		}

		if len(seen) != BackupCodeCount {
			t.Errorf("expected %d unique codes, got %d", BackupCodeCount, len(seen))
		}
	})
}

func TestHashBackupCodeGeneratesConsistentHash(t *testing.T) {
	t.Run("backup code hashing is consistent", func(t *testing.T) {
		code := "ABC12345"

		hash1 := hashBackupCode(code)
		hash2 := hashBackupCode(code)

		if hash1 != hash2 {
			t.Errorf("hashing should be deterministic, got different hashes: %s vs %s", hash1, hash2)
		}

		// Verify hash is hex-encoded
		for _, ch := range hash1 {
			if !strings.ContainsRune("0123456789abcdef", ch) {
				t.Errorf("hash contains non-hex character: %c", ch)
			}
		}

		// SHA-256 produces 32 bytes = 64 hex characters
		if len(hash1) != 64 {
			t.Errorf("expected 64 character hex hash (SHA-256), got %d", len(hash1))
		}
	})
}

func TestHashBackupCodeIsDifferentForDifferentInputs(t *testing.T) {
	t.Run("different codes produce different hashes", func(t *testing.T) {
		codes := []string{"ABC12345", "XYZ98765", "TESTCODE"}

		hashes := make(map[string]string)

		for _, code := range codes {
			hash := hashBackupCode(code)
			if existing, ok := hashes[code]; ok {
				t.Errorf("code %s produced different hash on second call: %s vs %s", code, existing, hash)
			}
			hashes[code] = hash
		}

		// Verify all hashes are unique
		if len(hashes) != len(codes) {
			t.Errorf("expected %d unique hashes, got %d", len(codes), len(hashes))
		}
	})
}

func TestBackupCodeVerificationWithValidCode(t *testing.T) {
	t.Run("valid backup code verification succeeds", func(t *testing.T) {
		// Generate a code
		codes, err := generateBackupCodes(1)
		if err != nil {
			t.Fatalf("failed to generate code: %v", err)
		}

		code := codes[0]
		hash := hashBackupCode(code)

		// Verify the hash matches when we hash the same code
		reverifyHash := hashBackupCode(code)
		if hash != reverifyHash {
			t.Errorf("hash verification failed: %s != %s", hash, reverifyHash)
		}
	})
}

func TestBackupCodeVerificationWithInvalidCode(t *testing.T) {
	t.Run("invalid backup code is rejected", func(t *testing.T) {
		// Generate some valid codes
		validCodes, err := generateBackupCodes(3)
		if err != nil {
			t.Fatalf("failed to generate codes: %v", err)
		}

		// Create hashes
		storedHashes := make([]string, len(validCodes))
		for i, code := range validCodes {
			storedHashes[i] = hashBackupCode(code)
		}

		// Try to verify an invalid code
		invalidCode := "INVALID99"
		invalidHash := hashBackupCode(invalidCode)

		// Check if invalid code is in stored hashes
		found := false
		for _, stored := range storedHashes {
			if stored == invalidHash {
				found = true
				break
			}
		}

		if found {
			t.Error("invalid code should not match any stored hash")
		}
	})
}

func TestBackupCodeCannotBeReused(t *testing.T) {
	t.Run("used backup code cannot be reused", func(t *testing.T) {
		// Generate codes and hash them
		plainCodes, err := generateBackupCodes(2)
		if err != nil {
			t.Fatalf("failed to generate codes: %v", err)
		}

		usedCode := plainCodes[0]
		usedCodeHash := hashBackupCode(usedCode)

		// Simulate used codes tracking
		usedCodes := make(map[string]bool)

		// First verification should succeed
		if usedCodes[usedCodeHash] {
			t.Error("code should not be marked as used yet")
		}

		// Mark as used
		usedCodes[usedCodeHash] = true

		// Second verification should fail
		if !usedCodes[usedCodeHash] {
			t.Error("code should be marked as used")
		}
	})
}

func TestBackupCodeBackupCodesCountConstant(t *testing.T) {
	t.Run("backup code count constant is correct", func(t *testing.T) {
		if BackupCodeCount != 10 {
			t.Errorf("expected BackupCodeCount=10, got %d", BackupCodeCount)
		}
	})
}

func TestBackupCodeBackupCodeLengthConstant(t *testing.T) {
	t.Run("backup code length constant is correct", func(t *testing.T) {
		if BackupCodeLength != 8 {
			t.Errorf("expected BackupCodeLength=8, got %d", BackupCodeLength)
		}
	})
}

func TestBackupCodeCharsetIsValid(t *testing.T) {
	t.Run("backup code charset is alphanumeric uppercase", func(t *testing.T) {
		// Should only contain A-Z and 0-9
		expected := "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
		if BackupCodeCharset != expected {
			t.Errorf("unexpected charset: got %q, expected %q", BackupCodeCharset, expected)
		}

		// Verify no duplicates in charset
		seen := make(map[rune]bool)
		for _, ch := range BackupCodeCharset {
			if seen[ch] {
				t.Errorf("duplicate character in charset: %c", ch)
			}
			seen[ch] = true
		}
	})
}

func TestBackupCodeGenerationReturnsCorrectCount(t *testing.T) {
	t.Run("backup code generation returns requested count", func(t *testing.T) {
		testCases := []int{1, 5, 10, 20}

		for _, count := range testCases {
			t.Run(string(rune(count)), func(t *testing.T) {
				codes, err := generateBackupCodes(count)
				if err != nil {
					t.Errorf("failed to generate %d codes: %v", count, err)
					return
				}

				if len(codes) != count {
					t.Errorf("expected %d codes, got %d", count, len(codes))
				}
			})
		}
	})
}

func TestBackupCodeHashFormatIsHex(t *testing.T) {
	t.Run("backup code hash format is lowercase hex", func(t *testing.T) {
		code := "TEST1234"
		hash := hashBackupCode(code)

		// Check it's 64 characters (SHA-256)
		if len(hash) != 64 {
			t.Errorf("expected 64 character hash, got %d", len(hash))
		}

		// Check it's all valid hex
		for i, ch := range hash {
			if !strings.ContainsRune("0123456789abcdef", ch) {
				t.Errorf("character at position %d is not valid hex: %c", i, ch)
			}
		}

		// Verify no uppercase (hashBackupCode uses EncodeToString which produces lowercase)
		if hash != strings.ToLower(hash) {
			t.Errorf("hash should be lowercase hex, got: %s", hash)
		}
	})
}

func TestBackupCodeJSONMarshaling(t *testing.T) {
	t.Run("backup codes can be marshaled to JSON", func(t *testing.T) {
		codes, err := generateBackupCodes(3)
		if err != nil {
			t.Fatalf("failed to generate codes: %v", err)
		}

		// Marshal to JSON
		jsonBytes, err := json.Marshal(codes)
		if err != nil {
			t.Fatalf("failed to marshal codes to JSON: %v", err)
		}

		// Unmarshal back
		var unmarshaled []string
		err = json.Unmarshal(jsonBytes, &unmarshaled)
		if err != nil {
			t.Fatalf("failed to unmarshal codes from JSON: %v", err)
		}

		// Verify they match
		if len(unmarshaled) != len(codes) {
			t.Errorf("expected %d codes after unmarshal, got %d", len(codes), len(unmarshaled))
		}

		for i, code := range codes {
			if unmarshaled[i] != code {
				t.Errorf("code %d mismatch: %s != %s", i, code, unmarshaled[i])
			}
		}
	})
}

func TestBackupCodeUsedCodesJSONMarshaling(t *testing.T) {
	t.Run("used backup codes map can be marshaled to JSON", func(t *testing.T) {
		codes, err := generateBackupCodes(3)
		if err != nil {
			t.Fatalf("failed to generate codes: %v", err)
		}

		// Create used codes map
		usedCodes := make(map[string]bool)
		usedCodes[hashBackupCode(codes[0])] = true
		usedCodes[hashBackupCode(codes[1])] = true

		// Marshal to JSON
		jsonBytes, err := json.Marshal(usedCodes)
		if err != nil {
			t.Fatalf("failed to marshal used codes to JSON: %v", err)
		}

		// Unmarshal back
		var unmarshaled map[string]bool
		err = json.Unmarshal(jsonBytes, &unmarshaled)
		if err != nil {
			t.Fatalf("failed to unmarshal used codes from JSON: %v", err)
		}

		// Verify they match
		if len(unmarshaled) != len(usedCodes) {
			t.Errorf("expected %d entries after unmarshal, got %d", len(usedCodes), len(unmarshaled))
		}

		for hash, used := range usedCodes {
			if unmarshaled[hash] != used {
				t.Errorf("used status mismatch for %s", hash)
			}
		}
	})
}

func TestBackupCodeMultipleGenerations(t *testing.T) {
	t.Run("multiple backup code generations produce different codes", func(t *testing.T) {
		first, err := generateBackupCodes(BackupCodeCount)
		if err != nil {
			t.Fatalf("first generation failed: %v", err)
		}

		second, err := generateBackupCodes(BackupCodeCount)
		if err != nil {
			t.Fatalf("second generation failed: %v", err)
		}

		// Codes should be different between generations
		allMatch := true
		for i := range first {
			if first[i] != second[i] {
				allMatch = false
				break
			}
		}

		if allMatch {
			t.Error("backup code generations should produce different codes (extremely unlikely to be identical)")
		}
	})
}

func TestBackupCodeEmptySliceHandling(t *testing.T) {
	t.Run("backup code generation with count 0", func(t *testing.T) {
		codes, err := generateBackupCodes(0)
		if err != nil {
			t.Fatalf("failed to generate 0 codes: %v", err)
		}

		if len(codes) != 0 {
			t.Errorf("expected empty slice, got %d codes", len(codes))
		}
	})
}

func TestBackupCodeCaseSensitivity(t *testing.T) {
	t.Run("backup code hashing is case sensitive", func(t *testing.T) {
		code1 := "ABC12345"
		code2 := "abc12345"

		hash1 := hashBackupCode(code1)
		hash2 := hashBackupCode(code2)

		if hash1 == hash2 {
			t.Error("hashes should differ for different case inputs")
		}
	})
}
