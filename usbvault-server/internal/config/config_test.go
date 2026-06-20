package config

import (
	"os"
	"testing"
	"time"
)

// ---------------------------------------------------------------------------
// GetEnvOrDefault tests
// ---------------------------------------------------------------------------

func TestGetEnvOrDefault_ReturnsSetValue(t *testing.T) {
	const key = "TEST_CONFIG_GET_ENV_SET"
	const expected = "my-custom-value"
	os.Setenv(key, expected)
	defer os.Unsetenv(key)

	got := GetEnvOrDefault(key, "fallback")
	if got != expected {
		t.Errorf("GetEnvOrDefault(%q, ...) = %q, want %q", key, got, expected)
	}
}

func TestGetEnvOrDefault_ReturnsDefaultWhenUnset(t *testing.T) {
	const key = "TEST_CONFIG_GET_ENV_UNSET_12345"
	os.Unsetenv(key) // make sure it is not set

	got := GetEnvOrDefault(key, "default-val")
	if got != "default-val" {
		t.Errorf("GetEnvOrDefault(%q, \"default-val\") = %q, want \"default-val\"", key, got)
	}
}

func TestGetEnvOrDefault_ReturnsDefaultWhenEmpty(t *testing.T) {
	const key = "TEST_CONFIG_GET_ENV_EMPTY"
	os.Setenv(key, "")
	defer os.Unsetenv(key)

	got := GetEnvOrDefault(key, "fallback")
	if got != "fallback" {
		t.Errorf("GetEnvOrDefault(%q, \"fallback\") = %q, want \"fallback\" (empty env should use default)", key, got)
	}
}

// ---------------------------------------------------------------------------
// ValidateRequiredEnvVars tests
// ---------------------------------------------------------------------------

func TestValidateRequiredEnvVars_SucceedsWhenDatabaseURLSet(t *testing.T) {
	old := os.Getenv("DATABASE_URL")
	os.Setenv("DATABASE_URL", "postgres://localhost:5432/test")
	defer func() {
		if old == "" {
			os.Unsetenv("DATABASE_URL")
		} else {
			os.Setenv("DATABASE_URL", old)
		}
	}()

	if err := ValidateRequiredEnvVars(); err != nil {
		t.Errorf("ValidateRequiredEnvVars() returned error when DATABASE_URL is set: %v", err)
	}
}

func TestValidateRequiredEnvVars_FailsWhenDatabaseURLMissing(t *testing.T) {
	old := os.Getenv("DATABASE_URL")
	os.Unsetenv("DATABASE_URL")
	defer func() {
		if old != "" {
			os.Setenv("DATABASE_URL", old)
		}
	}()

	err := ValidateRequiredEnvVars()
	if err == nil {
		t.Error("ValidateRequiredEnvVars() returned nil when DATABASE_URL is missing")
	}
}

func TestValidateRequiredEnvVars_ErrorMentionsDatabaseURL(t *testing.T) {
	old := os.Getenv("DATABASE_URL")
	os.Unsetenv("DATABASE_URL")
	defer func() {
		if old != "" {
			os.Setenv("DATABASE_URL", old)
		}
	}()

	err := ValidateRequiredEnvVars()
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if got := err.Error(); got == "" {
		t.Error("error message is empty")
	} else if !contains(got, "DATABASE_URL") {
		t.Errorf("error message %q does not mention DATABASE_URL", got)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstring(s, substr))
}

