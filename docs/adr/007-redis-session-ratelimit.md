# ADR-007: Redis for Sessions, Rate Limiting, and Pub/Sub

## Status: Accepted

## Date: 2024-02-20

## Context

QAV requires fast, ephemeral storage for:

- Session tokens (authentication, 2-hour expiry)
- Rate-limit counters (per-user, per-IP, per-endpoint)
- WebSocket pub/sub for real-time vault sync notifications
- Distributed cache for user metadata (avoid PostgreSQL lock contention)

Requirements:
- Sub-millisecond latency (<2ms p99)
- Automatic expiration (sessions must expire without cleanup jobs)
- Clustering for HA (automatic failover)
- Persistence optional (data loss acceptable after restart)

## Decision

Deploy **Redis 7+ (Sentinel HA topology)** for:

1. **Sessions**: `session:{session_id}` → JSON (user_id, created_at, scopes)
   - TTL: 2 hours, sliding window on access
   - Invalidation: `DEL session:{id}` on logout

2. **Rate Limits**: `ratelimit:{user_id}:{endpoint}` → counter
   - TTL: 60 seconds (per-minute limit), auto-expire
   - Check-and-increment via Lua script (atomic)

3. **Pub/Sub**: Channel `vault.{vault_id}.updates`
   - Clients subscribe for real-time sync notifications
   - Publish on vault encryption/decryption events

4. **Cache**: `cache:{resource_type}:{id}` → compressed JSON
   - TTL: variable (1-24 hours by resource)
   - Invalidate on write via broadcast

## Alternatives Considered

1. **Memcached**
   - Pros: Simpler operation, lighter-weight, faster for GET
   - Cons: No Pub/Sub, no Lua scripting, no HA failover (only client-side consistent hashing)

2. **In-Process Memory (Go map)**
   - Pros: Lowest latency, no network round-trip
   - Cons: Not shared across instances, no persistence, manual expiration logic

3. **PostgreSQL with pg_notify**
   - Pros: Single data store, ACID guarantees
   - Cons: Slower than Redis, not designed for high-throughput pub/sub, bloats database

## Consequences

### Positive Outcomes

- Session authentication latency near-zero (in-memory lookup)
- Rate limiting atomic via Lua scripting (no race conditions)
- Pub/Sub enables real-time sync (WebSocket push vs polling)
- TTL automatic expiration (no cleanup jobs needed)
- Easy horizontal scaling via Redis Cluster (future)
- Data loss acceptable (non-critical data, easy recovery)

### Negative Outcomes

- Additional infrastructure to manage and monitor
- Redis Sentinel requires 3-node setup for quorum (HA complexity)
- Network latency between services (mitigated: co-locate in same availability zone)
- Memory bounded by available RAM (must size cluster upfront)
- Pub/Sub messages not persistent (offline subscribers miss updates, mitigated: sync on reconnect)

## Implementation Notes

- Go client: `github.com/redis/go-redis/v9` with connection pooling
- Session check: `redis.GetEX(ctx, "session:{id}", 2*time.Hour)` (sliding window)
- Rate limit Lua script: atomic increment with expiry in single call
- Pub/Sub: backend publishes via `redis.Publish("vault.{id}.updates", event)`
- Sentinel config: 3 Redis instances (primary, replica1, replica2) + 3 Sentinel instances
- Automatic failover: master failure → Sentinel elects new master in <30 seconds
- Monitoring: Redis memory usage, key eviction rate, Sentinel quorum status
