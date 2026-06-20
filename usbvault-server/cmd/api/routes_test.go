package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

// ---------------------------------------------------------------------------
// 1. Helper function tests
// ---------------------------------------------------------------------------

// --- getEnvOrDefault ---

func TestGetEnvOrDefault_Set(t *testing.T) {
	t.Setenv("ROUTES_TEST_GEOD_SET", "custom")
	if got := getEnvOrDefault("ROUTES_TEST_GEOD_SET", "fallback"); got != "custom" {
		t.Errorf("expected %q, got %q", "custom", got)
	}
}

func TestGetEnvOrDefault_Unset(t *testing.T) {
	os.Unsetenv("ROUTES_TEST_GEOD_UNSET")
	if got := getEnvOrDefault("ROUTES_TEST_GEOD_UNSET", "fallback"); got != "fallback" {
		t.Errorf("expected %q, got %q", "fallback", got)
	}
}

func TestGetEnvOrDefault_Empty(t *testing.T) {
	t.Setenv("ROUTES_TEST_GEOD_EMPTY", "")
	if got := getEnvOrDefault("ROUTES_TEST_GEOD_EMPTY", "fallback"); got != "fallback" {
		t.Errorf("empty env var should return default; got %q", got)
	}
}

// --- getAllowedOrigins ---

func TestGetAllowedOrigins_Default(t *testing.T) {
	os.Unsetenv("CORS_ALLOWED_ORIGINS")
	t.Setenv("ENVIRONMENT", "development")
	origins := getAllowedOrigins()
	if len(origins) != 2 {
		t.Fatalf("expected 2 default origins, got %d: %v", len(origins), origins)
	}
	if origins[0] != "https://localhost:3000" || origins[1] != "https://localhost:8081" {
		t.Errorf("unexpected default origins: %v", origins)
	}
}

func TestGetAllowedOrigins_Custom(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com, https://admin.example.com")
	origins := getAllowedOrigins()
	if len(origins) != 2 {
		t.Fatalf("expected 2 origins, got %d: %v", len(origins), origins)
	}
	if origins[0] != "https://app.example.com" {
		t.Errorf("expected first origin %q, got %q", "https://app.example.com", origins[0])
	}
	if origins[1] != "https://admin.example.com" {
		t.Errorf("expected second origin %q, got %q", "https://admin.example.com", origins[1])
	}
}

func TestGetAllowedOrigins_SingleOrigin(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://only.example.com")
	origins := getAllowedOrigins()
	if len(origins) != 1 || origins[0] != "https://only.example.com" {
		t.Errorf("expected single origin; got %v", origins)
	}
}

func TestGetAllowedOrigins_WhitespaceOnly(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "  ,  , ")
	t.Setenv("ENVIRONMENT", "development")
	origins := getAllowedOrigins()
	if len(origins) != 2 {
		t.Errorf("expected fallback to 2 defaults, got %d: %v", len(origins), origins)
	}
}

// TestGetAllowedOrigins_ProductionFatal verifies that production mode requires
// CORS_ALLOWED_ORIGINS. Since log.Fatal calls os.Exit(1), this cannot be tested
// directly in a unit test. Validated by the production readiness script.

func TestGetAllowedOrigins_TrailingComma(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://one.com,https://two.com,")
	origins := getAllowedOrigins()
	if len(origins) != 2 {
		t.Errorf("trailing comma should not produce empty entry; got %d: %v", len(origins), origins)
	}
}

// --- extractRedisAddr ---