func containsSubstring(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// Constants: Security Limits
// ---------------------------------------------------------------------------

func TestSecurityLimits_Positive(t *testing.T) {
	if MaxLoginAttempts <= 0 {
		t.Errorf("MaxLoginAttempts = %d, want > 0", MaxLoginAttempts)
	}
	if LockoutDuration <= 0 {
		t.Errorf("LockoutDuration = %v, want > 0", LockoutDuration)
	}
	if MaxConnectionsPerUser <= 0 {
		t.Errorf("MaxConnectionsPerUser = %d, want > 0", MaxConnectionsPerUser)
	}
	if MaxRequestBodyBytes <= 0 {
		t.Errorf("MaxRequestBodyBytes = %d, want > 0", MaxRequestBodyBytes)
	}
	if MaxMetadataBytes <= 0 {
		t.Errorf("MaxMetadataBytes = %d, want > 0", MaxMetadataBytes)
	}
	if MaxFileSize <= 0 {
		t.Errorf("MaxFileSize = %d, want > 0", MaxFileSize)
	}
}

func TestSecurityLimits_ReasonableValues(t *testing.T) {
	if MaxLoginAttempts > 100 {
		t.Errorf("MaxLoginAttempts = %d, seems unreasonably high", MaxLoginAttempts)
	}
	if LockoutDuration < time.Minute {
		t.Errorf("LockoutDuration = %v, should be at least 1 minute", LockoutDuration)
	}
	if MaxRequestBodyBytes < 1024 {
		t.Errorf("MaxRequestBodyBytes = %d, should be at least 1KB", MaxRequestBodyBytes)
	}
}

// ---------------------------------------------------------------------------
// Constants: Token Configuration
// ---------------------------------------------------------------------------

func TestTokenConfig_PositiveDurations(t *testing.T) {
	if AccessTokenTTL <= 0 {
		t.Errorf("AccessTokenTTL = %v, want > 0", AccessTokenTTL)
	}
	if RefreshTokenTTL <= 0 {
		t.Errorf("RefreshTokenTTL = %v, want > 0", RefreshTokenTTL)
	}
	if JWTKeyRotationInterval <= 0 {
		t.Errorf("JWTKeyRotationInterval = %v, want > 0", JWTKeyRotationInterval)
	}
	if JWTKeyGracePeriod <= 0 {
		t.Errorf("JWTKeyGracePeriod = %v, want > 0", JWTKeyGracePeriod)
	}
}

func TestTokenConfig_AccessShorterThanRefresh(t *testing.T) {
	if AccessTokenTTL >= RefreshTokenTTL {
		t.Errorf("AccessTokenTTL (%v) should be shorter than RefreshTokenTTL (%v)",
			AccessTokenTTL, RefreshTokenTTL)
	}
}

func TestTokenConfig_GracePeriodShorterThanRotation(t *testing.T) {
	if JWTKeyGracePeriod >= JWTKeyRotationInterval {
		t.Errorf("JWTKeyGracePeriod (%v) should be shorter than JWTKeyRotationInterval (%v)",
			JWTKeyGracePeriod, JWTKeyRotationInterval)
	}
}

// ---------------------------------------------------------------------------
// Constants: Rate Limiting
// ---------------------------------------------------------------------------

func TestRateLimiting_Positive(t *testing.T) {
	if RateLimitWindow <= 0 {
		t.Errorf("RateLimitWindow = %v, want > 0", RateLimitWindow)
	}
	if RateLimitMaxRequests <= 0 {
		t.Errorf("RateLimitMaxRequests = %d, want > 0", RateLimitMaxRequests)
	}
	if AuthRateLimitMax <= 0 {
		t.Errorf("AuthRateLimitMax = %d, want > 0", AuthRateLimitMax)
	}
}

func TestRateLimiting_AuthStricterThanGlobal(t *testing.T) {
	if AuthRateLimitMax >= RateLimitMaxRequests {
		t.Errorf("AuthRateLimitMax (%d) should be stricter (lower) than RateLimitMaxRequests (%d)",
			AuthRateLimitMax, RateLimitMaxRequests)
	}
}

// ---------------------------------------------------------------------------
// Constants: WebSocket
// ---------------------------------------------------------------------------

func TestWebSocket_PositiveDurations(t *testing.T) {
	if WSPingInterval <= 0 {
		t.Errorf("WSPingInterval = %v, want > 0", WSPingInterval)
	}
	if WSPongTimeout <= 0 {
		t.Errorf("WSPongTimeout = %v, want > 0", WSPongTimeout)
	}
	if WSIdleTimeout <= 0 {
		t.Errorf("WSIdleTimeout = %v, want > 0", WSIdleTimeout)
	}
	if WSEventRetentionTTL <= 0 {
		t.Errorf("WSEventRetentionTTL = %v, want > 0", WSEventRetentionTTL)
	}
}

func TestWebSocket_PositiveLimits(t *testing.T) {
	if WSMaxMissedPongs <= 0 {
		t.Errorf("WSMaxMissedPongs = %d, want > 0", WSMaxMissedPongs)
	}
	if WSReadLimit <= 0 {
		t.Errorf("WSReadLimit = %d, want > 0", WSReadLimit)
	}
	if WSEventReplayMax <= 0 {
		t.Errorf("WSEventReplayMax = %d, want > 0", WSEventReplayMax)
	}
}

// ---------------------------------------------------------------------------
// Constants: Database
// ---------------------------------------------------------------------------

func TestDatabase_PositiveValues(t *testing.T) {
	if DBMaxConnections <= 0 {
		t.Errorf("DBMaxConnections = %d, want > 0", DBMaxConnections)
	}
	if DBMinConnections <= 0 {
		t.Errorf("DBMinConnections = %d, want > 0", DBMinConnections)
	}
	if DBConnectionMaxLife <= 0 {
		t.Errorf("DBConnectionMaxLife = %v, want > 0", DBConnectionMaxLife)
	}
	if DBConnectionMaxIdle <= 0 {
		t.Errorf("DBConnectionMaxIdle = %v, want > 0", DBConnectionMaxIdle)
	}
	if DBHealthCheckInterval <= 0 {
		t.Errorf("DBHealthCheckInterval = %v, want > 0", DBHealthCheckInterval)
	}
}

func TestDatabase_MinLessThanMax(t *testing.T) {
	if DBMinConnections >= DBMaxConnections {
		t.Errorf("DBMinConnections (%d) should be less than DBMaxConnections (%d)",
			DBMinConnections, DBMaxConnections)
	}
}

// ---------------------------------------------------------------------------
// Constants: Circuit Breaker
// ---------------------------------------------------------------------------

func TestCircuitBreaker_Positive(t *testing.T) {
	if CBMaxFailures <= 0 {
		t.Errorf("CBMaxFailures = %d, want > 0", CBMaxFailures)
	}
	if CBResetTimeout <= 0 {
		t.Errorf("CBResetTimeout = %v, want > 0", CBResetTimeout)
	}
	if CBRedisMaxFailures <= 0 {
		t.Errorf("CBRedisMaxFailures = %d, want > 0", CBRedisMaxFailures)
	}
	if CBRedisResetTimeout <= 0 {
		t.Errorf("CBRedisResetTimeout = %v, want > 0", CBRedisResetTimeout)
	}
}

// ---------------------------------------------------------------------------
// Constants: S3 / Storage
// ---------------------------------------------------------------------------

func TestS3Storage_Positive(t *testing.T) {
	if S3MultipartChunkSize <= 0 {
		t.Errorf("S3MultipartChunkSize = %d, want > 0", S3MultipartChunkSize)
	}
	if S3PresignedURLTTL <= 0 {
		t.Errorf("S3PresignedURLTTL = %v, want > 0", S3PresignedURLTTL)
	}
	if S3MultipartTTL <= 0 {
		t.Errorf("S3MultipartTTL = %v, want > 0", S3MultipartTTL)
	}
}

// ---------------------------------------------------------------------------
// Constants: Backup & Retention
// ---------------------------------------------------------------------------

func TestRetention_Positive(t *testing.T) {
	if BackupRetentionDays <= 0 {
		t.Errorf("BackupRetentionDays = %d, want > 0", BackupRetentionDays)
	}
	if AuditLogRetentionDays <= 0 {
		t.Errorf("AuditLogRetentionDays = %d, want > 0", AuditLogRetentionDays)
	}
	if RotatedKeyRetention <= 0 {
		t.Errorf("RotatedKeyRetention = %v, want > 0", RotatedKeyRetention)
	}
}

func TestRetention_AuditLongerThanBackup(t *testing.T) {
	if AuditLogRetentionDays < BackupRetentionDays {
		t.Errorf("AuditLogRetentionDays (%d) should be >= BackupRetentionDays (%d)",
			AuditLogRetentionDays, BackupRetentionDays)
	}
}

// ---------------------------------------------------------------------------
// Constants: Sharing
// ---------------------------------------------------------------------------

func TestSharing_Positive(t *testing.T) {
	if DefaultShareTTL <= 0 {
		t.Errorf("DefaultShareTTL = %v, want > 0", DefaultShareTTL)
	}
	if MaxSharesPerVault <= 0 {
		t.Errorf("MaxSharesPerVault = %d, want > 0", MaxSharesPerVault)
	}
}

// ---------------------------------------------------------------------------
// Log field constants
// ---------------------------------------------------------------------------

func TestLogFields_NonEmpty(t *testing.T) {
	fields := map[string]string{
		"LogFieldUserID":    LogFieldUserID,
		"LogFieldVaultID":   LogFieldVaultID,
		"LogFieldBlobID":    LogFieldBlobID,
		"LogFieldShareID":   LogFieldShareID,
		"LogFieldJobID":     LogFieldJobID,
		"LogFieldEventType": LogFieldEventType,
		"LogFieldAction":    LogFieldAction,
		"LogFieldTier":      LogFieldTier,
		"LogFieldIP":        LogFieldIP,
		"LogFieldError":     LogFieldError,
		"LogFieldDuration":  LogFieldDuration,
		"LogFieldCount":     LogFieldCount,
		"LogFieldSize":      LogFieldSize,
		"LogFieldStatus":    LogFieldStatus,
	}
	for name, val := range fields {
		if val == "" {
			t.Errorf("%s is empty", name)
		}
	}
}

func TestLogFields_NoDuplicateValues(t *testing.T) {
	values := []string{
		LogFieldUserID,
		LogFieldVaultID,
		LogFieldBlobID,
		LogFieldShareID,
		LogFieldJobID,
		LogFieldEventType,
		LogFieldAction,
		LogFieldTier,
		LogFieldIP,
		LogFieldError,
		LogFieldDuration,
		LogFieldCount,
		LogFieldSize,
		LogFieldStatus,
	}
	seen := make(map[string]bool)
	for _, v := range values {
		if seen[v] {
			t.Errorf("duplicate log field value: %q", v)
		}
		seen[v] = true
	}
}
