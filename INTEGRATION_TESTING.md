# Integration Testing Guide — USBVault Enterprise

This document describes the full-stack integration test harness for USBVault Enterprise, which orchestrates the Go backend and Expo web frontend together in an isolated test environment.

> **Pushing changes?** Run the local CI mirror first — see
> **[docs/QA_QC.md](docs/QA_QC.md)** (`scripts/preflight.sh`). It runs every
> reproducible CI gate, including these integration tests, on your machine
> before the push so CI is a confirmation, not a discovery tool.

## Overview

The integration test harness provides:

1. **Isolated Docker Compose Environment** (`docker-compose.test.yml`)
   - Separate from development stack (no port conflicts)
   - Uses tmpfs for database and S3 (fast, auto-cleanup)
   - Real PostgreSQL, Redis, MinIO (not mocks)

2. **Orchestration Script** (`scripts/integration-test.sh`)
   - Starts services, runs migrations, executes all tests, cleans up
   - Single command for full end-to-end validation

3. **Go Integration Test Fixtures** (`internal/testutil/fixtures.go`)
   - HTTP-based client for making API calls from tests
   - Helpers for user registration, vault creation, blob upload/download
   - Comprehensive error handling and response parsing

4. **Sample Tests** (`internal/integration/vault_flow_test.go`)
   - `TestVaultFullFlow`: Complete vault lifecycle (create, upload, delete)
   - `TestMultipleVaults`: Concurrent vault operations
   - `TestLoginWithExistingUser`: Session and token validation
   - `TestAPIHealthCheck`: API availability check

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Go 1.23+ (for backend tests)
- Node.js 18+ and npm (for frontend tests)

### Run All Integration Tests

```bash
./scripts/integration-test.sh
```

This will:
1. Start isolated PostgreSQL (port 5433), Redis (6380), MinIO (9002)
2. Start the API server on port 8090
3. Run all backend integration tests (tagged `integration`)
4. Run all frontend E2E tests (Playwright)
5. Clean up all services and volumes

### Run Backend Tests Only

```bash
./scripts/integration-test.sh --backend-only
```

This skips the frontend E2E tests but runs the full backend suite.

### Run Frontend Tests Only

```bash
./scripts/integration-test.sh --frontend-only
```

This assumes the backend is already running and hits `http://localhost:8090` for API calls.

### Keep Services Running

To debug test failures or manually test the API:

```bash
./scripts/integration-test.sh --keep-services
```

Services will remain running after the script exits. Clean up manually:

```bash
docker compose -f docker-compose.test.yml down -v
```

## Configuration

### Isolated Environment

The test environment uses different ports and credentials from development:

| Service | Dev Port | Test Port | Credentials |
|---------|----------|-----------|-------------|
| PostgreSQL | 5432 | 5433 | `usbvault:test_password_change_me` |
| Redis | 6379 | 6380 | password: `test_redis_pass` |
| MinIO (API) | 9000 | 9002 | `minioadmin:minioadmin_secret` |
| MinIO (Console) | 9001 | 9003 | (same) |
| API | 8080 | 8090 | (no auth required for public endpoints) |

### Database Isolation

The test database uses `tmpfs` (in-memory filesystem):

```yaml
tmpfs:
  - /var/lib/postgresql/data:size=512m
```

This provides:
- **Speed**: No disk I/O overhead
- **Isolation**: No data persists between test runs
- **Auto-cleanup**: Volume disappears when container stops

### Environment Variables

Tests respect `API_URL` environment variable:

```bash
API_URL=http://myserver:8090 ./scripts/integration-test.sh
```

If not set, defaults to `http://localhost:8090`.

Frontend tests also read `API_URL` to determine which backend to target:

```bash
cd usbvault-app && API_URL=http://localhost:8090 npx playwright test
```

## Writing Integration Tests

### Backend Integration Tests

Backend integration tests use the build tag `//go:build integration` to distinguish them from unit tests.

#### Example: Simple Vault Flow

