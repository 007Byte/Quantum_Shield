# DOC-004: USBVault Enterprise -- IT Deployment Guide

| Field | Value |
|-------|-------|
| **Document ID** | DOC-004 |
| **Version** | 2.0 |
| **Date** | 2026-03-18 |
| **Classification** | Confidential -- IT Operations |
| **Audience** | IT administrators, enterprise deployment teams |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Deployment Models](#2-deployment-models)
3. [System Requirements](#3-system-requirements)
4. [USB-Only Deployment](#4-usb-only-deployment)
5. [Cloud-Connected Deployment](#5-cloud-connected-deployment)
6. [Docker Deployment](#6-docker-deployment)
7. [Kubernetes Deployment](#7-kubernetes-deployment)
8. [Environment Variable Configuration](#8-environment-variable-configuration)
9. [Database Setup and Migrations](#9-database-setup-and-migrations)
10. [TLS Certificate Setup](#10-tls-certificate-setup)
11. [Monitoring and Alerting](#11-monitoring-and-alerting)
12. [Security Configuration](#12-security-configuration)
13. [Backup Procedures](#13-backup-procedures)
14. [Upgrade Procedures](#14-upgrade-procedures)
15. [Bulk USB Provisioning](#15-bulk-usb-provisioning)
16. [Compliance](#16-compliance)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Overview

USBVault Enterprise is a zero-knowledge encrypted file storage system. This guide covers deploying the server-side infrastructure for cloud-connected mode, as well as preparing USB drives for standalone deployment.

### Zero-Knowledge Guarantee

The server **never** handles:
- User passwords or encryption keys
- Plaintext file contents or filenames
- Master Encryption Keys (MEK) or Key Encryption Keys (KEK)

The server **only** stores:
- SRP-6a verifiers (password hashes that cannot reverse the password)
- Encrypted blobs (opaque binary data)
- Authentication tokens and session data
- Billing and subscription information
- Audit log entries (encrypted details)

### Architecture Summary

| Component | Technology | Port |
|-----------|-----------|------|
| API Server | Go 1.25 (chi/v5) | 8080 |
| Database | PostgreSQL 16 | 5432 |
| Cache | Redis 7+ | 6379 |
| Blob Storage | S3-compatible (AWS S3, MinIO) | 443/9000 |
| Companion (client-side) | Node.js/Express | 3001 |

---

## 2. Deployment Models

### USB-Only (Standalone)

No server infrastructure required. The TOOLS partition on the USB drive contains everything needed:
- Portable Node.js runtime
- USB companion service
- Static web application
- Platform launchers (macOS, Windows, Linux)

Best for: Air-gapped environments, single-user setups, maximum privacy.

### Cloud-Connected

Full server deployment with authentication, sync, sharing, and billing. Requires PostgreSQL, Redis, and S3.

Best for: Teams, multi-device users, organizations requiring audit trails.

### Hybrid

Users can switch between modes. When `EXPO_PUBLIC_API_URL` is set, the app connects to the cloud. When not set (or when running from USB), it operates standalone.

---

## 3. System Requirements

### Server Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| Memory | 2 GB | 8 GB |
| Disk | 20 GB | 100 GB (depends on blob storage) |
| OS | Linux (Alpine 3.19+) | Ubuntu 22.04+ or Alpine |
| Docker | 24.0+ | Latest stable |
| Kubernetes | 1.28+ | Latest stable |

### Database Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| PostgreSQL | 16+ | pgx/v5 driver |
| Redis | 7+ | go-redis/v9 client |

### S3 Storage

Any S3-compatible storage:
- AWS S3
- MinIO (self-hosted)
- DigitalOcean Spaces
- Backblaze B2

### Client Requirements

| Platform | Requirement |
|----------|------------|
| Web | Modern browser with WebCrypto API |
| iOS | iOS 15+ (Expo 54) |
| Android | Android 8+ (API 26+) |
| USB Companion | Node.js (bundled on TOOLS partition) |

---

## 4. USB-Only Deployment

### TOOLS Partition Contents

```
TOOLS/
  launch-mac.sh          # macOS launcher
  launch-win.bat         # Windows launcher
  launch-linux.sh        # Linux launcher
  node/                  # Portable Node.js runtime
  companion/             # USB companion service
  static/                # Pre-built web application
  README.txt             # User instructions
  RECOVERY.txt           # Recovery guide
```

### Building the USB Image

```bash
# Export the web app for USB standalone mode
cd usbvault-app
EXPO_PUBLIC_API_URL= EXPO_PUBLIC_USB_STANDALONE=true \
  expo export --platform web --output-dir ../usb-companion/static

# Bundle portable Node.js
bash scripts/bundle-portable-node.sh
```

### USB Partition Layout

| Partition | Size | File System | Visibility |
|-----------|------|-------------|-----------|
| TOOLS | 500 MB | ExFAT | Visible |
| SECURE | Remaining | ExFAT | Hidden |

Partitioning scheme: GPT

---

## 5. Cloud-Connected Deployment

### Prerequisites

1. PostgreSQL 16 instance
2. Redis 7+ instance
3. S3-compatible storage bucket
4. TLS certificate (for production)
5. Stripe account (for billing)

### Quick Start (docker-compose)

```yaml
version: '3.8'
services:
  api:
    image: usbvault/api:latest
    ports:
      - "8080:8080"
    environment:
      - ENVIRONMENT=production
      - DATABASE_URL=postgres://usbvault:password@db:5432/usbvault?sslmode=require
      - REDIS_URL=redis://redis:6379
      - S3_ENDPOINT=http://minio:9000
      - S3_BUCKET=usbvault-files
      - S3_ACCESS_KEY=minioadmin
      - S3_SECRET_KEY=minioadmin
      - JWT_SIGNING_KEY=${JWT_SIGNING_KEY}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}
      - CORS_ALLOWED_ORIGINS=https://app.usbvault.io
    depends_on:
      - db
      - redis
      - minio

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=usbvault
      - POSTGRES_USER=usbvault
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

### Network Requirements

| Service | Protocol | Port | Direction |
|---------|----------|------|-----------|
| API Server | HTTPS | 443 (proxy) / 8080 (direct) | Inbound |
| WebSocket Sync | WSS | 443 (proxy) / 8080 (direct) | Inbound |
| PostgreSQL | TCP | 5432 | Internal |
| Redis | TCP | 6379 | Internal |
| S3 | HTTPS | 443 / 9000 (MinIO) | Internal/Outbound |
| Companion | HTTP | 3001 | Localhost only |
| Prometheus | HTTP | 9090 | Internal |
| Grafana | HTTP | 3000 | Internal |

---

## 6. Docker Deployment

### Building the Image

```bash
cd usbvault-server
docker build -t usbvault/api:latest .
```

### Dockerfile Architecture

The Dockerfile uses a multi-stage build:

**Stage 1 (Builder)**: `golang:1.23-alpine`
- Installs git, gcc, musl-dev
- Builds API server and migration CLI
- Produces stripped binaries (`-ldflags="-w -s"`)

**Stage 2 (Runtime)**: `alpine:3.19`
- Non-root user (uid 1001, gid 1001)
- Contains only binaries, migration SQL files, and CA certificates
- Health check: `curl -f http://localhost:8080/health`
- Exposes port 8080

### Security Features

- Non-root execution (`appuser:appgroup`)
- Minimal base image (Alpine)
- No build tools in runtime image
- Read-only root filesystem (when deployed in K8s)

---

## 7. Kubernetes Deployment

### Deployment Manifest

The deployment is configured for production use with:

- **3 replicas** for high availability
- **Rolling updates** with `maxSurge: 1`, `maxUnavailable: 0` (zero downtime)
- **Pod anti-affinity** to spread across nodes
- **Init container** for database migrations

### Applying the Deployment

```bash
# Create namespace
kubectl create namespace usbvault

# Create secrets
kubectl create secret generic usbvault-secrets \
  --namespace usbvault \
  --from-literal=database-url='postgres://...' \
  --from-literal=redis-url='redis://...' \
  --from-literal=jwt-signing-key='...' \
  --from-literal=stripe-secret-key='...' \
  --from-literal=stripe-webhook-secret='...'

# Apply deployment
kubectl apply -f deploy/k8s/deployment.yaml

# Apply migration job (if not using init container)
kubectl apply -f deploy/k8s/migration-job.yaml
```

### Pod Security Context

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  fsGroup: 10001
  seccompProfile:
    type: RuntimeDefault
containers:
  - securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
```

### Health Probes

| Probe | Path | Interval | Timeout | Threshold |
|-------|------|----------|---------|-----------|
| Liveness | `/health` | 30s | 5s | 3 failures |
| Readiness | `/ready` | 10s | 3s | Default |

### Resource Limits

| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 250m | 1000m |
| Memory | 256Mi | 512Mi |
| Init container CPU | 100m | 250m |
| Init container Memory | 128Mi | 256Mi |

### Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: usbvault-api
  namespace: usbvault
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: usbvault-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## 8. Environment Variable Configuration

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db?sslmode=require` |
| `REDIS_URL` | Redis connection string | `redis://host:6379` |
| `S3_ENDPOINT` | S3 endpoint URL | `https://s3.amazonaws.com` |
| `S3_BUCKET` | S3 bucket name | `usbvault-files` |

### Authentication Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SIGNING_KEY` | HMAC key for JWT tokens | (required) |
| `STRIPE_SECRET_KEY` | Stripe API key | (required for billing) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | (required for billing) |

### S3 Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `S3_ACCESS_KEY` | S3 access key (or `AWS_ACCESS_KEY_ID`) | (required) |
| `S3_SECRET_KEY` | S3 secret key (or `AWS_SECRET_ACCESS_KEY`) | (required) |
| `AWS_REGION` | AWS region | `us-east-1` |

### Server Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SERVER_PORT` | Listen port | `8080` |
| `ENVIRONMENT` | Environment name | (empty = development) |
| `LOG_LEVEL` | Logging level | `info` |
| `SERVER_READ_TIMEOUT` | HTTP read timeout | `15s` |
| `SERVER_WRITE_TIMEOUT` | HTTP write timeout | `15s` |
| `SERVER_IDLE_TIMEOUT` | HTTP idle timeout | `60s` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins | `https://localhost:3000,https://localhost:8081` |

### Database Pool Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_MAX_CONNECTIONS` | Max pool connections | `30` |
| `DB_MIN_CONNECTIONS` | Min pool connections | `5` |

### TLS Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TLS_CERT_FILE` | TLS certificate path | (empty = plain HTTP) |
| `TLS_KEY_FILE` | TLS private key path | (empty = plain HTTP) |

### Redis HA Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_SENTINEL_ADDRS` | Comma-separated Sentinel addresses | (empty = single instance) |
| `REDIS_SENTINEL_MASTER` | Sentinel master name | `mymaster` |

### Monitoring Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry error tracking DSN | (empty = disabled) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector | (empty = disabled) |

### Backup Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKUP_ENCRYPTION_KEY` | AES key for backup encryption | (empty = backups disabled) |

### App Variables (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Server API URL | `https://api.usbvault.com` |
| `EXPO_PUBLIC_ENABLE_MOCK_DATA` | Enable mock data | `false` |
| `EXPO_PUBLIC_DEBUG_MODE` | Debug mode | `false` |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN for app | (empty) |
| `EXPO_PUBLIC_POSTHOG_KEY` | PostHog analytics key | (empty) |
| `EXPO_PUBLIC_POSTHOG_HOST` | PostHog host | `https://app.posthog.com` |
| `EXPO_PUBLIC_REVENUECAT_KEY` | RevenueCat purchases key | (empty) |

---

## 9. Database Setup and Migrations

### Initial Setup

```sql
CREATE DATABASE usbvault;
CREATE USER usbvault WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE usbvault TO usbvault;
```

### Automatic Migrations

Migrations run automatically on server startup. The server looks for SQL files in the `migrations` directory (configurable via `MIGRATIONS_DIR`).

```
migrations/
  001_create_users.sql
  002_create_vaults.sql
  003_create_blobs.sql
  ...
  014_latest_migration.sql
```

### Manual Migration

```bash
# Using the migration CLI
./migrate up

# Or via Docker
docker exec usbvault-api /app/migrate up
```

### Kubernetes Migration Job

A separate migration job can be applied for first-time setup:

```bash
kubectl apply -f deploy/k8s/migration-job.yaml
```

The deployment also includes an init container that runs migrations before the API starts.

---

## 10. TLS Certificate Setup

### Direct TLS Termination

Set the following environment variables to enable TLS on the API server directly:

```bash
TLS_CERT_FILE=/path/to/cert.pem
TLS_KEY_FILE=/path/to/key.pem
```

The server enforces TLS 1.3 minimum with X25519 and P-256 curves.

### Reverse Proxy (Recommended)

For production, terminate TLS at a reverse proxy (nginx, Caddy, or cloud load balancer) and run the API server on plain HTTP:

```nginx
server {
    listen 443 ssl http2;
    server_name api.usbvault.io;

    ssl_certificate /etc/ssl/certs/usbvault.pem;
    ssl_certificate_key /etc/ssl/private/usbvault.key;
    ssl_protocols TLSv1.3;

    location / {
        proxy_pass http://usbvault-api:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/v1/sync/ws {
        proxy_pass http://usbvault-api:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Certificate Pinning

The mobile app uses certificate pinning for the API domain. When rotating certificates, ensure the new certificate's public key is added to the app configuration before the old certificate expires.

---

## 11. Monitoring and Alerting

### Prometheus Configuration

Add the USBVault API to your Prometheus scrape configuration:

```yaml
scrape_configs:
  - job_name: 'usbvault-api'
    scrape_interval: 15s
    static_targets:
      - targets: ['usbvault-api:8080']
    metrics_path: '/metrics'
```

### Key Metrics to Monitor

| Metric | Type | Alert Threshold |
|--------|------|----------------|
| `http_request_duration_seconds` | Histogram | p95 > 500ms |
| `http_requests_total{status="5xx"}` | Counter | > 10/min |
| `vault_count` | Gauge | Capacity planning |
| Connection pool utilization | Gauge | > 80% |
| Circuit breaker state | Gauge | Any "open" state |

### Grafana Dashboard

Import the pre-built dashboard from `deploy/monitoring/grafana-dashboard.json`:

```bash
# Copy to Grafana provisioning directory
cp deploy/monitoring/grafana-dashboard.json /var/lib/grafana/dashboards/

# Or import via Grafana UI
# Dashboards > Import > Upload JSON
```

### Health Check Monitoring

The `/health` endpoint returns detailed status:

```json
{
  "status": "ok",
  "checks": {
    "database": true,
    "redis": true,
    "s3": true
  },
  "circuit_breakers": {
    "database": "closed",
    "redis": "closed",
    "s3": "closed"
  }
}
```

Monitor for `status: "degraded"` (HTTP 503) which indicates a critical dependency is down.

### Sentry Error Tracking

Configure Sentry by setting the `SENTRY_DSN` environment variable. The server automatically:
- Captures unhandled panics
- Reports errors with context
- Flushes on graceful shutdown

---

## 12. Security Configuration

### CORS

Configure allowed origins via `CORS_ALLOWED_ORIGINS` (comma-separated). Do not use wildcards for HTTPS origins.

```bash
CORS_ALLOWED_ORIGINS=https://app.usbvault.io,https://admin.usbvault.io
```

### Rate Limiting

Default rate limits (Redis-backed):

| Scope | Limit | Window |
|-------|-------|--------|
| Per IP | 100 requests | 1 minute |
| Per user | 1000 requests | 1 minute |
| Auth endpoints | 10 requests | 1 minute |

### JWT Key Rotation

JWT signing keys are automatically rotated every 90 days. Manual rotation is available via the admin endpoint:

```bash
curl -X POST https://api.usbvault.io/api/v1/admin/rotate-jwt-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Security Headers

The server sets the following headers in production:
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Request Body Limits

Request body size is limited to prevent denial-of-service. Default limits are applied globally.

### Graceful Shutdown

The server handles `SIGINT` and `SIGTERM` with a 30-second shutdown timeout:
1. Stop accepting new connections
2. Complete in-flight requests
3. Close database pool
4. Close Redis connections
5. Flush Sentry events

---

## 13. Backup Procedures

### Database Backup

Create a backup via the admin API:

```bash
# Create backup
curl -X POST https://api.usbvault.io/api/v1/admin/backups \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# List backups
curl https://api.usbvault.io/api/v1/admin/backups \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Restore from backup
curl -X POST https://api.usbvault.io/api/v1/admin/backups/{backupID}/restore \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

Backups are encrypted with the `BACKUP_ENCRYPTION_KEY` and uploaded to S3.

### PostgreSQL pg_dump (Alternative)

```bash
pg_dump -h $DB_HOST -U usbvault -F c -b -v -f backup.dump usbvault
```

### S3 Backup

S3 blobs should be backed up using S3 replication or periodic snapshots:

```bash
aws s3 sync s3://usbvault-files s3://usbvault-files-backup
```

### Redis (No Backup Required)

Redis stores only ephemeral data (sessions, rate limits). It can be safely rebuilt from scratch.

---

## 14. Upgrade Procedures

### Rolling Update (Kubernetes)

```bash
# Update the image tag
kubectl set image deployment/usbvault-api \
  api=usbvault/api:v2.1.0 \
  --namespace usbvault

# Monitor rollout
kubectl rollout status deployment/usbvault-api --namespace usbvault

# Rollback if needed
kubectl rollout undo deployment/usbvault-api --namespace usbvault
```

The deployment uses `maxSurge: 1, maxUnavailable: 0` to ensure zero downtime during updates.

### Docker Update

```bash
docker pull usbvault/api:v2.1.0
docker-compose up -d api
```

### Database Migrations

Migrations run automatically on startup. For manual control:

```bash
# Check migration status
./scripts/migration-status.sh

# Rollback last migration
./scripts/migration-rollback.sh
```

---

## 15. Bulk USB Provisioning

### Automated Provisioning Script

For deploying multiple USB drives:

```bash
# Provision a batch of USB drives
for device in /dev/sdX /dev/sdY /dev/sdZ; do
  ./scripts/provision-usb.sh \
    --device "$device" \
    --vault-name "Corp-$(hostname)" \
    --tools-partition 500 \
    --auto-confirm
done
```

### USB Image Creation

Create a disk image for mass deployment:

```bash
# Create ISO/IMG image of TOOLS partition
dd if=/dev/sdX1 of=usbvault-tools.img bs=4M status=progress

# Write to target USB drives
dd if=usbvault-tools.img of=/dev/sdY1 bs=4M status=progress
```

---

## 16. Compliance

### NIST SP 800-63B

Password policy enforces:
- 15-character minimum
- Entropy-based scoring
- 98,735-entry weak password bloom filter
- HIBP breach check (k-anonymity)

### FIPS 140-3

AES-256-GCM-SIV (cipher ID 3) provides FIPS-compliant encryption. Organizations requiring FIPS compliance should configure this as the default cipher.

### GDPR

- Zero-knowledge architecture: server never processes personal file contents
- Account deletion: `DELETE /api/v1/user/account` removes all server-side data
- Data portability: users can export their vault files at any time
- Audit trail: tamper-evident audit log with chain hashing

### Export Controls

USBVault uses cryptographic algorithms subject to export controls (EAR/ITAR). Consult legal counsel for distribution to restricted countries.

---

## 17. Troubleshooting

### API Server Will Not Start

| Symptom | Cause | Resolution |
|---------|-------|-----------|
| `DATABASE_URL not set` | Missing environment variable | Set `DATABASE_URL` |
| `database connection failed` | PostgreSQL unreachable | Check connection string, network, credentials |
| `redis connection failed` | Redis unreachable | Check `REDIS_URL`, ensure Redis is running |
| `S3_ENDPOINT not set` | Missing S3 configuration | Set `S3_ENDPOINT` and `S3_BUCKET` |
| `failed to initialize JWT key rotation` | Database schema missing | Run migrations |

### Database Issues

| Symptom | Cause | Resolution |
|---------|-------|-----------|
| `database migration failed` | Invalid SQL or schema conflict | Check migration files, ensure idempotency |
| Connection pool exhausted | Too many connections | Increase `DB_MAX_CONNECTIONS` |
| Slow queries | Missing indexes | Check PostgreSQL query plans |

### Companion Service Issues

| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Port 3001 in use | Another process on port | `lsof -i :3001` or `netstat -tlnp | grep 3001` |
| `EACCES` permission error | Insufficient privileges for USB | Run with elevated privileges or configure udev rules |
| USB not detected | OS-level USB issue | Check `diskutil list` (macOS), `lsblk` (Linux), Disk Management (Windows) |
| Node.js not found | Missing from PATH or TOOLS partition | Verify portable Node.js is in `TOOLS/node/` |

### Performance Issues

| Symptom | Cause | Resolution |
|---------|-------|-----------|
| Slow API responses | Database connection pool full | Increase `DB_MAX_CONNECTIONS` |
| High memory usage | Argon2id derivation in parallel | Limit concurrent auth requests via rate limiting |
| Circuit breaker open | Dependency outage | Check health endpoint, resolve underlying issue |

---

## Cross-References

- **DOC-001**: Technical Specification (cryptographic details, protocol specifications)
- **DOC-002**: Architecture and System Design (system topology, component interactions)
- **DOC-006**: Security Audit Package (security configuration details)
- **DOC-007**: Recovery Procedures (backup restore, disaster recovery)
