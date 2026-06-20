# WebSocket Sync Protocol

## Overview

USBVault uses a WebSocket-based real-time synchronization system for multi-device vault sync. The server acts as an encrypted message relay -- it routes opaque, end-to-end encrypted payloads between a user's devices without ever decrypting them (zero-knowledge architecture).

Key properties:

- **End-to-end encrypted**: All sync payloads are XChaCha20-Poly1305 ciphertext produced by the client-side Rust crypto core. The server cannot read them.
- **Sequence-ordered**: Every event gets a server-assigned monotonic sequence number for reliable ordering and reconnection replay.
- **Multi-device**: Each user can have up to 5 concurrent WebSocket connections (one per device).
- **Redis-backed**: Events are broadcast via Redis pub/sub across API server instances and persisted in Redis sorted sets for reconnection replay (last 1000 events, 24-hour TTL).
- **CRDT conflict resolution**: Concurrent edits from multiple devices are resolved using Last-Writer-Wins registers, vector clocks, and OR-Sets.

## Connection Establishment

### WebSocket URL

```
Production:  wss://api.usbvault.io/sync/ws
Development: ws://localhost:<port>/sync/ws
```

There is also a legacy endpoint at `/sync/legacy` which requires the standard auth middleware (JWT in `Authorization` header) rather than WebSocket-level authentication.

A health check endpoint is available at `GET /sync/health`:
```json
{
  "status": "ok",
  "active_connections": 42,
  "timestamp": "2026-03-23T12:00:00Z"
}
```

### Authentication

JWT authentication is required on every WebSocket upgrade. The token is extracted in priority order:

1. **Sec-WebSocket-Protocol header** (preferred) -- send subprotocol `bearer-<jwt_token>`. The server echoes the subprotocol back in the upgrade response.
2. **Query parameter** -- `?token=<jwt_token>`
3. **Authorization header** -- `Authorization: Bearer <jwt_token>` (for non-browser clients)

The JWT must be an `access` token type. The server extracts `user_id` and `device_id` from the token claims.

### TLS Enforcement

In production (`ENVIRONMENT=production`), the server rejects WebSocket connections that are not over TLS. It checks `r.TLS` and falls back to the `X-Forwarded-Proto` header for connections behind a reverse proxy.

### Connection Limits

Each user is limited to **5 concurrent WebSocket connections**. Attempts to open a 6th connection receive HTTP 429 (Too Many Requests). When a user's JWT is revoked or account is deleted, all connections for that user are closed.

### Read Limit

WebSocket messages are capped at **64 KB** to prevent memory exhaustion attacks.

## Connection Lifecycle

```
Client                          Server                         Redis
  |                               |                              |
  |── WS Upgrade + JWT ──────────>|                              |
  |                               |── Validate JWT               |
  |                               |── Check connection limit     |
  |                               |── Accept WebSocket           |
  |<── 101 Switching Protocols ───|                              |
  |                               |── Register in pool           |
  |                               |── Register in heartbeat      |
  |                               |   tracker                    |
  |                               |── Subscribe to Redis ───────>|
  |                               |   channel: sync:<user_id>    |
  |                               |                              |
  |── { type: "replay",          |                              |
  |     data: {last_sequence: N}} |                              |
  |                               |── ZRangeByScore ────────────>|
  |                               |   sync:replay:<user_id>      |
  |                               |   min: (N, max: +inf         |
  |<── { type: "sync", event }  ──|<── missed events ───────────|
  |<── { type: "sync", event }  ──|                              |
  |<── { type: "replay_complete"} |                              |
  |                               |                              |
  |       ~~~ normal operation ~~~                               |
  |                               |                              |
  |── { type: "sync", data: ... } |                              |
  |                               |── Validate encrypted_data    |
  |                               |── Assign ID, sequence, ts    |
  |                               |── Publish ──────────────────>|
  |                               |   channel: sync:<user_id>    |
  |                               |── ZAdd (persist for replay)->|
  |                               |   sync:replay:<user_id>      |
  |<── { type: "ack",            |                              |
  |      sequence: N+1 }          |                              |
  |                               |                              |
  |       ~~~ heartbeat ~~~                                      |
  |                               |                              |
  |<── WebSocket PING ────────────| (every 30 seconds)           |
  |── WebSocket PONG ────────────>|                              |
  |                               |── RecordPong                 |
  |                               |                              |
  |── { type: "ping" } ──────────>| (application-level)          |
  |<── { type: "pong" } ─────────|                              |
  |                               |                              |
  |       ~~~ disconnect ~~~                                     |
  |                               |                              |
  |<── { type: "disconnect",     |                              |
  |      reason: "TIMEOUT" }      |                              |
  |── Close ──────────────────────|                              |
  |                               |── Remove from pool           |
  |                               |── Remove from tracker        |
  |                               |── Unsubscribe ──────────────>|
```

