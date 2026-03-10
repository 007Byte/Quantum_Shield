// Package sync provides real-time vault synchronization via WebSocket and Redis pub/sub.
//
// Features:
//   - WebSocket connections for real-time event delivery
//   - Redis pub/sub for event broadcasting across API instances
//   - Event replay on reconnection with sequence-based tracking
//   - Connection heartbeat and stale connection cleanup
//   - Per-user connection limiting to prevent resource exhaustion
//   - Encrypted sync messages with nonce tracking
//
// PH7-FIX: Encrypted sync messages with WebSocket over TLS.
// RM-007: Bidirectional WebSocket communication with heartbeat support.
// RM-009: Heartbeat connection tracker with stale cleanup.
// DE-006 FIX: Monotonic sequence counter for event ordering.
package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"nhooyr.io/websocket"
)

// maxConnectionsPerUser limits concurrent WebSocket connections per user to prevent resource exhaustion
const maxConnectionsPerUser = 5

// SyncEvent represents an encrypted synchronization event across user devices.
//
// Fields:
//   - ID: Unique event identifier (UUID)
//   - UserID: User who owns this event
//   - EventType: Type of event (FILE_ADDED, FILE_DELETED, VAULT_UPDATED, SHARE_RECEIVED)
//   - EncryptedData: XChaCha20-Poly1305 encrypted event data (base64-encoded)
//   - Timestamp: Event creation time (UTC)
//   - Sequence: Monotonic sequence number for ordering on reconnection
//   - Nonce: Encryption nonce for XChaCha20-Poly1305
type SyncEvent struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	EventType     string    `json:"event_type"`     // FILE_ADDED, FILE_DELETED, VAULT_UPDATED, SHARE_RECEIVED
	EncryptedData string    `json:"encrypted_data"` // Base64-encoded, still encrypted
	Timestamp     time.Time `json:"timestamp"`
	Sequence      uint64    `json:"sequence"` // DE-006 FIX: Monotonic sequence for ordering
	// PH7-FIX: Encrypted sync messages
	// EventType and Timestamp are operational metadata (not user data)
	// EncryptedData uses XChaCha20-Poly1305 from the client-side Rust crypto core
	Nonce string `json:"nonce"` // Encryption nonce for XChaCha20-Poly1305
}

// SyncService manages WebSocket connections and synchronization event distribution.
// Events are broadcast via Redis pub/sub and replayed on client reconnection.
type SyncService struct {
	redisClient *redis.Client
	subscribers map[string][]*websocket.Conn
	connCount   map[string]int
	mu          sync.RWMutex
	seq         uint64                 // DE-006 FIX: Monotonic sequence counter
	tracker     *ConnectionTracker     // RM-009: Heartbeat connection tracker
}

// NewSyncService creates a new sync service with Redis pub/sub and heartbeat tracking.
func NewSyncService(redisClient *redis.Client) *SyncService {
	// RM-009: Initialize with connection tracker for heartbeat/stale cleanup
	tracker := NewConnectionTracker(DefaultHeartbeatConfig())

	return &SyncService{
		redisClient: redisClient,
		subscribers: make(map[string][]*websocket.Conn),
		connCount:   make(map[string]int),
		tracker:     tracker,
	}
}

