// Package apierrors provides standardized error types and responses for API operations.
//
// PH4-FIX: Structured error catalog for standardized API error responses.
// This package defines a comprehensive set of typed error codes and response structures
// to ensure consistent error handling across the API layer. All exported error types
// are intended for use in HTTP handlers and API responses.
package apierrors

import (
	"encoding/json"
	"net/http"
)

// ErrorCode represents a typed API error category.
// Standard HTTP error codes are mapped to business-specific error categories
// for more granular error handling on the client side.
type ErrorCode string

const (
	ErrBadRequest          ErrorCode = "BAD_REQUEST"
	ErrUnauthorized        ErrorCode = "UNAUTHORIZED"
	ErrForbidden           ErrorCode = "FORBIDDEN"
	ErrNotFound            ErrorCode = "NOT_FOUND"
	ErrConflict            ErrorCode = "CONFLICT"
	ErrRateLimited         ErrorCode = "RATE_LIMITED"
	ErrPaymentRequired     ErrorCode = "PAYMENT_REQUIRED"
	ErrValidation          ErrorCode = "VALIDATION_ERROR"
	ErrInternal            ErrorCode = "INTERNAL_ERROR"
	ErrServiceUnavailable  ErrorCode = "SERVICE_UNAVAILABLE"
	ErrInvalidInput        ErrorCode = "INVALID_INPUT"
	ErrDuplicateEntry      ErrorCode = "DUPLICATE_ENTRY"
	ErrResourceExhausted   ErrorCode = "RESOURCE_EXHAUSTED"
	ErrPreconditionFailed  ErrorCode = "PRECONDITION_FAILED"
	ErrEncryptionFailed    ErrorCode = "ENCRYPTION_FAILED"
	ErrDecryptionFailed    ErrorCode = "DECRYPTION_FAILED"
	ErrKeyRotationFailed   ErrorCode = "KEY_ROTATION_FAILED"
	ErrAttestationFailed   ErrorCode = "ATTESTATION_FAILED"
	ErrQuotaExceeded       ErrorCode = "QUOTA_EXCEEDED"
	ErrFeatureDisabled     ErrorCode = "FEATURE_DISABLED"
)

// APIError is the standardized error response structure used in all API responses.
// It includes a typed error code, human-readable message, optional details for validation
// errors, and a request ID for tracing. StatusCode maps to HTTP status codes.
//
// Fields:
//   - Code: Machine-readable error code for client-side handling
//   - Message: Human-readable error message
//   - Details: Additional context for validation errors (field name -> error reason)
//   - RequestID: Unique request identifier for error tracking and debugging
//   - StatusCode: HTTP status code (not included in JSON response)
type APIError struct {
	Code       ErrorCode         `json:"code"`
	Message    string            `json:"message"`
	Details    map[string]string `json:"details,omitempty"`
	RequestID  string            `json:"request_id,omitempty"`
	StatusCode int               `json:"-"`
}

// Error implements the error interface for APIError, returning a string representation
// in the format "CODE: message" for logging and debugging purposes.
func (e *APIError) Error() string {
	return string(e.Code) + ": " + e.Message
}

// NewBadRequest creates a BAD_REQUEST error (HTTP 400) for malformed client requests.
func NewBadRequest(msg string) *APIError {
	return &APIError{Code: ErrBadRequest, Message: msg, StatusCode: http.StatusBadRequest}
}

// NewUnauthorized creates an UNAUTHORIZED error (HTTP 401) for missing/invalid authentication.
func NewUnauthorized(msg string) *APIError {
	return &APIError{Code: ErrUnauthorized, Message: msg, StatusCode: http.StatusUnauthorized}
}

// NewForbidden creates a FORBIDDEN error (HTTP 403) when user lacks required permissions.
func NewForbidden(msg string) *APIError {
	return &APIError{Code: ErrForbidden, Message: msg, StatusCode: http.StatusForbidden}
}

// NewNotFound creates a NOT_FOUND error (HTTP 404) when requested resource doesn't exist.
func NewNotFound(msg string) *APIError {
	return &APIError{Code: ErrNotFound, Message: msg, StatusCode: http.StatusNotFound}
}

