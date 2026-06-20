//go:build iast

package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Taint detection tests
// ---------------------------------------------------------------------------

func TestIASTTracker_DetectsSQLTaintInQueryParam(t *testing.T) {
	store := NewIASTStore()
	handler := IASTTracker(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/vaults?name='+OR+1=1--", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if store.Count() == 0 {
		t.Fatal("expected at least one taint finding, got none")
	}

	f := store.All()[0]
	if f.Type != "taint" {
		t.Errorf("expected finding type 'taint', got %q", f.Type)
	}
	if f.Severity != "HIGH" {
		t.Errorf("expected severity 'HIGH', got %q", f.Severity)
	}
	if f.Parameter != "name" {
		t.Errorf("expected parameter 'name', got %q", f.Parameter)
	}
}

func TestIASTTracker_DetectsSQLTaintInFormParam(t *testing.T) {
	store := NewIASTStore()
	handler := IASTTracker(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	body := strings.NewReader("username=admin' OR 1=1 --&password=test")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/srp/init", body)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if store.Count() == 0 {
		t.Fatal("expected at least one taint finding for form parameter, got none")
	}

	found := false
	for _, f := range store.All() {
		if f.Type == "taint" && f.Parameter == "username" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected taint finding for 'username' parameter")
	}
}

// ---------------------------------------------------------------------------
// PII leak detection tests
// ---------------------------------------------------------------------------

func TestIASTTracker_DetectsSSNInResponse(t *testing.T) {
	store := NewIASTStore()
	handler := IASTTracker(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ssn":"123-45-6789","name":"test"}`))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/user/profile", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if store.Count() == 0 {
		t.Fatal("expected PII finding for SSN in response, got none")
	}

	found := false
	for _, f := range store.All() {
		if f.Type == "pii_leak" && strings.Contains(f.Description, "ssn") {
			found = true
			if f.Severity != "HIGH" {
				t.Errorf("SSN leak should be HIGH severity, got %q", f.Severity)
			}
			break
		}
	}
	if !found {
		t.Error("expected pii_leak finding mentioning 'ssn'")
	}
}

func TestIASTTracker_DetectsCreditCardInResponse(t *testing.T) {
	store := NewIASTStore()
	handler := IASTTracker(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"card":"4111-1111-1111-1111"}`))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/billing/info", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	found := false
	for _, f := range store.All() {
		if f.Type == "pii_leak" && strings.Contains(f.Description, "credit_card") {
			found = true
			if f.Severity != "HIGH" {
				t.Errorf("credit card leak should be HIGH severity, got %q", f.Severity)
			}
			break
		}
	}
	if !found {
		t.Error("expected pii_leak finding mentioning 'credit_card'")
	}
}

func TestIASTTracker_DetectsEmailInResponse(t *testing.T) {
	store := NewIASTStore()
	handler := IASTTracker(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"email":"user@example.com"}`))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/user/profile", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	found := false
	for _, f := range store.All() {
		if f.Type == "pii_leak" && strings.Contains(f.Description, "email") {
			found = true
			if f.Severity != "MEDIUM" {
				t.Errorf("email leak should be MEDIUM severity, got %q", f.Severity)
			}
			break
		}
	}
	if !found {
		t.Error("expected pii_leak finding mentioning 'email'")
	}
}

// ---------------------------------------------------------------------------
// Clean request tests
// ---------------------------------------------------------------------------

func TestIASTTracker_CleanRequestPassesWithoutFindings(t *testing.T) {
	store := NewIASTStore()
	handler := IASTTracker(store)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok","vault_count":3}`))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/vaults?page=1&limit=10", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if store.Count() != 0 {
		t.Errorf("expected zero findings for clean request, got %d", store.Count())
		for _, f := range store.All() {
			t.Logf("  finding: %s — %s", f.Type, f.Description)
		}
	}

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

// ---------------------------------------------------------------------------
// Debug endpoint tests
// ---------------------------------------------------------------------------

func TestIASTDebugHandler_ReturnsFindings(t *testing.T) {
	store := NewIASTStore()
	store.Add(IASTFinding{
		Type:        "taint",
		Severity:    "HIGH",
		Description: "test finding",
		RequestPath: "/test",
		Method:      "GET",
	})

	handler := IASTDebugHandler(store)
	req := httptest.NewRequest(http.MethodGet, "/debug/iast", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "test finding") {
		t.Error("expected response to contain the recorded finding")
	}
}

func TestIASTDebugHandler_ClearFindings(t *testing.T) {
	store := NewIASTStore()
	store.Add(IASTFinding{
		Type:        "taint",
		Severity:    "HIGH",
		Description: "to be cleared",
		RequestPath: "/test",
		Method:      "GET",
	})

	handler := IASTDebugHandler(store)
	req := httptest.NewRequest(http.MethodDelete, "/debug/iast", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Errorf("expected status 204, got %d", rec.Code)
	}
	if store.Count() != 0 {
		t.Errorf("expected store to be empty after DELETE, got %d findings", store.Count())
	}
}

// ---------------------------------------------------------------------------
// Store concurrency test
// ---------------------------------------------------------------------------

func TestIASTStore_ConcurrentAccess(t *testing.T) {
	store := NewIASTStore()
	done := make(chan struct{})

	// Writer goroutine
	go func() {
		for i := 0; i < 100; i++ {
			store.Add(IASTFinding{
				Type:        "taint",
				Severity:    "HIGH",
				Description: "concurrent test",
				RequestPath: "/test",
				Method:      "GET",
			})
		}
		close(done)
	}()

	// Reader goroutine (should not race)
	for i := 0; i < 50; i++ {
		_ = store.All()
		_ = store.Count()
	}

	<-done

	if store.Count() != 100 {
		t.Errorf("expected 100 findings, got %d", store.Count())
	}
}
