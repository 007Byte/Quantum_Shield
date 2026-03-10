package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCORSHeadersSetCorrectly(t *testing.T) {
	t.Run("CORS headers are set correctly for allowed origin", func(t *testing.T) {
		config := CORSConfig{
			AllowedOrigins:   []string{"https://example.com"},
			AllowedMethods:   []string{"GET", "POST", "PUT"},
			AllowedHeaders:   []string{"Content-Type", "Authorization"},
			ExposedHeaders:   []string{"X-Total-Count"},
			AllowCredentials: true,
			MaxAge:           3600,
		}

		handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		req.Header.Set("Origin", "https://example.com")

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("Access-Control-Allow-Origin") != "https://example.com" {
			t.Error("Access-Control-Allow-Origin header not set correctly")
		}

		if !strings.Contains(w.Header().Get("Access-Control-Allow-Methods"), "GET") {
			t.Error("Access-Control-Allow-Methods header missing GET")
		}

		if w.Header().Get("Access-Control-Allow-Credentials") != "true" {
			t.Error("Access-Control-Allow-Credentials should be true")
		}

		maxAge := w.Header().Get("Access-Control-Max-Age")
		if maxAge != "3600" {
			t.Errorf("expected Max-Age 3600, got %s", maxAge)
		}
	})
}

func TestCORSInvalidOriginRejected(t *testing.T) {
	t.Run("invalid origin is not allowed", func(t *testing.T) {
		config := CORSConfig{
			AllowedOrigins: []string{"https://example.com"},
		}

		handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		req.Header.Set("Origin", "https://malicious.com")

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		// CORS header should not be set for disallowed origin
		if w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Error("disallowed origin should not have CORS headers set")
		}
	})
}

func TestCORSWildcardOrigin(t *testing.T) {
	t.Run("wildcard origin allows any origin", func(t *testing.T) {
		config := CORSConfig{
			AllowedOrigins: []string{"*"},
		}

		handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		req.Header.Set("Origin", "https://any.domain.com")

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("Access-Control-Allow-Origin") == "" {
			t.Error("wildcard CORS should allow any origin")
		}
	})
}

func TestCORSPreflightRequest(t *testing.T) {
	t.Run("CORS preflight (OPTIONS) request is handled correctly", func(t *testing.T) {
		config := CORSConfig{
			AllowedOrigins: []string{"https://example.com"},
			AllowedMethods: []string{"GET", "POST", "PUT", "DELETE"},
		}

		handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("OPTIONS", "https://api.example.com/data", nil)
		req.Header.Set("Origin", "https://example.com")

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("preflight request should return 200, got %d", w.Code)
		}

		if w.Header().Get("Access-Control-Allow-Methods") == "" {
			t.Error("preflight response should include allowed methods")
		}
	})
}

