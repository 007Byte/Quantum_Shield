package errortracking

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/getsentry/sentry-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------------------------------------------------------------------------
// ScrubPII tests
// ---------------------------------------------------------------------------

func TestScrubPII_ClearsIPAddress(t *testing.T) {
	event := &sentry.Event{
		User: sentry.User{
			IPAddress: "192.168.1.42",
			ID:        "user-123",
		},
	}

	result := ScrubPII(event, nil)

	assert.Equal(t, "", result.User.IPAddress, "IP address should be scrubbed")
	assert.Equal(t, "user-123", result.User.ID, "User ID should remain intact")
}

func TestScrubPII_StripsEmailFromMessage(t *testing.T) {
	event := &sentry.Event{
		Message: "failed to process request for alice@example.com",
	}

	result := ScrubPII(event, nil)

	assert.NotContains(t, result.Message, "alice@example.com")
	assert.Contains(t, result.Message, "[EMAIL REDACTED]")
}

func TestScrubPII_StripsEmailFromExceptionValues(t *testing.T) {
	event := &sentry.Event{
		Exception: []sentry.Exception{
			{
				Type:  "ValidationError",
				Value: "invalid user bob@corp.io in tenant",
			},
		},
	}

	result := ScrubPII(event, nil)

	assert.NotContains(t, result.Exception[0].Value, "bob@corp.io")
	assert.Contains(t, result.Exception[0].Value, "[EMAIL REDACTED]")
}

func TestScrubPII_RedactsAuthorizationHeaders(t *testing.T) {
	event := &sentry.Event{
		Breadcrumbs: []*sentry.Breadcrumb{
			{
				Category: "http",
				Data: map[string]interface{}{
					"url":           "https://api.example.com/v1/vaults",
					"Authorization": "Bearer eyJhbGciOi...",
					"Content-Type":  "application/json",
				},
			},
			{
				Category: "http",
				Data: map[string]interface{}{
					"auth": "token secret-value",
				},
			},
		},
	}

	result := ScrubPII(event, nil)

	assert.Equal(t, "[REDACTED]", result.Breadcrumbs[0].Data["Authorization"])
	assert.Equal(t, "application/json", result.Breadcrumbs[0].Data["Content-Type"])
	assert.Equal(t, "[REDACTED]", result.Breadcrumbs[1].Data["auth"])
}

func TestScrubPII_NilEvent(t *testing.T) {
	result := ScrubPII(nil, nil)
	assert.Nil(t, result)
}

func TestScrubPII_NoBreadcrumbData(t *testing.T) {
	event := &sentry.Event{
		Breadcrumbs: []*sentry.Breadcrumb{
			{Category: "navigation", Data: nil},
		},
	}

	result := ScrubPII(event, nil)
	assert.Nil(t, result.Breadcrumbs[0].Data)
}

// ---------------------------------------------------------------------------
// No-op mode tests (empty DSN)
// ---------------------------------------------------------------------------

func TestInit_EmptyDSN_ReturnsNil(t *testing.T) {
	// Reset global state for test isolation.
	initialized = false
	defer func() { initialized = false }()

	err := Init("", "test", "1.0.0")

	require.NoError(t, err)
	assert.False(t, initialized, "initialized should remain false with empty DSN")
}

func TestFlush_NoOp_WhenNotInitialized(t *testing.T) {
	initialized = false
	// Should not panic.
	Flush(0)
}

// ---------------------------------------------------------------------------
// RecoverMiddleware tests
// ---------------------------------------------------------------------------

func TestRecoverMiddleware_CatchesAndRepanics(t *testing.T) {
	// Ensure we test the non-initialized (no-op) path.
	initialized = false

	panicHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("test panic")
	})

	wrapped := RecoverMiddleware(panicHandler)

	assert.Panics(t, func() {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rr := httptest.NewRecorder()
		wrapped.ServeHTTP(rr, req)
	}, "middleware should re-panic after recovery")
}

func TestRecoverMiddleware_NormalRequestPassesThrough(t *testing.T) {
	initialized = false

	normalHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	wrapped := RecoverMiddleware(normalHandler)
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()

	wrapped.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "ok", rr.Body.String())
}
