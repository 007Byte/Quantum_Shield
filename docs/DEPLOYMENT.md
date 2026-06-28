# Quantum_Shield — Production Deployment Runbook

This document covers end-to-end production deployment of Quantum_Shield, including secrets generation, environment configuration, database setup, server deployment, mobile app distribution, and operational procedures.

## Prerequisites

Before starting, ensure you have:

- **Infrastructure**: AWS account (or compatible cloud) with access to RDS PostgreSQL, ElastiCache Redis, and S3 (or self-hosted equivalents)
- **Domain**: DNS configured for `api.usbvault.io` (or your domain) with a valid TLS certificate
- **Stripe Account**: Live-mode API keys and configured products/prices for Individual, Team, and Enterprise plans
- **Build Tools**: Docker (or Kubernetes cluster), Go 1.25+, Node.js 22+, Rust stable toolchain
- **Mobile Distribution**: Apple Developer account (for APNs and App Store), Google Play Console (for FCM and Play Store)
- **Monitoring** (recommended): Sentry project for error tracking, Prometheus/Grafana for metrics

---

## Step 1: Generate Secrets

Run the secrets generation script to create all cryptographic material:

```bash
# Generate secrets into ./secrets directory
./scripts/generate-secrets.sh ./secrets

# Or specify a custom output path
./scripts/generate-secrets.sh /etc/usbvault/secrets
```

This produces:

| File | Purpose |
|------|---------|
| `jwt_private.key` | ED25519 private key for JWT signing (base64) |
| `jwt_public.key` | ED25519 public key for JWT verification (base64) |
| `backup.key` | 32-byte AES encryption key for backups (base64) |
| `postgres.password` | Random PostgreSQL password |
| `redis.password` | Random Redis password |

Transfer secrets to the production host securely:

```bash
scp -r ./secrets user@production-host:/etc/usbvault/secrets/
ssh user@production-host 'chmod 700 /etc/usbvault/secrets && chmod 600 /etc/usbvault/secrets/*'
```

---

## Step 2: Configure Environment

1. Copy the production template:

```bash
cp .env.production.template .env
```

2. Fill in all `<REPLACE_WITH_VALUE>` placeholders using your infrastructure details and generated secrets:

```bash
# Example: set DATABASE_URL with the generated password
DATABASE_URL=postgres://usbvault:$(cat /etc/usbvault/secrets/postgres.password)@your-rds-endpoint:5432/usbvault?sslmode=verify-full

# Example: set Redis URL
REDIS_URL=redis://:$(cat /etc/usbvault/secrets/redis.password)@your-redis-endpoint:6379

# Example: reference JWT key files (recommended)
JWT_ED25519_PRIVATE_KEY_FILE=/etc/usbvault/secrets/jwt_private.key
JWT_ED25519_PUBLIC_KEY_FILE=/etc/usbvault/secrets/jwt_public.key

# Example: set backup key
BACKUP_ENCRYPTION_KEY=$(cat /etc/usbvault/secrets/backup.key)
```

3. Set Stripe keys from your Stripe Dashboard (use `sk_live_` keys, not `sk_test_`).

---

## Step 3: Validate Configuration

Run the validation script to catch misconfigurations before deployment:

```bash
./scripts/validate-env.sh .env
```

The script checks:
- All required variables are set and non-empty
- DATABASE_URL uses SSL (`sslmode` is not `disable`)
- Stripe keys use live-mode prefixes
- JWT key files exist on disk (if file-based configuration is used)
- BACKUP_ENCRYPTION_KEY decodes to exactly 32 bytes
- Optional variables are reported as warnings

Fix any `[FAIL]` items before proceeding. `[WARN]` items are advisory.

---

## Step 4: Database Setup

### Option A: AWS RDS (Recommended)

```bash
# Create a PostgreSQL 16 instance with:
# - Instance class: db.r6g.large (or appropriate for load)
# - Storage: 100 GB gp3 with encryption enabled
# - Multi-AZ: enabled for production
# - SSL: enforce via rds.force_ssl parameter group

# Create the database and role
psql "postgres://masteruser:masterpass@your-rds-endpoint:5432/postgres?sslmode=verify-full" <<SQL
CREATE DATABASE usbvault;
CREATE ROLE usbvault WITH LOGIN PASSWORD '$(cat /etc/usbvault/secrets/postgres.password)';
GRANT ALL PRIVILEGES ON DATABASE usbvault TO usbvault;
SQL
```

### Option B: Docker Compose (Single-Server)

```bash
docker compose -f docker-compose.prod.yml up -d postgres redis minio
```

Ensure the `docker-compose.prod.yml` mounts a persistent volume and uses the generated passwords.

---

## Step 5: Run Migrations

Migrations run automatically on server startup. For manual execution:

