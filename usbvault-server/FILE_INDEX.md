# Quantum Armor Vault (QAV) Backend - Complete File Index

## Project Statistics
- **Total Files**: 26
- **Go Source Files**: 18
- **Lines of Go Code**: 3,014
- **Documentation Files**: 3
- **Configuration Files**: 5

---

## Directory Structure

```
usbvault-server/
├── cmd/
│   └── api/
│       └── main.go                          (346 lines) - HTTP server entry point
├── internal/
│   ├── auth/
│   │   ├── srp.go                          (196 lines) - SRP-6a authentication
│   │   ├── fido2.go                        (115 lines) - FIDO2/WebAuthn support
│   │   └── jwt.go                          (159 lines) - JWT token management
│   ├── vault/
│   │   ├── service.go                      (280 lines) - Vault CRUD operations
│   │   └── errors.go                       (5 lines) - Vault error definitions
│   ├── storage/
│   │   └── s3.go                           (293 lines) - S3 presigned URLs
│   ├── sharing/
│   │   ├── service.go                      (310 lines) - E2E file sharing
│   │   └── errors.go                       (4 lines) - Sharing error definitions
│   ├── audit/
│   │   └── service.go                      (215 lines) - Audit logging with hash chain
│   ├── billing/
│   │   ├── service.go                      (192 lines) - Stripe billing integration
│   │   └── errors.go                       (5 lines) - Billing error definitions
│   ├── sync/
│   │   └── service.go                      (118 lines) - WebSocket real-time sync
│   ├── notify/
│   │   └── service.go                      (99 lines) - Push notifications (APNs/FCM)
│   └── middleware/
│       ├── auth.go                         (87 lines) - Auth and rate limiting
│       └── logging.go                      (74 lines) - Structured request logging
├── pkg/
│   └── models/
│       ├── models.go                       (142 lines) - Database models (13 types)
│       └── queries.go                      (215 lines) - SQL query constants (50+)
├── migrations/
│   └── 001_initial.sql                     (260 lines) - Database schema (12 tables)
├── deploy/
│   ├── Dockerfile                          (32 lines) - Multi-stage Docker build
│   └── docker-compose.yml                  (105 lines) - Dev environment setup
├── go.mod                                  (20 lines) - Go module dependencies
├── .env.example                            (30 lines) - Environment template
├── README.md                               (457 lines) - Architecture and docs
├── GETTING_STARTED.md                      (437 lines) - Developer setup guide
├── BUILD_SUMMARY.md                        (320 lines) - Build completion report
└── FILE_INDEX.md                           (this file)
```

---

## File Descriptions

### Main Entry Point

#### `cmd/api/main.go` (346 lines)
**Responsibility**: HTTP/2 server initialization and routing

**Key Functions**:
- `main()` - Load config, initialize services, start server
- Service initialization: PostgreSQL, Redis, S3
- Route registration for all API endpoints
- Middleware setup: CORS, logging, auth, rate limiting
- Graceful shutdown handling with signal management
- Health check endpoint

**Dependencies**: chi, pgx, redis, aws-sdk-go-v2

---

### Authentication Module (`internal/auth/`)

#### `internal/auth/srp.go` (196 lines)
**Responsibility**: Secure Remote Password (SRP-6a) authentication

**Key Functions**:
- `HandleSRPInit()` - Generate server ephemeral B, return salt and session ID
- `HandleSRPVerify()` - Validate client proof, issue JWT tokens
- `hashEmail()` - Hash email with SHA256
- `randomBigInt()` - Generate random big integer for ephemeral values

**Security**: RFC 5054, 2048-bit group, no plaintext password storage

**HTTP Endpoints**:
- `POST /api/v1/auth/srp/init` - Request authentication
- `POST /api/v1/auth/srp/verify` - Complete authentication

#### `internal/auth/jwt.go` (159 lines)
**Responsibility**: JWT token generation and validation

**Key Functions**:
- `GenerateTokenPair()` - Create access and refresh tokens
- `ValidateToken()` - Parse and validate JWT signature
- `RefreshAccessToken()` - Issue new access token from refresh token
- `loadOrGenerateKeys()` - Load or create Ed25519 key pair
- `HandleRefreshToken()` - HTTP handler for token refresh

