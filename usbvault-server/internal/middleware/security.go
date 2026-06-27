package middleware

import (
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
)

// RequestBodyLimitConfig holds configuration for request body limit middleware
type RequestBodyLimitConfig struct {
	MaxBytes int64
}

// DefaultRequestBodyLimitConfig returns the default request body limit configuration
func DefaultRequestBodyLimitConfig() RequestBodyLimitConfig {
	// Default 1MB
	maxBytes := int64(1024 * 1024)

	// Check environment variable override
	if envMax := os.Getenv("MAX_REQUEST_BODY_SIZE"); envMax != "" {
		if parsed, err := strconv.ParseInt(envMax, 10, 64); err == nil {
			maxBytes = parsed
		}
	}

	return RequestBodyLimitConfig{
		MaxBytes: maxBytes,
	}
}

// RequestBodyLimit middleware enforces a maximum request body size
func RequestBodyLimit(config RequestBodyLimitConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip limit checks for GET, HEAD, DELETE requests
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodDelete {
				next.ServeHTTP(w, r)
				return
			}

			// Wrap the request body with a limited reader
			r.Body = http.MaxBytesReader(w, r.Body, config.MaxBytes)

			// Create a deferred function to handle potential read errors
			defer func() {
				if err := r.Body.Close(); err != nil {
					// Log but don't panic
					fmt.Fprintf(os.Stderr, "error closing request body: %v\n", err)
				}
			}()

			// Proceed to next handler
			next.ServeHTTP(w, r)
		})
	}
}

// SecurityHeadersConfig holds configuration for security headers middleware
type SecurityHeadersConfig struct {
	EnableHSTS             bool
	HSTSMaxAge             int
	EnableFrameProtection  bool
	EnableContentTypeGuard bool
	EnableCSP              bool
	CSPDirective           string
}

// DefaultSecurityHeadersConfig returns the default security headers configuration
func DefaultSecurityHeadersConfig(isProduction bool) SecurityHeadersConfig {
	config := SecurityHeadersConfig{
		EnableHSTS:             isProduction,
		HSTSMaxAge:             31536000, // 1 year
		EnableFrameProtection:  true,
		EnableContentTypeGuard: true,
		EnableCSP:              isProduction,
		CSPDirective: "default-src 'self'; " +
			"script-src 'self'; " +
			"style-src 'self' 'unsafe-inline'; " +
			"img-src 'self' data: https:; " +
			"font-src 'self'; " +
			"connect-src 'self'; " +
			"frame-ancestors 'none'; " +
			"base-uri 'self'; " +
			"form-action 'self'",
	}

	return config
}

// SecurityHeaders middleware adds important security headers to responses
func SecurityHeaders(config SecurityHeadersConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// X-Content-Type-Options: Prevent MIME type sniffing
			if config.EnableContentTypeGuard {
				w.Header().Set("X-Content-Type-Options", "nosniff")
			}

			// X-Frame-Options: Prevent clickjacking
			if config.EnableFrameProtection {
				w.Header().Set("X-Frame-Options", "DENY")
			}

			// X-XSS-Protection: Browser XSS filter
			w.Header().Set("X-XSS-Protection", "1; mode=block")

			// Referrer-Policy: Control referrer information
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

			// Permissions-Policy: Restrict browser features
			w.Header().Set("Permissions-Policy",
				"accelerometer=(), "+
					"ambient-light-sensor=(), "+
					"autoplay=(), "+
					"battery=(), "+
					"camera=(), "+
					"cross-origin-isolated=(), "+
					"display-capture=(), "+
					"document-domain=(), "+
					"encrypted-media=(), "+
					"execution-while-not-rendered=(), "+
					"execution-while-out-of-viewport=(), "+
					"fullscreen=(), "+
					"geolocation=(), "+
					"gyroscope=(), "+
					"magnetometer=(), "+
					"microphone=(), "+
					"midi=(), "+
					"navigation-override=(), "+
					"payment=(), "+
					"picture-in-picture=(), "+
					"publickey-credentials-get=(), "+
					"speaker-selection=(), "+
					"sync-xhr=(), "+
					"usb=(), "+
					"vr=(), "+
					"xr-spatial-tracking=()",
			)

			// Content-Security-Policy: Mitigate XSS and injection attacks
			if config.EnableCSP {
				w.Header().Set("Content-Security-Policy", config.CSPDirective)
			}

			// Strict-Transport-Security: Enforce HTTPS
			if config.EnableHSTS {
				w.Header().Set("Strict-Transport-Security",
					fmt.Sprintf("max-age=%d; includeSubDomains; preload", config.HSTSMaxAge))
			}

			next.ServeHTTP(w, r)
		})
	}
}

// HTTPSRedirectConfig holds configuration for HTTPS redirect middleware
type HTTPSRedirectConfig struct {
	Enabled bool
	Host    string
}

// DefaultHTTPSRedirectConfig returns the default HTTPS redirect configuration
func DefaultHTTPSRedirectConfig(isProduction bool) HTTPSRedirectConfig {
	return HTTPSRedirectConfig{
		Enabled: isProduction,
		Host:    os.Getenv("API_HOST"),
	}
}