```bash
cd usbvault-server
export DATABASE_URL="postgres://usbvault:PASSWORD@host:5432/usbvault?sslmode=verify-full"
go run ./cmd/migrate
```

Verify migration state:

```bash
psql "$DATABASE_URL" -c "SELECT version, applied_at FROM schema_migrations ORDER BY version;"
```

---

## Step 6: TLS/Certificate Setup

### Option A: Let's Encrypt (Recommended for Docker)

```bash
# Install certbot
apt-get install certbot

# Obtain certificate (DNS must already point to this server)
certbot certonly --standalone -d api.usbvault.io

# Copy certs to the expected location
cp /etc/letsencrypt/live/api.usbvault.io/fullchain.pem ./certs/fullchain.pem
cp /etc/letsencrypt/live/api.usbvault.io/privkey.pem ./certs/privkey.pem

# Set up auto-renewal (runs twice daily)
echo "0 */12 * * * certbot renew --deploy-hook 'docker restart usbvault-nginx'" | crontab -
```

### Option B: cert-manager (Kubernetes)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Create ClusterIssuer for Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@usbvault.io
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
EOF
```

### Option C: Manually Provisioned Certificate

Place your certificate files in `./certs/`:
- `fullchain.pem` — server cert + intermediate chain
- `privkey.pem` — private key

Verify the certificate covers your domain:

```bash
openssl x509 -in ./certs/fullchain.pem -noout -subject -dates -ext subjectAltName
```

---

## Step 7: DNS Configuration

### Required DNS Records

| Record | Name | Value | TTL |
|--------|------|-------|-----|
| A | `api.usbvault.io` | `<server-ip>` | 300 |
| CNAME | `app.usbvault.io` | `<cdn-or-server>` | 300 |
| TXT | `_dmarc.usbvault.io` | `v=DMARC1; p=reject; rua=mailto:dmarc@usbvault.io` | 3600 |
| CAA | `usbvault.io` | `0 issue "letsencrypt.org"` | 3600 |

### Stripe Webhook DNS

Stripe must reach `https://api.usbvault.io/api/v1/billing/webhook`. Ensure the A record resolves and port 443 is reachable before configuring the webhook in Stripe Dashboard.

### Verification

```bash
# Verify DNS resolution
dig +short api.usbvault.io

# Verify TLS handshake
openssl s_client -connect api.usbvault.io:443 -servername api.usbvault.io < /dev/null 2>/dev/null | head -20

# Verify HTTPS end-to-end
curl -I https://api.usbvault.io/health
```

---

## Step 8: Deploy Server

### Option A: Docker Compose (Production)

The production stack uses `docker-compose.prod.yml` which includes Nginx TLS termination, PgBouncer connection pooling, hardened Redis, and Docker secrets for JWT keys.

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Scale API replicas (behind Nginx load balancer)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --scale api=3

# Verify all services are healthy
docker compose -f docker-compose.prod.yml ps
```

Architecture: `Client -> Nginx (443) -> API (8080) -> PgBouncer (6432) -> PostgreSQL (5432)`

The backend network is internal-only — PostgreSQL and Redis are not exposed to the host.

### Option B: Docker (Single Container)

```bash
# Build the server image
docker build -t usbvault-server:latest -f usbvault-server/Dockerfile .

# Run with secrets mounted
docker run -d \
  --name usbvault-server \
  --env-file .env \
  -v /etc/usbvault/secrets:/etc/usbvault/secrets:ro \
  -p 8080:8080 \
  --restart unless-stopped \
  usbvault-server:latest
```

### Option C: Kubernetes

```bash
# Create namespace
kubectl create namespace usbvault

# Create secrets from generated files
kubectl create secret generic usbvault-secrets \
  --from-literal=database-url="$(cat .env | grep DATABASE_URL | cut -d= -f2-)" \
  --from-literal=redis-url="$(cat .env | grep REDIS_URL | cut -d= -f2-)" \
  --from-literal=jwt-signing-key="$(cat /etc/usbvault/secrets/jwt_private.key)" \
  --from-literal=stripe-secret-key="$(cat .env | grep STRIPE_SECRET_KEY | cut -d= -f2-)" \
  --from-literal=stripe-webhook-secret="$(cat .env | grep STRIPE_WEBHOOK_SECRET | cut -d= -f2-)" \
  -n usbvault

# Apply manifests (deployment with 3 replicas, rolling updates, pod anti-affinity)
kubectl apply -f usbvault-server/deploy/k8s/ -n usbvault