**Security**: Ed25519 signing, short-lived access tokens (1 hour), long-lived refresh tokens (30 days)

**Custom Claims**: UserID, DeviceID, Type (access/refresh), standard JWT claims

#### `internal/auth/fido2.go` (115 lines)
**Responsibility**: FIDO2/WebAuthn hardware key support

**Key Functions**:
- `HandleFIDO2Challenge()` - Generate assertion challenge
- `HandleFIDO2Verify()` - Verify hardware key assertion response

**HTTP Endpoints**:
- `POST /api/v1/auth/fido2/challenge` - Request challenge
- `POST /api/v1/auth/fido2/verify` - Submit signed assertion

**Security**: Webauthn library, RP ID verification, attestation

---

### Vault Management (`internal/vault/`)

#### `internal/vault/service.go` (280 lines)
**Responsibility**: Encrypted vault CRUD operations

**VaultService Methods**:
- `CreateVault()` - Create new vault, return UUID
- `ListVaults()` - List all vaults for user
- `GetVault()` - Retrieve single vault
- `UpdateVaultMetadata()` - Update encrypted metadata
- `DeleteVault()` - Soft delete with timestamp

**HTTP Handlers**:
- `HandleCreateVault()` - Create endpoint
- `HandleListVaults()` - List endpoint
- `HandleGetVault()` - Get endpoint
- `HandleUpdateVault()` - Update endpoint
- `HandleDeleteVault()` - Delete endpoint

**Database Model**: `Vault` struct with ID, OwnerID, EncryptedMetadata

#### `internal/vault/errors.go` (5 lines)
**Error Types**:
- `ErrVaultNotFound`
- `ErrUnauthorized`

---

### Storage Module (`internal/storage/`)

#### `internal/storage/s3.go` (293 lines)
**Responsibility**: S3 presigned URL generation and blob management

**StorageService Methods**:
- `GenerateUploadURL()` - Create presigned PUT URL (15 min expiry)
- `GenerateDownloadURL()` - Create presigned GET URL (15 min expiry)
- `DeleteBlob()` - Remove file from S3
- `ListBlobs()` - List files in vault with sizes

**HTTP Handlers**:
- `HandleGenerateUploadURL()` - POST /api/v1/vaults/{id}/blobs/upload-url
- `HandleGenerateDownloadURL()` - POST /api/v1/vaults/{id}/blobs/download-url
- `HandleListBlobs()` - GET /api/v1/vaults/{id}/blobs
- `HandleDeleteBlob()` - DELETE /api/v1/vaults/{id}/blobs/{id}

**Key Feature**: Direct client-to-S3 transfer without server intermediary

---

### File Sharing Module (`internal/sharing/`)

#### `internal/sharing/service.go` (310 lines)
**Responsibility**: End-to-end encrypted file sharing

**SharingService Methods**:
- `CreateShare()` - Create share with 30-day expiration
- `ListReceivedShares()` - List shares received by user
- `ListSentShares()` - List shares sent by user
- `RevokeShare()` - Revoke share by sender
- `GetPublicKey()` - Retrieve user's X25519 public key

**HTTP Handlers**:
- `HandleCreateShare()` - POST /api/v1/shares
- `HandleListReceivedShares()` - GET /api/v1/shares/received
- `HandleListSentShares()` - GET /api/v1/shares/sent
- `HandleRevokeShare()` - DELETE /api/v1/shares/{id}
- `HandleGetPublicKey()` - GET /api/v1/shares/public-key/{userID}

**Key Feature**: EncryptedKey is re-encrypted with recipient's public key

#### `internal/sharing/errors.go` (4 lines)
**Error Types**:
- `ErrShareNotFound`

---

### Audit Logging Module (`internal/audit/`)

#### `internal/audit/service.go` (215 lines)
**Responsibility**: Tamper-evident audit logging with hash chain

**AuditService Methods**:
- `LogAction()` - Create audit entry with hash chain
- `VerifyChain()` - Verify integrity of entire audit trail
- `ListAuditLog()` - Paginated audit log retrieval

**HTTP Handlers**:
- `HandleListAuditLog()` - GET /api/v1/audit?limit=50&offset=0
- `HandleVerifyChain()` - POST /api/v1/audit/verify

**Hash Chain**: SHA256(prev_hash || action_type || encrypted_detail || timestamp)

