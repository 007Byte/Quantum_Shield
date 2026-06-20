package middleware

import (
	"net"
	"testing"
	"time"
)

func TestValidateOutboundURL_HTTPSRequired(t *testing.T) {
	config := DefaultSSRFConfig()
	config.AllowedHosts = nil // disable allowlist for this test
	config.BlockPrivateIPs = false

	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"HTTPS allowed", "https://example.com/api", false},
		{"HTTP blocked", "http://example.com/api", true},
		{"FTP blocked", "ftp://example.com/file", true},
		{"File blocked", "file:///etc/passwd", true},
		{"Empty scheme blocked", "://example.com", true},
		{"No scheme blocked", "example.com/api", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateOutboundURL(tt.url, config)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateOutboundURL(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
			}
		})
	}
}

func TestValidateOutboundURL_HostAllowlist(t *testing.T) {
	config := SSRFConfig{
		AllowedHosts:    []string{"api.stripe.com", "hooks.slack.com"},
		BlockPrivateIPs: false,
		DNSTimeout:      5 * time.Second,
	}

	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"Stripe allowed", "https://api.stripe.com/v1/charges", false},
		{"Slack allowed", "https://hooks.slack.com/services/T00/B00/xxx", false},
		{"Case insensitive", "https://API.STRIPE.COM/v1/charges", false},
		{"Unknown host blocked", "https://evil.com/steal", true},
		{"Subdomain blocked", "https://evil.api.stripe.com/redir", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateOutboundURL(tt.url, config)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateOutboundURL(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
			}
		})
	}
}

func TestValidateOutboundURL_NilAllowlistPermitsAll(t *testing.T) {
	config := SSRFConfig{
		AllowedHosts:    nil,
		BlockPrivateIPs: false,
		DNSTimeout:      5 * time.Second,
	}

	// Nil/empty allowlist means allowlist is disabled (all hosts permitted).
	// Private IP blocking is the defense layer when allowlist is open.
	err := ValidateOutboundURL("https://example.com", config)
	if err != nil {
		t.Errorf("nil allowlist should permit all public hosts, got error: %v", err)
	}
}

func TestIsPrivateOrReserved(t *testing.T) {
	tests := []struct {
		ip       string
		expected bool
	}{
		// Loopback
		{"127.0.0.1", true},
		{"127.255.255.255", true},
		{"::1", true},

		// RFC 1918
		{"10.0.0.1", true},
		{"10.255.255.255", true},
		{"172.16.0.1", true},
		{"172.31.255.255", true},
		{"192.168.0.1", true},
		{"192.168.255.255", true},

		// RFC 6598 Carrier-grade NAT
		{"100.64.0.1", true},
		{"100.127.255.255", true},

		// Link-local
		{"169.254.1.1", true},
		{"fe80::1", true},

		// RFC 5737 Documentation
		{"192.0.2.1", true},
		{"198.51.100.1", true},
		{"203.0.113.1", true},

		// IPv6 Unique Local
		{"fd00::1", true},

		// Unspecified
		{"0.0.0.0", true},
		{"::", true},

		// Public IPs (should NOT be blocked)
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"142.250.80.46", false},
		{"2607:f8b0:4004:800::200e", false},

		// Edge cases: just outside private ranges
		{"172.32.0.1", false},    // Just above 172.16.0.0/12
		{"100.128.0.1", false},   // Just above 100.64.0.0/10
		{"11.0.0.1", false},      // Just above 10.0.0.0/8
	}

	for _, tt := range tests {
		t.Run(tt.ip, func(t *testing.T) {
			ip := net.ParseIP(tt.ip)
			if ip == nil {
				t.Fatalf("failed to parse IP %q", tt.ip)
			}
			got := isPrivateOrReserved(ip)
			if got != tt.expected {
				t.Errorf("isPrivateOrReserved(%s) = %v, want %v", tt.ip, got, tt.expected)
			}
		})
	}
}

func TestValidateOutboundURL_PrivateIPBlocked(t *testing.T) {
	config := SSRFConfig{
		AllowedHosts:    nil,
		BlockPrivateIPs: true,
		DNSTimeout:      5 * time.Second,
	}

	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{"Loopback blocked", "https://127.0.0.1/admin", true},
		{"Private 10.x blocked", "https://10.0.0.1/internal", true},
		{"Private 192.168.x blocked", "https://192.168.1.1/router", true},
		{"Private 172.16.x blocked", "https://172.16.0.1/internal", true},
		{"Link-local blocked", "https://169.254.169.254/latest/meta-data/", true},
		{"IPv6 loopback blocked", "https://[::1]/admin", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateOutboundURL(tt.url, config)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateOutboundURL(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
			}
		})
	}
}

func TestDefaultSSRFConfig(t *testing.T) {
	config := DefaultSSRFConfig()

	if len(config.AllowedHosts) != 1 || config.AllowedHosts[0] != "api.stripe.com" {
		t.Errorf("default allowed hosts should be [api.stripe.com], got %v", config.AllowedHosts)
	}
	if !config.BlockPrivateIPs {
		t.Error("BlockPrivateIPs should be true by default")
	}
	if config.DNSTimeout != 5*time.Second {
		t.Errorf("DNSTimeout should be 5s, got %v", config.DNSTimeout)
	}
}
