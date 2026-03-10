package middleware

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// ValidateUUIDParam validates that a path parameter is a valid UUID
// DV-003 FIX: Ensure UUID path parameters are validated before reaching handlers
func ValidateUUIDParam(paramName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			paramValue := r.PathValue(paramName)
			if paramValue == "" {
				http.Error(w, paramName+" is required", http.StatusBadRequest)
				return
			}
			if _, err := uuid.Parse(paramValue); err != nil {
				log.Debug().Str("param", paramName).Str("value", paramValue).Msg("DV-003 FIX: invalid UUID parameter")
				http.Error(w, "invalid "+paramName+" format", http.StatusBadRequest)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ValidateContentType validates that the request Content-Type matches expected type
// DV-007 FIX: Ensure request Content-Type is validated
func ValidateContentType(expected string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Skip for GET, HEAD, DELETE, OPTIONS
			if r.Method == http.MethodGet || r.Method == http.MethodHead ||
				r.Method == http.MethodDelete || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			ct := r.Header.Get("Content-Type")
			if ct == "" || (ct != expected && ct != expected+"; charset=utf-8") {
				http.Error(w, "Content-Type must be "+expected, http.StatusUnsupportedMediaType)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
