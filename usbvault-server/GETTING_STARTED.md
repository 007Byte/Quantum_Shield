# Getting Started with Quantum_Shield Backend

This guide will help you set up the development environment and get the server running locally.

## Prerequisites

### Required
- **Go 1.22+** - [Download](https://golang.org/dl/)
- **Docker** - [Download](https://docker.com/products/docker-desktop)
- **Docker Compose** - Usually included with Docker Desktop
- **curl** or **Postman** - For testing API endpoints

### Optional
- **PostgreSQL 16** - If running without Docker
- **Redis 7** - If running without Docker
- **wscat** - WebSocket testing: `npm install -g wscat`

## Quick Start (with Docker)

### 1. Navigate to the project
```bash
cd /sessions/gracious-stoic-knuth/mnt/Quantum Armor Vault/Enterprise_Version/usbvault-server
```

### 2. Start all services
```bash
cd deploy
docker-compose up -d
```

This will start:
- PostgreSQL 16 (port 5432)
- Redis 7 (port 6379)
- MinIO S3 (port 9000, UI on 9001)
- Go API server (port 8080)

### 3. Verify services are healthy
```bash
docker-compose ps
```

Expected output:
```
NAME                COMMAND                  STATUS
usbvault-postgres   "docker-entrypoint.s…"   Up 2 minutes (healthy)
usbvault-redis      "redis-server"           Up 2 minutes (healthy)
usbvault-minio      "/usr/bin/docker-ent…"   Up 2 minutes (healthy)
usbvault-api        "go run ./cmd/api"       Up 2 minutes (healthy)
```

### 4. Test the API
```bash
curl http://localhost:8080/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-01-15T10:30:45Z"}
```

Great! Your server is running. Proceed to "Testing the API" section below.

## Manual Setup (without Docker)

### 1. Install Go dependencies
```bash
go mod download
```

### 2. Set up PostgreSQL
```bash
# Create database
createdb usbvault
createuser usbvault -P  # Set password: dev_password_change_me

# Grant permissions
psql -d postgres -c "ALTER USER usbvault CREATEDB;"

# Run migrations
psql -U usbvault -d usbvault -f migrations/001_initial.sql
```

### 3. Start Redis
```bash
# Using Homebrew on macOS
brew services start redis

# Or using Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### 4. Configure environment
```bash
cp .env.example .env
# Edit .env and set DATABASE_URL to your local PostgreSQL
```

### 5. Run the server
```bash
go run ./cmd/api
```

You should see:
```
INF database connected
INF redis connected
INF S3 client initialized
INF starting server port=8080
```

## Testing the API

### 1. Health Check
```bash
curl http://localhost:8080/health
```

### 2. Create a User (SRP Registration)

First, you need to implement the client-side registration, but for testing:

```bash
# This would be done by the client side
# POST /api/v1/auth/srp/init with username hash
curl -X POST http://localhost:8080/api/v1/auth/srp/init \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

### 3. Create a Vault (Authenticated)

First, you need a valid JWT token. For testing, you can generate one:

```bash
# In a real scenario, you'd use the JWT from SRP/FIDO2 auth
# For now, test the unauthenticated endpoints
```

### 4. Test Health Endpoint
```bash
curl -v http://localhost:8080/health
```

## Development Workflow

### Running Tests
```bash
# Run all tests
go test ./...

# Run with verbose output
go test -v ./...

# Run specific package
go test ./internal/auth/...
```

### Building the Binary
```bash
# Development build
go build -o server ./cmd/api

# Production build (static binary)
CGO_ENABLED=0 go build -a -installsuffix cgo -o server ./cmd/api
```

### Code Formatting
```bash
# Format all Go files
go fmt ./...

# Run Go linter
golangci-lint run ./...
```

### Live Reload (optional)
Install `air` for live reloading:
```bash
go install github.com/cosmtrek/air@latest
air
```

## Database Management

### Connect to PostgreSQL
```bash
# Via docker-compose
docker-compose exec postgres psql -U usbvault -d usbvault

# Via local installation
psql -U usbvault -d usbvault -h localhost
```

### View Tables
```sql
-- List all tables
\dt

-- Describe a table
\d users

-- See indexes
\di
```

### Insert Test Data
```sql
-- Create a test user
INSERT INTO users (email_hash, srp_verifier, srp_salt, subscription_tier)
VALUES ('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        E'\\x' || repeat('00', 256),
        E'\\x' || repeat('00', 16),
        'free');
```

## Redis Management

### Connect to Redis
```bash
# Via docker-compose
docker-compose exec redis redis-cli

# Via local installation
redis-cli
```

### Useful Redis Commands
```redis
# Check all keys
KEYS *

# Get session info
GET srp:session-id

# Clear all data
FLUSHALL
```

## S3/MinIO Management

### Access MinIO Console
- URL: http://localhost:9001
- Username: minioadmin
- Password: minioadmin

### Create S3 Bucket
```bash
# Via AWS CLI (configured for MinIO)
aws --endpoint-url http://localhost:9000 s3 mb s3://usbvault-dev
```

## Logs and Debugging

### View Server Logs
```bash
# Docker
docker-compose logs -f api

# Local (running in terminal)
# Logs appear in stdout
```

### Set Log Level
```bash
# In .env file
LOG_LEVEL=debug  # debug, info, warn, error
```

### Request Tracing
Each request gets a unique ID in logs:
```json
{
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "POST",
  "path": "/api/v1/auth/srp/init",
  "status": 200,
  "duration_ms": 145
}
```

## Troubleshooting

### Port Already in Use
```bash
# Find and kill process on port 8080
lsof -i :8080
kill -9 <PID>

# Or use a different port
SERVER_PORT=8081 go run ./cmd/api
```

### Database Connection Failed
```bash
# Check PostgreSQL is running
docker-compose exec postgres pg_isready

# Check DATABASE_URL is correct
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL
```

### Redis Connection Failed
```bash
# Check Redis is running
docker-compose exec redis redis-cli ping

# Should return: PONG
```

### API Won't Start
```bash
# Check for port conflicts
netstat -an | grep 8080

# Check environment variables
env | grep DATABASE_URL

# Run with verbose error output
go run ./cmd/api 2>&1
```

## Common Tasks

### Reset Database
```bash
# Stop services
docker-compose down

# Remove volume
docker volume rm usbvault-postgres_data

# Start fresh
docker-compose up -d
```

### View Database Schema
```bash
docker-compose exec postgres psql -U usbvault -d usbvault -c "\dt+"
```

### Generate JWT Key Pair
```bash
# Generate Ed25519 keypair and convert to base64
go run scripts/generate-keys.go  # (would need to create this script)

# Or manually (requires openssl):
openssl genpkey -algorithm ed25519 | openssl base64 -A
```

### Test WebSocket Connection
```bash
# Install wscat
npm install -g wscat

# Connect with valid JWT
wscat -c "ws://localhost:8080/api/v1/sync?token=YOUR_JWT_TOKEN"

# Type messages to test
> {"type":"ping"}
```

## Load Testing

### Using Apache Bench
```bash
# Test health endpoint
ab -n 1000 -c 100 http://localhost:8080/health

# With request body
ab -n 1000 -c 100 -p request.json -T application/json http://localhost:8080/api/v1/auth/srp/init
```

### Using k6
```bash
# Install k6
brew install k6

# Run load test
k6 run tests/load-test.js
```

## Environment Variables Reference

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string (default: redis://localhost:6379)

### Optional
- `SERVER_PORT` - API port (default: 8080)
- `LOG_LEVEL` - Logging level (default: info)
- `S3_ENDPOINT` - S3 endpoint (default: https://s3.amazonaws.com)
- `S3_BUCKET` - S3 bucket name (default: usbvault-prod)
- `S3_ACCESS_KEY` - S3 access key
- `S3_SECRET_KEY` - S3 secret key
- `AWS_REGION` - AWS region (default: us-east-1)
- `JWT_ED25519_PRIVATE_KEY` - Ed25519 private key (base64)
- `JWT_ED25519_PUBLIC_KEY` - Ed25519 public key (base64)
- `STRIPE_SECRET_KEY` - Stripe API key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `FIDO2_RELYING_PARTY_ID` - FIDO2 relying party ID
- `FIDO2_RELYING_PARTY_NAME` - FIDO2 relying party name
- `FIDO2_RELYING_PARTY_ORIGIN` - FIDO2 relying party origin

## Next Steps

1. **Explore the API** - Review the README.md for all available endpoints
2. **Write Tests** - Create unit and integration tests
3. **Build a Client** - Implement the TypeScript/JavaScript client SDK
4. **Deploy** - Follow production deployment guide in README.md

## Getting Help

- Check the README.md for architecture details
- Review code comments in source files
- Check Docker logs: `docker-compose logs api`
- Check PostgreSQL logs: `docker-compose logs postgres`
- Consult the Go standard library docs: https://pkg.go.dev

## Security Notes for Development

⚠️ These are development defaults. **Never use in production**:

- PostgreSQL password: `dev_password_change_me`
- MinIO credentials: `minioadmin:minioadmin`
- No HTTPS enforcement
- No CORS restrictions
- No rate limiting enforcement

## Performance Tips

1. **Database connections** - Adjust `DATABASE_URL` pool size
2. **Redis memory** - Monitor with `redis-cli INFO memory`
3. **S3 uploads** - Use multipart upload for large files
4. **Caching** - Implement Redis caching for frequently accessed data
5. **Indexing** - Ensure database indexes on frequently queried columns

---

Happy developing! 🚀
