//go:build integration
// +build integration

package auth

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/usbvault/usbvault-server/internal/testutil"
)

// setupTestDB creates a test database pool and initializes schema
func setupTestDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dsn := testutil.IntegrationDSN()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err, "failed to connect to test database")

	// Create table
	_, err = pool.Exec(ctx, `
		DROP TABLE IF EXISTS vault_members CASCADE;
		CREATE TABLE vault_members (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			vault_id UUID NOT NULL,
			user_id UUID NOT NULL,
			role VARCHAR(20) NOT NULL,
			granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
			granted_by UUID NOT NULL,
			accepted_at TIMESTAMP,
			UNIQUE(vault_id, user_id)
		);
	`)
	require.NoError(t, err, "failed to create test table")

	return pool, context.Background()
}

func TestRBAC_OwnerHasAllPermissions(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	userID := "00000000-0000-0000-0000-000000000002"
	grantedBy := "00000000-0000-0000-0000-000000000003"

	// Assign owner role
	err := rbac.AssignRole(ctx, vaultID, userID, RoleOwner, grantedBy)
	require.NoError(t, err)

	// Check all permissions
	allPerms := []Permission{
		PermCreate,
		PermRead,
		PermUpdate,
		PermDelete,
		PermShare,
		PermManageMembers,
	}

	for _, perm := range allPerms {
		has, err := rbac.CheckPermission(ctx, userID, vaultID, perm)
		assert.NoError(t, err)
		assert.True(t, has, "owner should have %s permission", perm)
	}
}

func TestRBAC_EditorPermissions(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	userID := "00000000-0000-0000-0000-000000000002"
	grantedBy := "00000000-0000-0000-0000-000000000003"

	// Assign editor role
	err := rbac.AssignRole(ctx, vaultID, userID, RoleEditor, grantedBy)
	require.NoError(t, err)

	// Editors should have read, update, share
	allowed := []Permission{PermRead, PermUpdate, PermShare}
	denied := []Permission{PermCreate, PermDelete, PermManageMembers}

	for _, perm := range allowed {
		has, err := rbac.CheckPermission(ctx, userID, vaultID, perm)
		assert.NoError(t, err)
		assert.True(t, has, "editor should have %s permission", perm)
	}

	for _, perm := range denied {
		has, err := rbac.CheckPermission(ctx, userID, vaultID, perm)
		assert.NoError(t, err)
		assert.False(t, has, "editor should not have %s permission", perm)
	}
}

func TestRBAC_ViewerReadOnly(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	userID := "00000000-0000-0000-0000-000000000002"
	grantedBy := "00000000-0000-0000-0000-000000000003"

	// Assign viewer role
	err := rbac.AssignRole(ctx, vaultID, userID, RoleViewer, grantedBy)
	require.NoError(t, err)

	// Viewers should only have read
	allowed := []Permission{PermRead}
	denied := []Permission{PermCreate, PermUpdate, PermDelete, PermShare, PermManageMembers}

	for _, perm := range allowed {
		has, err := rbac.CheckPermission(ctx, userID, vaultID, perm)
		assert.NoError(t, err)
		assert.True(t, has, "viewer should have %s permission", perm)
	}

	for _, perm := range denied {
		has, err := rbac.CheckPermission(ctx, userID, vaultID, perm)
		assert.NoError(t, err)
		assert.False(t, has, "viewer should not have %s permission", perm)
	}
}

func TestRBAC_NoRoleDenied(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	userID := "00000000-0000-0000-0000-000000000002"

	// User with no role should have no permissions
	has, err := rbac.CheckPermission(ctx, userID, vaultID, PermRead)
	assert.NoError(t, err)
	assert.False(t, has, "user without role should have no permissions")
}

func TestRBAC_AssignRole(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	userID := "00000000-0000-0000-0000-000000000002"
	grantedBy := "00000000-0000-0000-0000-000000000003"

	// Assign role
	err := rbac.AssignRole(ctx, vaultID, userID, RoleEditor, grantedBy)
	require.NoError(t, err)

	// Verify role was assigned
	role, err := rbac.GetUserRole(ctx, userID, vaultID)
	assert.NoError(t, err)
	assert.Equal(t, RoleEditor, role)
}

