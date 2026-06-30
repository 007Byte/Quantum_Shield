package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/pashagolub/pgxmock/v2"
	auth "github.com/usbvault/usbvault-server/internal/auth"
	"github.com/usbvault/usbvault-server/internal/ctxkeys"
)

func TestAuthMiddleware_ValidToken(t *testing.T) {
	// Create a valid JWT token
	userID := "test-user-123"
	deviceID := "test-device-456"

	accessToken, _, err := auth.GenerateTokenPair(userID, deviceID)
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	// Create a simple next handler that checks for context values
	nextHandlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextHandlerCalled = true
		extractedUserID, ok := r.Context().Value(ctxkeys.UserID).(string)
		if !ok {
			t.Error("user_id not found in context")
			return
		}
		if extractedUserID != userID {
			t.Errorf("expected user_id %q, got %q", userID, extractedUserID)
		}

		extractedDeviceID, ok := r.Context().Value(ctxkeys.DeviceID).(string)
		if !ok {
			t.Error("device_id not found in context")
			return
		}
		if extractedDeviceID != deviceID {
			t.Errorf("expected device_id %q, got %q", deviceID, extractedDeviceID)
		}

		w.WriteHeader(http.StatusOK)
	})

	middleware := AuthMiddleware(nil) // Redis not used if token is valid
	handler := middleware(nextHandler)

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if !nextHandlerCalled {
		t.Error("next handler was not called")
	}
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

// Device-fingerprint binding must FAIL CLOSED: a device-bound token MUST present a
// matching X-Device-Fingerprint header. Omitting the header previously bypassed the
// binding entirely (a stolen device-bound token then worked from any device).
func TestAuthMiddleware_DeviceFingerprintFailClosed(t *testing.T) {
	const fp = "device-fingerprint-abc123"
	token, _, err := auth.GenerateTokenPairWithFingerprint("fp-user", "fp-device", fp)
	if err != nil {
		t.Fatalf("failed to generate device-bound token: %v", err)
	}

	run := func(setHeader bool, headerVal string) (int, bool) {
		called := false
		next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		})
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		if setHeader {
			req.Header.Set("X-Device-Fingerprint", headerVal)
		}
		w := httptest.NewRecorder()
		AuthMiddleware(nil)(next).ServeHTTP(w, req)
		return w.Code, called
	}

	t.Run("missing header is rejected (the fail-open fix)", func(t *testing.T) {
		if code, called := run(false, ""); code != http.StatusUnauthorized || called {
			t.Errorf("expected 401 and handler NOT called, got %d called=%v", code, called)
		}
	})
	t.Run("matching header is allowed", func(t *testing.T) {
		if code, called := run(true, fp); code != http.StatusOK || !called {
			t.Errorf("expected 200 and handler called, got %d called=%v", code, called)
		}
	})
	t.Run("mismatched header is rejected", func(t *testing.T) {
		if code, called := run(true, "wrong-fingerprint"); code != http.StatusUnauthorized || called {
			t.Errorf("expected 401 and handler NOT called, got %d called=%v", code, called)
		}
	})
}

// A token WITHOUT a device-fingerprint claim has no binding, so a missing header
// must NOT block the request (only bound tokens require the header).
func TestAuthMiddleware_NoFingerprintBindingAllowsMissingHeader(t *testing.T) {
	token, _, err := auth.GenerateTokenPair("nofp-user", "nofp-device")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}
	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	AuthMiddleware(nil)(next).ServeHTTP(w, req)
	if w.Code != http.StatusOK || !called {
		t.Errorf("expected 200 and handler called for unbound token, got %d called=%v", w.Code, called)
	}
}

