package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	auth "github.com/usbvault/usbvault-server/internal/auth"
)

// MockRBACService implements a mock RBAC service for testing
type MockRBACService struct {
	permissions map[string]map[string]map[auth.Permission]bool // userID -> vaultID -> permission -> allowed
}

func NewMockRBACService() *MockRBACService {
	return &MockRBACService{
		permissions: make(map[string]map[string]map[auth.Permission]bool),
	}
}

func (m *MockRBACService) CheckPermission(ctx context.Context, userID, vaultID string, perm auth.Permission) (bool, error) {
	if vaultPerms, exists := m.permissions[userID]; exists {
		if perms, exists := vaultPerms[vaultID]; exists {
			return perms[perm], nil
		}
	}
	return false, nil
}

func (m *MockRBACService) GetUserRole(ctx context.Context, userID, vaultID string) (auth.Role, error) {
	// Not used in middleware tests
	return "", nil
}

func (m *MockRBACService) SetPermission(userID, vaultID string, perm auth.Permission, allowed bool) {
	if _, exists := m.permissions[userID]; !exists {
		m.permissions[userID] = make(map[string]map[auth.Permission]bool)
	}
	if _, exists := m.permissions[userID][vaultID]; !exists {
		m.permissions[userID][vaultID] = make(map[auth.Permission]bool)
	}
	m.permissions[userID][vaultID][perm] = allowed
}

func (m *MockRBACService) SetRole(userID, vaultID string, role auth.Role) {
	// Helper to set all permissions for a role
	perms := map[auth.Role][]auth.Permission{
		auth.RoleOwner: {
			auth.PermCreate,
			auth.PermRead,
			auth.PermUpdate,
			auth.PermDelete,
			auth.PermShare,
			auth.PermManageMembers,
		},
		auth.RoleEditor: {
			auth.PermRead,
			auth.PermUpdate,
			auth.PermShare,
		},
		auth.RoleViewer: {
			auth.PermRead,
		},
	}

	if permList, exists := perms[role]; exists {
		for _, perm := range permList {
			m.SetPermission(userID, vaultID, perm, true)
		}
	}
}

func createTestRouter(rbac *MockRBACService, perm auth.Permission) *chi.Mux {
	r := chi.NewRouter()
	r.Route("/vaults/{vaultID}", func(r chi.Router) {
		r.Use(RequireVaultPermission(rbac, perm))
		r.Get("/test", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})
	return r
}

func TestRBACOwnerPermissions(t *testing.T) {
	rbac := NewMockRBACService()
	userID := "user-owner"
	vaultID := "vault-123"
	rbac.SetRole(userID, vaultID, auth.RoleOwner)

	testCases := []struct {
		name       string
		permission auth.Permission
		expected   int
	}{
		{"owner can create", auth.PermCreate, http.StatusOK},
		{"owner can read", auth.PermRead, http.StatusOK},
		{"owner can update", auth.PermUpdate, http.StatusOK},
		{"owner can delete", auth.PermDelete, http.StatusOK},
		{"owner can share", auth.PermShare, http.StatusOK},
		{"owner can manage members", auth.PermManageMembers, http.StatusOK},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := createTestRouter(rbac, tc.permission)

			req := httptest.NewRequest("GET", "/vaults/vault-123/test", nil)
			req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))

			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)

			if recorder.Code != tc.expected {
				t.Errorf("expected status %d, got %d", tc.expected, recorder.Code)
			}
		})
	}
}

func TestRBACEditorPermissions(t *testing.T) {
	rbac := NewMockRBACService()
	userID := "user-editor"
	vaultID := "vault-123"
	rbac.SetRole(userID, vaultID, auth.RoleEditor)

	testCases := []struct {
		name       string
		permission auth.Permission
		expected   int
	}{
		{"editor can read", auth.PermRead, http.StatusOK},
		{"editor can update", auth.PermUpdate, http.StatusOK},
		{"editor can share", auth.PermShare, http.StatusOK},
		{"editor cannot create", auth.PermCreate, http.StatusForbidden},
		{"editor cannot delete", auth.PermDelete, http.StatusForbidden},
		{"editor cannot manage members", auth.PermManageMembers, http.StatusForbidden},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := createTestRouter(rbac, tc.permission)

			req := httptest.NewRequest("GET", "/vaults/vault-123/test", nil)
			req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))

			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)

			if recorder.Code != tc.expected {
				t.Errorf("expected status %d, got %d", tc.expected, recorder.Code)
			}
		})
	}
}

func TestRBACViewerPermissions(t *testing.T) {
	rbac := NewMockRBACService()
	userID := "user-viewer"
	vaultID := "vault-123"
	rbac.SetRole(userID, vaultID, auth.RoleViewer)

	testCases := []struct {
		name       string
		permission auth.Permission
		expected   int
	}{
		{"viewer can read", auth.PermRead, http.StatusOK},
		{"viewer cannot update", auth.PermUpdate, http.StatusForbidden},
		{"viewer cannot delete", auth.PermDelete, http.StatusForbidden},
		{"viewer cannot share", auth.PermShare, http.StatusForbidden},
		{"viewer cannot manage members", auth.PermManageMembers, http.StatusForbidden},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			router := createTestRouter(rbac, tc.permission)

			req := httptest.NewRequest("GET", "/vaults/vault-123/test", nil)
			req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))

			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)

			if recorder.Code != tc.expected {
				t.Errorf("expected status %d, got %d", tc.expected, recorder.Code)
			}
		})
	}
}

