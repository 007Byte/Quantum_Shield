# QAV Troubleshooting Guide

This guide covers common issues, diagnostics, and solutions for the QAV (Quick Access Vault) platform.

## Table of Contents

1. [Common Setup Issues](#common-setup-issues)
2. [Build Failures](#build-failures)
3. [Runtime Debugging](#runtime-debugging)
4. [Performance Optimization](#performance-optimization)
5. [Monitoring & Alerts](#monitoring--alerts)

---

## Common Setup Issues

### Docker Compose Fails to Start

**Problem**: `docker-compose up` fails with port or service errors.

**Diagnosis**:
```bash
# Check if ports are already in use
sudo lsof -i -P -n | grep LISTEN

# Check Docker daemon status
docker ps
docker logs <container_id>

# Check compose file validity
docker-compose config
```

**Solutions**:

1. **Port Conflicts** (ports already in use):
   ```bash
   # Change ports in docker-compose.yml (e.g., 5432→5433 for Postgres)
   # OR kill processes using the port:
   sudo lsof -ti:5432 | xargs kill -9
   ```

2. **Memory Limits**:
   ```bash
   # Check Docker memory limit
   docker info | grep -i memory

   # Increase Docker Desktop memory (Settings > Resources)
   # Or set in compose file:
   services:
     postgres:
       mem_limit: 2g
   ```

3. **Network Issues**:
   ```bash
   # Restart Docker daemon
   docker system prune -a
   docker-compose down
   docker-compose up --build
   ```

### Database Connection Refused

**Problem**: `connection refused` or `postgres host not found`.

**Diagnosis**:
```bash
# Check if Postgres is running
docker ps | grep postgres

# Test connection from host
psql -h localhost -U qav_user -d qav_db

# Check logs
docker logs <postgres_container>
```

**Solutions**:

1. **Wait for Postgres startup** (initial setup takes 5-10 seconds):
   ```bash
   # Implement retry logic in application or use healthcheck
   until PGPASSWORD=password psql -h localhost -U qav_user -c "\q"; do
     echo 'Postgres is unavailable, sleeping...'
     sleep 1
   done
   ```

2. **Run migrations**:
   ```bash
   # Check migration status
   docker exec <container> go run ./migrations/migrate.go status

   # Run migrations manually
   docker exec <container> go run ./migrations/migrate.go up
   ```

3. **Verify environment variables**:
   ```bash
   # Check .env file
   grep DATABASE_URL .env

   # Override in compose
   services:
     api:
       environment:
         - DATABASE_URL=postgresql://qav_user:password@postgres:5432/qav_db
   ```

### Redis Connection Issues

**Problem**: `DENIED Redis password incorrect` or `connection timeout`.

**Diagnosis**:
```bash
# Test Redis connection
redis-cli -h localhost -p 6379 ping

# Check Redis configuration
docker exec <redis_container> redis-cli CONFIG GET maxmemory

# Monitor Redis commands
docker exec <redis_container> redis-cli MONITOR
```

**Solutions**:

1. **Password Issues**:
   ```bash
   # Verify password in env and Docker
   echo $REDIS_PASSWORD
   docker exec <redis_container> redis-cli CONFIG GET requirepass

   # Update if needed
   docker exec <redis_container> redis-cli CONFIG SET requirepass "new_password"
   ```

2. **Memory Exhaustion**:
   ```bash
   # Check Redis memory
   docker exec <redis_container> redis-cli INFO memory

   # Increase maxmemory in redis.conf or set in compose
   command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
   ```

3. **Connection Pool Exhaustion**:
   ```bash
   # Check active connections
   docker exec <redis_container> redis-cli CLIENT LIST | wc -l

   # Verify pool settings in application config
   grep -r "redis.*pool\|REDIS_POOL" ./cmd ./internal
   ```

### S3/MinIO Bucket Not Found

**Problem**: `NoSuchBucket` or `AccessDenied` errors from S3.

**Diagnosis**:
```bash
# List MinIO buckets
mc ls minio/

# Check bucket credentials
aws s3 ls s3://qav-dev --profile=local

# Test with MinIO client
mc ls minio/qav-dev
```

**Solutions**:

1. **Initialize Buckets**:
   ```bash
   # Run init script (usually idempotent)
   bash ./scripts/init-s3.sh

   # Or create manually with MinIO client
   mc mb minio/qav-dev
   mc mb minio/qav-cache
   ```

2. **Check IAM Credentials**:
   ```bash
   # Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
   echo $AWS_ACCESS_KEY_ID
   echo $AWS_SECRET_ACCESS_KEY

   # Test credentials
   aws sts get-caller-identity --profile=local
   ```

3. **Update S3 Endpoint**:
   ```bash
   # For local MinIO (not AWS)
   export AWS_ENDPOINT_URL=http://localhost:9000
   export AWS_REGION=us-east-1
   ```

---

## Build Failures

### Rust Compilation Errors

**Problem**: `error: linker 'cc' not found` or `could not compile`.

**Diagnosis**:
```bash
# Check Rust toolchain
rustc --version
rustup toolchain list

# Check for required build tools
gcc --version || echo "gcc not found"
pkg-config --version || echo "pkg-config not found"
```

**Solutions**:

1. **Install Build Dependencies** (Ubuntu/Debian):
   ```bash
   sudo apt-get update && sudo apt-get install -y \
     build-essential \
     pkg-config \
     libssl-dev \
     libclang-dev
   ```

2. **Update Rust Toolchain**:
   ```bash
   rustup update
   rustup component add rustfmt clippy
   ```

3. **Clear Compilation Cache**:
   ```bash
   cargo clean
   cargo build --release
   ```

4. **Check Feature Flags**:
   ```bash
   # Verify features are enabled
   grep "features\|pqc\|ffi" usbvault-crypto/Cargo.toml

   # Build with required features
   cargo build -p usbvault-crypto --features "pqc,ffi" --release
   ```

### Go Module Issues

**Problem**: `go: github.com/module: invalid version` or checksum errors.

**Diagnosis**:
```bash
# Check go.mod and go.sum
go mod tidy
go mod verify

# Check module cache
go clean -modcache
go list -m all
```

**Solutions**:

1. **Fix Dependency Versions**:
   ```bash
   # Download all dependencies
   go mod download

   # Verify checksums against go.sum
   go mod verify

   # If errors, update modules
   go get -u ./...
   go mod tidy
   ```

2. **Bypass Module Proxy** (if behind corporate proxy):
   ```bash
   export GOPROXY=direct
   export GOSUMDB=off
   go mod download
   ```

3. **Clear Cache and Retry**:
   ```bash
   go clean -modcache
   rm go.sum
   go mod download
   ```

### React Native Build Errors

**Problem**: `Expo build failed` or `pod install failed`.

**Diagnosis**:
```bash
# Check Expo setup
expo --version
expo doctor

# Check CocoaPods
pod --version
pod repo update
```

**Solutions**:

1. **Run Expo Doctor**:
   ```bash
   expo doctor
   # Follow suggestions for missing tools

   # Install Expo CLI if needed
   npm install -g expo-cli
   ```

2. **Fix iOS/CocoaPods Issues**:
   ```bash
   # Clean and reinstall pods
   cd usbvault-app/ios
   rm -rf Pods Podfile.lock
   pod install
   pod update
   ```

3. **Clean Build** (React Native):
   ```bash
   # Clear caches
   npm cache clean --force
   rm -rf node_modules
   npm install

   # Clear native build artifacts
   cd ios && xcodebuild clean -workspace Pods.xcworkspace
   ```

### FFI Linking Failures

**Problem**: `undefined reference to 'crypto_function'` or `symbol not found`.

**Diagnosis**:
```bash
# Check if FFI library was built
ls -la ./target/release/libusbvault_crypto.*

# Check cbindgen generation
ls -la ./usbvault-server/include/usbvault_crypto.h

# Verify exports
nm ./target/release/libusbvault_crypto.so | grep crypto_
```

**Solutions**:

1. **Rebuild FFI Library**:
   ```bash
   cd usbvault-crypto
   cargo build --release --features ffi
   cargo run --bin cbindgen
   ```

2. **Verify cbindgen Configuration**:
   ```bash
   # Check cbindgen.toml
   cat cbindgen.toml

   # Run cbindgen manually
   cbindgen --crate usbvault_crypto \
     --output ../usbvault-server/include/usbvault_crypto.h \
     --language c
   ```

3. **Check LD_LIBRARY_PATH**:
   ```bash
   # Ensure library path includes Rust lib
   export LD_LIBRARY_PATH=$PWD/usbvault-crypto/target/release:$LD_LIBRARY_PATH
   ldd ./usbvault-server/cmd/api/api | grep libusbvault
   ```

---

## Runtime Debugging

### API Returns 500 (Internal Server Error)

**Problem**: API endpoint returns 500 with no clear error message.

**Diagnosis**:
```bash
# Check application logs
docker logs <api_container> -f --tail=100

# Enable debug logging
export LOG_LEVEL=debug
export RUST_BACKTRACE=1

# Test endpoint directly
curl -v http://localhost:8080/health

# Check structured logs (JSON format)
docker logs <api_container> | jq '.level, .message'
```

**Solutions**:

1. **Check Circuit Breaker State**:
   ```bash
   # If circuit breaker is OPEN, downstream service is failing
   # Verify health of Redis, Postgres, S3
   curl http://localhost:8080/health | jq '.services'
   ```

2. **Enable Panic Recovery Logging**:
   ```go
   // In main.go or middleware
   defer func() {
     if r := recover(); r != nil {
       log.Error().Interface("panic", r).Msg("panic recovered")
     }
   }()
   ```

3. **Check Application Logs for Root Cause**:
   ```bash
   # Look for keywords
   docker logs <api_container> 2>&1 | grep -i "error\|panic\|failed"
   ```

### WebSocket Disconnecting Unexpectedly

**Problem**: WebSocket connection drops; client sees `connection reset`.

**Diagnosis**:
```bash
# Check connection heartbeat interval
grep -r "heartbeat\|ping\|30.*Second" ./internal/sync

# Monitor WebSocket connections
docker exec <api_container> ss -tlnp | grep 8080

# Check Redis pub/sub
docker exec <redis_container> redis-cli PUBSUB CHANNELS

# Review application logs
docker logs <api_container> | grep -i "websocket\|connection"
```

**Solutions**:

1. **Enable Heartbeat** (if disabled):
   ```go
   // in sync/service.go HandleWebSocket
   pingTicker := time.NewTicker(30 * time.Second)
   // Ensure ping is sent regularly
   ```

2. **Increase Read/Write Timeouts**:
   ```go
   // Set on websocket connection
   conn.SetReadDeadline(time.Now().Add(2 * time.Minute))
   conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
   ```

3. **Check Redis Pub/Sub Connection**:
   ```bash
   # Verify Redis subscription is active
   docker exec <redis_container> redis-cli CLIENT LIST | grep pub
   ```

### Encryption/Decryption Failures

**Problem**: `DECRYPTION_FAILED` or `ENCRYPTION_FAILED` errors.

**Diagnosis**:
```bash
# Check FFI error codes
grep -r "ffi_error\|CryptError" ./usbvault-server/internal

# Verify keys are loaded
grep -i "key_rotation\|jwt.*key" ./usbvault-server/cmd/api/main.go

# Test crypto directly
cd usbvault-crypto && cargo test --release
```

**Solutions**:

1. **Verify Key Configuration**:
   ```bash
   # Check if keys are properly loaded
   export JWT_ED25519_PUBLIC_KEY_FILE=/path/to/public.key
   export JWT_ED25519_PRIVATE_KEY_FILE=/path/to/private.key

   # Or use environment variables (less secure)
   export JWT_ED25519_PUBLIC_KEY="base64_encoded_key"
   ```

2. **Check Key Hierarchy**:
   ```bash
   # Verify master key is initialized
   curl http://localhost:8080/api/debug/keys | jq '.active_key_id'
   ```

3. **Enable Crypto Debug Logs**:
   ```bash
   export RUST_BACKTRACE=full
   export RUST_LOG=usbvault_crypto=debug
   ```

### Rate Limiting Issues (Too Many Requests)

**Problem**: Legitimate users getting `429 Too Many Requests`.

**Diagnosis**:
```bash
# Check rate limit configuration
grep -r "RateLimit\|PerIP\|PerUser" ./internal/middleware

# Monitor Redis rate limit keys
docker exec <redis_container> redis-cli KEYS "ratelimit:*" | wc -l

# Check current limits
docker exec <redis_container> redis-cli GET "ratelimit:ip:127.0.0.1"
```

**Solutions**:

1. **Adjust Rate Limits**:
   ```go
   // in middleware/ratelimit.go
   type RateLimitConfig struct {
     PerIP    int = 100  // Increase from 60
     PerUser  int = 1000 // Increase from 500
     Window   time.Duration = time.Minute
   }
   ```

2. **Check Redis Fallback Mode**:
   ```bash
   # If Redis is down, in-memory fallback has stricter limits
   # Ensure Redis is healthy: docker exec <redis> redis-cli PING
   ```

3. **Whitelist High-Volume Clients**:
   ```go
   // Add client-specific limits in middleware
   if isInternalService(getClientIP(r)) {
     return nil // Skip rate limiting
   }
   ```

### Slow Query Performance

**Problem**: Database queries taking >500ms, causing API slowness.

**Diagnosis**:
```bash
# Enable query logging
export POSTGRES_LOG_STATEMENT=all

# Check slow queries
docker exec <postgres> psql -U qav_user -d qav_db \
  -c "SELECT query, mean_exec_time FROM pg_stat_statements \
      ORDER BY mean_exec_time DESC LIMIT 5;"

# Analyze query plans
docker exec <postgres> psql -U qav_user -d qav_db \
  -c "EXPLAIN ANALYZE SELECT * FROM vaults WHERE owner_id = '...';"
```

**Solutions**:

1. **Add Indexes**:
   ```sql
   -- Create index on frequently queried columns
   CREATE INDEX idx_vaults_owner_id ON vaults(owner_id);
   CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

   -- Verify index usage
   EXPLAIN ANALYZE SELECT * FROM vaults WHERE owner_id = '...';
   ```

2. **Enable PgBouncer** (connection pooling):
   ```ini
   # pgbouncer.ini
   [databases]
   qav_db = host=localhost port=5432 dbname=qav_db

   [pgbouncer]
   pool_mode = transaction
   max_client_conn = 100
   default_pool_size = 20
   ```

3. **Enable OpenTelemetry Tracing**:
   ```bash
   export OTEL_ENABLED=true
   export OTEL_JAEGER_ENDPOINT=http://localhost:14268/api/traces
   ```

---

## Performance Optimization

### Database Query Optimization

**Goal**: Reduce p99 latency from 500ms to <100ms.

**Techniques**:

1. **Use EXPLAIN ANALYZE**:
   ```sql
   EXPLAIN ANALYZE
   SELECT v.id, v.encrypted_metadata, COUNT(vm.user_id) as member_count
   FROM vaults v
   LEFT JOIN vault_members vm ON v.id = vm.vault_id
   WHERE v.owner_id = $1 AND v.deleted_at IS NULL
   GROUP BY v.id
   ORDER BY v.created_at DESC
   LIMIT 50;
   ```

2. **Add Indexes** (if Sequential Scan):
   ```sql
   CREATE INDEX idx_vaults_owner_deleted
   ON vaults(owner_id, deleted_at)
   WHERE deleted_at IS NULL;

   CREATE INDEX idx_vault_members_vault_id
   ON vault_members(vault_id);
   ```

3. **Batch Queries**:
   ```go
   // Instead of N+1 queries:
   vaults, _ := ListVaults(ctx, userID)
   for _, vault := range vaults {
     members, _ := GetMembers(ctx, vault.ID) // N queries!
   }

   // Use batch query:
   vaultsWithMembers, _ := ListVaultsWithMembers(ctx, userID) // 1 query
   ```

### Redis Memory Management

**Goal**: Reduce memory usage from 2GB to <1GB.

**Techniques**:

1. **Configure Eviction Policy**:
   ```bash
   # Set maxmemory-policy to automatically remove old entries
   docker exec <redis> redis-cli CONFIG SET maxmemory-policy "allkeys-lru"
   ```

2. **Set Key TTLs**:
   ```go
   // Ensure all keys have expiration
   redisClient.SetEx(ctx, key, value, 24*time.Hour)

   // For session tokens
   redisClient.Set(ctx, "revoked:"+jti, "1", tokenTTL)
   ```

3. **Monitor Memory Usage**:
   ```bash
   # Check memory stats
   docker exec <redis> redis-cli INFO memory

   # See top keys by size
   docker exec <redis> redis-cli --bigkeys
   ```

### React Native Performance

**Goal**: Reduce app startup time from 3s to <1s.

**Techniques**:

1. **Enable Hermes Engine**:
   ```json
   // app.json
   {
     "expo": {
       "plugins": [
         ["expo-build-properties", {
           "ios": { "useFrameworks": "static" },
           "android": { "enableHermes": true }
         }]
       ]
     }
   }
   ```

2. **Use React.memo for List Items**:
   ```jsx
   const VaultItem = React.memo(({ vault, onPress }) => (
     <TouchableOpacity onPress={() => onPress(vault.id)}>
       <Text>{vault.name}</Text>
     </TouchableOpacity>
   ));
   ```

3. **Optimize FlatList**:
   ```jsx
   <FlatList
     data={vaults}
     keyExtractor={item => item.id}
     renderItem={({ item }) => <VaultItem vault={item} />}
     maxToRenderPerBatch={10}
     updateCellsBatchingPeriod={50}
     removeClippedSubviews
   />
   ```

### Crypto Performance

**Goal**: Encrypt 100MB file in <10 seconds (currently 30s).

**Techniques**:

1. **Use Streaming Encryption**:
   ```rust
   // Instead of loading entire file into memory
   let mut encrypted = Vec::new();
   for chunk in file_chunks {
     encrypted_chunk = encrypt_chunk(&chunk)?;
     writer.write_all(&encrypted_chunk)?;
   }
   ```

2. **Batch Operations**:
   ```rust
   // Encrypt multiple vaults' metadata in parallel
   let handles: Vec<_> = vaults.iter()
     .map(|vault| {
       thread::spawn(move || {
         encrypt_vault_metadata(vault)
       })
     })
     .collect();
   ```

3. **Profile with perf/flamegraph**:
   ```bash
   # Identify hotspots
   cargo install flamegraph
   cargo flamegraph --bin api -- --profile cpu
   ```

---

## Monitoring & Alerts

### Prometheus Metrics

**Key Metrics to Watch**:

```
# Latency
http_request_duration_seconds{endpoint="/api/vaults"}

# Errors
http_requests_total{status="5xx"}

# Rate limiter
ratelimit_exceeded_total{type="ip"}

# Database
db_query_duration_seconds{query="list_vaults"}

# Crypto
crypto_operation_duration_seconds{operation="encrypt"}

# WebSocket
websocket_connections_total{event="connect"}
```

**Query Examples**:

```bash
# 95th percentile API latency
histogram_quantile(0.95, http_request_duration_seconds)

# Error rate (5xx / total)
sum(rate(http_requests_total{status=~"5.."}[5m])) /
sum(rate(http_requests_total[5m]))

# Rate limit rejections per minute
rate(ratelimit_exceeded_total[1m])
```

### Grafana Dashboard Setup

**Key Panels**:

1. **Request Rate & Latency**:
   - Query: `http_requests_total` (stacked by endpoint)
   - Query: `histogram_quantile(0.99, http_request_duration_seconds)`

2. **Error Tracking**:
   - Query: `http_requests_total{status=~"5.."}`
   - Alert: > 10 errors per minute

3. **Database Performance**:
   - Query: `db_query_duration_seconds` (by operation)
   - Alert: p99 latency > 500ms

4. **Resource Usage**:
   - Memory: `process_resident_memory_bytes`
   - CPU: `rate(process_cpu_seconds_total[1m])`
   - Connections: `db_connections_used`

### Alert Thresholds

| Alert | Threshold | Severity |
|-------|-----------|----------|
| High Error Rate | > 5% of requests | Critical |
| API p99 Latency | > 1s | Warning |
| Database Slow Query | > 500ms | Warning |
| Redis Memory | > 90% capacity | Critical |
| Rate Limit Surge | > 100 rejects/min | Warning |
| Circuit Breaker Open | Any | Critical |
| WebSocket Disconnects | > 10/min | Warning |

### Health Check Endpoint

```bash
# Check system health
curl http://localhost:8080/health | jq '.'

# Expected response:
{
  "status": "healthy",
  "services": {
    "database": "ok",
    "redis": "ok",
    "s3": "ok",
    "crypto": "ok"
  },
  "uptime_seconds": 3600
}
```

---

## Additional Resources

- **Logs**: `docker logs <container> -f`
- **Metrics**: `http://localhost:9090` (Prometheus)
- **Traces**: `http://localhost:16686` (Jaeger)
- **Database**: `psql -h localhost -U qav_user -d qav_db`
- **Redis CLI**: `redis-cli -h localhost -p 6379`

For security issues, contact the security team immediately.
