// Package errortracking provides Sentry integration for server-side error
// tracking, matching the PII-scrubbing pattern used by the client
// (usbvault-app/src/utils/sentry.ts).
//
// All operations are no-ops when DSN is empty, so it is safe to import and
// call Init in every environment.
package errortracking

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/rs/zerolog/log"
)

// emailPattern matches common email addresses in arbitrary strings.
var emailPattern = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)

// initialized tracks whether Sentry was successfully initialized.
var initialized bool

// Init initializes the Sentry SDK. If dsn is empty the call is a no-op and
// all subsequent operations silently do nothing.
func Init(dsn, environment, release string) error {
	if dsn == "" {
		log.Info().Msg("Sentry DSN not configured, error tracking disabled")
		return nil
	}

	err := sentry.Init(sentry.ClientOptions{
		Dsn:              dsn,
		Environment:      environment,
		Release:          release,
		TracesSampleRate: 0.1, // Match existing OTEL sampling rate
		AttachStacktrace: true,
		BeforeSend:       ScrubPII,
		BeforeSendTransaction: func(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
			// Apply the same PII scrubbing to transaction events.
			return ScrubPII(event, hint)
		},
	})
	if err != nil {
		return fmt.Errorf("sentry init: %w", err)
	}

	initialized = true
	log.Info().
		Str("environment", environment).
		Str("release", release).
		Msg("Sentry error tracking initialized")
	return nil
}

// Flush drains buffered Sentry events. Call this (via defer) during shutdown.
func Flush(timeout time.Duration) {
	if !initialized {
		return
	}
	sentry.Flush(timeout)
}

// ScrubPII removes personally-identifiable information from a Sentry event
// before it is transmitted. The scrubbing matches what the client does:
//   - Clear event.User.IPAddress
//   - Strip email-like patterns from exception values and message
//   - Redact Authorization headers in breadcrumbs
func ScrubPII(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
	if event == nil {
		return event
	}

	// 1. Strip IP address from user context.
	event.User.IPAddress = ""

	// 2. Scrub email patterns from top-level message.
	event.Message = scrubEmails(event.Message)

	// 3. Scrub email patterns from exception values.
	for i := range event.Exception {
		event.Exception[i].Value = scrubEmails(event.Exception[i].Value)
	}

	// 4. Redact Authorization headers in breadcrumbs.
	for i := range event.Breadcrumbs {
		bc := event.Breadcrumbs[i]
		if bc.Data == nil {
			continue
		}
		for key := range bc.Data {
			lower := strings.ToLower(key)
			if lower == "authorization" || lower == "auth" {
				bc.Data[key] = "[REDACTED]"
			}
		}
	}

	return event
}

// RecoverMiddleware returns an http.Handler that catches panics, reports them
// to Sentry, and then re-panics so the Go runtime can still produce a stack
// trace (or an outer recovery middleware can respond with 500).
//
// When Sentry is not initialized (empty DSN), this falls back to a minimal
// panic-recover-repanic wrapper that adds no Sentry overhead.
func RecoverMiddleware(next http.Handler) http.Handler {
	if !initialized {
		// No-op path: still recover + repanic so the middleware position is
		// stable, but skip Sentry entirely.
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if err := recover(); err != nil {
					panic(err)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}

	// Use the official sentryhttp handler which attaches a Hub per request.
	sentryHandler := sentryhttp.New(sentryhttp.Options{
		Repanic:         true,
		WaitForDelivery: false,
		Timeout:         2 * time.Second,
	})
	return sentryHandler.Handle(next)
}

// scrubEmails replaces email-like substrings with [EMAIL REDACTED].
func scrubEmails(s string) string {
	if s == "" {
		return s
	}
	return emailPattern.ReplaceAllString(s, "[EMAIL REDACTED]")
}
