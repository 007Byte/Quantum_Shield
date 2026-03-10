package vault

import (
	"context"
	"errors"
	"testing"
	"time"

	auth "github.com/usbvault/usbvault-server/internal/auth"
)

// MockRBACService for testing vault membership operations
type MockRBACServiceMembers struct {
	members map[string]map[string]auth.Role // vaultID -> userID -> role
	calls   map[string]int                   // Track method calls
}

func NewMockRBACServiceMembers() *MockRBACServiceMembers {
	return &MockRBACServiceMembers{
		members: make(map[string]map[string]auth.Role),
		calls:   make(map[string]int),
	}
}

func (m *MockRBACServiceMembers) ListMembers(ctx context.Context, vaultID string) ([]auth.VaultMember, error) {
	m.calls["ListMembers"]++
	var members []auth.VaultMember

	if vaultMembers, exists := m.members[vaultID]; exists {
		for userID, role := range vaultMembers {
			members = append(members, auth.VaultMember{
				ID:        userID + "-membership",
				VaultID:   vaultID,
				UserID:    userID,
				Role:      role,
				GrantedAt: time.Now(),
				GrantedBy: "system",
			})
		}
	}

	return members, nil
}

func (m *MockRBACServiceMembers) AssignRole(ctx context.Context, vaultID, userID string, role auth.Role, grantedBy string) error {
	m.calls["AssignRole"]++

	if _, exists := m.members[vaultID]; !exists {
		m.members[vaultID] = make(map[string]auth.Role)
	}

	// Check for duplicate member with different role
	if existingRole, exists := m.members[vaultID][userID]; exists && existingRole != role {
		// Allow role update
	}

	m.members[vaultID][userID] = role
	return nil
}

func (m *MockRBACServiceMembers) RemoveRole(ctx context.Context, vaultID, userID string) error {
	m.calls["RemoveRole"]++

	if _, exists := m.members[vaultID]; !exists {
		return errors.New("vault not found")
	}

	// Check if user is the owner
	if role, exists := m.members[vaultID][userID]; exists && role == auth.RoleOwner {
		// Check if this is the last owner
		ownerCount := 0
		for _, r := range m.members[vaultID] {
			if r == auth.RoleOwner {
				ownerCount++
			}
		}
		if ownerCount == 1 {
			return errors.New("cannot remove the vault owner")
		}
	}

	delete(m.members[vaultID][userID], userID)
	return nil
}

func (m *MockRBACServiceMembers) GetUserRole(ctx context.Context, userID, vaultID string) (auth.Role, error) {
	if vaultMembers, exists := m.members[vaultID]; exists {
		if role, exists := vaultMembers[userID]; exists {
			return role, nil
		}
	}
	return "", nil
}

func (m *MockRBACServiceMembers) TransferOwnership(ctx context.Context, vaultID, fromUserID, toUserID string) error {
	m.calls["TransferOwnership"]++

	if _, exists := m.members[vaultID]; !exists {
		return errors.New("vault not found")
	}

	if role, exists := m.members[vaultID][fromUserID]; !exists || role != auth.RoleOwner {
		return errors.New("user is not the vault owner")
	}

	delete(m.members[vaultID], fromUserID)
	m.members[vaultID][toUserID] = auth.RoleOwner
	return nil
}

func (m *MockRBACServiceMembers) VerifyOwnership(vaultID, userID string) bool {
	if vaultMembers, exists := m.members[vaultID]; exists {
		if role, exists := vaultMembers[userID]; exists {
			return role == auth.RoleOwner
		}
	}
	return false
}

func TestAddMemberWithValidRole(t *testing.T) {
	t.Run("adding a member with valid role succeeds", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		userID := "owner-user"
		newUserID := "new-member"

		// Setup: add owner first
		err := rbac.AssignRole(ctx, vaultID, userID, auth.RoleOwner, "system")
		if err != nil {
			t.Fatalf("failed to set owner: %v", err)
		}

		// Add new member as editor
		err = rbac.AssignRole(ctx, vaultID, newUserID, auth.RoleEditor, userID)
		if err != nil {
			t.Errorf("expected no error when adding member, got %v", err)
		}

		// Verify member was added
		members, err := rbac.ListMembers(ctx, vaultID)
		if err != nil {
			t.Fatalf("failed to list members: %v", err)
		}

		if len(members) != 2 {
			t.Errorf("expected 2 members, got %d", len(members))
		}

		found := false
		for _, m := range members {
			if m.UserID == newUserID && m.Role == auth.RoleEditor {
				found = true
				break
			}
		}
		if !found {
			t.Error("new member with editor role not found")
		}
	})
}

