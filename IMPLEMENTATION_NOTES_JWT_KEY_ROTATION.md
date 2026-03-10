# JWT Signing Key Rotation Implementation (PH2-FIX)

## Overview

This implementation adds JWT signing key rotation capabilities to the QAV project, enabling secure cryptographic key management with the following features:

- **Key Versioning**: Each JWT now includes a `kid` (Key ID) header for key identification
- **Key Rotation**: Automated and manual key rotation with graceful transition periods
- **Key Management**: Database-backed storage of signing keys with status tracking
- **Backward Compatibility**: Tokens without `kid` headers fall back to the global key
- **Automatic Cleanup**: Removes old rotated keys after 60 days
- **Emergency Revocation**: Ability to revoke compromised keys

## Components

### 1. Migration File
**File**: `usbvault-server/migrations/011_jwt_key_rotation.sql`

Creates the `jwt_signing_keys` table with the following structure:
- `id`: UUID primary key
- `kid`: Unique key identifier (16-character hex string from public key hash)
- `public_key`: The public key bytes (Ed25519)
- `private_key_encrypted`: Base64-encoded private key (note: production should use KMS)
- `algorithm`: Signing algorithm (currently 'EdDSA')
- `status`: Key state ('active', 'rotated', 'revoked')
- `activated_at`: When the key became active
- `rotated_at`: When the key was rotated
- `revoked_at`: When the key was revoked

Indexes are created on `status` and `kid` for efficient lookups.

### 2. Key Rotation Service
**File**: `usbvault-server/internal/auth/key_rotation.go`

The `KeyRotationService` struct manages JWT key versioning:

#### Key Methods:

- **`NewKeyRotationService(pool)`**: Creates a new service instance

- **`Initialize(ctx)`**: Loads existing keys from DB or generates initial key
  - Loads all active and rotated keys into memory cache
  - Updates global `jwtPrivateKey` and `jwtPublicKey` for backward compatibility
  - Generates initial key if none exists

- **`GetActiveKID()`**: Returns the current signing key's ID
  - Thread-safe read using RWMutex
  - Returns empty string if no active key

- **`GetSigningKey()`**: Returns the active private key for signing
  - Falls back to global `jwtPrivateKey` if service not initialized

- **`GetVerificationKey(kid)`**: Retrieves public key for token validation
  - Looks up key from in-memory cache
  - Returns error if key not found or revoked
  - Supports tokens signed with previous keys

- **`RotateKey(ctx)`**: Performs key rotation
  - Marks current key as 'rotated'
  - Generates new 'active' key
  - New tokens are signed with the new key
  - Old tokens with previous KID can still be verified

- **`RevokeKey(ctx, kid)`**: Emergency revocation
  - Marks key as 'revoked'
  - Prevents verification with this key
  - Used for compromised keys

- **`CleanupExpiredKeys(ctx)`**: Removes old keys
  - Deletes keys rotated more than 60 days ago
  - Preserves grace period for client-side token caching

- **`StartAutoRotation(ctx, interval)`**: Background goroutine
  - Rotates keys on schedule (default: 90 days)
  - Also runs cleanup automatically
  - Runs until context is canceled

#### Key Design Decisions:

1. **In-Memory Caching**: Active and recently rotated keys are cached in memory for fast validation
2. **Mutex-Protected**: Uses RWMutex to allow concurrent reads while protecting writes
3. **Global Key Fallback**: Tokens without `kid` headers use the global key (backward compatibility)
4. **Base64 Encoding**: Private keys stored as base64-encoded bytes
   - Production deployments should use envelope encryption with KMS
   - This is marked as `PH2-FIX` for later enhancement

### 3. JWT Module Updates
**File**: `usbvault-server/internal/auth/jwt.go`

#### New Package Variables:
```go
var keyRotationSvc *KeyRotationService
```

#### New Function:
```go
func SetKeyRotationService(svc *KeyRotationService)
```
Configures the JWT package to use the key rotation service.

#### Token Generation Changes:
In `GenerateTokenPairWithFamily()`:
- Access token now includes `kid` header when service is initialized
- Refresh token now includes `kid` header when service is initialized
- Maintains backward compatibility (still signs with global key)

#### Token Validation Changes:
In `ValidateToken()`:
- Checks for `kid` header in token
- If present and service initialized: uses `GetVerificationKey(kid)` to retrieve the correct public key
- Falls back to global key if no `kid` header (backward compatible)
- Returns error if `kid` refers to a revoked key

