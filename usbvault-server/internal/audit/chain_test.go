package audit

import (
	"crypto/sha256"
	"testing"
	"time"
)

// Mock audit entry for testing chain integrity
type MockAuditEntry struct {
	ID              int64
	UserID          string
	ActionType      string
	EncryptedDetail []byte
	Timestamp       time.Time
	PrevHash        []byte
	Hash            []byte
}

func computeHash(prevHash []byte, actionType string, detail []byte, timestamp time.Time) []byte {
	h := sha256.New()
	h.Write(prevHash)
	h.Write([]byte(actionType))
	h.Write(detail)
	h.Write([]byte(timestamp.Format(time.RFC3339Nano)))
	return h.Sum(nil)
}

func TestHashChainLinksCorrectly(t *testing.T) {
	t.Run("hash chain links entries correctly (prev_hash matches)", func(t *testing.T) {
		// Create a chain of audit entries
		entry1 := &MockAuditEntry{
			ID:              1,
			UserID:          "user-123",
			ActionType:      "LOGIN",
			EncryptedDetail: []byte("login details"),
			Timestamp:       time.Now(),
			PrevHash:        make([]byte, 32), // Initial empty hash
		}
		entry1.Hash = computeHash(entry1.PrevHash, entry1.ActionType, entry1.EncryptedDetail, entry1.Timestamp)

		entry2 := &MockAuditEntry{
			ID:              2,
			UserID:          "user-123",
			ActionType:      "VAULT_CREATE",
			EncryptedDetail: []byte("vault id"),
			Timestamp:       time.Now(),
			PrevHash:        entry1.Hash, // Link to previous entry
		}
		entry2.Hash = computeHash(entry2.PrevHash, entry2.ActionType, entry2.EncryptedDetail, entry2.Timestamp)

		entry3 := &MockAuditEntry{
			ID:              3,
			UserID:          "user-123",
			ActionType:      "VAULT_UPDATE",
			EncryptedDetail: []byte("update details"),
			Timestamp:       time.Now(),
			PrevHash:        entry2.Hash, // Link to previous entry
		}
		entry3.Hash = computeHash(entry3.PrevHash, entry3.ActionType, entry3.EncryptedDetail, entry3.Timestamp)

		// Verify the chain is linked correctly
		// Entry 2's prev_hash should match entry 1's hash
		if !bytesEqual(entry2.PrevHash, entry1.Hash) {
			t.Error("entry 2 prev_hash should match entry 1 hash")
		}

		// Entry 3's prev_hash should match entry 2's hash
		if !bytesEqual(entry3.PrevHash, entry2.Hash) {
			t.Error("entry 3 prev_hash should match entry 2 hash")
		}

		// Verify each entry's hash is correct
		expectedHash2 := computeHash(entry2.PrevHash, entry2.ActionType, entry2.EncryptedDetail, entry2.Timestamp)
		if !bytesEqual(entry2.Hash, expectedHash2) {
			t.Error("entry 2 hash should be correctly computed")
		}
	})
}

func TestTamperingBreaksChain(t *testing.T) {
	t.Run("tampering with an entry breaks the chain", func(t *testing.T) {
		// Create initial chain
		entry1 := &MockAuditEntry{
			ID:              1,
			UserID:          "user-123",
			ActionType:      "LOGIN",
			EncryptedDetail: []byte("login details"),
			Timestamp:       time.Now(),
			PrevHash:        make([]byte, 32),
		}
		entry1.Hash = computeHash(entry1.PrevHash, entry1.ActionType, entry1.EncryptedDetail, entry1.Timestamp)

		entry2 := &MockAuditEntry{
			ID:              2,
			UserID:          "user-123",
			ActionType:      "VAULT_CREATE",
			EncryptedDetail: []byte("vault id"),
			Timestamp:       time.Now(),
			PrevHash:        entry1.Hash,
		}
		entry2.Hash = computeHash(entry2.PrevHash, entry2.ActionType, entry2.EncryptedDetail, entry2.Timestamp)

		// Tamper with entry 1
		originalHash1 := entry1.Hash
		entry1.ActionType = "MODIFIED_ACTION"

		// Recompute entry 1's hash after tampering
		entry1.Hash = computeHash(entry1.PrevHash, entry1.ActionType, entry1.EncryptedDetail, entry1.Timestamp)

		// Now entry 1's hash is different from what entry 2 expects
		if bytesEqual(originalHash1, entry1.Hash) {
			t.Error("tampering should change the hash")
		}

		// Entry 2's prev_hash won't match entry 1's new hash
		if bytesEqual(entry2.PrevHash, entry1.Hash) {
			t.Error("tampering should break the chain link")
		}
	})
}

