# Quantum Armor Vault (QAV) - Go Backend Server

A zero-knowledge SaaS backend for Quantum Armor Vault (QAV). The server never sees plaintext data, encryption keys, or passwords.

## Architecture Overview

### Zero-Knowledge Guarantees

- **No plaintext storage**: All user data arrives encrypted and stored encrypted
- **Client-side encryption**: Users encrypt data before upload
- **E2E file sharing**: Recipients encrypt shared keys with their own public key
- **Tamper-evident audit log**: Hash-chained audit entries with user verification
- **Presigned URLs**: Direct S3 transfer - server never touches file contents

### Core Components

#### Authentication (`internal/auth/`)
- **SRP-6a**: Secure Remote Password authentication (RFC 5054, 2048-bit)
- **FIDO2/WebAuthn**: Hardware security key support
- **JWT**: Ed25519-signed tokens for session management
  - Access tokens: 1 hour expiry
  - Refresh tokens: 30 day expiry

#### Storage (`internal/storage/`)
- **S3 Integration**: Encrypted blob storage with presigned URLs
- **15-min expiry**: Upload/download URLs expire after 15 minutes
- **Direct transfer**: Server generates URLs, client uploads directly

#### Vault Management (`internal/vault/`)
- **CRUD operations**: Create, list, get, update, delete vaults
- **Encrypted metadata**: All vault metadata stored encrypted
- **Access control**: Owner-based access enforcement

#### E2E File Sharing (`internal/sharing/`)
- **Public key distribution**: X25519 keys for sealed box encryption
- **Encrypted sharing**: File keys re-encrypted with recipient's public key
- **Expiration**: Shares expire after 30 days by default
- **Revocation**: Sender can revoke shares at any time

#### Audit Logging (`internal/audit/`)
- **Hash chain**: SHA256(prev_hash || action || encrypted_detail || timestamp)
- **Tamper detection**: Chain verification ensures integrity
- **User verification**: Users can verify their own audit logs
- **Monthly partitioning**: Audit logs partitioned by month for performance

#### Billing (`internal/billing/`)
- **Stripe integration**: Subscription management
- **Tiers**: Individual, Team, Enterprise
- **Webhook support**: Subscription event handling

#### Multi-device Sync (`internal/sync/`)
- **WebSocket**: Real-time sync via WebSocket
- **Redis pub/sub**: Cross-instance message distribution
- **Encrypted events**: All sync payloads remain encrypted

#### Notifications (`internal/notify/`)
- **APNs**: iOS push notifications
- **FCM**: Android push notifications
- **Device registration**: Per-device token management

### Database Schema

#### Core Tables
- `users`: User accounts with SRP verifier and public key
- `vaults`: Encrypted vault containers
- `vault_members`: Shared vault access
- `blobs`: File references (S3 keys, sizes)
- `share_records`: E2E shared files with expiration
- `public_keys`: User X25519 public keys
- `sessions`: Active user sessions
- `devices`: Push notification device tokens
- `subscriptions`: Billing subscriptions
- `audit_log`: Tamper-evident audit trail (partitioned by month)

#### Indexes
- Email hash lookup (O(1))
- Vault owner queries (O(log n))
- Share recipient queries (O(log n))
- Audit log user + timestamp (O(log n))

## Development Setup

### Prerequisites
- Go 1.22+
- PostgreSQL 16
- Redis 7
- Docker & Docker Compose (optional)

### Quick Start

1. Clone and enter directory
```bash
cd /sessions/gracious-stoic-knuth/mnt/Quantum Armor Vault/Enterprise_Version/usbvault-server
```

2. Copy environment template
```bash
cp .env.example .env
```

3. Start services with Docker Compose
```bash
cd deploy
docker-compose up -d
```

4. Wait for services to be healthy
```bash
# Check services
docker-compose ps

# View API logs
docker-compose logs -f api
```

5. Run migrations
```bash
docker-compose exec postgres psql -U usbvault -d usbvault -f /migrations/001_initial.sql
```

6. API is available at `http://localhost:8080`

### API Endpoints

#### Authentication
```
POST /api/v1/auth/srp/init          - Start SRP auth
POST /api/v1/auth/srp/verify        - Complete SRP auth
POST /api/v1/auth/fido2/challenge   - FIDO2 challenge
POST /api/v1/auth/fido2/verify      - FIDO2 verification
POST /api/v1/auth/refresh           - Refresh access token
```

#### Vaults
```
POST   /api/v1/vaults                      - Create vault
GET    /api/v1/vaults                      - List vaults
GET    /api/v1/vaults/{vaultID}            - Get vault
PUT    /api/v1/vaults/{vaultID}            - Update vault
DELETE /api/v1/vaults/{vaultID}            - Delete vault
```

#### Files (Blobs)
```
POST /api/v1/vaults/{vaultID}/blobs/upload-url    - Get presigned upload URL
POST /api/v1/vaults/{vaultID}/blobs/download-url  - Get presigned download URL
GET  /api/v1/vaults/{vaultID}/blobs                - List blobs in vault
DELETE /api/v1/vaults/{vaultID}/blobs/{blobID}    - Delete file
```

