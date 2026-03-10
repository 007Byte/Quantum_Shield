package auth

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog/log"
)

// Role represents a vault member's role
type Role string

const (
	RoleOwner  Role = "owner"
	RoleEditor Role = "editor"
	RoleViewer Role = "viewer"
)

// Permission represents an action a user can perform on a vault
type Permission string

const (
	PermCreate        Permission = "create"
	PermRead          Permission = "read"
	PermUpdate        Permission = "update"
	PermDelete        Permission = "delete"
	PermShare         Permission = "share"
	PermManageMembers Permission = "manage_members"
)

// VaultMember represents a user's membership in a vault
type VaultMember struct {
	ID          string    `json:"id"`
	VaultID     string    `json:"vault_id"`
	UserID      string    `json:"user_id"`
	Role        Role      `json:"role"`
	GrantedAt   time.Time `json:"granted_at"`
	GrantedBy   string    `json:"granted_by"`
	AcceptedAt  *time.Time `json:"accepted_at"`
}

// RBACService manages role-based access control for vaults
type RBACService struct {
	pool *pgxpool.Pool
}

// rolePermissions maps roles to their allowed permissions
var rolePermissions = map[Role][]Permission{
	RoleOwner: {
		PermCreate,
		PermRead,
		PermUpdate,
		PermDelete,
		PermShare,
		PermManageMembers,
	},
	RoleEditor: {
		PermRead,
		PermUpdate,
		PermShare, // Limited: can only share with viewer role
	},
	RoleViewer: {
		PermRead,
	},
}

// NewRBACService creates a new RBAC service for managing role-based access control on vaults.
func NewRBACService(pool *pgxpool.Pool) *RBACService {
	return &RBACService{pool: pool}
}

// CheckPermission checks if a user has a specific permission on a vault.
// Returns true if the user has the permission, false otherwise.
func (s *RBACService) CheckPermission(ctx context.Context, userID, vaultID string, perm Permission) (bool, error) {
	role, err := s.GetUserRole(ctx, userID, vaultID)
	if err != nil {
		return false, err
	}

	if role == "" {
		return false, nil
	}

	permissions, exists := rolePermissions[role]
	if !exists {
		return false, nil
	}

	for _, p := range permissions {
		if p == perm {
			return true, nil
		}
	}

	return false, nil
}

// GetUserRole returns the role of a user in a vault.
// Returns empty string if the user is not a member of the vault.
func (s *RBACService) GetUserRole(ctx context.Context, userID, vaultID string) (Role, error) {
	var role string

	err := s.pool.QueryRow(ctx,
		`SELECT role FROM vault_members
		WHERE vault_id = $1 AND user_id = $2`,
		vaultID, userID).Scan(&role)

	if err == pgx.ErrNoRows {
		return "", nil
	}

	if err != nil {
		log.Error().Err(err).
			Str("user_id", userID).
			Str("vault_id", vaultID).
			Msg("failed to get user role")
		return "", err
	}

	return Role(role), nil
}

// AssignRole assigns a role to a user in a vault.
// If the user is not yet a member, they are added with the specified role.
// If the user is already a member, their role is updated.
// Returns an error if assigning owner role when another owner already exists.
func (s *RBACService) AssignRole(ctx context.Context, vaultID, userID string, role Role, grantedBy string) error {
	// Validate role
	if _, exists := rolePermissions[role]; !exists {
		return fmt.Errorf("invalid role: %s", role)
	}

	// If assigning owner role, check if vault already has an owner
	if role == RoleOwner {
		var existingOwner string
		err := s.pool.QueryRow(ctx,
			`SELECT user_id FROM vault_members
			WHERE vault_id = $1 AND role = $2 LIMIT 1`,
			vaultID, RoleOwner).Scan(&existingOwner)

		if err == nil && existingOwner != userID {
			return errors.New("vault already has an owner")
		}

		if err != nil && err != pgx.ErrNoRows {
			log.Error().Err(err).
				Str("vault_id", vaultID).
				Msg("failed to check for existing owner")
			return err
		}
	}

	// Insert or update role
	_, err := s.pool.Exec(ctx,
		`INSERT INTO vault_members (vault_id, user_id, role, granted_at, granted_by)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (vault_id, user_id) DO UPDATE SET role = $3, granted_at = $4`,
		vaultID, userID, role, time.Now(), grantedBy)

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Str("user_id", userID).
			Str("role", string(role)).
			Msg("failed to assign role")
		return err
	}

	log.Info().
		Str("vault_id", vaultID).
		Str("user_id", userID).
		Str("role", string(role)).
		Str("granted_by", grantedBy).
		Msg("role assigned")

	return nil
}