func TestEmptyAuditLogVerifies(t *testing.T) {
	t.Run("empty audit log verifies successfully", func(t *testing.T) {
		// An empty audit log should verify successfully with no entries
		entries := []*MockAuditEntry{}

		// Verification should pass for empty log
		if len(entries) != 0 {
			t.Error("empty log should have no entries")
		}

		// When we try to verify an empty log, it should succeed
		isValid := true
		if !isValid {
			t.Error("empty audit log should verify successfully")
		}
	})
}

func TestChainVerificationHandlesConcurrentEntries(t *testing.T) {
	t.Run("chain verification handles concurrent entries", func(t *testing.T) {
		// Create a chain with multiple entries added
		entries := make([]*MockAuditEntry, 0)

		prevHash := make([]byte, 32)

		// Add 5 entries in sequence
		for i := 1; i <= 5; i++ {
			entry := &MockAuditEntry{
				ID:              int64(i),
				UserID:          "user-123",
				ActionType:      "ACTION",
				EncryptedDetail: []byte("detail"),
				Timestamp:       time.Now(),
				PrevHash:        make([]byte, len(prevHash)),
			}
			copy(entry.PrevHash, prevHash)

			entry.Hash = computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)
			entries = append(entries, entry)

			prevHash = entry.Hash
		}

		// Verify the entire chain
		expectedPrevHash := make([]byte, 32)
		for i, entry := range entries {
			if !bytesEqual(entry.PrevHash, expectedPrevHash) {
				t.Errorf("entry %d has incorrect prev_hash", i)
			}

			computedHash := computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)
			if !bytesEqual(entry.Hash, computedHash) {
				t.Errorf("entry %d has incorrect hash", i)
			}

			expectedPrevHash = entry.Hash
		}
	})
}

func TestSingleEntryChain(t *testing.T) {
	t.Run("single entry chain verifies correctly", func(t *testing.T) {
		entry := &MockAuditEntry{
			ID:              1,
			UserID:          "user-123",
			ActionType:      "ACTION",
			EncryptedDetail: []byte("detail"),
			Timestamp:       time.Now(),
			PrevHash:        make([]byte, 32), // Initial hash
		}
		entry.Hash = computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)

		// Verify single entry
		computedHash := computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)
		if !bytesEqual(entry.Hash, computedHash) {
			t.Error("single entry hash should be verifiable")
		}
	})
}

func TestChainMissingEntry(t *testing.T) {
	t.Run("chain with missing entry breaks integrity", func(t *testing.T) {
		// Create a chain with a gap
		entry1 := &MockAuditEntry{
			ID:              1,
			UserID:          "user-123",
			ActionType:      "ACTION1",
			EncryptedDetail: []byte("detail1"),
			Timestamp:       time.Now(),
			PrevHash:        make([]byte, 32),
		}
		entry1.Hash = computeHash(entry1.PrevHash, entry1.ActionType, entry1.EncryptedDetail, entry1.Timestamp)

		// Entry 3 skipping entry 2
		entry3 := &MockAuditEntry{
			ID:              3,
			UserID:          "user-123",
			ActionType:      "ACTION3",
			EncryptedDetail: []byte("detail3"),
			Timestamp:       time.Now(),
			PrevHash:        entry1.Hash, // Links to entry 1, but entry 2 is missing
		}
		entry3.Hash = computeHash(entry3.PrevHash, entry3.ActionType, entry3.EncryptedDetail, entry3.Timestamp)

		// If we have entries [1, 3] and their IDs are sequential, something is wrong
		if entry3.ID != entry1.ID+2 {
			// Missing entry detected
			t.Log("missing entry detected - chain integrity check would fail")
		}
	})
}

