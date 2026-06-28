# Quantum_Shield Server - Security Architecture (Phase 6)

**Document Status**: Phase 6 - Server-Side Security Architecture
**Last Updated**: March 2026
**Classification**: Technical Security Design
**Target Audience**: Security Auditors, Backend Architects, Infrastructure Teams

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Threat Model](#threat-model)
3. [Authentication Architecture](#authentication-architecture)
4. [Authorization Framework](#authorization-framework)
5. [Data Protection](#data-protection)
6. [Rate Limiting and Abuse Prevention](#rate-limiting-and-abuse-prevention)
7. [Security Headers](#security-headers)
8. [Key Rotation Strategy](#key-rotation-strategy)
9. [Audit and Logging](#audit-and-logging)
10. [Incident Response](#incident-response)

---

## Executive Summary

Quantum_Shield Server implements a zero-knowledge architecture where encrypted user data is stored and served without decryption. The server enforces cryptographic authentication, granular authorization, and robust abuse prevention mechanisms.

**Core Principles**:
- **Server Never Decrypts**: All user data remains encrypted in storage
- **Cryptographic Authentication**: SRP-6a prevents password transmission
- **Granular Access Control**: RBAC with ownership verification
- **Audit Trail**: Hash-chain logging of sensitive operations
- **Rate Limiting**: Redis-backed sliding window protection
- **Memory Safety**: No sensitive data held in memory longer than necessary

---

## Threat Model

### Server Capabilities and Limitations

**What the Server CAN Observe**:

```
Public Information (Non-Confidential):
├── Encrypted vault blobs (ciphertext, non-decryptable)
├── Vault metadata:
│   ├── Vault ID (UUID)
│   ├── Owner account ID
│   ├── Creation timestamp
│   ├── Last modified timestamp
│   └── Total encrypted size (approximate)
├── File metadata sizes:
│   ├── Encrypted index size (bytes)
│   ├── Individual encrypted file sizes
│   └── Compression characteristics
├── Access patterns:
│   ├── Which user accessed what vault
│   ├── Access timestamps
│   ├── Requester IP addresses
│   └── Device identifiers
├── Sharing relationships:
│   ├── Graph of who can access whose vaults
│   ├── Sharing timestamps
│   └── Permission levels (viewer/editor/owner)
└── Aggregate statistics:
    ├── Total users on platform
    ├── Total vaults created
    ├── Storage consumption trends
    └── API usage patterns

Metadata Observable But Not Harmful:
├── Access timestamps reveal work patterns (not plaintext)
├── File sizes may hint at document types (mitigated by padding)
├── Sharing graphs show relationships but not sharing contents
└── IP addresses enable geographic analysis (not encryption keys)
```

**What the Server CANNOT Access**:

```
Protected Information (Confidential):
├── Plaintext file contents
│   └── Encrypted before transmission, server never sees plaintext
├── Plaintext filenames
│   └── Stored in encrypted index, metadata layer
├── Plaintext vault data
│   └── All data encrypted with client-derived keys
├── Password material
│   └── Only SRP verifier stored (one-way hash)
├── Master Encryption Keys (MEK)
│   └── Wrapped with KEK (only client can unwrap)
├── File encryption keys
│   └── Derived by client from MEK
├── Sharing keys
│   └── Ephemeral ECDH (not stored on server)
├── User document history
│   └── Encrypted modification logs
├── Search index
│   └── No server-side search possible (end-to-end encryption)
└── Recovery codes
    └── Salted SHA-256 hashes (one-way)

Cryptographic Guarantees:
├── Cannot decrypt even with administrative access
├── Cannot decrypt with database access
├── Cannot decrypt with memory dumps
├── Cannot decrypt with source code review
└── Cannot decrypt with hardware seizure
```

### Attack Vectors and Mitigations

```
Attack Vector                    Mitigation Strategy
─────────────────────────────────────────────────────────────

Password guessing               SRP-6a + rate limiting + long delays
│                              └─ Argon2id delays password verification

Credential interception         TLS 1.3 mandatory + no plaintext password
│                              └─ SRP authentication protocol

Vault tampering                 HMAC protection on vault header
│                              └─ Cryptographic verification of integrity

Index manipulation              Encrypted index + rollback protection
│                              └─ State version counter prevents reversal

Access control bypass           RBAC + ownership verification
│                              └─ Database constraints enforce permissions

Sharing interception            End-to-end encryption (client-side)
│                              └─ Server only holds encrypted sharing messages

Server compromise               Zero-knowledge (no keys, no plaintext)
│                              └─ Data useless without client-derived keys

Insider threat                  Audit logging + access control
│                              └─ All operations logged with hash chain

Metadata inference              Careful API design + optional obfuscation
│                              └─ Padding, dummy operations possible

Rate limit bypass               Redis sliding window + distributed checks
│                              └─ IP-based, account-based, device-based

Replay attacks                  Nonce tracking + timestamp validation
│                              └─ Request deduplication on API

Session hijacking               Secure cookies + IP pinning option
│                              └─ JWT refresh tokens with Ed25519 signing

Account enumeration             Anti-enumeration measures on auth
│                              └─ Consistent response times
```

---

## Authentication Architecture

### SRP-6a (Secure Remote Password) Protocol

**Overview**: Zero-knowledge password proof without transmitting password

**Protocol Flow**:

```
Step 1: Registration (One-time)
├── Client:
│   ├── Generate: salt ← random(16 bytes)
│   ├── Derive: verifier = SRP6a_compute_verifier(password, salt)
│   └── Send to server: (username, salt, verifier)
├── Server:
│   ├── Store: (username, salt, verifier) in database
│   ├── Never stores: plaintext password
│   └── Cannot derive: password from verifier (one-way)

Step 2: Authentication (Per-login)
Client Side:
  ├── Input: username, password
  ├── Retrieve from server: N, g, salt (sent unencrypted)
  ├── Compute:
  │   ├── x = SHA256(salt || password)
  │   ├── A = g^a mod N (ephemeral client key)
  │   └── Store a secretly (used in computation)
  ├── Send to server: (username, A) [A only, not password]
  │
Server Side:
  ├── Lookup: (salt, verifier) for username
  ├── Generate: B = k*v + g^b mod N (k = 3 for SRP-6a)
  ├── Send to client: (salt, B) [salt, B public]
  │
Client Side (continued):
  ├── Compute:
  │   ├── u = SHA256(A || B)
  │   ├── S = (B - k*g^x)^(a + u*x) mod N
  │   └── K = SHA256(S)
  ├── Compute: M1 = HMAC-SHA256(K, N || g || username || salt || A || B)
  ├── Send to server: M1 [proof, not password]
  │
Server Side (continued):
  ├── Compute:
  │   ├── u = SHA256(A || B)
  │   ├── S = (A*v^u)^b mod N
  │   └── K = SHA256(S)
  ├── Compute: M1_expected = HMAC-SHA256(K, N || g || username || salt || A || B)
  ├── Verify: M1 == M1_expected
  │   ├── If match: Authentication succeeds
  │   └── If no match: Authentication fails
  │
Client Side (final):
  ├── Receive: M2 = HMAC-SHA256(K, A || M1 || B)
  ├── Verify: M2_expected = HMAC-SHA256(K, A || M1 || B)
  ├── If match: Server authenticated to client
  └── Proceed: Session established
```

**Security Properties**:

```
Why SRP-6a is Secure:
├── Password never transmitted (even hashed)
├── M1 proof depends on password (not transferable)
├── Each login produces different M1 (nonce u is unique)
├── Replay of old M1 fails (u changes)
├── Attacker seeing M1 cannot verify passwords offline
│   └── Would need S computation (requires solving discrete log)
├── Dictionary attack resistance:
│   ├── Even with M1, cannot verify guesses without S
│   ├── Verification requires inverse computation (hard)
│   └── Guessing cost ≈ cost of honest authentication
└── Parameter size (3072-bit N):
    └── Equivalent to ~256-bit symmetric security

Implementation Parameters:
├── Prime N: 3072 bits (RFC 5054, group 23)
│   └── Ensures ~256-bit security level
├── Generator g: 2 (standard for group 23)
├── Multiplier k: 3 (SRP-6a variant)
├── Hash algorithm: SHA-256
├── Password KDF:
│   └── x = SHA256(salt || password)
│   └── NOT Argon2id (SRP-6a convention)
└── Session proof:
    └── M1 = HMAC-SHA256(K, N || g || username || salt || A || B)
```

### Argon2id for Password Verification (Server-Side)

**Purpose**: Additional protection layer for verifier computation

**Configuration**:

```
Argon2id Parameters (Server-Side Password Verifier):
├── Memory cost: 65536 KiB (64 MiB)
├── Time cost: 3 iterations
├── Parallelism: 4 lanes
├── Salt: From vault header (same as client)
└── Output: 32 bytes used in SRP computation

Computation:
├── Server-side (authentication phase):
│   ├── On each login attempt:
│   ├── Argon2id(password || username, salt, params)
│   │   └── ~1 second delay per attempt
│   ├── Prevents rapid password guessing
│   ├── Rate limiting enforced simultaneously
│   └── Cost: ~1 second + network latency
└── Timing attack resistance:
    ├── Constant delay regardless of password validity
    ├── Same Argon2id execution for all attempts
    └── Timing does not leak password correctness
```

### JWT-Based Session Management

**Token Structure**:

```
Access Token (15-minute lifetime):
├── Header:
│   ├── alg: EdDSA (Ed25519 signature)
│   ├── typ: JWT
│   └── kid: Key ID for rotation
├── Payload:
│   ├── sub: User ID (UUID)
│   ├── iat: Issued at (Unix timestamp)
│   ├── exp: Expiration (15 min from iat)
│   ├── device_id: Device fingerprint SHA-256
│   ├── family_token_id: For theft detection
│   └── scopes: ["read_vault", "write_vault", etc.]
├── Signature:
│   ├── Algorithm: Ed25519 (deterministic)
│   ├── Key: Server private key (rotated quarterly)
│   ├── Verified: On every API request
│   └── Forged tokens: Mathematically unverifiable
└── Lifetime: 15 minutes (balance security/usability)

Refresh Token (30-day lifetime):
├── Stored: In secure HTTP-only cookie
├── Contains:
│   ├── sub: User ID
│   ├── iat: Issued at
│   ├── exp: Expiration (30 days)
│   ├── jti: Unique token ID (for revocation)
│   ├── device_id: Device fingerprint
│   └── family_id: Token family (theft detection)
├── Signature: Ed25519 (same as access token)
└── Usage: Only to obtain new access token (not API calls)

Token Validation (Per Request):
├── Check signature validity
│   └── Ed25519 verification
├── Check expiration
│   └── exp > current_time
├── Check device fingerprint match
│   └── device_id == current_device_hash
├── Check token not revoked
│   └── jti not in revocation list
└── Check family token not stolen
    └── family_token_id matches expected family
```

### Family-Based Token Theft Detection

**Mechanism**: Detects when refresh token is used from different device

```
Token Family Concept:
├── On initial login:
│   ├── Generate: family_id = random(16 bytes)
│   ├── Create: refresh_token_1 with family_id
│   └── Store: family_id → [refresh_token_1] in cache
├── On token refresh:
│   ├── Verify: family_id matches expected
│   ├── Generate: new_access_token
│   ├── Create: new_refresh_token with same family_id
│   └── Update: family_id → [refresh_token_1, refresh_token_2, ...]
├── On suspicious refresh:
│   ├── Detect: Different device_id for same family_id
│   ├── Action: Invalidate entire family
│   ├── Revoke: All tokens in family
│   └── Alert: User of potential compromise

Attack Scenario Prevention:
├── Attacker steals refresh_token_1
├── Attacker uses token from different IP/device
├── Server detects: Different device_id
├── Server revokes: family_id entirely
├── Legitimate user's token: Next refresh fails
├── User must re-authenticate (re-login)
└── Attacker access: Terminated
```

### Device Enrollment and Fingerprinting

**Purpose**: Verify requests originate from expected device

**Fingerprint Components**:

```
Device Fingerprint (SHA-256):
├── Components:
│   ├── User-Agent string (browser, version)
│   ├── Accepted Languages header
│   ├── Timezone offset
│   ├── Hardware concurrency
│   ├── Device memory (approximate)
│   ├── Screen resolution
│   └── Canvas fingerprint (optional)
├── Computation:
│   └── fingerprint = SHA-256(concat(all_components))
├── Change detection:
│   ├── Minor changes: Accepted (browser update)
│   ├── Major changes: Requires re-authentication
│   └── Threshold: Configurable per user
└── Purpose:
    ├── Detect account access from new devices
    ├── Prevent stolen token usage on attacker's device
    └── Enable device-based access policies

Enrollment Flow:
├── User logs in
├── Client computes device fingerprint
├── Server stores: (user_id, device_fingerprint, enrollment_time)
├── Subsequent logins:
│   ├── Compute: current_fingerprint
│   ├── Compare: current vs. stored
│   ├── Match: Accept as same device
│   └── Mismatch: Require additional MFA/confirmation
```

---

## Authorization Framework

### Role-Based Access Control (RBAC)

**Vault-Level Permissions**:

```
Permission Model:
├── Owner (full control)
│   ├── read_vault
│   ├── write_vault
│   ├── delete_vault
│   ├── share_vault
│   ├── manage_permissions
│   ├── rotate_keys
│   └── delete_file
├── Editor (add/modify files)
│   ├── read_vault
│   ├── write_vault (append only, cannot delete)
│   ├── share_vault (restricted)
│   └── Cannot: delete_vault, manage_permissions
├── Viewer (read-only)
│   ├── read_vault
│   └── Cannot: write_vault, delete, share
└── No Access (default)
    └── Cannot: any operation

Database Enforcement:
├── Permission table: (user_id, vault_id, role)
├── Query: SELECT role FROM permissions WHERE user_id=? AND vault_id=?
├── Verification: On every API call
├── Constraint: UNIQUE(user_id, vault_id)
└── Index: (vault_id, user_id) for fast lookup
```

### Ownership Verification

**Purpose**: Prevent escalation of privilege

**Implementation**:

```
Ownership Check (Before Destructive Operations):
├── Query database:
│   ├── SELECT owner_id FROM vaults WHERE vault_id=?
│   ├── Compare: owner_id == request.user_id
│   └── Owner check: Must match
├── Permission check:
│   ├── SELECT role FROM permissions WHERE user_id=?, vault_id=?
│   ├── Verify: role in [owner, editor] (for write)
│   └── Verify: role == owner (for delete/share management)
├── Atomic operation:
│   ├── BEGIN TRANSACTION
│   ├── Verify ownership
│   ├── Perform action
│   └── COMMIT
└── Error handling:
    ├── Ownership mismatch: Return 403 Forbidden
    ├── No permission: Return 403 Forbidden
    └── Vault not found: Return 404 Not Found

Example Operations:
├── Delete vault: Requires ownership verification
├── Share vault: Requires ownership (or editor with restrictions)
├── Create access token: Requires ownership of token creation
└── Update metadata: Requires ownership of metadata
```

### Access Token Scopes

**Purpose**: Limit API operations per token

```
Available Scopes:
├── vault:read - Read vault contents (non-destructive)
├── vault:write - Write vault (add/modify files)
├── vault:delete - Delete vault or files
├── vault:share - Share vault with others
├── vault:admin - Administrative operations (key rotation, etc.)
├── account:read - Read account settings
├── account:write - Modify account settings
├── device:read - List enrolled devices
├── device:write - Manage device settings
└── audit:read - Access audit logs

Scope Enforcement:
├── Access token contains: scopes[] (list)
├── On API call:
│   ├── Check: Required scope in token.scopes
│   ├── Match: Reject if scope missing
│   └── Return: 403 Forbidden if insufficient scope
├── Refresh token:
│   ├── Contains: Maximum scopes available to user
│   ├── Constraint: New access token cannot exceed refresh scopes
│   └── Result: Scope can only decrease, never increase

Principle of Least Privilege:
├── Recommend minimal scope set
├── Mobile app: vault:read, vault:write only
├── Web app: All vaults scopes
├── CLI tool: Specific scopes per command
└── Third-party integrations: Restricted scopes only
```

---

## Data Protection

### Encrypted Metadata Storage

**Architecture**:

```
Vault Metadata (PostgreSQL BYTEA):
├── Plaintext input: JSON metadata object
│   ├── User name
│   ├── Display name
│   ├── Settings
│   └── Custom properties
├── Encryption:
│   ├── Algorithm: XChaCha20-Poly1305
│   ├── Key: Derived from vault MEK (via HKDF)
│   ├── Nonce: Random per write
│   └── Output: Ciphertext || Tag (16 bytes appended)
├── Storage: BYTEA column in vaults table
├── Retrieval:
│   ├── Read: encrypted_metadata BYTEA
│   ├── Decrypt: XChaCha20-Poly1305 with vault key
│   ├── Verify: AEAD tag ensures integrity
│   └── Output: Plaintext JSON (client-side only)
└── Server behavior:
    ├── Cannot decrypt (no vault key on server)
    ├── Cannot inspect (opaque blob)
    ├── Cannot modify (would break AEAD tag)
    └── Can only store/retrieve as blob

Use Case:
├── Vault display name (for UI)
├── User preferences (in vault scope)
├── Custom metadata tags
└── Application-specific data
```

### Rollback Protection (max_state_version)

**Purpose**: Prevent reverting vault to compromised state

**Mechanism**:

```
State Version Tracking:
├── Field: max_state_version (64-bit integer)
├── Location: vaults table
├── Update: Incremented on every vault modification
├── Query: On vault open, server sends max_state_version
├── Client-side:
│   ├── Compare: received max_state_version > local version
│   ├── If true: Vault accepted normally
│   ├── If false: Potential rollback detected
│   └── Action: Vault opened in read-only or warning state
├── Modification tracking:
│   ├── Update: SET max_state_version = max_state_version + 1
│   ├── Atomic: Same transaction as vault change
│   └── Commit: After all changes written to disk
└── Verification:
    ├── Client tracks max_state_version (in-memory or local storage)
    ├── On recovery: Can compare against expected version
    ├── Version gap: Indicates possible tampering/backup restore
    └── Action: Warn user, allow read-only access

Example Timeline:
├── Day 1: vault.max_state_version = 5
├── Day 5: vault.max_state_version = 23
├── Day 10 (backup restore): Restore backup from Day 5
│   ├── Restored: max_state_version = 5
│   ├── Client opens: Sees state_version = 5
│   ├── Compares: 5 < 23 (expected)
│   ├── Detects: Rollback to Day 5
│   └── Action: Opens read-only, warns user
```

### Hash-Chain Audit Log

**Purpose**: Tamper-proof record of sensitive operations

**Structure**:

```
Audit Log Entry:
├── Sequence: Entry number (strictly increasing)
├── Timestamp: Unix timestamp (UTC)
├── User ID: Who performed operation
├── Device ID: Which device
├── Operation: Type of operation (create, modify, share, etc.)
├── Resource ID: Vault/file affected
├── Result: Success or failure
├── IP Address: Request origin (masked for privacy)
└── Cryptographic Hash:
    ├── Computation: SHA-256(
    │   ├── previous_hash ||  (chaining)
    │   ├── sequence ||
    │   ├── timestamp ||
    │   ├── user_id ||
    │   ├── operation ||
    │   ├── resource_id
    │   └── )
    ├── Previous hash: Links to previous entry
    └── Result: Creates immutable chain

Tamper Detection:
├── Any change to entry → Different hash
├── Hash appears in next entry → Chain broken
├── Missing entry → Sequence gap
├── Out-of-order entries → Timestamps inconsistent
└── Detection: Audit verification routine

Implementation:
├── Storage: PostgreSQL audit_log table
├── Index: (vault_id, timestamp) for fast queries
├── Retention: Configurable (default: 2 years)
├── Encryption: Audit log contents encrypted (optional)
├── Verification: Periodic hash chain validation
│   └── Runs weekly (cronjob)
│   └── Alerts on any inconsistency
└── Access control:
    ├── Only owner can read their audit log
    ├── Admin can read with approval logging
    ├── Immutable: Entries never modified/deleted
    └── Append-only: New entries only
```

---

## Rate Limiting and Abuse Prevention

### Redis-Backed Sliding Window

**Algorithm**: Token bucket with sliding window (Redis SCRIPT)

```
Sliding Window Rate Limit:
├── Key: rate_limit:{limit_type}:{identifier}
│   ├── limit_type: "login", "api", "sharing", etc.
│   ├── identifier: user_id, IP address, or combination
├── Window: Configurable duration (typically 1 hour)
├── Capacity: Maximum requests per window
│   ├── API rate: 1000 requests/hour
│   ├── Login rate: 10 attempts/hour
│   ├── Sharing rate: 100 shares/hour
│   └── Password reset: 5 attempts/hour

Lua Script (Atomic Operation):
```

```lua
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current_time = tonumber(ARGV[3])
local request_cost = tonumber(ARGV[4]) or 1

-- Fetch current window data
local current_count = redis.call('GET', key)
local last_check = redis.call('GET', key .. ':ts')

if not current_count or not last_check then
  -- First request in window
  redis.call('SET', key, request_cost, 'EX', window)
  redis.call('SET', key .. ':ts', current_time, 'EX', window)
  return {1, capacity - request_cost}
end

last_check = tonumber(last_check)
current_count = tonumber(current_count)

if current_time - last_check > window then
  -- Window expired, reset
  redis.call('SET', key, request_cost, 'EX', window)
  redis.call('SET', key .. ':ts', current_time, 'EX', window)
  return {1, capacity - request_cost}
end

-- Within window, check capacity
if current_count + request_cost > capacity then
  return {0, 0} -- Rate limited
else
  -- Increment and return new state
  local new_count = redis.call('INCR', key)
  return {1, capacity - new_count}
end
```

**Rate Limit Types**:

```
Login Attempts:
├── Limit: 10 per hour per IP address
├── Cost: Argon2id computational delay (mandatory)
├── Response: 429 Too Many Requests after limit
└── Mitigation: Temporary IP block after repeated failures

API Calls:
├── Limit: 1000 per hour per user
├── Cost: 1 request unit per call
├── Response: 429 Too Many Requests
└── Burst allowance: 50 requests in 1 minute (leaky bucket)

Sharing Operations:
├── Limit: 100 per hour per user
├── Cost: 10 units per share (high cost)
├── Audit: Logged for bulk detection
└── Mitigation: Temporary hold on rapid mass-sharing

Password Reset:
├── Limit: 5 per hour per account
├── Cost: Email verification required
├── Backoff: Exponential (1min, 5min, 30min, ...)
└── Admin override: With approval logging

Distributed Rate Limiting:
├── Redis cluster: Shared state across servers
├── Consistency: Strong (Redis SCRIPT guarantees)
├── Failover: Graceful degradation (allow if Redis down)
├── Fallback: In-memory rate limiter (best effort)
└── Monitoring: Alert on high rate limit hits
```

### Request Deduplication (Replay Prevention)

**Mechanism**: Track recent request IDs to prevent replay

```
Deduplication Strategy:
├── Client generates: request_id = UUID (random)
├── Sends with: Authorization header and request body
├── Server stores: (user_id, request_id, timestamp)
├── Duration: 5 minutes (typical API timeout)
├── On duplicate:
│   ├── Detect: Exact same request_id
│   ├── Check: Within 5-minute window
│   ├── Action: Return cached response (idempotent)
│   └── Result: Prevents double operations

Implementation (Redis):
├── Key: dedup:{user_id}:{request_id}
├── Value: Cached response (JSON)
├── TTL: 300 seconds (5 minutes)
├── Check: Lookup before processing
├── Update: Store response after processing
└── Space: ~1KB per request (acceptable)

Use Cases:
├── File upload: Same upload ID → Return existing file
├── Vault creation: Same request_id → Return existing vault
├── Sharing: Same request_id → Return existing share
└── Critical for mobile: Retry-safe operations
```

---

## Security Headers

### HTTP Security Headers

**Configuration** (all responses):

```
Strict-Transport-Security:
  Header: Strict-Transport-Security: max-age=31536000; includeSubDomains
  Purpose: Force HTTPS for all connections
  Duration: 1 year (31536000 seconds)
  Scope: All subdomains included

Content-Security-Policy:
  Header: Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' ...
  Purpose: Prevent XSS attacks
  Rules:
    ├── default-src 'self': All content from same origin
    ├── script-src 'self': Scripts only from same origin
    ├── style-src 'self' 'unsafe-inline': CSS from origin or inline
    ├── img-src 'self' https:: Images from origin or HTTPS
    ├── font-src 'self': Fonts from same origin
    ├── connect-src 'self': API calls to same origin
    ├── frame-ancestors 'none': Cannot be embedded
    └── report-uri /security/csp-report: Report violations

X-Content-Type-Options:
  Header: X-Content-Type-Options: nosniff
  Purpose: Prevent MIME type sniffing
  Result: Browsers honor Content-Type header

X-Frame-Options:
  Header: X-Frame-Options: DENY
  Purpose: Prevent clickjacking
  Result: Cannot be embedded in <iframe>

X-XSS-Protection:
  Header: X-XSS-Protection: 1; mode=block
  Purpose: Enable XSS filter (legacy)
  Result: Block page if XSS detected

Referrer-Policy:
  Header: Referrer-Policy: strict-origin-when-cross-origin
  Purpose: Control referrer disclosure
  Rules:
    ├── Same-origin: Send full URL
    └── Cross-origin: Send only origin

Permissions-Policy:
  Header: Permissions-Policy: geolocation=(), microphone=(), camera=()
  Purpose: Disable unnecessary browser features
  Disabled:
    ├── Geolocation
    ├── Microphone
    ├── Camera
    └── Payment request API

Cache-Control:
  Header: Cache-Control: no-store, must-revalidate, private
  Purpose: Prevent sensitive data caching
  Result: No caching in browser or proxies

Pragma:
  Header: Pragma: no-cache
  Purpose: Legacy no-cache directive
  For: HTTP/1.0 compatibility
```

### TLS Configuration

**Protocol Version**:
```
Required: TLS 1.3 only
├── Minimum protocol: TLS 1.3
├── Deprecated: TLS 1.2 and below (if supporting legacy)
├── Ciphers: Only AEAD ciphers
│   ├── TLS_AES_256_GCM_SHA384 (preferred)
│   ├── TLS_CHACHA20_POLY1305_SHA256
│   └── TLS_AES_128_GCM_SHA256 (fallback)
├── Key Exchange:
│   ├── X25519 (preferred)
│   ├── P-256 (fallback)
│   └── No DH < 2048 bits
├── Certificates:
│   ├── ECDSA-based (P-256 or P-384)
│   ├── 256+ bits
│   ├── Issued by trusted CA
│   └── Renewed before expiration (auto)
├── OCSP Stapling:
│   ├── Enabled: Yes
│   ├── Frequency: Updated every 6 hours
│   └── Fallback: Soft fail (allow if unavailable)
└── Perfect Forward Secrecy:
    ├── Enabled: Yes (ephemeral keys per connection)
    └── Effect: Session compromise doesn't reveal past sessions
```

---

## Key Rotation Strategy

### Server Key Rotation

**Purpose**: Limit impact of key compromise

**Rotation Schedule**:

```
Token Signing Key (Ed25519):
├── Rotation: Every 90 days
├── Grace period: 7 days overlap (old + new keys valid)
├── Process:
│   ├── Generate: new_signing_key
│   ├── Stage: Both old and new keys active
│   ├── Timeline:
│   │   ├── Day 0: New key generated, not yet used
│   │   ├── Day 1: New key used for signing
│   │   ├── Day 7: Old key no longer accepted (tokens expire)
│   │   ├── Day 90: Cycle repeats
│   │   └── Day 98: Old key discarded
│   └── Verification: Kid (key ID) in JWT header
└── Impact on users:
    ├── No action required (transparent)
    ├── Tokens with old kid: Still valid (7 day grace)
    ├── New tokens issued with new kid
    └── Refresh tokens work as expected

TLS Certificate Rotation:
├── Rotation: Every 90 days (cert lifetime)
├── Renewal: Automated via ACME (Let's Encrypt)
├── Installation:
│   ├── Staged: Pre-install before expiration
│   ├── Deployment: No downtime required
│   ├── Verification: Post-install certificate check
│   └── Rollback: Revert if verification fails
└── Monitoring:
    ├── Alert: 30 days before expiration
    ├── Alert: 7 days before expiration
    ├── Alert: 1 day before expiration
    └── Automatic: Renewal process 15 days early

Backup Encryption Key:
├── Rotation: Every 6 months
├── Process:
│   ├── Generate: new_backup_key
│   ├── Re-encrypt: All backups with new key
│   ├── Timeline: Staggered (avoid CPU spike)
│   └── Verification: Backup integrity checked
├── Storage:
│   ├── Current key: HSM (Hardware Security Module)
│   ├── Previous key: Encrypted in HSM (recovery)
│   └── Older keys: Archived in secure vault
└── Impact:
    ├── Backup restoration: Automatic key selection
    ├── No manual intervention: Automatic migration
    └── Disaster recovery: Always possible
```

### Key Recovery and Disaster Recovery

**Scenarios**:

```
Scenario 1: Single Key Compromise
├── Detection: Unauthorized access detected
├── Immediate action:
│   ├── Revoke: Compromised key immediately
│   ├── Invalidate: All tokens signed with that key
│   ├── Issue: New tokens with backup key
│   ├── Enforce: Token refresh for all users
│   └── Timeline: <5 minutes
├── Investigation: Determine scope
├── Communication: Notify affected users

Scenario 2: Database Compromise
├── No impact on user data: All encrypted
├── Recovery:
│   ├── Restore: From clean backup
│   ├── Re-encrypt: Metadata with new vault keys
│   ├── Audit: Determine time of compromise
│   ├── Force password reset: For users during compromise window
│   └── Regenerate: All user-related tokens
├── Investigation: How was DB accessed?
└── Remediation: Close security gap

Scenario 3: Server Private Key Compromise
├── Impact: All signatures forgeable
├── Immediate: Revoke key and issue new
├── Recovery:
│   ├── Invalidate: All existing tokens
│   ├── Require: Re-authentication of all users
│   ├── Reissue: Fresh tokens from new key
│   ├── Timeline: Staggered over 1 hour
│   └── Fallback: Multi-factor authentication
├── Investigation: Scope of unauthorized access?
└── Audit: Who accessed what during compromise window?

Scenario 4: Total Server Loss
├── Restore: From encrypted backup
├── Verification:
│   ├── Check: Integrity of vault structures
│   ├── Verify: No rollback attacks
│   ├── Validate: All user permissions intact
│   └── Test: Sample user authentication
├── Communication: Users of downtime/impact
├── Monitoring: Enhanced monitoring post-recovery
└── Root cause: Determine cause and prevent recurrence
```

---

## Audit and Logging

### Comprehensive Audit Trail

**Logged Operations**:

```
Authentication Events:
├── user_login: Username, timestamp, device, IP, result
├── user_logout: User, device, IP, timestamp
├── password_change: User, timestamp, enforcement reason
├── token_refresh: User, device, family_id, timestamp
├── token_revocation: User, reason (theft, logout, etc.)
├── device_enrollment: User, device_id, fingerprint, timestamp
└── device_revocation: User, device_id, reason

Vault Operations:
├── vault_created: User, vault_id, timestamp
├── vault_modified: User, vault_id, operation, timestamp
├── vault_deleted: User, vault_id, timestamp
├── file_added: User, vault_id, file_size, timestamp
├── file_removed: User, vault_id, reason, timestamp
├── index_updated: User, vault_id, timestamp
└── state_version_incremented: vault_id, old_version, new_version

Sharing Events:
├── share_granted: Owner, target_user, vault_id, role, timestamp
├── share_revoked: Owner, target_user, vault_id, timestamp
├── share_accepted: Recipient, sharer, vault_id, timestamp
└── bulk_share: Owner, count, timestamp (for mass operations)

Access Control Changes:
├── permission_granted: Admin, user, resource, role, timestamp
├── permission_revoked: Admin, user, resource, timestamp
├── ownership_transferred: From, to, resource, timestamp
└── role_escalation: User, old_role, new_role, reason

Administrative Operations:
├── admin_login: Admin, timestamp, actions performed
├── key_rotation: Type, old_key_id, new_key_id, timestamp
├── backup_restored: Timestamp, source, scope
├── audit_log_export: User, scope, timestamp
├── rate_limit_override: Admin, user, reason, timestamp
└── security_incident: Type, scope, timestamp, initial_response
```

### Audit Log Access Control

**Permissions**:

```
User-Level Access:
├── Own audit log: Full access
│   ├── Can view: All operations affecting their accounts
│   ├── Can export: CSV/JSON format
│   ├── Can analyze: Trends, access patterns
│   └── Cannot: Delete or modify entries
├── Other users' logs: No access
└── Aggregate stats: No access

Administrator Access:
├── All audit logs: With approval
│   ├── Approval workflow: Requires 2 admins to approve
│   ├── Request: Admin, reason, scope
│   ├── Approval: Two separate admins must approve
│   ├── Logging: Admin access logged with approval reference
│   └── Retention: Access log retained for 2 years
├── Cannot: Modify or delete entries
├── Restrictions: Limited to security investigation scope
└── Escalation: Escalation path for emergency access

Audit Log Verification:
├── Integrity checks: Run daily
├── Hash chain validation: Ensure no tampering
├── Alerting: Any inconsistency triggers alert
├── Investigation: If issues found, audit trail examined
└── Remediation: If tampering confirmed, security incident protocol
```

---

## Incident Response

### Breach Response Procedure

```
Detection Phase (Seconds to Minutes):
├── Alert triggered:
│   ├── Unusual activity detected (IDS)
│   ├── Rate limit bypass detected
│   ├── Failed login spike
│   └── Unauthorized API call pattern
├── Initial response:
│   ├── Page on-call security team
│   ├── Initiate incident response protocol
│   ├── Start logging (if not already)
│   └── Notify incident commander

Containment Phase (Minutes to Hours):
├── Scope determination:
│   ├── Which systems affected?
│   ├── Which data exposed?
│   ├── How many users affected?
│   └── Duration of exposure?
├── Immediate containment:
│   ├── Isolate: Affected systems if necessary
│   ├── Kill: Attacker sessions
│   ├── Block: Known attacker IP addresses
│   └── Disable: Compromised credentials
├── Investigation begins:
│   ├── Log analysis: What happened?
│   ├── Timeline reconstruction: When did it start?
│   ├── Entry point analysis: How did they get in?
│   └── Evidence preservation: Logs, memory dumps

Investigation Phase (Hours to Days):
├── Deep analysis:
│   ├── Forensics: System state at time of breach
│   ├── Code review: Any injected code?
│   ├── Database audit: What was accessed?
│   ├── Backup verification: Are backups clean?
│   └── Log analysis: Complete timeline
├── Determine:
│   ├── Root cause: What enabled the breach?
│   ├── Impact: Exactly what was compromised?
│   ├── User notification: Who needs to be told?
│   └── Remediation: How to fix?

Notification Phase:
├── Internal notification:
│   ├── Executive summary: What happened
│   ├── Initial assessment: What we know so far
│   ├── Action plan: What we're doing
│   └── Timeline: Regular updates
├── User notification (if applicable):
│   ├── Timeline: As soon as impact determined
│   ├── Content: What happened, what they should do
│   ├── Support: How to get help
│   └── Monitoring: Offer credit monitoring if relevant
├── Regulatory notification:
│   ├── Legal: Compliance review
│   ├── Reporting: Required notifications to authorities
│   ├── Timeline: Regulatory deadline (usually 30-60 days)
│   └── Transparency: Public disclosure if required

Recovery Phase (Days to Weeks):
├── System hardening:
│   ├── Patch: Vulnerabilities that enabled breach
│   ├── Upgrade: Dependencies and software
│   ├── Re-harden: Security baseline
│   └── Test: Verify fixes effective
├── Key rotation:
│   ├── All compromised keys: Rotate immediately
│   ├── Server keys: Rotate preventatively
│   ├── Backup keys: Rotate and verify
│   └── Verification: No unauthorized access after rotation
├── Credential reset:
│   ├── Users affected: Forced password reset
│   ├── Administrators: New credentials
│   ├── Integrations: New API keys
│   └── Tokens: All revoked and re-issued
├── Monitoring enhancement:
│   ├── Alerting: More sensitive thresholds
│   ├── Logging: Enhanced logging enabled
│   ├── Review: Real-time activity review
│   └── Timeline: 2-4 weeks enhanced monitoring

Post-Incident Phase (Weeks to Months):
├── Root cause analysis:
│   ├── Technical: What technical factors?
│   ├── Process: What process failures?
│   ├── Human: Any human factors?
│   └── Systemic: Any systemic vulnerabilities?
├── Improvements implemented:
│   ├── Controls added: What new security?
│   ├── Processes changed: What process improvements?
│   ├── Training conducted: What staff training?
│   └── Testing increased: More security testing
├── Verification:
│   ├── Red team: External security test
│   ├── Code review: Peer review of fixes
│   ├── Monitoring: Ongoing threat monitoring
│   └── Audit: Third-party security audit
└── Documentation:
    ├── Report: Final incident report
    ├── Lessons learned: Key takeaways
    ├── Recommendations: Future improvements
    └── Timeline: Full documentation
```

### Communication Plan

```
Stakeholders and Messages:

Executive Leadership:
├── Frequency: Immediate, then daily during incident
├── Content: High-level impact, status, ETA
├── Audience: CEO, CISO, Legal
└── Medium: Secure channel (phone, encrypted messaging)

Engineering Team:
├── Frequency: Continuous during active incident
├── Content: Technical details, status, action items
├── Audience: On-call engineers, platform team
└── Medium: Incident channel (Slack, dedicated bridge)

Customer Support:
├── Frequency: As soon as customer impact known
├── Content: What users should know, response
├── Audience: Support team, customer success
└── Medium: Secure channel, talking points provided

Customers Affected:
├── Frequency: Initial notification, then updates
├── Content: What happened, what to do, what we're doing
├── Audience: All customers or affected subset
├── Medium: Email, status page, phone (if sensitive)

Regulatory Bodies:
├── Frequency: Per regulatory requirement
├── Content: Detailed incident description, remediation
├── Audience: Applicable regulators
└── Medium: Official regulatory notification process

Public/Media:
├── Frequency: Only if significant incident
├── Content: Factual, minimal technical detail
├── Audience: Public, journalists
└── Medium: Official statement, press release
```

---

## References and Standards

- **SRP-6a**: RFC 2945, RFC 5054 - Secure Remote Password Protocol
- **JWT**: RFC 7519 - JSON Web Token (JWT)
- **OAuth 2.0**: RFC 6749 - The OAuth 2.0 Authorization Framework
- **TLS 1.3**: RFC 8446 - The Transport Layer Security (TLS) Protocol
- **HSTS**: RFC 6797 - HTTP Strict Transport Security (HSTS)
- **CSP**: Content Security Policy Level 3 (W3C)
- **OWASP**: Authentication Cheat Sheet, API Security
- **CIS Benchmarks**: Security configuration standards
- **NIST**: Cybersecurity Framework, SP 800-53 Security Controls

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Mar 2026 | Initial Phase 6 documentation release |

---

**END OF DOCUMENT**

This document is current as of March 2026 and represents the comprehensive server-side security architecture of Quantum_Shield. It is intended for security auditors and backend infrastructure teams.