#### Sharing
```
POST   /api/v1/shares              - Create share
GET    /api/v1/shares/received     - List received shares
GET    /api/v1/shares/sent         - List sent shares
DELETE /api/v1/shares/{shareID}    - Revoke share
GET    /api/v1/shares/public-key/{userID} - Get user's public key
```

#### Audit
```
GET  /api/v1/audit          - List audit log
POST /api/v1/audit/verify   - Verify hash chain
```

#### Billing
```
POST /api/v1/billing/customer    - Create customer
POST /api/v1/billing/subscribe   - Create subscription
GET  /api/v1/billing/subscription - Get subscription
POST /api/v1/billing/webhook     - Stripe webhook
```

#### Sync
```
WS /api/v1/sync - WebSocket for real-time sync
```

### Security Features

1. **SRP-6a**: Secure password authentication without server seeing plaintext
2. **E2E Encryption**: Files encrypted by client, key shared encrypted
3. **FIDO2**: Hardware security key authentication
4. **Hash Chain**: Tamper-evident audit log with verification
5. **Presigned URLs**: Direct S3 transfer without server intermediary
6. **Token-based Auth**: Ed25519-signed JWT with short expiry
7. **Rate Limiting**: Redis-backed token bucket rate limiter
8. **CORS**: Configurable cross-origin policies

## Project Structure

```
usbvault-server/
├── cmd/api/                 # Entry point
│   └── main.go
├── internal/
│   ├── auth/               # Authentication (SRP, FIDO2, JWT)
│   ├── vault/              # Vault CRUD
│   ├── storage/            # S3 integration
│   ├── sharing/            # E2E sharing
│   ├── audit/              # Audit logging
│   ├── billing/            # Stripe integration
│   ├── sync/               # WebSocket sync
│   ├── notify/             # Push notifications
│   └── middleware/         # HTTP middleware
├── pkg/models/             # Data models and queries
├── migrations/             # Database migrations
├── deploy/                 # Docker configurations
├── go.mod / go.sum         # Go dependencies
└── README.md              # This file
```

## Building for Production

### Build Docker Image
```bash
docker build -f deploy/Dockerfile -t usbvault-server:latest .
```

### Environment Variables (Production)
```bash
# Database (RDS)
DATABASE_URL=postgres://user:pass@rds.amazonaws.com:5432/usbvault?sslmode=require

# Redis (ElastiCache)
REDIS_URL=redis://elasticache.amazonaws.com:6379

# S3
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=usbvault-prod
S3_ACCESS_KEY=***
S3_SECRET_KEY=***
AWS_REGION=us-east-1

# JWT Keys (generate with: openssl rand -base64 32)
JWT_ED25519_PRIVATE_KEY=***
JWT_ED25519_PUBLIC_KEY=***

# Stripe
STRIPE_SECRET_KEY=sk_live_***
STRIPE_WEBHOOK_SECRET=whsec_***

# FIDO2
FIDO2_RELYING_PARTY_ID=qav.io
FIDO2_RELYING_PARTY_NAME=Quantum Armor Vault
FIDO2_RELYING_PARTY_ORIGIN=https://qav.io

# Server
SERVER_PORT=8080
LOG_LEVEL=info
```

### Kubernetes Deployment (Example)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: usbvault-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: usbvault-api
  template:
    metadata:
      labels:
        app: usbvault-api
    spec:
      containers:
      - name: api
        image: usbvault-server:latest
        ports:
        - containerPort: 8080
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: usbvault-secrets
              key: database-url
        # ... other env vars
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
```

## Testing

### Run Tests
```bash
go test ./...
```

### Load Testing (ab)
```bash
ab -n 1000 -c 100 http://localhost:8080/health
```

### WebSocket Testing
```bash
wscat -c ws://localhost:8080/api/v1/sync
```

## Monitoring & Logging

- **Structured logging**: All logs in JSON format via zerolog
- **Request IDs**: Unique ID per request for tracing
- **Duration tracking**: API response times logged
- **Health check**: `/health` endpoint for load balancers

Example log:
```json
{
  "level": "info",
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "path": "/api/v1/auth/srp/verify",
  "status": 200,
  "duration_ms": 145,
  "user_id": "user-123",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "message": "request completed"
}
```

## Security Considerations

1. **Database**
   - Use RDS with encryption at rest
   - Enable backups and point-in-time recovery
   - Restricted security group access

2. **Redis**
   - ElastiCache with encryption at rest/transit
   - AUTH token enabled
   - Private subnet only

3. **S3**
   - Bucket encryption (AES-256)
   - Block public access
   - Versioning enabled
   - MFA delete protection

4. **API Server**
   - Rate limiting per IP
   - HTTPS only in production
   - CORS configured to trusted origins
   - No sensitive data in logs

5. **Secrets**
   - JWT keys in AWS Secrets Manager
   - Stripe keys in AWS Secrets Manager
   - Rotate regularly
   - Never commit to git

## Contributing

1. Follow Go conventions (gofmt, golint)
2. Write tests for new features
3. Document public APIs
4. Use conventional commit messages
5. Security: Report via security@qav.io

## License

Quantum Armor Vault (QAV) - Proprietary