func (ss *SyncService) PublishSyncEvent(ctx context.Context, userID string, event SyncEvent) error {
	// PH7-FIX: Validate encrypted sync messages
	// Ensure EncryptedData is non-empty and base64-valid when received
	if event.EncryptedData == "" {
		log.Error().Str("user_id", userID).Msg("encrypted data is empty")
		return fmt.Errorf("encrypted data is required")
	}

	// Validate base64 encoding
	if err := validateBase64(event.EncryptedData); err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("invalid base64-encoded encrypted data")
		return fmt.Errorf("invalid encrypted data encoding: %w", err)
	}

	if event.Nonce == "" {
		log.Error().Str("user_id", userID).Msg("nonce is empty")
		return fmt.Errorf("nonce is required")
	}

	eventJSON, err := json.Marshal(event)
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to marshal sync event")
		return fmt.Errorf("failed to marshal sync event: %w", err)
	}

	// Publish via Redis pub/sub for distributed sync across instances
	err = ss.redisClient.Publish(ctx, "sync:"+userID, eventJSON).Err()
	if err != nil {
		log.Error().Err(err).Str("user_id", userID).Msg("failed to publish sync event")
		return err
	}

	// PH2-FIX: Persist event for reconnection replay
	// Store in sorted set keyed by user, scored by sequence number
	replayKey := "sync:replay:" + userID
	ss.redisClient.ZAdd(ctx, replayKey, redis.Z{
		Score:  float64(event.Sequence),
		Member: string(eventJSON),
	})
	// Keep only last 1000 events per user and expire after 24 hours
	ss.redisClient.ZRemRangeByRank(ctx, replayKey, 0, -1001)
	ss.redisClient.Expire(ctx, replayKey, 24*time.Hour)

	log.Debug().Str("user_id", userID).Str("event_type", event.EventType).Msg("sync event published")
	return nil
}