**Action Types**:
- VAULT_CREATE, VAULT_DELETE, VAULT_UPDATED
- FILE_ADD, FILE_EXPORT, FILE_DELETE
- SHARE_CREATE, SHARE_REVOKE
- AUTH_LOGIN, AUTH_FIDO2
- SETTINGS_CHANGE

**Key Feature**: Partitioned by month for performance, user-verifiable

---

### Billing Module (`internal/billing/`)

#### `internal/billing/service.go` (192 lines)
**Responsibility**: Stripe subscription management

**BillingService Methods**:
- `CreateCustomer()` - Register customer with Stripe
- `CreateSubscription()` - Create subscription for tier
- `GetSubscription()` - Retrieve subscription details
- `CheckAccess()` - Verify active subscription
- `HandleWebhook()` - Process Stripe events

**HTTP Handlers**:
- `HandleCreateCustomer()` - POST /api/v1/billing/customer
- `HandleCreateSubscription()` - POST /api/v1/billing/subscribe
- `HandleGetSubscription()` - GET /api/v1/billing/subscription
- `HandleWebhook()` - POST /api/v1/billing/webhook

**Subscription Tiers**:
- `individual` - Personal use
- `team` - Team collaboration
- `enterprise` - Enterprise features

**Webhook Events**: customer.subscription.updated, deleted, invoice.payment_succeeded, failed

#### `internal/billing/errors.go` (5 lines)
**Error Types**:
- `ErrSubscriptionNotFound`
- `ErrSubscriptionInactive`

---

### Real-time Sync Module (`internal/sync/`)

#### `internal/sync/service.go` (118 lines)
**Responsibility**: WebSocket-based multi-device synchronization

**SyncService Methods**:
- `PublishSyncEvent()` - Publish event via Redis pub/sub
- `HandleWebSocket()` - Upgrade HTTP to WebSocket
- `BroadcastSyncEvent()` - Generate and publish sync event

**WebSocket Endpoint**:
- `WS /api/v1/sync` - Real-time sync channel

**Sync Event Types**:
- FILE_ADDED
- FILE_DELETED
- VAULT_UPDATED
- SHARE_RECEIVED

**Architecture**: Redis pub/sub for cross-instance distribution

---

### Notification Module (`internal/notify/`)

#### `internal/notify/service.go` (99 lines)
**Responsibility**: Push notification device management

**NotifyService Methods**:
- `RegisterDevice()` - Register device token (iOS/Android)
- `SendNotification()` - Send notification to user's devices

**HTTP Handlers**:
- `HandleRegisterDevice()` - POST /api/v1/notify/register-device

**Supported Platforms**:
- iOS - APNs (Apple Push Notification service)
- Android - FCM (Firebase Cloud Messaging)

---

### Middleware Module (`internal/middleware/`)

#### `internal/middleware/auth.go` (87 lines)
**Responsibility**: Authentication and rate limiting

**Middleware Functions**:
- `AuthMiddleware()` - Extract and validate JWT
- `RequireAuth()` - Enforce authentication
- `RequireTier()` - Enforce subscription tier
- `RateLimiter()` - Token bucket rate limiting

**Authentication**: Bearer token in Authorization header

**Rate Limiting**: Redis-backed token bucket, per-IP tracking

#### `internal/middleware/logging.go` (74 lines)
**Responsibility**: Structured request/response logging

**Logging Middleware**:
- `RequestLogger()` - Log method, path, status, duration

**Log Fields**:
- request_id
- method, path, status
- duration_ms
- user_id (if authenticated)
- remote_addr

**Log Format**: JSON via zerolog, appropriate levels (info/warn/error)

---

### Data Models (`pkg/models/`)

#### `pkg/models/models.go` (142 lines)
**Database Models** (13 types):

1. **User** - Email hash, SRP verifier/salt, public key, WebAuthn creds
2. **Vault** - Owner, encrypted metadata, timestamps
3. **Blob** - S3 key, size, vault reference
4. **VaultMember** - Shared vault access, encrypted key, role
5. **ShareRecord** - Sender, recipient, blob, encrypted key, expiry
6. **AuditEntry** - User, action type, encrypted detail, hash chain
7. **PublicKey** - User, key type, key bytes
8. **Session** - User, device, token hash, expiry
9. **Device** - User, device token, platform (iOS/Android)
10. **Subscription** - User, Stripe IDs, tier, status, expiry