### 4. Main Server Initialization
**File**: `usbvault-server/cmd/api/main.go`

#### Initialization Code (after Redis connection):
```go
// PH2-FIX: Initialize JWT key rotation service
keyRotationService := auth.NewKeyRotationService(dbPool)
if err := keyRotationService.Initialize(ctx); err != nil {
    log.Fatal().Err(err).Msg("Failed to initialize JWT key rotation")
}
auth.SetKeyRotationService(keyRotationService)

// PH2-FIX: Start auto-rotation every 90 days
keyRotationService.StartAutoRotation(ctx, 90*24*time.Hour)
```

#### Admin Endpoint:
```
POST /api/v1/admin/rotate-jwt-keys
```

- Requires authentication
- Manual key rotation endpoint
- Returns new active KID on success
- Response: `{"status":"rotated","new_kid":"..."}`

### 5. Tests
**File**: `usbvault-server/internal/auth/key_rotation_test.go`

Includes unit tests for:
- Service initialization
- Active KID retrieval
- Verification key lookup
- Revoked key rejection
- Unknown KID rejection
- Fallback to global key
- Key status updates
- Cleanup operations
- Auto-rotation startup

Most tests are marked with `t.Skip()` for database-dependent operations. Run full integration tests with test database.

## Backward Compatibility

The implementation maintains full backward compatibility:

1. **Tokens without `kid` header**: Validated using global `jwtPublicKey`
2. **Service not initialized**: Falls back to global keys
3. **Existing token validation**: Continues to work
4. **No schema changes to existing tables**: New table is isolated

## Security Considerations

### Current Implementation:
- Private keys stored as base64-encoded text in database
- Uses Ed25519 for all signatures (EdDSA)
- Keys are kept in memory after loading for performance
- 60-day retention period for rotated keys

### Production Enhancements Needed:

1. **Envelope Encryption**: Use KMS for private key storage
   - Encrypt `private_key_encrypted` column with master key
   - Add KMS integration for key wrapping/unwrapping

2. **Key Material Protection**:
   - Implement secure key deletion from memory
   - Use memory locking to prevent swapping (mlockall)
   - Implement key derivation if needed

3. **Access Control**:
   - Restrict admin endpoint to super-admins only
   - Audit all key rotation events
   - Log all key access

4. **Monitoring**:
   - Alert on emergency revocations
   - Monitor key rotation schedule
   - Alert on failed key operations

## Usage

### Automatic Key Rotation:
Keys are automatically rotated every 90 days via the background goroutine started at initialization.

### Manual Key Rotation:
```bash
curl -X POST https://api.example.com/api/v1/admin/rotate-jwt-keys \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### In Code:
```go
// Rotate keys
err := keyRotationService.RotateKey(ctx)

// Revoke a specific key (emergency)
err := keyRotationService.RevokeKey(ctx, "kid-to-revoke")

// Cleanup old keys
err := keyRotationService.CleanupExpiredKeys(ctx)
```

## Monitoring and Debugging

The service logs the following events:

```
"PH2-FIX: JWT key rotation service initialized" (initialized)
"PH2-FIX: Generated new JWT signing key" (key generation)
"PH2-FIX: Rotated old JWT signing key" (key rotation)
"PH2-FIX: JWT signing key revoked" (key revocation)
"PH2-FIX: Cleaned up expired JWT signing keys" (cleanup)
"PH2-FIX: Auto key rotation completed" (auto-rotation)
"PH2-FIX: JWT key auto-rotation stopped" (shutdown)
```

## Future Enhancements

1. **KMS Integration**: Move from base64 encoding to KMS-backed envelope encryption
2. **Key Rotation Policies**: Configurable rotation intervals per environment
3. **Multi-Key Support**: Support multiple algorithms (EdDSA, RS256, etc.)
4. **Key Analytics**: Track which keys are used and when
5. **Zero-Downtime Rotation**: More sophisticated transition strategies
6. **Distributed Caching**: Share key cache across server instances (Redis)

## Testing Checklist

- [ ] Migration runs successfully
- [ ] Service initializes without errors
- [ ] New tokens include `kid` header
- [ ] Old tokens without `kid` still validate
- [ ] Key rotation creates new active key
- [ ] Old tokens verify with rotated key
- [ ] Revoked keys are rejected
- [ ] Auto-rotation goroutine runs
- [ ] Cleanup removes old keys
- [ ] Admin endpoint requires auth
- [ ] Existing JWT tests still pass
