package middleware

import (
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

type ResponseWriter struct {
	http.ResponseWriter
	statusCode int
	written    bool
}

func (rw *ResponseWriter) WriteHeader(statusCode int) {
	if !rw.written {
		rw.statusCode = statusCode
		rw.written = true
		rw.ResponseWriter.WriteHeader(statusCode)
	}
}

func (rw *ResponseWriter) Write(b []byte) (int, error) {
	if !rw.written {
		rw.statusCode = http.StatusOK
		rw.written = true
	}
	return rw.ResponseWriter.Write(b)
}

func RequestLogger() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Generate request ID
			requestID := r.Header.Get("X-Request-ID")
			if requestID == "" {
				requestID = uuid.New().String()
			}

			// Extract user ID if authenticated
			userID, _ := r.Context().Value("user_id").(string)

			// Wrap response writer to capture status code
			wrapped := &ResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}

			// Start timer
			start := time.Now()

			// Call next handler
			next.ServeHTTP(wrapped, r)

			// Log request
			duration := time.Since(start)

			logger := log.With().
				Str("request_id", requestID).
				Str("method", r.Method).
				Str("path", r.RequestURI).
				Int("status", wrapped.statusCode).
				Dur("duration_ms", duration).
				Str("remote_addr", getClientIP(r))

			if userID != "" {
				logger = logger.Str("user_id", userID)
			}

			// Log at appropriate level based on status
			l := logger.Logger()
			switch {
			case wrapped.statusCode < 400:
				l.Info().Msg("request completed")
			case wrapped.statusCode < 500:
				l.Warn().Msg("client error")
			default:
				l.Error().Msg("server error")
			}
		})
	}
}

