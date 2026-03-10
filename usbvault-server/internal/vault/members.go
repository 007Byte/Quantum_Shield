package vault

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"

	auth "github.com/usbvault/usbvault-server/internal/auth"
)

// ListMembersResponse contains a list of vault members
type ListMembersResponse struct {
	Members []auth.VaultMember `json:"members"`
}

// AddMemberRequest is the request to add a member to a vault
type AddMemberRequest struct {
	UserID string     `json:"user_id"`
	Role   auth.Role  `json:"role"`
}

// AddMemberResponse is the response after adding a member
type AddMemberResponse struct {
	Member auth.VaultMember `json:"member"`
}

// RemoveMemberRequest is the request to remove a member from a vault
type RemoveMemberRequest struct {
	// User ID comes from URL parameter
}

// TransferOwnershipRequest is the request to transfer vault ownership
type TransferOwnershipRequest struct {
	NewOwnerID string `json:"new_owner_id"`
}

// TransferOwnershipResponse is the response after transferring ownership
type TransferOwnershipResponse struct {
	Message string `json:"message"`
}

// HandleListMembers is an HTTP handler that lists all members of a vault.
// Requires vault ID in path and user_id in context.
func HandleListMembers(rbacService *auth.RBACService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := r.PathValue("vaultID")
		if vaultID == "" {
			http.Error(w, "vault ID required", http.StatusBadRequest)
			return
		}

		// Validate vault ID is a valid UUID
		if _, err := uuid.Parse(vaultID); err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		members, err := rbacService.ListMembers(r.Context(), vaultID)
		if err != nil {
			log.Error().Err(err).
				Str("user_id", userID).
				Str("vault_id", vaultID).
				Msg("failed to list vault members")
			http.Error(w, "failed to list members", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(ListMembersResponse{
			Members: members,
		})

		log.Debug().
			Str("user_id", userID).
			Str("vault_id", vaultID).
			Int("member_count", len(members)).
			Msg("vault members listed")
	}
}

// HandleAddMember is an HTTP handler that adds a user to a vault with a specified role.
// Logs audit events for member addition and requires user_id in context.
func HandleAddMember(rbacService *auth.RBACService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req AddMemberRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		currentUserID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := r.PathValue("vaultID")
		if vaultID == "" {
			http.Error(w, "vault ID required", http.StatusBadRequest)
			return
		}

		// Validate vault ID is a valid UUID
		if _, err := uuid.Parse(vaultID); err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		// Validate role
		validRoles := map[auth.Role]bool{
			auth.RoleOwner:  true,
			auth.RoleEditor: true,
			auth.RoleViewer: true,
		}
		if !validRoles[req.Role] {
			http.Error(w, "invalid role", http.StatusBadRequest)
			return
		}

		// Assign the role
		if err := rbacService.AssignRole(r.Context(), vaultID, req.UserID, req.Role, currentUserID); err != nil {
			log.Error().Err(err).
				Str("current_user_id", currentUserID).
				Str("vault_id", vaultID).
				Str("new_user_id", req.UserID).
				Str("role", string(req.Role)).
				Msg("failed to assign role")
			http.Error(w, "failed to add member", http.StatusInternalServerError)
			return
		}

		// Get the newly assigned member
		members, err := rbacService.ListMembers(r.Context(), vaultID)
		if err != nil {
			log.Error().Err(err).
				Str("vault_id", vaultID).
				Str("user_id", req.UserID).
				Msg("failed to retrieve newly added member")
			http.Error(w, "failed to retrieve member", http.StatusInternalServerError)
			return
		}

		var newMember *auth.VaultMember
		for i, member := range members {
			if member.UserID == req.UserID {
				newMember = &members[i]
				break
			}
		}

		if newMember == nil {
			http.Error(w, "failed to find newly added member", http.StatusInternalServerError)
			return
		}

		// Log audit event
		auditDetail := []byte("user_id=" + req.UserID + ",role=" + string(req.Role))
		if err := auditSvc.LogAction(r.Context(), currentUserID, "MEMBER_ADDED", auditDetail); err != nil {
			log.Error().Err(err).
				Str("vault_id", vaultID).
				Msg("failed to log audit event")
		}

		log.Info().
			Str("current_user_id", currentUserID).
			Str("vault_id", vaultID).
			Str("new_user_id", req.UserID).
			Str("role", string(req.Role)).
			Msg("member added to vault")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(AddMemberResponse{
			Member: *newMember,
		})
	}
}