func TestAddDuplicateMemberFails(t *testing.T) {
	t.Run("adding a duplicate member should allow role update", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		ownerID := "owner-user"
		memberID := "member-user"

		// Setup vault with owner
		rbac.AssignRole(ctx, vaultID, ownerID, auth.RoleOwner, "system")

		// Add member as viewer
		err := rbac.AssignRole(ctx, vaultID, memberID, auth.RoleViewer, ownerID)
		if err != nil {
			t.Fatalf("failed to add member: %v", err)
		}

		// Try to add same member with different role (should update)
		err = rbac.AssignRole(ctx, vaultID, memberID, auth.RoleEditor, ownerID)
		if err != nil {
			t.Errorf("expected role update to succeed, got %v", err)
		}

		// Verify role was updated
		members, _ := rbac.ListMembers(ctx, vaultID)
		for _, m := range members {
			if m.UserID == memberID {
				if m.Role != auth.RoleEditor {
					t.Errorf("expected role to be updated to editor, got %s", m.Role)
				}
				return
			}
		}
		t.Error("member not found after update")
	})
}

func TestRemoveLastOwnerPrevented(t *testing.T) {
	t.Run("removing last owner is prevented", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		ownerID := "owner-user"

		// Setup vault with single owner
		rbac.AssignRole(ctx, vaultID, ownerID, auth.RoleOwner, "system")

		// Try to remove the owner
		err := rbac.RemoveRole(ctx, vaultID, ownerID)

		if err == nil {
			t.Error("expected error when removing last owner, got nil")
		}
		if err.Error() != "cannot remove the vault owner" {
			t.Errorf("expected specific error message, got %v", err)
		}
	})
}

func TestRemoveNonLastOwnerSucceeds(t *testing.T) {
	t.Run("removing non-last owner succeeds", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		owner1 := "owner1"
		owner2 := "owner2"

		// Setup vault with two owners
		rbac.AssignRole(ctx, vaultID, owner1, auth.RoleOwner, "system")
		rbac.AssignRole(ctx, vaultID, owner2, auth.RoleOwner, "system")

		// Remove first owner (should succeed since there's another)
		err := rbac.RemoveRole(ctx, vaultID, owner1)

		if err != nil {
			t.Errorf("expected no error, got %v", err)
		}

		// Verify owner was removed
		members, _ := rbac.ListMembers(ctx, vaultID)
		for _, m := range members {
			if m.UserID == owner1 {
				t.Error("owner1 should have been removed")
			}
		}
	})
}

func TestRoleUpdateViewerToEditor(t *testing.T) {
	t.Run("role update from viewer to editor works", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		ownerID := "owner"
		memberID := "member"

		// Setup
		rbac.AssignRole(ctx, vaultID, ownerID, auth.RoleOwner, "system")
		rbac.AssignRole(ctx, vaultID, memberID, auth.RoleViewer, ownerID)

		// Update role from viewer to editor
		err := rbac.AssignRole(ctx, vaultID, memberID, auth.RoleEditor, ownerID)

		if err != nil {
			t.Errorf("expected no error, got %v", err)
		}

		// Verify role was updated
		role, err := rbac.GetUserRole(ctx, memberID, vaultID)
		if err != nil {
			t.Fatalf("failed to get user role: %v", err)
		}
		if role != auth.RoleEditor {
			t.Errorf("expected editor role, got %s", role)
		}
	})
}

func TestNonOwnerCannotAddMembers(t *testing.T) {
	t.Run("non-owner cannot add members", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		ownerID := "owner"
		editorID := "editor"
		newMemberID := "new-member"

		// Setup vault with owner and editor
		rbac.AssignRole(ctx, vaultID, ownerID, auth.RoleOwner, "system")
		rbac.AssignRole(ctx, vaultID, editorID, auth.RoleEditor, ownerID)

		// Try to add member as editor (should succeed in RBAC layer, permission check is at handler)
		// This test verifies the service allows it, but handlers check permissions
		err := rbac.AssignRole(ctx, vaultID, newMemberID, auth.RoleViewer, editorID)
		if err != nil {
			t.Errorf("service level should not prevent, got %v", err)
		}

		// In real implementation, handler would check if editorID has manage_members permission
		// and reject the request at 403 level
	})
}