// NewConflict creates a CONFLICT error (HTTP 409) for conflicting resource states.
func NewConflict(msg string) *APIError {
	return &APIError{Code: ErrConflict, Message: msg, StatusCode: http.StatusConflict}
}

// NewRateLimited creates a RATE_LIMITED error (HTTP 429) when request quota is exceeded.
func NewRateLimited(msg string) *APIError {
	return &APIError{Code: ErrRateLimited, Message: msg, StatusCode: http.StatusTooManyRequests}
}

// NewInternal creates an INTERNAL_ERROR (HTTP 500) for unexpected server errors.
func NewInternal(msg string) *APIError {
	return &APIError{Code: ErrInternal, Message: msg, StatusCode: http.StatusInternalServerError}
}

// NewValidation creates a VALIDATION_ERROR (HTTP 400) for input validation failures.
// The details map provides field-specific error information.
func NewValidation(msg string, details map[string]string) *APIError {
	return &APIError{Code: ErrValidation, Message: msg, Details: details, StatusCode: http.StatusBadRequest}
}

// NewPaymentRequired creates a PAYMENT_REQUIRED error (HTTP 402) when payment is needed.
func NewPaymentRequired(msg string) *APIError {
	return &APIError{Code: ErrPaymentRequired, Message: msg, StatusCode: http.StatusPaymentRequired}
}

// NewServiceUnavailable creates a SERVICE_UNAVAILABLE error (HTTP 503) for downstream failures.
func NewServiceUnavailable(msg string) *APIError {
	return &APIError{Code: ErrServiceUnavailable, Message: msg, StatusCode: http.StatusServiceUnavailable}
}

// NewEncryptionFailed creates an ENCRYPTION_FAILED error (HTTP 500) for encryption operation failures.
func NewEncryptionFailed(msg string) *APIError {
	return &APIError{Code: ErrEncryptionFailed, Message: msg, StatusCode: http.StatusInternalServerError}
}

// NewDecryptionFailed creates a DECRYPTION_FAILED error (HTTP 500) for decryption operation failures.
func NewDecryptionFailed(msg string) *APIError {
	return &APIError{Code: ErrDecryptionFailed, Message: msg, StatusCode: http.StatusInternalServerError}
}

// NewDuplicateEntry creates a DUPLICATE_ENTRY error (HTTP 409) when creating duplicate resources.
func NewDuplicateEntry(msg string) *APIError {
	return &APIError{Code: ErrDuplicateEntry, Message: msg, StatusCode: http.StatusConflict}
}

// WriteError writes a standardized error response to the ResponseWriter with appropriate
// HTTP status code and JSON-encoded APIError body. Always called in HTTP handlers.
func WriteError(w http.ResponseWriter, err *APIError) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(err.StatusCode)
	json.NewEncoder(w).Encode(err)
}

// ErrorResponse writes a quick inline error response with a specified error code and message.
// Useful for simple error responses without additional details.
func ErrorResponse(w http.ResponseWriter, statusCode int, code ErrorCode, message string) {
	err := &APIError{
		Code:       code,
		Message:    message,
		StatusCode: statusCode,
	}
	WriteError(w, err)
}

// ErrorResponseWithDetails writes an error response that includes a details map for providing
// field-specific error information (e.g., validation errors).
func ErrorResponseWithDetails(w http.ResponseWriter, statusCode int, code ErrorCode, message string, details map[string]string) {
	err := &APIError{
		Code:       code,
		Message:    message,
		Details:    details,
		StatusCode: statusCode,
	}
	WriteError(w, err)
}

// SetRequestID adds a request ID to the error for tracing and logging purposes.
// Returns the error for method chaining.
func (e *APIError) SetRequestID(requestID string) *APIError {
	e.RequestID = requestID
	return e
}

// AddDetail adds a key-value pair to the error's Details map, creating the map if needed.
// Typically used to add field-specific validation error information.
// Returns the error for method chaining.
func (e *APIError) AddDetail(key, value string) *APIError {
	if e.Details == nil {
		e.Details = make(map[string]string)
	}
	e.Details[key] = value
	return e
}
