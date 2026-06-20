# CWE Top 25 (2024) Most Dangerous Software Weaknesses - USBVault Enterprise Audit

**Audit Date:** 2026-03-12
**Auditor:** Automated + Manual Review
**Scope:** usbvault-server (Go), usbvault-crypto (Rust), usbvault-app (React Native/TypeScript)

---

## CWE-79: Improper Neutralization of Input During Web Page Generation (XSS)

**USBVault Mitigation:** USBVault is a React Native application (not server-rendered HTML). The backend API returns JSON only. React's JSX automatically escapes rendered content. Content-Security-Policy headers are set in middleware.

**Evidence:**
- `usbvault-server/internal/middleware/security.go` (CSP headers)
- React Native framework (automatic JSX escaping)

**Status: MITIGATED**

---

## CWE-787: Out-of-bounds Write

**USBVault Mitigation:** Go is memory-safe (no raw pointer arithmetic). Rust enforces memory safety at compile time via ownership/borrow checker. The FFI boundary uses bounded buffers.

**Evidence:**
- `usbvault-crypto/src/ffi/mod.rs` (bounded FFI buffers)
- `usbvault-crypto/src/memory.rs` (memory management)

**Status: MITIGATED**

---

## CWE-89: Improper Neutralization of Special Elements used in an SQL Command (SQL Injection)

**USBVault Mitigation:** All database queries use pgx parameterized prepared statements with `$1`, `$2` placeholders. No string concatenation for SQL construction.

**Evidence:**
- `usbvault-server/internal/auth/srp.go` (parameterized queries with pgxpool)
- `usbvault-server/internal/vault/service.go`
- `usbvault-server/internal/audit/service.go`

**Status: MITIGATED**

---

## CWE-416: Use After Free

**USBVault Mitigation:** Go has garbage collection (no manual memory management). Rust's ownership system prevents use-after-free at compile time.

**Evidence:**
- Language-level guarantees (Go GC, Rust borrow checker)
- `usbvault-crypto/src/memory.rs`

**Status: MITIGATED**

---

## CWE-78: Improper Neutralization of Special Elements used in an OS Command (OS Command Injection)

**USBVault Mitigation:** The server does not execute OS commands based on user input. No `os/exec` calls with user-supplied data.

**Evidence:**
- Manual review of `usbvault-server/` - no `os/exec` with user input

**Status: MITIGATED**

---

## CWE-20: Improper Input Validation

**USBVault Mitigation:** UUID validation middleware, Content-Type validation, request body size limits, typed Go structs for JSON deserialization.

**Evidence:**
- `usbvault-server/internal/middleware/validate.go` (ValidateUUIDParam, ValidateContentType)
- `usbvault-server/internal/middleware/security.go` (RequestBodyLimit)
- `usbvault-app/src/utils/passwordPolicy.ts`

**Status: MITIGATED**

---

## CWE-125: Out-of-bounds Read

**USBVault Mitigation:** Go prevents out-of-bounds access with runtime bounds checking. Rust prevents it at compile time. Slice operations in both languages are bounds-checked.

**Evidence:**
- Language-level guarantees (Go runtime panics, Rust compile-time checks)
- `usbvault-crypto/src/memory.rs`

**Status: MITIGATED**

---

## CWE-22: Improper Limitation of a Pathname to a Restricted Directory (Path Traversal)

**USBVault Mitigation:** File storage uses S3 with UUID-based keys, not filesystem paths. No user-controlled file paths reach the filesystem.

**Evidence:**
- `usbvault-server/internal/storage/s3.go` (S3 storage with UUID keys)
- `usbvault-server/internal/storage/multipart.go`

**Status: MITIGATED**

---

## CWE-862: Missing Authorization

**USBVault Mitigation:** RBAC middleware chain applied to all protected routes. Every handler requires authenticated context with permission checks.

**Evidence:**
- `usbvault-server/internal/middleware/rbac.go`
- `usbvault-server/internal/auth/rbac.go`
- `usbvault-server/internal/auth/privilege_escalation_test.go`

**Status: MITIGATED**

---

## CWE-476: NULL Pointer Dereference