# Verify rollout
kubectl rollout status deployment/usbvault-api -n usbvault --timeout=120s
```

### Canary Deployment (Argo Rollouts)

For progressive delivery, use the canary rollout manifest instead of the standard Deployment:

```bash
# Prerequisites: Argo Rollouts controller + Nginx ingress
kubectl apply -f usbvault-server/deploy/k8s/canary-rollout.yaml -n usbvault
```

The canary strategy shifts traffic in stages (5% -> 10% -> 25% -> 50% -> 100%) with automated Prometheus analysis gates between each step. Auto-rollback triggers if error rate exceeds 1% or p99 latency exceeds 2s.

### Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /health` | Liveness — deep check of all dependencies | `{"status":"ok","database":"connected","redis":"connected"}` |
| `GET /ready` | Readiness — safe to receive traffic | `200 OK` |
| `GET /metrics` | Prometheus scrape target | Prometheus text format |
| `GET /metrics/pool` | Connection pool statistics | JSON pool stats |

```bash
curl -sf https://api.usbvault.io/health | jq .
curl -sf https://api.usbvault.io/ready
curl -sf https://api.usbvault.io/metrics | head -20
```

---

## Step 9: Configure Certificate Pinning

Certificate pinning prevents MITM attacks on the mobile app's API connections.

1. Extract the SPKI pin from your production certificate:

```bash
openssl s_client -connect api.usbvault.io:443 -servername api.usbvault.io < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

2. Extract the backup pin from the intermediate CA:

```bash
openssl s_client -connect api.usbvault.io:443 -servername api.usbvault.io -showcerts < /dev/null 2>/dev/null \
  | awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print}' \
  | csplit -f cert- -b '%02d.pem' - '/BEGIN CERTIFICATE/' '{*}' 2>/dev/null
# Use cert-01.pem (the intermediate) for the backup pin
openssl x509 -in cert-01.pem -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

3. Set the values in your `.env`:

```
EXPO_PUBLIC_PIN_PRIMARY=<primary-pin-from-step-1>
EXPO_PUBLIC_PIN_BACKUP=<backup-pin-from-step-2>
EXPO_PUBLIC_PIN_EXPIRATION=2027-03-09T00:00:00Z
```

---

## Step 10: Build and Deploy Mobile App

### EAS Build (Recommended)

```bash
cd usbvault-app

# Set production environment variables
cp .env.production.example .env.production
# Edit .env.production with pin values, Sentry DSN, API URL

# Build for both platforms
npx eas build --platform all --profile production
```

### Local Build

```bash
# iOS
npx expo run:ios --configuration Release

# Android
npx expo run:android --variant release
```

Submit to app stores via EAS Submit or manual upload.

---

## Step 11: Post-Deployment Verification Checklist

Run every check below. Do not skip items — a missed check has caused production incidents before.

### Infrastructure Checks

```bash
# 1. API liveness
curl -sf https://api.usbvault.io/health | jq .
# Expected: {"status":"ok","database":"connected","redis":"connected"}

# 2. API readiness
curl -sf https://api.usbvault.io/ready && echo "READY: OK" || echo "READY: FAIL"

# 3. TLS certificate validity
echo | openssl s_client -connect api.usbvault.io:443 2>/dev/null | openssl x509 -noout -dates
# Verify "notAfter" is > 30 days from now

# 4. Prometheus metrics endpoint
curl -sf https://api.usbvault.io/metrics | grep -c "http_requests_total"
# Expected: non-zero count

# 5. Connection pool health
curl -sf https://api.usbvault.io/metrics/pool | jq '.open_connections'
# Expected: > 0, well below max
```

### Service Integration Checks

```bash
# 6. Auth flow — register endpoint responds (should return 400 without body, not 500)
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.usbvault.io/api/v1/auth/register
# Expected: 400 (bad request, not 500)

# 7. Stripe webhook endpoint exists
curl -s -o /dev/null -w "%{http_code}" -X POST https://api.usbvault.io/api/v1/billing/webhook
# Expected: 400 or 401 (not 404)

# 8. FIDO2 relying party is correctly configured
# Verify /.well-known/apple-app-site-association serves valid JSON
curl -sf https://api.usbvault.io/.well-known/apple-app-site-association | jq .

# 9. Security.txt (RFC 9116)
curl -sf https://api.usbvault.io/.well-known/security.txt

# 10. Send test webhook from Stripe Dashboard > Developers > Webhooks
# Verify it returns 200 in Stripe's webhook log
```

### Operational Checks

```bash
# 11. Logs are flowing (Docker)
docker logs --tail 5 usbvault-api 2>&1 | grep -q "listening" && echo "LOGS: OK"

# 12. Disk space
df -h | grep -E "(Filesystem|/var)"

# 13. DNS resolution from external network
dig +short api.usbvault.io @8.8.8.8
```

### Mobile App Checks

- [ ] App connects to production API without certificate pinning errors
- [ ] Registration flow completes successfully
- [ ] SRP login works end-to-end
- [ ] Vault creation and file upload succeed
- [ ] Push notifications arrive (if configured)

---

## Troubleshooting

