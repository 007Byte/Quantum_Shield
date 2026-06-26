package auth

// F4: httpOnly refresh-cookie session flow.
//
// On web, the refresh token MUST NOT be readable by JavaScript (an XSS would
// otherwise be able to exfiltrate a long-lived 30-day credential). Instead the
// server sets it as an HttpOnly, Secure, SameSite=Strict cookie scoped to the
// auth path. The browser attaches it automatically on credentialed requests to
// POST /auth/refresh and POST /auth/logout, and JS never sees it. The ACCESS
// token continues to be returned in the JSON body and is held in an in-memory
// store by the web client.
//
// Native (mobile) clients ignore the cookie and keep using the refresh token
// from the JSON body, stored in the OS keychain/secure-store. Cookies are a
// web-only concern.

import (
	"net/http"
	"net/url"
	"time"
)

// F4 deployment-topology requirement (CSRF / cookie coverage):
//
//   - SameSite=Strict on the refresh cookie only protects against CSRF when the
//     SPA and the API are SAME-SITE (e.g. app.usbvault.io calling
//     api.usbvault.io — both under the registrable domain usbvault.io). In that
//     topology the browser attaches the cookie on same-site navigations/fetches
//     and withholds it cross-site, which is the CSRF defense.
//   - If the SPA and API are deployed CROSS-SITE (different registrable domains),
//     SameSite=Strict would stop the browser from EVER sending the cookie on the
//     SPA's API calls, breaking the session flow. That topology would instead
//     require SameSite=None + Secure on the cookie AND would rely on the
//     server-side Origin/Referer allowlist check (checkRequestOrigin below) as
//     the primary CSRF defense, since SameSite no longer gates the request.
//   - Secure cookies are only sent over HTTPS. Local development must therefore
//     run the API over TLS (https://localhost...) or the browser will silently
//     drop the cookie; plain-HTTP dev will not exercise the cookie flow.
//
// The Origin/Referer allowlist check is defense-in-depth: it does NOT depend on
// SameSite or CORS (CORS only adds response headers and does not gate request
// processing on the server), so it rejects forged cross-site state-changing
// requests even if a future cookie/topology change weakens SameSite.

const (
	// RefreshCookieName is the name of the httpOnly refresh-token cookie.
	RefreshCookieName = "usbvault_refresh"

	// RefreshCookiePath scopes the cookie to the auth endpoints only. The chi
	// router mounts the auth group at /api/v1/auth, so POST /auth/refresh and
	// POST /auth/logout resolve to /api/v1/auth/refresh and
	// /api/v1/auth/logout. Scoping the cookie to this path means it is NOT
	// attached to ordinary API/vault requests, reducing its exposure surface.
	RefreshCookiePath = "/api/v1/auth"

	// refreshCookieMaxAge matches refreshTokenTTL (30 days) so the browser
	// drops the cookie at the same time the refresh token itself expires.
	refreshCookieMaxAge = int(refreshTokenTTL / time.Second)
)

// setRefreshCookie writes the refresh token as an HttpOnly, Secure,
// SameSite=Strict cookie scoped to the auth path with a Max-Age matching the
// refresh-token lifetime.
//
// Cookie flags (F4):
//   - HttpOnly:           not readable by JS (XSS cannot exfiltrate it)
//   - Secure:             only sent over HTTPS
//   - SameSite=Strict:    not sent on cross-site requests (CSRF mitigation)
//   - Path=/api/v1/auth:  only sent to the auth endpoints
//   - Max-Age=30d:        matches refreshTokenTTL
func setRefreshCookie(w http.ResponseWriter, refreshToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookieName,
		Value:    refreshToken,
		Path:     RefreshCookiePath,
		MaxAge:   refreshCookieMaxAge,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

// clearRefreshCookie expires the refresh cookie using identical attributes to
// setRefreshCookie so the browser reliably removes it. Used on logout and on
// any refresh failure (rotation/theft) to avoid leaving a stale cookie behind.
//
// NOTE: net/http only emits "Max-Age=0" when Cookie.MaxAge < 0; a MaxAge of 0
// means "no Max-Age attribute". We therefore set MaxAge = -1 so the response
// carries Max-Age=0 and the browser deletes the cookie immediately.
func clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     RefreshCookieName,
		Value:    "",
		Path:     RefreshCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
	})
}

