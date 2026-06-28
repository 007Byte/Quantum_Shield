# DOC-006: Quantum_Shield -- Security Audit Package

| Field | Value |
|-------|-------|
| **Document ID** | DOC-006 |
| **Version** | 2.0 |
| **Date** | 2026-03-18 |
| **Classification** | Confidential -- Security |
| **Audience** | Third-party penetration testers, security auditors |

---

## Table of Contents

1. [Scope](#1-scope)
2. [Security Architecture Overview](#2-security-architecture-overview)
3. [Threat Model (STRIDE)](#3-threat-model-stride)
4. [Cryptographic Implementation Details](#4-cryptographic-implementation-details)
5. [Key Lifecycle](#5-key-lifecycle)
6. [Authentication Flows](#6-authentication-flows)
7. [Input Validation](#7-input-validation)
8. [Rate Limiting](#8-rate-limiting)
9. [Error Handling](#9-error-handling)
10. [Memory Security](#10-memory-security)
11. [Zero-Trace Operations](#11-zero-trace-operations)
12. [Known Limitations](#12-known-limitations)
13. [Dependency Audit Results](#13-dependency-audit-results)
14. [Vulnerabilities Found and Fixed](#14-vulnerabilities-found-and-fixed)
15. [OWASP Compliance Checklist](#15-owasp-compliance-checklist)
16. [Penetration Test Readiness](#16-penetration-test-readiness)
17. [Test Coverage Summary](#17-test-coverage-summary)

---

## 1. Scope

### Systems Under Test

| Component | Language | Entry Points | Network Exposure |
|-----------|----------|-------------|-----------------|
| `usbvault-server` | Go 1.25 | HTTPS REST API, WebSocket | Internet-facing |
| `usbvault-app` | TypeScript (React Native) | Web UI, mobile UI | Client-side |
| `usbvault-crypto` | Rust | FFI (C ABI) | None (local only) |
| `usb-companion` | Node.js | HTTP REST | `127.0.0.1:3001` only |

### Priority Areas

1. Authentication and authorization bypass
2. Cryptographic implementation correctness
3. Key management and lifecycle
4. Input validation and injection
5. RBAC enforcement
6. WebSocket authentication
7. Rate limiting effectiveness
8. Information disclosure via error messages

---

## 2. Security Architecture Overview

### Trust Boundaries

```
+--------------------------------------------------------------+
|  CLIENT DEVICE (Trusted)                                      |
|                                                                |
|  [App UI] --> [Rust Crypto (FFI)] --> [USB Companion]          |
|      |                                      |                  |
|      | Password bytes,                      | Encrypted bytes  |
|      | encrypted blobs                      | (fsync'd)        |
+------+----------------------------------------------+----------+
       |  TLS 1.3 boundary                            |
       v                                              v
+------+----------------------------------------------+----------+
|  SERVER (Zero-Knowledge Zone)                       | USB HW   |
|                                                     |          |
|  Sees: auth tokens, encrypted blobs, SRP verifiers  |          |
|  Never sees: passwords, plaintext, keys, filenames  |          |
+-----------------------------------------------------+----------+
```

### Zero-Knowledge Guarantees

The server stores:
- SRP-6a verifiers (cannot reverse to password)
- Encrypted blobs (opaque binary)
- JWT tokens and session data
- Audit log entries (detail field is encrypted client-side)

The server never stores or processes:
- User passwords
- Encryption keys (MEK, KEK, file keys)
- Plaintext file contents
- Plaintext filenames
- Recovery phrases

### Key Hierarchy

```
Password --> Argon2id(64MiB, t=3, p=4) --> KEK(32B)
                                             |
                                   XChaCha20-Poly1305 unwrap
                                             |
                                             v
                                        MEK(64B)
                                  enc_key(32B) + hmac_key(32B)
                                             |
                      +----------------------+----------------------+
                      |                      |                      |
                HKDF("file_encryption:ID")   HMAC(header)     HMAC(fail_counter)
                      |
                Per-file key(32B)
                      |
                HKDF("stream_chunk_key:" || nonce)
                      |
                Per-chunk key(32B)
```

---

## 3. Threat Model (STRIDE)

### Spoofing

| Threat | Attack Vector | Mitigation |
|--------|--------------|-----------|
| Server impersonation | MITM during SRP | SRP-6a mutual authentication (M2 verification) |
| User impersonation | Stolen JWT | Short-lived access tokens + refresh rotation |
| FIDO2 relay | Phishing FIDO2 assertion | WebAuthn origin binding; PRF extension key binding |
| API replay | Captured auth request | SRP session IDs are single-use; nonce in challenge |

### Tampering

| Threat | Attack Vector | Mitigation |
|--------|--------------|-----------|
| Header modification | Flip bits in vault header | HMAC-SHA256 over all header fields (constant-time verify) |
| Fail counter reset | Set counter to 0 | Domain-separated HMAC on fail counter |
| Index substitution | Replace index with older version | State version rollback protection (monotonic counter) |
| Encrypted data modification | Bit-flip in ciphertext | AEAD authentication tag (16-byte Poly1305/GCM-SIV) |
| Stream truncation | Remove chunks from end | Final HMAC-SHA256 over entire record |

### Repudiation

| Threat | Attack Vector | Mitigation |
|--------|--------------|-----------|
| Deny file access | User claims no access | Tamper-evident audit log with chain hashing |
| Deny share action | User denies sharing file | Audit log entry with encrypted details |

### Information Disclosure

| Threat | Attack Vector | Mitigation |
|--------|--------------|-----------|
| Memory dump / cold boot | Extract keys from RAM | mlock prevents swapping; Zeroize on drop; guard pages |
| Forensic artifact recovery | Recover recent file list | 23 zero-trace cleaners across 3 platforms |
| Filename leakage | Directory listing | Filenames encrypted in AEAD metadata chunks |
| Error message leakage | Stack traces in responses | Error codes only; no sensitive data in error messages |
| Side-channel timing | Time password verification | Constant-time comparison (subtle crate) |
| Metadata analysis | File size analysis | Files chunked to fixed 64 KB chunks (padding implied) |

### Denial of Service

| Threat | Attack Vector | Mitigation |
|--------|--------------|-----------|
| API flooding | High request volume | Redis-backed rate limiting (100/min IP, 10/min auth) |
| Auth exhaustion | Brute-force login | Exponential backoff + account lockout |
| Memory exhaustion | Large request bodies | Request body size limit middleware |
| Connection pool exhaustion | Many concurrent connections | Configurable pool limits (min=5, max=30) |
| S3 outage cascade | S3 unavailability | Circuit breaker (3 failures, 30s timeout) |

### Elevation of Privilege

| Threat | Attack Vector | Mitigation |
|--------|--------------|-----------|
| BOLA (broken object-level auth) | Access another user's vault | RBAC middleware (`RequireVaultPermission`, `VaultOwnerOnly`) |
| Role escalation | Editor to Owner | Transfer ownership requires current owner auth |
| Admin access | Unauthorized admin actions | `RequireRole("admin")` middleware |
| JWT forgery | Craft valid JWT | HMAC-SHA256 signed; key rotation every 90 days |
| Billing tier bypass | Access premium features | Feature gate middleware checks subscription tier in DB |

---

## 4. Cryptographic Implementation Details

### Algorithms and Parameters

| Algorithm | Parameters | Implementation |
|-----------|-----------|---------------|
| Argon2id | m=65536 KiB, t=3, p=4, out=64B | `kdf.rs::derive_master_key()` |
| Argon2id (KEK) | m=65536 KiB, t=3, p=4, out=32B | `kdf.rs::derive_kek()` |
| XChaCha20-Poly1305 | 256-bit key, 192-bit nonce, 128-bit tag | `cipher.rs::encrypt_xchacha20()` |
| AES-256-GCM-SIV | 256-bit key, 96-bit nonce, 128-bit tag | `cipher.rs::encrypt_aes256()` |
| HKDF-SHA256 | Variable input, 256-bit output | `kdf.rs::derive_subkey()` |
| HMAC-SHA256 | 256-bit key, 256-bit output | `vault/header.rs::compute_hmac()` |
| X25519 | Curve25519 ECDH | `sharing.rs` via x25519-dalek |
| ML-KEM-1024 | NIST FIPS 203 (feature-gated) | `crypto/pqc.rs` |
| GF(256) Shamir SSS | 3-of-5 threshold, AES polynomial | `shamir.rs` |
| SRP-6a | RFC 7919 ffdhe3072 (3072-bit group) | `srp_client.rs` / `internal/auth/srp.go` |

### Nonce Management

| Context | Nonce Source | Size | Reuse Prevention |
|---------|------------|------|-----------------|
| File encryption | OsRng | 24B (XChaCha) / 12B (AES) | Random per-operation |
| Streaming chunks | HKDF(base_nonce XOR chunk_index) | 24B / 12B | Deterministic per-chunk; HashSet tracking |
| MEK wrapping | OsRng | 24B | Random per-wrap |
| Verify marker | OsRng | 24B | Once at provision |

### AEAD Associated Data (AD) Format

For version-binding (rollback protection on individual files):
```
"file_version:" || version_le_bytes(8) || ":" || filename_bytes
```

Decryption with incorrect version or filename fails authentication.

### Constant-Time Operations

All security-critical comparisons use constant-time functions:
- Rust: `subtle::ConstantTimeEq` for header HMAC, fail counter HMAC, verify marker
- Go: `crypto/subtle.ConstantTimeCompare` for recovery code verification, JWT signature

---

## 5. Key Lifecycle

| Phase | Key Material | Storage | Lifetime |
|-------|-------------|---------|----------|
| **Generation** | MEK (64B random via OsRng) | In-memory only | Until vault destroyed |
| **Derivation** | KEK (32B from Argon2id) | In-memory only | Duration of unlock |
| **Wrapping** | Wrapped MEK (104B: nonce+ciphertext+tag) | Vault header (VAULT.bin) | Persistent |
| **Per-File** | File key (32B from HKDF) | In-memory only | Duration of operation |
| **Per-Chunk** | Chunk key (32B from HKDF) | In-memory only | Duration of chunk encrypt/decrypt |
| **HMAC** | HMAC key (32B from MEK[32:64]) | In-memory only | Duration of unlock |
| **Zeroing** | All above | N/A | On drop (Zeroizing wrapper) |
| **Destruction** | Wrapped MEK | Vault header | 3-pass overwrite on self-destruct |

### Key Material Never Persisted

The following are never written to disk, localStorage, or any persistent storage:
- Password (zeroed after Argon2id derivation)
- KEK (zeroed after MEK unwrap)
- MEK (zeroed on vault lock/app close)
- Per-file and per-chunk keys (zeroed after use)
- HMAC keys (zeroed on vault lock)

---

## 6. Authentication Flows

### SRP-6a (Primary Authentication)

```
Client                                    Server
  |                                         |
  |-- POST /auth/srp/init {email} --------->|
  |                                         | Look up SRP verifier
  |<-- {salt, B, sessionId} ----------------|
  |                                         |
  | Argon2id(password, salt) -> x           |
  | Compute A, M1, K                        |
  |                                         |
  |-- POST /auth/srp/verify {A, M1, sid} -->|
  |                                         | Verify M1
  |                                         | Compute M2
  |<-- {M2, accessToken, refreshToken} -----|
  |                                         |
  | Verify M2 (mutual authentication)       |
  | Store tokens                            |
```

**Security properties**:
- Password never sent to server
- Mutual authentication (M2 prevents MITM)
- Session keys are unique per login
- Account lockout after repeated failures

### JWT Token Management

| Token | Lifetime | Storage | Refresh |
|-------|----------|---------|---------|
| Access token | Short-lived | SecureStore (iOS Keychain / Android EncryptedSharedPreferences) | Via refresh token |
| Refresh token | Long-lived | SecureStore | Single-use rotation |

JWT signing keys are stored in the `jwt_keys` database table and rotated every 90 days via `KeyRotationService`.

### FIDO2 (WebAuthn)

- Registration: `POST /auth/fido2/manage/register/init` -> `POST /auth/fido2/manage/register/verify`
- Authentication: `POST /auth/fido2/challenge` -> `POST /auth/fido2/verify`
- PRF extension: Hardware key output XOR'd with encryption key for second-factor binding
- Recovery blob: AES-GCM-SIV encrypted backup stored in vault header TFA block

### App Password (Secondary Gate)

- PBKDF2-SHA256 with 150,000 iterations
- 12-character minimum
- 3 attempts before 30-second lockout
- Applied before vault password screen

### USB Standalone Authentication

- No server interaction
- Password used directly as KDF input
- Session stored in sessionStorage (cleared on tab close)
- Zero-trace cleanup on eject

---

## 7. Input Validation

### Companion Service Validation

| Input | Validation Rule |
|-------|----------------|
| USB device path | Must match `/dev/disk\d+` (macOS), `/dev/sd[a-z]+` (Linux), `\\.\PhysicalDrive\d+` (Windows) |
| Vault name | Alphanumeric + spaces, max 64 chars |
| File names | Sanitized (no path traversal: `../`, `..\\`) |
| Mount point | Must be absolute path, validated against known mount directories |
| Partition size | Numeric, within USB capacity bounds |
| VAULT.bin offset/length | Numeric u32/u64, within file bounds |

### Server-Side Validation

| Input | Validation Rule |
|-------|----------------|
| Email | Format validation, SHA-256 hashed before storage |
| SRP values | Hex-encoded, length-validated |
| UUID parameters | UUID format validation |
| Request body | Size-limited via middleware |
| JWT | Signature verification, expiry check, kid validation |

### Rust FFI Validation

| Input | Validation Rule |
|-------|----------------|
| Password pointer | Non-null check |
| Salt | Exactly 32 bytes |
| Cipher ID | Must be 2 or 3 |
| Header data | Minimum 128 bytes, valid magic |
| HKDF info | Non-empty, max 256 bytes |
| Wrapped MEK | Minimum 104 bytes (WRAPPED_MEK_SIZE) |

---

## 8. Rate Limiting

### Configuration

| Scope | Limit | Window | Backend |
|-------|-------|--------|---------|
| Per IP (general) | 100 requests | 1 minute | Redis |
| Per user (general) | 1000 requests | 1 minute | Redis |
| Auth endpoints | 10 requests | 1 minute | Redis |
| Companion (general) | 60 requests | 1 minute | In-memory |
| Companion (destructive) | 5 requests | 1 minute | In-memory |

### Account Lockout

- Managed by `AccountLockoutService` (Redis-backed)
- Progressive delays on failed SRP verification
- Integration with audit service for logging

---

## 9. Error Handling

### Principles

1. **No secrets in errors**: Error responses contain error codes and generic messages only
2. **No stack traces**: Production errors do not include call stacks
3. **Uniform error format**: All API errors use consistent JSON format
4. **Audit logging**: Security-relevant errors are logged to the audit trail

### FFI Error Codes

20 typed error codes (ERR_SUCCESS through ERR_ROLLBACK_DETECTED) with no information leakage. The error code indicates the category of failure without revealing implementation details.

### Sensitive Error Handling

| Scenario | Response | Information Leaked |
|----------|----------|-------------------|
| Wrong password | `ERR_PASSWORD_WRONG` | None (same timing as correct) |
| User not found | Same response as wrong password | None (timing-safe) |
| Fail counter tampered | `ERR_FAIL_COUNTER_TAMPERED` | Tampering detected |
| Rollback detected | `ERR_ROLLBACK_DETECTED` | Downgrade detected |
| JWT expired | HTTP 401 | Token expiry (expected) |

---

## 10. Memory Security

### Protection Mechanisms

| Mechanism | Implementation | Platform |
|-----------|---------------|----------|
| **Zero-on-drop** | `Zeroizing<T>` wrapper (zeroize crate) | All |
| **Swap prevention** | `mlock()` on key material | Linux, macOS |
| **Swap prevention** | `VirtualLock()` on key material | Windows |
| **Guard pages** | `mmap(PROT_NONE)` flanking data regions | Linux, macOS |
| **Thread isolation** | `StreamingEncryptor` is `!Send + !Sync` | All |
| **SecureVec** | `Zeroizing<Vec<u8>>` for temporary buffers | All |

### GuardedBuffer Layout

```
[PROT_NONE guard page] [PROT_READ|WRITE data + mlock] [PROT_NONE guard page]
```

Buffer overflow or underflow triggers SIGSEGV. On drop: data zeroed, munlock'd, entire region munmap'd.

### What Is NOT Protected

- JavaScript heap in web mode (WebCrypto API handles key material internally)
- React Native bridge memory during FFI calls (transient)
- Process memory is not encrypted at rest (requires OS-level full-disk encryption)

---

## 11. Zero-Trace Operations

### Artifact Coverage (23 Types)

**Windows User-Level (10)**:
1. Recent Items (.lnk files)
2. Jump Lists
3. Thumbnail Cache
4. Shellbags (Registry)
5. Registry MRU entries
6. Windows Search Index
7. Recycle Bin
8. USB Volume Metadata
9. Session Files
10. Temp Artifacts

**Windows Admin-Only (2)**:
11. Prefetch files
12. Event Logs

**macOS (6)**:
13. .DS_Store files
14. QuickLook cache
15. USB metadata (.Trashes, .fseventsd, Spotlight-V100)
16. Recent Documents (TCC-aware)
17. Spotlight re-index trigger
18. Session files

**Linux (5)**:
19. recently-used.xbel
20. Zeitgeist database
21. Thumbnail cache
22. USB Trash directories
23. GNOME Tracker cache

### What Is NOT Cleaned

| Artifact | Reason |
|----------|--------|
| Windows Prefetch (non-admin) | Requires administrator privileges |
| Windows Event Logs (non-admin) | Requires administrator privileges |
| Browser history | Not accessed by USBVault (uses Expo WebView) |
| Kernel-level USB event logs | Cannot be modified from user space |
| Network connection logs | Outside application scope |
| Physical RAM contents | Requires system restart (restart advisory shown) |

---

## 12. Known Limitations

| Limitation | Risk Level | Mitigation |
|------------|-----------|-----------|
| Web mode cannot clear registry/Prefetch | Medium | Desktop companion handles these; restart advisory |
| No process isolation for Rust FFI | Low | FFI runs in-process; planned for future phase |
| No ptrace anti-debug in web builds | Low | Device integrity checks; native builds planned |
| WebCrypto key material in JS heap | Medium | Transient; browser handles memory security |
| sessionStorage clearable by user | Low | Zero-trace cleanup runs before eject |
| No steganographic delivery (planned) | Low | Hidden partition and file attributes provide concealment |
| SRP uses RFC 7919 ffdhe3072 (3072-bit) group | Low | Exceeds the RFC 5054 2048-bit baseline; meets current guidance |
| No certificate transparency monitoring | Low | Certificate pinning in mobile apps |

---

## 13. Dependency Audit Results

### Rust (cargo audit)

**Date**: 2026-03-18
**Result**: No known vulnerabilities

Notable: `sharks` crate removed due to RUSTSEC-2024-0398 (biased polynomial coefficients in Shamir's Secret Sharing). Replaced with custom GF(256) implementation in `shamir.rs`.

| Dependency | Version | Advisory Status |
|------------|---------|----------------|
| chacha20poly1305 | 0.10 | Clean |
| aes-gcm-siv | 0.11 | Clean |
| argon2 | 0.5 | Clean |
| x25519-dalek | 2 | Clean |
| ml-kem | 0.2 | Clean |
| zeroize | 1 | Clean |
| subtle | 2 | Clean |
| srp | 0.7.0-rc.1 | Clean |

### Go (govulncheck)

**Date**: 2026-03-18
**Result**: No known vulnerabilities

Key dependencies audited:
- `golang.org/x/crypto v0.48.0`
- `github.com/golang-jwt/jwt/v5 v5.2.2`
- `github.com/go-webauthn/webauthn v0.10.2`
- `github.com/jackc/pgx/v5 v5.5.5`

### Node.js (npm audit)

**Date**: 2026-03-18
**Result**: No known vulnerabilities

### TypeScript App (npm audit)

**Date**: 2026-03-18
**Result**: No known vulnerabilities

---

## 14. Vulnerabilities Found and Fixed

During development and internal security review, the following 7 vulnerabilities were identified and fixed:

| # | ID | Severity | Description | Fix |
|---|-----|----------|-------------|-----|
| 1 | DV-007 | High | AEAD ciphertext accepted without minimum size validation (empty ciphertext allowed) | Added `nonce + tag` minimum size check in `decrypt_xchacha20` and `decrypt_aes256` |
| 2 | DV-011 | Medium | HKDF `derive_subkey` accepted empty master key and empty info string | Added non-empty validation for master key and info string (max 256 chars) |
| 3 | TD-002 | High | SRP mutual authentication (M2) not verified -- MITM possible | Added `computeExpectedM2()` and comparison in login flow |
| 4 | TD-003 | Medium | SRP identity hardcoded as `'client'` instead of actual email | Changed to use actual email as SRP identity |
| 5 | TD-005 | Medium | Memory locking (`mlock`) only implemented for Linux | Added macOS (`mlock`) and Windows (`VirtualLock`) implementations |
| 6 | SG-012 | Medium | No AEAD associated data for version binding -- rollback attacks possible on individual files | Added `encrypt_with_ad` / `decrypt_with_ad` with `build_version_ad()` |
| 7 | SG-013 | Medium | Streaming encryption reused master key for both chunk encryption and HMAC | Added HKDF domain separation: `"stream_chunk_key:"` and `"stream_hmac_key"` |

All fixes include regression tests.

---

## 15. OWASP Compliance Checklist

### OWASP Top 10 (2021)

| # | Vulnerability | Status | Implementation |
|---|--------------|--------|---------------|
| A01 | Broken Access Control | Mitigated | RBAC middleware (RequireVaultPermission, VaultOwnerOnly, RequireRole) |
| A02 | Cryptographic Failures | Mitigated | Argon2id KDF, AEAD ciphers, constant-time comparisons, zeroize |
| A03 | Injection | Mitigated | Parameterized queries (pgx), input validation, no shell=true |
| A04 | Insecure Design | Mitigated | Zero-knowledge architecture, defense-in-depth, threat modeling |
| A05 | Security Misconfiguration | Mitigated | Security headers, CORS whitelist, non-root containers, read-only FS |
| A06 | Vulnerable Components | Mitigated | cargo audit, govulncheck, npm audit -- all clean |
| A07 | Auth Failures | Mitigated | SRP-6a (no password transmission), JWT rotation, account lockout |
| A08 | Data Integrity Failures | Mitigated | HMAC verification, AEAD authentication, state version rollback protection |
| A09 | Logging Failures | Mitigated | Structured logging (zerolog), tamper-evident audit trail |
| A10 | SSRF | Mitigated | No user-controllable URLs in server requests; S3 endpoint fixed in config |

### OWASP ASVS (Application Security Verification Standard)

| Category | Level | Status |
|----------|-------|--------|
| V1: Architecture | L2 | Compliant (zero-knowledge, defense-in-depth) |
| V2: Authentication | L2 | Compliant (SRP-6a, FIDO2, JWT rotation) |
| V3: Session Management | L2 | Compliant (short-lived tokens, secure storage) |
| V4: Access Control | L2 | Compliant (RBAC, vault-level permissions) |
| V5: Validation | L2 | Compliant (input validation, parameterized queries) |
| V6: Cryptography | L2 | Compliant (AEAD, Argon2id, constant-time) |
| V7: Error Handling | L2 | Compliant (no secrets in errors) |
| V8: Data Protection | L2 | Compliant (encryption at rest and in transit) |
| V9: Communication | L2 | Compliant (TLS 1.3, certificate pinning) |
| V10: Malicious Code | L1 | Partially (no code signing yet, planned Phase 8) |
| V11: Business Logic | L2 | Compliant (rate limiting, feature gates, billing checks) |
| V12: Files and Resources | L2 | Compliant (file name sanitization, size limits) |
| V13: API Security | L2 | Compliant (CORS, rate limiting, auth middleware) |
| V14: Configuration | L2 | Compliant (non-root, read-only FS, secrets in env/K8s secrets) |

---

## 16. Penetration Test Readiness

### Recommended Test Plan

| Phase | Focus | Time Estimate |
|-------|-------|---------------|
| 1 | API authentication bypass (SRP, JWT, FIDO2) | 2 days |
| 2 | RBAC and BOLA testing (vault access control) | 1 day |
| 3 | Cryptographic implementation review | 2 days |
| 4 | Companion service security (input validation, command injection) | 1 day |
| 5 | WebSocket authentication and injection | 1 day |
| 6 | Web application security (XSS, CSRF, CSP bypass) | 1 day |
| 7 | Rate limiting and DoS resilience | 0.5 days |
| 8 | Error handling and information disclosure | 0.5 days |

### Test Credentials

Contact the security team for:
- Test account credentials (all subscription tiers)
- Admin account for privileged endpoint testing
- Stripe test mode keys
- Test FIDO2 hardware keys

### API Documentation

Full API endpoint reference is available in DOC-001 Section 8. Key endpoints for testing:

| Category | Base Path | Critical Tests |
|----------|-----------|---------------|
| Auth | `/api/v1/auth` | SRP bypass, JWT forgery, account lockout |
| Vaults | `/api/v1/vaults` | BOLA, RBAC enforcement, key-hierarchy access |
| Shares | `/api/v1/shares` | Cross-user access, public key substitution |
| Admin | `/api/v1/admin` | Privilege escalation, unauthorized access |
| Sync | `/api/v1/sync/ws` | WebSocket auth bypass, message injection |

### Source Code Access

All source code is available for white-box testing:
- `usbvault-crypto/`: Rust crypto core
- `usbvault-server/`: Go API server
- `usbvault-app/`: TypeScript frontend
- `usb-companion/`: Node.js USB bridge

---

## 17. Test Coverage Summary

### Rust Crypto (234 Tests)

| Suite | Count | Coverage Area |
|-------|-------|---------------|
| Unit tests | 77 | Cipher, KDF, header, memory |
| Format compatibility | 28 | V2/V3/V4 header roundtrip |
| Integration | 40 | End-to-end encrypt/decrypt |
| Property-based (proptest) | 19 | Arbitrary input fuzzing |
| Sharing | 32 | X25519, sealed boxes, PQC hybrid |
| SRP protocol | 23 | Client/server key exchange |
| Vault lifecycle | 15 | Create, unlock, commit, self-destruct |

### TypeScript App (45 Test Files)

- Service tests: auth, backup, certificate pinning, forensics, message, tier, session, settings, sync, crypto, platform, rate limiter, password, share
- Component tests: sidebar, common components
- E2E tests: Playwright + Maestro flows

### Go Server (61 Test Files)

- Auth: SRP, FIDO2 registration, FIDO2 verification, JWT
- Middleware: auth, rate limiting, RBAC, tier, IAST
- Services: billing, sharing, sync, notify, recovery
- Infrastructure: config, error tracking, metrics, tracing
- Security: pentest framework, OWASP compliance, DAST

---

## Cross-References

- **DOC-001**: Technical Specification (cryptographic algorithms, V4 header format, error codes)
- **DOC-002**: Architecture and System Design (trust boundaries, deployment architecture)
- **DOC-004**: IT Deployment Guide (security configuration, TLS setup)
- **DOC-007**: Recovery Procedures (self-destruct recovery, dual-index recovery)
