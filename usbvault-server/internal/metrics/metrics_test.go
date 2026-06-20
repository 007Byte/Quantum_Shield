package metrics

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus"
	dto "github.com/prometheus/client_model/go"
)

// ── Metric variables are non-nil ─────────────────────────────────────

func TestMetricsNonNil(t *testing.T) {
	vars := map[string]interface{}{
		"HTTPRequestsTotal":      HTTPRequestsTotal,
		"HTTPRequestDuration":    HTTPRequestDuration,
		"VaultOpsTotal":          VaultOpsTotal,
		"VaultCount":             VaultCount,
		"UploadDuration":         UploadDuration,
		"UploadSizeBytes":        UploadSizeBytes,
		"EncryptionDuration":     EncryptionDuration,
		"RateLimitHitsTotal":     RateLimitHitsTotal,
		"KeyRotationOpsTotal":    KeyRotationOpsTotal,
		"AuditLogSize":           AuditLogSize,
		"SecurityEventsTotal":    SecurityEventsTotal,
		"WebSocketConnections":   WebSocketConnections,
		"WebSocketMessagesTotal": WebSocketMessagesTotal,
		"AuthAttemptsTotal":      AuthAttemptsTotal,
		"CircuitBreakerState":    CircuitBreakerState,
		"ActiveSubscriptions":    ActiveSubscriptions,
	}

	for name, v := range vars {
		if v == nil {
			t.Errorf("metric %s is nil", name)
		}
	}
}

// ── Metric descriptions are non-empty ────────────────────────────────

func descFromCollector(c prometheus.Collector) *prometheus.Desc {
	ch := make(chan *prometheus.Desc, 1)
	c.Describe(ch)
	return <-ch
}

func TestMetricDescriptionsNonEmpty(t *testing.T) {
	collectors := map[string]prometheus.Collector{
		"HTTPRequestsTotal":      HTTPRequestsTotal,
		"HTTPRequestDuration":    HTTPRequestDuration,
		"VaultOpsTotal":          VaultOpsTotal,
		"VaultCount":             VaultCount,
		"UploadDuration":         UploadDuration,
		"UploadSizeBytes":        UploadSizeBytes,
		"EncryptionDuration":     EncryptionDuration,
		"RateLimitHitsTotal":     RateLimitHitsTotal,
		"KeyRotationOpsTotal":    KeyRotationOpsTotal,
		"AuditLogSize":           AuditLogSize,
		"SecurityEventsTotal":    SecurityEventsTotal,
		"WebSocketConnections":   WebSocketConnections,
		"WebSocketMessagesTotal": WebSocketMessagesTotal,
		"AuthAttemptsTotal":      AuthAttemptsTotal,
		"CircuitBreakerState":    CircuitBreakerState,
		"ActiveSubscriptions":    ActiveSubscriptions,
	}

	for name, c := range collectors {
		desc := descFromCollector(c)
		if desc == nil {
			t.Errorf("metric %s has nil Desc", name)
			continue
		}
		if desc.String() == "" {
			t.Errorf("metric %s has empty description", name)
		}
	}
}

// ── Counter operations don't panic ───────────────────────────────────

func TestHTTPRequestsTotalIncrement(t *testing.T) {
	HTTPRequestsTotal.WithLabelValues("GET", "/api/test", "200").Inc()
	// no panic = pass
}

func TestVaultOpsTotalIncrement(t *testing.T) {
	VaultOpsTotal.WithLabelValues("create").Inc()
}

func TestRateLimitHitsTotalIncrement(t *testing.T) {
	RateLimitHitsTotal.WithLabelValues("/api/login", "rejected").Inc()
}

func TestKeyRotationOpsTotalIncrement(t *testing.T) {
	KeyRotationOpsTotal.WithLabelValues("completed").Inc()
}

func TestSecurityEventsTotalIncrement(t *testing.T) {
	SecurityEventsTotal.WithLabelValues("brute_force", "high").Inc()
}

func TestWebSocketMessagesTotalIncrement(t *testing.T) {
	WebSocketMessagesTotal.WithLabelValues("inbound", "sync").Inc()
}

func TestAuthAttemptsTotalIncrement(t *testing.T) {
	AuthAttemptsTotal.WithLabelValues("srp", "success").Inc()
}

