package sync

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ============================================================================
// Test: JWT extraction from WebSocket upgrade request
// ============================================================================

func TestExtractWSToken(t *testing.T) {
	t.Parallel()

	t.Run("extracts token from Sec-WebSocket-Protocol bearer subprotocol", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Header.Set("Sec-WebSocket-Protocol", "bearer-mytoken123")

		token, subproto := extractWSToken(req)
		assert.Equal(t, "mytoken123", token)
		assert.Equal(t, "bearer-mytoken123", subproto)
	})

	t.Run("extracts token from query parameter", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws?token=querytoken456", nil)

		token, subproto := extractWSToken(req)
		assert.Equal(t, "querytoken456", token)
		assert.Empty(t, subproto)
	})

	t.Run("extracts token from Authorization header", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Header.Set("Authorization", "Bearer headertoken789")

		token, subproto := extractWSToken(req)
		assert.Equal(t, "headertoken789", token)
		assert.Empty(t, subproto)
	})

	t.Run("prefers Sec-WebSocket-Protocol over query param", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws?token=querytoken", nil)
		req.Header.Set("Sec-WebSocket-Protocol", "bearer-prototoken")

		token, _ := extractWSToken(req)
		assert.Equal(t, "prototoken", token)
	})

	t.Run("returns empty when no token is provided", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)

		token, subproto := extractWSToken(req)
		assert.Empty(t, token)
		assert.Empty(t, subproto)
	})

	t.Run("ignores non-bearer subprotocol", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Header.Set("Sec-WebSocket-Protocol", "graphql-ws, other-protocol")

		token, _ := extractWSToken(req)
		assert.Empty(t, token)
	})

	t.Run("handles multiple subprotocols with bearer", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/ws", nil)
		req.Header.Set("Sec-WebSocket-Protocol", "graphql-ws, bearer-mytoken")

		token, subproto := extractWSToken(req)
		assert.Equal(t, "mytoken", token)
		assert.Equal(t, "bearer-mytoken", subproto)
	})
}

// ============================================================================
// Test: Connection rejected without JWT
// ============================================================================

func TestWSHandlerRejectsWithoutJWT(t *testing.T) {
	t.Parallel()

	mockRedis := redis.NewClient(&redis.Options{})
	svc := NewSyncService(mockRedis)
	handler := NewWSHandler(svc)

	// Request with NO token
	req := httptest.NewRequest("GET", "/api/v1/sync/ws", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "JWT required")
}

// ============================================================================
// Test: Connection rejected with invalid JWT
// ============================================================================

func TestWSHandlerRejectsInvalidJWT(t *testing.T) {
	t.Parallel()

	mockRedis := redis.NewClient(&redis.Options{})
	svc := NewSyncService(mockRedis)
	handler := NewWSHandler(svc)

	// Request with invalid token
	req := httptest.NewRequest("GET", "/api/v1/sync/ws?token=invalid.jwt.token", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "invalid token")
}

// ============================================================================
// Test: Connection pool operations
// ============================================================================

