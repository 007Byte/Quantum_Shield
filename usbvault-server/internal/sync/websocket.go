// Package sync — websocket.go implements JWT-authenticated WebSocket upgrade
// and message routing for multi-device sync.
//
// PH7-FIX: WebSocket auth upgrade flow — JWT required on every connection.
// The token is extracted from:
//   1. Sec-WebSocket-Protocol subprotocol header (preferred, avoids URL logging)
//   2. Authorization query parameter (?token=<jwt>)
//
// After authentication, the connection is registered in the ConnectionPool and
// messages are routed between the user's devices via Redis pub/sub.
// The server NEVER decrypts sync payloads (zero-knowledge architecture).
package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	auth "github.com/usbvault/usbvault-server/internal/auth"
	"nhooyr.io/websocket"
)

// WSHandler manages authenticated WebSocket connections for real-time sync.
type WSHandler struct {
	syncService *SyncService
	pool        *ConnectionPool
}

// NewWSHandler creates a WebSocket handler backed by the given sync service.
func NewWSHandler(svc *SyncService) *WSHandler {
	return &WSHandler{
		syncService: svc,
		pool:        NewConnectionPool(maxConnectionsPerUser),
	}
}

// ServeHTTP handles the WebSocket upgrade with JWT authentication.
// This implements http.Handler so it can be mounted directly on a router.
func (wsh *WSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// ── Step 1: Extract and validate JWT ──────────────────────────

	token, subprotocol := extractWSToken(r)
	if token == "" {
		log.Debug().Msg("PH7: WebSocket upgrade rejected — no JWT token provided")
		http.Error(w, "unauthorized: JWT required", http.StatusUnauthorized)
		return
	}

	claims, err := auth.ValidateToken(token)
	if err != nil {
		log.Debug().Err(err).Msg("PH7: WebSocket upgrade rejected — invalid JWT")
		http.Error(w, "unauthorized: invalid token", http.StatusUnauthorized)
		return
	}

	if claims.Type != "access" {
		log.Debug().Str("token_type", claims.Type).Msg("PH7: WebSocket upgrade rejected — not an access token")
		http.Error(w, "unauthorized: access token required", http.StatusUnauthorized)
		return
	}

	userID := claims.UserID
	deviceID := claims.DeviceID
	if deviceID == "" {
		deviceID = "unknown"
	}

	// ── Step 2: WSS enforcement in production ────────────────────

	isProduction := os.Getenv("ENVIRONMENT") == "production"
	if isProduction && r.TLS == nil {
		proto := r.Header.Get("X-Forwarded-Proto")
		if proto != "https" {
			log.Warn().Str("user_id", userID).Msg("PH7: WebSocket rejected — TLS required in production")
			http.Error(w, "secure connection required", http.StatusForbidden)
			return
		}
	}

	// ── Step 3: Check connection limit ───────────────────────────

	if wsh.pool.UserConnectionCount(userID) >= maxConnectionsPerUser {
		log.Warn().Str("user_id", userID).Int("limit", maxConnectionsPerUser).
			Msg("PH7: WebSocket rejected — connection limit exceeded")
		http.Error(w, "too many connections", http.StatusTooManyRequests)
		return
	}

	// ── Step 4: Upgrade to WebSocket ─────────────────────────────

	acceptOpts := &websocket.AcceptOptions{}
	// If token was sent via Sec-WebSocket-Protocol, echo it back as the selected subprotocol
	if subprotocol != "" {
		acceptOpts.Subprotocols = []string{subprotocol}
	}

	conn, err := websocket.Accept(w, r, acceptOpts)
	if err != nil {
		log.Error().Err(err).Msg("PH7: WebSocket upgrade failed")
		return
	}

	// Set read limit to prevent memory exhaustion (64 KB max message)
	conn.SetReadLimit(64 * 1024)

	connID := uuid.New().String()

	// ── Step 5: Register in connection pool ──────────────────────

	pc := &PoolConnection{
		ConnID:      connID,
		UserID:      userID,
		DeviceID:    deviceID,
		Conn:        conn,
		ConnectedAt: time.Now(),
	}

	if err := wsh.pool.Add(pc); err != nil {
		log.Warn().Err(err).Str("user_id", userID).Msg("PH7: pool.Add failed")
		conn.Close(websocket.StatusTryAgainLater, "connection limit exceeded")
		return
	}

	// Register with heartbeat tracker
	if wsh.syncService.tracker != nil {
		wsh.syncService.tracker.Register(userID, connID, deviceID)
	}

	log.Info().
		Str("user_id", userID).
		Str("conn_id", connID).
		Str("device_id", deviceID).
		Int("user_connections", wsh.pool.UserConnectionCount(userID)).
		Msg("PH7: WebSocket authenticated and connected")

	// ── Step 6: Run connection loop (blocking) ───────────────────

	wsh.runConnectionLoop(r.Context(), conn, pc)

	// ── Step 7: Cleanup on disconnect ────────────────────────────

	wsh.pool.Remove(connID)
	if wsh.syncService.tracker != nil {
		wsh.syncService.tracker.Remove(connID)
	}

	log.Info().
		Str("user_id", userID).
		Str("conn_id", connID).
		Dur("session_duration", time.Since(pc.ConnectedAt)).
		Msg("PH7: WebSocket disconnected")
}

