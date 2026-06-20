// Package ctxkeys defines typed context keys used across the server.
// Using typed keys (instead of bare strings) prevents collisions between
// packages that might independently choose the same string key.
package ctxkeys

// Key is an unexported type for context keys, ensuring no external
// package can create a colliding key.
type Key string

const (
	UserID    Key = "user_id"
	DeviceID  Key = "device_id"
	TokenType Key = "token_type"
	JTI       Key = "jti"
	UserTier  Key = "user_tier"
	RequestID Key = "request_id"
)
