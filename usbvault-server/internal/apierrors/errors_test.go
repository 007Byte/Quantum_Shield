package apierrors

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// PH4-FIX: Test error types and error response formatting

func TestErrorCodeValues(t *testing.T) {
	tests := []struct {
		code     ErrorCode
		expected string
	}{
		{ErrBadRequest, "BAD_REQUEST"},
		{ErrUnauthorized, "UNAUTHORIZED"},
		{ErrForbidden, "FORBIDDEN"},
		{ErrNotFound, "NOT_FOUND"},
		{ErrConflict, "CONFLICT"},
		{ErrRateLimited, "RATE_LIMITED"},
		{ErrPaymentRequired, "PAYMENT_REQUIRED"},
		{ErrValidation, "VALIDATION_ERROR"},
		{ErrInternal, "INTERNAL_ERROR"},
		{ErrEncryptionFailed, "ENCRYPTION_FAILED"},
		{ErrDecryptionFailed, "DECRYPTION_FAILED"},
	}

	for _, tt := range tests {
		if string(tt.code) != tt.expected {
			t.Errorf("ErrorCode %v, expected %s, got %s", tt.code, tt.expected, string(tt.code))
		}
	}
}

func TestAPIErrorError(t *testing.T) {
	err := NewBadRequest("invalid input")
	expected := "BAD_REQUEST: invalid input"
	if err.Error() != expected {
		t.Errorf("Error() = %s, expected %s", err.Error(), expected)
	}
}

func TestNewBadRequest(t *testing.T) {
	msg := "invalid field"
	err := NewBadRequest(msg)

	if err.Code != ErrBadRequest {
		t.Errorf("Code = %v, expected %v", err.Code, ErrBadRequest)
	}
	if err.Message != msg {
		t.Errorf("Message = %s, expected %s", err.Message, msg)
	}
	if err.StatusCode != http.StatusBadRequest {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusBadRequest)
	}
}

func TestNewUnauthorized(t *testing.T) {
	msg := "invalid token"
	err := NewUnauthorized(msg)

	if err.Code != ErrUnauthorized {
		t.Errorf("Code = %v, expected %v", err.Code, ErrUnauthorized)
	}
	if err.StatusCode != http.StatusUnauthorized {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusUnauthorized)
	}
}

func TestNewForbidden(t *testing.T) {
	msg := "access denied"
	err := NewForbidden(msg)

	if err.Code != ErrForbidden {
		t.Errorf("Code = %v, expected %v", err.Code, ErrForbidden)
	}
	if err.StatusCode != http.StatusForbidden {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusForbidden)
	}
}

func TestNewNotFound(t *testing.T) {
	msg := "resource not found"
	err := NewNotFound(msg)

	if err.Code != ErrNotFound {
		t.Errorf("Code = %v, expected %v", err.Code, ErrNotFound)
	}
	if err.StatusCode != http.StatusNotFound {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusNotFound)
	}
}

func TestNewConflict(t *testing.T) {
	msg := "resource already exists"
	err := NewConflict(msg)

	if err.Code != ErrConflict {
		t.Errorf("Code = %v, expected %v", err.Code, ErrConflict)
	}
	if err.StatusCode != http.StatusConflict {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusConflict)
	}
}

func TestNewRateLimited(t *testing.T) {
	msg := "too many requests"
	err := NewRateLimited(msg)

	if err.Code != ErrRateLimited {
		t.Errorf("Code = %v, expected %v", err.Code, ErrRateLimited)
	}
	if err.StatusCode != http.StatusTooManyRequests {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusTooManyRequests)
	}
}

func TestNewInternal(t *testing.T) {
	msg := "internal server error"
	err := NewInternal(msg)

	if err.Code != ErrInternal {
		t.Errorf("Code = %v, expected %v", err.Code, ErrInternal)
	}
	if err.StatusCode != http.StatusInternalServerError {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusInternalServerError)
	}
}

func TestNewValidation(t *testing.T) {
	msg := "validation failed"
	details := map[string]string{
		"field1": "required",
		"field2": "invalid format",
	}
	err := NewValidation(msg, details)

	if err.Code != ErrValidation {
		t.Errorf("Code = %v, expected %v", err.Code, ErrValidation)
	}
	if err.Message != msg {
		t.Errorf("Message = %s, expected %s", err.Message, msg)
	}
	if len(err.Details) != len(details) {
		t.Errorf("Details length = %d, expected %d", len(err.Details), len(details))
	}
	if err.StatusCode != http.StatusBadRequest {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusBadRequest)
	}
}

func TestNewPaymentRequired(t *testing.T) {
	msg := "payment required"
	err := NewPaymentRequired(msg)

	if err.Code != ErrPaymentRequired {
		t.Errorf("Code = %v, expected %v", err.Code, ErrPaymentRequired)
	}
	if err.StatusCode != http.StatusPaymentRequired {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusPaymentRequired)
	}
}

func TestNewServiceUnavailable(t *testing.T) {
	msg := "service unavailable"
	err := NewServiceUnavailable(msg)

	if err.Code != ErrServiceUnavailable {
		t.Errorf("Code = %v, expected %v", err.Code, ErrServiceUnavailable)
	}
	if err.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusServiceUnavailable)
	}
}

