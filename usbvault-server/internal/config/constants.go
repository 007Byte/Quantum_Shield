package config

import "time"

// PH4-FIX: Centralized constants — no more magic numbers
// All hardcoded values extracted to named constants for clarity and maintainability

// Security Limits
const (
	MaxLoginAttempts      = 10
	LockoutDuration       = 15 * time.Minute
	MaxConnectionsPerUser = 5
	MaxRequestBodyBytes   = 10 * 1024 * 1024  // 10 MB
	MaxMetadataBytes      = 64 * 1024         // 64 KB
	MaxFileSize           = 5 * 1024 * 1024 * 1024 // 5 GB
)

// Token Configuration
const (
	AccessTokenTTL        = 15 * time.Minute
	RefreshTokenTTL       = 7 * 24 * time.Hour
	JWTKeyRotationInterval = 90 * 24 * time.Hour
	JWTKeyGracePeriod     = 60 * 24 * time.Hour
)

// Rate Limiting
const (
	RateLimitWindow      = 60 * time.Second
	RateLimitMaxRequests = 100
	AuthRateLimitMax     = 5
)

// WebSocket
const (
	WSPingInterval      = 30 * time.Second
	WSPongTimeout       = 10 * time.Second
	WSMaxMissedPongs    = 3
	WSIdleTimeout       = 5 * time.Minute
	WSReadLimit         = 64 * 1024  // 64 KB
	WSEventReplayMax    = 1000
	WSEventRetentionTTL = 24 * time.Hour
)

// Database
const (
	DBMaxConnections      = 50
	DBMinConnections      = 5
	DBConnectionMaxLife   = 30 * time.Minute
	DBConnectionMaxIdle   = 5 * time.Minute
	DBHealthCheckInterval = 30 * time.Second
)

// Circuit Breaker
const (
	CBMaxFailures       = 5
	CBResetTimeout      = 30 * time.Second
	CBRedisMaxFailures  = 3
	CBRedisResetTimeout = 15 * time.Second
)

// S3 / Storage
const (
	S3MultipartChunkSize = 64 * 1024 * 1024  // 64 MB
	S3PresignedURLTTL    = 15 * time.Minute
	S3MultipartTTL       = 24 * time.Hour
)

// Backup & Retention
const (
	BackupRetentionDays   = 30
	AuditLogRetentionDays = 365
	RotatedKeyRetention   = 60 * 24 * time.Hour
)

// Sharing
const (
	DefaultShareTTL     = 7 * 24 * time.Hour
	MaxSharesPerVault   = 100
)