func TestAuthMiddleware_MissingAuthorizationHeader(t *testing.T) {
	nextHandlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextHandlerCalled = true
		// Should still call next handler, but without user_id in context
		_, ok := r.Context().Value(ctxkeys.UserID).(string)
		if ok {
			t.Error("user_id should not be in context when no auth header")
		}
		w.WriteHeader(http.StatusOK)
	})

	middleware := AuthMiddleware(nil)
	handler := middleware(nextHandler)

	req := httptest.NewRequest("GET", "/test", nil)
	// No Authorization header

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if !nextHandlerCalled {
		t.Error("next handler should be called even without auth header")
	}
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	nextHandlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextHandlerCalled = true
		// Should still call next handler, but without user_id
		_, ok := r.Context().Value(ctxkeys.UserID).(string)
		if ok {
			t.Error("user_id should not be in context with invalid token")
		}
		w.WriteHeader(http.StatusOK)
	})

	middleware := AuthMiddleware(nil)
	handler := middleware(nextHandler)

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if !nextHandlerCalled {
		t.Error("next handler should be called even with invalid token")
	}
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestAuthMiddleware_MalformedAuthHeader(t *testing.T) {
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	middleware := AuthMiddleware(nil)
	handler := middleware(nextHandler)

	testCases := []string{
		"Bearer",                     // Missing token
		"Bearer  ",                   // Only spaces
		"NotBearer token123",         // Wrong scheme
		"Bearer token1 token2 extra", // Extra tokens
	}

	for _, authHeader := range testCases {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", authHeader)

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		_, ok := req.Context().Value(ctxkeys.UserID).(string)
		if ok {
			t.Errorf("user_id should not be in context for auth header: %q", authHeader)
		}
	}
}

func TestAuthMiddleware_StoresTokenType(t *testing.T) {
	userID := "test-user"
	deviceID := "test-device"

	accessToken, _, _ := auth.GenerateTokenPair(userID, deviceID)

	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenType, ok := r.Context().Value(ctxkeys.TokenType).(string)
		if !ok {
			t.Error("token_type not found in context")
			return
		}
		if tokenType != "access" {
			t.Errorf("expected token_type 'access', got %q", tokenType)
		}
		w.WriteHeader(http.StatusOK)
	})

	middleware := AuthMiddleware(nil)
	handler := middleware(nextHandler)

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestRequireAuth_WithValidContext(t *testing.T) {
	nextHandlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextHandlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	middleware := RequireAuth(nextHandler)

	req := httptest.NewRequest("GET", "/test", nil)
	ctx := context.WithValue(req.Context(), ctxkeys.UserID, "test-user")
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	middleware.ServeHTTP(w, req)

	if !nextHandlerCalled {
		t.Error("next handler should be called when user_id is in context")
	}
	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}

func TestRequireAuth_WithoutContext(t *testing.T) {
	nextHandlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextHandlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	middleware := RequireAuth(nextHandler)

	req := httptest.NewRequest("GET", "/test", nil)
	// No user_id in context

	w := httptest.NewRecorder()
	middleware.ServeHTTP(w, req)

	if nextHandlerCalled {
		t.Error("next handler should not be called without user_id")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestRequireAuth_WithWrongContextType(t *testing.T) {
	nextHandlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextHandlerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	middleware := RequireAuth(nextHandler)

	req := httptest.NewRequest("GET", "/test", nil)
	ctx := context.WithValue(req.Context(), ctxkeys.UserID, 12345) // Wrong type (int instead of string)
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	middleware.ServeHTTP(w, req)

	if nextHandlerCalled {
		t.Error("next handler should not be called with wrong context type")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestFullAuthFlow(t *testing.T) {
	// Test the full flow: AuthMiddleware -> RequireAuth
	userID := "full-flow-user"
	deviceID := "full-flow-device"

	accessToken, _, _ := auth.GenerateTokenPair(userID, deviceID)

	authMiddlewareHandler := AuthMiddleware(nil)

	protectedHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("protected content"))
	})

	fullChain := authMiddlewareHandler(RequireAuth(protectedHandler))

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	w := httptest.NewRecorder()
	fullChain.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	if w.Body.String() != "protected content" {
		t.Errorf("expected response body 'protected content', got %q", w.Body.String())
	}
}

func TestFullAuthFlow_Unauthorized(t *testing.T) {
	// Test the full flow without a token
	authMiddlewareHandler := AuthMiddleware(nil)

	protectedHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("protected content"))
	})

	fullChain := authMiddlewareHandler(RequireAuth(protectedHandler))

	req := httptest.NewRequest("GET", "/protected", nil)
	// No auth header

	w := httptest.NewRecorder()
	fullChain.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestGetClientIP_RemoteAddr(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:54321"

	ip := getClientIP(req)
	if ip != "192.168.1.1" {
		t.Errorf("expected '192.168.1.1', got %q", ip)
	}
}