func TestConnectionPool(t *testing.T) {
	t.Parallel()

	t.Run("add and remove connections", func(t *testing.T) {
		pool := NewConnectionPool(5)

		pc := &PoolConnection{
			ConnID:      "conn-1",
			UserID:      "user-1",
			DeviceID:    "device-1",
			ConnectedAt: time.Now(),
		}

		err := pool.Add(pc)
		require.NoError(t, err)
		assert.Equal(t, 1, pool.TotalConnections())
		assert.Equal(t, 1, pool.UserConnectionCount("user-1"))

		pool.Remove("conn-1")
		assert.Equal(t, 0, pool.TotalConnections())
		assert.Equal(t, 0, pool.UserConnectionCount("user-1"))
	})

	t.Run("enforces per-user connection limit", func(t *testing.T) {
		pool := NewConnectionPool(2)

		for i := 0; i < 2; i++ {
			pc := &PoolConnection{
				ConnID:      "conn-" + string(rune('a'+i)),
				UserID:      "user-1",
				DeviceID:    "device-" + string(rune('a'+i)),
				ConnectedAt: time.Now(),
			}
			err := pool.Add(pc)
			require.NoError(t, err)
		}

		// Third connection should be rejected
		pc := &PoolConnection{
			ConnID:      "conn-c",
			UserID:      "user-1",
			DeviceID:    "device-c",
			ConnectedAt: time.Now(),
		}
		err := pool.Add(pc)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "connection limit exceeded")
	})

	t.Run("different users have independent limits", func(t *testing.T) {
		pool := NewConnectionPool(2)

		err := pool.Add(&PoolConnection{ConnID: "c1", UserID: "user-1", ConnectedAt: time.Now()})
		require.NoError(t, err)
		err = pool.Add(&PoolConnection{ConnID: "c2", UserID: "user-1", ConnectedAt: time.Now()})
		require.NoError(t, err)

		// user-2 should be independent
		err = pool.Add(&PoolConnection{ConnID: "c3", UserID: "user-2", ConnectedAt: time.Now()})
		require.NoError(t, err)

		assert.Equal(t, 2, pool.UserConnectionCount("user-1"))
		assert.Equal(t, 1, pool.UserConnectionCount("user-2"))
		assert.Equal(t, 3, pool.TotalConnections())
	})

	t.Run("GetUserConnections excludes specified connection", func(t *testing.T) {
		pool := NewConnectionPool(5)

		pool.Add(&PoolConnection{ConnID: "c1", UserID: "user-1", DeviceID: "laptop", ConnectedAt: time.Now()})
		pool.Add(&PoolConnection{ConnID: "c2", UserID: "user-1", DeviceID: "phone", ConnectedAt: time.Now()})
		pool.Add(&PoolConnection{ConnID: "c3", UserID: "user-1", DeviceID: "tablet", ConnectedAt: time.Now()})

		// Exclude c1 (the sender)
		others := pool.GetUserConnections("user-1", "c1")
		assert.Len(t, others, 2)
		for _, pc := range others {
			assert.NotEqual(t, "c1", pc.ConnID)
		}
	})

	t.Run("RemoveAllForUser cleans up correctly", func(t *testing.T) {
		pool := NewConnectionPool(5)

		pool.Add(&PoolConnection{ConnID: "c1", UserID: "user-1", ConnectedAt: time.Now()})
		pool.Add(&PoolConnection{ConnID: "c2", UserID: "user-1", ConnectedAt: time.Now()})
		pool.Add(&PoolConnection{ConnID: "c3", UserID: "user-2", ConnectedAt: time.Now()})

		removed := pool.RemoveAllForUser("user-1")
		assert.Len(t, removed, 2)
		assert.Equal(t, 0, pool.UserConnectionCount("user-1"))
		assert.Equal(t, 1, pool.UserConnectionCount("user-2"))
		assert.Equal(t, 1, pool.TotalConnections())
	})

	t.Run("reconnect token is generated on add", func(t *testing.T) {
		pool := NewConnectionPool(5)

		pc := &PoolConnection{ConnID: "c1", UserID: "user-1", ConnectedAt: time.Now()}
		err := pool.Add(pc)
		require.NoError(t, err)

		assert.NotEmpty(t, pc.ReconnectToken)

		// Should be findable by token
		found := pool.FindByReconnectToken(pc.ReconnectToken)
		assert.NotNil(t, found)
		assert.Equal(t, "c1", found.ConnID)
	})

	t.Run("UpdateActivity refreshes timestamp", func(t *testing.T) {
		pool := NewConnectionPool(5)

		pc := &PoolConnection{ConnID: "c1", UserID: "user-1", ConnectedAt: time.Now()}
		pool.Add(pc)

		time.Sleep(10 * time.Millisecond)
		pool.UpdateActivity("c1")

		updated := pool.GetConnection("c1")
		assert.True(t, updated.LastActivity.After(pc.ConnectedAt))
	})
}

// ============================================================================
// Test: Heartbeat keeps connection alive
// ============================================================================

func TestHeartbeatKeepsConnectionAlive(t *testing.T) {
	t.Parallel()

	config := HeartbeatConfig{
		PingInterval:   100 * time.Millisecond,
		PongTimeout:    50 * time.Millisecond,
		MaxMissedPongs: 3,
		IdleTimeout:    500 * time.Millisecond,
	}
	tracker := NewConnectionTracker(config)

	tracker.Register("user-1", "conn-1", "device-1")

	// Simulate pong responses
	for i := 0; i < 5; i++ {
		tracker.RecordPong("conn-1")
		time.Sleep(20 * time.Millisecond)
	}

	// Connection should still be active (pongs were received)
	conn := tracker.GetConnection("conn-1")
	require.NotNil(t, conn)
	assert.True(t, conn.Active)
	assert.Equal(t, 0, conn.MissedPongs)
}

