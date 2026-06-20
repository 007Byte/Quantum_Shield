package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ---------------------------------------------------------------------------
// Tests for HandleRegisterDevice HTTP handler
// ---------------------------------------------------------------------------

// contextKey is a typed key to avoid the bare-string context-value lint issue
type contextKey string

const userIDKey contextKey = "user_id"

// helperContextWithUserID sets user_id in the request context the same way
// the production middleware does (using the bare string key "user_id").
func helperContextWithUserID(r *http.Request, uid string) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), "user_id", uid))
}

func TestHandleRegisterDevice_InvalidJSON(t *testing.T) {
	// NotifyService with nil pool -- we never reach the DB in this path
	ns := &NotifyService{}
	handler := HandleRegisterDevice(ns)

	req := httptest.NewRequest(http.MethodPost, "/devices", strings.NewReader("{bad json"))
	req = helperContextWithUserID(req, "user-1")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "invalid request") {
		t.Errorf("expected body to contain 'invalid request', got %q", rr.Body.String())
	}
}

func TestHandleRegisterDevice_MissingUserID(t *testing.T) {
	ns := &NotifyService{}
	handler := HandleRegisterDevice(ns)

	body := RegisterDeviceRequest{
		DeviceToken: "tok-abc",
		Platform:    "ios",
	}
	b, _ := json.Marshal(body)

	// No user_id in context
	req := httptest.NewRequest(http.MethodPost, "/devices", bytes.NewReader(b))
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "unauthorized") {
		t.Errorf("expected body to contain 'unauthorized', got %q", rr.Body.String())
	}
}

func TestHandleRegisterDevice_EmptyBody(t *testing.T) {
	ns := &NotifyService{}
	handler := HandleRegisterDevice(ns)

	req := httptest.NewRequest(http.MethodPost, "/devices", strings.NewReader(""))
	req = helperContextWithUserID(req, "user-1")
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	// Empty body fails JSON decode (EOF)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("expected status 400 for empty body, got %d", rr.Code)
	}
}

func TestHandleRegisterDevice_WrongContextType(t *testing.T) {
	ns := &NotifyService{}
	handler := HandleRegisterDevice(ns)

	body := RegisterDeviceRequest{DeviceToken: "tok", Platform: "android"}
	b, _ := json.Marshal(body)

	// Set user_id to an integer instead of a string
	req := httptest.NewRequest(http.MethodPost, "/devices", bytes.NewReader(b))
	req = req.WithContext(context.WithValue(req.Context(), "user_id", 12345))
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 when user_id is wrong type, got %d", rr.Code)
	}
}

// ---------------------------------------------------------------------------
// Tests for RegisterDeviceRequest struct marshalling
// ---------------------------------------------------------------------------

func TestRegisterDeviceRequest_Decode(t *testing.T) {
	tests := []struct {
		name        string
		input       string
		wantToken   string
		wantPlatfm  string
		wantErr     bool
	}{
		{
			name:       "valid ios",
			input:      `{"device_token":"tok-123","platform":"ios"}`,
			wantToken:  "tok-123",
			wantPlatfm: "ios",
		},
		{
			name:       "valid android",
			input:      `{"device_token":"fcm-xyz","platform":"android"}`,
			wantToken:  "fcm-xyz",
			wantPlatfm: "android",
		},
		{
			name:       "extra fields ignored",
			input:      `{"device_token":"t","platform":"ios","extra":"ignored"}`,
			wantToken:  "t",
			wantPlatfm: "ios",
		},
		{
			name:    "invalid json",
			input:   `{bad`,
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var req RegisterDeviceRequest
			err := json.NewDecoder(strings.NewReader(tc.input)).Decode(&req)
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected decode error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if req.DeviceToken != tc.wantToken {
				t.Errorf("token: got %q, want %q", req.DeviceToken, tc.wantToken)
			}
			if req.Platform != tc.wantPlatfm {
				t.Errorf("platform: got %q, want %q", req.Platform, tc.wantPlatfm)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Tests for Device JSON serialization
// ---------------------------------------------------------------------------

func TestDevice_JSONOmitsToken(t *testing.T) {
	d := Device{
		ID:          1,
		UserID:      "u-1",
		DeviceToken: "secret-token",
		Platform:    "ios",
	}
	b, err := json.Marshal(d)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if strings.Contains(string(b), "secret-token") {
		t.Error("DeviceToken should not appear in JSON (json:\"-\") but it was found")
	}
	if !strings.Contains(string(b), `"platform":"ios"`) {
		t.Error("expected platform in JSON output")
	}
	if !strings.Contains(string(b), `"user_id":"u-1"`) {
		t.Error("expected user_id in JSON output")
	}
}

// ---------------------------------------------------------------------------
// Tests for NewNotifyService constructor
// ---------------------------------------------------------------------------

func TestNewNotifyService_NilPool(t *testing.T) {
	ns := NewNotifyService(nil)
	if ns == nil {
		t.Fatal("expected non-nil NotifyService")
	}
	if ns.pool != nil {
		t.Error("expected nil pool when constructed with nil")
	}
}