// M-6: forwarding headers are honored ONLY when the immediate peer is a configured
// trusted proxy.
func TestGetClientIP_XRealIPFromTrustedProxy(t *testing.T) {
	t.Setenv("TRUSTED_PROXY_CIDRS", "127.0.0.0/8")
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("X-Real-IP", "203.0.113.42")

	ip := getClientIP(req)
	if ip != "203.0.113.42" {
		t.Errorf("expected '203.0.113.42', got %q", ip)
	}
}

func TestGetClientIP_XForwardedForFromTrustedProxy(t *testing.T) {
	t.Setenv("TRUSTED_PROXY_CIDRS", "127.0.0.0/8")
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("X-Forwarded-For", "198.51.100.1, 203.0.113.42")

	ip := getClientIP(req)
	// H-5: return the RIGHTMOST (proxy-added) entry, not the client's spoofable
	// leftmost value.
	if ip != "203.0.113.42" {
		t.Errorf("expected '203.0.113.42', got %q", ip)
	}
}

// M-6 security property: a direct (untrusted) client cannot spoof its source IP via
// forwarding headers — they are ignored and RemoteAddr is authoritative.
func TestGetClientIP_IgnoresHeadersFromUntrustedPeer(t *testing.T) {
	t.Setenv("TRUSTED_PROXY_CIDRS", "10.0.0.0/8") // the peer below is NOT in this range
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "198.51.100.7:44444"
	req.Header.Set("X-Forwarded-For", "203.0.113.42")
	req.Header.Set("X-Real-IP", "203.0.113.42")

	ip := getClientIP(req)
	if ip != "198.51.100.7" {
		t.Errorf("spoofed headers must be ignored from an untrusted peer; expected '198.51.100.7', got %q", ip)
	}
}

func TestGetClientIP_NoTrustedProxyConfigIgnoresHeaders(t *testing.T) {
	t.Setenv("TRUSTED_PROXY_CIDRS", "") // unset/empty → trust nothing
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("X-Forwarded-For", "203.0.113.42")

	ip := getClientIP(req)
	if ip != "127.0.0.1" {
		t.Errorf("with no trusted-proxy config, headers must be ignored; expected '127.0.0.1', got %q", ip)
	}
}