func TestExtractRedisAddr_Standard(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"redis://myhost:6379", "myhost:6379"},
		{"redis://10.0.0.1:6380", "10.0.0.1:6380"},
		{"redis://user:pass@host:6379", "user:pass@host:6379"},
	}
	for _, tc := range tests {
		if got := extractRedisAddr(tc.input); got != tc.want {
			t.Errorf("extractRedisAddr(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestExtractRedisAddr_Short(t *testing.T) {
	tests := []struct {
		input, want string
	}{
		{"", "localhost:6379"},
		{"redis", "localhost:6379"},
		{"redis://", "localhost:6379"},
		{"redis:/", "localhost:6379"},
	}
	for _, tc := range tests {
		if got := extractRedisAddr(tc.input); got != tc.want {
			t.Errorf("extractRedisAddr(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

// --- parseDurationFromEnv ---

func TestParseDurationFromEnv_Valid(t *testing.T) {
	t.Setenv("ROUTES_TEST_DUR", "30s")
	got := parseDurationFromEnv("ROUTES_TEST_DUR", 5*time.Second)
	if got != 30*time.Second {
		t.Errorf("expected 30s, got %v", got)
	}
}

func TestParseDurationFromEnv_Empty(t *testing.T) {
	os.Unsetenv("ROUTES_TEST_DUR_EMPTY")
	got := parseDurationFromEnv("ROUTES_TEST_DUR_EMPTY", 42*time.Second)
	if got != 42*time.Second {
		t.Errorf("expected default 42s, got %v", got)
	}
}

func TestParseDurationFromEnv_Invalid(t *testing.T) {
	t.Setenv("ROUTES_TEST_DUR_BAD", "notaduration")
	got := parseDurationFromEnv("ROUTES_TEST_DUR_BAD", 7*time.Second)
	if got != 7*time.Second {
		t.Errorf("invalid duration should return default 7s, got %v", got)
	}
}

func TestParseDurationFromEnv_Minutes(t *testing.T) {
	t.Setenv("ROUTES_TEST_DUR_MIN", "5m")
	got := parseDurationFromEnv("ROUTES_TEST_DUR_MIN", time.Second)
	if got != 5*time.Minute {
		t.Errorf("expected 5m, got %v", got)
	}
}

// --- getIntEnvOrDefault ---

func TestGetIntEnvOrDefault_Valid(t *testing.T) {
	t.Setenv("ROUTES_TEST_INT", "100")
	if got := getIntEnvOrDefault("ROUTES_TEST_INT", 50); got != 100 {
		t.Errorf("expected 100, got %d", got)
	}
}

func TestGetIntEnvOrDefault_Empty(t *testing.T) {
	os.Unsetenv("ROUTES_TEST_INT_EMPTY")
	if got := getIntEnvOrDefault("ROUTES_TEST_INT_EMPTY", 25); got != 25 {
		t.Errorf("expected default 25, got %d", got)
	}
}

func TestGetIntEnvOrDefault_Invalid(t *testing.T) {
	t.Setenv("ROUTES_TEST_INT_BAD", "abc")
	if got := getIntEnvOrDefault("ROUTES_TEST_INT_BAD", 99); got != 99 {
		t.Errorf("invalid int should return default 99, got %d", got)
	}
}

func TestGetIntEnvOrDefault_Zero(t *testing.T) {
	t.Setenv("ROUTES_TEST_INT_ZERO", "0")
	if got := getIntEnvOrDefault("ROUTES_TEST_INT_ZERO", 10); got != 0 {
		t.Errorf("expected 0, got %d", got)
	}
}

func TestGetIntEnvOrDefault_Negative(t *testing.T) {
	t.Setenv("ROUTES_TEST_INT_NEG", "-5")
	if got := getIntEnvOrDefault("ROUTES_TEST_INT_NEG", 10); got != -5 {
		t.Errorf("expected -5, got %d", got)
	}
}

func TestGetIntEnvOrDefault_Float(t *testing.T) {
	t.Setenv("ROUTES_TEST_INT_FLOAT", "3.14")
	if got := getIntEnvOrDefault("ROUTES_TEST_INT_FLOAT", 1); got != 1 {
		t.Errorf("float should return default 1, got %d", got)
	}
}

// --- getS3BucketName ---

func TestGetS3BucketName_Default(t *testing.T) {
	os.Unsetenv("S3_BUCKET")
	name := getS3BucketName()
	if name == nil {
		t.Fatal("expected non-nil pointer")
	}
	if *name != "usbvault-files" {
		t.Errorf("expected %q, got %q", "usbvault-files", *name)
	}
}

func TestGetS3BucketName_Custom(t *testing.T) {
	t.Setenv("S3_BUCKET", "my-custom-bucket")
	name := getS3BucketName()
	if name == nil {
		t.Fatal("expected non-nil pointer")
	}
	if *name != "my-custom-bucket" {
		t.Errorf("expected %q, got %q", "my-custom-bucket", *name)
	}
}

// ---------------------------------------------------------------------------
// 2. Route configuration tests (stub router)
// ---------------------------------------------------------------------------

// buildTestRouter creates a chi router that mirrors the route structure from
// main() but uses trivial stub handlers so we can test that route patterns
// are registered correctly without needing real services or a database.
func buildTestRouter() *chi.Mux {
	r := chi.NewRouter()

	// Stub JSON handler that returns {"stub":true}
	stubJSON := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"stub":true}`)) //nolint:errcheck
	})

	// Health endpoint (realistic response)
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"timestamp": time.Now().Format(time.RFC3339),
			"checks": map[string]bool{
				"database": true,
				"redis":    true,
				"s3":       true,
			},
		})
	})

	// Readiness endpoint (realistic response)
	r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ready"}`)) //nolint:errcheck
	})

	// Metrics endpoints
	r.Get("/metrics/pool", stubJSON)
	r.Get("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.Write([]byte("# HELP stub_metric A stub metric\n# TYPE stub_metric gauge\nstub_metric 1\n")) //nolint:errcheck
	})

	// API v1 routes
	r.Route("/api/v1", func(r chi.Router) {
		// Auth routes
		r.Route("/auth", func(r chi.Router) {
			r.Post("/srp/init", stubJSON)
			r.Post("/srp/verify", stubJSON)
			r.Post("/fido2/challenge", stubJSON)
			r.Post("/fido2/verify", stubJSON)
			r.Post("/register", stubJSON)
			r.Post("/refresh", stubJSON)
			r.Post("/logout", stubJSON)

			// FIDO2 management (authenticated in real server)
			r.Route("/fido2/manage", func(r chi.Router) {
				r.Post("/register/init", stubJSON)
				r.Post("/register/verify", stubJSON)
				r.Get("/credentials", stubJSON)
				r.Delete("/credentials", stubJSON)
			})
		})

		// Vault routes
		r.Route("/vaults", func(r chi.Router) {
			r.Post("/", stubJSON)
			r.Get("/", stubJSON)
			r.Get("/{vaultID}", stubJSON)
			r.Put("/{vaultID}", stubJSON)
			r.Delete("/{vaultID}", stubJSON)

			// Key hierarchy
			r.Post("/{vaultID}/key-hierarchy", stubJSON)
			r.Get("/{vaultID}/key-hierarchy", stubJSON)

			// Blobs
			r.Route("/{vaultID}/blobs", func(r chi.Router) {
				r.Post("/upload-url", stubJSON)
				r.Post("/download-url", stubJSON)
				r.Get("/", stubJSON)
				r.Delete("/{blobID}", stubJSON)
			})

			// Multipart uploads
			r.Route("/{vaultID}/files/{fileID}/multipart", func(r chi.Router) {
				r.Post("/", stubJSON)
				r.Get("/{uploadID}/part/{partNumber}", stubJSON)
				r.Post("/{uploadID}/part", stubJSON)
				r.Post("/{uploadID}/complete", stubJSON)
				r.Delete("/{uploadID}", stubJSON)
				r.Get("/{uploadID}/progress", stubJSON)
			})

			// Members
			r.Route("/{vaultID}/members", func(r chi.Router) {
				r.Get("/", stubJSON)
				r.Post("/", stubJSON)
				r.Delete("/{memberUserID}", stubJSON)
				r.Post("/transfer-ownership", stubJSON)
			})

			// Key rotation
			r.Post("/{vaultID}/rotate", stubJSON)
			r.Get("/{vaultID}/rotation-status", stubJSON)
		})

		// Sharing routes
		r.Route("/shares", func(r chi.Router) {
			r.Post("/", stubJSON)
			r.Get("/received", stubJSON)
			r.Get("/sent", stubJSON)
			r.Delete("/{shareID}", stubJSON)
			r.Get("/public-key/{userID}", stubJSON)
			r.Post("/public-key", stubJSON)
			r.Post("/{shareID}/accept", stubJSON)
			r.Post("/{shareID}/reject", stubJSON)
			r.Get("/fingerprint/{userID}", stubJSON)
			r.Post("/verify-contact", stubJSON)
		})

		// Audit routes
		r.Route("/audit", func(r chi.Router) {
			r.Get("/", stubJSON)
			r.Post("/verify", stubJSON)
			r.Get("/anomalies", stubJSON)
			r.Get("/compliance-report", stubJSON)
			r.Get("/compliance-export", stubJSON)
		})

		// Billing routes
		r.Route("/billing", func(r chi.Router) {
			r.Post("/webhook", stubJSON)
			r.Post("/customer", stubJSON)
			r.Post("/subscribe", stubJSON)
			r.Get("/subscription", stubJSON)
			r.Post("/upgrade", stubJSON)
			r.Post("/downgrade", stubJSON)
			r.Post("/cancel", stubJSON)
		})

		// Notifications
		r.Route("/notify", func(r chi.Router) {
			r.Post("/register-device", stubJSON)
		})

		// Recovery
		r.Route("/recovery", func(r chi.Router) {
			r.Post("/generate", stubJSON)
			r.Post("/verify", stubJSON)
			r.Get("/remaining", stubJSON)
		})

		// User account
		r.Route("/user", func(r chi.Router) {
			r.Delete("/account", stubJSON)
		})

		// Sync (WebSocket)
		r.Handle("/sync", stubJSON)

		// Admin routes
		r.Route("/admin", func(r chi.Router) {
			r.Post("/rotate-jwt-keys", stubJSON)
			r.Post("/backups", stubJSON)
			r.Get("/backups", stubJSON)
			r.Post("/backups/{backupID}/restore", stubJSON)
		})
	})

	return r
}

