package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// F4: focused, pure-logic tests asserting the Set-Cookie flags emitted by the
// refresh-cookie helpers and handlers. These do not require Redis or a DB.

// findRefreshCookie returns the *http.Cookie named RefreshCookieName from a
// recorded response, or nil if absent.
func findRefreshCookie(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range rec.Result().Cookies() {
		if c.Name == RefreshCookieName {
			return c
		}
	}
	return nil
}

func TestSetRefreshCookie_Flags(t *testing.T) {
	rec := httptest.NewRecorder()
	setRefreshCookie(rec, "the.refresh.jwt")

	c := findRefreshCookie(rec)
	if c == nil {
		t.Fatalf("expected a %q cookie to be set", RefreshCookieName)
	}

	if c.Value != "the.refresh.jwt" {
		t.Errorf("cookie value = %q, want the refresh token", c.Value)
	}
	if !c.HttpOnly {
		t.Error("cookie must be HttpOnly so JS cannot read the refresh token")
	}
	if !c.Secure {
		t.Error("cookie must be Secure (HTTPS only)")
	}
	if c.SameSite != http.SameSiteStrictMode {
		t.Errorf("cookie SameSite = %v, want Strict (CSRF mitigation)", c.SameSite)
	}
	if c.Path != RefreshCookiePath {
		t.Errorf("cookie Path = %q, want %q", c.Path, RefreshCookiePath)
	}
	// Max-Age must be positive and match the refresh-token lifetime.
	if c.MaxAge != refreshCookieMaxAge {
		t.Errorf("cookie MaxAge = %d, want %d (refreshTokenTTL)", c.MaxAge, refreshCookieMaxAge)
	}
	if c.MaxAge <= 0 {
		t.Error("set cookie MaxAge must be positive")
	}

	// Defensive: the raw Set-Cookie header should carry the security attributes.
	raw := rec.Result().Header.Get("Set-Cookie")
	for _, want := range []string{"HttpOnly", "Secure", "SameSite=Strict", "Path=" + RefreshCookiePath} {
		if !containsAttr(raw, want) {
			t.Errorf("Set-Cookie %q missing attribute %q", raw, want)
		}
	}
}

func TestClearRefreshCookie_Expires(t *testing.T) {
	rec := httptest.NewRecorder()
	clearRefreshCookie(rec)

	c := findRefreshCookie(rec)
	if c == nil {
		t.Fatalf("expected a %q cookie to be cleared", RefreshCookieName)
	}

	if c.Value != "" {
		t.Errorf("cleared cookie value = %q, want empty", c.Value)
	}
	// net/http emits "Max-Age=0" only when Cookie.MaxAge < 0.
	if c.MaxAge >= 0 {
		t.Errorf("cleared cookie MaxAge = %d, want negative so Max-Age=0 is emitted", c.MaxAge)
	}
	// Same security attributes must be present on the clearing cookie so the
	// browser matches and deletes the original.
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteStrictMode || c.Path != RefreshCookiePath {
		t.Errorf("cleared cookie attributes mismatch: HttpOnly=%v Secure=%v SameSite=%v Path=%q",
			c.HttpOnly, c.Secure, c.SameSite, c.Path)
	}

	raw := rec.Result().Header.Get("Set-Cookie")
	if !containsAttr(raw, "Max-Age=0") {
		t.Errorf("clearing Set-Cookie %q should contain Max-Age=0", raw)
	}
}

// TestHandleLogout_ClearsCookie_NoUser verifies that logout always emits the
// cookie-clearing Set-Cookie header and returns 200 even when there is no
// authenticated user and no refresh cookie (pure-logic path; no Redis needed).
func TestHandleLogout_ClearsCookie_NoUser(t *testing.T) {
	handler := HandleLogout(nil, &mockAuditService{})

	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}

	c := findRefreshCookie(rec)
	if c == nil {
		t.Fatalf("logout must emit a clearing %q cookie", RefreshCookieName)
	}
	if c.Value != "" || c.MaxAge >= 0 {
		t.Errorf("logout cookie not cleared: value=%q MaxAge=%d", c.Value, c.MaxAge)
	}
	if !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteStrictMode {
		t.Error("logout clearing cookie must keep HttpOnly/Secure/SameSite=Strict")
	}
}

// ---------------------------------------------------------------------------
// F4 CSRF defense-in-depth: server-side Origin/Referer allowlist tests.
// These exercise checkRequestOrigin directly (pure logic, no Redis/DB) and the
// HandleRefreshToken / HandleLogout 403 path.
// ---------------------------------------------------------------------------

