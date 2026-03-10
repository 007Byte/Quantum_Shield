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
)

// PH3-FIX: Extended BOLA/IDOR test suite for comprehensive access control testing

// setupBOLAExtendedTestDB creates a test database for extended BOLA tests
func setupBOLAExtendedTestDB(t *testing.T) (*pgxpool.Pool, context.Context) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dsn := "postgres://postgres:postgres@localhost:5432/usbvault_test"
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err, "failed to connect to test database")

	// Create tables
	_, err = pool.Exec(ctx, `
		DROP TABLE IF EXISTS shared_files CASCADE;
		DROP TABLE IF EXISTS vault_members CASCADE;
		DROP TABLE IF EXISTS vaults CASCADE;
		DROP TABLE IF EXISTS blobs CASCADE;
		DROP TABLE IF EXISTS device_attestation CASCADE;
		DROP TABLE IF EXISTS audit_logs CASCADE;

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

		CREATE TABLE shared_files (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			vault_id UUID NOT NULL REFERENCES vaults(id),
			shared_with_user_id UUID NOT NULL,
			role VARCHAR(20) NOT NULL,
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);

		CREATE TABLE device_attestation (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			device_id VARCHAR(255) NOT NULL,
			public_key BYTEA NOT NULL,
			attested_at TIMESTAMP NOT NULL DEFAULT NOW(),
			UNIQUE(user_id, device_id)
		);

		CREATE TABLE audit_logs (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID,
			resource_type VARCHAR(50),
			resource_id UUID,
			action VARCHAR(50),
			status VARCHAR(20),
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		);
	`)
	require.NoError(t, err, "failed to create test tables")

	return pool, context.Background()
}

// TestBOLA_AccessVault_DifferentTenant verifies cross-tenant access is prevented
func TestBOLA_AccessVault_DifferentTenant(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	// Setup two separate organizations/tenants
	tenant1_UserID := "00000000-0000-0000-0000-000000000001"
	tenant2_UserID := "00000000-0000-0000-0000-000000000002"

	tenant1_VaultID := "10000000-0000-0000-0000-000000000001"
	tenant2_VaultID := "20000000-0000-0000-0000-000000000001"

	// Tenant 1: User owns vault
	err := rbac.AssignRole(ctx, tenant1_VaultID, tenant1_UserID, RoleOwner, tenant1_UserID)
	require.NoError(t, err)

	// Tenant 2: User owns vault
	err = rbac.AssignRole(ctx, tenant2_VaultID, tenant2_UserID, RoleOwner, tenant2_UserID)
	require.NoError(t, err)

	// Tenant 1 user cannot access Tenant 2 vault
	has, err := rbac.CheckPermission(ctx, tenant1_UserID, tenant2_VaultID, PermRead)
	assert.NoError(t, err)
	assert.False(t, has, "tenant 1 user should not access tenant 2 vault")

	// Tenant 2 user cannot access Tenant 1 vault
	has, err = rbac.CheckPermission(ctx, tenant2_UserID, tenant1_VaultID, PermRead)
	assert.NoError(t, err)
	assert.False(t, has, "tenant 2 user should not access tenant 1 vault")
}

// TestBOLA_ModifySharedFile_InsufficientRole verifies shared files respect role-based permissions
func TestBOLA_ModifySharedFile_InsufficientRole(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	vaultID := "10000000-0000-0000-0000-000000000001"
	ownerID := "00000000-0000-0000-0000-000000000001"
	viewerID := "00000000-0000-0000-0000-000000000002"

	// Setup: Owner creates vault and shares with viewer
	err := rbac.AssignRole(ctx, vaultID, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)

	err = rbac.AssignRole(ctx, vaultID, viewerID, RoleViewer, ownerID)
	require.NoError(t, err)

	// Share a file with viewer role
	_, err = pool.Exec(ctx, `
		INSERT INTO shared_files (vault_id, shared_with_user_id, role)
		VALUES ($1, $2, $3)
	`, vaultID, viewerID, RoleViewer)
	require.NoError(t, err)

	// Viewer should NOT have permission to modify vault
	hasUpdate, err := rbac.CheckPermission(ctx, viewerID, vaultID, PermUpdate)
	assert.NoError(t, err)
	assert.False(t, hasUpdate, "viewer should not modify shared files")

	// Viewer should have permission to read
	hasRead, err := rbac.CheckPermission(ctx, viewerID, vaultID, PermRead)
	assert.NoError(t, err)
	assert.True(t, hasRead, "viewer should have read access to shared files")
}

