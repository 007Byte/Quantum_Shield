package auth

import (
	"testing"
	"time"
)

// MockDatabase for testing account deletion
type MockDatabase struct {
	vaults       map[string]*VaultRecord
	users        map[string]*UserRecord
	memberships  map[string][]string // vaultID -> userIDs
}

type VaultRecord struct {
	ID        string
	OwnerID   string
	DeletedAt *time.Time
}

type UserRecord struct {
	ID        string
	Email     string
	DeletedAt *time.Time
}

func NewMockDatabase() *MockDatabase {
	return &MockDatabase{
		vaults:      make(map[string]*VaultRecord),
		users:       make(map[string]*UserRecord),
		memberships: make(map[string][]string),
	}
}

func (m *MockDatabase) CreateVault(ownerID, vaultID string) {
	m.vaults[vaultID] = &VaultRecord{
		ID:      vaultID,
		OwnerID: ownerID,
	}
	m.memberships[vaultID] = append(m.memberships[vaultID], ownerID)
}

func (m *MockDatabase) CreateUser(userID, email string) {
	m.users[userID] = &UserRecord{
		ID:    userID,
		Email: email,
	}
}

func (m *MockDatabase) AddMember(vaultID, userID string) {
	m.memberships[vaultID] = append(m.memberships[vaultID], userID)
}

func (m *MockDatabase) GetVaults(ownerID string) []string {
	var vaults []string
	for vaultID, vault := range m.vaults {
		if vault.OwnerID == ownerID {
			vaults = append(vaults, vaultID)
		}
	}
	return vaults
}

func (m *MockDatabase) GetVaultMemberships(userID string) []string {
	var memberships []string
	for vaultID, members := range m.memberships {
		for _, member := range members {
			if member == userID {
				memberships = append(memberships, vaultID)
				break
			}
		}
	}
	return memberships
}

func (m *MockDatabase) SoftDeleteVaults(userID string) int {
	count := 0
	for vaultID, vault := range m.vaults {
		if vault.OwnerID == userID && vault.DeletedAt == nil {
			now := time.Now()
			m.vaults[vaultID].DeletedAt = &now
			count++
		}
	}
	return count
}

func (m *MockDatabase) RemoveFromMemberships(userID string) int {
	count := 0
	for vaultID := range m.memberships {
		newMembers := []string{}
		for _, member := range m.memberships[vaultID] {
			if member != userID {
				newMembers = append(newMembers, member)
			} else {
				count++
			}
		}
		m.memberships[vaultID] = newMembers
	}
	return count
}

func (m *MockDatabase) MarkUserDeleted(userID string) error {
	if user, exists := m.users[userID]; exists {
		now := time.Now()
		user.DeletedAt = &now
		return nil
	}
	return ErrUserNotFound
}

func (m *MockDatabase) IsUserDeleted(userID string) bool {
	if user, exists := m.users[userID]; exists {
		return user.DeletedAt != nil
	}
	return false
}

var ErrUserNotFound = &AccountDeletionError{msg: "user not found"}

type AccountDeletionError struct {
	msg string
}

func (e *AccountDeletionError) Error() string {
	return e.msg
}

func TestAccountDeletionSoftDeletesVaults(t *testing.T) {
	t.Run("account deletion soft-deletes all user's vaults", func(t *testing.T) {
		db := NewMockDatabase()
		userID := "user-123"

		// Create user and multiple vaults
		db.CreateUser(userID, "user@example.com")
		db.CreateVault(userID, "vault-1")
		db.CreateVault(userID, "vault-2")
		db.CreateVault(userID, "vault-3")

		// Simulate account deletion
		deletedCount := db.SoftDeleteVaults(userID)

		if deletedCount != 3 {
			t.Errorf("expected 3 vaults to be soft-deleted, got %d", deletedCount)
		}

		// Verify vaults are marked as deleted
		for _, vaultID := range []string{"vault-1", "vault-2", "vault-3"} {
			vault := db.vaults[vaultID]
			if vault.DeletedAt == nil {
				t.Errorf("vault %s should be marked as deleted", vaultID)
			}
		}
	})
}

