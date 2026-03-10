package config

// DE-016 FIX: Standard log field names for consistent structured logging
// All services should use these constants for log field keys
const (
	LogFieldUserID     = "user_id"
	LogFieldVaultID    = "vault_id"
	LogFieldBlobID     = "blob_id"
	LogFieldShareID    = "share_id"
	LogFieldJobID      = "job_id"
	LogFieldEventType  = "event_type"
	LogFieldAction     = "action"
	LogFieldTier       = "tier"
	LogFieldIP         = "source_ip"
	LogFieldError      = "error"
	LogFieldDuration   = "duration_ms"
	LogFieldCount      = "count"
	LogFieldSize       = "size_bytes"
	LogFieldStatus     = "status"
)