// runConnectionLoop handles bidirectional messaging until the connection closes.
func (wsh *WSHandler) runConnectionLoop(parentCtx context.Context, conn *websocket.Conn, pc *PoolConnection) {
	ctx, cancel := context.WithCancel(parentCtx)
	defer cancel()

	// Subscribe to Redis pub/sub for this user
	pubsub := wsh.syncService.redisClient.Subscribe(ctx, "sync:"+pc.UserID)
	defer pubsub.Close()
	redisCh := pubsub.Channel()

	// Client message channel (read goroutine → main loop)
	clientMsgCh := make(chan ClientMessage, 16)
	readErrCh := make(chan error, 1)

	// Read loop goroutine
	go func() {
		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				readErrCh <- err
				return
			}

			// Update activity timestamps
			wsh.pool.UpdateActivity(pc.ConnID)
			if wsh.syncService.tracker != nil {
				wsh.syncService.tracker.UpdateActivity(pc.ConnID)
			}

			var msg ClientMessage
			if err := json.Unmarshal(data, &msg); err != nil {
				log.Debug().Err(err).Str("user_id", pc.UserID).Msg("PH7: invalid client message")
				continue
			}
			clientMsgCh <- msg
		}
	}()

	// Ping ticker for heartbeat (30s interval)
	pingTicker := time.NewTicker(30 * time.Second)
	defer pingTicker.Stop()

	// Main event loop
	for {
		select {
		case <-ctx.Done():
			return

		case err := <-readErrCh:
			log.Debug().Err(err).Str("conn_id", pc.ConnID).Msg("PH7: read error")
			return

		case redisMsg := <-redisCh:
			// Forward encrypted event from Redis to this client
			serverMsg := ServerMessage{
				Type:    "sync",
				Message: redisMsg.Payload,
			}
			msgJSON, _ := json.Marshal(serverMsg)
			if err := conn.Write(ctx, websocket.MessageText, msgJSON); err != nil {
				log.Debug().Err(err).Str("conn_id", pc.ConnID).Msg("PH7: write error")
				return
			}

		case clientMsg := <-clientMsgCh:
			wsh.handleClientMessage(ctx, conn, pc, clientMsg)

		case <-pingTicker.C:
			// Server-initiated ping for keepalive
			if err := conn.Ping(ctx); err != nil {
				if wsh.syncService.tracker != nil {
					wsh.syncService.tracker.RecordMissedPong(pc.ConnID)
				}
				log.Debug().Err(err).Str("conn_id", pc.ConnID).Msg("PH7: ping failed")
			}
		}
	}
}

