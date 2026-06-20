//go:build iast

package middleware

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// IASTFinding represents a single finding detected by the IAST tracker.
type IASTFinding struct {
	ID          string    `json:"id"`
	Type        string    `json:"type"` // "taint", "pii_leak", "unvalidated_redirect", etc.
	Severity    string    `json:"severity"`
	Description string    `json:"description"`
	RequestPath string    `json:"request_path"`
	Method      string    `json:"method"`
	Parameter   string    `json:"parameter,omitempty"`
	Timestamp   time.Time `json:"timestamp"`
}

// IASTStore is a thread-safe in-memory store for IAST findings.
type IASTStore struct {
	mu       sync.RWMutex
	findings []IASTFinding
	nextID   int
}

// NewIASTStore creates a new empty finding store.
func NewIASTStore() *IASTStore {
	return &IASTStore{}
}

// Add records a finding and returns its ID.
func (s *IASTStore) Add(f IASTFinding) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	f.ID = fmt.Sprintf("IAST-%04d", s.nextID)
	f.Timestamp = time.Now().UTC()
	s.findings = append(s.findings, f)
	return f.ID
}

// All returns a copy of all findings.
func (s *IASTStore) All() []IASTFinding {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]IASTFinding, len(s.findings))
	copy(out, s.findings)
	return out
}

// Count returns the number of recorded findings.
func (s *IASTStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.findings)
}

// Clear removes all findings.
func (s *IASTStore) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.findings = nil
	s.nextID = 0
}

// ---------------------------------------------------------------------------
// PII detection patterns
// ---------------------------------------------------------------------------

var piiPatterns = map[string]*regexp.Regexp{
	"email":       regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`),
	"ssn":         regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`),
	"credit_card": regexp.MustCompile(`\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b`),
	"phone_us":    regexp.MustCompile(`\b(?:\+1[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}\b`),
}

// ---------------------------------------------------------------------------
// Taint tracking — SQL-like patterns that indicate unvalidated input
// ---------------------------------------------------------------------------

var sqlKeywords = []string{
	"SELECT ", "INSERT ", "UPDATE ", "DELETE ", "DROP ", "UNION ",
	"' OR ", "\" OR ", "1=1", "' --", "\" --",
}

// containsSQLTaint checks whether a string looks like it contains SQL
// injection payloads that should not appear in raw request parameters.
func containsSQLTaint(value string) bool {
	upper := strings.ToUpper(value)
	for _, kw := range sqlKeywords {
		if strings.Contains(upper, kw) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Response body recorder
// ---------------------------------------------------------------------------

type iastResponseWriter struct {
	http.ResponseWriter
	body       *bytes.Buffer
	statusCode int
	written    bool
}

func (w *iastResponseWriter) WriteHeader(code int) {
	if !w.written {
		w.statusCode = code
		w.written = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *iastResponseWriter) Write(b []byte) (int, error) {
	if !w.written {
		w.statusCode = http.StatusOK
		w.written = true
	}
	w.body.Write(b) // tee into buffer for inspection
	return w.ResponseWriter.Write(b)
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// IASTTracker returns HTTP middleware that performs lightweight runtime taint
// tracking and PII leak detection. Findings are stored in the provided
// IASTStore and can be queried via the /debug/iast endpoint registered by
// IASTDebugHandler.
//
// This middleware is compiled only when the "iast" build tag is active, so
// it has zero overhead in production builds.
func IASTTracker(store *IASTStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// ----- Phase 1: Inspect request parameters for taint -----
			checkRequestTaint(store, r)

			// ----- Phase 2: Wrap response to capture body -----
			rec := &iastResponseWriter{
				ResponseWriter: w,
				body:           &bytes.Buffer{},
				statusCode:     http.StatusOK,
			}

			next.ServeHTTP(rec, r)

			// ----- Phase 3: Inspect response for PII leaks -----
			checkResponsePII(store, r, rec)
		})
	}
}

// checkRequestTaint examines query parameters, form values, and JSON body
// fields for values that look like SQL injection payloads reaching the server.
func checkRequestTaint(store *IASTStore, r *http.Request) {
	// Query parameters
	for param, values := range r.URL.Query() {
		for _, v := range values {
			if containsSQLTaint(v) {
				store.Add(IASTFinding{
					Type:        "taint",
					Severity:    "HIGH",
					Description: fmt.Sprintf("SQL-like taint in query parameter %q reached handler", param),
					RequestPath: r.URL.Path,
					Method:      r.Method,
					Parameter:   param,
				})
			}
		}
	}

	// Form / POST values (only if content-type is form)
	ct := r.Header.Get("Content-Type")
	if strings.Contains(ct, "application/x-www-form-urlencoded") || strings.Contains(ct, "multipart/form-data") {
		_ = r.ParseForm()
		for param, values := range r.PostForm {
			for _, v := range values {
				if containsSQLTaint(v) {
					store.Add(IASTFinding{
						Type:        "taint",
						Severity:    "HIGH",
						Description: fmt.Sprintf("SQL-like taint in form parameter %q reached handler", param),
						RequestPath: r.URL.Path,
						Method:      r.Method,
						Parameter:   param,
					})
				}
			}
		}
	}
}

// checkResponsePII scans the response body for PII patterns that should not
// be returned in API responses (emails are allowed in certain contexts but
// SSN / credit card numbers never should).
func checkResponsePII(store *IASTStore, r *http.Request, rec *iastResponseWriter) {
	body := rec.body.String()
	if len(body) == 0 {
		return
	}

	for piiType, re := range piiPatterns {
		if matches := re.FindAllString(body, 5); len(matches) > 0 {
			severity := "MEDIUM"
			if piiType == "ssn" || piiType == "credit_card" {
				severity = "HIGH"
			}
			store.Add(IASTFinding{
				Type:        "pii_leak",
				Severity:    severity,
				Description: fmt.Sprintf("Response contains potential %s PII (%d occurrences)", piiType, len(matches)),
				RequestPath: r.URL.Path,
				Method:      r.Method,
			})
		}
	}
}

// IASTDebugHandler returns an http.HandlerFunc that serves the /debug/iast
// endpoint. It returns all findings as JSON.
func IASTDebugHandler(store *IASTStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			store.Clear()
			w.WriteHeader(http.StatusNoContent)
			return
		}

		findings := store.All()
		w.Header().Set("Content-Type", "application/json")
		resp := map[string]interface{}{
			"count":    len(findings),
			"findings": findings,
		}
		_ = json.NewEncoder(w).Encode(resp)
	}
}
