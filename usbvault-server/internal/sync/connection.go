// Package sync — connection.go implements a user→connections pool for multi-device routing.
//
// PH7-FIX: Connection pool maps each authenticated user to their active WebSocket
// connections across devices. Messages from one device are broadcast to all other
// connections for the same user, enabling real-time multi-device sync.
//
// Features:
//   - User → []Connection mapping with O(1) lookup
//   - Per-user connection limit enforcement
//   - Clean disconnect with reason codes
//   - Reconnection token generation for session resumption
//   - Thread-safe via sync.RWMutex
package sync

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	gosync "sync"
	"time"

	"github.com/rs/zerolog/log"
	"nhooyr.io/websocket"
)

// PoolConnection represents a single authenticated WebSocket connection.
type PoolConnection struct {
	// ConnID is a unique identifier for this connection (UUID).
	ConnID string
	// UserID is the authenticated user who owns this connection.
	UserID string
	// DeviceID identifies the device (from JWT claims).
	DeviceID string
	// Conn is the underlying WebSocket connection.
	Conn *websocket.Conn
	// ConnectedAt is when this connection was established.
	ConnectedAt time.Time
	// LastActivity is updated on every message send/receive.
	LastActivity time.Time
	// ReconnectToken is an opaque token for session resumption.
	ReconnectToken string
}

// ConnectionPool manages user → connections mapping for multi-device sync.
type ConnectionPool struct {
	mu          gosync.RWMutex
	connections map[string]*PoolConnection            // connID → connection
	userConns   map[string]map[string]*PoolConnection // userID → {connID → connection}
	maxPerUser  int
}

// NewConnectionPool creates a connection pool with the given per-user limit.
func NewConnectionPool(maxPerUser int) *ConnectionPool {
	if maxPerUser <= 0 {
		maxPerUser = maxConnectionsPerUser
	}
	return &ConnectionPool{
		connections: make(map[string]*PoolConnection),
		userConns:   make(map[string]map[string]*PoolConnection),
		maxPerUser:  maxPerUser,
	}
}

// Add registers a new connection in the pool. Returns an error if the per-user
// limit would be exceeded.
func (cp *ConnectionPool) Add(pc *PoolConnection) error {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	// Check per-user limit
	if userMap, exists := cp.userConns[pc.UserID]; exists {
		if len(userMap) >= cp.maxPerUser {
			return fmt.Errorf("connection limit exceeded: user %s has %d/%d connections",
				pc.UserID, len(userMap), cp.maxPerUser)
		}
	}

	// Generate reconnection token
	pc.ReconnectToken = generateReconnectToken()
	pc.LastActivity = time.Now()

	// Register in both maps
	cp.connections[pc.ConnID] = pc
	if cp.userConns[pc.UserID] == nil {
		cp.userConns[pc.UserID] = make(map[string]*PoolConnection)
	}
	cp.userConns[pc.UserID][pc.ConnID] = pc

	log.Debug().
		Str("conn_id", pc.ConnID).
		Str("user_id", pc.UserID).
		Str("device_id", pc.DeviceID).
		Int("user_conn_count", len(cp.userConns[pc.UserID])).
		Msg("connection added to pool")

	return nil
}

// Remove removes a connection from the pool and cleans up empty user entries.
func (cp *ConnectionPool) Remove(connID string) {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	pc, exists := cp.connections[connID]
	if !exists {
		return
	}

	delete(cp.connections, connID)

	if userMap, ok := cp.userConns[pc.UserID]; ok {
		delete(userMap, connID)
		if len(userMap) == 0 {
			delete(cp.userConns, pc.UserID)
		}
	}

	log.Debug().
		Str("conn_id", connID).
		Str("user_id", pc.UserID).
		Dur("session_duration", time.Since(pc.ConnectedAt)).
		Msg("connection removed from pool")
}

// GetUserConnections returns all active connections for a user (excluding the
// optional excludeConnID, which is typically the sender).
func (cp *ConnectionPool) GetUserConnections(userID, excludeConnID string) []*PoolConnection {
	cp.mu.RLock()
	defer cp.mu.RUnlock()

	userMap, exists := cp.userConns[userID]
	if !exists {
		return nil
	}

	result := make([]*PoolConnection, 0, len(userMap))
	for _, pc := range userMap {
		if pc.ConnID != excludeConnID {
			result = append(result, pc)
		}
	}
	return result
}

// GetConnection returns a specific connection by ID.
func (cp *ConnectionPool) GetConnection(connID string) *PoolConnection {
	cp.mu.RLock()
	defer cp.mu.RUnlock()
	return cp.connections[connID]
}

// UserConnectionCount returns the number of active connections for a user.
func (cp *ConnectionPool) UserConnectionCount(userID string) int {
	cp.mu.RLock()
	defer cp.mu.RUnlock()

	if userMap, exists := cp.userConns[userID]; exists {
		return len(userMap)
	}
	return 0
}

// TotalConnections returns the total number of active connections across all users.
func (cp *ConnectionPool) TotalConnections() int {
	cp.mu.RLock()
	defer cp.mu.RUnlock()
	return len(cp.connections)
}

// UpdateActivity refreshes the LastActivity timestamp for a connection.
func (cp *ConnectionPool) UpdateActivity(connID string) {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	if pc, exists := cp.connections[connID]; exists {
		pc.LastActivity = time.Now()
	}
}

// FindByReconnectToken looks up a connection by its reconnect token.
// Used for session resumption after a temporary disconnect.
func (cp *ConnectionPool) FindByReconnectToken(token string) *PoolConnection {
	cp.mu.RLock()
	defer cp.mu.RUnlock()

	for _, pc := range cp.connections {
		if pc.ReconnectToken == token {
			return pc
		}
	}
	return nil
}

// RemoveAllForUser removes all connections for a given user.
// Used when a user's JWT is revoked or account is deleted.
func (cp *ConnectionPool) RemoveAllForUser(userID string) []*PoolConnection {
	cp.mu.Lock()
	defer cp.mu.Unlock()

	userMap, exists := cp.userConns[userID]
	if !exists {
		return nil
	}

	removed := make([]*PoolConnection, 0, len(userMap))
	for connID, pc := range userMap {
		removed = append(removed, pc)
		delete(cp.connections, connID)
	}
	delete(cp.userConns, userID)

	log.Info().
		Str("user_id", userID).
		Int("connections_removed", len(removed)).
		Msg("all connections removed for user")

	return removed
}

// generateReconnectToken creates a cryptographically random token for session resumption.
func generateReconnectToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		// Fallback to timestamp-based token if crypto/rand fails (should never happen)
		return fmt.Sprintf("reconnect-%d", time.Now().UnixNano())
	}
	return base64.URLEncoding.EncodeToString(b)
}
