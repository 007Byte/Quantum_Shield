// Package sync — protocol.go defines the encrypted sync message protocol.
//
// PH7-FIX: All sync payloads are opaque encrypted blobs. The server routes
// messages between a user's devices without ever decrypting them (zero-knowledge).
//
// Message types:
//   - SYNC_EVENT: Encrypted vault/file change from one device to others
//   - VAULT_UPDATE: Encrypted vault metadata update
//   - FILE_CHANGE: Encrypted file add/delete/rename notification
//   - HEARTBEAT: Connection keepalive (no payload)
//   - ACK: Server acknowledgement with sequence number
package sync

import "encoding/json"

// ── Message Type Constants ──────────────────────────────────────

const (
	// MsgTypeSyncEvent is a generic encrypted sync event between devices.
	MsgTypeSyncEvent = "SYNC_EVENT"
	// MsgTypeVaultUpdate is an encrypted vault metadata update.
	MsgTypeVaultUpdate = "VAULT_UPDATE"
	// MsgTypeFileChange is an encrypted file add/delete/rename notification.
	MsgTypeFileChange = "FILE_CHANGE"
	// MsgTypeHeartbeat is a connection keepalive (no encrypted payload required).
	MsgTypeHeartbeat = "HEARTBEAT"
	// MsgTypeACK is a server acknowledgement with the assigned sequence number.
	MsgTypeACK = "ACK"
)

// ── Reason Codes for Disconnect ─────────────────────────────────

const (
	// DisconnectNormal indicates a clean client-initiated close.
	DisconnectNormal = "NORMAL"
	// DisconnectTimeout indicates the server closed due to heartbeat timeout.
	DisconnectTimeout = "TIMEOUT"
	// DisconnectAuthExpired indicates JWT expiration during an active session.
	DisconnectAuthExpired = "AUTH_EXPIRED"
	// DisconnectLimitExceeded indicates too many connections for this user.
	DisconnectLimitExceeded = "LIMIT_EXCEEDED"
	// DisconnectServerShutdown indicates the server is shutting down gracefully.
	DisconnectServerShutdown = "SERVER_SHUTDOWN"
)

// ── Encrypted Message Envelope ──────────────────────────────────

// SyncMessageEnvelope wraps every WebSocket message with ordering metadata.
// The EncryptedPayload is an opaque blob produced by the client's Rust crypto
// core (XChaCha20-Poly1305). The server MUST NOT attempt to decrypt it.
type SyncMessageEnvelope struct {
	// MessageType identifies the kind of event (SYNC_EVENT, VAULT_UPDATE, etc.).
	MessageType string `json:"message_type"`

	// Sequence is a server-assigned monotonic number for ordering.
	// Set to 0 on client→server messages; the server fills it before broadcast.
	Sequence uint64 `json:"sequence"`

	// Timestamp is the event creation time in RFC 3339 format.
	// Client provides its local timestamp; server may override for consistency.
	Timestamp string `json:"timestamp"`

	// EncryptedPayload is the base64-encoded XChaCha20-Poly1305 ciphertext.
	// Empty for HEARTBEAT messages.
	EncryptedPayload string `json:"encrypted_payload,omitempty"`

	// Nonce is the base64-encoded 24-byte nonce for the encrypted payload.
	// Empty for HEARTBEAT messages.
	Nonce string `json:"nonce,omitempty"`

	// DeviceID identifies the originating device (for multi-device routing).
	DeviceID string `json:"device_id,omitempty"`
}

// ACKMessage is sent from server to client to acknowledge receipt of a sync event.
type ACKMessage struct {
	// Type is always "ack".
	Type string `json:"type"`
	// Sequence is the server-assigned sequence number for the acknowledged event.
	Sequence uint64 `json:"sequence"`
	// OriginalID is the client-provided event ID that was acknowledged.
	OriginalID string `json:"original_id,omitempty"`
}

// DisconnectMessage is sent from server to client before closing the connection.
type DisconnectMessage struct {
	// Type is always "disconnect".
	Type string `json:"type"`
	// Reason is a machine-readable reason code (see Disconnect* constants).
	Reason string `json:"reason"`
	// Message is a human-readable explanation.
	Message string `json:"message,omitempty"`
	// ReconnectToken is an opaque token the client can use to resume the session.
	// Only provided for recoverable disconnects (timeout, server shutdown).
	ReconnectToken string `json:"reconnect_token,omitempty"`
}

// ValidMessageTypes returns the set of valid message types for validation.
func ValidMessageTypes() map[string]bool {
	return map[string]bool{
		MsgTypeSyncEvent:   true,
		MsgTypeVaultUpdate: true,
		MsgTypeFileChange:  true,
		MsgTypeHeartbeat:   true,
		MsgTypeACK:         true,
	}
}

// IsValidMessageType checks whether a message type string is recognized.
func IsValidMessageType(msgType string) bool {
	return ValidMessageTypes()[msgType]
}

// EncodeSyncEnvelope marshals a SyncMessageEnvelope to JSON bytes.
func EncodeSyncEnvelope(env *SyncMessageEnvelope) ([]byte, error) {
	return json.Marshal(env)
}

// DecodeSyncEnvelope unmarshals JSON bytes into a SyncMessageEnvelope.
func DecodeSyncEnvelope(data []byte) (*SyncMessageEnvelope, error) {
	var env SyncMessageEnvelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil, err
	}
	return &env, nil
}
