# USBVault Enterprise — Launch Wiring Checklist

When funding is available, follow these steps in order. Each step is a **config change only** — no code changes required.

---

## Pre-Requisites
- [ ] Production readiness script passes: `./scripts/production-readiness-check.sh .env.production`
- [ ] All tests pass: Rust (`cargo test`), Go (`go test ./...`), TypeScript (`npx jest`)
- [ ] Git tag created for release candidate

---

## Step 1: AWS Infrastructure (1-2 days)

### 1.1 PostgreSQL RDS
- [ ] Create RDS PostgreSQL 15+ instance (Multi-AZ, encrypted at rest)
- [ ] Set `sslmode=verify-full` in connection string
- [ ] Create database: `usbvault_production`
- [ ] Create application user with least-privilege grants
- [ ] Record `DATABASE_URL` in `.env.production`

### 1.2 Redis ElastiCache
- [ ] Create ElastiCache Redis 7+ cluster (encryption in transit)
- [ ] Configure auth token
- [ ] Record `REDIS_URL` in `.env.production` (use `rediss://` for TLS)

### 1.3 S3 Bucket
- [ ] Create S3 bucket with versioning enabled
- [ ] Enable server-side encryption (AES-256 or KMS)
- [ ] Create IAM user with scoped S3 permissions (PutObject, GetObject, DeleteObject, ListBucket)
- [ ] Record `S3_ENDPOINT`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` in `.env.production`

---

## Step 2: DNS & TLS (1 day)

- [ ] Register or configure `api.usbvault.io` DNS (A record → load balancer)
- [ ] Obtain TLS certificate (ACM or Let's Encrypt)
- [ ] Generate certificate pins (SPKI SHA-256 base64):
  ```bash
  openssl x509 -in cert.pem -pubkey -noout | \
    openssl pkey -pubin -outform DER | \
    openssl dgst -sha256 -binary | base64
  ```
- [ ] Set `EXPO_PUBLIC_PIN_PRIMARY` and `EXPO_PUBLIC_PIN_BACKUP` in app `.env.production`
- [ ] Set `EXPO_PUBLIC_PIN_EXPIRATION` to cert expiry date
- [ ] Configure `FIDO2_RELYING_PARTY_ID=usbvault.io`
- [ ] Configure `FIDO2_RELYING_PARTY_ORIGIN=https://app.usbvault.io`
- [ ] Configure `CORS_ALLOWED_ORIGINS=https://app.usbvault.io`

---

## Step 3: Secrets & Keys (0.5 days)

### 3.1 JWT Signing Keys
```bash
openssl genpkey -algorithm ED25519 -out jwt-private.pem
openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem
base64 < jwt-private.pem  # → JWT_ED25519_PRIVATE_KEY
base64 < jwt-public.pem   # → JWT_ED25519_PUBLIC_KEY
```
- [ ] Set `JWT_ED25519_PRIVATE_KEY` and `JWT_ED25519_PUBLIC_KEY` in `.env.production`

### 3.2 Backup Encryption Key
```bash
openssl rand -base64 32  # → BACKUP_ENCRYPTION_KEY
```
- [ ] Set `BACKUP_ENCRYPTION_KEY` in `.env.production`

### 3.3 Environment Flag
- [ ] Set `ENVIRONMENT=production` in `.env.production`

---

## Step 4: Stripe Billing (0.5 days)

- [ ] Create Stripe account (or switch from test to live mode)
- [ ] Create 3 Products with Prices:
  - Individual (Pro): monthly price → `STRIPE_PRICE_INDIVIDUAL`
  - Team: monthly price → `STRIPE_PRICE_TEAM`
  - Enterprise: monthly price → `STRIPE_PRICE_ENTERPRISE`
- [ ] Get live secret key → `STRIPE_SECRET_KEY` (starts with `sk_live_`)
- [ ] Configure webhook endpoint: `https://api.usbvault.io/api/v1/billing/webhook`
- [ ] Get webhook signing secret → `STRIPE_WEBHOOK_SECRET` (starts with `whsec_`)

---

## Step 5: Sentry Error Tracking (0.5 days)

- [ ] Create Sentry project (or use free tier)
- [ ] Get DSN → `EXPO_PUBLIC_SENTRY_DSN` (client-side)
- [ ] Get DSN → `SENTRY_DSN` (server-side)
- [ ] Verify PII scrubbing is enabled (already configured in code)

