package middleware

import (
	"net/http"

	"github.com/rs/zerolog/log"
)

// MEDIUM-FIX: ErrorResponse provides a centralized way to handle error responses
// It logs the full error internally but returns a sanitized message to the client
// to prevent exposing sensitive internal details
func ErrorResponse(w http.ResponseWriter, code int, publicMessage string, err error) {
	// Log full error internally with all details
	if err != nil {
		log.Error().
			Err(err).
			Int("status_code", code).
			Str("public_message", publicMessage).
			Msg("error response")
	} else {
		log.Warn().
			Int("status_code", code).
			Str("public_message", publicMessage).
			Msg("error response")
	}

	// Return sanitized error to client (never expose internal details)
	w.Header().Set("Content-Type", "application/json")
	http.Error(w, publicMessage, code)
}

// ErrorResponseWithDetails provides error response with additional context fields
// Useful for logging structured information while keeping the response sanitized
func ErrorResponseWithDetails(w http.ResponseWriter, code int, publicMessage string, err error, details map[string]interface{}) {
	// Log full error internally with structured details
	logger := log.Error().
		Int("status_code", code).
		Str("public_message", publicMessage)

	if err != nil {
		logger = logger.Err(err)
	}

	for key, value := range details {
		logger = logger.Any(key, value)
	}

	logger.Msg("error response with details")

	// Return sanitized error to client (never expose internal details)
	w.Header().Set("Content-Type", "application/json")
	http.Error(w, publicMessage, code)
}
