package errortracking

// PH11-FIX: Sentry error tracking with PII scrubbing (CWE-532)

import (
	"net/http"
	"regexp"
	"strings"
	"time"
)

// SentryConfig holds configuration for Sentry error tracking
type SentryConfig struct {
	DSN              string        // Sentry DSN (from environment: SENTRY_DSN)
	Environment      string        // "production", "staging", "development"
	Release          string        // Application version (e.g., "1.0.0")
	SampleRate       float64       // Error sampling rate (0.0 to 1.0)
	TracesSampleRate float64       // Performance tracing rate (0.0 to 1.0)
	MaxBreadcrumbs   int           // Maximum breadcrumbs to keep
	FlushTimeout     time.Duration // Timeout for flushing events on shutdown
	Debug            bool          // Enable debug mode (never in production)
}

// DefaultSentryConfig returns production defaults
func DefaultSentryConfig() SentryConfig {
	return SentryConfig{
		Environment:      "production",
		SampleRate:       1.0,
		TracesSampleRate: 0.2,
		MaxBreadcrumbs:   50,
		FlushTimeout:     5 * time.Second,
		Debug:            false,
	}
}

// PIIScrubber removes personally identifiable information from error reports
// PH11-FIX: Ensures no sensitive data leaks via error tracking
type PIIScrubber struct {
	patterns []*regexp.Regexp
}

// NewPIIScrubber creates a PII scrubber with standard patterns
func NewPIIScrubber() *PIIScrubber {
	return &PIIScrubber{
		patterns: []*regexp.Regexp{
			regexp.MustCompile(`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`),            // Email addresses
			regexp.MustCompile(`\b\d{3}[-.]?\d{3}[-.]?\d{4}\b`),                                    // Phone numbers
			regexp.MustCompile(`\b\d{3}-\d{2}-\d{4}\b`),                                            // SSN
			regexp.MustCompile(`\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b`),   // Credit card numbers
			regexp.MustCompile(`(?i)(?:password|passwd|secret|token|api[_-]?key|auth)[=:]\s*\S+`),   // Credential patterns
			regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*`),                               // Bearer tokens
			regexp.MustCompile(`\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b`), // UUIDs (user IDs)
		},
	}
}

// Scrub removes PII from a string
func (s *PIIScrubber) Scrub(input string) string {
	result := input
	replacements := []string{
		"[EMAIL_REDACTED]",
		"[PHONE_REDACTED]",
		"[SSN_REDACTED]",
		"[CARD_REDACTED]",
		"[CREDENTIAL_REDACTED]",
		"[TOKEN_REDACTED]",
		"[UUID_REDACTED]",
	}
	for i, pattern := range s.patterns {
		result = pattern.ReplaceAllString(result, replacements[i])
	}
	return result
}

// ScrubHeaders removes sensitive headers from HTTP requests
func (s *PIIScrubber) ScrubHeaders(headers http.Header) http.Header {
	scrubbed := make(http.Header)
	sensitiveHeaders := map[string]bool{
		"authorization":    true,
		"cookie":           true,
		"set-cookie":       true,
		"x-api-key":        true,
		"x-auth-token":     true,
		"proxy-authorization": true,
	}

	for key, values := range headers {
		if sensitiveHeaders[strings.ToLower(key)] {
			scrubbed.Set(key, "[REDACTED]")
		} else {
			scrubbed[key] = values
		}
	}
	return scrubbed
}

// ScrubURL removes query parameters that may contain PII
func (s *PIIScrubber) ScrubURL(rawURL string) string {
	sensitiveParams := []string{"token", "key", "secret", "password", "auth", "session", "email"}
	result := rawURL
	for _, param := range sensitiveParams {
		re := regexp.MustCompile(`(?i)([\?&])` + param + `=[^&]*`)
		result = re.ReplaceAllString(result, "${1}"+param+"=[REDACTED]")
	}
	return result
}

// ErrorContext provides structured context for error reports
type ErrorContext struct {
	UserID    string            // Anonymized user identifier
	RequestID string            // Request correlation ID
	Endpoint  string            // API endpoint path
	Method    string            // HTTP method
	Tags      map[string]string // Additional tags
}
