package middleware

// M-9 FIX: SSRF Protection Utilities
//
// Defense-in-depth protection against Server-Side Request Forgery (SSRF).
// While USBVault's API does not accept user-controlled URLs for outbound
// requests (primary SSRF vector), these utilities provide guardrails for
// any future features that might introduce outbound HTTP calls.
//
// CSRF Note: USBVault uses JWT tokens in the Authorization header (not
// session cookies). Combined with CORS preflight enforcement for custom
// headers, traditional CSRF attacks are not applicable. This is an
// intentional architectural choice — see ADR docs for details.

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strings"
	"time"
)

// SSRFConfig holds configuration for SSRF protection.
type SSRFConfig struct {
	// AllowedHosts is the set of hostnames permitted for outbound requests.
	// An empty list blocks all outbound requests.
	AllowedHosts []string

	// BlockPrivateIPs blocks requests to RFC 1918, loopback, link-local,
	// and other non-routable addresses.
	BlockPrivateIPs bool

	// DNSTimeout is the maximum time to resolve a hostname.
	DNSTimeout time.Duration
}

// DefaultSSRFConfig returns a secure default configuration that only
// allows outbound requests to the Stripe API.
func DefaultSSRFConfig() SSRFConfig {
	return SSRFConfig{
		AllowedHosts:    []string{"api.stripe.com"},
		BlockPrivateIPs: true,
		DNSTimeout:      5 * time.Second,
	}
}

// ValidateOutboundURL checks whether a URL is safe for the server to
// request. It enforces:
//  1. HTTPS-only (no HTTP, file://, gopher://, etc.)
//  2. Host allowlist (if configured)
//  3. Private/reserved IP blocklist (RFC 1918, loopback, link-local, etc.)
//
// Returns nil if the URL is safe, or an error describing the violation.
func ValidateOutboundURL(rawURL string, config SSRFConfig) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("ssrf: invalid URL: %w", err)
	}

	// Enforce HTTPS only
	if parsed.Scheme != "https" {
		return fmt.Errorf("ssrf: only HTTPS URLs are allowed, got %q", parsed.Scheme)
	}

	host := parsed.Hostname()
	if host == "" {
		return fmt.Errorf("ssrf: empty hostname")
	}

	// Check host allowlist
	if len(config.AllowedHosts) > 0 {
		allowed := false
		for _, h := range config.AllowedHosts {
			if strings.EqualFold(host, h) {
				allowed = true
				break
			}
		}
		if !allowed {
			return fmt.Errorf("ssrf: host %q is not in the allowlist", host)
		}
	}

	// Check for private/reserved IPs
	if config.BlockPrivateIPs {
		if err := validateNotPrivateIP(host, config.DNSTimeout); err != nil {
			return err
		}
	}

	return nil
}

// validateNotPrivateIP resolves the hostname and checks that the resulting
// IP addresses are not in private, loopback, or reserved ranges.
func validateNotPrivateIP(host string, timeout time.Duration) error {
	// First check if the host is already an IP address
	if ip := net.ParseIP(host); ip != nil {
		if isPrivateOrReserved(ip) {
			return fmt.Errorf("ssrf: IP %s is in a private/reserved range", ip)
		}
		return nil
	}

	// Resolve the hostname with a timeout
	resolver := &net.Resolver{}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	addrs, err := resolver.LookupIPAddr(ctx, host)
	if err != nil {
		return fmt.Errorf("ssrf: failed to resolve %q: %w", host, err)
	}

	for _, addr := range addrs {
		if isPrivateOrReserved(addr.IP) {
			return fmt.Errorf("ssrf: %s resolves to private/reserved IP %s", host, addr.IP)
		}
	}

	return nil
}

// isPrivateOrReserved returns true if the IP is in a private, loopback,
// link-local, or otherwise non-routable range.
func isPrivateOrReserved(ip net.IP) bool {
	// Check standard library methods first
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() {
		return true
	}

	// RFC 1918 private ranges + other reserved ranges
	privateCIDRs := []string{
		"10.0.0.0/8",       // RFC 1918
		"172.16.0.0/12",    // RFC 1918
		"192.168.0.0/16",   // RFC 1918
		"100.64.0.0/10",    // RFC 6598 Carrier-grade NAT
		"192.0.2.0/24",     // RFC 5737 Documentation (TEST-NET-1)
		"198.51.100.0/24",  // RFC 5737 Documentation (TEST-NET-2)
		"203.0.113.0/24",   // RFC 5737 Documentation (TEST-NET-3)
		"169.254.0.0/16",   // RFC 3927 Link-local
		"fc00::/7",         // RFC 4193 IPv6 Unique Local
		"fe80::/10",        // IPv6 Link-Local
	}

	for _, cidr := range privateCIDRs {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if network.Contains(ip) {
			return true
		}
	}

	return false
}
