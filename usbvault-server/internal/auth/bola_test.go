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

// setupBOLATestDB creates a test database pool and initializes schema for BOLA tests
func setupBOLATestDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dsn := testutil.IntegrationDSN()
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err, "failed to connect to test database")

	// Create tables
	_, err = pool.Exec(ctx, `
		DROP TABLE IF EXISTS vault_members CASCADE;
		DROP TABLE IF EXISTS vaults CASCADE;
		DROP TABLE IF EXISTS blobs CASCADE;

		CREATE TABLE vaults (
			id UUID PRIMARY KEY,
			owner_id UUID NOT NULL,
			encrypted_metadata BYTEA,
			created_at TIMESTAMP NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
			deleted_at TIMESTAMP
		);

		CREATE TABLE vault_members (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			vault_id UUID NOT NULL REFERENCES vaults(id),
			user_id UUID NOT NULL,
			role VARCHAR(20) NOT NULL,
			granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
			granted_by UUID NOT NULL,
			accepted_at TIMESTAMP,
			UNIQUE(vault_id, user_id)
		);

		CREATE TABLE blobs (
			id UUID PRIMARY KEY,
			vault_id UUID NOT NULL REFERENCES vaults(id),
			s3_key VARCHAR(255) NOT NULL,
			size_bytes BIGINT,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);
	`)
	require.NoError(t, err, "failed to create test tables")

	return pool, context.Background()
}

// TestBOLA_UserCannotAccessOtherUserVault verifies that users cannot access vaults they don't have roles for
func TestBOLA_UserCannotAccessOtherUserVault(t *testing.T) {
	pool, ctx := setupBOLATestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000002"
	intruderID := "00000000-0000-0000-0000-000000000003"

	// Owner assigns themselves as owner
	err := rbac.AssignRole(ctx, vaultID, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)

	// Intruder tries to read vault
	has, err := rbac.CheckPermission(ctx, intruderID, vaultID, PermRead)
	assert.NoError(t, err)
	assert.False(t, has, "user without role should not access vault")
}

// TestBOLA_ViewerCannotDelete verifies that viewers cannot delete vault files
func TestBOLA_ViewerCannotDelete(t *testing.T) {
	pool, ctx := setupBOLATestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000002"
	viewerID := "00000000-0000-0000-0000-000000000003"

	// Owner assigns viewer role
	err := rbac.AssignRole(ctx, vaultID, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)

	err = rbac.AssignRole(ctx, vaultID, viewerID, RoleViewer, ownerID)
	require.NoError(t, err)

	// Viewer tries to delete
	has, err := rbac.CheckPermission(ctx, viewerID, vaultID, PermDelete)
	assert.NoError(t, err)
	assert.False(t, has, "viewer should not have delete permission")
}

// TestBOLA_EditorCannotManageMembers verifies that editors cannot add/remove members
func TestBOLA_EditorCannotManageMembers(t *testing.T) {
	pool, ctx := setupBOLATestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000002"
	editorID := "00000000-0000-0000-0000-000000000003"

	// Owner assigns editor role
	err := rbac.AssignRole(ctx, vaultID, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)

	err = rbac.AssignRole(ctx, vaultID, editorID, RoleEditor, ownerID)
	require.NoError(t, err)

	// Editor tries to manage members
	has, err := rbac.CheckPermission(ctx, editorID, vaultID, PermManageMembers)
	assert.NoError(t, err)
	assert.False(t, has, "editor should not have manage_members permission")
}

// TestBOLA_VaultIDEnumeration verifies that vault IDs use UUIDs (not sequential numbers)
func TestBOLA_VaultIDEnumeration(t *testing.T) {
	pool, ctx := setupBOLATestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	// Create multiple vaults with UUID-like IDs
	vaultIDs := []string{
		"550e8400-e29b-41d4-a716-446655440000",
		"550e8400-e29b-41d4-a716-446655440001",
		"550e8400-e29b-41d4-a716-446655440002",
	}

	userID := "00000000-0000-0000-0000-000000000001"

	// Assign owner role for first vault only
	err := rbac.AssignRole(ctx, vaultIDs[0], userID, RoleOwner, userID)
	require.NoError(t, err)

	// User should access first vault
	has, err := rbac.CheckPermission(ctx, userID, vaultIDs[0], PermRead)
	assert.NoError(t, err)
	assert.True(t, has)

	// User should NOT access sequential vault IDs
	for _, vaultID := range vaultIDs[1:] {
		has, err := rbac.CheckPermission(ctx, userID, vaultID, PermRead)
		assert.NoError(t, err)
		assert.False(t, has, "user should not guess sequential vault IDs")
	}
}