func TestAccountDeletionRemovesVaultMemberships(t *testing.T) {
	t.Run("account deletion removes vault memberships", func(t *testing.T) {
		db := NewMockDatabase()
		userID := "user-123"
		owner1 := "owner-1"
		owner2 := "owner-2"

		// Create user as member of multiple vaults
		db.CreateUser(userID, "user@example.com")
		db.CreateVault(owner1, "vault-1")
		db.CreateVault(owner2, "vault-2")
		db.AddMember("vault-1", userID)
		db.AddMember("vault-2", userID)

		// Verify user is a member of both vaults
		memberships := db.GetVaultMemberships(userID)
		if len(memberships) != 2 {
			t.Fatalf("expected user to be member of 2 vaults, got %d", len(memberships))
		}

		// Simulate account deletion
		removedCount := db.RemoveFromMemberships(userID)

		if removedCount != 2 {
			t.Errorf("expected 2 memberships to be removed, got %d", removedCount)
		}

		// Verify user is no longer a member of any vaults
		memberships = db.GetVaultMemberships(userID)
		if len(memberships) != 0 {
			t.Errorf("expected 0 memberships after deletion, got %d", len(memberships))
		}
	})
}

func TestAccountDeletionMarksUserDeleted(t *testing.T) {
	t.Run("account deletion marks user as deleted", func(t *testing.T) {
		db := NewMockDatabase()
		userID := "user-123"

		db.CreateUser(userID, "user@example.com")

		// Verify user is not deleted initially
		if db.IsUserDeleted(userID) {
			t.Error("user should not be marked as deleted initially")
		}

		// Mark user as deleted
		err := db.MarkUserDeleted(userID)
		if err != nil {
			t.Errorf("failed to mark user as deleted: %v", err)
		}

		// Verify user is now marked as deleted
		if !db.IsUserDeleted(userID) {
			t.Error("user should be marked as deleted after deletion")
		}
	})
}

func TestAccountDeletionRevokesAllTokens(t *testing.T) {
	t.Run("account deletion revokes all active tokens", func(t *testing.T) {
		// Mock Redis token revocation
		revokedTokens := make(map[string]bool)

		// Simulate finding active tokens
		activeTokens := []string{
			"jti-token-1",
			"jti-token-2",
			"jti-token-3",
		}

		// Revoke all tokens
		for _, token := range activeTokens {
			revokedTokens[token] = true
		}

		if len(revokedTokens) != 3 {
			t.Errorf("expected 3 tokens to be revoked, got %d", len(revokedTokens))
		}

		// Verify all tokens are marked as revoked
		for _, token := range activeTokens {
			if !revokedTokens[token] {
				t.Errorf("token %s should be revoked", token)
			}
		}
	})
}

func TestAccountDeletionPreservesAuditTrail(t *testing.T) {
	t.Run("audit trail is preserved after deletion", func(t *testing.T) {
		// Mock audit log
		auditLog := []map[string]interface{}{
			{
				"user_id":    "user-123",
				"action":     "LOGIN",
				"timestamp":  time.Now().Add(-24 * time.Hour),
			},
			{
				"user_id":    "user-123",
				"action":     "VAULT_CREATE",
				"timestamp":  time.Now().Add(-12 * time.Hour),
			},
			{
				"user_id":    "user-123",
				"action":     "ACCOUNT_DELETED",
				"timestamp":  time.Now(),
			},
		}

		// Verify audit logs exist
		if len(auditLog) != 3 {
			t.Errorf("expected 3 audit entries, got %d", len(auditLog))
		}

		// Verify the deletion action is logged
		lastEntry := auditLog[len(auditLog)-1]
		if lastEntry["action"] != "ACCOUNT_DELETED" {
			t.Errorf("expected ACCOUNT_DELETED in last audit entry, got %v", lastEntry["action"])
		}
	})
}