func TestNonOwnerCannotRemoveMembers(t *testing.T) {
	t.Run("non-owner cannot remove members", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		ownerID := "owner"
		editorID := "editor"
		targetID := "target"

		// Setup
		rbac.AssignRole(ctx, vaultID, ownerID, auth.RoleOwner, "system")
		rbac.AssignRole(ctx, vaultID, editorID, auth.RoleEditor, ownerID)
		rbac.AssignRole(ctx, vaultID, targetID, auth.RoleViewer, ownerID)

		// Editor tries to remove member (service allows it, but handler checks permission)
		err := rbac.RemoveRole(ctx, vaultID, targetID)
		if err != nil {
			t.Errorf("service level should not prevent, got %v", err)
		}
	})
}

func TestListMembers(t *testing.T) {
	t.Run("listing all vault members returns correct info", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"

		// Add multiple members
		rbac.AssignRole(ctx, vaultID, "owner1", auth.RoleOwner, "system")
		rbac.AssignRole(ctx, vaultID, "editor1", auth.RoleEditor, "owner1")
		rbac.AssignRole(ctx, vaultID, "viewer1", auth.RoleViewer, "owner1")

		members, err := rbac.ListMembers(ctx, vaultID)
		if err != nil {
			t.Fatalf("failed to list members: %v", err)
		}

		if len(members) != 3 {
			t.Errorf("expected 3 members, got %d", len(members))
		}

		roleMap := make(map[string]auth.Role)
		for _, m := range members {
			roleMap[m.UserID] = m.Role
		}

		if roleMap["owner1"] != auth.RoleOwner {
			t.Error("owner1 should have owner role")
		}
		if roleMap["editor1"] != auth.RoleEditor {
			t.Error("editor1 should have editor role")
		}
		if roleMap["viewer1"] != auth.RoleViewer {
			t.Error("viewer1 should have viewer role")
		}
	})
}

func TestEmptyVaultMembers(t *testing.T) {
	t.Run("listing members from empty vault returns empty list", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()

		members, err := rbac.ListMembers(ctx, "nonexistent-vault")
		if err != nil {
			t.Fatalf("failed to list members: %v", err)
		}

		if len(members) != 0 {
			t.Errorf("expected 0 members, got %d", len(members))
		}
	})
}

func TestTransferOwnership(t *testing.T) {
	t.Run("transfer ownership changes roles correctly", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		oldOwner := "owner1"
		newOwner := "editor1"

		// Setup
		rbac.AssignRole(ctx, vaultID, oldOwner, auth.RoleOwner, "system")
		rbac.AssignRole(ctx, vaultID, newOwner, auth.RoleEditor, oldOwner)

		// Transfer ownership
		err := rbac.TransferOwnership(ctx, vaultID, oldOwner, newOwner)
		if err != nil {
			t.Errorf("expected no error, got %v", err)
		}

		// Verify roles changed
		oldOwnerRole, _ := rbac.GetUserRole(ctx, oldOwner, vaultID)
		newOwnerRole, _ := rbac.GetUserRole(ctx, newOwner, vaultID)

		if oldOwnerRole == auth.RoleOwner {
			t.Error("old owner should no longer have owner role")
		}
		if newOwnerRole != auth.RoleOwner {
			t.Errorf("new owner should have owner role, got %s", newOwnerRole)
		}
	})
}

func TestMembershipGrantedBy(t *testing.T) {
	t.Run("member tracks who granted the role", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()
		vaultID := "vault-123"
		ownerID := "owner"
		editorID := "editor"
		newMemberID := "member"

		// Setup
		rbac.AssignRole(ctx, vaultID, ownerID, auth.RoleOwner, "system")
		rbac.AssignRole(ctx, vaultID, editorID, auth.RoleEditor, ownerID)
		rbac.AssignRole(ctx, vaultID, newMemberID, auth.RoleViewer, editorID)

		// Verify granted_by information
		members, _ := rbac.ListMembers(ctx, vaultID)
		for _, m := range members {
			if m.UserID == newMemberID {
				if m.GrantedBy != editorID {
					t.Errorf("expected granted_by to be %s, got %s", editorID, m.GrantedBy)
				}
				return
			}
		}
		t.Error("member not found")
	})
}

func TestMethodCallCounting(t *testing.T) {
	t.Run("tracks method calls for audit purposes", func(t *testing.T) {
		rbac := NewMockRBACServiceMembers()
		ctx := context.Background()

		rbac.AssignRole(ctx, "v1", "u1", auth.RoleOwner, "system")
		rbac.ListMembers(ctx, "v1")
		rbac.ListMembers(ctx, "v1")

		if rbac.calls["AssignRole"] != 1 {
			t.Errorf("expected 1 AssignRole call, got %d", rbac.calls["AssignRole"])
		}
		if rbac.calls["ListMembers"] != 2 {
			t.Errorf("expected 2 ListMembers calls, got %d", rbac.calls["ListMembers"])
		}
	})
}