var testAllowedOrigins = []string{"https://app.usbvault.io", "https://localhost:3000"}

func TestCheckRequestOrigin(t *testing.T) {
	tests := []struct {
		name      string
		origin    string
		referer   string
		hasCookie bool
		wantAllow bool
	}{
		{name: "allowed origin", origin: "https://app.usbvault.io", wantAllow: true},
		{name: "foreign origin rejected", origin: "https://evil.example.com", wantAllow: false},
		{name: "origin with path/port preserved on referer fallback", referer: "https://app.usbvault.io/login", wantAllow: true},
		{name: "foreign referer rejected", referer: "https://evil.example.com/x", wantAllow: false},
		{name: "origin takes precedence over referer", origin: "https://app.usbvault.io", referer: "https://evil.example.com", wantAllow: true},
		{name: "no origin/referer + no cookie (native) allowed", wantAllow: true},
		{name: "no origin/referer + cookie (same-site) allowed", hasCookie: true, wantAllow: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/auth/refresh", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if tt.referer != "" {
				req.Header.Set("Referer", tt.referer)
			}
			if tt.hasCookie {
				req.AddCookie(&http.Cookie{Name: RefreshCookieName, Value: "some.refresh.jwt"})
			}
			if got := checkRequestOrigin(req, testAllowedOrigins); got != tt.wantAllow {
				t.Errorf("checkRequestOrigin = %v, want %v", got, tt.wantAllow)
			}
		})
	}
}

// TestHandleRefreshToken_ForeignOriginRejected verifies a foreign Origin on
// POST /auth/refresh is rejected with 403 BEFORE any token processing.
func TestHandleRefreshToken_ForeignOriginRejected(t *testing.T) {
	handler := HandleRefreshToken(nil, &mockAuditService{}, testAllowedOrigins...)

	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	req.AddCookie(&http.Cookie{Name: RefreshCookieName, Value: "victim.refresh.jwt"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d (foreign origin must be rejected)", rec.Code, http.StatusForbidden)
	}
}

// TestHandleLogout_ForeignOriginRejected verifies a foreign Origin on
// POST /auth/logout is rejected with 403 before any state mutation (no cookie
// is cleared).
func TestHandleLogout_ForeignOriginRejected(t *testing.T) {
	handler := HandleLogout(nil, &mockAuditService{}, testAllowedOrigins...)

	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.Header.Set("Origin", "https://evil.example.com")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusForbidden)
	}
	if findRefreshCookie(rec) != nil {
		t.Error("rejected logout must not emit any Set-Cookie (no state change)")
	}
}

// TestHandleLogout_AllowedOriginProceeds verifies an allowed Origin passes the
// CSRF gate and proceeds to the normal no-user logout path (cookie cleared, 200).
func TestHandleLogout_AllowedOriginProceeds(t *testing.T) {
	handler := HandleLogout(nil, &mockAuditService{}, testAllowedOrigins...)

	req := httptest.NewRequest(http.MethodPost, "/auth/logout", nil)
	req.Header.Set("Origin", "https://app.usbvault.io")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", rec.Code, http.StatusOK)
	}
	if findRefreshCookie(rec) == nil {
		t.Error("allowed-origin logout should proceed and clear the cookie")
	}
}

// TestIsWebRequest classifies requests for the body-vs-cookie refresh-token
// decision (F4 no-refresh-token-in-web-responses).
func TestIsWebRequest(t *testing.T) {
	tests := []struct {
		name      string
		origin    string
		referer   string
		hasCookie bool
		want      bool
	}{
		{name: "origin present is web", origin: "https://app.usbvault.io", want: true},
		{name: "referer present is web", referer: "https://app.usbvault.io/x", want: true},
		{name: "refresh cookie present is web", hasCookie: true, want: true},
		{name: "no signals is native", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/auth/srp/verify", nil)
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			if tt.referer != "" {
				req.Header.Set("Referer", tt.referer)
			}
			if tt.hasCookie {
				req.AddCookie(&http.Cookie{Name: RefreshCookieName, Value: "r.t"})
			}
			if got := IsWebRequest(req); got != tt.want {
				t.Errorf("IsWebRequest = %v, want %v", got, tt.want)
			}
		})
	}
}

// containsAttr reports whether the raw Set-Cookie header contains attr as a
// "; "-delimited token (or the cookie value prefix). Simple substring is
// sufficient here because attribute names/values are distinct.
func containsAttr(raw, attr string) bool {
	return len(raw) > 0 && (indexOf(raw, attr) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