// ============================================================================
// Test: Connection closed after timeout (missed pongs)
// ============================================================================

func TestConnectionClosedAfterTimeout(t *testing.T) {
	t.Parallel()

	config := HeartbeatConfig{
		PingInterval:   100 * time.Millisecond,
		PongTimeout:    50 * time.Millisecond,
		MaxMissedPongs: 3,
		IdleTimeout:    5 * time.Minute, // Not testing idle timeout here
	}
	tracker := NewConnectionTracker(config)

	tracker.Register("user-1", "conn-1", "device-1")

	// Simulate 3 missed pongs
	tracker.RecordMissedPong("conn-1")
	tracker.RecordMissedPong("conn-1")
	tracker.RecordMissedPong("conn-1")

	// Check stale — should find conn-1
	stale := tracker.CheckStale()
	assert.Contains(t, stale, "conn-1")
}

// ============================================================================
// Test: Encrypted messages not decrypted by server (zero-knowledge)
// ============================================================================

func TestServerNeverDecryptsPayload(t *testing.T) {
	t.Parallel()

	t.Run("SyncEvent stores encrypted data as opaque blob", func(t *testing.T) {
		// Simulate an encrypted event that would come from the client's Rust crypto core
		encryptedData := "dGhpcyBpcyBlbmNyeXB0ZWQgZGF0YQ==" // base64 of "this is encrypted data"
		nonce := "YmFzZTY0bm9uY2U="                          // base64 of "base64nonce"

		event := SyncEvent{
			ID:            "evt-1",
			UserID:        "user-1",
			EventType:     "FILE_ADDED",
			EncryptedData: encryptedData,
			Nonce:         nonce,
			Timestamp:     time.Now(),
			Sequence:      1,
		}

		// Serialize and deserialize — the encrypted data must survive round-trip unchanged
		jsonBytes, err := json.Marshal(event)
		require.NoError(t, err)

		var decoded SyncEvent
		err = json.Unmarshal(jsonBytes, &decoded)
		require.NoError(t, err)

		// The server preserves the encrypted blob exactly as received
		assert.Equal(t, encryptedData, decoded.EncryptedData)
		assert.Equal(t, nonce, decoded.Nonce)
	})

	t.Run("SyncEvent validation requires encrypted data", func(t *testing.T) {
		mockRedis := redis.NewClient(&redis.Options{})
		svc := NewSyncService(mockRedis)

		// Event with empty encrypted data should be rejected
		event := SyncEvent{
			EventType:     "FILE_ADDED",
			EncryptedData: "", // Empty — violates zero-knowledge requirement
		}

		err := svc.PublishSyncEvent(nil, "user-1", event)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "encrypted data is required")
	})

	t.Run("SyncEvent validation requires nonce", func(t *testing.T) {
		mockRedis := redis.NewClient(&redis.Options{})
		svc := NewSyncService(mockRedis)

		event := SyncEvent{
			EventType:     "FILE_ADDED",
			EncryptedData: "dGVzdA==",
			Nonce:         "", // Empty nonce
		}

		err := svc.PublishSyncEvent(nil, "user-1", event)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "nonce is required")
	})
}

// ============================================================================
// Test: Protocol message types
// ============================================================================

