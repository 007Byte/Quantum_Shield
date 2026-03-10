package vault

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEncodeToBase64_ValidData(t *testing.T) {
	data := []byte{0x48, 0x65, 0x6c, 0x6c, 0x6f} // "Hello"
	encoded := encodeToBase64(data)
	expected := base64.StdEncoding.EncodeToString(data)

	if encoded != expected {
		t.Errorf("encodeToBase64 mismatch: expected %q, got %q", expected, encoded)
	}
}

func TestEncodeToBase64_EmptyData(t *testing.T) {
	data := []byte{}
	encoded := encodeToBase64(data)

	if encoded != "" {
		t.Errorf("encodeToBase64 of empty data should return empty string, got %q", encoded)
	}
}

func TestEncodeToBase64_NilData(t *testing.T) {
	var data []byte
	encoded := encodeToBase64(data)

	if encoded != "" {
		t.Errorf("encodeToBase64 of nil data should return empty string, got %q", encoded)
	}
}

func TestDecodeFromBase64_ValidData(t *testing.T) {
	original := []byte{0x48, 0x65, 0x6c, 0x6c, 0x6f} // "Hello"
	encoded := base64.StdEncoding.EncodeToString(original)

	decoded, err := decodeFromBase64(encoded)
	if err != nil {
		t.Fatalf("decodeFromBase64 failed: %v", err)
	}

	if !bytes.Equal(decoded, original) {
		t.Errorf("decodeFromBase64 mismatch: expected %v, got %v", original, decoded)
	}
}

func TestDecodeFromBase64_EmptyString(t *testing.T) {
	decoded, err := decodeFromBase64("")
	if err != nil {
		t.Fatalf("decodeFromBase64 of empty string should not error: %v", err)
	}

	if decoded != nil {
		t.Errorf("decodeFromBase64 of empty string should return nil, got %v", decoded)
	}
}

func TestDecodeFromBase64_InvalidData(t *testing.T) {
	invalidBase64 := "!!!invalid base64!!!"

	_, err := decodeFromBase64(invalidBase64)
	if err == nil {
		t.Error("decodeFromBase64 should reject invalid base64")
	}
}

func TestBase64Roundtrip(t *testing.T) {
	testCases := []struct {
		name string
		data []byte
	}{
		{"empty", []byte{}},
		{"single byte", []byte{0xFF}},
		{"hello world", []byte("Hello, World!")},
		{"binary data", []byte{0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD, 0xFC}},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			encoded := encodeToBase64(tc.data)
			decoded, err := decodeFromBase64(encoded)
			if err != nil {
				t.Fatalf("decodeFromBase64 failed: %v", err)
			}

			if !bytes.Equal(decoded, tc.data) {
				t.Errorf("roundtrip failed: original %v, decoded %v", tc.data, decoded)
			}
		})
	}
}

func TestHandleCreateVault_MalformedJSON(t *testing.T) {
	mockAuditSvc := &mockAuditService{}
	vaultSvc := NewVaultService(nil) // Will not be called

	handler := HandleCreateVault(vaultSvc, mockAuditSvc)

	body := bytes.NewBufferString("{invalid json")
	req := httptest.NewRequest("POST", "/api/v1/vaults", body)
	req.Header.Set("Content-Type", "application/json")

	// Add user_id to context
	ctx := context.WithValue(req.Context(), "user_id", "test-user")
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, w.Code)
	}
}

func TestHandleCreateVault_MissingUserID(t *testing.T) {
	mockAuditSvc := &mockAuditService{}
	vaultSvc := NewVaultService(nil)

	handler := HandleCreateVault(vaultSvc, mockAuditSvc)

	reqBody := CreateVaultRequest{
		EncryptedMetadata: base64.StdEncoding.EncodeToString([]byte("test")),
	}

	bodyBytes, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/api/v1/vaults", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")

	// Don't add user_id to context
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}
}

func TestHandleListVaults_Unauthorized(t *testing.T) {
	vaultSvc := NewVaultService(nil)
	handler := HandleListVaults(vaultSvc)

	req := httptest.NewRequest("GET", "/api/v1/vaults", nil)
	// No user_id in context

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}
}

type mockAuditService struct {
	logActionFn func(ctx context.Context, userID string, actionType string, detail []byte) error
}

func (m *mockAuditService) LogAction(ctx context.Context, userID string, actionType string, detail []byte) error {
	if m.logActionFn != nil {
		return m.logActionFn(ctx, userID, actionType, detail)
	}
	return nil
}

func TestLargeBase64Data(t *testing.T) {
	// Test with large data
	largeData := make([]byte, 1024*1024) // 1MB
	for i := range largeData {
		largeData[i] = byte(i % 256)
	}

	encoded := encodeToBase64(largeData)
	decoded, err := decodeFromBase64(encoded)
	if err != nil {
		t.Fatalf("decodeFromBase64 failed on large data: %v", err)
	}

	if !bytes.Equal(decoded, largeData) {
		t.Error("large data roundtrip failed")
	}
}

func TestDecodeFromBase64_ManyInvalidFormats(t *testing.T) {
	invalidFormats := []string{
		"!!!",
		"a=b=c=d",
		"====",
		"  @#$%",
		"SGVsbG8gV29ybGQ=!", // Valid base64 with extra character
	}

	for _, invalid := range invalidFormats {
		_, err := decodeFromBase64(invalid)
		if err == nil {
			t.Errorf("decodeFromBase64 should reject: %q", invalid)
		}
	}
}
