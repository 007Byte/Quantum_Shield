package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// PH2-FIX: Prometheus business metrics instrumentation

var (
	// HTTP request metrics
	HTTPRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "qav_http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "path", "status"},
	)

	HTTPRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "qav_http_request_duration_seconds",
			Help:    "HTTP request latency in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	// Vault business metrics
	VaultOpsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "qav_vault_operations_total",
			Help: "Total vault operations (create, read, update, delete)",
		},
		[]string{"operation"},
	)

	VaultCount = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "qav_vaults_total",
			Help: "Current total number of vaults",
		},
	)

	// Upload metrics
	UploadDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "qav_upload_duration_seconds",
			Help:    "File upload duration in seconds",
			Buckets: []float64{0.1, 0.5, 1, 2, 5, 10, 30, 60},
		},
	)

	UploadSizeBytes = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "qav_upload_size_bytes",
			Help:    "File upload size in bytes",
			Buckets: prometheus.ExponentialBuckets(1024, 4, 10), // 1KB to ~256MB
		},
	)

	// Encryption metrics
	EncryptionDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "qav_encryption_duration_seconds",
			Help:    "Encryption/decryption operation latency",
			Buckets: []float64{0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1},
		},
		[]string{"operation"}, // "encrypt" or "decrypt"
	)

	// Rate limiting metrics
	RateLimitHitsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "qav_rate_limit_hits_total",
			Help: "Total rate limit hits",
		},
		[]string{"endpoint", "outcome"}, // outcome: "allowed" or "rejected"
	)

	// Key rotation metrics
	KeyRotationOpsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "qav_key_rotation_operations_total",
			Help: "Total key rotation operations",
		},
		[]string{"status"}, // "started", "completed", "failed"
	)

	// Audit log metrics
	AuditLogSize = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "qav_audit_log_entries_total",
			Help: "Current total number of audit log entries",
		},
	)

	SecurityEventsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "qav_security_events_total",
			Help: "Total security events by type and severity",
		},
		[]string{"event_type", "severity"},
	)

	// WebSocket metrics
	WebSocketConnections = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "qav_websocket_connections_active",
			Help: "Current active WebSocket connections",
		},
	)

	WebSocketMessagesTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "qav_websocket_messages_total",
			Help: "Total WebSocket messages",
		},
		[]string{"direction", "type"}, // direction: "inbound"/"outbound", type: "sync"/"ping"/"pong"
	)

	// Auth metrics
	AuthAttemptsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "qav_auth_attempts_total",
			Help: "Total authentication attempts",
		},
		[]string{"method", "outcome"}, // method: "srp"/"fido2", outcome: "success"/"failure"
	)

	// Circuit breaker metrics
	CircuitBreakerState = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "qav_circuit_breaker_state",
			Help: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
		},
		[]string{"service"}, // "database", "redis", "s3"
	)

	// Subscription metrics
	ActiveSubscriptions = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "qav_active_subscriptions",
			Help: "Active subscriptions by tier",
		},
		[]string{"tier"},
	)
)