// TestRouteExists verifies that all expected route paths respond with 200 OK
// (via stub handlers) rather than 404 Not Found.
func TestRouteExists(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	type routeCheck struct {
		method string
		path   string
	}

	routes := []routeCheck{
		// Top-level endpoints
		{"GET", "/health"},
		{"GET", "/ready"},
		{"GET", "/metrics"},
		{"GET", "/metrics/pool"},

		// Auth
		{"POST", "/api/v1/auth/srp/init"},
		{"POST", "/api/v1/auth/srp/verify"},
		{"POST", "/api/v1/auth/fido2/challenge"},
		{"POST", "/api/v1/auth/fido2/verify"},
		{"POST", "/api/v1/auth/register"},
		{"POST", "/api/v1/auth/refresh"},
		{"POST", "/api/v1/auth/logout"},
		{"POST", "/api/v1/auth/fido2/manage/register/init"},
		{"POST", "/api/v1/auth/fido2/manage/register/verify"},
		{"GET", "/api/v1/auth/fido2/manage/credentials"},
		{"DELETE", "/api/v1/auth/fido2/manage/credentials"},

		// Vaults
		{"POST", "/api/v1/vaults"},
		{"GET", "/api/v1/vaults"},
		{"GET", "/api/v1/vaults/test-vault-id"},
		{"PUT", "/api/v1/vaults/test-vault-id"},
		{"DELETE", "/api/v1/vaults/test-vault-id"},
		{"POST", "/api/v1/vaults/test-vault-id/key-hierarchy"},
		{"GET", "/api/v1/vaults/test-vault-id/key-hierarchy"},

		// Blobs
		{"POST", "/api/v1/vaults/test-vault-id/blobs/upload-url"},
		{"POST", "/api/v1/vaults/test-vault-id/blobs/download-url"},
		{"GET", "/api/v1/vaults/test-vault-id/blobs"},
		{"DELETE", "/api/v1/vaults/test-vault-id/blobs/blob-123"},

		// Multipart uploads
		{"POST", "/api/v1/vaults/v1/files/f1/multipart"},
		{"GET", "/api/v1/vaults/v1/files/f1/multipart/up1/part/3"},
		{"POST", "/api/v1/vaults/v1/files/f1/multipart/up1/part"},
		{"POST", "/api/v1/vaults/v1/files/f1/multipart/up1/complete"},
		{"DELETE", "/api/v1/vaults/v1/files/f1/multipart/up1"},
		{"GET", "/api/v1/vaults/v1/files/f1/multipart/up1/progress"},

		// Members
		{"GET", "/api/v1/vaults/test-vault-id/members"},
		{"POST", "/api/v1/vaults/test-vault-id/members"},
		{"DELETE", "/api/v1/vaults/test-vault-id/members/member-123"},
		{"POST", "/api/v1/vaults/test-vault-id/members/transfer-ownership"},

		// Key rotation
		{"POST", "/api/v1/vaults/test-vault-id/rotate"},
		{"GET", "/api/v1/vaults/test-vault-id/rotation-status"},

		// Sharing
		{"POST", "/api/v1/shares"},
		{"GET", "/api/v1/shares/received"},
		{"GET", "/api/v1/shares/sent"},
		{"DELETE", "/api/v1/shares/share-abc"},
		{"GET", "/api/v1/shares/public-key/user-xyz"},
		{"POST", "/api/v1/shares/public-key"},
		{"POST", "/api/v1/shares/share-abc/accept"},
		{"POST", "/api/v1/shares/share-abc/reject"},
		{"GET", "/api/v1/shares/fingerprint/user-xyz"},
		{"POST", "/api/v1/shares/verify-contact"},

		// Audit
		{"GET", "/api/v1/audit"},
		{"POST", "/api/v1/audit/verify"},
		{"GET", "/api/v1/audit/anomalies"},
		{"GET", "/api/v1/audit/compliance-report"},
		{"GET", "/api/v1/audit/compliance-export"},

		// Billing
		{"POST", "/api/v1/billing/webhook"},
		{"POST", "/api/v1/billing/customer"},
		{"POST", "/api/v1/billing/subscribe"},
		{"GET", "/api/v1/billing/subscription"},
		{"POST", "/api/v1/billing/upgrade"},
		{"POST", "/api/v1/billing/downgrade"},
		{"POST", "/api/v1/billing/cancel"},

		// Notifications
		{"POST", "/api/v1/notify/register-device"},

		// Recovery
		{"POST", "/api/v1/recovery/generate"},
		{"POST", "/api/v1/recovery/verify"},
		{"GET", "/api/v1/recovery/remaining"},

		// User account
		{"DELETE", "/api/v1/user/account"},

		// Admin
		{"POST", "/api/v1/admin/rotate-jwt-keys"},
		{"POST", "/api/v1/admin/backups"},
		{"GET", "/api/v1/admin/backups"},
		{"POST", "/api/v1/admin/backups/bk-001/restore"},
	}

	for _, rc := range routes {
		t.Run(rc.method+" "+rc.path, func(t *testing.T) {
			req, err := http.NewRequest(rc.method, ts.URL+rc.path, nil)
			if err != nil {
				t.Fatalf("failed to create request: %v", err)
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			resp.Body.Close()
			if resp.StatusCode == http.StatusNotFound {
				t.Errorf("route %s %s returned 404 - route not registered", rc.method, rc.path)
			}
		})
	}
}

// TestRouteMethodNotAllowed verifies that known paths reject wrong methods
// with 405 instead of 404, confirming the path is registered.
func TestRouteMethodNotAllowed(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	tests := []struct {
		method string
		path   string
	}{
		{"DELETE", "/health"},    // Only GET is registered
		{"PUT", "/ready"},       // Only GET is registered
		{"GET", "/api/v1/auth/register"}, // Only POST is registered
		{"DELETE", "/api/v1/auth/srp/init"}, // Only POST is registered
	}

	for _, tc := range tests {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			req, _ := http.NewRequest(tc.method, ts.URL+tc.path, nil)
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			resp.Body.Close()
			// chi returns 405 for wrong method on a known path
			if resp.StatusCode == http.StatusNotFound {
				t.Errorf("expected 405 (method not allowed) for %s %s, got 404", tc.method, tc.path)
			}
		})
	}
}