**USBVault Mitigation:** Go nil checks before pointer dereference. Rust's `Option` type eliminates null pointer issues at the type level.

**Evidence:**
- Language-level guarantees (Go explicit nil checks, Rust Option/Result)
- `usbvault-server/internal/apierrors/errors.go` (structured error handling)

**Status: MITIGATED**

---

## CWE-287: Improper Authentication

**USBVault Mitigation:** SRP-6a mutual authentication. Ed25519 JWT tokens. FIDO2 second factor. Account lockout after failed attempts.

**Evidence:**
- `usbvault-server/internal/auth/srp.go`
- `usbvault-server/internal/auth/jwt.go`
- `usbvault-server/internal/auth/fido2.go`
- `usbvault-server/internal/auth/lockout.go`

**Status: MITIGATED**

---

## CWE-190: Integer Overflow or Wraparound

**USBVault Mitigation:** Go integer arithmetic does not silently overflow in most contexts (explicit size types). Rust panics on overflow in debug mode and wraps in release (configurable).

**Evidence:**
- Language-level protections
- `usbvault-crypto/src/cipher.rs` (explicit size handling)

**Status: MITIGATED**

---

## CWE-502: Deserialization of Untrusted Data

**USBVault Mitigation:** Go `encoding/json` only deserializes into typed structs (no arbitrary object instantiation). Rust `serde` is type-safe. No Java/PHP-style dangerous deserialization.

**Evidence:**
- `usbvault-server/internal/auth/srp.go` (JSON deserialization into typed structs)
- Language-level safety (Go encoding/json, Rust serde)

**Status: MITIGATED**

---

## CWE-77: Improper Neutralization of Special Elements used in a Command (Command Injection)

**USBVault Mitigation:** No command execution with user-supplied input in the server or crypto components.

**Evidence:**
- Manual review of usbvault-server/ and usbvault-crypto/

**Status: MITIGATED**

---

## CWE-119: Improper Restriction of Operations within the Bounds of a Memory Buffer

**USBVault Mitigation:** Go and Rust both provide memory-safe buffer operations. Rust's ownership system prevents buffer overflows. Go's slices are bounds-checked.

**Evidence:**
- `usbvault-crypto/src/memory.rs`
- `usbvault-crypto/src/streaming.rs` (bounded streaming operations)

**Status: MITIGATED**

---

## CWE-798: Use of Hard-coded Credentials

**USBVault Mitigation:** No hardcoded credentials in source code. Environment variables used for all secrets. `gitleaks` scans for leaked secrets. `generate-secrets.sh` creates random credentials.

**Evidence:**
- `scripts/validate-env.sh`
- `scripts/generate-secrets.sh`
- `.github/workflows/security.yml` (gitleaks job)

**Status: MITIGATED**

---

## CWE-306: Missing Authentication for Critical Function

**USBVault Mitigation:** All API endpoints (except health checks) require JWT authentication. Authentication middleware applied at the router level.

**Evidence:**
- `usbvault-server/internal/auth/jwt.go`
- `usbvault-server/internal/middleware/rbac.go`
- `usbvault-server/internal/security/dast_config.go` (AuthRequired field per endpoint)

**Status: MITIGATED**

---

## CWE-362: Concurrent Execution Using Shared Resource with Improper Synchronization (Race Condition)

**USBVault Mitigation:** Go race detector enabled in CI (`go test -race`). Redis Lua scripts for atomic distributed operations. Rust's ownership model prevents data races at compile time.

**Evidence:**
- `.github/workflows/ci.yml` (`go test -race`)
- `usbvault-server/internal/middleware/ratelimit.go` (atomic Lua script)
- `usbvault-server/internal/vault/concurrent_access_test.go`
- `usbvault-server/internal/audit/concurrent_test.go`

**Status: MITIGATED**

---

## CWE-269: Improper Privilege Management

**USBVault Mitigation:** RBAC with least-privilege roles (Viewer < Member < Admin < Owner). Feature gates tied to subscription tiers.

**Evidence:**
- `usbvault-server/internal/auth/rbac.go`
- `usbvault-server/internal/middleware/feature_gate.go`
- `usbvault-server/internal/auth/privilege_escalation_test.go`