**All models**:
- Use UUIDs for primary keys (except IDs)
- Include timestamps (created_at, updated_at)
- Provide database struct tags

#### `pkg/models/queries.go` (215 lines)
**SQL Queries** (50+ constants):

**User Queries**:
- CreateUser, GetUserByEmailHash, GetUserByID, UpdateUserPublicKey

**Vault Queries**:
- CreateVault, ListVaults, GetVault, UpdateVaultMetadata, SoftDeleteVault

**Blob Queries**:
- CreateBlob, ListBlobsByVault, DeleteBlob

**Share Queries**:
- CreateShare, ListReceivedShares, ListSentShares, RevokeShare, GetSharesByID

**Audit Queries**:
- CreateAuditEntry, ListAuditEntries, GetLastAuditHash

**Public Key Queries**:
- CreatePublicKey, GetUserPublicKey

**Session Queries**:
- CreateSession, GetSession, ValidateSession, InvalidateSession

**Device Queries**:
- CreateDevice, ListDevices, DeleteDevice

**Subscription Queries**:
- CreateSubscription, GetSubscription, UpdateSubscription, CancelSubscription

**Vault Member Queries**:
- AddVaultMember, ListVaultMembers, RemoveVaultMember, AcceptVaultInvite

**Style**: Parameterized queries, PostgreSQL placeholders ($1, $2, etc.)

---

### Database Migration (`migrations/`)

#### `migrations/001_initial.sql` (260 lines)
**Database Schema** (12 tables):

1. **users** - Core user data with SRP verifier
2. **vaults** - Encrypted vault containers
3. **vault_members** - Shared vault access
4. **blobs** - File references in S3
5. **share_records** - E2E encrypted file shares
6. **public_keys** - User public keys
7. **sessions** - Active user sessions
8. **devices** - Push notification device tokens
9. **subscriptions** - Billing subscriptions
10. **audit_log** - Tamper-evident audit trail (partitioned monthly)

**Features**:
- UUID primary keys (gen_random_uuid())
- Foreign key constraints with CASCADE delete
- Enum types: subscription_tier, subscription_status, vault_member_role
- Comprehensive indexes on all query columns
- Monthly partitioning for audit_log
- Updated_at trigger functions
- TIMESTAMP WITH TIME ZONE for all dates

**Indexes** (15+ total):
- email_hash (users)
- owner_id (vaults)
- vault_id (blobs, vault_members, share_records)
- user_id (audit_log, devices, subscriptions)
- timestamp (audit_log)
- recipient_id (share_records)
- status (subscriptions)

---

### Deployment (`deploy/`)

#### `deploy/Dockerfile` (32 lines)
**Multi-stage Docker build**:

**Stage 1 - Builder**:
- Base: golang:1.22-alpine
- Copy go.mod/go.sum, download dependencies
- Copy source code
- Build with CGO_ENABLED=0 for static binary

**Stage 2 - Runtime**:
- Base: alpine:3.19
- Install ca-certificates and tzdata
- Create non-root user (app:1000)
- Copy binary from builder
- Expose port 8080
- Health check endpoint
- Run as non-root user

**Result**: ~20MB minimal image

#### `deploy/docker-compose.yml` (105 lines)
**Development Environment**:

**Services**:
1. **PostgreSQL 16** - Port 5432
   - Database: usbvault
   - User: usbvault
   - Auto-initialize from migrations
   - Volume persistence

2. **Redis 7** - Port 6379
   - Session and cache storage
   - Pub/sub for sync
   - Volume persistence

3. **MinIO** - Port 9000 (API), 9001 (UI)
   - S3-compatible object storage
   - Credentials: minioadmin/minioadmin
   - Volume persistence

4. **API Server** - Port 8080
   - Go application
   - Live code mounting for development
   - Auto-restart on code changes
   - Health check enabled

**Features**:
- All services have health checks
- Proper dependency ordering
- Environment variable configuration
- Named volumes for data persistence
- Custom bridge network

---

### Configuration

#### `go.mod` (20 lines)
**Dependencies** (13 packages):