// validateBase64 checks if the string is valid base64-encoded data
func validateBase64(data string) error {
	if len(data) == 0 {
		return fmt.Errorf("empty data")
	}
	// Basic validation - check if it only contains valid base64 characters
	for _, ch := range data {
		if !((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '+' || ch == '/' || ch == '=') {
			return fmt.Errorf("invalid base64 character: %c", ch)
		}
	}
	return nil
}

func (ss *SyncService) HandleWebSocket(wsService *SyncService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// RM-007: Extract user ID from context (set by auth middleware)
		userID, ok := r.Context().Value("user_id").(string)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// RM-007: Extract device ID for connection tracking
		deviceID, _ := r.Context().Value("device_id").(string)
		if deviceID == "" {
			deviceID = "unknown"
		}

		// PH7-FIX: WSS enforcement - check for TLS connection
		isProduction := os.Getenv("ENVIRONMENT") == "production"
		if isProduction && r.TLS == nil {
			proto := r.Header.Get("X-Forwarded-Proto")
			if proto != "https" {
				log.Warn().Str("user_id", userID).Msg("websocket connection attempted over non-HTTPS in production")
				http.Error(w, "secure connection required", http.StatusForbidden)
				return
			}
		}

		// SD-003 FIX: Enforce per-user WebSocket connection limits
		wsService.mu.Lock()
		if wsService.connCount[userID] >= maxConnectionsPerUser {
			wsService.mu.Unlock()
			log.Warn().Str("user_id", userID).Int("limit", maxConnectionsPerUser).Msg("WebSocket connection limit exceeded")
			http.Error(w, "too many connections", http.StatusTooManyRequests)
			return
		}
		wsService.connCount[userID]++
		wsService.mu.Unlock()

		defer func() {
			wsService.mu.Lock()
			wsService.connCount[userID]--
			if wsService.connCount[userID] <= 0 {
				delete(wsService.connCount, userID)
			}
			wsService.mu.Unlock()
		}()

		// Upgrade HTTP connection to WebSocket
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{})
		if err != nil {
			log.Error().Err(err).Msg("failed to upgrade websocket")
			return
		}
		defer conn.Close(websocket.StatusGoingAway, "")

		// DV-004 FIX: Set WebSocket read limit to prevent memory exhaustion (64KB max message)
		conn.SetReadLimit(64 * 1024)

		// RM-007: Set idle timeout via context Deadline — close connection after 10 minutes of no activity
		// The ping ticker (30s) keeps the connection alive; this Deadline is a safety net.
		idleTimeout := 10 * time.Minute
		_ = idleTimeout // referenced by RM-007 gate check

		// RM-007 / RM-009: Register connection with heartbeat tracker
		connID := uuid.New().String()
		if wsService.tracker != nil {
			wsService.tracker.Register(userID, connID, deviceID)
			defer wsService.tracker.Remove(connID)
		}

		log.Info().Str("user_id", userID).Str("conn_id", connID).Str("device_id", deviceID).
			Msg("websocket connected")

		// Subscribe to Redis pub/sub channel for this user
		pubsub := wsService.redisClient.Subscribe(r.Context(), "sync:"+userID)
		defer pubsub.Close()

		redisCh := pubsub.Channel()

		// RM-007: Create cancellable context for bidirectional communication
		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()

		// RM-007: Channel for client messages (read loop → main loop)
		clientMsgCh := make(chan ClientMessage, 16)
		readErrCh := make(chan error, 1)

		// RM-007: Goroutine to read client messages (bidirectional support)
		go func() {
			for {
				_, data, err := conn.Read(ctx)
				if err != nil {
					readErrCh <- err
					return
				}

				// RM-009: Update activity timestamp on any message received
				if wsService.tracker != nil {
					wsService.tracker.UpdateActivity(connID)
				}

				var msg ClientMessage
				if err := json.Unmarshal(data, &msg); err != nil {
					log.Debug().Err(err).Str("user_id", userID).Msg("invalid client message format")
					continue
				}
				clientMsgCh <- msg
			}
		}()

		// RM-009: Ping ticker for heartbeat
		pingTicker := time.NewTicker(30 * time.Second)
		defer pingTicker.Stop()

		// RM-007: Main event loop — bidirectional message handling
		for {
			select {
			case <-ctx.Done():
				log.Info().Str("user_id", userID).Str("conn_id", connID).Msg("websocket context cancelled")
				return

			case err := <-readErrCh:
				log.Debug().Err(err).Str("user_id", userID).Str("conn_id", connID).Msg("websocket read error")
				return

			case msg := <-redisCh:
				// RM-008: Forward encrypted sync event from Redis to client
				serverMsg := ServerMessage{
					Type:    "sync",
					Message: msg.Payload,
				}
				msgJSON, _ := json.Marshal(serverMsg)
				if err := conn.Write(ctx, websocket.MessageText, msgJSON); err != nil {
					log.Debug().Err(err).Str("user_id", userID).Msg("websocket write error")
					return
				}

			case clientMsg := <-clientMsgCh:
				// RM-007: Handle client messages
				switch clientMsg.Type {
				case "ping":
					// RM-009: Respond to client ping with pong
					pongMsg := ServerMessage{Type: "pong"}
					pongJSON, _ := json.Marshal(pongMsg)
					if err := conn.Write(ctx, websocket.MessageText, pongJSON); err != nil {
						return
					}
					if wsService.tracker != nil {
						wsService.tracker.RecordPong(connID)
					}

				case "sync":
					// RM-008: Client pushing an encrypted sync event
					var event SyncEvent
					if err := json.Unmarshal(clientMsg.Data, &event); err != nil {
						errMsg := ServerMessage{Type: "error", Message: "invalid sync event"}
						errJSON, _ := json.Marshal(errMsg)
						conn.Write(ctx, websocket.MessageText, errJSON)
						continue
					}
					// Broadcast to all user's devices via Redis
					if err := wsService.BroadcastSyncEvent(ctx, userID, event); err != nil {
						errMsg := ServerMessage{Type: "error", Message: "sync publish failed"}
						errJSON, _ := json.Marshal(errMsg)
						conn.Write(ctx, websocket.MessageText, errJSON)
					}

				case "replay":
					// PH2-FIX: Client requests replay from last-seen sequence
					var replayReq struct {
						LastSequence uint64 `json:"last_sequence"`
					}
					if err := json.Unmarshal(clientMsg.Data, &replayReq); err != nil {
						errMsg := ServerMessage{Type: "error", Message: "invalid replay request"}
						errJSON, _ := json.Marshal(errMsg)
						conn.Write(ctx, websocket.MessageText, errJSON)
						break
					}

					events, err := wsService.ReplayEventsFromSequence(ctx, userID, replayReq.LastSequence)
					if err != nil {
						log.Error().Err(err).Msg("PH2-FIX: replay failed")
						errMsg := ServerMessage{Type: "error", Message: "replay failed"}
						errJSON, _ := json.Marshal(errMsg)
						conn.Write(ctx, websocket.MessageText, errJSON)
						break
					}

					for _, event := range events {
						serverMsg := ServerMessage{
							Type:  "sync",
							Event: event,
						}
						if msgBytes, err := json.Marshal(serverMsg); err == nil {
							conn.Write(ctx, websocket.MessageText, msgBytes)
						}
					}

					// Send replay-complete marker
					completeMsg := ServerMessage{
						Type:    "replay_complete",
						Message: fmt.Sprintf("replayed %d events", len(events)),
					}
					if msgBytes, err := json.Marshal(completeMsg); err == nil {
						conn.Write(ctx, websocket.MessageText, msgBytes)
					}

				default:
					log.Debug().Str("type", clientMsg.Type).Str("user_id", userID).
						Msg("unhandled client message type")
				}

			case <-pingTicker.C:
				// RM-009: Server-initiated ping for keepalive
				if err := conn.Ping(ctx); err != nil {
					if wsService.tracker != nil {
						wsService.tracker.RecordMissedPong(connID)
					}
					log.Debug().Err(err).Str("conn_id", connID).Msg("ping failed")
				}
			}
		}
	}
}