// ── Histogram operations don't panic ─────────────────────────────────

func TestHTTPRequestDurationObserve(t *testing.T) {
	HTTPRequestDuration.WithLabelValues("GET", "/api/test").Observe(0.123)
}

func TestUploadDurationObserve(t *testing.T) {
	UploadDuration.Observe(1.5)
}

func TestUploadSizeBytesObserve(t *testing.T) {
	UploadSizeBytes.Observe(4096)
}

func TestEncryptionDurationObserve(t *testing.T) {
	EncryptionDuration.WithLabelValues("encrypt").Observe(0.01)
	EncryptionDuration.WithLabelValues("decrypt").Observe(0.02)
}

// ── Gauge operations don't panic ─────────────────────────────────────

func TestVaultCountSetAndGet(t *testing.T) {
	VaultCount.Set(42)

	m := &dto.Metric{}
	if err := VaultCount.Write(m); err != nil {
		t.Fatalf("failed to write metric: %v", err)
	}
	if m.Gauge == nil {
		t.Fatal("expected gauge metric")
	}
	if *m.Gauge.Value != 42 {
		t.Errorf("expected gauge value 42, got %f", *m.Gauge.Value)
	}
}

func TestAuditLogSizeSet(t *testing.T) {
	AuditLogSize.Set(1000)

	m := &dto.Metric{}
	if err := AuditLogSize.Write(m); err != nil {
		t.Fatalf("failed to write metric: %v", err)
	}
	if m.Gauge == nil {
		t.Fatal("expected gauge metric")
	}
	if *m.Gauge.Value != 1000 {
		t.Errorf("expected gauge value 1000, got %f", *m.Gauge.Value)
	}
}

func TestWebSocketConnectionsGauge(t *testing.T) {
	WebSocketConnections.Set(0)
	WebSocketConnections.Inc()
	WebSocketConnections.Inc()
	WebSocketConnections.Dec()

	m := &dto.Metric{}
	if err := WebSocketConnections.Write(m); err != nil {
		t.Fatalf("failed to write metric: %v", err)
	}
	if *m.Gauge.Value != 1 {
		t.Errorf("expected gauge value 1, got %f", *m.Gauge.Value)
	}
}

func TestCircuitBreakerStateSet(t *testing.T) {
	CircuitBreakerState.WithLabelValues("database").Set(0) // closed
	CircuitBreakerState.WithLabelValues("redis").Set(1)    // open
	CircuitBreakerState.WithLabelValues("s3").Set(2)       // half-open
}

func TestActiveSubscriptionsSet(t *testing.T) {
	ActiveSubscriptions.WithLabelValues("free").Set(100)
	ActiveSubscriptions.WithLabelValues("pro").Set(50)
	ActiveSubscriptions.WithLabelValues("enterprise").Set(10)
}

// ── Type correctness (verify counter vs gauge vs histogram) ──────────

func TestCounterVecType(t *testing.T) {
	// CounterVec metrics should produce Counter type when collecting
	counter := HTTPRequestsTotal.WithLabelValues("POST", "/test", "201")
	counter.Inc()

	m := &dto.Metric{}
	if err := counter.(prometheus.Metric).Write(m); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	if m.Counter == nil {
		t.Error("HTTPRequestsTotal should be a counter type")
	}
}

func TestHistogramVecType(t *testing.T) {
	obs := HTTPRequestDuration.WithLabelValues("DELETE", "/test")
	obs.Observe(0.5)

	m := &dto.Metric{}
	if err := obs.(prometheus.Metric).Write(m); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	if m.Histogram == nil {
		t.Error("HTTPRequestDuration should be a histogram type")
	}
}

func TestGaugeType(t *testing.T) {
	VaultCount.Set(10)
	m := &dto.Metric{}
	if err := VaultCount.Write(m); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	if m.Gauge == nil {
		t.Error("VaultCount should be a gauge type")
	}
}

func TestPlainHistogramType(t *testing.T) {
	UploadDuration.Observe(2.0)
	m := &dto.Metric{}
	if err := UploadDuration.(prometheus.Metric).Write(m); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	if m.Histogram == nil {
		t.Error("UploadDuration should be a histogram type")
	}
}
