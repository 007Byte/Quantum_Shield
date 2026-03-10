package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	auth "github.com/usbvault/usbvault-server/internal/auth"
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
		extractedUserID, ok := r.Context().Value("user_id").(string)
		if !ok {
			t.Error("user_id not found in context")
			return
		}
		if extractedUserID != userID {
			t.Errorf("expected user_id %q, got %q", userID, extractedUserID)
		}

		extractedDeviceID, ok := r.Context().Value("device_id").(string)
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

func TestAuthMiddleware_MissingAuthorizationHeader(t *testing.T) {
	nextHandlerCalled := false
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextHandlerCalled = true
		// Should still call next handler, but without user_id in context
		_, ok := r.Context().Value("user_id").(string)
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
		_, ok := r.Context().Value("user_id").(string)
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
		"Bearer",                    // Missing token
		"Bearer  ",                  // Only spaces
		"NotBearer token123",        // Wrong scheme
		"Bearer token1 token2 extra", // Extra tokens
	}

	for _, authHeader := range testCases {
		req := httptest.NewRequest("GET", "/test", nil)
		req.Header.Set("Authorization", authHeader)

		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)

		_, ok := req.Context().Value("user_id").(string)
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
		tokenType, ok := r.Context().Value("token_type").(string)
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
	ctx := context.WithValue(req.Context(), "user_id", "test-user")
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
	ctx := context.WithValue(req.Context(), "user_id", 12345) // Wrong type (int instead of string)
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

func TestGetClientIP_XRealIP(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("X-Real-IP", "203.0.113.42")

	ip := getClientIP(req)
	if ip != "203.0.113.42" {
		t.Errorf("expected '203.0.113.42', got %q", ip)
	}
}

func TestGetClientIP_XForwardedFor(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("X-Forwarded-For", "198.51.100.1, 203.0.113.42")

	ip := getClientIP(req)
	// Should return the first IP
	if ip != "198.51.100.1" {
		t.Errorf("expected '198.51.100.1', got %q", ip)
	}
}

func TestGetClientIP_XForwardedForSingle(t *testing.T) {
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-Forwarded-For", "192.0.2.1")

	ip := getClientIP(req)
	if ip != "192.0.2.1" {
		t.Errorf("expected '192.0.2.1', got %q", ip)
	}
}

// TODO: RequireTier requires a *pgxpool.Pool which needs to be mocked or set up
// These tests are placeholder and require proper database mocking
func TestRequireTier(t *testing.T) {
	t.Skip("RequireTier requires database pool setup")
}

func TestRequireTier_Unauthorized(t *testing.T) {
	t.Skip("RequireTier requires database pool setup")
}
