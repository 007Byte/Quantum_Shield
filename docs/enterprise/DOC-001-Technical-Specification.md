# DOC-001: Quantum_Shield -- Technical Specification

| Field | Value |
|-------|-------|
| **Document ID** | DOC-001 |
| **Version** | 2.0 |
| **Date** | 2026-03-18 |
| **Classification** | Confidential -- Engineering |
| **Audience** | Engineers, security auditors, penetration testers |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture Overview](#2-system-architecture-overview)
3. [Vault Binary Format](#3-vault-binary-format)
4. [Cryptographic Protocols](#4-cryptographic-protocols)
5. [Streaming Encryption](#5-streaming-encryption)
6. [Key Hierarchy and Wrapped MEK](#6-key-hierarchy-and-wrapped-mek)
7. [USB Operations](#7-usb-operations)
8. [API Endpoints and Protocols](#8-api-endpoints-and-protocols)
9. [Security Modules](#9-security-modules)
10. [Password Policy](#10-password-policy)
11. [Error Codes](#11-error-codes)
12. [Build System](#12-build-system)
13. [Testing](#13-testing)
14. [Performance Characteristics](#14-performance-characteristics)
15. [Constants Reference](#15-constants-reference)
16. [Data Flow Diagrams](#16-data-flow-diagrams)
17. [Appendix A: V2-to-V4 Header Field Mapping](#appendix-a-v2-to-v4-header-field-mapping)
18. [Appendix B: Architecture Decision Records](#appendix-b-architecture-decision-records)
19. [Appendix C: Threat Model](#appendix-c-threat-model)

---

## 1. Executive Summary

Quantum_Shield (codename "Fortress Enterprise") is a portable encrypted file storage system designed to intelligence-grade security standards. The system enables users to carry sensitive files on a USB drive, access them on any computer running Windows, macOS, or Linux, and leave zero forensic evidence after use.

### Technology Stack

| Subsystem | Language | Purpose |
|-----------|----------|---------|
| `usbvault-crypto` | Rust 2021 | All cryptographic operations |
| `usbvault-app` | TypeScript / React Native (Expo 54) | Cross-platform frontend |
| `usbvault-server` | Go 1.25 | REST API, auth, sync, billing |
| `usb-companion` | Node.js / Express | Local USB hardware bridge |

### Quality Metrics

- **Rust tests**: 234 (unit, integration, property-based fuzzing)
- **TypeScript tests**: 45 files (Jest + Playwright)
- **Go tests**: 61 files
- **Total test files**: 340 across 3 subsystems
- **Security audits**: cargo audit, govulncheck, npm audit -- all clean

---

## 2. System Architecture Overview

Quantum_Shield is a four-subsystem architecture with a zero-knowledge design. All cryptographic operations execute client-side in Rust. The server never sees plaintext content, filenames, or encryption keys.

### Subsystems

**usbvault-crypto (Rust)**
- Crate type: `cdylib`, `staticlib`, `lib`
- Build: `cargo build --release` with LTO, strip, `panic=abort`
- Exposes C ABI via FFI for iOS, Android, macOS, Windows, Linux
- Core modules: `cipher.rs`, `kdf.rs`, `streaming.rs`, `vault/header.rs`, `vault/index.rs`, `shamir.rs`, `memory.rs`, `ffi/mod.rs`

**usbvault-app (TypeScript)**
- Framework: Expo 54 + React Native 0.81 + React 19.1
- State management: Zustand (7 stores: auth, vault, theme, sidebar, language, offline, sync)
- Internationalization: i18next (en, es, fr, de)
- Pages: 37 screens
- Security services: 19

**usbvault-server (Go)**
- Router: chi/v5
- Database: PostgreSQL 16 (pgx/v5, 14 migrations)
- Cache: Redis (go-redis/v9)
- Blob storage: S3 (AWS SDK v2)
- Monitoring: Prometheus + Grafana + AlertManager + Sentry + OpenTelemetry

**usb-companion (Node.js)**
- Binding: `127.0.0.1:3001` (localhost only)
- Endpoints: 19
- Zero-trace cleaners: 23

### Trust Boundaries

| Boundary | Data that crosses | Data that NEVER crosses |
|----------|-------------------|------------------------|
| App <-> Rust FFI | Password (once, for KDF), encrypted bytes | Derived keys, plaintext data |
| App <-> Companion | Encrypted VAULT.bin bytes, drive IDs | Passwords, keys, plaintext |
| App <-> Server | Encrypted blobs, auth tokens | Vault password, file content, keys |
| Companion <-> USB | Raw encrypted bytes (fsync'd) | Keys, plaintext |

---

## 3. Vault Binary Format

### V4 Header (`USBVLT04`)

The V4 header is a 24,576-byte (24 KiB) structure using sequential length-prefixed fields. It supersedes V2 (4,096 B) and V3 (16,384 B).

```
Offset  Size   Field                  Encoding         Notes
------  ----   -----                  --------         -----
0       8      Magic                  "USBVLT04"       File identification
8       1      KDF Hash ID            uint8            2 = Argon2id (only valid value)
9       1      Cipher ID              uint8            2 = XChaCha20-Poly1305, 3 = AES-256-GCM-SIV
10      32     Salt                   raw bytes        OsRng(32) at provision
42      24     Verify IV              raw bytes        Nonce for verify marker
66      2      Verify CT length       uint16 LE        Length of verify ciphertext
68      var    Verify ciphertext      raw bytes        Encrypted verify marker + tag
var     32     Header HMAC            HMAC-SHA256      Over header with HMAC field zeroed
var     1      Active index slot      uint8            0 or 1 (dual-index commit)
var     4      Index 1 offset         uint32 LE        Byte position in VAULT.bin
var     4      Index 1 length         uint32 LE        Encrypted index size
var     4      Index 2 offset         uint32 LE        Backup slot offset
var     4      Index 2 length         uint32 LE        Backup slot size
var     8      Commit counter         uint64 LE        Monotonic for crash recovery
var     4      Argon2 memory (KiB)    uint32 LE        Default: 65536 (64 MiB)
var     4      Argon2 time cost       uint32 LE        Default: 3
var     1      Argon2 parallelism     uint8            Default: 4

-- V3+ Variable-Length Blocks --
var     4      Identity block length  uint32 LE        0 = absent
var     var    Identity block         JSON + padding   Plaintext vault metadata
var     4      TFA block length       uint32 LE        0 = absent
var     var    TFA block              raw bytes        FIDO2 credentials + config
var     4      Fail counter length    uint32 LE        0 = absent
var     var    Fail counter block     raw bytes        count(4B) + HMAC(32B)

-- V4 Extended Fields --
var     4      Wrapped MEK length     uint32 LE        0 = absent
var     var    Wrapped MEK            raw bytes        KEK-encrypted master key
var     8      State version          uint64 LE        Monotonic rollback counter
var     1      Index encrypted flag   uint8            1 = index is encrypted

-- Padding --
var     var    Reserved               zero-filled      Pad to 24576 bytes total
```

### Why 24,576 bytes?

- Wrapped MEK blob varies from 80-200 bytes depending on cipher
- PQC public keys (ML-KEM-1024) are 1,568 bytes each
- Variable-length blocks need room to grow
- 24 KiB is a common page-aligned size for USB flash translation layers

### V2RC Streaming Record Format

```
MAGIC        4 bytes   "V2RC"
VERSION      1 byte    0x02
BASE_NONCE  24 bytes   Random nonce base for HKDF derivation
CHUNKS:
  LENGTH     4 bytes   uint32 LE: encrypted chunk size
  PAYLOAD    variable  nonce || ciphertext || tag (AEAD)
FINAL_HMAC  32 bytes   HMAC-SHA256 over all preceding bytes
```

- Chunk 0 contains metadata: record_type (1B) + filename_len (4B) + filename + data_len (8B)
- Chunks 1..N contain file data in 64 KB chunks
- Per-chunk key derivation via HKDF-SHA256 with domain separation: `"stream_chunk_key:" || nonce(24B)`
- Final HMAC uses a separate HKDF-derived key with domain `"stream_hmac_key"`

### TFA Wire Format

```
cred_id_len  2 bytes   uint16 LE
credential_id  variable
aaguid       16 bytes
label_len    1 byte
label        variable (max 32 bytes)
```

### Backward Compatibility

- Discovery accepts `USBVLT02`, `USBVLT03`, and `USBVLT04` magic bytes
- Identity block readable from any version (offset parsed dynamically)
- V2 vaults can be opened read-only by the Enterprise app
- V4 vaults cannot be opened by the original V2 Python app (one-way upgrade)

---

## 4. Cryptographic Protocols

### Key Derivation Function: Argon2id

| Parameter | Value |
|-----------|-------|
| Algorithm | Argon2id (Algorithm::Argon2id) |
| Memory | 65,536 KiB (64 MiB) |
| Time cost | 3 iterations |
| Parallelism | 4 lanes |
| Output length | 64 bytes (KEK: 32 bytes) |
| Salt | 32 bytes (OsRng) |
| Output split | `enc_key[0:32]` + `hmac_key[32:64]` |

Implementation: `usbvault-crypto/src/kdf.rs` -- `derive_master_key()` and `derive_kek()`

### AEAD Ciphers

| Cipher | ID | Nonce | Tag | Key | Default | FIPS |
|--------|----|-------|-----|-----|---------|------|
| XChaCha20-Poly1305 | 2 | 24 B | 16 B | 32 B | Yes | No |
| AES-256-GCM-SIV | 3 | 12 B | 16 B | 32 B | No | Yes |

Implementation: `usbvault-crypto/src/cipher.rs`

All ciphers support AEAD with associated data (AD) for version binding. AD format:
```
"file_version:" || version_le_bytes(8) || ":" || filename_bytes
```

### HKDF Domain Separation (SG-013)

| Context String | Module | Purpose |
|----------------|--------|---------|
| `"vault_index_encryption"` | vault/index.rs | Index encryption key from master |
| `"file_encryption:{file_id}"` | kdf.rs | Per-file encryption key from MEK |
| `"stream_chunk_key:" \|\| nonce(24)` | streaming.rs | Per-chunk key for streaming AEAD |
| `"stream_hmac_key"` | streaming.rs | HMAC key for record integrity |
| `"kek_wrapping"` | bridge.ts | KEK domain separation (TypeScript) |
| `"file_version:" \|\| ver \|\| filename` | cipher.rs | AEAD AD for rollback protection |

**Rule**: No two operations share the same info string.

### Nonce Generation

- All nonces generated via `OsRng` (CSPRNG)
- XChaCha20-Poly1305: 24-byte nonce (192-bit)
- AES-256-GCM-SIV: 12-byte nonce (96-bit)
- Streaming: base nonce XOR'd with chunk index for per-chunk derivation
- Nonce reuse detection via HashSet in `StreamingEncryptor`

### HMAC Computations

**Header HMAC**: `HMAC-SHA256(hmac_key, salt || verify_iv || verify_ct_len || verify_ct)`

**Fail Counter HMAC**: Domain-separated with `"USBVault-FailCounter-v1:"` prefix
```
HMAC-SHA256(hmac_key, "USBVault-FailCounter-v1:" || counter_le_bytes(4))
```

**Verify Marker**: Encrypt known plaintext `"USBVAULT_VERIFY_OK_0000"` with MEK encryption key. Decryption confirms correct password without exposing user data.

### Self-Destruct Protocol

- **Trigger**: `fail_count >= 10` (MAX_FAIL_ATTEMPTS)
- **Action**: 3-pass overwrite of `wrapped_mek` field:
  1. Fill with OsRng random bytes
  2. Fill with zeros
  3. Fill with OsRng random bytes
- **Result**: Vault permanently inaccessible; encrypted data records remain but the MEK is destroyed

### Exponential Backoff

- Formula: `min(2^failCount * 1000ms, 3,600,000ms)`
- Maximum delay: 1 hour
- Enforcement: `vaultOrchestrator.ts` blocks unlock attempts during cooldown

### Post-Quantum Cryptography

| Property | Value |
|----------|-------|
| Algorithm | X25519 + ML-KEM-1024 hybrid sealed boxes |
| KEM | ML-KEM-1024 (NIST FIPS 203) |
| Classical | X25519 (Curve25519 ECDH) |
| Combination | HKDF-SHA256 with domain `"hybrid_seal_x25519_mlkem1024"` |
| Security | Secure if EITHER X25519 OR ML-KEM-1024 remains unbroken |
| Feature gate | Rust feature `pqc` (enabled by default) |

Implementation: `usbvault-crypto/src/crypto/pqc.rs`

### Shamir's Secret Sharing

- GF(256) arithmetic with AES irreducible polynomial (0x11B)
- Default: 3-of-5 threshold for MEK recovery
- Coefficients generated uniformly via OsRng (no modular reduction needed)
- Replaces `sharks` crate due to RUSTSEC-2024-0398 (biased coefficient generation)
- Implementation: `usbvault-crypto/src/shamir.rs`

### Constant-Time Operations

All security-critical comparisons use the `subtle` crate (`ConstantTimeEq`) to prevent timing side channels:
- Header HMAC verification
- Fail counter HMAC verification
- Password verification via verify marker
- Recovery code comparison (`crypto/subtle.ConstantTimeCompare` in Go)

---

## 5. Streaming Encryption

### V2 Record Format

```
V2RC(4B) | 0x02(1B) | BASE_NONCE(24B) | [LEN(4B) | AEAD_CHUNK]... | HMAC(32B)
```

### Chunk Processing

- Default chunk size: 65,536 bytes (64 KB)
- Minimum: 4,096 bytes (4 KB)
- Maximum: 67,108,864 bytes (64 MB)
- Maximum theoretical file size: ~256 TiB (2^32 chunks x 64 KiB)

### Per-Chunk Key Derivation

1. Base nonce generated via OsRng (24 bytes)
2. Chunk nonce = `base_nonce XOR (chunk_index as u64 LE at bytes [16..24])`
3. Chunk key = `HKDF-SHA256(master_key, salt=base_nonce, info="stream_chunk_key:" || chunk_nonce)`
4. Each chunk encrypted independently with its derived key and nonce

### Integrity Protection

- Final HMAC-SHA256 covers all preceding record bytes (magic + version + base_nonce + all chunks)
- HMAC key derived via HKDF: `HKDF-SHA256(master_key, salt=none, info="stream_hmac_key")`
- Truncation detection: any modification to the record invalidates the HMAC
- Constant-time HMAC comparison via `subtle::ConstantTimeEq`

### Thread Safety

`StreamingEncryptor` is `!Send + !Sync` by design. Nonce tracking state in an unsynchronized HashSet means sharing across threads could cause nonce reuse. Each thread must create its own encryptor instance.

---

## 6. Key Hierarchy and Wrapped MEK

### V4 Wrapped MEK Architecture

```
Password  -->  Argon2id(password, salt, 64MiB, 3, 4)  -->  KEK (32 bytes)
                                                             |
                                                             v
                                                     XChaCha20-Poly1305
                                                      unwrap(wrapped_mek)
                                                             |
                                                             v
                                                        MEK (64 bytes)
                                                    enc_key[0:32] + hmac_key[32:64]
```

### Wrapped MEK Blob Format

```
nonce(24B) || ciphertext(64B + 16B tag) = 104 bytes total
```

- Generated at vault provisioning time (MEK is random, never changes)
- Password change only re-wraps the MEK with a new KEK (O(1) operation)
- Previous architecture (V2): password change required re-encrypting all data (O(n))

### Per-File Key Derivation

Each file gets a unique encryption key derived from the MEK:
```
file_key = HKDF-SHA256(mek.encryption_key, info="file_encryption:{file_id}")
```

### FIDO2 Key Binding

When FIDO2 is enabled:
```
final_key = enc_key XOR PRF_output
```
The PRF extension on the hardware key provides a second factor that is cryptographically bound to the encryption key.

### Rollback Protection

- `state_version` is a monotonic u64 counter in the V4 header
- Incremented on every commit and self-destruct
- `verify_no_rollback(previous_state_version)` rejects equal or lower values
- Prevents an attacker from reverting the header to a previous state

---

## 7. USB Operations

### Partition Layout

| Partition | Size | Visibility | File System | Contents |
|-----------|------|------------|-------------|----------|
| TOOLS | 500 MB | Visible | ExFAT | Launchers, portable Node.js, companion, static web app |
| SECURE | Remaining | Hidden | ExFAT | VAULT.bin |

Partitioning scheme: GPT + ExFAT

### Platform Tools Matrix

| Operation | macOS | Linux | Windows |
|-----------|-------|-------|---------|
| Detection | `diskutil list -plist external` | `lsblk -J -b` | `PowerShell Get-Disk BusType USB` |
| Partitioning | `diskutil partitionDisk` | `parted + mkfs.exfat` | `Clear-Disk + New-Partition` |
| Mounting | `diskutil mount` | `udisksctl mount` | `Add-PartitionAccessPath` |
| Ejecting | `diskutil eject` | `udisksctl power-off` | 10-step PowerShell protocol |
| Hiding | `chflags hidden` | Partition unmounting | `attrib +H +S` |

### Companion API Reference (19 Endpoints)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/usb/drives` | List connected USB drives |
| GET | `/usb/provision/preflight` | Pre-provision validation |
| POST | `/usb/provision` | Create dual partitions and VAULT.bin |
| POST | `/usb/provision/elevate` | Provision with elevated privileges |
| POST | `/usb/reset` | Reset USB drive to factory state |
| POST | `/usb/mount-secure` | Mount SECURE partition |
| POST | `/usb/unmount-secure` | Unmount SECURE partition |
| POST | `/usb/eject` | Safely eject USB drive |
| POST | `/usb/zero-trace` | Execute zero-trace cleanup |
| POST | `/usb/zero-trace/scan` | Scan for forensic artifacts |
| GET | `/usb/vaults` | List vaults on drive |
| POST | `/usb/vault/init` | Initialize new vault |
| GET | `/usb/vault/container/header` | Read vault header |
| PUT | `/usb/vault/container/header` | Write vault header |
| GET | `/usb/vault/container/bytes` | Read encrypted bytes |
| POST | `/usb/vault/container/append` | Append encrypted record |
| GET | `/usb/vault/container/size` | Get VAULT.bin size |
| GET | `/usb/vault/container/capacity` | Get partition capacity |
| POST | `/usb/vault/container/compact` | Compact vault (remove orphaned data) |

### 50% Capacity Rule

VAULT.bin must never exceed 50% of the SECURE partition capacity. This is enforced before every append operation to ensure adequate space for compaction and index commits.

---

## 8. API Endpoints and Protocols

### Server API Routes (Go, chi/v5)

#### Authentication (`/api/v1/auth`)
| Method | Endpoint | Auth | Rate Limited |
|--------|----------|------|-------------|
| POST | `/srp/init` | No | 10/min |
| POST | `/srp/verify` | No | 10/min |
| POST | `/fido2/challenge` | No | 10/min |
| POST | `/fido2/verify` | No | 10/min |
| POST | `/register` | No | 10/min |
| POST | `/refresh` | No | 10/min |
| POST | `/logout` | No | 10/min |
| POST | `/fido2/manage/register/init` | JWT | 100/min |
| POST | `/fido2/manage/register/verify` | JWT | 100/min |
| GET | `/fido2/manage/credentials` | JWT | 100/min |
| DELETE | `/fido2/manage/credentials` | JWT | 100/min |

#### Vaults (`/api/v1/vaults`)
| Method | Endpoint | Auth | Permission |
|--------|----------|------|-----------|
| POST | `/` | JWT | - |
| GET | `/` | JWT | - |
| GET | `/{vaultID}` | JWT | PermRead |
| PUT | `/{vaultID}` | JWT | PermUpdate |
| DELETE | `/{vaultID}` | JWT | PermDelete |
| POST | `/{vaultID}/key-hierarchy` | JWT | PermUpdate |
| GET | `/{vaultID}/key-hierarchy` | JWT | PermRead |

#### Blobs (`/api/v1/vaults/{vaultID}/blobs`)
| Method | Endpoint | Auth | Permission |
|--------|----------|------|-----------|
| POST | `/upload-url` | JWT | PermUpdate |
| POST | `/download-url` | JWT | PermRead |
| GET | `/` | JWT | PermRead |
| DELETE | `/{blobID}` | JWT | PermDelete |

#### Multipart Upload (`/api/v1/vaults/{vaultID}/files/{fileID}/multipart`)
| Method | Endpoint | Auth | Permission |
|--------|----------|------|-----------|
| POST | `/` | JWT | PermUpdate |
| GET | `/{uploadID}/part/{partNumber}` | JWT | PermUpdate |
| POST | `/{uploadID}/part` | JWT | PermUpdate |
| POST | `/{uploadID}/complete` | JWT | PermUpdate |
| DELETE | `/{uploadID}` | JWT | PermUpdate |
| GET | `/{uploadID}/progress` | JWT | PermUpdate |

#### RBAC Members (`/api/v1/vaults/{vaultID}/members`)
| Method | Endpoint | Auth | Permission |
|--------|----------|------|-----------|
| GET | `/` | JWT | PermRead |
| POST | `/` | JWT | Owner only |
| DELETE | `/{memberUserID}` | JWT | Owner only |
| POST | `/transfer-ownership` | JWT | Owner only |

#### Sharing (`/api/v1/shares`)
| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/` | JWT |
| GET | `/received` | JWT |
| GET | `/sent` | JWT |
| DELETE | `/{shareID}` | JWT |
| GET | `/public-key/{userID}` | JWT |
| POST | `/public-key` | JWT |
| POST | `/{shareID}/accept` | JWT |
| POST | `/{shareID}/reject` | JWT |
| GET | `/fingerprint/{userID}` | JWT |
| POST | `/verify-contact` | JWT |

#### Audit (`/api/v1/audit`)
| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/` | JWT | User's audit log |
| POST | `/verify` | JWT | Verify audit chain integrity |
| GET | `/anomalies` | JWT | Anomaly detection results |
| GET | `/compliance-report` | JWT | Compliance report |
| GET | `/compliance-export` | JWT | Pro tier only (feature-gated) |

#### Billing (`/api/v1/billing`)
| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/webhook` | Stripe signature |
| POST | `/customer` | JWT |
| POST | `/subscribe` | JWT |
| GET | `/subscription` | JWT |
| POST | `/upgrade` | JWT |
| POST | `/downgrade` | JWT |
| POST | `/cancel` | JWT |
| POST | `/reactivate` | JWT |
| POST | `/create-checkout-session` | JWT |
| POST | `/create-portal-session` | JWT |

#### Other Routes
| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/v1/notify/register-device` | JWT | Push notification registration |
| POST | `/api/v1/notify/unregister-device` | JWT | Push notification unregistration |
| POST | `/api/v1/recovery/generate` | JWT | Generate recovery codes |
| POST | `/api/v1/recovery/verify` | JWT | Verify recovery code |
| GET | `/api/v1/recovery/remaining` | JWT | Get remaining recovery codes |
| DELETE | `/api/v1/user/account` | JWT | Delete user account |
| HANDLE | `/api/v1/sync/ws` | WebSocket JWT | Multi-device sync |
| GET | `/api/v1/sync/health` | None | WebSocket health check |
| POST | `/api/v1/admin/rotate-jwt-keys` | JWT + Admin | JWT key rotation |
| POST | `/api/v1/admin/backups` | JWT + Admin | Create database backup |
| GET | `/api/v1/admin/backups` | JWT + Admin | List backups |
| POST | `/api/v1/admin/backups/{backupID}/restore` | JWT + Admin | Restore backup |

#### Infrastructure Endpoints (No Auth)
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Deep health check (DB + Redis + S3 + circuit breakers) |
| GET | `/ready` | Kubernetes readiness probe |
| GET | `/metrics` | Prometheus metrics |
| GET | `/metrics/pool` | Connection pool statistics |

### Authentication Protocol: SRP-6a

1. Client hashes email with SHA-256
2. Client sends `POST /auth/srp/init` with email
3. Server returns SRP salt, server ephemeral B, and session ID
4. Client computes SRP proof M1 = H(A, B, K) using Argon2id-derived x
5. Client sends `POST /auth/srp/verify` with session ID, A, M1
6. Server verifies M1, returns M2 + JWT tokens
7. Client verifies M2 for mutual authentication (MITM detection)
8. Password never leaves the client device

### WebSocket Sync Protocol

- Endpoint: `/api/v1/sync/ws`
- Authentication: JWT via WebSocket subprotocol, query parameter, or Authorization header
- Protocol: CRDT-based conflict resolution for multi-device sync
- Connection management with automatic reconnection

---

## 9. Security Modules

### Defense-in-Depth Layers

| Layer | Name | Status | Description |
|-------|------|--------|-------------|
| L1 | Steganographic Delivery | PLANNED (V4.0) | Hide VAULT.bin inside carrier files |
| L2 | Hardware Key (FIDO2) | COMPLETE | PRF/hmac-secret, XOR with Argon2id key |
| L3 | Cloud Split-Key | PLANNED (V3.0) | HKDF(LOCAL \|\| REMOTE) = MASTER_KEY |
| L4 | XChaCha20-Poly1305 AEAD | COMPLETE | Per-chunk authenticated encryption |
| L5 | Argon2id KDF (64 MiB) | COMPLETE | Memory-hard key derivation |
| L6 | Memory Protection | COMPLETE | mlock + guard pages + Zeroize |
| L7 | Hidden Partition | COMPLETE | SECURE unmounted after provisioning |
| L8 | Hidden File Attributes | COMPLETE | chflags/attrib on VAULT.bin |
| L9 | Encrypted Filenames | COMPLETE | Filenames in AEAD metadata chunks |
| L10 | Zero-Trace Cleanup | COMPLETE | 23 cleaners, auto-clean on eject |
| L11 | App Password + Lockout | COMPLETE | PBKDF2-SHA256, 150K iterations |
| L12 | Crash-Safe Dual-Index | COMPLETE | Append-only, commit counter, fsync |

### Memory Security

- **Zeroize**: All key material in `Zeroizing<T>` wrappers (zeroed on drop)
- **mlock**: Platform-specific memory locking (Linux: `mlock`, macOS: `mlock`, Windows: `VirtualLock`)
- **Guard Pages**: `GuardedBuffer` allocates `PROT_NONE` pages before and after data region; buffer overflow triggers SIGSEGV
- **No Key Persistence**: Master key held only in memory; never written to disk/localStorage

### Boot Hardening (6 Stages)

1. Anti-Debug (device integrity check)
2. Integrity (CSP/code signature validation)
3. Memory Lock (WebCrypto initialization)
4. Brute-Force (fail state restoration)
5. Self-Destruct (arm callbacks)
6. Ghost Mode (re-activate privacy protections)

### Zero-Trace Coverage

**Windows (user-level)**: Recent Items (.lnk), Jump Lists, Thumbnail Cache, Shellbags (Registry), Registry MRU, Search Index, Recycle Bin, USB Volume Metadata, Session Files, Temp Artifacts

**Windows (admin-only)**: Prefetch, Event Logs

**macOS**: .DS_Store, QuickLook cache, USB metadata (.Trashes, .fseventsd, Spotlight), Recent Documents (TCC-aware), Spotlight re-index, Session files

**Linux**: recently-used.xbel, Zeitgeist DB, Thumbnail cache, USB Trash dirs, Temp files, GNOME Tracker cache

---

## 10. Password Policy

### Vault Master Password

| Property | Value |
|----------|-------|
| Minimum length | 15 characters |
| Scoring | Entropy-based + OWASP diversity + contextual penalties |
| Weak dictionary | 98,735 entries via SHA-256 bloom filter (k=10, FPR ~0.1%) |
| HIBP integration | k-anonymity API with bloom filter fallback |

### App Password (Secondary Gate)

| Property | Value |
|----------|-------|
| Minimum length | 12 characters |
| KDF | PBKDF2-SHA256 |
| Iterations | 150,000 |
| Max attempts | 3 |
| Lockout | 30 seconds |

---

## 11. Error Codes

### Rust FFI Error Codes

| Code | Name | Description |
|------|------|-------------|
| 0 | ERR_SUCCESS | Operation completed successfully |
| -1 | ERR_INVALID_KEY | Invalid encryption key |
| -2 | ERR_INVALID_NONCE | Invalid nonce or nonce reuse detected |
| -3 | ERR_DECRYPTION_FAILED | AEAD decryption failed |
| -4 | ERR_INVALID_HEADER | Malformed vault header |
| -5 | ERR_INVALID_MAGIC | Unrecognized magic bytes |
| -6 | ERR_INVALID_VERSION | Unsupported vault version |
| -7 | ERR_CORRUPTED_CHUNK | Streaming chunk integrity failure |
| -8 | ERR_CORRUPTED_INDEX | Vault index integrity failure |
| -9 | ERR_KEY_DERIVATION_FAILED | Argon2id/HKDF derivation error |
| -10 | ERR_SHARING_ERROR | Shamir or key exchange error |
| -11 | ERR_SERIALIZATION_ERROR | JSON/binary serialization error |
| -12 | ERR_IO_ERROR | I/O error |
| -13 | ERR_MEMORY_ERROR | mlock/guard page allocation failure |
| -14 | ERR_INVALID_CIPHER | Unknown cipher ID |
| -15 | ERR_BUFFER_TOO_SMALL | Output buffer insufficient |
| -16 | ERR_INVALID_ARGUMENT | Invalid function argument |
| -17 | ERR_PASSWORD_WRONG | Password verification failed |
| -18 | ERR_FAIL_COUNTER_TAMPERED | Fail counter HMAC mismatch |
| -19 | ERR_FAIL_COUNTER_EXCEEDED | Max fail attempts reached |
| -20 | ERR_ROLLBACK_DETECTED | State version rollback detected |

### Application Error Domains

- Vault: `WRONG_PASSWORD`, `TFA_FAILED`, `LOCKED_OUT`, `SELF_DESTRUCTED`, `BAD_MAGIC`, `BAD_HMAC`, `BAD_INDEX`, `CHUNK_AUTH_FAIL`, `ROLLBACK_DETECTED`, `DISK_FULL`
- USB: `NO_USB`, `EJECT_FAILED`, `PROVISION_FAILED`, `MOUNT_FAILED`, `ADMIN_REQUIRED`, `ADMIN_AUTH_FAILED`

---

## 12. Build System

### Rust Build Configuration

```toml
[profile.release]
opt-level = 3
lto = true
strip = true
panic = "abort"
```

Key dependencies: `chacha20poly1305 0.10`, `aes-gcm-siv 0.11`, `argon2 0.5`, `x25519-dalek 2`, `ml-kem 0.2` (feature-gated), `zeroize 1`

Build dependency: `cbindgen 0.26` (generates C headers for FFI)

### Go Build

Multi-stage Docker build (Alpine):
1. Builder stage: `golang:1.23-alpine`, CGO_ENABLED=1, `-ldflags="-w -s"`
2. Runtime stage: `alpine:3.19`, non-root user (uid 1001), read-only root filesystem

### TypeScript Build

- Framework: Expo 54
- Bundler: Metro
- Engine: Hermes
- Export: `expo export --platform web`
- USB standalone: `EXPO_PUBLIC_USB_STANDALONE=true expo export --platform web --output-dir ../usb-companion/static`

### Kubernetes Deployment

- 3 replicas with rolling update strategy (maxSurge: 1, maxUnavailable: 0)
- Pod anti-affinity for high availability
- Init container runs migrations before API starts
- Security context: `runAsNonRoot`, `readOnlyRootFilesystem`, all capabilities dropped, seccomp RuntimeDefault
- Resource limits: 1000m CPU, 512Mi memory per pod

### CI/CD (GitHub Actions)

- `ci.yml`: Lint, test, build across all 3 subsystems
- `release.yml`: Build and publish Docker images
- `security.yml`: Run SAST/DAST scans

---

## 13. Testing

### Rust (234 Tests)

| Suite | Count |
|-------|-------|
| Unit tests (lib) | 77 |
| Format compatibility tests | 28 |
| Integration tests | 40 |
| Property-based fuzzing (proptest) | 19 |
| Sharing tests | 32 |
| SRP protocol tests | 23 |
| Vault lifecycle tests | 15 |

### TypeScript (45 Test Files)

- Framework: Jest + Playwright
- Component tests: separate config (`jest.config.components.js`)
- E2E tests: Playwright + Maestro
- Coverage threshold: 70%

### Go (61 Test Files)

Coverage areas: auth, billing, sharing, sync, middleware, BOLA, config, error tracking, metrics, notify, recovery, security, tracing, WebSocket

### Security Audit Tooling

- `cargo audit`: No known vulnerabilities in Rust dependencies
- `govulncheck`: No known vulnerabilities in Go dependencies
- `npm audit`: No known vulnerabilities in Node.js dependencies

---

## 14. Performance Characteristics

| Operation | Expected Duration | Notes |
|-----------|------------------|-------|
| Argon2id key derivation | 500ms -- 2s | Depends on hardware; 64 MiB memory |
| AES-256-GCM-SIV encrypt (1 MB) | < 5ms | Hardware AES-NI acceleration |
| XChaCha20-Poly1305 encrypt (1 MB) | < 5ms | Software; constant-time |
| Streaming encrypt (100 MB) | < 500ms | 64 KB chunks, per-chunk HKDF |
| Vault header read/write | < 1ms | 24 KiB sequential I/O |
| MEK wrap/unwrap | < 1ms | XChaCha20-Poly1305 on 64 bytes |
| HMAC-SHA256 computation | < 0.1ms | Header and fail counter |
| S3 presigned URL generation | < 50ms | Network-dependent |
| WebSocket sync message | < 10ms | Redis pub/sub |

### Server Configuration

- Default connection pool: 5-30 connections (configurable via `DB_MAX_CONNECTIONS`, `DB_MIN_CONNECTIONS`)
- Connection lifetime: 30 minutes max, 5 minutes idle
- Request timeouts: 15s read, 15s write, 60s idle (all configurable)
- Rate limits: 100/min per IP, 1000/min per user, 10/min auth endpoints
- Graceful shutdown: 30-second timeout

---

## 15. Constants Reference

| Constant | Value | Source |
|----------|-------|--------|
| `HEADER_SIZE_V4` | 24,576 bytes | `vault/header.rs` |
| `HEADER_SIZE_V3` | 16,384 bytes | `vault/header.rs` |
| `HEADER_SIZE_V2` | 4,096 bytes | `vault/header.rs` |
| `MAGIC_V4` | `"USBVLT04"` | `vault/header.rs` |
| `MAGIC_V3` | `"USBVLT03"` | `vault/header.rs` |
| `MAGIC_V2` | `"USBVLT02"` | `vault/header.rs` |
| `CHUNK_SIZE` | 65,536 bytes | `streaming.rs` |
| `MIN_CHUNK_SIZE` | 4,096 bytes | `streaming.rs` |
| `MAX_CHUNK_SIZE` | 67,108,864 bytes | `streaming.rs` |
| `REC_MAGIC_CHUNKED` | `"V2RC"` | `streaming.rs` |
| `ARGON2_MEMORY_KIB` | 65,536 | `kdf.rs` |
| `ARGON2_TIME_COST` | 3 | `kdf.rs` |
| `ARGON2_PARALLELISM` | 4 | `kdf.rs` |
| `MAX_FAIL_ATTEMPTS` | 10 | `vault/header.rs` |
| `WRAPPED_MEK_SIZE` | 104 bytes | `kdf.rs` |
| `SELF_DESTRUCT_PASSES` | 3 | `vault/header.rs` |
| `FAIL_COUNTER_HMAC_DOMAIN` | `"USBVault-FailCounter-v1:"` | `vault/header.rs` |
| `VAULT_SIZE_LIMIT_PERCENT` | 0.50 | App enforcement |
| `MAX_BACKOFF_MS` | 3,600,000 | App enforcement |
| `PASSWORD_MIN_LENGTH` | 15 | `passwordPolicy.ts` |
| `APP_PASSWORD_MIN_LENGTH` | 12 | `appPasswordService.ts` |
| `APP_PASSWORD_PBKDF2_ITERS` | 150,000 | `appPasswordService.ts` |
| `BLOOM_ENTRIES` | 98,735 | `weakPasswordBloom.ts` |
| `BLOOM_K` | 10 | `weakPasswordBloom.ts` |
| `COMPANION_PORT` | 3,001 | `usb-companion` |
| `TOOLS_PARTITION_MB` | 500 | `usb-companion` |
| `DEFAULT_THRESHOLD` (Shamir) | 3 | `shamir.rs` |
| `DEFAULT_TOTAL_SHARES` (Shamir) | 5 | `shamir.rs` |

---

## 16. Data Flow Diagrams

### File Encryption Flow

```
User selects file
       |
       v
[vaultOrchestrator.ts] reads file bytes
       |
       v
[crypto/bridge.ts] calls Rust FFI: usbvault_derive_key()
       |                               |
       |                               v
       |                     Argon2id(password, salt) -> MEK
       |                               |
       v                               v
[crypto/bridge.ts] calls Rust FFI: StreamingEncryptor::encrypt_record()
       |
       v
V2RC record: magic + base_nonce + [chunks] + HMAC
       |
       v
[companion API] POST /usb/vault/container/append
       |
       v
VAULT.bin: header + existing_records + NEW_RECORD
       |
       v
[companion API] PUT /usb/vault/container/header
       |
       v
Dual-index commit: update inactive slot -> flip active -> increment counter -> fsync
```

### File Decryption Flow

```
User selects encrypted file
       |
       v
[vaultOrchestrator.ts] reads index -> finds record offset/length
       |
       v
[companion API] GET /usb/vault/container/bytes?offset=X&length=Y
       |
       v
[crypto/bridge.ts] calls Rust FFI: StreamingDecryptor::decrypt_record()
       |
       v
Verify HMAC -> decrypt metadata chunk -> decrypt data chunks
       |
       v
Plaintext file returned to user (temp view or download)
```

### Vault Unlock Flow

```
User enters password
       |
       v
Check exponential backoff timer
       |
       v
[Rust FFI] derive_kek(password, header.salt) -> KEK
       |
       v
[Rust FFI] unwrap_mek(KEK, header.wrapped_mek) -> MEK
       |
       v
[Rust FFI] decrypt verify marker with MEK.enc_key
       |
       v
Compare plaintext to "USBVAULT_VERIFY_OK_0000"
       |
       +-- FAIL --> increment fail_counter, recompute HMAC
       |            if fail_count >= 10: self_destruct()
       |
       +-- OK --> verify header HMAC with MEK.hmac_key
                  |
                  v
            If FIDO2 enabled: final_key = enc_key XOR PRF_output
                  |
                  v
            Read fail counter, reset to 0
                  |
                  v
            Vault unlocked. MEK halves held in memory.
```

---

## Appendix A: V2-to-V4 Header Field Mapping

| V2 Field | V2 Offset | V4 Equivalent | Notes |
|----------|-----------|---------------|-------|
| Magic (8B) | 0 | Magic | Changed to `USBVLT04` |
| Version (2B) | 8 | Embedded in magic | Magic bytes encode version |
| Header size (2B) | 10 | Implicit | 24,576 (constant) |
| Iterations legacy (4B) | 12 | Removed | Unused; dropped |
| KDF Hash ID (1B) | 16 | KDF Hash ID | Offset 8 |
| Cipher ID (1B) | 17 | Cipher ID | Offset 9 |
| Salt (32B) | 20 | Salt | Offset 10 |
| Verify IV (16B) | 52 | Verify IV (24B) | Expanded for XChaCha20 |
| Verify CT (64B) | 68 | Verify CT (var) | Length-prefixed |
| Header HMAC (32B) | 132 | Header HMAC | After verify CT |
| Active index slot (1B) | 164 | Active index slot | After HMAC |
| Index 1 offset (8B) | 172 | Index 1 offset (4B) | Narrowed to u32 |
| Index 1 length (8B) | 180 | Index 1 length (4B) | Narrowed to u32 |
| Index 2 offset (8B) | 188 | Index 2 offset (4B) | Narrowed to u32 |
| Index 2 length (8B) | 196 | Index 2 length (4B) | Narrowed to u32 |
| Commit counter (8B) | 204 | Commit counter | After index 2 length |
| Argon2 memory (4B) | 212 | Argon2 memory | After commit counter |
| Argon2 time (4B) | 216 | Argon2 time | After argon2 memory |
| Argon2 parallelism (4B) | 220 | Argon2 parallelism (1B) | Narrowed to u8 |
| Identity block (544B) | 224 | Identity block | Length-prefixed variable |
| TFA fields (638B) | 768 | TFA block | Length-prefixed variable |
| Fail counter (304B) | 1408 | Fail counter block | Length-prefixed variable |
| Email config (256B) | 1456 | Removed | Server-side in Enterprise |
| N/A | - | Wrapped MEK | NEW: V4 field |
| N/A | - | State version | NEW: V4 rollback protection |
| N/A | - | Index encrypted | NEW: V4 field |

---

## Appendix B: Architecture Decision Records

| ID | Title | Decision |
|----|-------|----------|
| ADR-001 | Backend language | Go (not Python/Django) |
| ADR-002 | Crypto core language | Rust (not Python/Cython) |
| ADR-003 | Frontend framework | Expo/React Native (not Qt/PySide6) |
| ADR-004 | Primary database | PostgreSQL |
| ADR-005 | Default AEAD cipher | XChaCha20-Poly1305 |
| ADR-006 | Architecture principle | Zero-knowledge |
| ADR-007 | Session/rate-limit store | Redis |
| ADR-008 | Blob storage | S3 |
| ADR-009 | Post-quantum KEM | ML-KEM-1024 |
| ADR-010 | State management | Zustand |
| ADR-011 | PQC header format | Hybrid vs V3 fixed header block |
| ADR-012 | Reactive stores | Zustand vs Qt signals |
| ADR-013 | FFI approach | Rust FFI vs Cython compilation |
| ADR-014 | Integrity verification | Build pipeline vs Ed25519 manifest signing |

---

## Appendix C: Threat Model

| Threat | Category | Mitigation |
|--------|----------|------------|
| Brute-force password attack | Authentication | Argon2id (64 MiB, GPU-resistant) + exponential backoff + self-destruct at 10 attempts |
| Header tampering | Integrity | HMAC-SHA256 over all header fields, constant-time comparison |
| Nonce reuse | Cryptographic | HashSet tracking in StreamingEncryptor; OsRng for all nonce generation |
| Memory dump / cold boot | Key extraction | mlock prevents swapping; Zeroize on drop; GuardedBuffer with PROT_NONE guard pages |
| Quantum computing | Key exchange | ML-KEM-1024 + X25519 hybrid (secure if either remains unbroken) |
| Index corruption | Data loss | Dual-index atomic commits; crash recovery via backup slot and commit counter |
| Weak password | Authentication | 15-char minimum; entropy scoring; 98,735-entry bloom filter; HIBP k-anonymity |
| Rollback attack | Integrity | Monotonic state_version counter; `verify_no_rollback()` rejects non-increasing values |
| Fail counter manipulation | Authentication | Domain-separated HMAC on fail counter; tampering detected |
| Forensic artifact recovery | Privacy | 23 zero-trace cleaners across 3 platforms; auto-clean on eject |
| Man-in-the-middle | Authentication | SRP-6a mutual authentication (M2 verification); TLS 1.3 minimum; certificate pinning |
| Vault file substitution | Integrity | AEAD authentication on every chunk; HMAC on full streaming record |
| Side-channel timing | Cryptographic | All comparisons via `subtle::ConstantTimeEq` / `crypto/subtle.ConstantTimeCompare` |

---

## Cross-References

- **DOC-002**: Architecture and System Design
- **DOC-004**: IT Deployment Guide (environment variables, K8s configuration)
- **DOC-006**: Security Audit Package (detailed threat model, audit results)
- **DOC-007**: Recovery Procedures (Shamir secret sharing, dual-index recovery)
