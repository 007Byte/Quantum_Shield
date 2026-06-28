# DOC-002: Quantum_Shield -- Architecture and System Design

| Field | Value |
|-------|-------|
| **Document ID** | DOC-002 |
| **Version** | 2.0 |
| **Date** | 2026-03-18 |
| **Classification** | Confidential -- Engineering |
| **Audience** | System architects, engineering leads, DevOps |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Principles](#2-architecture-principles)
3. [Component Architecture](#3-component-architecture)
4. [Data Flow](#4-data-flow)
5. [Security Architecture](#5-security-architecture)
6. [Deployment Architecture](#6-deployment-architecture)
7. [Database Schema](#7-database-schema)
8. [API Design](#8-api-design)
9. [Frontend Architecture](#9-frontend-architecture)
10. [USB Hardware Bridge](#10-usb-hardware-bridge)
11. [Cryptographic Architecture](#11-cryptographic-architecture)
12. [Observability](#12-observability)
13. [Disaster Recovery](#13-disaster-recovery)
14. [Technology Stack](#14-technology-stack)
15. [Non-Functional Requirements](#15-non-functional-requirements)

---

## 1. System Overview

Quantum_Shield is a four-subsystem architecture designed around the zero-knowledge principle: the server never handles plaintext data, filenames, or encryption keys. All cryptographic operations execute client-side in a Rust core linked via FFI.

### Design Goals

- **Zero-Knowledge**: Server stores only encrypted blobs and authentication data
- **Portability**: No installation required; runs from USB via double-click launcher
- **Cross-Platform**: Windows, macOS, Linux, iOS, Android, Web
- **Intelligence-Grade Security**: Argon2id + AEAD + memory protection + zero-trace cleanup
- **Crash Safety**: Dual-index atomic commits for data integrity
- **Scalability**: Kubernetes-native deployment with horizontal pod autoscaling

### Dual Operating Modes

| Mode | Configuration | Auth | Storage | Sync |
|------|--------------|------|---------|------|
| USB Standalone | No `EXPO_PUBLIC_API_URL` | Password only (session) | Local VAULT.bin on USB | None |
| Cloud Connected | `EXPO_PUBLIC_API_URL` set | SRP-6a + JWT | Server S3 + local USB | WebSocket CRDT |

---

## 2. Architecture Principles

### Zero Trust

No single component can access plaintext data independently. The password is the root of all trust; it exists transiently in memory only during key derivation.

### Defense in Depth

12 security layers from steganography (planned) down to crash-safe dual-index commits. Each layer operates independently so a breach of one does not compromise others.

### Crash Safety

Vault modifications use an append-only log with dual-index atomic commits:
1. Write new data to VAULT.bin (append)
2. Write new index to inactive slot
3. Flip active index slot pointer
4. Increment commit counter and state_version
5. `fsync` the header

On crash, recovery reads the commit counter and falls back to the valid slot.

### Least Privilege

- Companion service binds to `127.0.0.1:3001` only
- Docker containers run as non-root (uid 1001)
- Kubernetes pods: `runAsNonRoot`, all capabilities dropped, read-only root filesystem, seccomp RuntimeDefault
- CORS: explicit allowed origins (no wildcards for HTTPS)

### Cryptographic Agility

Cipher ID field in the vault header allows switching between XChaCha20-Poly1305 (ID=2) and AES-256-GCM-SIV (ID=3). Post-quantum ML-KEM-1024 is feature-gated and can be activated without format changes.

### Fail Secure

- Invalid password: increment fail counter, enforce exponential backoff
- Fail counter tampered: reject unlock, alert user
- State version rollback: reject header, prevent downgrade attacks
- Max failures reached: self-destruct (3-pass overwrite of wrapped MEK)

---

## 3. Component Architecture

### High-Level System Diagram

```
+-------------------------------------------------------------------+
|                         USER DEVICE                                |
|                                                                    |
|  +------------------+    FFI     +-------------------+             |
|  | usbvault-app     |<--------->| usbvault-crypto   |             |
|  | (React Native /  |           | (Rust)            |             |
|  |  Expo / Web)     |           |                   |             |
|  |                  |           | - Argon2id KDF    |             |
|  | - 37 screens     |           | - AEAD ciphers    |             |
|  | - 7 Zustand      |           | - Streaming AEAD  |             |
|  |   stores         |           | - V4 header       |             |
|  | - 19 security    |           | - Shamir SSS      |             |
|  |   services       |           | - PQC hybrid      |             |
|  +--------+---------+           | - Memory security |             |
|           |                     +-------------------+             |
|           | HTTP (localhost:3001)                                  |
|           v                                                       |
|  +------------------+                                             |
|  | usb-companion    |       USB                                   |
|  | (Node.js/Express)|<----->[ TOOLS | SECURE (VAULT.bin) ]        |
|  | - 19 endpoints   |                                             |
|  | - 23 cleaners    |                                             |
|  +------------------+                                             |
+-------------------------------------------------------------------+
           |
           | HTTPS (api.usbvault.io)
           | WebSocket (sync)
           v
+-------------------------------------------------------------------+
|                       CLOUD INFRASTRUCTURE                         |
|                                                                    |
|  +------------------+    +------------+    +------------------+    |
|  | usbvault-server  |<-->| PostgreSQL |    | S3 (MinIO)       |    |
|  | (Go / chi)       |    | 16         |    | Encrypted blobs  |    |
|  |                  |    +------------+    +------------------+    |
|  | - Auth (SRP/JWT) |                                             |
|  | - Vault CRUD     |    +------------+                           |
|  | - Sharing        |<-->| Redis      |                           |
|  | - Billing        |    | Sessions,  |                           |
|  | - Sync (WS)      |    | Rate limit |                           |
|  | - Audit          |    +------------+                           |
|  +------------------+                                             |
|                                                                    |
|  +------------------+    +------------------+                     |
|  | Prometheus       |    | Grafana          |                     |
|  | Metrics scrape   |    | Dashboards       |                     |
|  +------------------+    +------------------+                     |
|                                                                    |
|  +------------------+    +------------------+                     |
|  | Sentry           |    | OpenTelemetry    |                     |
|  | Error tracking   |    | Distributed      |                     |
|  |                  |    | tracing          |                     |
|  +------------------+    +------------------+                     |
+-------------------------------------------------------------------+
```

### Component Interactions

| Source | Target | Protocol | Data |
|--------|--------|----------|------|
| App | Rust FFI | C ABI (cdylib) | Password bytes, encrypted bytes |
| App | Companion | HTTP REST (localhost) | Drive IDs, encrypted VAULT.bin bytes |
| App | Server | HTTPS REST | Auth tokens, encrypted blobs |
| App | Server | WebSocket | Sync deltas (encrypted) |
| Server | PostgreSQL | pgx/v5 (connection pool) | User records, vault metadata, audit logs |
| Server | Redis | go-redis/v9 | Sessions, rate limits, sync state |
| Server | S3 | AWS SDK v2 | Encrypted file blobs |
| Server | Stripe | HTTP webhooks | Billing events |
| Prometheus | Server | HTTP scrape (`:8080/metrics`) | Counters, histograms |

---

## 4. Data Flow

### Encrypt File (9 Steps)

1. User selects a file in the app
2. App reads file bytes into memory
3. App calls Rust FFI to derive MEK from password + header salt (Argon2id)
4. Rust `StreamingEncryptor` splits file into 64 KB chunks
5. Each chunk encrypted with per-chunk derived key (HKDF domain separation)
6. V2RC record assembled: magic + base_nonce + length-prefixed encrypted chunks + final HMAC
7. App calls companion `POST /usb/vault/container/append` with encrypted record
8. Companion appends record to VAULT.bin, fsync
9. App updates vault index: flip inactive slot, update offset/length, increment counters, recompute header HMAC, write header via companion

### Decrypt File (6 Steps)

1. User selects encrypted file from vault index
2. App reads record offset and length from decrypted index
3. App calls companion `GET /usb/vault/container/bytes` with offset and length
4. Rust `StreamingDecryptor` verifies final HMAC (constant-time)
5. Each chunk decrypted with per-chunk derived key
6. Plaintext file returned to user (temp view with auto-wipe or download)

### Vault Unlock Flow (11 Steps)

1. User enters password
2. App checks exponential backoff timer
3. Rust derives KEK from password + header salt (Argon2id, 64 MiB)
4. Rust unwraps MEK using KEK (XChaCha20-Poly1305)
5. Rust decrypts verify marker with MEK encryption key
6. Compare plaintext to `"USBVAULT_VERIFY_OK_0000"`
7. On failure: increment fail counter, write HMAC'd counter, enforce backoff
8. On success: verify header HMAC with MEK HMAC key (constant-time)
9. If FIDO2 enabled: authenticate with hardware key, XOR PRF output with enc_key
10. Read and reset fail counter to 0
11. MEK halves held in memory; vault unlocked

---

## 5. Security Architecture

### Trust Boundary Diagram

```
+---------------------------------------------------+
|  USER DEVICE (Trusted Zone)                       |
|                                                   |
|  +-------------+     +-------------------+        |
|  | App UI      |---->| Rust Crypto Core  |        |
|  | (TypeScript) |     | (Trusted Computing|        |
|  |             |     |  Base)            |        |
|  +------+------+     +-------------------+        |
|         |                                         |
|  +------v------+     +-------------------+        |
|  | Companion   |---->| USB Hardware      |        |
|  | (Node.js)   |     | (Physical Trust)  |        |
|  +-------------+     +-------------------+        |
+-----------|-------------------------------------------+
            | TLS 1.3 (trust boundary)
+-----------v-------------------------------------------+
|  CLOUD (Zero-Knowledge Zone)                          |
|                                                       |
|  Server sees ONLY: encrypted blobs, auth tokens,      |
|  SRP verifiers, public keys, billing data             |
|                                                       |
|  Server NEVER sees: passwords, plaintext files,       |
|  filenames, encryption keys, MEK, KEK                 |
+-------------------------------------------------------+
```

### Key Hierarchy

```
Password (user input, transient)
    |
    v
Argon2id(password, salt, 64MiB, t=3, p=4)
    |
    v
KEK (Key Encryption Key, 32 bytes, transient)
    |
    v
XChaCha20-Poly1305 unwrap
    |
    v
MEK (Master Encryption Key, 64 bytes, in-memory only)
    |
    +---> enc_key[0:32]  ---> File encryption, verify marker
    |
    +---> hmac_key[32:64] ---> Header HMAC, fail counter HMAC
    |
    +---> HKDF("file_encryption:{file_id}") ---> Per-file keys
    |
    +---> HKDF("stream_chunk_key:" || nonce) ---> Per-chunk keys
    |
    +---> HKDF("stream_hmac_key") ---> Stream integrity HMAC key
```

### Boot Hardening (6 Stages)

| Stage | Name | Action |
|-------|------|--------|
| 1 | Anti-Debug | Device integrity check (jailbreak/root detection) |
| 2 | Integrity | CSP validation, code signature check |
| 3 | Memory Lock | WebCrypto initialization, memory protection |
| 4 | Brute-Force | Restore fail state from header |
| 5 | Self-Destruct | Arm self-destruct callbacks |
| 6 | Ghost Mode | Activate privacy protections (screenshot block, clipboard auto-clear) |

---

## 6. Deployment Architecture

### Kubernetes Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: usbvault-api
  namespace: usbvault
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

**Pod Security**:
- `runAsNonRoot: true`, `runAsUser: 10001`
- `readOnlyRootFilesystem: true`
- `capabilities.drop: ["ALL"]`
- `seccompProfile: RuntimeDefault`
- Pod anti-affinity: spread across nodes

**Probes**:
- Liveness: `GET /health` every 30s (15s initial delay)
- Readiness: `GET /ready` every 10s (5s initial delay)

**Resources**:
- Requests: 250m CPU, 256Mi memory
- Limits: 1000m CPU, 512Mi memory

**Init Container**: Runs database migrations before API starts

### Docker Configuration

Multi-stage build:
1. **Builder**: `golang:1.23-alpine` with CGO, produces stripped binaries
2. **Runtime**: `alpine:3.19` with non-root user (uid 1001), `ca-certificates`, `curl`

Health check: `curl -f http://localhost:8080/health` every 10s

### Network Topology

```
Internet
    |
    v
[Load Balancer / Ingress]
    |
    v  (TLS 1.3 termination)
[usbvault-api x3]  <--->  [PostgreSQL 16]
    |                           |
    |                      [Connection Pool]
    |                      min=5, max=30
    v
[Redis]  <--->  [S3 / MinIO]
```

### TLS Configuration

Server supports direct TLS termination when `TLS_CERT_FILE` and `TLS_KEY_FILE` are set:
- Minimum version: TLS 1.3
- Curve preferences: X25519, P-256

When TLS variables are not set, server runs plain HTTP expecting TLS termination at the reverse proxy.

---

## 7. Database Schema

### Core Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | id, email_hash, srp_salt, srp_verifier, subscription_tier |
| `vaults` | Vault metadata | id, owner_id, name_encrypted, cipher_id, created_at |
| `vault_members` | RBAC membership | vault_id, user_id, role (owner/editor/viewer) |
| `vault_blobs` | Encrypted file refs | id, vault_id, s3_key, size_bytes, version |
| `key_hierarchy` | Wrapped MEK storage | vault_id, wrapped_mek, kek_salt |
| `shares` | File sharing records | id, sender_id, recipient_id, encrypted_key, status |
| `audit_log` | Tamper-evident audit | id, user_id, action_type, encrypted_detail, chain_hash |
| `security_events` | Security event log | id, user_id, event_type, ip_address, timestamp |
| `recovery_codes` | Hashed recovery codes | user_id, code_hash, code_index, used |
| `fido2_credentials` | WebAuthn credentials | id, user_id, credential_id, public_key, aaguid |
| `subscriptions` | Stripe subscriptions | user_id, stripe_customer_id, stripe_subscription_id, tier |
| `jwt_keys` | JWT signing keys | kid, private_key_pem, created_at, active |
| `key_rotation_jobs` | Vault key rotation | id, vault_id, status, total_files, processed_files |
| `contact_verifications` | Contact trust | user_id, contact_user_id, verified_at, fingerprint |

### Connection Pool Configuration

| Parameter | Default | Environment Variable |
|-----------|---------|---------------------|
| Max connections | 30 | `DB_MAX_CONNECTIONS` |
| Min connections | 5 | `DB_MIN_CONNECTIONS` |
| Max connection lifetime | 30 minutes | Hardcoded |
| Max idle time | 5 minutes | Hardcoded |

---

## 8. API Design

### Route Groups

| Group | Base Path | Auth Required | Rate Limit |
|-------|-----------|---------------|-----------|
| Auth | `/api/v1/auth` | No | 10/min |
| Vaults | `/api/v1/vaults` | JWT | 100/min (IP), 1000/min (user) |
| Shares | `/api/v1/shares` | JWT | Standard |
| Audit | `/api/v1/audit` | JWT | Standard |
| Billing | `/api/v1/billing` | JWT (except webhook) | Standard |
| Notify | `/api/v1/notify` | JWT | Standard |
| Recovery | `/api/v1/recovery` | JWT | Standard |
| Sync | `/api/v1/sync` | WebSocket JWT | Standard |
| Admin | `/api/v1/admin` | JWT + Admin role | Standard |

### Middleware Stack (Order)

1. `RequestID` -- unique request identifier
2. `RecoverMiddleware` -- Sentry panic recovery
3. `MetricsMiddleware` -- Prometheus counters
4. `TracingMiddleware` -- OpenTelemetry spans
5. `RequestLogger` -- structured logging (zerolog)
6. `RequestBodyLimit` -- prevent oversized requests
7. `RateLimiter` -- Redis-backed per-IP/per-user limits
8. `CORS` -- explicit allowed origins
9. `SecurityHeaders` -- HSTS, CSP, X-Frame-Options
10. `HTTPSRedirect` -- redirect HTTP to HTTPS (production)
11. `AuthMiddleware` -- extract JWT (optional)

### RBAC Model

| Role | Permissions |
|------|------------|
| Owner | Read, Update, Delete, Manage Members, Transfer Ownership, Key Rotation |
| Editor | Read, Update |
| Viewer | Read |

---

## 9. Frontend Architecture

### Framework Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | React Native | 0.81.5 |
| Framework | Expo | 54.0.0 |
| React | React | 19.1.0 |
| Navigation | expo-router | 6.0.23 |
| Styling | NativeWind / Tailwind CSS | 4.2.1 |
| State | Zustand | 4.5.0 |
| i18n | i18next + react-i18next | 25.8.18 / 16.5.8 |
| Animations | react-native-reanimated | 4.1.1 |
| Analytics | PostHog | 4.37.3 |
| Purchases | RevenueCat | 9.12.0 |
| Error tracking | Sentry | 7.2.0 |

### State Stores (Zustand)

| Store | Purpose |
|-------|---------|
| `authStore` | Authentication state, user info, tokens |
| `vaultStore` | Vault state, file list, operations |
| `themeStore` | Light/dark theme preference |
| `sidebarStore` | Sidebar navigation state |
| `languageStore` | i18n language selection |
| `offlineStore` | Offline operation queue |
| `syncStore` | Multi-device sync state |

### Crypto Bridge (`src/crypto/bridge.ts`)

The TypeScript crypto bridge provides a platform-aware abstraction over the Rust FFI:
- **Native (iOS/Android)**: Calls Rust functions via `cdylib` FFI
- **Web**: Uses WebCrypto API where possible; SRP via pure JavaScript implementation

Key functions: `deriveKey()`, `encrypt()`, `decrypt()`, `hashSha256()`, `srpGenerateClientEphemeral()`, `srpDeriveSession()`, `generateShareKeypair()`, `generateSigningKeypair()`, `readVaultHeader()`, `createVaultHeader()`

### Dual-Mode Operation

**Cloud Connected** (`EXPO_PUBLIC_API_URL` set):
- SRP-6a authentication with server
- JWT-based session management
- Cloud sync via WebSocket
- Sharing, billing, audit features

**USB Standalone** (no API URL):
- Vault password = session key
- sessionStorage only (zero-trace)
- No network calls; pure local operation
- Companion bridge for USB hardware

---

## 10. USB Hardware Bridge

### Companion Service Architecture

The USB companion is a Node.js/Express server that runs on the user's machine, bridging the web app to the OS-level USB subsystem.

**Security Model**:
- Binds exclusively to `127.0.0.1:3001` (never network-exposed)
- Helmet security headers
- CORS whitelist (only app origin)
- Rate limiting: 60/min general, 5/min destructive operations
- `execFile` only (never `shell=true`)
- Input validation on all parameters
- Audit logging for all operations
- `fsync` after every write operation

**Endpoint Categories**:
| Category | Count | Operations |
|----------|-------|-----------|
| Drive Management | 4 | List, provision, reset, eject |
| Mount/Unmount | 2 | Mount/unmount SECURE partition |
| Vault Container | 7 | Init, header R/W, bytes R, append, size, capacity, compact |
| Zero-Trace | 2 | Execute cleanup, scan artifacts |
| Vault Discovery | 1 | List vaults on drive |

**Zero-Trace Cleaners**: 23 total
- Windows (user): 10 cleaners
- Windows (admin): 2 cleaners
- macOS: 6 cleaners
- Linux: 5 cleaners

---

## 11. Cryptographic Architecture

### Algorithm Selection Rationale

| Algorithm | Purpose | Why Selected |
|-----------|---------|-------------|
| Argon2id | KDF | Memory-hard, GPU-resistant, OWASP recommended |
| XChaCha20-Poly1305 | Default AEAD | 24-byte nonce (safe with random nonces), no hardware dependency |
| AES-256-GCM-SIV | FIPS AEAD | Nonce-misuse resistant, hardware-accelerated (AES-NI) |
| HKDF-SHA256 | Subkey derivation | Standard (RFC 5869), domain separation support |
| HMAC-SHA256 | Integrity | Standard, constant-time verification available |
| X25519 | Key exchange | Fast, constant-time, widely deployed |
| ML-KEM-1024 | PQC KEM | NIST FIPS 203, 256-bit security level |
| GF(256) Shamir | Secret sharing | Custom implementation replacing `sharks` (RUSTSEC-2024-0398) |
| SRP-6a | Auth protocol | Password never sent to server; mutual authentication |

### Key Lifecycle

| Phase | Action | Location |
|-------|--------|----------|
| Generation | MEK generated from OsRng (64 bytes) | Rust, at vault provision |
| Derivation | KEK derived via Argon2id from password | Rust, at unlock |
| Wrapping | MEK wrapped with KEK (XChaCha20-Poly1305) | Rust, at provision and password change |
| Storage | Wrapped MEK in vault header (24 KiB) | VAULT.bin on USB or server |
| Use | MEK halves in memory (enc_key + hmac_key) | App process memory |
| Zeroing | Zeroize on drop, mlock prevents swapping | Rust `Zeroizing<T>` wrapper |
| Rotation | New MEK generated, files re-encrypted | Server-coordinated job |
| Destruction | 3-pass overwrite on self-destruct | Rust `self_destruct()` |

### Memory Protection Layers

| Protection | Mechanism | Platform |
|------------|-----------|----------|
| Zero on drop | `Zeroizing<T>` wrapper | All |
| Swap prevention | `mlock()` / `VirtualLock()` | Linux, macOS, Windows |
| Overflow detection | Guard pages (`mmap PROT_NONE`) | Linux, macOS |
| Thread isolation | `StreamingEncryptor` is `!Send + !Sync` | All |

---

## 12. Observability

### Monitoring Stack

| Component | Purpose | Endpoint |
|-----------|---------|----------|
| Prometheus | Metrics collection | `GET /metrics` |
| Grafana | Dashboard visualization | Provisioned dashboards |
| AlertManager | Alert routing and notification | Rules in monitoring config |
| Sentry | Error tracking and alerting | DSN via `SENTRY_DSN` |
| OpenTelemetry | Distributed tracing | OTLP HTTP exporter |
| zerolog | Structured logging | Console output |

### Key Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `vault_count` | Gauge | Total vaults in system |
| `http_request_duration_seconds` | Histogram | Request latency by method and path |
| `http_requests_total` | Counter | Total requests by status code |
| `db_pool_total_conns` | Gauge | Database connection pool size |
| `circuit_breaker_state` | Gauge | Circuit breaker state (closed/open/half-open) |

### Health Check Response

```json
{
  "status": "ok|degraded",
  "timestamp": "2026-03-18T00:00:00Z",
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

### Circuit Breakers

| Service | Failure Threshold | Timeout |
|---------|-------------------|---------|
| Database | 5 failures | 30 seconds |
| Redis | 3 failures | 15 seconds |
| S3 | 3 failures | 30 seconds |

---

## 13. Disaster Recovery

### Recovery Scenarios

| Scenario | RTO | RPO | Recovery Method |
|----------|-----|-----|----------------|
| Single pod failure | < 30s | 0 | Kubernetes auto-restart, 3 replicas |
| Database failure | < 5min | Last backup | Automated backup restore, connection pool failover |
| Redis failure | < 1min | Session data | Redis Sentinel failover, sessions regenerated |
| S3 unavailability | < 30min | 0 | S3 circuit breaker, retry with backoff |
| Complete cluster failure | < 1hr | Last backup | K8s cluster rebuild, DB restore from S3 backup |
| USB drive failure | N/A | Last sync | Cloud backup restore (if cloud-connected mode) |

### Backup Strategy

**Database Backups**:
- Automated via admin endpoint `POST /admin/backups`
- Encrypted before upload to S3
- Configurable via `BACKUP_ENCRYPTION_KEY` environment variable
- Restore via `POST /admin/backups/{backupID}/restore`

**Vault Backups**:
- Cloud-connected: encrypted blobs stored in S3
- USB standalone: user's responsibility (recovery phrase + physical backup)

### Redis High Availability

Redis Sentinel support via `REDIS_SENTINEL_ADDRS` environment variable:
- Automatic failover to replica
- Configurable master name via `REDIS_SENTINEL_MASTER`

---

## 14. Technology Stack

### Complete Dependency Matrix

#### Rust (usbvault-crypto)

| Dependency | Version | Purpose |
|------------|---------|---------|
| argon2 | 0.5 | Key derivation function |
| chacha20poly1305 | 0.10 | XChaCha20-Poly1305 AEAD |
| aes-gcm-siv | 0.11 | AES-256-GCM-SIV AEAD |
| hkdf | 0.12 | HKDF-SHA256 subkey derivation |
| sha2 | 0.10 | SHA-256 hashing |
| hmac | 0.12 | HMAC-SHA256 |
| x25519-dalek | 2 | X25519 key exchange |
| ml-kem | 0.2 | ML-KEM-1024 post-quantum KEM |
| zeroize | 1 | Secure memory zeroing |
| rand / rand_core | 0.8 / 0.6 | CSPRNG (OsRng) |
| subtle | 2 | Constant-time comparisons |
| srp | 0.7.0-rc.1 | SRP-6a protocol |
| serde / serde_json | 1 | Serialization |
| cbindgen | 0.26 | C header generation (build) |
| proptest | 1 | Property-based testing (dev) |

#### Go (usbvault-server)

| Dependency | Version | Purpose |
|------------|---------|---------|
| go-chi/chi | 5.0.12 | HTTP router |
| jackc/pgx | 5.5.5 | PostgreSQL driver |
| redis/go-redis | 9.6.3 | Redis client |
| aws-sdk-go-v2 | 1.26.1 | S3 client |
| golang-jwt/jwt | 5.2.2 | JWT handling |
| go-webauthn/webauthn | 0.10.2 | FIDO2/WebAuthn |
| prometheus/client_golang | 1.23.2 | Prometheus metrics |
| rs/zerolog | 1.32.0 | Structured logging |
| getsentry/sentry-go | 0.43.0 | Error tracking |
| opentelemetry | 1.42.0 | Distributed tracing |
| golang.org/x/crypto | 0.48.0 | Cryptographic primitives |
| nhooyr.io/websocket | 1.8.11 | WebSocket support |
| stretchr/testify | 1.11.1 | Test assertions |

#### TypeScript (usbvault-app)

| Dependency | Version | Purpose |
|------------|---------|---------|
| expo | 54.0.0 | Cross-platform framework |
| react-native | 0.81.5 | Native runtime |
| react | 19.1.0 | UI library |
| expo-router | 6.0.23 | File-based routing |
| zustand | 4.5.0 | State management |
| axios | 1.6.0 | HTTP client |
| i18next | 25.8.18 | Internationalization |
| expo-secure-store | 15.0.8 | iOS Keychain / Android EncryptedSharedPreferences |
| expo-local-authentication | 17.0.8 | Biometric auth |
| expo-crypto | 55.0.9 | WebCrypto bridge |
| nativewind | 4.2.3 | Tailwind CSS for RN |
| react-native-purchases | 9.12.0 | RevenueCat in-app purchases |
| @sentry/react-native | 7.2.0 | Error tracking |
| posthog-react-native | 4.37.3 | Product analytics |

---

## 15. Non-Functional Requirements

### Availability

- **Target**: 99.9% uptime for cloud services
- **Method**: 3 pod replicas, pod anti-affinity, rolling updates (maxUnavailable: 0)
- **Health monitoring**: Liveness and readiness probes

### Latency

- **API response (p95)**: < 200ms for read operations
- **API response (p95)**: < 500ms for write operations
- **Argon2id derivation**: 500ms - 2s (varies by hardware)
- **File encryption (1 MB)**: < 10ms

### Throughput

- **API rate limit**: 100 requests/min per IP, 1000/min per user
- **Auth rate limit**: 10 requests/min
- **WebSocket connections**: Limited by Redis pub/sub throughput
- **S3 uploads**: Multipart for files > 5 MB

### Scalability

- **Horizontal**: Kubernetes HPA based on CPU/memory
- **Database**: Connection pool (5-30 connections, configurable)
- **Cache**: Redis Sentinel for HA; scales with read replicas
- **Storage**: S3 (virtually unlimited)

### Compliance

- **NIST SP 800-63B**: Password policy (15-char min, entropy scoring)
- **FIPS 140-3**: AES-256-GCM-SIV cipher option
- **OWASP**: Top 10 mitigations (BOLA, injection, auth bypass, SSRF)
- **GDPR**: Zero-knowledge architecture; user data deletion via `DELETE /user/account`

---

## Cross-References

- **DOC-001**: Technical Specification (cryptographic details, V4 header format)
- **DOC-004**: IT Deployment Guide (environment variables, Docker/K8s setup)
- **DOC-006**: Security Audit Package (threat model, penetration test scope)
- **DOC-007**: Recovery Procedures (disaster recovery details)