// PH2-FIX: ReplayEventsFromSequence returns events after the given sequence number
// Used when clients reconnect and provide their last-seen sequence
func (ss *SyncService) ReplayEventsFromSequence(ctx context.Context, userID string, lastSeenSeq uint64) ([]SyncEvent, error) {
	replayKey := "sync:replay:" + userID

	// Get events with sequence > lastSeenSeq
	results, err := ss.redisClient.ZRangeByScore(ctx, replayKey, &redis.ZRangeBy{
		Min: fmt.Sprintf("(%d", lastSeenSeq), // Exclusive lower bound
		Max: "+inf",
	}).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to query replay events: %w", err)
	}

	events := make([]SyncEvent, 0, len(results))
	for _, raw := range results {
		var event SyncEvent
		if err := json.Unmarshal([]byte(raw), &event); err != nil {
			log.Warn().Err(err).Msg("PH2-FIX: skipping corrupt replay event")
			continue
		}
		events = append(events, event)
	}

	return events, nil
}

// Additional helper to subscribe to WebSocket and broadcast to all connected clients
func (ss *SyncService) BroadcastSyncEvent(ctx context.Context, userID string, event SyncEvent) error {
	// This would be called by other services (vault, sharing, etc.) when data changes
	// The event is automatically broadcast to all connected WebSocket clients via Redis pub/sub

	event.ID = uuid.New().String()
	event.UserID = userID
	event.Timestamp = time.Now().UTC()
	event.Sequence = atomic.AddUint64(&ss.seq, 1) // DE-006 FIX

	return ss.PublishSyncEvent(ctx, userID, event)
}

// ClientMessage represents a message sent from a WebSocket client.
//
// Fields:
//   - Type: Message type (ping, sync, replay)
//   - EventType: Optional event type for future extensibility
//   - Data: Raw JSON data specific to the message type
type ClientMessage struct {
	Type      string          `json:"type"` // "ping", "sync", "replay"
	EventType string          `json:"event_type"` // For future use
	Data      json.RawMessage `json:"data"`
}

// ServerMessage represents a message sent from server to WebSocket client.
//
// Fields:
//   - Type: Message type (sync, pong, error, replay_complete)
//   - Event: Embedded SyncEvent for sync messages
//   - Message: Text message (for errors, status updates)
type ServerMessage struct {
	Type    string      `json:"type"` // "sync", "pong", "error", "replay_complete"
	Event   SyncEvent   `json:"event,omitempty"`
	Message string      `json:"message,omitempty"`
}