### Server fails to start: "DATABASE_URL not set"

The `.env` file is not being loaded. Ensure it is in the working directory or passed via `--env-file` to Docker.

### Server fails to start: "FATAL: JWT keys not configured in production"

When `ENVIRONMENT=production`, JWT keys cannot be auto-generated. Set either:
- `JWT_ED25519_PRIVATE_KEY_FILE` + `JWT_ED25519_PUBLIC_KEY_FILE` (recommended), or
- `JWT_ED25519_PRIVATE_KEY` + `JWT_ED25519_PUBLIC_KEY` (inline base64)

### "database connection failed" or "sslmode disable" errors

Production requires SSL. Ensure your DATABASE_URL includes `sslmode=verify-ca` or `sslmode=verify-full` and that the CA certificate is available to the server.

### Stripe webhook failures

- Verify `STRIPE_WEBHOOK_SECRET` matches the secret shown in Stripe Dashboard > Webhooks
- Ensure the webhook endpoint URL is correct: `https://api.usbvault.io/api/v1/billing/webhook`
- Check that the server is publicly accessible on the webhook URL

### Certificate pinning failures on mobile

- Pins may be stale after certificate rotation. Regenerate pins (Step 9) and rebuild the app.
- Check `EXPO_PUBLIC_PIN_EXPIRATION` — if expired, the app should fall back gracefully.
- Verify `EXPO_PUBLIC_API_URL` matches the actual API hostname.

### Redis connection timeout

- Check security group / firewall rules allow the server to reach Redis on port 6379
- If using Redis Sentinel, set `REDIS_SENTINEL_ADDRS` and `REDIS_SENTINEL_MASTER`

---

## Rollback Procedures

### Application Rollback

```bash
# Docker: revert to previous image tag
docker stop usbvault-server
docker run -d --name usbvault-server --env-file .env \
  -v /etc/usbvault/secrets:/etc/usbvault/secrets:ro \
  -p 8080:8080 usbvault-server:<previous-tag>

# Kubernetes: rollback deployment
kubectl rollout undo deployment/usbvault-server -n usbvault
```

### Database Rollback

Migrations are forward-only by design. To revert a migration:

1. Identify the migration version to roll back to
2. Apply a compensating migration (reverse SQL)
3. Test in staging before applying to production

```bash
# Check current migration version
psql "$DATABASE_URL" -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 5;"
```

### Full Restore from Backup

```bash
# List available backups
aws s3 ls s3://usbvault-backups/ --recursive

# Download and decrypt
aws s3 cp s3://usbvault-backups/<backup-file> ./backup.enc
openssl enc -aes-256-cbc -d -in backup.enc -out backup.sql -pass file:/etc/usbvault/secrets/backup.key

# Restore
psql "$DATABASE_URL" < backup.sql
```

---

## Secrets Rotation Guide

### JWT Key Rotation

The server supports key versioning via the `kid` (Key ID) JWT header (PH2-FIX).

1. Generate a new key pair:

```bash
./scripts/generate-secrets.sh --force /etc/usbvault/secrets/new-keys
```

2. Deploy the new public key alongside the old one (the server validates against both during the transition window)

3. Update `JWT_ED25519_PRIVATE_KEY_FILE` to point to the new private key and restart the server

4. After the `refreshTokenTTL` (30 days) has elapsed, remove the old public key

### Backup Encryption Key Rotation

1. Generate a new key: `openssl rand -base64 32`
2. Re-encrypt existing backups with the new key (or retain the old key for decrypting historical backups)
3. Update `BACKUP_ENCRYPTION_KEY` and restart the backup service

### Database Password Rotation

1. Generate a new password: `openssl rand -base64 32 | tr -d '/+=' | head -c 40`
2. Update the password in PostgreSQL: `ALTER ROLE usbvault WITH PASSWORD 'new-password';`
3. Update `DATABASE_URL` in the environment and restart the server

### Redis Password Rotation

1. Generate a new password: `openssl rand -base64 32 | tr -d '/+=' | head -c 40`
2. Update Redis: `redis-cli CONFIG SET requirepass "new-password"`
3. Update `REDIS_URL` in the environment and restart the server

### Stripe Key Rotation

1. Generate a new API key in Stripe Dashboard > Developers > API Keys
2. Update `STRIPE_SECRET_KEY` and restart the server
3. Revoke the old key in the Stripe Dashboard

### Certificate Pin Rotation

1. Obtain the new certificate and extract the SPKI pin (Step 9)
2. Update `EXPO_PUBLIC_PIN_PRIMARY` with the new pin
3. Move the old primary pin to `EXPO_PUBLIC_PIN_BACKUP`
4. Rebuild and deploy the mobile app
5. Update `EXPO_PUBLIC_PIN_EXPIRATION` to cover the new certificate's validity period
