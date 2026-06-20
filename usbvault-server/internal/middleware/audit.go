package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/usbvault/usbvault-server/internal/audit"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

// AuditMiddlewareConfig configures the audit middleware behavior.
type AuditMiddlewareConfig struct {
	// SkipPaths are path prefixes that should not be audited.
	SkipPaths []string
	// SkipMethods are HTTP methods that should not be audited (e.g., GET for read-only).
	SkipMethods []string
}

// DefaultAuditMiddlewareConfig returns the default audit middleware configuration.
// By default, only mutating methods (POST, PUT, DELETE, PATCH) are audited,
// and infrastructure paths (health, metrics) are skipped.
func DefaultAuditMiddlewareConfig() AuditMiddlewareConfig {
	return AuditMiddlewareConfig{
		SkipPaths: []string{
			"/health",
			"/ready",
			"/metrics",
			"/.well-known/",
		},
		SkipMethods: []string{
			http.MethodGet,
			http.MethodHead,
			http.MethodOptions,
		},
	}
}

// AuditMiddleware logs all mutating HTTP requests as structured security events.
// This provides a safety net ensuring every state-changing API call is recorded,
// even if the handler forgets to call auditService.LogAction() explicitly.
//
// Handler-level audit calls (LogAction) remain for domain-specific detail (e.g., encrypted
// metadata in the tamper-proof hash chain). This middleware provides HTTP-level coverage
// for SOC 2 compliance — ensuring no mutating operation goes completely unlogged.
func AuditMiddleware(auditSvc *audit.AuditService, config AuditMiddlewareConfig) func(http.Handler) http.Handler {
	skipMethodSet := make(map[string]bool, len(config.SkipMethods))
	for _, m := range config.SkipMethods {
		skipMethodSet[m] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip non-mutating methods
			if skipMethodSet[r.Method] {
				next.ServeHTTP(w, r)
				return
			}

			// Skip infrastructure paths
			for _, prefix := range config.SkipPaths {
				if strings.HasPrefix(r.URL.Path, prefix) {
					next.ServeHTTP(w, r)
					return
				}
			}

			// Wrap response writer to capture status code
			wrapped := &ResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}

			// Execute the handler
			start := time.Now()
			next.ServeHTTP(wrapped, r)
			duration := time.Since(start)

			// Build the security event asynchronously to avoid adding latency
			userID, _ := r.Context().Value(ctxkeys.UserID).(string)
			sourceIP := getClientIP(r)
			userAgent := r.Header.Get("User-Agent")
			statusCode := wrapped.statusCode
			method := r.Method
			path := r.URL.Path

			// RELIABILITY FIX (M-8): Extract trace ID from request context before launching goroutine
			requestID := r.Header.Get("X-Request-ID")
			if requestID == "" {
				requestID = r.Header.Get("X-Trace-ID")
			}

			go func() {
				eventType := classifyEvent(method, path)
				severity := classifySeverity(statusCode)
				outcome := "success"
				if statusCode >= 400 {
					outcome = "failure"
				}

				resourceType, resourceID := extractResource(path)

				event := audit.SecurityEvent{
					EventType:    eventType,
					Severity:     severity,
					SourceIP:     sourceIP,
					UserAgent:    userAgent,
					UserID:       userID,
					ResourceType: resourceType,
					ResourceID:   resourceID,
					Outcome:      outcome,
					Timestamp:    time.Now().UTC(),
					Details:      formatDetails(method, path, statusCode, duration),
				}

				// Use a background context since the request context may be cancelled
				// Inject the trace ID into the background context for correlation
				ctx := context.Background()
				if requestID != "" {
					ctx = context.WithValue(ctx, ctxkeys.RequestID, requestID)
				}
				ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
				defer cancel()

				if err := auditSvc.LogSecurityEvent(ctx, event); err != nil {
					log.Error().Err(err).
						Str("event_type", eventType).
						Str("path", path).
						Msg("audit middleware: failed to log security event")
				}
			}()
		})
	}
}

// classifyEvent maps HTTP method + path to a meaningful audit event type.
func classifyEvent(method, path string) string {
	// Auth events
	if strings.Contains(path, "/auth/") {
		switch {
		case strings.Contains(path, "/register"):
			return audit.EventAccountCreated
		case strings.Contains(path, "/srp/verify") || strings.Contains(path, "/fido2/verify"):
			return audit.EventAuthLogin
		case strings.Contains(path, "/logout"):
			return audit.EventAuthLogout
		case strings.Contains(path, "/refresh"):
			return audit.EventTokenRefresh
		}
		return "AUTH_ACTION"
	}

	// Vault operations
	if strings.Contains(path, "/vaults") {
		if strings.Contains(path, "/members") {
			return audit.EventPermissionChange
		}
		if strings.Contains(path, "/rotate") {
			return audit.EventKeyRotation
		}
		if strings.Contains(path, "/blobs") || strings.Contains(path, "/multipart") {
			if method == http.MethodDelete {
				return "DATA_DELETE"
			}
			return audit.EventDataAccess
		}
		switch method {
		case http.MethodPost:
			return "VAULT_CREATE"
		case http.MethodPut:
			return "VAULT_UPDATE"
		case http.MethodDelete:
			return "VAULT_DELETE"
		}
	}

	// Share operations
	if strings.Contains(path, "/shares") {
		if method == http.MethodDelete {
			return "SHARE_REVOKE"
		}
		return "SHARE_ACTION"
	}

	// Billing operations
	if strings.Contains(path, "/billing") {
		return "BILLING_ACTION"
	}

	// Admin operations
	if strings.Contains(path, "/admin") {
		return audit.EventConfigChange
	}

	// Account operations
	if strings.Contains(path, "/user/account") && method == http.MethodDelete {
		return audit.EventAccountDeleted
	}

	// Recovery code operations
	if strings.Contains(path, "/recovery") {
		return "RECOVERY_ACTION"
	}

	return "API_MUTATION"
}

// classifySeverity determines the severity based on HTTP status code.
func classifySeverity(statusCode int) string {
	switch {
	case statusCode >= 500:
		return audit.SeverityCritical
	case statusCode == 401 || statusCode == 403:
		return audit.SeverityWarn
	case statusCode >= 400:
		return audit.SeverityInfo
	default:
		return audit.SeverityInfo
	}
}

// extractResource parses the URL path to identify the resource type and ID.
func extractResource(path string) (resourceType, resourceID string) {
	// Strip /api/v1/ prefix
	cleaned := strings.TrimPrefix(path, "/api/v1/")
	parts := strings.Split(cleaned, "/")

	if len(parts) == 0 {
		return "unknown", ""
	}

	resourceType = parts[0] // e.g., "vaults", "shares", "auth"

	// Extract resource ID if present (second path segment, typically a UUID)
	if len(parts) >= 2 && parts[1] != "" {
		resourceID = parts[1]
	}

	return resourceType, resourceID
}

// formatDetails creates a concise detail string for the audit event.
func formatDetails(method, path string, statusCode int, duration time.Duration) string {
	return method + " " + path + " → " + http.StatusText(statusCode) + " (" + duration.Round(time.Millisecond).String() + ")"
}