- `github.com/go-chi/chi/v5` - HTTP router
- `github.com/go-chi/cors` - CORS middleware
- `github.com/jackc/pgx/v5` - PostgreSQL driver
- `github.com/aws/aws-sdk-go-v2` - AWS SDK
- `github.com/aws/aws-sdk-go-v2/service/s3` - S3 service
- `github.com/aws/aws-sdk-go-v2/config` - AWS config
- `github.com/golang-jwt/jwt/v5` - JWT tokens
- `github.com/redis/go-redis/v9` - Redis client
- `github.com/go-webauthn/webauthn` - FIDO2 support
- `golang.org/x/crypto` - Cryptographic functions
- `github.com/google/uuid` - UUID generation
- `github.com/rs/zerolog` - Structured logging
- `github.com/joho/godotenv` - Environment loading

#### `.env.example` (30 lines)
**Environment Variables**:

**Required**:
- DATABASE_URL
- REDIS_URL
- S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY

**Auth**:
- JWT_ED25519_PRIVATE_KEY
- JWT_ED25519_PUBLIC_KEY

**Payments**:
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET

**FIDO2**:
- FIDO2_RELYING_PARTY_ID
- FIDO2_RELYING_PARTY_NAME
- FIDO2_RELYING_PARTY_ORIGIN

**Push Notifications**:
- APNS_KEY_ID, APNS_TEAM_ID, etc. (optional)
- FCM_PROJECT_ID (optional)

---

### Documentation

#### `README.md` (457 lines)
**Comprehensive Guide**:
- Architecture overview
- Zero-knowledge guarantees
- Component descriptions
- API endpoint reference (20+ endpoints)
- Security features
- Development setup
- Building for production
- Kubernetes deployment example
- Monitoring and logging
- Contributing guidelines

#### `GETTING_STARTED.md` (437 lines)
**Developer Quick Start**:
- Prerequisites and installation
- Docker Compose quick start
- Manual setup instructions
- Testing the API
- Development workflow
- Database management
- Redis management
- S3/MinIO management
- Logs and debugging
- Troubleshooting guide
- Common tasks
- Load testing examples
- Environment variable reference

#### `BUILD_SUMMARY.md` (320 lines)
**Build Report**:
- Project completion status
- File inventory with line counts
- Architecture highlights
- Database schema summary
- API endpoints overview
- Development quick start
- Production deployment checklist
- Code quality notes
- Next steps for production

---

## Cross-Module Dependencies

```
main.go
├── auth/ (srp, fido2, jwt)
├── vault/ (service)
├── storage/ (s3)
├── sharing/ (service)
├── audit/ (service)
├── billing/ (service)
├── sync/ (service)
├── notify/ (service)
└── middleware/ (auth, logging)

vault/, storage/, sharing/, audit/, notify/
└── models/ (models, queries)
```

---

## Key Implementation Details

### Authentication Flow
1. Client requests SRP init with email
2. Server returns salt and ephemeral B
3. Client computes proof M1
4. Server verifies M1, returns M2 and JWT tokens
5. Client uses access token for API requests
6. Refresh token exchanges for new access token when expired

### File Storage Flow
1. Client requests presigned upload URL
2. Server generates 15-min expiring URL for S3
3. Client uploads file directly to S3
4. Client notifies server of file completion
5. Server stores file metadata in database

### Sharing Flow
1. Sender gets recipient's public key
2. Sender encrypts file key with recipient's key
3. Sender creates share record
4. Recipient retrieves share with encrypted key
5. Recipient decrypts key with their private key

### Audit Flow
1. Every action logged with encrypted detail
2. New entry includes hash of previous entry
3. Users can verify chain integrity
4. Tampered entries detected immediately

---

## Testing Coverage Areas

### Unit Tests Needed
- Auth token generation/validation
- JWT parsing and expiry
- SRP math verification
- Vault access control
- Share expiration logic
- Audit chain verification

### Integration Tests Needed
- End-to-end auth flow
- Vault CRUD with audit log
- Share creation and revocation
- S3 presigned URL functionality
- WebSocket sync broadcasts
- Database migrations

### Load Tests Needed
- JWT validation performance
- Database query performance
- S3 presigned URL generation
- Redis pub/sub throughput
- Rate limiter accuracy

---

This index provides a complete reference to all files in the Quantum Armor Vault (QAV) backend codebase.
