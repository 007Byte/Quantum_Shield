# ADR-004: PostgreSQL as Primary Data Store

## Status: Accepted

## Date: 2024-02-05

## Context

QAV requires a durable ACID data store for:

- User identity and encrypted vault records
- Audit logs and cryptographic key metadata
- Session tokens and rate-limit counters (transient)
- Full-text search over encrypted metadata (via computed columns)
- Multi-region replication for HA (future)

The application layer guarantees encryption before transmission to the database. PostgreSQL was chosen over NoSQL alternatives.

## Decision

**PostgreSQL 15+** as the primary store with:

- Migrations via numbered SQL files (`001_init_schema.sql`, `002_add_audit_table.sql`, etc.)
- Backward-compatible schema changes (ADD COLUMN ... DEFAULT, never DROP)
- Prepared statements exclusively (via `sqlc` code generation)
- Row-level encryption via application layer (server never stores plaintext)
- Optional: pgcrypto for server-side HMAC of metadata (not plaintext encryption)

## Alternatives Considered

1. **MongoDB**
   - Pros: Flexible schema, horizontal sharding, BSON native support
   - Cons: Eventual consistency complicates audit logs, no ACID transactions (pre v4.0), slower full-text search

2. **CockroachDB**
   - Pros: Distributed ACID, PostgreSQL-compatible, automatic HA
   - Cons: Expensive ($1000+/month), overkill for MVP, different failure modes (distributed consensus)

3. **SQLite (embedded)**
   - Pros: Zero ops, simple, fast for single-user
   - Cons: No concurrent writer support, not suitable for multi-instance deployment, poor replication story

## Consequences

### Positive Outcomes

- ACID guarantees prevent data corruption under partial failures
- SQL allows complex queries (JOIN, aggregation) without application logic
- Excellent performance for read-heavy workloads (our use case: vault access)
- Proven production stability (used at scale by 1000s of companies)
- Rich extension ecosystem (JSON operators, full-text search, PostGIS)
- Simple replication setup for HA via streaming replication

### Negative Outcomes

- Requires careful schema design upfront (schema evolution slower than NoSQL)
- Connection pooling complexity (PgBouncer for thousands of connections)
- Scaling writes requires sharding (application-level, no built-in support)
- Operational overhead: backup/restore, VACUUM, index maintenance

## Implementation Notes

- Migrations stored in `migrations/` directory with format `YYYYMMDD_HH_description.sql`
- All migrations tested in CI (`docker-compose up postgres && test migrations`)
- Schema immutable after production deployment (test changes in staging)
- Prepared statements via `sqlc` eliminate SQL injection
- Vault records stored in `vaults` table with:
  - `id` (UUID), `user_id` (FK), `encrypted_data` (bytea), `created_at` (timestamp)
  - `nonce` and `tag` stored alongside ciphertext for AEAD
- Audit log table with `event_type`, `user_id`, `resource_id`, `action` for compliance