## Message Types

### Client to Server

#### `ping`

Application-level keepalive. The server responds with `pong`.

```json
{
  "type": "ping"
}
```

#### `sync`

Push an encrypted sync event to all of the user's other devices.

```json
{
  "type": "sync",
  "data": {
    "event_type": "FILE_ADDED",
    "encrypted_data": "base64-encoded-xchacha20-poly1305-ciphertext",
    "nonce": "base64-encoded-24-byte-nonce"
  }
}
```

The server validates that `encrypted_data` and `nonce` are non-empty and that `encrypted_data` is valid base64. It then assigns server-side metadata (`id`, `user_id`, `timestamp`, `sequence`) and broadcasts via Redis pub/sub.

Valid `event_type` values:
- `FILE_ADDED` -- a file was added to a vault
- `FILE_DELETED` -- a file was removed from a vault
- `VAULT_UPDATED` -- vault metadata was changed
- `SHARE_RECEIVED` -- a shared vault/file was received

#### `replay`

Request replay of missed events since a given sequence number. Used on reconnection.

```json
{
  "type": "replay",
  "data": {
    "last_sequence": 42
  }
}
```

The server queries the Redis sorted set `sync:replay:<user_id>` for events with sequence > 42 and sends them as individual `sync` messages, followed by a `replay_complete` marker.

### Server to Client

#### `sync`

An encrypted sync event from another device (or replayed from history).

```json
{
  "type": "sync",
  "event": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user-uuid",
    "event_type": "FILE_ADDED",
    "encrypted_data": "base64-encoded-ciphertext",
    "nonce": "base64-encoded-nonce",
    "timestamp": "2026-03-23T12:00:00Z",
    "sequence": 43
  }
}
```

When forwarded from Redis pub/sub in real-time, the `message` field contains the serialized JSON string of the SyncEvent. When sent during replay, the `event` field contains the structured object.

#### `pong`

Response to a client `ping`.

```json
{
  "type": "pong"
}
```

#### `ack`

Acknowledgement of a client-pushed sync event, with the server-assigned sequence number.