func TestRBACNonMemberForbidden(t *testing.T) {
	rbac := NewMockRBACService()
	userID := "user-stranger"

	t.Run("non-member gets 403 for all operations", func(t *testing.T) {
		permissions := []auth.Permission{
			auth.PermCreate,
			auth.PermRead,
			auth.PermUpdate,
			auth.PermDelete,
			auth.PermShare,
			auth.PermManageMembers,
		}

		for _, perm := range permissions {
			router := createTestRouter(rbac, perm)

			req := httptest.NewRequest("GET", "/vaults/vault-123/test", nil)
			req = req.WithContext(context.WithValue(req.Context(), "user_id", userID))

			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)

			if recorder.Code != http.StatusForbidden {
				t.Errorf("expected 403 for %s, got %d", perm, recorder.Code)
			}
		}
	})
}

func TestRBACMissingUserID(t *testing.T) {
	rbac := NewMockRBACService()

	t.Run("missing user_id returns 401", func(t *testing.T) {
		router := createTestRouter(rbac, auth.PermRead)

		req := httptest.NewRequest("GET", "/vaults/vault-123/test", nil)
		// Don't set user_id in context

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", recorder.Code)
		}
	})
}

func TestRBACMissingVaultID(t *testing.T) {
	rbac := NewMockRBACService()

	t.Run("missing vault ID returns 400", func(t *testing.T) {
		router := createTestRouter(rbac, auth.PermRead)

		req := httptest.NewRequest("GET", "/vaults//test", nil) // Empty vault ID
		req = req.WithContext(context.WithValue(req.Context(), "user_id", "user-123"))

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusBadRequest {
			t.Errorf("expected 400, got %d", recorder.Code)
		}
	})
}

func TestVaultOwnerOnlyMiddleware(t *testing.T) {
	rbac := NewMockRBACService()

	t.Run("VaultOwnerOnly enforces manage_members permission", func(t *testing.T) {
		r := chi.NewRouter()
		r.Route("/vaults/{vaultID}", func(r chi.Router) {
			r.Use(VaultOwnerOnly(rbac))
			r.Get("/members", func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})
		})

		// Test owner access
		rbac.SetPermission("owner", "vault-123", auth.PermManageMembers, true)
		req := httptest.NewRequest("GET", "/vaults/vault-123/members", nil)
		req = req.WithContext(context.WithValue(req.Context(), "user_id", "owner"))

		recorder := httptest.NewRecorder()
		r.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusOK {
			t.Errorf("expected 200 for owner, got %d", recorder.Code)
		}

		// Test non-owner access
		rbac.SetPermission("editor", "vault-123", auth.PermManageMembers, false)
		req = httptest.NewRequest("GET", "/vaults/vault-123/members", nil)
		req = req.WithContext(context.WithValue(req.Context(), "user_id", "editor"))

		recorder = httptest.NewRecorder()
		r.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusForbidden {
			t.Errorf("expected 403 for non-owner, got %d", recorder.Code)
		}
	})
}

func TestRequireVaultRead(t *testing.T) {
	rbac := NewMockRBACService()

	t.Run("RequireVaultRead checks read permission", func(t *testing.T) {
		r := chi.NewRouter()
		r.Route("/vaults/{vaultID}", func(r chi.Router) {
			r.Use(RequireVaultRead(rbac))
			r.Get("/", func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})
		})

		rbac.SetPermission("user-123", "vault-123", auth.PermRead, true)
		req := httptest.NewRequest("GET", "/vaults/vault-123/", nil)
		req = req.WithContext(context.WithValue(req.Context(), "user_id", "user-123"))

		recorder := httptest.NewRecorder()
		r.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", recorder.Code)
		}
	})
}

func TestRequireVaultUpdate(t *testing.T) {
	rbac := NewMockRBACService()

	t.Run("RequireVaultUpdate checks update permission", func(t *testing.T) {
		r := chi.NewRouter()
		r.Route("/vaults/{vaultID}", func(r chi.Router) {
			r.Use(RequireVaultUpdate(rbac))
			r.Put("/", func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})
		})

		rbac.SetPermission("user-123", "vault-123", auth.PermUpdate, true)
		req := httptest.NewRequest("PUT", "/vaults/vault-123/", nil)
		req = req.WithContext(context.WithValue(req.Context(), "user_id", "user-123"))

		recorder := httptest.NewRecorder()
		r.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", recorder.Code)
		}
	})
}

func TestRequireVaultDelete(t *testing.T) {
	rbac := NewMockRBACService()

	t.Run("RequireVaultDelete checks delete permission", func(t *testing.T) {
		r := chi.NewRouter()
		r.Route("/vaults/{vaultID}", func(r chi.Router) {
			r.Use(RequireVaultDelete(rbac))
			r.Delete("/", func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})
		})

		rbac.SetPermission("user-123", "vault-123", auth.PermDelete, true)
		req := httptest.NewRequest("DELETE", "/vaults/vault-123/", nil)
		req = req.WithContext(context.WithValue(req.Context(), "user_id", "user-123"))

		recorder := httptest.NewRecorder()
		r.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", recorder.Code)
		}
	})
}

func TestRBACPermissionBoundaries(t *testing.T) {
	t.Run("permission boundaries are strictly enforced", func(t *testing.T) {
		rbac := NewMockRBACService()

		// Owner should not be able to do things outside their permissions
		rbac.SetRole("owner", "vault-123", auth.RoleOwner)

		// Manually disable one permission to test boundary
		// (In real world, this shouldn't happen but tests edge case)
		ownerPerms := rbac.permissions["owner"]["vault-123"]
		delete(ownerPerms, auth.PermCreate)

		router := createTestRouter(rbac, auth.PermCreate)
		req := httptest.NewRequest("GET", "/vaults/vault-123/test", nil)
		req = req.WithContext(context.WithValue(req.Context(), "user_id", "owner"))

		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)

		if recorder.Code != http.StatusForbidden {
			t.Errorf("expected boundary to be enforced, got %d", recorder.Code)
		}
	})
}