func TestProtocolMessageTypes(t *testing.T) {
	t.Parallel()

	t.Run("all message type constants are valid", func(t *testing.T) {
		assert.True(t, IsValidMessageType(MsgTypeSyncEvent))
		assert.True(t, IsValidMessageType(MsgTypeVaultUpdate))
		assert.True(t, IsValidMessageType(MsgTypeFileChange))
		assert.True(t, IsValidMessageType(MsgTypeHeartbeat))
		assert.True(t, IsValidMessageType(MsgTypeACK))
	})

	t.Run("invalid message type returns false", func(t *testing.T) {
		assert.False(t, IsValidMessageType("INVALID"))
		assert.False(t, IsValidMessageType(""))
	})

	t.Run("SyncMessageEnvelope round-trips through JSON", func(t *testing.T) {
		env := &SyncMessageEnvelope{
			MessageType:      MsgTypeSyncEvent,
			Sequence:         42,
			Timestamp:        time.Now().UTC().Format(time.RFC3339),
			EncryptedPayload: "ZW5jcnlwdGVk",
			Nonce:            "bm9uY2U=",
			DeviceID:         "laptop-1",
		}

		data, err := EncodeSyncEnvelope(env)
		require.NoError(t, err)

		decoded, err := DecodeSyncEnvelope(data)
		require.NoError(t, err)

		assert.Equal(t, env.MessageType, decoded.MessageType)
		assert.Equal(t, env.Sequence, decoded.Sequence)
		assert.Equal(t, env.EncryptedPayload, decoded.EncryptedPayload)
		assert.Equal(t, env.Nonce, decoded.Nonce)
		assert.Equal(t, env.DeviceID, decoded.DeviceID)
	})

	t.Run("ACKMessage marshals correctly", func(t *testing.T) {
		ack := ACKMessage{
			Type:       "ack",
			Sequence:   100,
			OriginalID: "evt-123",
		}

		data, err := json.Marshal(ack)
		require.NoError(t, err)

		var decoded ACKMessage
		err = json.Unmarshal(data, &decoded)
		require.NoError(t, err)
		assert.Equal(t, uint64(100), decoded.Sequence)
		assert.Equal(t, "evt-123", decoded.OriginalID)
	})

	t.Run("DisconnectMessage includes reason and reconnect token", func(t *testing.T) {
		dm := DisconnectMessage{
			Type:           "disconnect",
			Reason:         DisconnectTimeout,
			Message:        "connection timed out",
			ReconnectToken: "abc123",
		}

		data, err := json.Marshal(dm)
		require.NoError(t, err)

		var decoded DisconnectMessage
		err = json.Unmarshal(data, &decoded)
		require.NoError(t, err)
		assert.Equal(t, "TIMEOUT", decoded.Reason)
		assert.Equal(t, "abc123", decoded.ReconnectToken)
	})
}

// ============================================================================
// Test: WSHandler health check
// ============================================================================

func TestWSHandlerHealthCheck(t *testing.T) {
	t.Parallel()

	mockRedis := redis.NewClient(&redis.Options{})
	svc := NewSyncService(mockRedis)
	handler := NewWSHandler(svc)

	req := httptest.NewRequest("GET", "/api/v1/sync/health", nil)
	w := httptest.NewRecorder()

	handler.HealthCheck()(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &resp)
	require.NoError(t, err)
	assert.Equal(t, "ok", resp["status"])
	assert.Equal(t, float64(0), resp["active_connections"])
}

// ============================================================================
// Test: Messages routed between same-user connections
// ============================================================================

func TestMessagesRoutedBetweenSameUserConnections(t *testing.T) {
	t.Parallel()

	t.Run("GetUserConnections returns other devices for same user", func(t *testing.T) {
		pool := NewConnectionPool(5)

		pool.Add(&PoolConnection{ConnID: "laptop", UserID: "user-1", DeviceID: "laptop", ConnectedAt: time.Now()})
		pool.Add(&PoolConnection{ConnID: "phone", UserID: "user-1", DeviceID: "phone", ConnectedAt: time.Now()})
		pool.Add(&PoolConnection{ConnID: "tablet", UserID: "user-1", DeviceID: "tablet", ConnectedAt: time.Now()})
		pool.Add(&PoolConnection{ConnID: "other-user", UserID: "user-2", DeviceID: "laptop", ConnectedAt: time.Now()})

		// When laptop sends a message, it should be routed to phone and tablet (not laptop, not user-2)
		targets := pool.GetUserConnections("user-1", "laptop")
		assert.Len(t, targets, 2)

		deviceIDs := make([]string, 0, 2)
		for _, pc := range targets {
			deviceIDs = append(deviceIDs, pc.DeviceID)
			assert.Equal(t, "user-1", pc.UserID) // Never routes to other users
		}
		assert.Contains(t, deviceIDs, "phone")
		assert.Contains(t, deviceIDs, "tablet")
	})

	t.Run("no connections returned for user with single device", func(t *testing.T) {
		pool := NewConnectionPool(5)

		pool.Add(&PoolConnection{ConnID: "only-device", UserID: "user-1", DeviceID: "laptop", ConnectedAt: time.Now()})

		targets := pool.GetUserConnections("user-1", "only-device")
		assert.Len(t, targets, 0)
	})

	t.Run("no connections returned for unknown user", func(t *testing.T) {
		pool := NewConnectionPool(5)

		targets := pool.GetUserConnections("nonexistent-user", "")
		assert.Nil(t, targets)
	})
}