---

## Step 6: EAS Build Profiles (1-2 days)

### 6.1 Apple Developer Account
- [ ] Enroll in Apple Developer Program ($99/year)
- [ ] Update `usbvault-app/eas.json`:
  - `APPLE_ID` → your Apple ID email
  - `ASC_APP_ID` → App Store Connect app ID
  - `APPLE_TEAM_ID` → your team ID

### 6.2 Google Play Console
- [ ] Create Google Play Developer account ($25 one-time)
- [ ] Create app in Google Play Console
- [ ] Update `usbvault-app/eas.json` with Android package configuration

### 6.3 Build & Test
- [ ] Run `eas build --platform ios --profile production`
- [ ] Run `eas build --platform android --profile production`
- [ ] Install on real devices and smoke test

---

## Step 7: Validate & Deploy

- [ ] Run production readiness check:
  ```bash
  ./scripts/production-readiness-check.sh .env.production
  ```
- [ ] Run environment validation:
  ```bash
  ./scripts/validate-env.sh .env.production
  ```
- [ ] Deploy server to Kubernetes:
  ```bash
  kubectl apply -f usbvault-server/deploy/k8s/
  ```
- [ ] Verify health endpoint: `curl https://api.usbvault.io/health`
- [ ] Verify database migrations ran successfully (check init container logs)

---

## Step 8: Burn-In Monitoring (7 days, passive)

- [ ] Deploy monitoring stack (Prometheus + Grafana + PagerDuty)
- [ ] Verify all 7 alert rules fire correctly (use test endpoints)
- [ ] Monitor error rates, latency, and resource usage
- [ ] Review alerting runbook: `usbvault-server/deploy/monitoring/alerting-runbook.md`
- [ ] Conduct load test (optional but recommended)

---

## Step 9: App Store Submissions (1-2 weeks)

- [ ] Submit iOS build to App Store Review
- [ ] Submit Android build to Google Play Review
- [ ] Prepare store listing assets (screenshots, description, privacy policy URL)
- [ ] Store listing templates: `docs/store-listing/`
- [ ] Privacy policy URL: `https://app.usbvault.io/privacy-policy`
- [ ] Terms of service URL: `https://app.usbvault.io/terms-of-service`

---

## Step 10: Go Live

- [ ] Flip DNS to production load balancer
- [ ] Enable Stripe live billing
- [ ] Monitor first 24 hours closely
- [ ] Announce launch

---

## Quick Reference — All Environment Variables

| Variable | Source | Example |
|----------|--------|---------|
| `DATABASE_URL` | RDS | `postgres://user:pass@rds-host:5432/usbvault_production?sslmode=verify-full` |
| `REDIS_URL` | ElastiCache | `rediss://:authtoken@cache-host:6379` |
| `S3_ENDPOINT` | AWS | `https://s3.us-east-1.amazonaws.com` |
| `S3_BUCKET` | AWS | `usbvault-production-files` |
| `AWS_ACCESS_KEY_ID` | IAM | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | IAM | (secret) |
| `JWT_ED25519_PRIVATE_KEY` | Generated | (base64) |
| `JWT_ED25519_PUBLIC_KEY` | Generated | (base64) |
| `BACKUP_ENCRYPTION_KEY` | Generated | (base64, 32 bytes) |
| `STRIPE_SECRET_KEY` | Stripe | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe | `whsec_...` |
| `STRIPE_PRICE_INDIVIDUAL` | Stripe | `price_...` |
| `STRIPE_PRICE_TEAM` | Stripe | `price_...` |
| `STRIPE_PRICE_ENTERPRISE` | Stripe | `price_...` |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry | `https://key@o0.ingest.sentry.io/123` |
| `SENTRY_DSN` | Sentry | `https://key@o0.ingest.sentry.io/123` |
| `ENVIRONMENT` | Manual | `production` |
| `CORS_ALLOWED_ORIGINS` | Manual | `https://app.usbvault.io` |
| `FIDO2_RELYING_PARTY_ID` | Manual | `usbvault.io` |
| `FIDO2_RELYING_PARTY_ORIGIN` | Manual | `https://app.usbvault.io` |
| `EXPO_PUBLIC_PIN_PRIMARY` | TLS cert | (base64 SHA-256) |
| `EXPO_PUBLIC_PIN_BACKUP` | TLS cert | (base64 SHA-256) |
