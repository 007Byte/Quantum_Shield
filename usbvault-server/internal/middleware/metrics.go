package middleware

// PH2-FIX: Prometheus HTTP metrics middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/usbvault/usbvault-server/internal/metrics"
)

// MetricsMiddleware records HTTP metrics for Prometheus scraping
// PH2-FIX: Production monitoring with request counting and latency tracking
func MetricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Wrap response writer to capture status code
		wrapped := &metricsResponseWriter{ResponseWriter: w, statusCode: 200}

		next.ServeHTTP(wrapped, r)

		duration := time.Since(start).Seconds()

		// Normalize path to avoid cardinality explosion
		path := normalizePath(r.URL.Path)

		metrics.HTTPRequestsTotal.WithLabelValues(r.Method, path, strconv.Itoa(wrapped.statusCode)).Inc()
		metrics.HTTPRequestDuration.WithLabelValues(r.Method, path).Observe(duration)
	})
}

type metricsResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (w *metricsResponseWriter) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}

// normalizePath reduces path cardinality by replacing UUIDs and IDs
func normalizePath(path string) string {
	// Replace UUID patterns with :id
	// Simple heuristic: segments that are 36 chars (UUID) or purely numeric
	parts := splitPath(path)
	for i, part := range parts {
		if len(part) == 36 || isNumeric(part) {
			parts[i] = ":id"
		}
	}
	return joinPath(parts)
}

func splitPath(path string) []string {
	result := []string{}
	current := ""
	for _, c := range path {
		if c == '/' {
			if current != "" {
				result = append(result, current)
				current = ""
			}
		} else {
			current += string(c)
		}
	}
	if current != "" {
		result = append(result, current)
	}
	return result
}

func joinPath(parts []string) string {
	if len(parts) == 0 {
		return "/"
	}
	result := ""
	for _, p := range parts {
		result += "/" + p
	}
	return result
}

func isNumeric(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return len(s) > 0
}