**Status: MITIGATED**

---

## CWE-918: Server-Side Request Forgery (SSRF)

**USBVault Mitigation:** Server does not make HTTP requests to user-supplied URLs. Storage uses pre-configured S3 endpoints.

**Evidence:**
- `usbvault-server/internal/storage/s3.go`
- Manual review: no `http.Get` or similar with user-controlled URLs

**Status: N/A**

---

## CWE-434: Unrestricted Upload of File with Dangerous Type

**USBVault Mitigation:** All uploaded files are treated as encrypted blobs. Server does not interpret file content or type. Upload size limits enforced per tier.

**Evidence:**
- `usbvault-server/internal/storage/multipart.go`
- `usbvault-server/internal/storage/tier_limits_test.go`

**Status: MITIGATED**

---

## CWE-611: Improper Restriction of XML External Entity Reference (XXE)

**USBVault Mitigation:** USBVault uses JSON exclusively for API communication. No XML parsing in the codebase.

**Evidence:**
- Manual review: no XML parsing libraries imported

**Status: N/A**

---

## CWE-311: Missing Encryption of Sensitive Data

**USBVault Mitigation:** All vault data encrypted client-side with AES-256-GCM-SIV or XChaCha20-Poly1305 before transmission. TLS 1.3 for transport. SecureStore for local storage.

**Evidence:**
- `usbvault-crypto/src/cipher.rs`
- `usbvault-crypto/src/vault/mod.rs`
- `usbvault-app/src/services/security/certificatePinning.ts`

**Status: MITIGATED**

---

## CWE-863: Incorrect Authorization

**USBVault Mitigation:** RBAC permission checks at middleware level before handlers execute. BOLA tests verify cross-user access is blocked.

**Evidence:**
- `usbvault-server/internal/middleware/rbac.go`
- `usbvault-server/internal/auth/bola_test.go`, `bola_extended_test.go`
- `usbvault-server/internal/auth/rbac_test.go`

**Status: MITIGATED**

---

## CWE-427: Uncontrolled Search Path Element

**USBVault Mitigation:** Server application does not load external libraries at runtime based on path search. Rust FFI libraries are statically linked or loaded from known paths.

**Evidence:**
- `usbvault-crypto/src/ffi/mod.rs` (static FFI interface)
- Build configuration (static linking)

**Status: N/A**

---

## Summary

| CWE ID | Weakness | Status |
|--------|----------|--------|
| CWE-79 | XSS | MITIGATED |
| CWE-787 | Out-of-bounds Write | MITIGATED |
| CWE-89 | SQL Injection | MITIGATED |
| CWE-416 | Use After Free | MITIGATED |
| CWE-78 | OS Command Injection | MITIGATED |
| CWE-20 | Input Validation | MITIGATED |
| CWE-125 | Out-of-bounds Read | MITIGATED |
| CWE-22 | Path Traversal | MITIGATED |
| CWE-862 | Missing Authorization | MITIGATED |
| CWE-476 | NULL Pointer Dereference | MITIGATED |
| CWE-287 | Improper Authentication | MITIGATED |
| CWE-190 | Integer Overflow | MITIGATED |
| CWE-502 | Deserialization | MITIGATED |
| CWE-77 | Command Injection | MITIGATED |
| CWE-119 | Buffer Overflow | MITIGATED |
| CWE-798 | Hardcoded Credentials | MITIGATED |
| CWE-306 | Missing Auth for Critical Function | MITIGATED |
| CWE-362 | Race Condition | MITIGATED |
| CWE-269 | Improper Privilege Management | MITIGATED |
| CWE-918 | SSRF | N/A |
| CWE-434 | Unrestricted File Upload | MITIGATED |
| CWE-611 | XXE | N/A |
| CWE-311 | Missing Encryption | MITIGATED |
| CWE-863 | Incorrect Authorization | MITIGATED |
| CWE-427 | Uncontrolled Search Path | N/A |

**Overall:** 22/25 controls mitigated, 3 not applicable. Zero gaps identified.