// RemoveRole removes a user's role in a vault (revokes membership).
// Returns an error if the user is the vault owner to prevent removing the last owner.
func (s *RBACService) RemoveRole(ctx context.Context, vaultID, userID string) error {
	// Check if user is the owner - prevent removing the last owner
	var role string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM vault_members
		WHERE vault_id = $1 AND user_id = $2`,
		vaultID, userID).Scan(&role)

	if err == pgx.ErrNoRows {
		return errors.New("user not a member of vault")
	}

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Str("user_id", userID).
			Msg("failed to check user role before removal")
		return err
	}

	if role == string(RoleOwner) {
		return errors.New("cannot remove the vault owner")
	}

	// Remove the member
	_, err = s.pool.Exec(ctx,
		`DELETE FROM vault_members WHERE vault_id = $1 AND user_id = $2`,
		vaultID, userID)

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Str("user_id", userID).
			Msg("failed to remove role")
		return err
	}

	log.Info().
		Str("vault_id", vaultID).
		Str("user_id", userID).
		Msg("role removed")

	return nil
}

// ListMembers returns all members of a vault, ordered by grant date (newest first).
func (s *RBACService) ListMembers(ctx context.Context, vaultID string) ([]VaultMember, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, vault_id, user_id, role, granted_at, granted_by, accepted_at
		FROM vault_members
		WHERE vault_id = $1
		ORDER BY granted_at DESC`,
		vaultID)

	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Msg("failed to list vault members")
		return nil, err
	}
	defer rows.Close()

	var members []VaultMember
	for rows.Next() {
		var member VaultMember
		err := rows.Scan(
			&member.ID,
			&member.VaultID,
			&member.UserID,
			&member.Role,
			&member.GrantedAt,
			&member.GrantedBy,
			&member.AcceptedAt,
		)
		if err != nil {
			log.Error().Err(err).
				Str("vault_id", vaultID).
				Msg("failed to scan vault member")
			return nil, err
		}
		members = append(members, member)
	}

	if err = rows.Err(); err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Msg("error iterating vault members")
		return nil, err
	}

	return members, nil
}

// TransferOwnership atomically transfers ownership from one user to another.
// Verifies that fromUserID is the current owner before proceeding.
// Uses a transaction to ensure consistency.
func (s *RBACService) TransferOwnership(ctx context.Context, vaultID, fromUserID, toUserID string) error {
	// Verify current user is the owner
	var currentRole string
	err := s.pool.QueryRow(ctx,
		`SELECT role FROM vault_members
		WHERE vault_id = $1 AND user_id = $2`,
		vaultID, fromUserID).Scan(&currentRole)

	if err != nil {
		if err == pgx.ErrNoRows {
			return errors.New("user is not a member of this vault")
		}
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Str("from_user_id", fromUserID).
			Msg("failed to verify ownership")
		return err
	}

	if currentRole != string(RoleOwner) {
		return errors.New("user is not the vault owner")
	}

	// Use a transaction to ensure atomicity
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		log.Error().Err(err).Msg("failed to begin transaction")
		return err
	}
	defer tx.Rollback(ctx)

	// Remove owner role from current owner
	_, err = tx.Exec(ctx,
		`DELETE FROM vault_members WHERE vault_id = $1 AND user_id = $2`,
		vaultID, fromUserID)
	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Str("from_user_id", fromUserID).
			Msg("failed to remove old owner")
		return err
	}

	// Assign owner role to new owner
	_, err = tx.Exec(ctx,
		`INSERT INTO vault_members (vault_id, user_id, role, granted_at, granted_by)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (vault_id, user_id) DO UPDATE SET role = $3, granted_at = $4`,
		vaultID, toUserID, RoleOwner, time.Now(), fromUserID)
	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Str("to_user_id", toUserID).
			Msg("failed to assign new owner")
		return err
	}

	// Commit transaction
	err = tx.Commit(ctx)
	if err != nil {
		log.Error().Err(err).
			Str("vault_id", vaultID).
			Msg("failed to commit ownership transfer")
		return err
	}

	log.Info().
		Str("vault_id", vaultID).
		Str("from_user_id", fromUserID).
		Str("to_user_id", toUserID).
		Msg("ownership transferred")

	return nil
}