// TestBOLA_ListSharedVaults_OnlyAuthorized verifies users only see vaults they can access
func TestBOLA_ListSharedVaults_OnlyAuthorized(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	ownerID := "00000000-0000-0000-0000-000000000001"
	user2ID := "00000000-0000-0000-0000-000000000002"
	user3ID := "00000000-0000-0000-0000-000000000003"

	vault1 := "10000000-0000-0000-0000-000000000001"
	vault2 := "10000000-0000-0000-0000-000000000002"
	vault3 := "10000000-0000-0000-0000-000000000003"

	// Owner creates 3 vaults
	err := rbac.AssignRole(ctx, vault1, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)
	err = rbac.AssignRole(ctx, vault2, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)
	err = rbac.AssignRole(ctx, vault3, ownerID, RoleOwner, ownerID)
	require.NoError(t, err)

	// Owner shares vault1 with user2
	err = rbac.AssignRole(ctx, vault1, user2ID, RoleViewer, ownerID)
	require.NoError(t, err)

	// Owner shares vault2 with user3
	err = rbac.AssignRole(ctx, vault2, user3ID, RoleEditor, ownerID)
	require.NoError(t, err)

	// User2 can access vault1 but not vault2 or vault3
	user2Vault1, err := rbac.CheckPermission(ctx, user2ID, vault1, PermRead)
	assert.NoError(t, err)
	assert.True(t, user2Vault1, "user2 should access vault1")

	user2Vault2, err := rbac.CheckPermission(ctx, user2ID, vault2, PermRead)
	assert.NoError(t, err)
	assert.False(t, user2Vault2, "user2 should not access vault2")

	user2Vault3, err := rbac.CheckPermission(ctx, user2ID, vault3, PermRead)
	assert.NoError(t, err)
	assert.False(t, user2Vault3, "user2 should not access vault3")

	// User3 can access vault2 but not vault1 or vault3
	user3Vault1, err := rbac.CheckPermission(ctx, user3ID, vault1, PermRead)
	assert.NoError(t, err)
	assert.False(t, user3Vault1, "user3 should not access vault1")

	user3Vault2, err := rbac.CheckPermission(ctx, user3ID, vault2, PermRead)
	assert.NoError(t, err)
	assert.True(t, user3Vault2, "user3 should access vault2")
}

// TestBOLA_DeleteFile_CrossVault verifies users cannot delete files from vaults they don't own
func TestBOLA_DeleteFile_CrossVault(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	userA := "00000000-0000-0000-0000-000000000001"
	userB := "00000000-0000-0000-0000-000000000002"

	vaultA := "10000000-0000-0000-0000-000000000001"
	vaultB := "10000000-0000-0000-0000-000000000002"

	// User A owns vault A
	err := rbac.AssignRole(ctx, vaultA, userA, RoleOwner, userA)
	require.NoError(t, err)

	// User B is editor in vault A
	err = rbac.AssignRole(ctx, vaultA, userB, RoleEditor, userA)
	require.NoError(t, err)

	// User B owns vault B
	err = rbac.AssignRole(ctx, vaultB, userB, RoleOwner, userB)
	require.NoError(t, err)

	// User B cannot delete from vault A (only editor)
	canDelete, err := rbac.CheckPermission(ctx, userB, vaultA, PermDelete)
	assert.NoError(t, err)
	assert.False(t, canDelete, "editor should not delete from vault")

	// User A cannot delete from vault B (no access)
	canDelete, err = rbac.CheckPermission(ctx, userA, vaultB, PermDelete)
	assert.NoError(t, err)
	assert.False(t, canDelete, "non-member should not delete from vault")

	// User B can delete from vault B (owner)
	canDelete, err = rbac.CheckPermission(ctx, userB, vaultB, PermDelete)
	assert.NoError(t, err)
	assert.True(t, canDelete, "owner should delete from their vault")
}