func TestRBAC_RemoveRole(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	userID := "00000000-0000-0000-0000-000000000002"
	grantedBy := "00000000-0000-0000-0000-000000000003"

	// Assign editor role
	err := rbac.AssignRole(ctx, vaultID, userID, RoleEditor, grantedBy)
	require.NoError(t, err)

	// Remove role
	err = rbac.RemoveRole(ctx, vaultID, userID)
	require.NoError(t, err)

	// Verify role was removed
	role, err := rbac.GetUserRole(ctx, userID, vaultID)
	assert.NoError(t, err)
	assert.Equal(t, Role(""), role)
}

func TestRBAC_TransferOwnership(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	oldOwnerID := "00000000-0000-0000-0000-000000000002"
	newOwnerID := "00000000-0000-0000-0000-000000000003"

	// Assign owner role to first user
	err := rbac.AssignRole(ctx, vaultID, oldOwnerID, RoleOwner, oldOwnerID)
	require.NoError(t, err)

	// Transfer ownership
	err = rbac.TransferOwnership(ctx, vaultID, oldOwnerID, newOwnerID)
	require.NoError(t, err)

	// Verify old owner no longer has role
	oldRole, err := rbac.GetUserRole(ctx, oldOwnerID, vaultID)
	assert.NoError(t, err)
	assert.Equal(t, Role(""), oldRole)

	// Verify new owner has role
	newRole, err := rbac.GetUserRole(ctx, newOwnerID, vaultID)
	assert.NoError(t, err)
	assert.Equal(t, RoleOwner, newRole)
}

func TestRBAC_OnlyOneOwner(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	userID1 := "00000000-0000-0000-0000-000000000002"
	userID2 := "00000000-0000-0000-0000-000000000003"

	// Assign owner role to first user
	err := rbac.AssignRole(ctx, vaultID, userID1, RoleOwner, userID1)
	require.NoError(t, err)

	// Try to assign owner role to second user
	err = rbac.AssignRole(ctx, vaultID, userID2, RoleOwner, userID1)
	assert.Error(t, err)
	assert.Equal(t, "vault already has an owner", err.Error())
}

func TestRBAC_EditorCanShareAsViewer(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	editorID := "00000000-0000-0000-0000-000000000002"
	grantedBy := "00000000-0000-0000-0000-000000000003"

	// Assign editor role
	err := rbac.AssignRole(ctx, vaultID, editorID, RoleEditor, grantedBy)
	require.NoError(t, err)

	// Verify editor has share permission
	has, err := rbac.CheckPermission(ctx, editorID, vaultID, PermShare)
	assert.NoError(t, err)
	assert.True(t, has, "editor should have share permission")

	// Verify editor does not have manage_members permission
	has, err = rbac.CheckPermission(ctx, editorID, vaultID, PermManageMembers)
	assert.NoError(t, err)
	assert.False(t, has, "editor should not have manage_members permission")
}

func TestRBAC_ListMembers(t *testing.T) {
	pool, ctx := setupTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000002"
	editorID := "00000000-0000-0000-0000-000000000003"
	viewerID := "00000000-0000-0000-0000-000000000004"

	// Assign multiple roles
	err := rbac.AssignRole(ctx, vaultID, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)

	err = rbac.AssignRole(ctx, vaultID, editorID, RoleEditor, ownerID)
	require.NoError(t, err)

	err = rbac.AssignRole(ctx, vaultID, viewerID, RoleViewer, ownerID)
	require.NoError(t, err)

	// List members
	members, err := rbac.ListMembers(ctx, vaultID)
	assert.NoError(t, err)
	assert.Len(t, members, 3)

	// Verify roles
	roleCount := make(map[Role]int)
	for _, member := range members {
		roleCount[member.Role]++
	}

	assert.Equal(t, 1, roleCount[RoleOwner])
	assert.Equal(t, 1, roleCount[RoleEditor])
	assert.Equal(t, 1, roleCount[RoleViewer])
}
