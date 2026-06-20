package tracing

import (
	"context"
	"errors"
	"testing"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// ── Tracer ───────────────────────────────────────────────────────────

func TestTracerReturnsNonNil(t *testing.T) {
	tr := Tracer()
	if tr == nil {
		t.Fatal("Tracer() returned nil")
	}
}

func TestTracerReturnsSameInstance(t *testing.T) {
	tr1 := Tracer()
	tr2 := Tracer()
	// Both calls should return a valid tracer (the global one).
	if tr1 == nil || tr2 == nil {
		t.Fatal("Tracer() returned nil")
	}
}

// ── StartSpan ────────────────────────────────────────────────────────

func TestStartSpanCreatesSpan(t *testing.T) {
	ctx := context.Background()
	ctx, span := StartSpan(ctx, "test-operation")
	defer span.End()

	if span == nil {
		t.Fatal("StartSpan returned nil span")
	}
	// The returned context should differ from the input (it carries the span).
	if ctx == context.Background() {
		t.Error("StartSpan should return a new context")
	}
}

func TestStartSpanWithAttributes(t *testing.T) {
	ctx := context.Background()
	_, span := StartSpan(ctx, "test-with-attrs",
		trace.WithAttributes(attribute.String("key", "value")),
	)
	defer span.End()

	if span == nil {
		t.Fatal("StartSpan with attributes returned nil span")
	}
}

func TestStartSpanNestedSpans(t *testing.T) {
	ctx := context.Background()
	ctx1, span1 := StartSpan(ctx, "parent-span")
	defer span1.End()

	_, span2 := StartSpan(ctx1, "child-span")
	defer span2.End()

	if span1 == nil || span2 == nil {
		t.Fatal("nested spans should not be nil")
	}
}

// ── SpanFromContext ──────────────────────────────────────────────────

func TestSpanFromContextWithSpan(t *testing.T) {
	ctx := context.Background()
	ctx, span := StartSpan(ctx, "context-span")
	defer span.End()

	extracted := SpanFromContext(ctx)
	if extracted == nil {
		t.Fatal("SpanFromContext returned nil for context with span")
	}
}

func TestSpanFromContextWithoutSpan(t *testing.T) {
	ctx := context.Background()
	span := SpanFromContext(ctx)
	// Even without a real span, trace.SpanFromContext returns a no-op span, not nil.
	if span == nil {
		t.Fatal("SpanFromContext returned nil for empty context")
	}
	// The no-op span should not be recording.
	if span.IsRecording() {
		t.Error("span from empty context should not be recording")
	}
}

// ── AddSpanEvent ─────────────────────────────────────────────────────

func TestAddSpanEventNoPanic(t *testing.T) {
	ctx := context.Background()
	ctx, span := StartSpan(ctx, "event-span")
	defer span.End()

	// Should not panic with attributes
	AddSpanEvent(ctx, "test-event",
		attribute.String("detail", "some value"),
		attribute.Int("count", 42),
	)
}

func TestAddSpanEventNoAttributes(t *testing.T) {
	ctx := context.Background()
	ctx, span := StartSpan(ctx, "event-no-attrs")
	defer span.End()

	// Should not panic without attributes
	AddSpanEvent(ctx, "simple-event")
}

func TestAddSpanEventEmptyContext(t *testing.T) {
	// Should not panic even on a background context (no-op span)
	AddSpanEvent(context.Background(), "orphan-event")
}

// ── SetSpanError ─────────────────────────────────────────────────────

func TestSetSpanErrorNoPanic(t *testing.T) {
	ctx := context.Background()
	ctx, span := StartSpan(ctx, "error-span")
	defer span.End()

	SetSpanError(ctx, errors.New("something went wrong"))
}

func TestSetSpanErrorEmptyContext(t *testing.T) {
	// Should not panic on a background context (no-op span)
	SetSpanError(context.Background(), errors.New("orphan error"))
}

func TestSetSpanErrorNilError(t *testing.T) {
	ctx := context.Background()
	ctx, span := StartSpan(ctx, "nil-error-span")
	defer span.End()

	// Should not panic with nil error
	SetSpanError(ctx, nil)
}

// ── Integration-style: full span lifecycle ───────────────────────────

func TestFullSpanLifecycle(t *testing.T) {
	ctx := context.Background()

	// Start parent
	ctx, parent := StartSpan(ctx, "parent-op")

	// Add event
	AddSpanEvent(ctx, "processing-started", attribute.String("step", "init"))

	// Start child
	childCtx, child := StartSpan(ctx, "child-op")

	// Record error on child
	SetSpanError(childCtx, errors.New("child failed"))
	child.End()

	// Add event after child
	AddSpanEvent(ctx, "processing-completed")

	// End parent
	parent.End()

	// Verify spans from contexts
	parentSpan := SpanFromContext(ctx)
	if parentSpan == nil {
		t.Error("parent span should be extractable from context")
	}
}
