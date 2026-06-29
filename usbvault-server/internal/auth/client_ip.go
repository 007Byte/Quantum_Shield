package auth

import (
	"net"
	"net/http"
	"os"
	"strings"
)

// NOTE: parseTrustedProxyCIDRs, remoteIsTrustedProxy and GetClientIP are a
// verbatim copy of the identically-named helpers in internal/middleware/auth.go.
// They are duplicated here (rather than imported) because package middleware
// already imports package auth, so importing middleware from auth would create
// an import cycle (see token_leakage_test.go). Keeping the logic identical
// preserves the same M-6/H-5 trusted-proxy semantics (TRUSTED_PROXY_CIDRS,
// rightmost X-Forwarded-For) across both packages, so rate-limit / lockout
// keying and audit derive the same client IP regardless of which package
// computed it. If you change one, change the other.

// M-6: forwarding headers (X-Forwarded-For / X-Real-IP) are only trustworthy when
// the request actually arrived from one of our reverse proxies; a direct client can
// otherwise spoof its source IP, which is used for rate-limit / lockout keying and
// audit. The trusted set is configured via TRUSTED_PROXY_CIDRS (comma-separated,
// e.g. "10.0.0.0/8,127.0.0.1/32"). When unset/empty, NO forwarding header is trusted
// and the immediate peer (RemoteAddr) is authoritative.
func parseTrustedProxyCIDRs() []*net.IPNet {
	var cidrs []*net.IPNet
	for _, part := range strings.Split(os.Getenv("TRUSTED_PROXY_CIDRS"), ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, ipnet, err := net.ParseCIDR(part); err == nil {
			cidrs = append(cidrs, ipnet)
		}
	}
	return cidrs
}

// remoteIsTrustedProxy reports whether the immediate peer (r.RemoteAddr) is within
// the configured trusted-proxy CIDR set.
func remoteIsTrustedProxy(remoteAddr string) bool {
	cidrs := parseTrustedProxyCIDRs()
	if len(cidrs) == 0 {
		return false
	}
	host := remoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		host = h
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	for _, n := range cidrs {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

// GetClientIP returns the authoritative client IP for the request, honoring
// trusted-proxy forwarding headers only when the immediate peer is itself a
// configured trusted proxy. It is the exported, package-auth twin of the
// unexported middleware.getClientIP (see the package note above for why it is
// duplicated rather than imported).
func GetClientIP(r *http.Request) string {
	// Only honor client-supplied forwarding headers when the immediate peer is a
	// configured trusted proxy; otherwise RemoteAddr is authoritative and the headers
	// are ignored to prevent source-IP spoofing (M-6).
	if remoteIsTrustedProxy(r.RemoteAddr) {
		// H-5: use the RIGHTMOST non-empty X-Forwarded-For entry — the one added by
		// the closest (trusted) proxy, not the client's self-claimed leftmost value.
		if xForwardedFor := r.Header.Get("X-Forwarded-For"); xForwardedFor != "" {
			ips := strings.Split(xForwardedFor, ",")
			for i := len(ips) - 1; i >= 0; i-- {
				if trimmed := strings.TrimSpace(ips[i]); trimmed != "" {
					return trimmed
				}
			}
		}
		if xRealIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); xRealIP != "" {
			return xRealIP
		}
	}

	// Fall back to RemoteAddr, stripping port if present.
	addr := r.RemoteAddr
	if host, _, err := net.SplitHostPort(addr); err == nil {
		return host
	}
	return addr
}
