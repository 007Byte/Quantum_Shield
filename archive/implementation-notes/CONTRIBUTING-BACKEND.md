# QAV Backend Contributing Guide

This guide covers contributing to the QAV backend, including the Go REST API server and Rust cryptographic core.

## Development Setup

### Prerequisites

- **Go 1.22+** (download from https://golang.org/dl/)
- **Rust 1.75+ (stable)** (install via https://rustup.rs/)
- **Docker & Docker Compose** (for PostgreSQL, Redis, S3)
- **Git** (version control)

### Go Backend Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/qav-project/qav.git
   cd qav
   ```

2. Install Go dependencies:
   ```bash
   go mod download
   go mod tidy
   ```

3. Install tools:
   ```bash
   go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
   go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
   go install github.com/cosmtrek/air@latest  # Hot reload for development
   ```

4. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   export $(cat .env | xargs)
   ```

5. Start infrastructure (PostgreSQL, Redis):
   ```bash
   docker-compose -f docker-compose.dev.yml up -d
   ```

6. Run database migrations:
   ```bash
   go run ./cmd/migrate up
   ```

7. Start the development server:
   ```bash
   air  # Hot reload on file changes
   # Or: go run ./cmd/api
   ```

### Rust Crypto Core Setup

1. Navigate to the crypto crate:
   ```bash
   cd crates/qav-crypto
   ```

2. Build the library:
   ```bash
   cargo build
   ```

3. Run tests:
   ```bash
   cargo test --all-features
   ```

4. Generate C bindings:
   ```bash
   cbindgen --config cbindgen.toml -o qav_crypto.h
   ```

5. Return to Go root:
   ```bash
   cd ../..
   ```

## Code Style

### Go Code Style

- **Formatting**: Use `gofmt` (automatically applied in CI)
  ```bash
  gofmt -s -w ./...
  ```

- **Linting**: Run `golangci-lint` before committing
  ```bash
  golangci-lint run ./...
  ```

- **Configuration**: See `.golangci.yml` for linter rules

- **Naming Conventions**:
  - Packages: lowercase, single word (`api`, `crypto`, `storage`)
  - Functions: CamelCase (`func GetVault()`)
  - Unexported: lowercase (`func (s *service) getVault()`)
  - Interfaces: Suffix with `er` (`Reader`, `Writer`, `Encrypter`)

- **Comments**:
  - Exported functions require godoc comments
  - Comments start with function name: `// GetVault retrieves...`
  - Unexported helpers don't require comments if obvious

Example:
```go
// GetVault retrieves a vault by ID, checking permissions.
// Returns ErrNotFound if vault doesn't exist or user lacks read permission.
func (s *service) GetVault(ctx context.Context, vaultID string) (*Vault, error) {
    // implementation
}
```

### Rust Code Style

- **Formatting**: Use `rustfmt`
  ```bash
  cargo fmt --all
  ```

- **Linting**: Use `clippy`
  ```bash
  cargo clippy --all-targets --all-features -- -D warnings
  ```

- **Naming Conventions**:
  - Modules: lowercase with underscores (`xchacha20_poly1305`)
  - Types: PascalCase (`struct CryptoState`)
  - Functions: snake_case (`pub fn encrypt_data()`)
  - Constants: SCREAMING_SNAKE_CASE (`const NONCE_SIZE: usize = 24`)

- **Safety**:
  - Unsafe blocks minimized and marked with `// SAFETY: ...` comments
  - No unsafe code in application logic (crypto library only)

Example:
```rust
/// Encrypts plaintext using XChaCha20-Poly1305.
///
/// # Arguments
/// * `plaintext` - Data to encrypt
/// * `key` - 32-byte encryption key
///
/// # Returns
/// Ciphertext with nonce prepended.
pub fn encrypt(plaintext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, Error> {
    // implementation
}
```

## Testing

### Go Backend Testing

**Unit Tests**: Required for all business logic

```bash
go test ./...                          # Run all tests
go test -v ./...                       # Verbose output
go test -race ./...                    # Race condition detection
go test -cover ./...                   # Code coverage
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out       # View HTML report
```

**Test Coverage Requirements**:
- Minimum 80% coverage for `internal/` packages
- Critical path (auth, crypto, vault operations) must be 100%

**Integration Tests**: Required for API endpoints

```bash
# Requires running PostgreSQL and Redis
go test -tags=integration ./tests/integration
```

**Naming Convention**:
- Test files end with `_test.go`
- Test functions start with `Test` (e.g., `TestGetVault()`)
- Table-driven tests preferred for multiple scenarios

Example:
```go
func TestGetVault(t *testing.T) {
    tests := []struct {
        name    string
        vaultID string
        wantErr bool
    }{
        {"valid vault", "vault-1", false},
        {"not found", "nonexistent", true},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            // test implementation
        })
    }
}
```

### Rust Crypto Testing

**Unit Tests**: Required for all algorithms

```bash
cargo test --lib                       # Unit tests only
cargo test --lib -- --nocapture       # Show println! output
cargo test --lib -- --test-threads=1  # Single-threaded (deterministic)
```

**Property-Based Tests**: Required for cryptographic functions

```bash
cargo test --test property_tests      # Use proptest crate
```

**Fuzz Testing**: Encouraged for parser/decoder functions

```bash
cargo +nightly fuzz run fuzz_decrypt
```

**Test Coverage**:
- Minimum 85% for critical crypto functions
- All error paths covered

## Error Handling

### Go Backend

Use the custom `apierrors` package for consistent error handling:

```go
// apierrors.go
type Error struct {
    Code    string        // "INVALID_INPUT", "UNAUTHORIZED", etc.
    Message string        // User-friendly message
    Status  int           // HTTP status code
    Err     error         // Underlying error
}

// Usage:
if err != nil {
    return apierrors.New("INVALID_INPUT", "vault ID is required", 400, err)
}
```

**Error Codes**:
- `INVALID_INPUT` (400) — Validation failure
- `UNAUTHORIZED` (401) — Missing authentication
- `FORBIDDEN` (403) — Insufficient permissions
- `NOT_FOUND` (404) — Resource not found
- `CONFLICT` (409) — Data conflict (e.g., duplicate)
- `RATE_LIMITED` (429) — Rate limit exceeded
- `INTERNAL_ERROR` (500) — Server error
- `SERVICE_UNAVAILABLE` (503) — Dependency down

**Error Propagation**:
- Always wrap errors with context: `fmt.Errorf("failed to get vault: %w", err)`
- Never ignore errors (use `_ = ...` only in cleanup code)

### Rust Crypto

Return `Result<T, CryptoError>` for fallible operations:

```rust
#[derive(Debug)]
pub enum CryptoError {
    InvalidKeySize,
    DecryptionFailed,
    InvalidNonce,
}

pub fn decrypt(ciphertext: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, CryptoError> {
    // implementation
}
```

## Logging

### Go Backend

Use `zerolog` for structured logging:

```go
import "github.com/rs/zerolog/log"

// Structured logging with fields
log.Info().
    Str("user_id", userID).
    Str("vault_id", vaultID).
    Int64("duration_ms", elapsed).
    Msg("vault accessed successfully")

// Error logging
log.Error().
    Err(err).
    Str("operation", "decrypt").
    Msg("encryption operation failed")
```

**Log Levels**:
- `Debug`: Development-time diagnostics
- `Info`: Important application events
- `Warn`: Recoverable issues (malformed input, retries)
- `Error`: Non-recoverable errors requiring manual intervention
- `Fatal`: System shutdown (use sparingly)

**Sensitive Data**: Never log passwords, keys, or plaintext vault contents.

### Rust Crypto

Use `tracing` crate for integration with logging system:

```rust
use tracing::{debug, info, error};

info!(duration_us = elapsed, "encryption completed");
debug!(key_size = 32, "key validated");
error!(err = ?e, "decryption failed");
```

## Database Migrations

Migrations ensure schema changes are backward-compatible and reversible.

### Migration Format

Place SQL files in `migrations/` directory:

```
migrations/
├── 001_init_schema.sql
├── 002_add_audit_table.sql
└── 003_add_vault_metadata.sql
```

**Naming**: `YYYYMMDD_HH_description.sql` (e.g., `20240115_14_add_audit_table.sql`)

**Rules**:
- Each migration is idempotent: `CREATE TABLE IF NOT EXISTS`, `DROP IF EXISTS`
- Migrations are immutable: never modify a deployed migration
- Rollback migrations: create `001_init_schema.down.sql` (optional but recommended)
- Maximum migration size: 1000 lines (split large changes)

Example migration:
```sql
-- migrations/20240115_14_add_audit_table.sql

-- Create audit log table for compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    action VARCHAR(50),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    INDEX idx_audit_user_created (user_id, created_at)
);

-- Backfill audit logs for existing operations
INSERT INTO audit_logs (user_id, event_type, action, created_at)
SELECT user_id, 'vault_access', 'read', accessed_at
FROM vault_access_log
WHERE accessed_at > NOW() - INTERVAL '7 days';
```

**Testing Migrations**:

```bash
# Test up migration
docker-compose exec postgres psql -U qav -d qav_db -f migrations/001_init_schema.sql

# Verify schema
docker-compose exec postgres psql -U qav -d qav_db -c "\d"

# Test rollback (if rollback migration exists)
docker-compose exec postgres psql -U qav -d qav_db -f migrations/001_init_schema.down.sql
```

## Security Requirements

### Go Backend

1. **Input Validation** (PH-FIX tag for security-critical):
   ```go
   // PH-FIX: Validate vault_id is UUID format to prevent SQL injection
   if !isValidUUID(vaultID) {
       return apierrors.New("INVALID_INPUT", "invalid vault ID", 400, nil)
   }
   ```

2. **Authentication**:
   - All endpoints require X-Session-Token header
   - Tokens validated against Redis session store
   - Middleware handles invalid/expired tokens (401)

3. **Authorization**:
   - Check user ownership before returning/modifying resources
   - Never trust user_id from request body (extract from session)

4. **Cryptography**:
   - Never implement crypto from scratch (use `qav-crypto` Rust library)
   - All encryption operations go through FFI bridge
   - Verify encrypted data integrity via AEAD tags

5. **Secrets Management**:
   - Load secrets from environment variables only
   - Never commit `.env` or credential files
   - Rotate API keys/secrets quarterly

### Rust Crypto

1. **Memory Safety**:
   - Use `zeroize` crate to wipe sensitive data on drop
   ```rust
   let mut key = [0u8; 32];
   // ... use key ...
   key.zeroize();  // Automatic on drop if using Zeroize
   ```

2. **Constant-Time Operations**:
   - Use `subtle` crate for timing-safe comparisons
   - Avoid early returns on secret values

3. **Random Number Generation**:
   - **Always** use `OsRng` (OS-provided randomness)
   - Never seed RNG manually

4. **FFI Safety**:
   - Mark all C functions with `#[no_mangle]`
   - Use `extern "C"` for ABI compatibility
   - Wrap unsafe FFI calls in `catch_unwind()` for panic safety

## PR Checklist

Before submitting a pull request, ensure:

- [ ] Code follows style guide (`gofmt`, `rustfmt`, `golangci-lint`, `clippy`)
- [ ] All tests pass locally (`go test ./...`, `cargo test`)
- [ ] Race condition tests pass (`go test -race ./...`)
- [ ] Code coverage meets threshold (80% for Go)
- [ ] New public functions have godoc comments (Go) or doc comments (Rust)
- [ ] Error handling is consistent (use `apierrors` in Go)
- [ ] Logging uses structured fields (no printf debugging)
- [ ] Database migrations are backward-compatible
- [ ] No credentials or secrets in code or `.env` files
- [ ] No `// TODO` or `// HACK` comments without issue numbers
- [ ] Commit messages are clear and atomic
- [ ] Related issue is referenced in PR description

## Branch Naming

Use consistent naming for clarity:

```
feature/vault-encryption-v2          # New feature
fix/race-condition-in-session         # Bug fix
refactor/crypto-interface             # Code cleanup
docs/backend-setup-guide              # Documentation
test/increase-coverage-for-api        # Test improvements
chore/upgrade-go-dependencies          # Maintenance
```

## Commit Messages

Follow the conventional commit format for clarity:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Format**:
- Type: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- Scope: Package/module affected (`api`, `crypto`, `storage`, `auth`)
- Subject: 50 characters max, lowercase, imperative mood
- Body: Explain **why**, not what (reference the code)
- Footer: Reference issues (`Closes #123`, `Fixes #456`)

**Examples**:
```
feat(api): add vault encryption endpoint

Implement POST /api/v1/vaults/{id}/encrypt to support client-side
key derivation. Endpoint accepts plaintext vault data and returns
XChaCha20-Poly1305 encrypted blob with nonce.

Closes #89
```

```
fix(auth): prevent session fixation via CSRF token rotation

Rotate session token on successful login to prevent attacker-controlled
tokens from being used. Invalidate old session token immediately.

Closes #234
```

## Code Review Expectations

- Reviewers should provide constructive feedback within 24 hours
- Discussions should remain technical and respectful
- Approval requires:
  - All CI checks pass (tests, linting, coverage)
  - At least 1 approval from code owners
  - All requested changes addressed
  - No outstanding conversations

- Commit history should be clean (squash fixup commits)
- PR should have a descriptive title and body

## Security Disclosure

For security vulnerabilities:

1. **Do not** open a public GitHub issue
2. Email security@qav-project.io with:
   - Vulnerability description
   - Affected component and version
   - Steps to reproduce
   - Impact assessment

3. Allow 90 days for patch and disclosure timeline
4. We will credit you in the security advisory (unless you request anonymity)

## Getting Help

- **Questions**: Slack #backend or discuss in GitHub Discussions
- **Bug Reports**: Open an issue with reproduction steps
- **Security Issues**: security@qav-project.io (private disclosure)
- **Code Review**: Request review from `@qav-backend` team

Thank you for contributing to QAV!
