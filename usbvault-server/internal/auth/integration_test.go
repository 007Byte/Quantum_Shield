package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TS-017: HTTP integration tests for auth endpoints

// mockAuditService implements the audit service interface for testing.
// It is the single shared definition for the auth package tests; the
// integration-tagged tests (fido2_test.go, srp_test.go) reuse it via the
// actions and loggedActions fields.
type mockAuditService struct {
	actions       []string
	loggedActions []struct {
		userID        string
		actionType    string
		encryptedData []byte
	}
}

func (m *mockAuditService) LogAction(_ context.Context, userID string, actionType string, encryptedDetail []byte) error {
	m.actions = append(m.actions, actionType)
	m.loggedActions = append(m.loggedActions, struct {
		userID        string
		actionType    string
		encryptedData []byte
	}{userID, actionType, encryptedDetail})
	return nil
}

func TestSRPInitEndpoint_InvalidJSON(t *testing.T) {
	handler := HandleSRPInit(nil, nil, nil)

	req := httptest.NewRequest("POST", "/auth/srp/init", bytes.NewBufferString("invalid json"))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestSRPVerifyEndpoint_InvalidJSON(t *testing.T) {
	handler := HandleSRPVerify(nil, nil, nil, nil)

	req := httptest.NewRequest("POST", "/auth/srp/verify", bytes.NewBufferString("not json"))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestRefreshTokenEndpoint_InvalidJSON(t *testing.T) {
	handler := HandleRefreshToken(nil, nil)

	req := httptest.NewRequest("POST", "/auth/refresh", bytes.NewBufferString("bad"))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestRefreshTokenEndpoint_InvalidToken(t *testing.T) {
	// Would need a mock Redis client for full testing
	// This tests the basic request parsing
	body := map[string]string{"refresh_token": "invalid.token.here"}
	bodyBytes, _ := json.Marshal(body)

	handler := HandleRefreshToken(nil, nil)
	req := httptest.NewRequest("POST", "/auth/refresh", bytes.NewBuffer(bodyBytes))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Should fail because token is invalid (can't be validated)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHashEmail_Deterministic(t *testing.T) {
	hash1 := hashEmail("test@example.com")
	hash2 := hashEmail("test@example.com")
	if hash1 != hash2 {
		t.Error("hashEmail should be deterministic")
	}
	if len(hash1) != 64 {
		t.Errorf("hashEmail should return 64 hex chars, got %d", len(hash1))
	}
}

func TestHashEmail_DifferentForDifferentEmails(t *testing.T) {
	hash1 := hashEmail("alice@example.com")
	hash2 := hashEmail("bob@example.com")
	if hash1 == hash2 {
		t.Error("different emails should produce different hashes")
	}
}

func TestBytesEqual_ConstantTimeComparison(t *testing.T) {
	a := []byte("hello world")
	b := []byte("hello world")
	c := []byte("hello worlD")
	d := []byte("short")

	if !bytesEqual(a, b) {
		t.Error("identical bytes should be equal")
	}
	if bytesEqual(a, c) {
		t.Error("different bytes should not be equal")
	}
	if bytesEqual(a, d) {
		t.Error("different length bytes should not be equal")
	}
}

func TestComputeSRPk_NonZero(t *testing.T) {
	N := new(big.Int)
	N.SetString(srpN, 16)
	g := big.NewInt(int64(srpG))
	k := computeSRPk(N, g)
	if k.Sign() <= 0 {
		t.Error("SRP k should be positive")
	}
}

func TestRandomBigInt_NonPanic(t *testing.T) {
	val, err := randomBigInt(256)
	if err != nil {
		t.Fatalf("randomBigInt failed: %v", err)
	}
	if val.Sign() <= 0 {
		t.Error("randomBigInt should return positive value")
	}
}

func TestRandomBigInt_Unique(t *testing.T) {
	v1, _ := randomBigInt(256)
	v2, _ := randomBigInt(256)
	if v1.Cmp(v2) == 0 {
		t.Error("two random values should differ")
	}
}