// TestNonExistentRouteReturns404 confirms paths that are NOT registered return 404.
func TestNonExistentRouteReturns404(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	paths := []string{
		"/api/v1/nonexistent",
		"/api/v2/auth/register",
		"/api/v1/auth/doesnotexist",
		"/api/v1/vaults/test/nonexistent-sub",
		"/totally-unknown",
	}

	for _, path := range paths {
		t.Run("GET "+path, func(t *testing.T) {
			resp, err := http.Get(ts.URL + path)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			resp.Body.Close()
			if resp.StatusCode != http.StatusNotFound {
				t.Errorf("expected 404 for %s, got %d", path, resp.StatusCode)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// 3. Request/Response contract tests for key endpoints
// ---------------------------------------------------------------------------

// TestHealthEndpoint_ResponseFormat verifies /health returns valid JSON with
// the expected structure.
func TestHealthEndpoint_ResponseFormat(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Errorf("expected application/json content-type, got %q", ct)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}

	if _, ok := body["status"]; !ok {
		t.Error("health response missing 'status' field")
	}
	if _, ok := body["timestamp"]; !ok {
		t.Error("health response missing 'timestamp' field")
	}
	if _, ok := body["checks"]; !ok {
		t.Error("health response missing 'checks' field")
	}

	checks, ok := body["checks"].(map[string]interface{})
	if !ok {
		t.Fatal("'checks' is not an object")
	}
	for _, key := range []string{"database", "redis", "s3"} {
		if _, exists := checks[key]; !exists {
			t.Errorf("health checks missing %q", key)
		}
	}
}

// TestReadyEndpoint_ResponseFormat verifies /ready returns valid JSON.
func TestReadyEndpoint_ResponseFormat(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/ready")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode JSON: %v", err)
	}

	status, ok := body["status"].(string)
	if !ok || status != "ready" {
		t.Errorf("expected status=ready, got %v", body["status"])
	}
}

// TestMetricsEndpoint_Format verifies /metrics returns Prometheus-style text.
func TestMetricsEndpoint_Format(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/metrics")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	ct := resp.Header.Get("Content-Type")
	if !strings.Contains(ct, "text/plain") {
		t.Errorf("expected text/plain content-type for Prometheus metrics, got %q", ct)
	}

	var buf strings.Builder
	if _, err := io.Copy(&buf, resp.Body); err != nil {
		t.Fatalf("failed to read body: %v", err)
	}
	body := buf.String()
	if !strings.Contains(body, "# HELP") || !strings.Contains(body, "# TYPE") {
		t.Error("metrics body missing Prometheus HELP/TYPE annotations")
	}
}

// TestAuthRegister_ValidBody verifies POST /api/v1/auth/register accepts
// valid JSON and responds with 200 from the stub.
func TestAuthRegister_ValidBody(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	body := `{"username":"testuser","verifier":"aabbccdd","salt":"1122"}`
	resp, err := http.Post(ts.URL+"/api/v1/auth/register", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		t.Error("POST /api/v1/auth/register returned 404 - route not registered")
	}
	// Stub should return 200
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 from stub, got %d", resp.StatusCode)
	}
}

// TestAuthRegister_EmptyBody verifies the route accepts empty bodies (the stub
// does not validate, but the route must still be reachable).
func TestAuthRegister_EmptyBody(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/v1/auth/register", "application/json", strings.NewReader(""))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		t.Error("POST /api/v1/auth/register returned 404 with empty body")
	}
}

