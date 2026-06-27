package oidc

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/usbvault/usbvault-server/internal/auth"
)

// F4 (cookie coverage): the OIDC callback mirrors the SRP/FIDO2 web flow by
// setting the refresh token in an HttpOnly cookie via auth.SetRefreshCookie and
// omitting it from the JSON body for web requests. The full callback requires a
// live provider/Redis, so these focused tests assert the two pure-logic pieces
// the handler relies on.

func TestSetRefreshCookie_OIDCCoverage(t *testing.T) {
	rec := httptest.NewRecorder()
	auth.SetRefreshCookie(rec, "oidc.refresh.jwt")

	var got *http.Cookie
	for _, c := range rec.Result().Cookies() {
		if c.Name == auth.RefreshCookieName {
			got = c
			break
		}
	}
	if got == nil {
		t.Fatalf("expected %q cookie to be set by OIDC flow", auth.RefreshCookieName)
	}
	if got.Value != "oidc.refresh.jwt" {
		t.Errorf("cookie value = %q, want the refresh token", got.Value)
	}
	if !got.HttpOnly || !got.Secure || got.SameSite != http.SameSiteStrictMode {
		t.Errorf("OIDC refresh cookie missing security flags: HttpOnly=%v Secure=%v SameSite=%v",
			got.HttpOnly, got.Secure, got.SameSite)
	}
}

// TestCallbackResult_OmitsRefreshTokenForWeb verifies that clearing RefreshToken
// (done by the handler for web requests) drops the field from the JSON body via
// omitempty, while native responses retain it.
func TestCallbackResult_OmitsRefreshTokenForWeb(t *testing.T) {
	web := CallbackResult{UserID: "u1", AccessToken: "a", RefreshToken: ""}
	b, _ := json.Marshal(web)
	if strings.Contains(string(b), "refresh_token") {
		t.Errorf("web response must omit refresh_token, got %s", b)
	}

	native := CallbackResult{UserID: "u1", AccessToken: "a", RefreshToken: "r"}
	b, _ = json.Marshal(native)
	if !strings.Contains(string(b), "refresh_token") {
		t.Errorf("native response must include refresh_token, got %s", b)
	}
}