// HandleRemoveMember is an HTTP handler that removes a user from a vault.
// Prevents users from removing themselves and logs audit events.
func HandleRemoveMember(rbacService *auth.RBACService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		currentUserID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := r.PathValue("vaultID")
		if vaultID == "" {
			http.Error(w, "vault ID required", http.StatusBadRequest)
			return
		}

		// Validate vault ID is a valid UUID
		if _, err := uuid.Parse(vaultID); err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		memberUserID := r.PathValue("memberUserID")
		if memberUserID == "" {
			http.Error(w, "member user ID required", http.StatusBadRequest)
			return
		}

		// Prevent removing oneself
		if memberUserID == currentUserID {
			http.Error(w, "cannot remove yourself from vault", http.StatusBadRequest)
			return
		}

		// Remove the role
		if err := rbacService.RemoveRole(r.Context(), vaultID, memberUserID); err != nil {
			log.Error().Err(err).
				Str("current_user_id", currentUserID).
				Str("vault_id", vaultID).
				Str("member_user_id", memberUserID).
				Msg("failed to remove member role")
			http.Error(w, "failed to remove member", http.StatusInternalServerError)
			return
		}

		// Log audit event
		auditDetail := []byte("removed_user_id=" + memberUserID)
		if err := auditSvc.LogAction(r.Context(), currentUserID, "MEMBER_REMOVED", auditDetail); err != nil {
			log.Error().Err(err).
				Str("vault_id", vaultID).
				Msg("failed to log audit event")
		}

		log.Info().
			Str("current_user_id", currentUserID).
			Str("vault_id", vaultID).
			Str("removed_user_id", memberUserID).
			Msg("member removed from vault")

		w.WriteHeader(http.StatusNoContent)
	}
}

// HandleTransferOwnership is an HTTP handler that transfers vault ownership from one user to another.
// Validates the current user is the owner and prevents transfer to self.
func HandleTransferOwnership(rbacService *auth.RBACService, auditSvc interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req TransferOwnershipRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}

		currentUserID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		vaultID := r.PathValue("vaultID")
		if vaultID == "" {
			http.Error(w, "vault ID required", http.StatusBadRequest)
			return
		}

		// Validate vault ID is a valid UUID
		if _, err := uuid.Parse(vaultID); err != nil {
			http.Error(w, "invalid vault id", http.StatusBadRequest)
			return
		}

		if req.NewOwnerID == "" {
			http.Error(w, "new owner ID required", http.StatusBadRequest)
			return
		}

		// Prevent transferring to oneself
		if req.NewOwnerID == currentUserID {
			http.Error(w, "cannot transfer ownership to yourself", http.StatusBadRequest)
			return
		}

		// Transfer ownership (TransferOwnership already validates current user is owner)
		if err := rbacService.TransferOwnership(r.Context(), vaultID, currentUserID, req.NewOwnerID); err != nil {
			log.Error().Err(err).
				Str("current_user_id", currentUserID).
				Str("vault_id", vaultID).
				Str("new_owner_id", req.NewOwnerID).
				Msg("failed to transfer ownership")
			http.Error(w, "failed to transfer ownership", http.StatusInternalServerError)
			return
		}

		// Log audit event
		auditDetail := []byte("new_owner_id=" + req.NewOwnerID)
		if err := auditSvc.LogAction(r.Context(), currentUserID, "OWNERSHIP_TRANSFERRED", auditDetail); err != nil {
			log.Error().Err(err).
				Str("vault_id", vaultID).
				Msg("failed to log audit event")
		}

		log.Info().
			Str("from_user_id", currentUserID).
			Str("vault_id", vaultID).
			Str("to_user_id", req.NewOwnerID).
			Msg("vault ownership transferred")

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(TransferOwnershipResponse{
			Message: "Ownership transferred successfully",
		})
	}
}