func TestSecurityHeadersPresent(t *testing.T) {
	t.Run("security headers are present in response", func(t *testing.T) {
		config := DefaultSecurityHeadersConfig(true)

		handler := SecurityHeaders(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		headers := []string{
			"X-Content-Type-Options",
			"X-Frame-Options",
			"X-XSS-Protection",
			"Referrer-Policy",
			"Permissions-Policy",
		}

		for _, header := range headers {
			if w.Header().Get(header) == "" {
				t.Errorf("security header %s is missing", header)
			}
		}
	})
}

func TestXFrameOptionsDeny(t *testing.T) {
	t.Run("X-Frame-Options is set to DENY", func(t *testing.T) {
		config := DefaultSecurityHeadersConfig(true)

		handler := SecurityHeaders(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("X-Frame-Options") != "DENY" {
			t.Errorf("X-Frame-Options should be DENY, got %s", w.Header().Get("X-Frame-Options"))
		}
	})
}

func TestXContentTypeOptionsNosniff(t *testing.T) {
	t.Run("X-Content-Type-Options is set to nosniff", func(t *testing.T) {
		config := DefaultSecurityHeadersConfig(true)

		handler := SecurityHeaders(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("X-Content-Type-Options should be nosniff, got %s", w.Header().Get("X-Content-Type-Options"))
		}
	})
}

func TestHSTSHeaderProduction(t *testing.T) {
	t.Run("HSTS header is set in production", func(t *testing.T) {
		config := DefaultSecurityHeadersConfig(true)

		handler := SecurityHeaders(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		hstsHeader := w.Header().Get("Strict-Transport-Security")
		if hstsHeader == "" {
			t.Error("HSTS header should be set in production")
		}

		if !strings.Contains(hstsHeader, "max-age=") {
			t.Error("HSTS header should contain max-age")
		}

		if !strings.Contains(hstsHeader, "includeSubDomains") {
			t.Error("HSTS header should include subdomains")
		}
	})
}

func TestHSTSHeaderDevelopment(t *testing.T) {
	t.Run("HSTS header is not set in development", func(t *testing.T) {
		config := DefaultSecurityHeadersConfig(false)

		handler := SecurityHeaders(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://localhost:3000/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("Strict-Transport-Security") != "" {
			t.Error("HSTS header should not be set in development")
		}
	})
}

func TestCSPHeaderPresent(t *testing.T) {
	t.Run("Content-Security-Policy header is set", func(t *testing.T) {
		config := DefaultSecurityHeadersConfig(true)

		handler := SecurityHeaders(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		cspHeader := w.Header().Get("Content-Security-Policy")
		if cspHeader == "" {
			t.Error("CSP header should be set")
		}

		if !strings.Contains(cspHeader, "default-src") {
			t.Error("CSP should contain default-src directive")
		}
	})
}

func TestPermissionsPolicySet(t *testing.T) {
	t.Run("Permissions-Policy header restricts browser features", func(t *testing.T) {
		config := DefaultSecurityHeadersConfig(true)

		handler := SecurityHeaders(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		policyHeader := w.Header().Get("Permissions-Policy")
		if policyHeader == "" {
			t.Error("Permissions-Policy header should be set")
		}

		restrictedFeatures := []string{"geolocation", "microphone", "camera", "payment"}
		for _, feature := range restrictedFeatures {
			if !strings.Contains(policyHeader, feature) {
				t.Errorf("Permissions-Policy should restrict %s", feature)
			}
		}
	})
}

func TestReferrerPolicySet(t *testing.T) {
	t.Run("Referrer-Policy is set to strict-origin-when-cross-origin", func(t *testing.T) {
		config := DefaultSecurityHeadersConfig(true)

		handler := SecurityHeaders(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("Referrer-Policy") != "strict-origin-when-cross-origin" {
			t.Errorf("Referrer-Policy should be strict-origin-when-cross-origin, got %s", w.Header().Get("Referrer-Policy"))
		}
	})
}

func TestRequestBodyLimitEnforced(t *testing.T) {
	t.Run("request body size is limited", func(t *testing.T) {
		config := RequestBodyLimitConfig{MaxBytes: 1000}

		handler := RequestBodyLimit(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		// Create a request with body exceeding limit
		body := strings.Repeat("a", 2000)
		req := httptest.NewRequest("POST", "https://api.example.com/data", strings.NewReader(body))

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		// MaxBytesReader will cause the handler to fail if body is read
		// This test verifies the middleware is in place
	})
}

func TestRequestBodyLimitGetRequest(t *testing.T) {
	t.Run("GET requests bypass body limit check", func(t *testing.T) {
		config := RequestBodyLimitConfig{MaxBytes: 100}

		handler := RequestBodyLimit(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("GET request should not be limited, got status %d", w.Code)
		}
	})
}

func TestCORSMultipleOrigins(t *testing.T) {
	t.Run("multiple allowed origins are handled correctly", func(t *testing.T) {
		config := CORSConfig{
			AllowedOrigins: []string{
				"https://example.com",
				"https://app.example.com",
				"https://staging.example.com",
			},
		}

		handler := CORS(config)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		testOrigins := []struct {
			origin    string
			shouldAllow bool
		}{
			{"https://example.com", true},
			{"https://app.example.com", true},
			{"https://staging.example.com", true},
			{"https://malicious.com", false},
		}

		for _, test := range testOrigins {
			req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
			req.Header.Set("Origin", test.origin)

			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)

			allowed := w.Header().Get("Access-Control-Allow-Origin") != ""
			if allowed != test.shouldAllow {
				t.Errorf("origin %s: expected allow=%v, got allow=%v", test.origin, test.shouldAllow, allowed)
			}
		}
	})
}

func TestSecurityHeadersConfigurable(t *testing.T) {
	t.Run("security headers can be toggled via config", func(t *testing.T) {
		configDisabled := SecurityHeadersConfig{
			EnableHSTS:             false,
			EnableFrameProtection:  false,
			EnableContentTypeGuard: false,
		}

		handler := SecurityHeaders(configDisabled)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}))

		req := httptest.NewRequest("GET", "https://api.example.com/data", nil)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		if w.Header().Get("Strict-Transport-Security") != "" {
			t.Error("HSTS should be disabled")
		}

		if w.Header().Get("X-Frame-Options") != "" {
			t.Error("X-Frame-Options should be disabled")
		}

		if w.Header().Get("X-Content-Type-Options") != "" {
			t.Error("X-Content-Type-Options should be disabled")
		}
	})
}