```json
{
  "type": "ack",
  "sequence": 43,
  "original_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### `error`

An error related to a client message.

```json
{
  "type": "error",
  "message": "invalid sync event"
}
```

Possible error messages:
- `"invalid sync event"` -- malformed sync data
- `"encrypted_data and nonce are required"` -- missing encryption fields
- `"sync publish failed"` -- Redis publish error
- `"invalid replay request"` -- malformed replay data
- `"replay failed"` -- Redis query error

#### `replay_complete`

Marks the end of a replay sequence.

```json
{
  "type": "replay_complete",
  "message": "replayed 5 events"
}
```

#### `disconnect`

Sent before the server closes the connection. Includes a reason code and optionally a reconnection token.

```json
{
  "type": "disconnect",
  "reason": "TIMEOUT",
  "message": "connection idle for too long",
  "reconnect_token": "base64url-encoded-32-byte-token"
}
```

Reason codes:
| Code               | Meaning                                            | Recoverable |
|--------------------|----------------------------------------------------|-------------|
| `NORMAL`           | Clean client-initiated close                       | N/A         |
| `TIMEOUT`          | Server closed due to heartbeat timeout             | Yes         |
| `AUTH_EXPIRED`     | JWT expired during active session                  | Yes (re-auth) |
| `LIMIT_EXCEEDED`   | Too many connections for this user                 | Yes (close other) |
| `SERVER_SHUTDOWN`  | Server shutting down gracefully                    | Yes         |

When `reconnect_token` is provided, the client can use it to resume the session on reconnect.

## Envelope Protocol

In addition to the high-level `ClientMessage`/`ServerMessage` format used in the WebSocket handler, there is a lower-level `SyncMessageEnvelope` format defined for structured message routing:

```json
{
  "message_type": "SYNC_EVENT",
  "sequence": 43,
  "timestamp": "2026-03-23T12:00:00Z",
  "encrypted_payload": "base64-encoded-xchacha20-poly1305-ciphertext",
  "nonce": "base64-encoded-24-byte-nonce",
  "device_id": "device-uuid"
}
```

Valid `message_type` values:
| Type           | Description                          | Payload Required |
|----------------|--------------------------------------|------------------|
| `SYNC_EVENT`   | Generic encrypted event              | Yes              |
| `VAULT_UPDATE` | Encrypted vault metadata update      | Yes              |
| `FILE_CHANGE`  | Encrypted file add/delete/rename     | Yes              |
| `HEARTBEAT`    | Connection keepalive                 | No               |
| `ACK`          | Server acknowledgement               | No               |

## Heartbeat and Stale Connection Cleanup

The server maintains a heartbeat tracker for every WebSocket connection.

### Configuration (production defaults)

| Parameter        | Value       | Description                                  |
|------------------|-------------|----------------------------------------------|
| PingInterval     | 30 seconds  | Server-initiated WebSocket PING frequency    |
| PongTimeout      | 10 seconds  | Max wait for PONG response                   |
| MaxMissedPongs   | 3           | Missed PONGs before marking stale            |
| IdleTimeout      | 5 minutes   | Max time without any activity                |

### How it works

1. Every 30 seconds, the server sends a WebSocket-level PING frame.
2. The client responds with a PONG frame (handled automatically by WebSocket libraries).
3. If a PONG is not received, the server increments a `missed_pongs` counter.
4. A background goroutine runs every 10 seconds to check for stale connections.
5. A connection is marked stale if:
   - `missed_pongs >= 3`, OR
   - No activity (including PONG) for 5 minutes
6. Stale connections are closed and cleaned up from the connection pool.

Clients can also send application-level `{ "type": "ping" }` messages, which the server responds to with `{ "type": "pong" }`. This updates the activity timestamp the same way a WebSocket PONG does.

## Reconnection and Event Replay

### Event Persistence

Every sync event is persisted in a Redis sorted set keyed by user:

- **Key**: `sync:replay:<user_id>`
- **Score**: Event sequence number
- **Member**: Full serialized SyncEvent JSON

Retention policy:
- Maximum 1000 events per user (oldest trimmed via `ZREMRANGEBYRANK`)
- 24-hour TTL on the sorted set key

### Reconnection Flow

1. Client reconnects and authenticates via WebSocket.
2. Client sends a `replay` message with its last-seen sequence number.
3. Server queries Redis: `ZRANGEBYSCORE sync:replay:<user_id> (<last_sequence> +inf`
4. Server sends each missed event as a `sync` message.
5. Server sends a `replay_complete` marker.
6. Normal real-time sync resumes.

If the client has been offline for more than 24 hours, events may have expired. The client should fall back to a full sync via the REST API in this case.

## Redis Pub/Sub Broadcast Pattern

The sync system uses Redis pub/sub to distribute events across multiple API server instances.

### Channel Naming

```
sync:<user_id>
```

Each user has a dedicated pub/sub channel. When a sync event is published, every API instance subscribed to that user's channel forwards the event to the user's connected WebSocket clients on that instance.

### Flow

1. **Client A** sends a `sync` message via WebSocket to **Server 1**.
2. **Server 1** validates the payload, assigns a sequence number, and calls `PUBLISH sync:<user_id> <event_json>`.
3. **Server 1** also persists the event with `ZADD sync:replay:<user_id> <sequence> <event_json>`.
4. **Server 2** (which has **Client B** connected) receives the pub/sub message and forwards it to Client B's WebSocket.
5. **Server 1** sends an `ack` back to Client A with the assigned sequence number.

This architecture enables horizontal scaling -- any number of API servers can handle WebSocket connections, and Redis ensures events reach all of a user's devices regardless of which server they are connected to.

## CRDT Conflict Resolution

For concurrent edits from multiple devices, the sync system employs CRDTs (Conflict-free Replicated Data Types):

### Last-Writer-Wins Register

Used for single-value fields (e.g., vault name, file metadata). Conflicts are resolved by:
1. Higher timestamp wins.
2. If timestamps are equal, lexicographically higher `node_id` wins (deterministic tie-breaking).

### Vector Clocks

Track causal ordering across devices. Used to detect whether two events are causally related or concurrent:
- If clock A happens-before clock B, A's update is superseded.
- If clocks are concurrent, LWW or OR-Set resolution applies.

### OR-Set (Observed-Remove Set)

Used for managing file lists. Supports concurrent add and remove operations without conflicts:
- Each `Add(element)` is tagged with a unique identifier.
- `Remove(element)` removes all observed tags.
- Merge is the union of all tags across replicas.

This ensures that if one device adds a file while another removes a different file, both operations are preserved correctly.

## Security Considerations

- **Zero-knowledge**: The server never decrypts sync payloads. `encrypted_data` and `nonce` are opaque base64 blobs.
- **TLS required in production**: WebSocket connections must use WSS. Plain WS is rejected.
- **JWT on every connection**: No anonymous WebSocket connections are allowed.
- **Per-user connection limits**: Prevents resource exhaustion from a single compromised account.
- **64 KB message limit**: Prevents memory exhaustion from oversized messages.
- **Base64 validation**: The server validates that `encrypted_data` contains only valid base64 characters before forwarding.
- **Sequence integrity**: Server-assigned monotonic sequence numbers prevent replay attacks and ensure ordering.