// handleClientMessage processes a single message from the client.
func (wsh *WSHandler) handleClientMessage(ctx context.Context, conn *websocket.Conn, pc *PoolConnection, msg ClientMessage) {
	switch msg.Type {
	case "ping":
		// Respond with pong
		pongMsg := ServerMessage{Type: "pong"}
		pongJSON, _ := json.Marshal(pongMsg)
		if err := conn.Write(ctx, websocket.MessageText, pongJSON); err != nil {
			return
		}
		if wsh.syncService.tracker != nil {
			wsh.syncService.tracker.RecordPong(pc.ConnID)
		}

	case "sync":
		// Client pushing an encrypted sync event — broadcast to other devices
		var event SyncEvent
		if err := json.Unmarshal(msg.Data, &event); err != nil {
			sendError(ctx, conn, "invalid sync event")
			return
		}

		// PH7-FIX: Validate encrypted payload is present (zero-knowledge check)
		if event.EncryptedData == "" || event.Nonce == "" {
			sendError(ctx, conn, "encrypted_data and nonce are required")
			return
		}

		// Assign server-side metadata
		event.ID = uuid.New().String()
		event.UserID = pc.UserID
		event.Timestamp = time.Now().UTC()
		event.Sequence = atomic.AddUint64(&wsh.syncService.seq, 1)

		// Broadcast via Redis to all user's devices (including this one via pub/sub)
		if err := wsh.syncService.PublishSyncEvent(ctx, pc.UserID, event); err != nil {
			sendError(ctx, conn, "sync publish failed")
			return
		}

		// Send ACK back to sender with assigned sequence
		ackMsg := ACKMessage{
			Type:       "ack",
			Sequence:   event.Sequence,
			OriginalID: event.ID,
		}
		ackJSON, _ := json.Marshal(ackMsg)
		conn.Write(ctx, websocket.MessageText, ackJSON)

	case "replay":
		// Client requests replay from last-seen sequence
		var replayReq struct {
			LastSequence uint64 `json:"last_sequence"`
		}
		if err := json.Unmarshal(msg.Data, &replayReq); err != nil {
			sendError(ctx, conn, "invalid replay request")
			return
		}

		events, err := wsh.syncService.ReplayEventsFromSequence(ctx, pc.UserID, replayReq.LastSequence)
		if err != nil {
			log.Error().Err(err).Msg("PH7: replay failed")
			sendError(ctx, conn, "replay failed")
			return
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
		log.Debug().Str("type", msg.Type).Str("user_id", pc.UserID).
			Msg("PH7: unhandled client message type")
	}
}

// ── Helpers ──────────────────────────────────────────────────────

// extractWSToken extracts the JWT from the WebSocket upgrade request.
// Priority:
//  1. Sec-WebSocket-Protocol header with "bearer-<token>" subprotocol
//  2. "token" query parameter
//  3. Authorization header "Bearer <token>"
//
// Returns the token string and the subprotocol name (if extracted from header).
func extractWSToken(r *http.Request) (token string, subprotocol string) {
	// 1. Check Sec-WebSocket-Protocol for "bearer-<token>"
	protocols := r.Header.Get("Sec-WebSocket-Protocol")
	if protocols != "" {
		for _, p := range strings.Split(protocols, ",") {
			p = strings.TrimSpace(p)
			if strings.HasPrefix(p, "bearer-") {
				return strings.TrimPrefix(p, "bearer-"), p
			}
		}
	}

	// 2. Check query parameter
	if t := r.URL.Query().Get("token"); t != "" {
		return t, ""
	}

	// 3. Check Authorization header (for non-browser clients)
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			return parts[1], ""
		}
	}

	return "", ""
}

// sendError sends an error message to the WebSocket client.
func sendError(ctx context.Context, conn *websocket.Conn, message string) {
	errMsg := ServerMessage{Type: "error", Message: message}
	errJSON, _ := json.Marshal(errMsg)
	conn.Write(ctx, websocket.MessageText, errJSON)
}

// HealthCheck returns an HTTP handler that reports sync service health.
func (wsh *WSHandler) HealthCheck() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		resp := map[string]interface{}{
			"status":            "ok",
			"active_connections": wsh.pool.TotalConnections(),
			"timestamp":         time.Now().UTC().Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}
}