// RequireTier gates a handler by the caller's subscription tier. It is driven by a
// single tier-lookup query, which we drive with pgxmock (via the TierPool seam) so the
// middleware can be exercised end-to-end without a real database.
func TestRequireTier(t *testing.T) {
	// rowsForTier builds the single-column result the tier query Scans into.
	rowsForTier := func(tier string) *pgxmock.Rows {
		return pgxmock.NewRows([]string{"tier"}).AddRow(tier)
	}

	tests := []struct {
		name          string
		requiredTier  string
		userID        string
		setupDB       func(pgxmock.PgxPoolIface)
		wantStatus    int
		wantNextCall  bool
		wantCurrent   string // expected X-Current-Tier header
		wantTierInCtx string // tier the next handler should observe in context (when called)
	}{
		{
			name:         "active tier meeting the requirement is allowed",
			requiredTier: "team",
			userID:       "user-team",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT COALESCE.+FROM subscriptions WHERE user_id").
					WithArgs("user-team").
					WillReturnRows(rowsForTier("team"))
			},
			wantStatus:    http.StatusOK,
			wantNextCall:  true,
			wantCurrent:   "team",
			wantTierInCtx: "team",
		},
		{
			name:         "higher tier than required is allowed",
			requiredTier: "individual",
			userID:       "user-ent",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT COALESCE.+FROM subscriptions WHERE user_id").
					WithArgs("user-ent").
					WillReturnRows(rowsForTier("enterprise"))
			},
			wantStatus:    http.StatusOK,
			wantNextCall:  true,
			wantCurrent:   "enterprise",
			wantTierInCtx: "enterprise",
		},
		{
			name:         "lower tier than required is forbidden",
			requiredTier: "enterprise",
			userID:       "user-free",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				mock.ExpectQuery("SELECT COALESCE.+FROM subscriptions WHERE user_id").
					WithArgs("user-free").
					WillReturnRows(rowsForTier("individual"))
			},
			wantStatus:   http.StatusForbidden,
			wantNextCall: false,
			wantCurrent:  "individual",
		},
		{
			name:         "no active subscription fails closed to free",
			requiredTier: "team",
			userID:       "user-none",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// pgx.ErrNoRows is the legitimate "no active subscription" path → free.
				mock.ExpectQuery("SELECT COALESCE.+FROM subscriptions WHERE user_id").
					WithArgs("user-none").
					WillReturnError(pgx.ErrNoRows)
			},
			wantStatus:   http.StatusForbidden,
			wantNextCall: false,
			wantCurrent:  "free",
		},
		{
			name:         "transient DB error fails closed to free (M-4)",
			requiredTier: "individual",
			userID:       "user-dberr",
			setupDB: func(mock pgxmock.PgxPoolIface) {
				// A real DB error must NOT grant a paid tier; it degrades to free.
				mock.ExpectQuery("SELECT COALESCE.+FROM subscriptions WHERE user_id").
					WithArgs("user-dberr").
					WillReturnError(errors.New("connection reset"))
			},
			wantStatus:   http.StatusForbidden,
			wantNextCall: false,
			wantCurrent:  "free",
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			mock, err := pgxmock.NewPool()
			if err != nil {
				t.Fatalf("failed to create mock pool: %v", err)
			}
			defer mock.Close()
			tt.setupDB(mock)

			nextCalled := false
			var observedTier string
			var observedTierOK bool
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				nextCalled = true
				observedTier, observedTierOK = UserTierFromContext(r.Context())
				w.WriteHeader(http.StatusOK)
			})

			handler := RequireTier(tt.requiredTier, mock)(next)

			req := httptest.NewRequest("GET", "/gated", nil)
			ctx := context.WithValue(req.Context(), ctxkeys.UserID, tt.userID)
			req = req.WithContext(ctx)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("status: want %d, got %d (body=%s)", tt.wantStatus, w.Code, w.Body.String())
			}
			if nextCalled != tt.wantNextCall {
				t.Errorf("next handler called: want %v, got %v", tt.wantNextCall, nextCalled)
			}
			// Tier headers are always set for observability.
			if got := w.Header().Get("X-Required-Tier"); got != tt.requiredTier {
				t.Errorf("X-Required-Tier: want %q, got %q", tt.requiredTier, got)
			}
			if got := w.Header().Get("X-Current-Tier"); got != tt.wantCurrent {
				t.Errorf("X-Current-Tier: want %q, got %q", tt.wantCurrent, got)
			}
			if tt.wantNextCall {
				if !observedTierOK || observedTier != tt.wantTierInCtx {
					t.Errorf("tier in context: want %q (ok), got %q (ok=%v)", tt.wantTierInCtx, observedTier, observedTierOK)
				}
			}
			// On a forbidden response the JSON error body must describe the gate.
			if tt.wantStatus == http.StatusForbidden {
				var gateErr TierGateError
				if err := json.Unmarshal(w.Body.Bytes(), &gateErr); err != nil {
					t.Fatalf("forbidden response body must be a TierGateError JSON: %v (body=%s)", err, w.Body.String())
				}
				if gateErr.Error != "insufficient_tier" {
					t.Errorf("gate error code: want %q, got %q", "insufficient_tier", gateErr.Error)
				}
				if gateErr.RequiredTier != tt.requiredTier || gateErr.CurrentTier != tt.wantCurrent {
					t.Errorf("gate error tiers: want required=%q current=%q, got required=%q current=%q",
						tt.requiredTier, tt.wantCurrent, gateErr.RequiredTier, gateErr.CurrentTier)
				}
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Errorf("unmet DB expectations: %v", err)
			}
		})
	}
}

// An unauthenticated request (no user_id in context) is rejected with 401 BEFORE any
// database lookup happens — the tier query must never run.
func TestRequireTier_Unauthorized(t *testing.T) {
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("failed to create mock pool: %v", err)
	}
	defer mock.Close()
	// Deliberately set up NO expectations: any query would be an unexpected call.

	nextCalled := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := RequireTier("enterprise", mock)(next)

	req := httptest.NewRequest("GET", "/gated", nil)
	// No ctxkeys.UserID in context → unauthenticated.
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d (body=%s)", w.Code, w.Body.String())
	}
	if nextCalled {
		t.Error("next handler must not be called for an unauthenticated request")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("no DB query should run for an unauthenticated request: %v", err)
	}
}