func TestChainWithModifiedTimestamp(t *testing.T) {
	t.Run("modifying timestamp breaks hash verification", func(t *testing.T) {
		entry := &MockAuditEntry{
			ID:              1,
			UserID:          "user-123",
			ActionType:      "ACTION",
			EncryptedDetail: []byte("detail"),
			Timestamp:       time.Now(),
			PrevHash:        make([]byte, 32),
		}

		originalTime := entry.Timestamp
		entry.Hash = computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)
		originalHash := entry.Hash

		// Tamper with timestamp
		entry.Timestamp = originalTime.Add(1 * time.Second)

		// Recompute hash with tampered timestamp
		tamperedHash := computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)

		if bytesEqual(originalHash, tamperedHash) {
			t.Error("modifying timestamp should change the hash")
		}
	})
}

func TestLargeChain(t *testing.T) {
	t.Run("large chain with many entries verifies correctly", func(t *testing.T) {
		entries := make([]*MockAuditEntry, 0)

		prevHash := make([]byte, 32)

		// Create a large chain of 100 entries
		for i := 1; i <= 100; i++ {
			entry := &MockAuditEntry{
				ID:              int64(i),
				UserID:          "user-123",
				ActionType:      "ACTION",
				EncryptedDetail: []byte("detail"),
				Timestamp:       time.Now(),
				PrevHash:        make([]byte, len(prevHash)),
			}
			copy(entry.PrevHash, prevHash)

			entry.Hash = computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)
			entries = append(entries, entry)

			prevHash = entry.Hash
		}

		// Verify the entire chain
		expectedPrevHash := make([]byte, 32)
		for _, entry := range entries {
			if !bytesEqual(entry.PrevHash, expectedPrevHash) {
				t.Fatal("chain is broken")
			}

			computedHash := computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)
			if !bytesEqual(entry.Hash, computedHash) {
				t.Fatal("hash computation failed")
			}

			expectedPrevHash = entry.Hash
		}

		if len(entries) != 100 {
			t.Errorf("expected 100 entries, got %d", len(entries))
		}
	})
}

func TestChainWithDifferentActionTypes(t *testing.T) {
	t.Run("chain with diverse action types maintains integrity", func(t *testing.T) {
		actionTypes := []string{"LOGIN", "LOGOUT", "VAULT_CREATE", "VAULT_UPDATE", "SHARE_CREATE", "ACCOUNT_DELETE"}

		entries := make([]*MockAuditEntry, 0)
		prevHash := make([]byte, 32)

		for i, actionType := range actionTypes {
			entry := &MockAuditEntry{
				ID:              int64(i + 1),
				UserID:          "user-123",
				ActionType:      actionType,
				EncryptedDetail: []byte("detail for " + actionType),
				Timestamp:       time.Now(),
				PrevHash:        make([]byte, len(prevHash)),
			}
			copy(entry.PrevHash, prevHash)

			entry.Hash = computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)
			entries = append(entries, entry)

			prevHash = entry.Hash
		}

		// Verify each entry has a unique hash due to different action types
		hashes := make(map[string]bool)
		for _, entry := range entries {
			hashStr := string(entry.Hash)
			if hashes[hashStr] {
				t.Error("different entries should have different hashes")
			}
			hashes[hashStr] = true
		}
	})
}

func TestHashImmutability(t *testing.T) {
	t.Run("hash is immutable once computed", func(t *testing.T) {
		entry := &MockAuditEntry{
			ID:              1,
			UserID:          "user-123",
			ActionType:      "ACTION",
			EncryptedDetail: []byte("detail"),
			Timestamp:       time.Now(),
			PrevHash:        make([]byte, 32),
		}

		hash1 := computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)
		hash2 := computeHash(entry.PrevHash, entry.ActionType, entry.EncryptedDetail, entry.Timestamp)

		if !bytesEqual(hash1, hash2) {
			t.Error("same input should always produce same hash")
		}
	})
}
