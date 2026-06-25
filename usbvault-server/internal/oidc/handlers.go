package oidc

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/rs/zerolog/log"
)

// AuditLogger is the minimal interface required for audit logging.
type AuditLogger interface {
	LogAction(ctx context.Context, userID string, actionType string, encryptedDetail []byte) error
}

// HandleListProviders returns an HTTP handler that lists all enabled OIDC providers.
func HandleListProviders(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		providers, err := svc.ListProviders(r.Context())
		if err != nil {
			log.Error().Err(err).Msg("failed to list OIDC providers")
			http.Error(w, "failed to list providers", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"providers": providers,
		})
	}
}

// HandleAuthorize returns an HTTP handler that initiates the OIDC authorization flow.
// It generates a PKCE challenge and state token, then returns the authorization URL.
func HandleAuthorize(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		if slug == "" {
			http.Error(w, "provider slug is required", http.StatusBadRequest)
			return
		}

		redirectURL := r.URL.Query().Get("redirect_uri")
		if redirectURL == "" {
			http.Error(w, "redirect_uri query parameter is required", http.StatusBadRequest)
			return
		}

		authURL, state, _, err := svc.GetAuthorizationURL(r.Context(), slug, redirectURL)
		if err != nil {
			switch err {
			case ErrProviderNotFound:
				http.Error(w, "unknown provider", http.StatusNotFound)
			case ErrProviderDisabled:
				http.Error(w, "provider is disabled", http.StatusForbidden)
			case ErrRedirectURI:
				http.Error(w, "redirect_uri is not allowed for this provider", http.StatusBadRequest)
			default:
				log.Error().Err(err).Str("slug", slug).Msg("failed to generate OIDC authorization URL")
				http.Error(w, "authorization failed", http.StatusInternalServerError)
			}
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"auth_url": authURL,
			"state":    state,
		})
	}
}

// callbackRequest is the expected JSON body for the OIDC callback endpoint.
type callbackRequest struct {
	Code  string `json:"code"`
	State string `json:"state"`
}

// HandleCallback returns an HTTP handler that completes the OIDC callback flow.
// It exchanges the authorization code for tokens, verifies the ID token, maps the user,
// and returns JWT credentials.
func HandleCallback(svc *Service, auditSvc AuditLogger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := chi.URLParam(r, "slug")
		if slug == "" {
			http.Error(w, "provider slug is required", http.StatusBadRequest)
			return
		}

		var req callbackRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		if req.Code == "" || req.State == "" {
			http.Error(w, "code and state are required", http.StatusBadRequest)
			return
		}

		result, err := svc.HandleCallback(r.Context(), slug, req.Code, req.State)
		if err != nil {
			switch {
			case err == ErrInvalidState:
				http.Error(w, "invalid or expired state", http.StatusBadRequest)
			case err == ErrProviderNotFound:
				http.Error(w, "unknown provider", http.StatusNotFound)
			case err == ErrMissingEmail:
				http.Error(w, "identity provider did not return an email", http.StatusUnprocessableEntity)
			case err == ErrEmailNotVerified:
				http.Error(w, "identity provider did not assert a verified email", http.StatusForbidden)
			default:
				log.Error().Err(err).Str("slug", slug).Msg("OIDC callback failed")
				http.Error(w, "authentication failed", http.StatusInternalServerError)
			}
			return
		}

		// Audit log the OIDC login
		if auditSvc != nil {
			auditDetail, _ := json.Marshal(map[string]string{
				"provider": slug,
				"method":   "oidc",
			})
			if err := auditSvc.LogAction(r.Context(), result.UserID, "OIDC_LOGIN", auditDetail); err != nil {
				log.Warn().Err(err).Str("user_id", result.UserID).Msg("failed to log OIDC audit event")
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	}
}