```go
//go:build integration

package integration

import (
	"testing"
	"github.com/usbvault/usbvault-server/internal/testutil"
)

func TestCreateVault(t *testing.T) {
	// Create API client (uses API_URL env var or defaults to localhost:8090)
	client := testutil.NewAPIClient(testutil.GetAPIURL())

	// Register a user
	user, err := client.CreateTestUser("TestPassword123!@#")
	if err != nil {
		t.Fatalf("registration failed: %v", err)
	}

	// Create a vault
	vault, err := client.CreateVault(user, "My Test Vault")
	if err != nil {
		t.Fatalf("vault creation failed: %v", err)
	}

	// Verify
	if vault.ID == "" {
		t.Fatal("vault ID is empty")
	}

	t.Logf("Created vault: %s", vault.ID)
}
```

#### Available Fixtures

The `testutil.APIClient` provides these methods:

**User Management:**
- `CreateTestUser(password)` → `*TestUser`
- `LoginTestUser(email, password)` → `*TestUser`
- `CleanupUser(user)` → error

**Vault Operations:**
- `CreateVault(user, name)` → `*TestVault`
- `ListVaults(user)` → `[]TestVault`
- `DeleteVault(user, vaultID)` → error

**Blob Operations:**
- `UploadBlob(user, vaultID, data, filename)` → `*TestBlob`
- `ListBlobs(user, vaultID)` → `[]TestBlob`
- `DeleteBlob(user, vaultID, blobID)` → error

#### Key Design Decisions

1. **HTTP-based fixtures**: Tests hit the real API, not mocked handlers. This exercises the entire request/response cycle.

2. **Auto-generated test emails**: Each user gets a unique email (`test-{timestamp}@usbvault.local`) to avoid registration conflicts.

3. **No cleanup needed**: The tmpfs database is destroyed when the container stops, so explicit cleanup is optional.

4. **Comprehensive error messages**: All fixtures return wrapped errors that include HTTP status codes and response bodies, making debugging easier.

### Frontend E2E Tests

Frontend E2E tests use Playwright and the helpers from `usbvault-app/e2e/helpers.ts`.

#### Directing Tests to Test Backend

Update `usbvault-app/playwright.config.ts` to use the test API:

```typescript
use: {
  baseURL: process.env.API_URL || 'http://localhost:8081',
  // ...
},
```

When running via the integration script:

```bash
API_URL=http://localhost:8090 npx playwright test
```

#### Example: Auth Flow Test

```typescript
// usbvault-app/e2e/vault.spec.ts
import { test, expect } from '@playwright/test';
import { registerAndLogin, createVault, waitForApp } from './helpers';

test('create and list vaults', async ({ page }) => {
  await waitForApp(page);
  const email = await registerAndLogin(page);

  // Create a vault
  await createVault(page, 'Test Vault');

  // Verify it appears in the list
  await expect(page.getByText('Test Vault')).toBeVisible();
});
```

The test framework uses environment variable injection:
- Set `API_URL` before running Playwright
- Tests hit the API endpoint directly (HTTP requests)
- Frontend is served via Expo web dev server (configured in `playwright.config.ts`)

## Test Organization

### Backend Tests

```
usbvault-server/
├── cmd/
│   └── api/
│       ├── main_test.go         # Unit tests
│       └── routes_test.go        # Route unit tests
├── internal/
│   ├── integration/
│   │   └── vault_flow_test.go   # Integration tests (//go:build integration)
│   ├── testutil/
│   │   └── fixtures.go          # HTTP fixtures for integration tests
│   └── [other packages]/
│       └── *_test.go            # Unit tests
```

Integration tests are in `internal/integration/` and use the `integration` build tag.

### Frontend Tests

```
usbvault-app/
├── e2e/
│   ├── helpers.ts               # Shared E2E helpers
│   ├── auth.spec.ts             # Authentication tests
│   ├── vault.spec.ts            # Vault operations tests
│   └── ...
└── playwright.config.ts          # Playwright configuration
```

## Running Tests Separately

### Backend Integration Tests Only

```bash
# Start services manually
docker compose -f docker-compose.test.yml up -d --wait

# Run migrations
docker compose -f docker-compose.test.yml exec api /app/migrate up

# Run tests
cd usbvault-server
go test -tags=integration -v ./...

# Cleanup
docker compose -f docker-compose.test.yml down -v
```

### Frontend E2E Tests Only

Assumes backend is running on `localhost:8090`:

```bash
cd usbvault-app
API_URL=http://localhost:8090 npx playwright test
```

### Run Specific Test