// HTTPSRedirect middleware redirects HTTP requests to HTTPS in production
func HTTPSRedirect(config HTTPSRedirectConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if config.Enabled && !isHTTPS(r) {
				// Build the HTTPS URL
				target := "https://"

				if config.Host != "" {
					target += config.Host
				} else {
					target += r.Host
				}

				target += r.URL.Path

				if r.URL.RawQuery != "" {
					target += "?" + r.URL.RawQuery
				}

				http.Redirect(w, r, target, http.StatusMovedPermanently)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// isHTTPS checks if the request is using HTTPS
func isHTTPS(r *http.Request) bool {
	// Check the scheme
	if r.URL.Scheme == "https" {
		return true
	}

	// Check X-Forwarded-Proto header (common in reverse proxy setups)
	proto := r.Header.Get("X-Forwarded-Proto")
	if strings.ToLower(proto) == "https" {
		return true
	}

	// Check TLS connection
	if r.TLS != nil {
		return true
	}

	return false
}

// CORSConfig holds configuration for CORS middleware
type CORSConfig struct {
	AllowedOrigins   []string
	AllowedMethods   []string
	AllowedHeaders   []string
	ExposedHeaders   []string
	AllowCredentials bool
	MaxAge           int
}

// DefaultCORSConfig returns the default CORS configuration
func DefaultCORSConfig() CORSConfig {
	// CR-007 FIX: Remove hardcoded localhost from CORS + TD-009 FIX: Ensure production doesn't fall back to localhost
	// CORS origins should be explicitly configured via environment variables, not hardcoded
	allowedOrigins := []string{}

	// Load from environment variable if set (recommended for production)
	if corsOrigins := os.Getenv("CORS_ALLOWED_ORIGINS"); corsOrigins != "" {
		allowedOrigins = strings.Split(corsOrigins, ",")
		// Trim whitespace from each origin
		for i, origin := range allowedOrigins {
			allowedOrigins[i] = strings.TrimSpace(origin)
		}
	}

	// If no origins are configured, this is likely a configuration error in production
	// Log a warning if we're in production with no explicit CORS origins
	if len(allowedOrigins) == 0 && os.Getenv("ENVIRONMENT") == "production" {
		// Don't add defaults; fail securely by returning empty list
		// This forces operators to explicitly configure CORS origins
		fmt.Fprintf(os.Stderr, "WARNING: CORS_ALLOWED_ORIGINS not configured in production - no origins will be allowed\n")
	}

	return CORSConfig{
		AllowedOrigins: allowedOrigins,
		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPut,
			http.MethodDelete,
			http.MethodPatch,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Content-Type",
			"X-CSRF-Token",
			"X-Device-Id",
		},
		ExposedHeaders: []string{
			"Content-Length",
			"Content-Type",
			"X-Request-Id",
		},
		AllowCredentials: true,
		MaxAge:           86400, // 24 hours
	}
}

// CORS middleware handles Cross-Origin Resource Sharing
func CORS(config CORSConfig) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			// F4: When credentials are allowed the response MUST echo a
			// specific origin — never "*" — and MUST set Vary: Origin so caches
			// don't serve one origin's CORS headers to another. A wildcard with
			// credentials is rejected by browsers and is a security risk.
			wildcard := false
			isAllowed := false
			for _, allowedOrigin := range config.AllowedOrigins {
				if allowedOrigin == "*" {
					wildcard = true
				}
				if allowedOrigin == origin {
					isAllowed = true
					break
				}
			}
			// Honor a wildcard only when credentials are NOT in use.
			if wildcard && !config.AllowCredentials {
				isAllowed = true
			}

			if isAllowed {
				// Reflect the specific requesting origin (not "*") so the
				// response is valid alongside Access-Control-Allow-Credentials.
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", strings.Join(config.AllowedMethods, ", "))
				w.Header().Set("Access-Control-Allow-Headers", strings.Join(config.AllowedHeaders, ", "))
				w.Header().Set("Access-Control-Expose-Headers", strings.Join(config.ExposedHeaders, ", "))

				if config.AllowCredentials {
					w.Header().Set("Access-Control-Allow-Credentials", "true")
				}

				w.Header().Set("Access-Control-Max-Age", strconv.Itoa(config.MaxAge))
			}

			// Handle preflight requests
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusOK)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// NoSniffResponseBody wraps an http.ResponseWriter to prevent response sniffing
type NoSniffResponseBody struct {
	http.ResponseWriter
	statusCode int
}

// WriteHeader implements http.ResponseWriter.WriteHeader
func (w *NoSniffResponseBody) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

// Write implements http.ResponseWriter.Write
func (w *NoSniffResponseBody) Write(b []byte) (int, error) {
	// Ensure Content-Type is set to prevent sniffing
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	return w.ResponseWriter.Write(b)
}

// RequestLoggingConfig holds configuration for request logging
type RequestLoggingConfig struct {
	Enabled         bool
	LogRequestBody  bool
	LogResponseBody bool
	MaxBodyLogSize  int64
}

// DefaultRequestLoggingConfig returns the default request logging configuration
func DefaultRequestLoggingConfig() RequestLoggingConfig {
	return RequestLoggingConfig{
		Enabled:         true,
		LogRequestBody:  false, // Don't log request bodies by default for security
		LogResponseBody: false,
		MaxBodyLogSize:  1024, // 1KB max
	}
}

// RequestIDHeader is the header name for request IDs
const RequestIDHeader = "X-Request-ID"

// RequestIDFromContext extracts the request ID from the request context
func RequestIDFromContext(r *http.Request) string {
	return r.Header.Get(RequestIDHeader)
}