func TestNewEncryptionFailed(t *testing.T) {
	msg := "encryption failed"
	err := NewEncryptionFailed(msg)

	if err.Code != ErrEncryptionFailed {
		t.Errorf("Code = %v, expected %v", err.Code, ErrEncryptionFailed)
	}
	if err.StatusCode != http.StatusInternalServerError {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusInternalServerError)
	}
}

func TestNewDecryptionFailed(t *testing.T) {
	msg := "decryption failed"
	err := NewDecryptionFailed(msg)

	if err.Code != ErrDecryptionFailed {
		t.Errorf("Code = %v, expected %v", err.Code, ErrDecryptionFailed)
	}
	if err.StatusCode != http.StatusInternalServerError {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusInternalServerError)
	}
}

func TestNewDuplicateEntry(t *testing.T) {
	msg := "duplicate entry"
	err := NewDuplicateEntry(msg)

	if err.Code != ErrDuplicateEntry {
		t.Errorf("Code = %v, expected %v", err.Code, ErrDuplicateEntry)
	}
	if err.StatusCode != http.StatusConflict {
		t.Errorf("StatusCode = %d, expected %d", err.StatusCode, http.StatusConflict)
	}
}

func TestSetRequestID(t *testing.T) {
	err := NewBadRequest("test error")
	requestID := "req-12345"

	result := err.SetRequestID(requestID)

	if result.RequestID != requestID {
		t.Errorf("RequestID = %s, expected %s", result.RequestID, requestID)
	}
	// Verify that the method returns the same error (chainable)
	if result != err {
		t.Error("SetRequestID should return the same error for chaining")
	}
}

func TestAddDetail(t *testing.T) {
	err := NewBadRequest("test error")

	result := err.AddDetail("field1", "value1").AddDetail("field2", "value2")

	if result.Details == nil {
		t.Fatal("Details map is nil")
	}
	if result.Details["field1"] != "value1" {
		t.Errorf("Details[field1] = %s, expected value1", result.Details["field1"])
	}
	if result.Details["field2"] != "value2" {
		t.Errorf("Details[field2] = %s, expected value2", result.Details["field2"])
	}
}

func TestWriteError(t *testing.T) {
	err := NewBadRequest("invalid input")
	err.SetRequestID("req-123")

	w := httptest.NewRecorder()
	WriteError(w, err)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status code = %d, expected %d", w.Code, http.StatusBadRequest)
	}

	if w.Header().Get("Content-Type") != "application/json" {
		t.Errorf("Content-Type = %s, expected application/json", w.Header().Get("Content-Type"))
	}

	var response APIError
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Code != ErrBadRequest {
		t.Errorf("Response Code = %v, expected %v", response.Code, ErrBadRequest)
	}
	if response.Message != "invalid input" {
		t.Errorf("Response Message = %s, expected invalid input", response.Message)
	}
	if response.RequestID != "req-123" {
		t.Errorf("Response RequestID = %s, expected req-123", response.RequestID)
	}
}

func TestErrorResponse(t *testing.T) {
	w := httptest.NewRecorder()
	ErrorResponse(w, http.StatusBadRequest, ErrBadRequest, "invalid input")

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status code = %d, expected %d", w.Code, http.StatusBadRequest)
	}

	var response APIError
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Code != ErrBadRequest {
		t.Errorf("Response Code = %v, expected %v", response.Code, ErrBadRequest)
	}
}

func TestErrorResponseWithDetails(t *testing.T) {
	details := map[string]string{
		"field1": "required",
		"field2": "invalid format",
	}

	w := httptest.NewRecorder()
	ErrorResponseWithDetails(w, http.StatusBadRequest, ErrValidation, "validation failed", details)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Status code = %d, expected %d", w.Code, http.StatusBadRequest)
	}

	var response APIError
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if response.Code != ErrValidation {
		t.Errorf("Response Code = %v, expected %v", response.Code, ErrValidation)
	}
	if len(response.Details) != len(details) {
		t.Errorf("Response Details length = %d, expected %d", len(response.Details), len(details))
	}
}

func TestAPIErrorJSONMarshaling(t *testing.T) {
	errObj := NewBadRequest("test error")
	errObj.SetRequestID("req-456")
	errObj.AddDetail("key", "value")

	data, err := json.Marshal(errObj)
	if err != nil {
		t.Fatalf("Failed to marshal error: %v", err)
	}

	var unmarshaled APIError
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("Failed to unmarshal error: %v", err)
	}

	if unmarshaled.Code != ErrBadRequest {
		t.Errorf("Unmarshaled Code = %v, expected %v", unmarshaled.Code, ErrBadRequest)
	}
	if unmarshaled.Message != "test error" {
		t.Errorf("Unmarshaled Message = %s, expected test error", unmarshaled.Message)
	}
	if unmarshaled.RequestID != "req-456" {
		t.Errorf("Unmarshaled RequestID = %s, expected req-456", unmarshaled.RequestID)
	}
}