// SetRefreshCookie is the exported wrapper around setRefreshCookie so other
// packages that issue tokens (e.g. internal/oidc) can mirror the SRP/FIDO2 web
// flow and keep the refresh token in the HttpOnly cookie rather than only the
// JSON body. F4 (cookie coverage).
func SetRefreshCookie(w http.ResponseWriter, refreshToken string) {
	setRefreshCookie(w, refreshToken)
}

// hasRefreshCookie reports whether the request carries a non-empty refresh
// cookie (i.e. it is an established web session).
func hasRefreshCookie(r *http.Request) bool {
	c, err := r.Cookie(RefreshCookieName)
	return err == nil && c.Value != ""
}

// IsWebRequest reports whether a request originates from a browser context. A
// browser always sends an Origin header on cross-origin/credentialed fetches
// (and on same-origin POSTs in modern browsers); it also sends Referer. An
// established session additionally carries the refresh cookie. Native clients
// (mobile/desktop) send neither and read the refresh token from the JSON body.
//
// F4 (no refresh token in web responses): used by the token-issuing handlers to
// decide whether to include refresh_token in the JSON body. Web responses set
// the HttpOnly cookie only and omit the token from the body so JS never holds
// the long-lived credential.
func IsWebRequest(r *http.Request) bool {
	if r.Header.Get("Origin") != "" || r.Header.Get("Referer") != "" {
		return true
	}
	return hasRefreshCookie(r)
}

// originHost extracts the lowercased "scheme://host[:port]" origin from a raw
// Origin header value or a Referer URL. Returns "" if it cannot be parsed.
func originHost(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

// checkRequestOrigin is the server-side CSRF defense-in-depth allowlist check
// for state-changing cookie endpoints (POST /auth/refresh, POST /auth/logout).
//
// It returns true if the request is ALLOWED to proceed, false if it must be
// rejected (403). Logic (F4 CSRF):
//
//   - Prefer the Origin header; if absent, fall back to the Referer's origin.
//   - If an Origin/Referer IS present and its origin is NOT in allowedOrigins,
//     reject — this blocks forged cross-site requests regardless of SameSite/CORS.
//   - If there is NO Origin/Referer AND NO refresh cookie, this is a native
//     body-based client (no browser ambient credential to forge): allow.
//   - If there is no Origin/Referer but a refresh cookie IS present, allow:
//     same-site requests under SameSite=Strict may legitimately omit Origin, and
//     the cookie itself is gated by SameSite in the same-site topology.
//
// This check intentionally does NOT depend on CORS (which only sets response
// headers) — CORS does not gate request processing on the server.
func checkRequestOrigin(r *http.Request, allowedOrigins []string) bool {
	candidate := originHost(r.Header.Get("Origin"))
	if candidate == "" {
		candidate = originHost(r.Header.Get("Referer"))
	}

	if candidate == "" {
		// No Origin/Referer header at all. CSRF is browser-driven, and modern
		// browsers ALWAYS send Origin on cross-origin POSTs, so a forged
		// cross-site request would carry a foreign Origin and be rejected by the
		// allowlist below. A request with neither header is therefore either a
		// native body client (no cookie) or a legitimate same-site request whose
		// Origin was omitted/stripped; both are allowed (the cookie is gated by
		// SameSite in the same-site topology).
		return true
	}

	for _, allowed := range allowedOrigins {
		if candidate == allowed {
			return true
		}
	}
	return false
}
