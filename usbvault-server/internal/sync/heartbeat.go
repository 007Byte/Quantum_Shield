package sync

import (
	"context"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// PH7-FIX: Connection heartbeat and stale session cleanup (CWE-613)

// HeartbeatConfig configures heartbeat behavior
type HeartbeatConfig struct {
	PingInterval   time.Duration // how often to send pings (default: 30s)
	PongTimeout    time.Duration // how long to wait for pong (default: 10s)
	MaxMissedPongs int           // max missed pongs before disconnect (default: 3)
	IdleTimeout    time.Duration // max idle time before cleanup (default: 5min)
}

// DefaultHeartbeatConfig returns production defaults
func DefaultHeartbeatConfig() HeartbeatConfig {
	return HeartbeatConfig{
		PingInterval:   30 * time.Second,
		PongTimeout:    10 * time.Second,
		MaxMissedPongs: 3,
		IdleTimeout:    5 * time.Minute,
	}
}

// TrackedConnection represents a tracked WebSocket connection
type TrackedConnection struct {
	UserID      string
	ConnID      string
	DeviceID    string
	ConnectedAt time.Time
	LastPongAt  time.Time
	MissedPongs int
	Active      bool
}

// ConnectionTracker tracks active WebSocket connections for stale cleanup
type ConnectionTracker struct {
	mu          sync.RWMutex
	connections map[string]*TrackedConnection // connID -> connection info
	config      HeartbeatConfig
}

// NewConnectionTracker creates a connection tracker
func NewConnectionTracker(config HeartbeatConfig) *ConnectionTracker {
	return &ConnectionTracker{
		connections: make(map[string]*TrackedConnection),
		config:      config,
	}
}

// Register registers a new connection
func (ct *ConnectionTracker) Register(userID, connID, deviceID string) {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	ct.connections[connID] = &TrackedConnection{
		UserID:      userID,
		ConnID:      connID,
		DeviceID:    deviceID,
		ConnectedAt: time.Now(),
		LastPongAt:  time.Now(),
		MissedPongs: 0,
		Active:      true,
	}

	log.Debug().
		Str("conn_id", connID).
		Str("user_id", userID).
		Str("device_id", deviceID).
		Msg("connection registered")
}

// RecordPong records a pong response
func (ct *ConnectionTracker) RecordPong(connID string) {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	if conn, exists := ct.connections[connID]; exists {
		conn.LastPongAt = time.Now()
		conn.MissedPongs = 0
		log.Debug().Str("conn_id", connID).Msg("pong received")
	}
}

// CheckStale returns stale connection IDs that should be terminated
// Stale is defined as:
// - Not responded to pong for MaxMissedPongs pings
// - Idle (no activity) for IdleTimeout
func (ct *ConnectionTracker) CheckStale() []string {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	var staleConnIDs []string
	now := time.Now()

	for connID, conn := range ct.connections {
		if !conn.Active {
			continue
		}

		// Check idle timeout
		if now.Sub(conn.LastPongAt) > ct.config.IdleTimeout {
			staleConnIDs = append(staleConnIDs, connID)
			log.Warn().
				Str("conn_id", connID).
				Str("user_id", conn.UserID).
				Dur("idle_duration", now.Sub(conn.LastPongAt)).
				Msg("connection marked stale due to idle timeout")
			continue
		}

		// Increment missed pongs (ping was sent, no pong received)
		// This is typically incremented externally when a ping is sent
		// but we check the threshold here
		if conn.MissedPongs >= ct.config.MaxMissedPongs {
			staleConnIDs = append(staleConnIDs, connID)
			log.Warn().
				Str("conn_id", connID).
				Str("user_id", conn.UserID).
				Int("missed_pongs", conn.MissedPongs).
				Msg("connection marked stale due to missed pongs")
		}
	}

	return staleConnIDs
}

// RecordMissedPong increments the missed pong counter for a connection
func (ct *ConnectionTracker) RecordMissedPong(connID string) {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	if conn, exists := ct.connections[connID]; exists {
		conn.MissedPongs++
		log.Debug().
			Str("conn_id", connID).
			Int("missed_pongs", conn.MissedPongs).
			Msg("missed pong recorded")
	}
}

// Remove removes a connection from tracking
func (ct *ConnectionTracker) Remove(connID string) {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	if conn, exists := ct.connections[connID]; exists {
		log.Debug().
			Str("conn_id", connID).
			Str("user_id", conn.UserID).
			Dur("connection_duration", time.Since(conn.ConnectedAt)).
			Msg("connection removed")
		delete(ct.connections, connID)
	}
}

// CleanupStaleConnections runs periodic cleanup of stale connections
// This function should be run as a goroutine in the main server loop
func (ct *ConnectionTracker) CleanupStaleConnections(ctx context.Context, onStale func(connID string)) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("connection cleanup routine stopped")
			return
		case <-ticker.C:
			staleConnIDs := ct.CheckStale()
			for _, connID := range staleConnIDs {
				if onStale != nil {
					onStale(connID)
				}
				ct.Remove(connID)
			}
		}
	}
}

// ActiveConnections returns count of active connections for a user
func (ct *ConnectionTracker) ActiveConnections(userID string) int {
	ct.mu.RLock()
	defer ct.mu.RUnlock()

	count := 0
	for _, conn := range ct.connections {
		if conn.UserID == userID && conn.Active {
			count++
		}
	}
	return count
}

// GetConnection retrieves a tracked connection by ID
func (ct *ConnectionTracker) GetConnection(connID string) *TrackedConnection {
	ct.mu.RLock()
	defer ct.mu.RUnlock()

	if conn, exists := ct.connections[connID]; exists {
		return conn
	}
	return nil
}

// UpdateActivity updates the last activity time for a connection
func (ct *ConnectionTracker) UpdateActivity(connID string) {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	if conn, exists := ct.connections[connID]; exists {
		conn.LastPongAt = time.Now()
	}
}

// ListConnectionsByUser returns all active connections for a user
func (ct *ConnectionTracker) ListConnectionsByUser(userID string) []*TrackedConnection {
	ct.mu.RLock()
	defer ct.mu.RUnlock()

	var result []*TrackedConnection
	for _, conn := range ct.connections {
		if conn.UserID == userID && conn.Active {
			result = append(result, conn)
		}
	}
	return result
}

// MarkInactive marks a connection as inactive
func (ct *ConnectionTracker) MarkInactive(connID string) {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	if conn, exists := ct.connections[connID]; exists {
		conn.Active = false
		log.Debug().Str("conn_id", connID).Msg("connection marked inactive")
	}
}
