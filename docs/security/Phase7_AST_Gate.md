# Phase 7 AST Gate: Real-Time Sync & Multi-Device

**Date:** 2026-03-12
**Status:** PASS
**Phase:** 7 — Real-Time Sync & Multi-Device

---

## Security Controls Verified

### 1. WebSocket Auth: JWT Required on Upgrade

- **File:** `usbvault-server/internal/sync/websocket.go` (`WSHandler.ServeHTTP`)
- **Control:** Every WebSocket upgrade request MUST present a valid JWT access token.
- **Extraction methods (priority order):**
  1. `Sec-WebSocket-Protocol` header with `bearer-<token>` subprotocol (preferred, avoids URL logging)
  2. `?token=<jwt>` query parameter
  3. `Authorization: Bearer <token>` header
- **Validation:** Token is verified via `auth.ValidateToken()` which checks Ed25519 signature, expiration, and token type (`access` only).
- **Test coverage:** `websocket_test.go` — `TestWSHandlerRejectsWithoutJWT`, `TestWSHandlerRejectsInvalidJWT`, `TestExtractWSToken`

### 2. No Plaintext Sync Data on Server (Zero-Knowledge)

- **File:** `usbvault-server/internal/sync/service.go` (`PublishSyncEvent`)
- **Control:** All sync payloads are opaque encrypted blobs (XChaCha20-Poly1305). The server validates that `EncryptedData` is non-empty and base64-valid but NEVER attempts decryption.
- **Enforcement:**
  - `PublishSyncEvent` rejects events with empty `EncryptedData` or `Nonce`
  - `WSHandler.handleClientMessage` validates presence before broadcast
  - `SyncMessageEnvelope.EncryptedPayload` is documented as opaque
- **Test coverage:** `websocket_test.go` — `TestServerNeverDecryptsPayload`

### 3. Heartbeat Prevents Stale Connections

- **File:** `usbvault-server/internal/sync/heartbeat.go` (`ConnectionTracker`)
- **Control:** Server sends WebSocket ping every 30 seconds. Connections with 3+ missed pongs are marked stale and cleaned up. Idle timeout of 5 minutes as safety net.
- **Configuration:** `HeartbeatConfig` with `PingInterval=30s`, `PongTimeout=10s`, `MaxMissedPongs=3`, `IdleTimeout=5min`
- **Cleanup:** `CleanupStaleConnections` runs as a background goroutine checking every 10 seconds
- **Test coverage:** `websocket_test.go` — `TestHeartbeatKeepsConnectionAlive`, `TestConnectionClosedAfterTimeout`

### 4. Reconnection Uses Fresh JWT

- **File:** `usbvault-app/src/services/syncService.ts` (`_openWebSocket`)
- **Control:** On every reconnection attempt, the client creates a new WebSocket with the current `_authToken`. The server validates the JWT on every upgrade — stale or revoked tokens are rejected at connection time.
- **Backoff:** Exponential backoff with jitter (1s, 2s, 4s, 8s, ... max 60s) prevents thundering herd on server recovery.
- **Event replay:** On reconnect, client sends `last_sequence` to request missed events.

### 5. Connection Pool Cleaned on Disconnect

- **File:** `usbvault-server/internal/sync/connection.go` (`ConnectionPool`)
- **Control:** When a WebSocket connection closes (graceful or error), `WSHandler.ServeHTTP` defers `pool.Remove(connID)` and `tracker.Remove(connID)`. The connection is removed from both the global `connections` map and the per-user `userConns` map. Empty user entries are garbage collected.
- **Additional:** `RemoveAllForUser` provides bulk cleanup for JWT revocation/account deletion.
- **Test coverage:** `websocket_test.go` — `TestConnectionPool` (add/remove, limit enforcement, RemoveAllForUser)

---

## Files Involved

| File | Purpose |
|------|---------|
| `usbvault-server/internal/sync/websocket.go` | JWT auth on WS upgrade, message routing, health check |
| `usbvault-server/internal/sync/connection.go` | User-to-connections pool with per-user limits |
| `usbvault-server/internal/sync/protocol.go` | Message type constants, envelope types, disconnect reasons |
| `usbvault-server/internal/sync/service.go` | SyncService core: Redis pub/sub, event replay, validation |
| `usbvault-server/internal/sync/heartbeat.go` | ConnectionTracker, stale cleanup, heartbeat config |
| `usbvault-server/internal/sync/crdt.go` | LWW registers, vector clocks, OR-Set for conflict resolution |
| `usbvault-server/internal/sync/websocket_test.go` | Auth, pool, heartbeat, zero-knowledge, protocol tests |
| `usbvault-app/src/services/syncService.ts` | Client WebSocket with reconnection, heartbeat, offline queue |
| `usbvault-app/src/stores/syncStore.ts` | Zustand store for reactive sync state |
| `usbvault-server/cmd/api/main.go` | Route registration: `/api/v1/sync/ws`, `/api/v1/sync/health` |