```bash
# Backend
cd usbvault-server
go test -tags=integration -v -run TestVaultFullFlow ./internal/integration

# Frontend
cd usbvault-app
npx playwright test vault.spec.ts
```

## Troubleshooting

### Services Won't Start

**Problem**: `docker compose up` fails with "port already in use"

**Solution**: The dev environment is likely still running. Choose one:

```bash
# Option 1: Stop dev services
docker compose down

# Option 2: Use different ports in test compose file
# (already done — test uses 5433, 6380, 9002, 8090)
```

**Problem**: Database health check times out

**Solution**: Check logs:

```bash
docker compose -f docker-compose.test.yml logs postgres
```

### API Tests Fail

**Problem**: `connection refused` when tests try to reach `localhost:8090`

**Solution**:
1. Verify API is healthy: `curl http://localhost:8090/health`
2. Check logs: `docker compose -f docker-compose.test.yml logs api`
3. Ensure database migrations ran: `docker compose -f docker-compose.test.yml logs api | grep migration`

**Problem**: Database migration errors

**Solution**:
1. Check migration files exist: `ls usbvault-server/migrations/`
2. Verify database connectivity: `docker compose -f docker-compose.test.yml exec postgres psql -U usbvault -d usbvault_test -c "SELECT version();"`

### Frontend Tests Fail

**Problem**: Playwright can't find elements

**Solution**:
1. Verify API is reachable from frontend: `curl http://localhost:8090/health` from within the test
2. Check that testid attributes match expected selectors in helpers.ts
3. Increase timeouts if tests are flaky: `{ timeout: 20000 }` in Playwright assertions

**Problem**: `API_URL` not being used

**Solution**: Verify environment variable is set before running tests:

```bash
export API_URL=http://localhost:8090
echo $API_URL  # Should print URL
npx playwright test
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Docker
        uses: docker/setup-buildx-action@v2

      - name: Set up Go
        uses: actions/setup-go@v4
        with:
          go-version: '1.23'

      - name: Set up Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Run integration tests
        run: ./scripts/integration-test.sh

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: usbvault-app/playwright-report/
```

### Local Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

if ! ./scripts/integration-test.sh; then
  echo "Integration tests failed. Commit aborted."
  exit 1
fi
```

## Performance Notes

- **Database**: tmpfs gives ~10x speedup vs disk-based test DB
- **Tests**: Full suite (70+ backend + 10+ frontend) should complete in ~2-3 minutes
- **Parallelization**: Backend tests run in parallel (`go test` default); frontend tests are sequential (adjust in `playwright.config.ts` if needed)

## Best Practices

1. **Write isolated tests**: Each test should be independent; avoid shared state
2. **Use unique IDs**: Generate unique vault/blob names to avoid conflicts
3. **Clean up explicitly** (optional): Test fixtures are auto-cleaned by tmpfs, but you can call `DeleteVault()` or `CleanupUser()` for explicit cleanup
4. **Test real scenarios**: Integration tests should exercise real user workflows, not just happy paths
5. **Check error codes**: Verify both success cases and error conditions (invalid credentials, missing resources, etc.)

## File Structure Summary

```
/sessions/exciting-affectionate-hawking/mnt/Enterprise_Version/
├── docker-compose.test.yml          # Isolated test infrastructure
├── scripts/
│   └── integration-test.sh          # Main orchestration script
├── usbvault-server/
│   ├── Dockerfile                   # Used by docker-compose.test.yml
│   ├── migrations/                  # Database schema
│   ├── cmd/api/
│   │   ├── app.go                   # Server initialization
│   │   └── router.go                # Route definitions
│   └── internal/
│       ├── integration/
│       │   └── vault_flow_test.go   # Sample integration tests
│       └── testutil/
│           └── fixtures.go          # HTTP fixtures + APIClient
└── usbvault-app/
    ├── playwright.config.ts          # Frontend test config
    ├── e2e/
    │   ├── helpers.ts               # Test helpers
    │   └── *.spec.ts                # E2E test files
    └── [app source]
```

## Questions?

- Check logs: `docker compose -f docker-compose.test.yml logs -f [service]`
- Inspect database: `docker compose -f docker-compose.test.yml exec postgres psql -U usbvault -d usbvault_test`
- Inspect S3: `docker compose -f docker-compose.test.yml exec minio mc ls myminio/usbvault-encrypted-blobs`