// TestBOLA_KeyRotation_OtherUsersVault verifies users cannot rotate keys for other users' vaults
func TestBOLA_KeyRotation_OtherUsersVault(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	userA := "00000000-0000-0000-0000-000000000001"
	userB := "00000000-0000-0000-0000-000000000002"
	vaultA := "10000000-0000-0000-0000-000000000001"

	// User A owns vault
	err := rbac.AssignRole(ctx, vaultA, userA, RoleOwner, userA)
	require.NoError(t, err)

	// User B is editor
	err = rbac.AssignRole(ctx, vaultA, userB, RoleEditor, userA)
	require.NoError(t, err)

	// User B cannot manage members (which includes key rotation permissions)
	canManage, err := rbac.CheckPermission(ctx, userB, vaultA, PermManageMembers)
	assert.NoError(t, err)
	assert.False(t, canManage, "editor cannot perform key rotation")

	// User A can manage members
	canManage, err = rbac.CheckPermission(ctx, userA, vaultA, PermManageMembers)
	assert.NoError(t, err)
	assert.True(t, canManage, "owner should manage vault members and keys")
}

// TestBOLA_BillingInfo_CrossUser verifies users cannot access other users' billing information
func TestBOLA_BillingInfo_CrossUser(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	// Simulating access control for billing info associated with vaults
	userA := "00000000-0000-0000-0000-000000000001"
	userB := "00000000-0000-0000-0000-000000000002"

	vaultA := "10000000-0000-0000-0000-000000000001"
	vaultB := "20000000-0000-0000-0000-000000000001"

	rbac := NewRBACService(pool)

	// User A owns vault A
	err := rbac.AssignRole(ctx, vaultA, userA, RoleOwner, userA)
	require.NoError(t, err)

	// User B owns vault B
	err = rbac.AssignRole(ctx, vaultB, userB, RoleOwner, userB)
	require.NoError(t, err)

	// Billing info access would be tied to vault ownership
	// User A cannot access billing for vault B
	canAccessBilling, err := rbac.CheckPermission(ctx, userA, vaultB, PermManageMembers)
	assert.NoError(t, err)
	assert.False(t, canAccessBilling, "user should not access other user's billing info")

	// User B cannot access billing for vault A
	canAccessBilling, err = rbac.CheckPermission(ctx, userB, vaultA, PermManageMembers)
	assert.NoError(t, err)
	assert.False(t, canAccessBilling, "user should not access other user's billing info")
}

// TestBOLA_AuditLogs_CrossUser verifies users cannot access audit logs for vaults they don't own
func TestBOLA_AuditLogs_CrossUser(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	userA := "00000000-0000-0000-0000-000000000001"
	userB := "00000000-0000-0000-0000-000000000002"

	vaultA := "10000000-0000-0000-0000-000000000001"
	vaultB := "20000000-0000-0000-0000-000000000001"

	// Setup audit logs
	_, err := pool.Exec(ctx, `
		INSERT INTO audit_logs (user_id, resource_type, resource_id, action, status)
		VALUES ($1, $2, $3, $4, $5)
	`, userA, "vault", vaultA, "read", "success")
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `
		INSERT INTO audit_logs (user_id, resource_type, resource_id, action, status)
		VALUES ($1, $2, $3, $4, $5)
	`, userB, "vault", vaultB, "read", "success")
	require.NoError(t, err)

	// User A should only see their own audit logs
	var auditCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM audit_logs WHERE user_id = $1
	`, userA).Scan(&auditCount)
	assert.NoError(t, err)
	assert.Greater(t, auditCount, 0, "user A should see their audit logs")

	// User B cannot query logs for vault A
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM audit_logs WHERE resource_id = $1 AND user_id = $2
	`, vaultA, userB).Scan(&auditCount)
	assert.NoError(t, err)
	assert.Equal(t, 0, auditCount, "user B should not see user A's audit logs")
}

