package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	auth "github.com/usbvault/usbvault-server/internal/auth"
	"github.com/rs/zerolog/log"
)

// RequireVaultPermission extracts vault_id from URL parameters and checks RBAC permissions
func RequireVaultPermission(rbac *auth.RBACService, perm auth.Permission) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract user ID from context
			userID, ok := r.Context().Value("user_id").(string)
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			// Extract vault ID from URL parameters
			vaultID := chi.URLParam(r, "vaultID")
			if vaultID == "" {
				http.Error(w, "vault ID required", http.StatusBadRequest)
				return
			}

			// Check permission
			hasPermission, err := rbac.CheckPermission(r.Context(), userID, vaultID, perm)
			if err != nil {
				log.Error().Err(err).
					Str("user_id", userID).
					Str("vault_id", vaultID).
					Str("permission", string(perm)).
					Msg("failed to check permission")
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}

			if !hasPermission {
				log.Warn().
					Str("user_id", userID).
					Str("vault_id", vaultID).
					Str("permission", string(perm)).
					Msg("permission denied")
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// VaultOwnerOnly is a shortcut for RequireVaultPermission with manage_members permission
func VaultOwnerOnly(rbac *auth.RBACService) func(http.Handler) http.Handler {
	return RequireVaultPermission(rbac, auth.PermManageMembers)
}

// RequireVaultRead checks if user can read a vault
func RequireVaultRead(rbac *auth.RBACService) func(http.Handler) http.Handler {
	return RequireVaultPermission(rbac, auth.PermRead)
}

// RequireVaultUpdate checks if user can update a vault
func RequireVaultUpdate(rbac *auth.RBACService) func(http.Handler) http.Handler {
	return RequireVaultPermission(rbac, auth.PermUpdate)
}

// RequireVaultDelete checks if user can delete a vault
func RequireVaultDelete(rbac *auth.RBACService) func(http.Handler) http.Handler {
	return RequireVaultPermission(rbac, auth.PermDelete)
}