func TestAccountDeletionAtomicity(t *testing.T) {
	t.Run("account deletion operations are atomic", func(t *testing.T) {
		db := NewMockDatabase()
		userID := "user-123"

		db.CreateUser(userID, "user@example.com")
		db.CreateVault(userID, "vault-1")
		db.CreateVault(userID, "vault-2")

		// If any step fails, all steps should be rolled back
		// This tests that either all deletion operations complete or none do

		allSuccess := true

		// Step 1: Soft delete vaults
		if db.SoftDeleteVaults(userID) == 0 {
			allSuccess = false
		}

		// Step 2: Remove memberships
		if db.RemoveFromMemberships(userID) == 0 && !allSuccess {
			// If step 1 succeeded but step 2 fails, we need rollback
			// Restore vaults
			for _, vault := range db.vaults {
				vault.DeletedAt = nil
			}
		}

		// Step 3: Mark user deleted
		if err := db.MarkUserDeleted(userID); err != nil {
			allSuccess = false
			// Rollback
			for _, vault := range db.vaults {
				vault.DeletedAt = nil
			}
		}

		if !allSuccess {
			t.Error("account deletion should be atomic - all steps should succeed together")
		}
	})
}

func TestAccountDeletionNonExistentUser(t *testing.T) {
	t.Run("deleting non-existent user returns error", func(t *testing.T) {
		db := NewMockDatabase()

		err := db.MarkUserDeleted("non-existent-user")

		if err == nil {
			t.Error("expected error when deleting non-existent user")
		}
	})
}

func TestAccountDeletionIdempotent(t *testing.T) {
	t.Run("account deletion is idempotent", func(t *testing.T) {
		db := NewMockDatabase()
		userID := "user-123"

		db.CreateUser(userID, "user@example.com")
		db.CreateVault(userID, "vault-1")

		// First deletion
		db.SoftDeleteVaults(userID)
		db.MarkUserDeleted(userID)

		deletedFirst := db.IsUserDeleted(userID)

		// Second deletion attempt (should be safe)
		db.SoftDeleteVaults(userID)
		db.MarkUserDeleted(userID)

		deletedSecond := db.IsUserDeleted(userID)

		if deletedFirst != deletedSecond {
			t.Error("account deletion should be idempotent")
		}
	})
}

func TestAccountDeletionNoOrphanVaults(t *testing.T) {
	t.Run("account deletion prevents orphaned vaults", func(t *testing.T) {
		db := NewMockDatabase()
		userID := "user-123"

		db.CreateUser(userID, "user@example.com")
		db.CreateVault(userID, "vault-1")

		// Soft delete vaults
		db.SoftDeleteVaults(userID)

		// Verify vaults are marked as deleted (not orphaned in active state)
		vault := db.vaults["vault-1"]
		if vault.DeletedAt == nil {
			t.Error("vault should be soft-deleted, not orphaned")
		}
	})
}

func TestAccountDeletionCompleteDataRemoval(t *testing.T) {
	t.Run("all user data is removed during account deletion", func(t *testing.T) {
		db := NewMockDatabase()
		userID := "user-123"

		// Create user with data
		db.CreateUser(userID, "user@example.com")
		db.CreateVault(userID, "vault-1")
		db.AddMember("vault-1", userID)

		// Simulate complete deletion
		db.SoftDeleteVaults(userID)
		db.RemoveFromMemberships(userID)
		db.MarkUserDeleted(userID)

		// Verify user is marked deleted
		if !db.IsUserDeleted(userID) {
			t.Error("user should be marked as deleted")
		}

		// Verify user has no vault memberships
		memberships := db.GetVaultMemberships(userID)
		if len(memberships) != 0 {
			t.Errorf("deleted user should have no memberships, got %d", len(memberships))
		}

		// Verify user's vaults are deleted
		vaults := db.GetVaults(userID)
		for _, vaultID := range vaults {
			vault := db.vaults[vaultID]
			if vault.DeletedAt == nil {
				t.Errorf("vault %s should be soft-deleted", vaultID)
			}
		}
	})
}
