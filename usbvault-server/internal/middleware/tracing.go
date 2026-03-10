package middleware

import (
	"net/http"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
	"go.opentelemetry.io/otel/trace"
)

// PH2-FIX: HTTP tracing middleware for OpenTelemetry

// TracingMiddleware extracts/injects trace context and creates spans for HTTP requests
func TracingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		propagator := otel.GetTextMapPropagator()
		ctx := propagator.Extract(r.Context(), propagation.HeaderCarrier(r.Header))

		tracer := otel.Tracer("qav-server-http")
		spanName := r.Method + " " + r.URL.Path

		ctx, span := tracer.Start(ctx, spanName,
			trace.WithAttributes(
				semconv.HTTPMethod(r.Method),
				semconv.HTTPTarget(r.URL.Path),
				semconv.HTTPScheme(r.URL.Scheme),
				attribute.String("http.client_ip", r.RemoteAddr),
			),
			trace.WithSpanKind(trace.SpanKindServer),
		)
		defer span.End()

		// Wrap response writer to capture status code
		wrapped := &statusResponseWriter{ResponseWriter: w, statusCode: 200}
		next.ServeHTTP(wrapped, r.WithContext(ctx))

		span.SetAttributes(semconv.HTTPStatusCode(wrapped.statusCode))
		if wrapped.statusCode >= 400 {
			span.SetAttributes(attribute.Bool("error", true))
		}
	})
}

type statusResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (w *statusResponseWriter) WriteHeader(code int) {
	w.statusCode = code
	w.ResponseWriter.WriteHeader(code)
}