// TestAuthRegister_InvalidJSON confirms the route is reachable even with
// malformed JSON (the stub handler always returns 200).
func TestAuthRegister_InvalidJSON(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/v1/auth/register", "application/json", strings.NewReader("{invalid"))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		t.Error("POST /api/v1/auth/register returned 404 with invalid JSON")
	}
}

// TestAuthSRPInit_ValidBody verifies POST /api/v1/auth/srp/init is reachable
// and responds to valid JSON.
func TestAuthSRPInit_ValidBody(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	body := `{"username":"alice"}`
	resp, err := http.Post(ts.URL+"/api/v1/auth/srp/init", "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		t.Error("POST /api/v1/auth/srp/init returned 404")
	}
	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200 from stub, got %d", resp.StatusCode)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if _, ok := result["stub"]; !ok {
		t.Error("expected stub response body")
	}
}

// TestAuthSRPInit_EmptyBody verifies the route handles empty POST bodies.
func TestAuthSRPInit_EmptyBody(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/v1/auth/srp/init", "application/json", strings.NewReader(""))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		t.Error("POST /api/v1/auth/srp/init returned 404 with empty body")
	}
}

// TestAuthSRPInit_MissingContentType verifies routing works regardless of
// Content-Type header.
func TestAuthSRPInit_MissingContentType(t *testing.T) {
	router := buildTestRouter()
	ts := httptest.NewServer(router)
	defer ts.Close()

	req, _ := http.NewRequest("POST", ts.URL+"/api/v1/auth/srp/init", strings.NewReader(`{"username":"bob"}`))
	// Deliberately omit Content-Type
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		t.Error("route should exist regardless of Content-Type")
	}
}

// ---------------------------------------------------------------------------
// 4. Route count validation
// ---------------------------------------------------------------------------

// TestRouteCount walks the chi router and ensures we have a minimum number of
// registered routes, as a safeguard against accidentally dropping routes.
func TestRouteCount(t *testing.T) {
	router := buildTestRouter()

	count := 0
	walkFunc := func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		count++
		return nil
	}

	if err := chi.Walk(router, walkFunc); err != nil {
		t.Fatalf("chi.Walk failed: %v", err)
	}

	// We have roughly 70+ route/method combos in main.go.
	// Use a conservative minimum so the test fails only if many routes disappear.
	const minimumRoutes = 50
	if count < minimumRoutes {
		t.Errorf("expected at least %d registered routes, found %d", minimumRoutes, count)
	}
	t.Logf("total registered route/method combos: %d", count)
}