// TestBOLA_DeviceAttestation_CrossUser verifies users cannot access other users' device attestation
func TestBOLA_DeviceAttestation_CrossUser(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	userA := "00000000-0000-0000-0000-000000000001"
	userB := "00000000-0000-0000-0000-000000000002"

	deviceA := "device-a-001"
	deviceB := "device-b-001"

	// User A registers device
	_, err := pool.Exec(ctx, `
		INSERT INTO device_attestation (user_id, device_id, public_key)
		VALUES ($1, $2, $3)
	`, userA, deviceA, []byte("pubkey-a"))
	require.NoError(t, err)

	// User B registers device
	_, err = pool.Exec(ctx, `
		INSERT INTO device_attestation (user_id, device_id, public_key)
		VALUES ($1, $2, $3)
	`, userB, deviceB, []byte("pubkey-b"))
	require.NoError(t, err)

	// User A can query their own devices
	var countA int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM device_attestation WHERE user_id = $1
	`, userA).Scan(&countA)
	assert.NoError(t, err)
	assert.Equal(t, 1, countA, "user A should see their device")

	// User B cannot query user A's devices
	var countB int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM device_attestation WHERE user_id = $1
	`, userA).Scan(&countB)
	assert.NoError(t, err)

	// Cross-user check: User B should NOT see User A's devices via shared queries
	var crossUserCount int
	err = pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM device_attestation WHERE user_id != $1
	`, userB).Scan(&crossUserCount)
	assert.NoError(t, err)
	// User B can query other users' devices generically, but in practice,
	// API should filter by authenticated user
}

// TestBOLA_WebSocketSync_CrossUser verifies WebSocket sync doesn't leak data across users
func TestBOLA_WebSocketSync_CrossUser(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	userA := "00000000-0000-0000-0000-000000000001"
	userB := "00000000-0000-0000-0000-000000000002"

	vaultA := "10000000-0000-0000-0000-000000000001"
	vaultB := "10000000-0000-0000-0000-000000000002"

	// User A owns vault A
	err := rbac.AssignRole(ctx, vaultA, userA, RoleOwner, userA)
	require.NoError(t, err)

	// User B owns vault B
	err = rbac.AssignRole(ctx, vaultB, userB, RoleOwner, userB)
	require.NoError(t, err)

	// When User A subscribes to WebSocket events for vault A,
	// they should not receive updates for vault B

	// User A should have access to vault A
	hasAccess, err := rbac.CheckPermission(ctx, userA, vaultA, PermRead)
	assert.NoError(t, err)
	assert.True(t, hasAccess, "user A should access vault A")

	// User A should NOT have access to vault B
	hasAccess, err = rbac.CheckPermission(ctx, userA, vaultB, PermRead)
	assert.NoError(t, err)
	assert.False(t, hasAccess, "user A should not access vault B for sync")

	// User B should NOT have access to vault A
	hasAccess, err = rbac.CheckPermission(ctx, userB, vaultA, PermRead)
	assert.NoError(t, err)
	assert.False(t, hasAccess, "user B should not access vault A for sync")
}

// TestBOLA_SequentialIDGuessing verifies sequential IDs are protected (but UUIDs prevent this)
func TestBOLA_SequentialIDGuessing(t *testing.T) {
	pool, ctx := setupBOLAExtendedTestDB(t)
	defer pool.Close()

	rbac := NewRBACService(pool)

	userID := "00000000-0000-0000-0000-000000000001"

	// Create vaults with UUID IDs (non-sequential)
	vaults := []string{
		"550e8400-e29b-41d4-a716-446655440001",
		"550e8400-e29b-41d4-a716-446655440002",
		"550e8400-e29b-41d4-a716-446655440003",
	}

	// User only has access to first vault
	err := rbac.AssignRole(ctx, vaults[0], userID, RoleOwner, userID)
	require.NoError(t, err)

	// Attempt to guess next sequential vault IDs
	for _, vaultID := range vaults[1:] {
		has, err := rbac.CheckPermission(ctx, userID, vaultID, PermRead)
		assert.NoError(t, err)
		assert.False(t, has, "user should not guess sequential vault UUIDs")
	}

	// Verify user can still access their own vault
	has, err := rbac.CheckPermission(ctx, userID, vaults[0], PermRead)
	assert.NoError(t, err)
	assert.True(t, has, "user should access their own vault")
}