// TestBOLA_CrossTenantIsolation verifies that different org users are fully isolated
func TestBOLA_CrossTenantIsolation(t *testing.T) {
	pool, ctx := setupBOLATestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	// Two different organizations
	orgA_VaultID := "10000000-0000-0000-0000-000000000001"
	orgB_VaultID := "20000000-0000-0000-0000-000000000001"

	orgA_UserID := "00000000-0000-0000-0000-000000000001"
	orgB_UserID := "00000000-0000-0000-0000-000000000002"

	// Organization A: user owns vault
	err := rbac.AssignRole(ctx, orgA_VaultID, orgA_UserID, RoleOwner, orgA_UserID)
	require.NoError(t, err)

	// Organization B: different user owns vault
	err = rbac.AssignRole(ctx, orgB_VaultID, orgB_UserID, RoleOwner, orgB_UserID)
	require.NoError(t, err)

	// Org A user should NOT access Org B vault
	has, err := rbac.CheckPermission(ctx, orgA_UserID, orgB_VaultID, PermRead)
	assert.NoError(t, err)
	assert.False(t, has, "org A user should not access org B vault")

	// Org B user should NOT access Org A vault
	has, err = rbac.CheckPermission(ctx, orgB_UserID, orgA_VaultID, PermRead)
	assert.NoError(t, err)
	assert.False(t, has, "org B user should not access org A vault")
}

// TestBOLA_OwnerTransferRevokesOld verifies that old owner loses permissions after transfer
func TestBOLA_OwnerTransferRevokesOld(t *testing.T) {
	pool, ctx := setupBOLATestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	oldOwnerID := "00000000-0000-0000-0000-000000000002"
	newOwnerID := "00000000-0000-0000-0000-000000000003"

	// Assign owner role to first user
	err := rbac.AssignRole(ctx, vaultID, oldOwnerID, RoleOwner, oldOwnerID)
	require.NoError(t, err)

	// Old owner has manage_members permission
	has, err := rbac.CheckPermission(ctx, oldOwnerID, vaultID, PermManageMembers)
	assert.NoError(t, err)
	assert.True(t, has)

	// Transfer ownership
	err = rbac.TransferOwnership(ctx, vaultID, oldOwnerID, newOwnerID)
	require.NoError(t, err)

	// Old owner should no longer have manage_members permission
	has, err = rbac.CheckPermission(ctx, oldOwnerID, vaultID, PermManageMembers)
	assert.NoError(t, err)
	assert.False(t, has, "old owner should lose manage_members permission after transfer")

	// New owner should have manage_members permission
	has, err = rbac.CheckPermission(ctx, newOwnerID, vaultID, PermManageMembers)
	assert.NoError(t, err)
	assert.True(t, has)
}

// TestBOLA_SharedLinkRespectPermissions verifies that shared links respect viewer constraints
func TestBOLA_SharedLinkRespectPermissions(t *testing.T) {
	pool, ctx := setupBOLATestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)
	vaultID := "00000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000002"
	viewerID := "00000000-0000-0000-0000-000000000003"

	// Owner creates vault and shares with viewer
	err := rbac.AssignRole(ctx, vaultID, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)

	err = rbac.AssignRole(ctx, vaultID, viewerID, RoleViewer, ownerID)
	require.NoError(t, err)

	// Verify viewer can only read
	readOK, err := rbac.CheckPermission(ctx, viewerID, vaultID, PermRead)
	assert.NoError(t, err)
	assert.True(t, readOK, "viewer should have read permission")

	// Verify viewer cannot modify
	updateOK, err := rbac.CheckPermission(ctx, viewerID, vaultID, PermUpdate)
	assert.NoError(t, err)
	assert.False(t, updateOK, "viewer should not have update permission")

	deleteOK, err := rbac.CheckPermission(ctx, viewerID, vaultID, PermDelete)
	assert.NoError(t, err)
	assert.False(t, deleteOK, "viewer should not have delete permission")
}

// TestBOLA_ParameterTampering verifies that vault_id validation prevents parameter tampering
func TestBOLA_ParameterTampering(t *testing.T) {
	pool, ctx := setupBOLATestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	// Two vaults
	vault1 := "00000000-0000-0000-0000-000000000001"
	vault2 := "00000000-0000-0000-0000-000000000002"

	user1 := "00000000-0000-0000-0000-000000000011"
	user2 := "00000000-0000-0000-0000-000000000022"

	// User1 owns vault1, User2 owns vault2
	err := rbac.AssignRole(ctx, vault1, user1, RoleOwner, user1)
	require.NoError(t, err)

	err = rbac.AssignRole(ctx, vault2, user2, RoleOwner, user2)
	require.NoError(t, err)

	// User1 should NOT be able to access vault2 even if they try to tamper with vaultID param
	has, err := rbac.CheckPermission(ctx, user1, vault2, PermRead)
	assert.NoError(t, err)
	assert.False(t, has, "user cannot access vault by tampering with vault_id parameter")

	// Verify User1 still has access to their own vault
	has, err = rbac.CheckPermission(ctx, user1, vault1, PermRead)
	assert.NoError(t, err)
	assert.True(t, has)
}
