# USBVault Enterprise — Complete Gap Analysis & Implementation Reference

> **Date:** 2026-03-14
> **Purpose:** Definitive reference for all lost, missing, and planned features.
> Claude must consult this document before implementing any security or vault feature.
> **Source:** Every .md, .txt, .docx, .pdf, and .json in `Original_App/` and `Original_App/V2_0_Updated Documentation/`

---

## TABLE OF CONTENTS

1. [CRITICAL ARCHITECTURE PROBLEM](#1-critical-architecture-problem)
2. [VAULT FORMAT & BINARY STRUCTURE](#2-vault-format--binary-structure)
3. [LOST FEATURES — SECURITY HARDENING](#3-lost-features--security-hardening)
4. [LOST FEATURES — VAULT OPERATIONS](#4-lost-features--vault-operations)
5. [LOST FEATURES — AUTHENTICATION & KEY MANAGEMENT](#5-lost-features--authentication--key-management)
6. [LOST FEATURES — ANTI-FORENSICS & GHOST MODE](#6-lost-features--anti-forensics--ghost-mode)
7. [LOST FEATURES — USB MANAGEMENT](#7-lost-features--usb-management)
8. [LOST FEATURES — EDUCATIONAL & UTILITY](#8-lost-features--educational--utility)
9. [PLANNED FEATURES NEVER IMPLEMENTED](#9-planned-features-never-implemented)
10. [GUI-SPECIFIC GAPS](#10-gui-specific-gaps)
11. [COMPLIANCE & STANDARDS GAPS](#11-compliance--standards-gaps)
12. [IMPLEMENTATION PRIORITY MATRIX](#12-implementation-priority-matrix)
13. [SECURITY INVARIANTS](#13-security-invariants)

---

## 1. CRITICAL ARCHITECTURE PROBLEM

### The Core Issue

The Original App stored ALL data inside a single encrypted binary file (`VAULT.bin`) with an encrypted header. The Enterprise GUI stores data as:
- **Plain-text JSON** in `localStorage` (file metadata, vault index, settings)
- **Individual encrypted blobs** per file (not encapsulated)
- **No binary vault container** — no VAULT.bin equivalent exists

This means:
- File names, sizes, types, timestamps are **visible in browser DevTools**
- Vault metadata is stored in **cleartext localStorage** accessible to any script
- There is **no single encrypted container** that can be transported on USB
- The dual-index crash-safe atomic commit system **does not exist**
- The 4096-byte encrypted header with embedded identity, 2FA, fail counter **does not exist**

### What the Original Had (VAULT.bin)

```
VAULT.bin (single encrypted binary file)
├── HEADER (4096 bytes, V2) or (16384 bytes, V3 PQC)
│   ├── MAGIC: "USBVLT02" or "USBVLT03"
│   ├── SALT (32 bytes random)
│   ├── KDF_HASH_ID (2=Argon2id)
│   ├── CIPHER_ID (2=XChaCha20-Poly1305 or 3=AES-256-GCM-SIV)
│   ├── VERIFY_MARKER (encrypted known-plaintext for password verification)
│   ├── HEADER_HMAC (HMAC-SHA256 over header, excludes mutable regions)
│   ├── DUAL_INDEX_POINTERS (slot 1 and slot 2 offsets+lengths)
│   ├── COMMIT_COUNTER (uint64, monotonic)
│   ├── IDENTITY_BLOCK (544B: vault_id UUID, name, created, description)
│   ├── TFA_BLOCK (638B: up to 4 FIDO2 credentials, recovery blob)
│   ├── FAIL_COUNTER_BLOCK (304B: count + timestamp + HMAC + email config)
│   └── PQC_BLOCK (V3 only: ML-KEM-1024 pubkey, ciphertext, ML-DSA-87 sig)
│
├── INDEX_SNAPSHOT_1 (encrypted JSON: {filename → record_offset})
│
├── RECORD_1 (V2RC chunked AEAD)
│   ├── MAGIC "V2RC" (4B)
│   ├── PAYLOAD_LENGTH (uint64 BE, 8B)
│   ├── BASE_NONCE (24B random, unique per record)
│   ├── CHUNK_COUNT (uint32, 4B)
│   ├── META_CHUNK (record_type + encrypted_filename + file_size, AEAD)
│   └── DATA_CHUNKS 1..N (64KB each, per-chunk Poly1305 auth tag)
│
├── INDEX_SNAPSHOT_2 (updated after Record 1)
├── RECORD_2..N
└── LATEST_INDEX
```

### What the GUI Has Now

```
localStorage (browser cleartext)
├── "usbvault-vaults" → JSON array of vault metadata (CLEARTEXT)
├── "usbvault-files" → JSON array of file records (CLEARTEXT names, sizes, types)
├── "usbvault-settings" → JSON settings (CLEARTEXT)
├── "usbvault-session" → session token (CLEARTEXT)
└── "usbvault-audit" → audit log entries (CLEARTEXT)

Individual encrypted blobs (in memory or via USB companion)
├── file1.vault (encrypted data only, no container)
├── file2.vault
└── ...
```

### What Must Be Built

The Enterprise GUI needs a **client-side VAULT.bin equivalent** that:
1. Stores ALL metadata (file index, vault identity, settings) **inside the encrypted container**
2. Uses the same header format (or compatible V3 format) as the Original
3. Implements dual-index atomic commits for crash safety
4. Embeds fail counter, 2FA data, and PQC keys in the header
5. Stores on the USB drive's SECURE partition (not in browser localStorage)
6. Never exposes file names, sizes, or types in cleartext

---

## 2. VAULT FORMAT & BINARY STRUCTURE

### V2 Header Layout (4096 bytes — USBVLT02)

| Offset | Size | Field | Purpose |
|--------|------|-------|---------|
| 0-7 | 8 | MAGIC | "USBVLT02" format identifier |
| 8-9 | 2 | VERSION | 0x0002 |
| 10-11 | 2 | HEADER_SIZE | 4096 |
| 12 | 1 | KDF_HASH_ID | 2=Argon2id (only supported) |
| 13 | 1 | CIPHER_ID | 2=XChaCha20-Poly1305 or 3=AES-256-GCM-SIV |
| 14-17 | 4 | RESERVED | Legacy PBKDF2 iterations (unused) |
| 18-49 | 32 | VAULT_SALT | Random salt for Argon2id |
| 50-65 | 16 | VERIFY_IV | Nonce for verify marker |
| 66-129 | 64 | VERIFY_CIPHERTEXT | Encrypted "VERIFY_OK_000000" + padding |
| 130-131 | 2 | RESERVED | Alignment |
| 132-163 | 32 | HEADER_HMAC | HMAC-SHA256(hmac_key, header[0:132]+header[164:4096]) |
| 164 | 1 | ACTIVE_INDEX_SLOT | 1 or 2 (which index is current) |
| 165-171 | 7 | RESERVED | Alignment |
| 172-179 | 8 | INDEX1_OFFSET | Byte offset of index snapshot 1 |
| 180-187 | 8 | INDEX1_LENGTH | Length of index snapshot 1 |
| 188-195 | 8 | INDEX2_OFFSET | Byte offset of index snapshot 2 |
| 196-203 | 8 | INDEX2_LENGTH | Length of index snapshot 2 |
| 204-211 | 8 | COMMIT_COUNTER | Monotonic counter (uint64 BE) |
| 212-223 | 12 | RESERVED | Alignment |
| 224-767 | 544 | IDENTITY_BLOCK | JSON: vault_id, name, created, description |
| 768-1405 | 638 | TFA_BLOCK | FIDO2 credentials (up to 4), recovery blob |
| 1406-1407 | 2 | RESERVED | Alignment |
| 1408-1411 | 4 | FAIL_COUNT | uint32 BE attempt counter |
| 1412-1419 | 8 | FAIL_TIMESTAMP | uint64 BE Unix epoch of last failure |
| 1420-1451 | 32 | FAIL_HMAC | HMAC-SHA256 over fail_count+timestamp |
| 1452-1711 | 260 | EMAIL_CONFIG | AES-GCM-SIV encrypted SMTP credentials |
| 1712-4095 | 2384 | RESERVED | Zero-padded for future expansion |

### V3 Header Extension (16384 bytes — USBVLT03)

| Offset | Size | Field | Purpose |
|--------|------|-------|---------|
| 0-2047 | 2048 | V2_COMPAT | Same as V2 header (first 2048 bytes) |
| 2048 | 1 | PQC_METHOD | 0=none, 1=ML-KEM-1024 |
| 2049 | 1 | PQC_SIG_METHOD | 0=none, 1=ML-DSA-87 |
| 2050-2051 | 2 | RESERVED | Alignment |
| 2052-3619 | 1568 | ML_KEM_PUBLIC_KEY | ML-KEM-1024 public key (FIPS 203) |
| 3620-5187 | 1568 | ML_KEM_CIPHERTEXT | ML-KEM-1024 ciphertext |
| 5188-7779 | 2592 | ML_DSA_PUBLIC_KEY | ML-DSA-87 verification key (FIPS 204) |
| 7780-8179 | ~400 | ML_DSA_SIGNATURE | Signature over V3 header |
| 8180-16383 | ~8200 | RESERVED | Future PQC expansion |

### V2RC Record Format (Chunked AEAD)

```
[MAGIC "V2RC" (4B)]
[PAYLOAD_LENGTH (uint64 BE, 8B)]
[BASE_NONCE (24B for XChaCha20, 12B for AES-GCM-SIV)]
[CHUNK_COUNT (uint32 BE, 4B)]
[META_CHUNK: AEAD(record_type + encrypted_filename + original_size)]
[DATA_CHUNK_0: AEAD(64KB plaintext) → ciphertext + 16B Poly1305 tag]
[DATA_CHUNK_1: AEAD(64KB plaintext) → ciphertext + 16B Poly1305 tag]
...
[DATA_CHUNK_N: AEAD(≤64KB plaintext) → ciphertext + 16B Poly1305 tag]
```

**Chunk nonce derivation:** `chunk_nonce = base_nonce[:16] + (base_nonce[16:24] XOR chunk_index_le8)`

### Key Derivation

```
Password (UTF-8 bytearray) + optional hw_secret (32B from FIDO2)
    ↓
Argon2id(memory=64MiB, iterations=3, parallelism=4, salt=32B)
    ↓
64 bytes output → enc_key (bytes[0:32]) + hmac_key (bytes[32:64])
```

### USB Partition Scheme

```
USB Drive (GPT)
├── Partition 1: TOOLS (256-500 MB, exFAT, visible)
│   ├── Windows/USBVault_Win.exe
│   ├── macOS/USBVault_Mac
│   ├── Linux/USBVault_Lin + .desktop launcher
│   ├── README.txt
│   └── RECOVERY_GUIDE.txt
│
└── Partition 2: SECURE (remaining space, exFAT, HIDDEN)
    ├── VAULT.bin (primary vault)
    ├── vault_projectx/VAULT.bin (multi-vault subdirectory)
    ├── vault_personal/VAULT.bin (multi-vault subdirectory)
    └── .vault_applock (app-level password hash)
```

**Hiding mechanisms:**
- Windows: GPT hidden attribute via diskpart, no drive letter assigned
- macOS: Partition unmounted after setup, not visible in Finder
- Linux: Partition unmounted, invisible to file managers

---

## 3. LOST FEATURES — SECURITY HARDENING

### 3.1 Self-Destruct Engine
**Original:** `vault_self_destruct.py` — 3-pass cryptographic random overwrite of 4096-byte header, fsync after each pass, post-destruction verification confirms MAGIC obliterated. Irreversible.
**GUI:** Settings checkbox labeled "self-destruct" but **no actual implementation**. No header to overwrite, no 3-pass wipe, no verification.
**Required:** Must implement actual vault destruction that overwrites the vault header on USB, making encrypted data permanently inaccessible.

### 3.2 Anti-Debug / Anti-Tamper Gate
**Original:** `vault_anti_debug.py` — 6 detection categories:
1. `sys.gettrace()` / `sys.getprofile()` (Python tracers)
2. `LD_PRELOAD` / `DYLD_INSERT_LIBRARIES` / `DYLD_FORCE_FLAT_NAMESPACE` detection
3. macOS `P_TRACED` flag via `sysctl`
4. Linux `/proc/self/status` `TracerPid` check
5. Windows `IsDebuggerPresent()` + `CheckRemoteDebuggerPresent()`
6. 25+ known debugger process names (gdb, lldb, ida, radare2, frida, strace, etc.)
**GUI:** Does not exist. No runtime tamper detection.
**Required:** Native module (Rust FFI) for anti-debug on iOS/Android/desktop. Web has limited options (detect DevTools timing).

### 3.3 Binary Integrity Verification
**Original:** `vault_integrity.py` — Ed25519-signed SHA-256 manifest of all bundled files. 3 embedded public keys (CURRENT, NEXT for rotation, ROOT for emergency). Fail-closed: verification error = refuse to run.
**GUI:** Does not exist. No self-verification.
**Required:** App bundle integrity check at startup. On native: verify all .so/.framework files. On web: subresource integrity (SRI) for loaded scripts.

### 3.4 Security Boot Gate Sequence
**Original:** `vault_hardening.py` — 6-stage sequential boot gate:
```
BOOT(0) → ENV_SANITIZED(1) → PATH_LOCKED(2) → INTEGRITY_OK(3) → DEBUG_OK(4) → READY(5)
```
Environment sanitization clears 13 dangerous env vars. sys.path lockdown removes CWD and filters to safe paths. No crypto permitted until READY. Backward advancement = tamper detection.
**GUI:** Does not exist. App loads crypto immediately with no security gates.
**Required:** Implement startup security gate in the native app layer (Rust init function called before any JS bridge operations).

### 3.5 Memory Locking (mlock/mlockall)
**Original:** `vault_mlock.py` (~560 lines):
- `mlock_buffer()` — Lock bytearray in physical RAM (prevent swap)
- `munlock_buffer()` — Unlock memory
- `lock_process_memory()` — mlockall() all process memory
- `secure_alloc()` — Allocate locked bytearray
- `secure_free()` — Zero and unlock bytearray
- `secure_free_multi_pass()` — 3-pass random overwrite then unlock
- `scrub_gc_sensitive_objects()` — Zero Python GC objects
- `check_swap_status()` — Warn if swap enabled
- Multi-pass zeroing: random → zeros → random with read-back verification
**GUI:** Does not exist. JavaScript/TypeScript cannot lock memory. Rust FFI could, but doesn't.
**Required:** Implement in the Rust crypto module (`usbvault-crypto`). All key material must be allocated via `mlock()`-backed buffers in Rust. JS side must never hold raw keys longer than a single function call.

### 3.6 Brute-Force Fail Counter (Persistent, HMAC-Protected)
**Original:** `vault_brute_force.py` — Persistent counter at header offset 1408:
- 4-byte count + 8-byte timestamp + 32-byte HMAC
- HMAC key derived from salt WITHOUT password: `HMAC-SHA256(header_salt, b"USBVault-FailCounter-v1")`
- Tamper detection: modified bytes → immediate lockout
- Escalation: normal(1-3) → warning(4) → critical(5) → self-destruct(6)
- Configurable: MAX_FAIL=3-20 (default 6), WARN_THRESHOLD (default 4)
- Survives reboots (persisted in vault header on disk)
**GUI:** `rateLimiter.ts` uses localStorage. Counter resets on localStorage clear. No HMAC protection. No tamper detection. No persistent on-disk counter.
**Required:** Fail counter must be embedded in the vault header on USB, HMAC-protected, and survive any browser/app reset.

### 3.7 Email Alert System
**Original:** `vault_alert.py`:
- AES-GCM-SIV encrypted SMTP credentials stored in header at offset 1452
- Alert types: WARNING (N-2 attempts), CRITICAL (1 remaining), DESTROYED
- TLS 1.3 mandatory, 10-second timeout, non-blocking
- Interactive setup with connection testing
**GUI:** Does not exist. No SMTP integration.
**Required:** Backend service (Go server) should handle email sending. Client sends alert request to server, server dispatches via configured SMTP.

### 3.8 String Obfuscation
**Original:** `vault_string_shield.py` + `tools/obfuscate_strings.py`:
- Build-time XOR encryption of 20+ sensitive constants (32-byte random key per build)
- Protected strings: MAGIC bytes, VERIFY_PREFIX, index/record magic, FIDO2 identifiers, Ed25519 keys
- Runtime decryption on-demand with cache
**GUI:** Does not exist. All constants are plaintext in JavaScript bundle.
**Required:** Sensitive constants should be stored in the Rust native module, not in JS. The JS bundle should never contain raw magic bytes, crypto parameters, or key identifiers.

### 3.9 Cython/Native Compilation of Security Modules
**Original:** 14 security-critical Python modules compiled to native `.so`/`.pyd` via Cython:
vault_crypto, vault_core, vault_streaming, vault_mlock, vault_integrity, vault_hardening, weak_passwords, password_policy, vault_ghost, vault_timestamp, vault_brute_force, vault_self_destruct, vault_alert, vault_anti_debug
**GUI:** Rust crypto module exists but covers only KDF + AEAD. All security logic (brute-force, self-destruct, integrity, ghost mode) is in TypeScript (easily inspectable).
**Required:** Move all security-critical logic to the Rust native module. TypeScript should only contain UI code.

---

## 4. LOST FEATURES — VAULT OPERATIONS

### 4.1 Vault Compaction (Reclaim Deleted Space)
**Original:** `vault_compact.py` — Streaming re-encryption to reclaim space from deleted files:
1. Rename VAULT.bin → VAULT_TEMP_OLD.bin (backup)
2. Stream-decrypt old vault records
3. Stream-encrypt to new VAULT.bin (skip deleted records)
4. Write new index + finalize header
5. Verify new header HMAC
6. Delete old backup on success
**GUI:** Does not exist. Deleted files are removed from the index but their encrypted data remains.
**Required:** Implement as a USB companion service endpoint or native module operation.

### 4.2 Dual-Index Redundancy & Atomic Commits
**Original:** `vault_core.py` — Two index slots in header for crash-safe atomic updates:
1. New index snapshot appended to VAULT.bin
2. Header updated to point to new snapshot in INACTIVE slot
3. ACTIVE flag flipped
4. Commit counter incremented
If crash during steps 2-3: old index in other slot still valid.
**GUI:** Single index in localStorage. No crash safety. No atomic commits.
**Required:** Must implement in VAULT.bin format on USB.

### 4.3 Index Rescue / Recovery
**Original:** `vault_rescue_index_cli.py` — Byte-by-byte scan of VAULT.bin to find all V2RC record headers, rebuild index from discovered records.
**GUI:** Does not exist.
**Required:** Implement as a "Troubleshooting" tool in the Tools screen.

### 4.4 Index Slot Repair
**Original:** `vault_repoint_index_cli.py` — Manual switch between dual index slots when one is corrupted.
**GUI:** Does not exist (no dual index to switch between).
**Required:** Part of dual-index implementation.

### 4.5 Backup Vault Promotion
**Original:** `vault_safe_swap_cli.py` — Atomically swap VAULT_NEW.bin → VAULT.bin with verification.
**GUI:** Does not exist.
**Required:** Implement as part of vault maintenance tools.

### 4.6 File Hiding (OS-Level)
**Original:** `vault_file_hiding.py`:
- Windows: `FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM` via `ctypes.windll.kernel32`
- macOS: `chflags hidden` via subprocess
- Linux: dot-prefix directories (convention only)
- Recursively hide all vault files on SECURE partition
**GUI:** Does not exist.
**Required:** USB companion service should hide vault files after provisioning.

### 4.7 File Locking (Concurrent Access Prevention)
**Original:** `vault_file_lock.py` — `fcntl.flock()` (Unix) / `msvcrt.locking()` (Windows) context manager:
- Prevents two processes from accessing same VAULT.bin
- `is_locked()` check before operations
- `VaultLockError` exception for conflicts
**GUI:** Does not exist. Multiple browser tabs could corrupt the vault.
**Required:** USB companion should hold exclusive lock on VAULT.bin while in use.

### 4.8 Safe USB Eject
**Original:** `vault_eject.py` — Platform-specific safe ejection:
- Windows: Release file handles, move CWD away from USB, Shell.Application COM eject
- macOS: `diskutil unmount` for all partitions
- Linux: `udisksctl unmount` for all partitions
- Remount option if user wants to resume
**GUI:** Does not exist. No eject functionality.
**Required:** USB companion endpoint to safely unmount and eject.

### 4.9 Temporary File Auto-Wipe (Timed)
**Original:** `vault_timeout.py` — `TempFileGuard` context manager:
- Auto-wipe decrypted files after VIEW_TIMEOUT_SECONDS (90 seconds default)
- `wipe_file()`: single-pass random overwrite + delete
- `wipe_dir()`: recursively wipe directory
- Prefers `/dev/shm` (RAM-backed tmpfs) on Linux
**GUI:** Decrypt screen has temp-view concept but no timed auto-wipe with secure overwrite.
**Required:** Implement timed cleanup in the decrypt flow. On native: use Rust for secure file overwrite. On web: clear blob URLs and ArrayBuffer references.

### 4.10 50% Capacity Rule
**Original:** Vault file never exceeds 50% of SECURE partition capacity. Guarantees compaction always has room (both old and new vault exist simultaneously during compaction). Prevents out-of-space errors during critical operations.
**GUI:** No capacity enforcement.
**Required:** USB companion should enforce capacity limits during file upload.

---

## 5. LOST FEATURES — AUTHENTICATION & KEY MANAGEMENT

### 5.1 Application Password (Separate from Vault Password)
**Original:** `vault_app_auth.py`:
- Separate PBKDF2-SHA256 (150,000 iterations) app-level lock
- Stored in `.vault_applock` file on SECURE partition (mode 0o600)
- Enforced before vault access (independent of vault password)
- 3 failed attempts → 60-second lockout
**GUI:** Only vault password exists. No separate app-level gate.
**Required:** Implement as an optional pre-authentication gate.

### 5.2 QKD Key Provider (Quantum Key Distribution)
**Original:** `vault_qkd_client.py` — ETSI QKD 014 REST client:
- mTLS authentication (CA cert + client cert + client key)
- `get_status()`, `request_keys()`, `retrieve_key()` operations
- QKD key mixed as `hw_secret` into Argon2id
**GUI:** Does not exist.
**Required:** Future Phase 5 feature. Architecture should support pluggable key providers.

### 5.3 External Key Provider (Key from Encrypted File)
**Original:** `vault_key_provider.py` `ExternalKeyProvider` — Load 256-bit key from encrypted key file (HSM export).
**GUI:** Does not exist.
**Required:** Support pluggable key sources in the crypto bridge.

### 5.4 Pluggable Key Provider Architecture
**Original:** `vault_key_provider.py` — Abstract base class `KeyProvider` with 4 implementations:
```
KeyProvider (ABC)
├── PasswordKeyProvider (Argon2id, default)
├── HybridPQCKeyProvider (password + ML-KEM-1024 via HKDF-SHA384)
├── QKDKeyProvider (ETSI QKD 014 REST API)
└── ExternalKeyProvider (HSM or pre-shared key files)
```
**GUI:** `keyHierarchy.ts` has KEK+MEK but no pluggable provider abstraction.
**Required:** Refactor key derivation to support multiple key sources.

### 5.5 2FA Recovery Key (for Lost Hardware Key)
**Original:** `vault_tfa.py` — Recovery mechanism:
- 60-byte encrypted blob: 8B nonce + 32B ciphertext + 16B AES-GCM-SIV tag
- Encrypts `hw_secret` with recovery key
- Displayed as Base32 string during enrollment (show once)
- Allows vault unlock without original FIDO2 key
**GUI:** FIDO2 service exists but no recovery key generation or recovery flow.
**Required:** Implement recovery key display during FIDO2 enrollment and recovery flow.

### 5.6 FIDO2 hmac-secret Extension
**Original:** `vault_fido2.py` — Uses CTAP2 `hmac-secret` extension:
- Hardware key derives deterministic 32-byte `hw_secret` from salt
- `hw_secret` mixed into Argon2id: `kdf_input = password + hw_secret`
- Vault keys are cryptographically BOUND to the physical key
**GUI:** Uses standard WebAuthn API (no hmac-secret). The FIDO2 key only proves identity, it doesn't contribute key material to the vault encryption.
**Required:** On native apps, use CTAP2 directly via Rust/native module. On web, use PRF extension (WebAuthn Level 3) which is the web equivalent of hmac-secret.

### 5.7 Breached Password Bloom Filter
**Original:** `weak_passwords.py` — 382KB compiled bloom filter of 98,735 breached passwords:
- Checked at vault creation and password change
- Offline (no network required)
- Combined with HIBP k-anonymity API (online, optional)
**GUI:** Basic password policy with character class rules but no breach database.
**Required:** Bundle a bloom filter or hash-prefix list in the app. Use HIBP k-anonymity API when online.

---

## 6. LOST FEATURES — ANTI-FORENSICS & GHOST MODE

### 6.1 Core Dump Prevention
**Original:** `vault_ghost.py`:
- Linux: `resource.setrlimit(RLIMIT_CORE, (0, 0))` + `prctl(PR_SET_DUMPABLE, 0)`
- macOS: `ptrace(PT_DENY_ATTACH, 0, 0, 0)`
- Windows: `SetErrorMode(SEM_NOGPFAULTERRORBOX)` + WER suppression
**GUI:** Does not exist.
**Required:** Implement in Rust native module for iOS/Android/desktop builds.

### 6.2 Process Name Obfuscation
**Original:** `vault_ghost.py` — Hide "USBVault" from ps/tasklist:
- Linux: `prctl(PR_SET_NAME, "system_helper")`
- macOS: Modify `argv[0]`
- Windows: `SetConsoleTitleW("system_helper")`
**GUI:** Does not exist. App appears as "USBVault" in process list.
**Required:** Native module for desktop builds. Not applicable to mobile (OS controls process names).

### 6.3 RAM Scrubbing (Multi-Pass)
**Original:** `vault_ghost.py` + `vault_mlock.py`:
- 3-pass overwrite: random → zeros → random (configurable)
- Python GC iteration: zero all `bytearray` objects
- Python internals scrub: regex cache, linecache, warnings filters
- Scrub on exit and on lock
**GUI:** Does not exist. JavaScript GC is non-deterministic; cannot scrub freed memory.
**Required:** All crypto keys must live in Rust. Rust module must implement secure zeroing on drop (use `zeroize` crate). JS must never hold raw key material.

### 6.4 Timestamp Sanitization
**Original:** `vault_timestamp.py` — Reset all vault file timestamps to 2021-01-01 00:00:00 UTC:
- Defeats forensic timeline analysis
- Applied to vault files, USB root directory, all records
- Platform-specific: Windows (creation+modification), macOS/Linux (modification)
**GUI:** Does not exist.
**Required:** USB companion service should sanitize timestamps on vault files.

### 6.5 Hibernation Detection
**Original:** `vault_ghost.py`:
- Windows: Check `hiberfil.sys` existence and size
- Linux: Read `/sys/power/state` capabilities
- macOS: Check `hibernatemode` via `pmset`
- Advisory warning if hibernation could expose RAM
**GUI:** Does not exist.
**Required:** Display warning in Health Check or Settings when hibernation is enabled.

### 6.6 DNS/ARP Cache Flushing
**Original:** `vault_ghost.py`:
- DNS: `dscacheutil -flushcache` (macOS), `systemd-resolve --flush-caches` (Linux), `ipconfig /flushdns` (Windows)
- ARP: `arp -d *` (macOS/Linux), `arp -ad` (Windows)
**GUI:** Does not exist.
**Required:** USB companion service endpoint for network cache cleanup.

### 6.7 Windows-Specific Zero-Trace (10 Artifact Classes)
**Original:** `vault_zero_trace.py` — Windows forensic cleanup:
1. Prefetch files (`C:\Windows\Prefetch\USBVAULT*.pf`)
2. Jump Lists / Recent Items (`AppData\Roaming\Microsoft\Windows\Recent`)
3. Thumbnail cache (`thumbcache_*`)
4. Shellbags registry (`HKCU\Software\...\BagMRU`)
5. Registry MRU lists (RecentDocs, OpenSavePidlMRU, ComDlg32)
6. Event Log entries referencing vault drive
7. NTFS USN Journal entries (admin-required)
8. Windows Search index entries
9. Recycle Bin remnants from vault drive
10. Pagefile / hiberfil residue (advisory)
**GUI:** `forensicsService.ts` covers browser-level traces only (clipboard, sessionStorage, localStorage, Cache API, IndexedDB). None of the OS-level cleaners exist.
**Required:** Desktop companion (or native module) must implement OS-level forensic cleanup.

### 6.8 Secure Temporary Directories
**Original:** `vault_ghost.py`:
- Linux: Prefer `/dev/shm` (RAM-backed tmpfs) — never writes decrypted data to disk
- macOS: Default temp with encryption warning
- Windows: Advisory warning (always disk-backed)
**GUI:** Uses standard OS temp directories.
**Required:** Native module should use `/dev/shm` on Linux, memory-mapped files where possible.

---

## 7. LOST FEATURES — USB MANAGEMENT

### 7.1 Dual-Partition Scheme (TOOLS + SECURE)
**Original:** USB drives partitioned into:
- TOOLS (256-500MB visible): contains platform binaries, README, recovery guide
- SECURE (remaining, hidden): contains encrypted VAULT.bin
**GUI:** USB companion formats a single partition labeled "USBVAULT".
**Required:** Implement dual-partition creation in the USB companion. The TOOLS partition should contain the portable app. The SECURE partition should be hidden.

### 7.2 SECURE Partition Hiding
**Original:** `vault_usb_partition.py` + `vault_file_hiding.py`:
- Windows: GPT hidden attribute via diskpart, no drive letter assigned
- macOS: Partition unmounted via `diskutil unmount`
- Linux: Partition unmounted via `udisksctl unmount`
**GUI:** Single visible partition.
**Required:** After provisioning, hide the SECURE partition using platform-specific methods.

### 7.3 Multi-Vault per USB
**Original:** `vault_identity.py` — Multiple independent vaults on one USB:
```
SECURE/VAULT.bin                    (root vault)
SECURE/vault_a1b2c3d4/VAULT.bin    (second vault)
SECURE/vault_7g8h9i0j/VAULT.bin    (third vault)
```
Each vault: separate password, cipher, 2FA settings, fail counter.
**GUI:** VaultStore can track multiple vaults but cannot create subdirectory vaults on USB.
**Required:** USB companion should support creating vault subdirectories with independent VAULT.bin files.

### 7.4 USB Identity Resolution (vault_id not mount path)
**Original:** `vault_identity.py` + `vault_selector.py`:
- Mount paths are ephemeral (Linux assigns /run/media/user/SECURE, SECURE1, SECURE2 based on plug-order)
- USBVault NEVER relies on mount paths — uses vault_id (UUID) embedded in header
- `discover_vaults()` scans all removable drives for VAULT.bin files
- `vault_id` embedded in header at offset 224 (Identity Block)
**GUI:** Uses companion-reported mount paths.
**Required:** Vault discovery should be UUID-based, not path-based.

### 7.5 Secure Erase Levels
**Original:** `vault_reset_usb_cli.py` + `vault_usb_partition.py`:
- Quick: single exFAT format (fast)
- `diskutil secureErase` levels:
  - Level 0: single-pass zero fill
  - Level 1: single-pass random fill
  - Level 2: 7-pass DOD
  - Level 3: Gutmann 35-pass
  - Level 4: 3-pass
**GUI:** USB companion has reset endpoint but secure erase level mapping is incorrect in `usbResetter.js`.
**Required:** Fix erase level mapping per the plan.

---

## 8. LOST FEATURES — EDUCATIONAL & UTILITY

### 8.1 Crypto Classroom (7 Educational Ciphers)
**Original:** `crypto_classroom.py` (~1200 lines) — Interactive educational module:
- MAGIC: "USBEDU01" (separate from production)
- 7 ciphers (intentionally weak for teaching): Caesar (26 keys), ROT13, Repeating-key XOR, DES-ECB (56-bit), Triple DES CBC, XChaCha20-Poly1305 (modern), AES-256-GCM-SIV (modern)
- 6 KDFs: Raw MD5, Raw SHA-1, Raw SHA-256, PBKDF2 (1000 iter), PBKDF2 (600000 iter), Argon2id
- Interactive encryption/decryption with explanation of why each is weak/strong
**GUI:** `classroom.tsx` is a placeholder ("coming in v1.1").
**Required:** Implement the 7-cipher educational module as an interactive web experience.

### 8.2 Find My Vault (3-Phase Diagnostic Scanner)
**Original:** `find_my_vault.py`:
1. Discover existing vaults (scan known paths)
2. Scan candidate USB drives (enumerate all removable media)
3. Check for multi-vault partitions (subdirectory scan)
- Reports: vault_id, location, creation date, size, format version, layout type
**GUI:** `find-vault.tsx` redirects to vault-manager. No actual scanning.
**Required:** Wire to USB companion's drive detection + vault discovery.

### 8.3 Tools Suite (File Shredder, Hash Checker, etc.)
**Original:** CLI tools menu provided:
- Recover corrupted vault (rebuild index)
- Quick validation (no password)
- Manual index repair (swap slots)
- Promote backup vault
**GUI:** `tools.tsx` shows 5 card placeholders (file shredder, hash checker, QR generator, secure notepad, text encryptor). None are functional.
**Required:** Implement at minimum: file shredder (secure delete), hash checker (SHA-256 verification), and the Original's troubleshooting tools.

### 8.4 Vault Quick Validation (No Password Required)
**Original:** `vault_validate_quick.py` — Check vault structure without decrypting:
- Verify MAGIC bytes ("USBVLT02" or "USBVLT03")
- Check header size
- Verify salt is non-zero
- Validate cipher_id and kdf_id values
- Check identity block JSON structure
**GUI:** Does not exist.
**Required:** USB companion endpoint for quick validation.

---

## 9. PLANNED FEATURES NEVER IMPLEMENTED

### 9.1 Ghost Messages (Self-Destructing Chats) — P1 Priority
- Per-conversation toggle for GHOST mode
- Auto-delete timer: 5s / 30s / 1m / 5m / 1h / 24h
- Sender sets timer, recipient sees countdown
- No screenshots during ghost messages (FLAG_SECURE)
- Messages removed from both devices post-expiry

### 9.2 Recovery Phrase System — P1 Priority
- BIP39 24-word mnemonic during onboarding
- Encrypt master key with phrase-derived key
- Interactive recovery flow
- Optional trusted contact escrow

### 9.3 Passkey Login — P1 Priority
- Extend FIDO2 with resident/discoverable credentials
- PRF extension for key derivation (web equivalent of hmac-secret)
- Passkey as primary auth option with password fallback

### 9.4 Enterprise QR Identity — P2 Priority
- USB devices get unique QR code: Org ID + Employee number + Device serial + Ed25519 public key signature
- Admin scanner for device verification

### 9.5 Steganography — P2 Priority (Roadmap V4.0)
- Embed encrypted messages/files into images (PNG, JPEG)
- Plausible deniability
- Statistical resistance to steganalysis tools

### 9.6 Dark-Web Monitoring Dashboard — P2 Priority
- Periodic HIBP email breach checks
- Push notifications on new breaches
- Remediation guidance

### 9.7 Group Messaging — P2 Priority
- Fan-out encryption: seal to each participant's X25519 key
- Group key rotation
- UI for group creation/management

### 9.8 Emergency Access — P2 Priority
- Designate trusted contacts by email
- 72-hour waiting period after activation
- Owner can deny emergency access
- Vault key encrypted to contact's X25519 key

### 9.9 Duress Password — Deferred
- Alternative password that triggers silent self-destruct
- Plausible deniability under coercion

### 9.10 Cloud Split-Key Architecture — V4.0 Roadmap
- HKDF(LOCAL_KEY || REMOTE_KEY) — vault requires both halves
- 2-of-3 key shards: user + cloud + recovery
- Zero-knowledge cloud storage

### 9.11 Status Bar Footer — P3 Priority
- Fixed position at bottom of viewport
- Active vault name, connection status, encryption algorithm, version number

---

## 10. GUI-SPECIFIC GAPS

### 10.1 Mock Data Still in Use
Several screens still use hardcoded mock data instead of real service data:
- Activity screen (partial — real audit service exists but may fall back to mock)
- Devices screen (limited backend integration)
- Tools screen (all placeholder cards)
- Classroom screen (placeholder)
- Help screen (placeholder)

### 10.2 Settings Not Persisted to Vault
Settings are stored in localStorage, not in the vault header or encrypted container. This means:
- Settings are per-browser, not per-vault
- Settings don't travel with the USB drive
- Settings are cleartext-accessible

### 10.3 No Offline-First Architecture
The Original was fully offline (USB-only). The GUI assumes network connectivity for:
- SRP authentication (requires server)
- Sync service (WebSocket to Go backend)
- Sharing (requires server relay)
The GUI should work fully offline with USB companion, syncing only when connected.

### 10.4 Web Crypto Fallback is Not Production-Grade
The web crypto fallback uses PBKDF2 + AES-GCM instead of Argon2id + AES-GCM-SIV. This is documented as "development preview only" but there's no gate preventing production use.

---

## 11. COMPLIANCE & STANDARDS GAPS

### 11.1 FIPS 140-3
**Original status:** AES-256-GCM-SIV via cryptography library (FIPS OpenSSL possible). Argon2id not CAVP-listed (documented limitation).
**GUI status:** Rust crypto module — not FIPS-validated. WebCrypto fallback uses browser's validated module but with PBKDF2 not Argon2id.

### 11.2 NIST SP 800-63B-4 Password Policy
**Original status:** Full compliance — 15-char minimum, no composition rules, breach checking (98K blocklist + HIBP), context blocklist, entropy scoring.
**GUI status:** Basic validation only. No breach database. No context blocklist. No entropy scoring.

### 11.3 CNSA 2.0 (Post-Quantum)
**Original status:** Complete — ML-KEM-1024 (FIPS 203), ML-DSA-87 (FIPS 204), HKDF-SHA384 hybrid.
**GUI status:** Rust crypto module has ML-KEM-1024 key exchange but ML-DSA-87 signatures are not integrated into vault operations. No V3 header format.

### 11.4 NIST SP 800-88 (Media Sanitization)
**Original status:** secure_zero() with multi-pass overwrite and read-back verification.
**GUI status:** No secure media sanitization. File deletion is standard OS delete.

---

## 12. IMPLEMENTATION PRIORITY MATRIX

### P0 — CRITICAL (Security Architecture)

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 1 | **VAULT.bin container format** | Eliminates cleartext metadata exposure | HIGH |
| 2 | **Encrypted index inside vault** | File names/sizes no longer in localStorage | HIGH |
| 3 | **Header-embedded fail counter** | Persistent brute-force defense | MED |
| 4 | **Self-destruct engine** | Real 3-pass header overwrite | MED |
| 5 | **Dual-partition USB scheme** | Hidden SECURE partition | MED |

### P1 — HIGH (Core Security Features)

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 6 | Memory locking in Rust (mlock + zeroize) | Prevent key exposure via swap | MED |
| 7 | Dual-index atomic commits | Crash safety | MED |
| 8 | FIDO2 hmac-secret / PRF extension | Hardware-bound key derivation | MED |
| 9 | Breached password bloom filter | NIST SP 800-63B compliance | LOW |
| 10 | 2FA recovery key generation | Recovery when hardware key lost | LOW |
| 11 | Vault compaction | Reclaim deleted file space | MED |
| 12 | Safe USB eject | Prevent data corruption | LOW |
| 13 | File locking (concurrent access) | Prevent vault corruption | LOW |
| 14 | Temp file auto-wipe (90s timer) | Prevent decrypted data exposure | LOW |

### P2 — MEDIUM (Anti-Forensics & Platform Security)

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 15 | Ghost Mode OS-level (core dumps, process name) | Anti-forensics | MED |
| 16 | Timestamp sanitization | Defeat timeline analysis | LOW |
| 17 | Windows zero-trace (10 artifact classes) | Forensic cleanup | HIGH |
| 18 | DNS/ARP cache flushing | Network trace cleanup | LOW |
| 19 | Hibernation detection + warning | Memory exposure advisory | LOW |
| 20 | Anti-debug / anti-tamper (native) | Reverse engineering defense | MED |
| 21 | Binary integrity verification | Tamper detection | MED |
| 22 | Boot security gate sequence | Enforce initialization order | MED |
| 23 | Application password (separate gate) | Additional access control | LOW |
| 24 | Multi-vault per USB | Power user feature | MED |

### P3 — LOW (Features & Polish)

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 25 | Crypto Classroom (7 ciphers) | Educational value | MED |
| 26 | Find My Vault (diagnostic scan) | Recovery tool | LOW |
| 27 | Tools suite (shredder, hash checker) | Utility | MED |
| 28 | Quick vault validation (no password) | Diagnostics | LOW |
| 29 | Index rescue / recovery | Emergency recovery | MED |
| 30 | Email alerting system | Notification | MED |
| 31 | File hiding (OS-level) | Stealth | LOW |
| 32 | 50% capacity rule enforcement | Data safety | LOW |
| 33 | Status bar footer | UX polish | LOW |
| 34 | Ghost messages | Communication feature | MED |
| 35 | Recovery phrase (BIP39) | Backup mechanism | MED |

### P4 — FUTURE (Roadmap V4.0+)

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 36 | QKD key provider (ETSI QKD 014) | Quantum readiness | HIGH |
| 37 | External key provider (HSM) | Enterprise key management | MED |
| 38 | Steganography | Plausible deniability | HIGH |
| 39 | Cloud split-key architecture | Enterprise cloud | HIGH |
| 40 | Enterprise QR identity | Device management | MED |
| 41 | Dark-web monitoring dashboard | Breach awareness | MED |
| 42 | Duress password | Coercion defense | MED |
| 43 | Group messaging | Communication | MED |
| 44 | Emergency access | Recovery | MED |
| 45 | Passkey login (PRF) | Passwordless auth | MED |

---

## 13. SECURITY INVARIANTS

These rules MUST be followed in ALL implementations:

### Cryptographic Rules
1. **All subprocess calls use `execFile`** (never `exec` or `shell: true`)
2. **All secret comparisons use constant-time** (`crypto.timingSafeEqual` or equivalent)
3. **All keys stored as mutable buffers** (`Uint8Array` / `bytearray`), zeroed after use
4. **All key material zeroed in `finally` blocks** — no exception can skip cleanup
5. **No encryption keys in JavaScript** longer than a single function call — derive in Rust, use in Rust, zero in Rust
6. **Per-chunk nonce derivation** — `chunk_nonce = base_nonce[:16] + (base_nonce[16:] XOR chunk_index)`
7. **HMAC-SHA256 for all header authentication** — key derived from salt, independent of password
8. **Argon2id parameters fixed** — 64 MiB memory, 3 iterations, 4 parallelism, 32-byte salt, 64-byte output

### Data Rules
9. **File names NEVER stored in cleartext** — must be inside encrypted index or record metadata
10. **No vault metadata in localStorage** — all metadata must be in the encrypted VAULT.bin container
11. **Session state on SECURE partition** (not browser storage) when USB is available
12. **Dual-index slots** for all index updates — atomic commit or nothing
13. **50% capacity rule** — vault file never exceeds 50% of partition capacity

### Platform Rules
14. **Server bound to `127.0.0.1`** only (USB companion)
15. **CORS restricted** to known origins
16. **Rate limiting** — 60/min general, 5/min destructive operations
17. **No passwords, recovery phrases, or keys in logs** — ever
18. **`confirm: true` required** for all destructive operations
19. **Drive validation** — must be USB/external, not system disk
20. **Timeouts on all subprocesses** — 10s detection, 300s provision, 600s wipe

### Coding Standards (from USBVAULT_CODING_STANDARDS.md)
21. **No f-strings** for any string containing user input or sensitive data
22. **Full binary paths** for all subprocess calls (prevent PATH hijacking)
23. **Input validation** — validate, sanitize, bound before use
24. **No `eval`, `exec`, `pickle`, `marshal`** — ever
25. **File permissions** — 0o600 for secrets, `fsync()` after critical writes
26. **JSON validation** — structure checked after `JSON.parse()`

---

## APPENDIX A: Original CLI Menu Structure (Reference)

```
╔══════════════════════════════════════╗
║          USBVault V2.0               ║
╠══════════════════════════════════════╣
║  [1] VIEW MY FILES                   ║
║  [2] ADD A FILE                      ║
║  [3] GET A FILE OUT                  ║
║  [4] REMOVE A FILE                   ║
║  [5] CHECK STORAGE SPACE             ║
║  [6] FREE UP SPACE (compact)         ║
║  [7] CHECK VAULT HEALTH              ║
║  [V] MANAGE VAULTS ON THIS USB       ║
║  [Z] ZERO-TRACE CLEANUP              ║
║  [P] CHANGE APPLICATION PASSWORD     ║
║  [F] MANAGE 2FA KEYS                 ║
║  [D] DELETE VAULT                    ║
║  [R] RESET ANY USB                   ║
║  [N] NEW USB SETUP                   ║
║  [C] CREATE VAULT                    ║
║  [T] TROUBLESHOOTING TOOLS           ║
║  [S] SWITCH VAULT                    ║
║  [X] EXIT                            ║
╚══════════════════════════════════════╝
```

## APPENDIX B: File-to-Feature Mapping (Original App)

| Original File | Feature | GUI Equivalent | Status |
|--------------|---------|----------------|--------|
| `vault_core.py` | Header, index, verify marker | `vaultStore.ts` (partial) | DEGRADED |
| `vault_crypto.py` | Cipher dispatch, KDF | `crypto/bridge.ts` | PARTIAL |
| `vault_streaming.py` | Chunked AEAD records | `cryptoManager.ts` | PARTIAL |
| `vault_mlock.py` | Memory locking | None | MISSING |
| `vault_integrity.py` | Binary integrity | None | MISSING |
| `vault_hardening.py` | Boot gates, env sanitization | None | MISSING |
| `vault_anti_debug.py` | Anti-debug detection | None | MISSING |
| `vault_ghost.py` | Anti-forensics | `forensicsService.ts` (browser only) | DEGRADED |
| `vault_zero_trace.py` | OS forensic cleanup | `forensicsService.ts` (browser only) | DEGRADED |
| `vault_timestamp.py` | Timestamp sanitization | None | MISSING |
| `vault_brute_force.py` | Persistent fail counter | `rateLimiter.ts` (localStorage) | DEGRADED |
| `vault_self_destruct.py` | Header destruction | Settings toggle (no impl) | MISSING |
| `vault_alert.py` | Email alerts | None | MISSING |
| `vault_compact.py` | Vault compaction | None | MISSING |
| `vault_eject.py` | Safe USB eject | None | MISSING |
| `vault_file_hiding.py` | OS-level file hiding | None | MISSING |
| `vault_file_lock.py` | Concurrent access lock | None | MISSING |
| `vault_timeout.py` | Temp file auto-wipe | Partial (no secure wipe) | DEGRADED |
| `vault_tfa.py` | 2FA management | `fido2Service.ts` (no hmac-secret) | DEGRADED |
| `vault_fido2.py` | FIDO2 CTAP2 | WebAuthn API (standard) | DEGRADED |
| `vault_pqc.py` | ML-KEM-1024, ML-DSA-87 | `crypto/pqc.ts` (partial) | PARTIAL |
| `vault_identity.py` | Vault UUID discovery | `vaultStore.ts` (partial) | DEGRADED |
| `vault_selector.py` | Multi-USB vault selection | TopBar vault picker | PARTIAL |
| `vault_setup_core.py` | Vault creation wizard | `setup-usb.tsx` | PARTIAL |
| `vault_usb_partition.py` | USB partitioning | USB companion (single partition) | DEGRADED |
| `vault_app_auth.py` | Application password | None | MISSING |
| `vault_key_provider.py` | Pluggable key sources | `keyHierarchy.ts` (fixed) | DEGRADED |
| `vault_qkd_client.py` | QKD integration | None | MISSING |
| `vault_config.py` | Session management | `sessionService.ts` | PARTIAL |
| `vault_defaults.py` | Centralized config | Scattered constants | DEGRADED |
| `vault_utils.py` | Capacity management | None | MISSING |
| `vault_shutdown.py` | Signal handlers, cleanup | None | MISSING |
| `vault_string_shield.py` | String obfuscation | None | MISSING |
| `password_policy.py` | NIST password validation | Basic rules only | DEGRADED |
| `weak_passwords.py` | Breach database | None | MISSING |
| `crypto_classroom.py` | Educational ciphers | Placeholder screen | MISSING |
| `find_my_vault.py` | Vault scanner | Redirect to vault-manager | MISSING |
| `vault_menu_actions.py` | CLI action dispatch | Tab routing | PARTIAL |
| `usbvault_main.py` | Boot sequence + main menu | `_layout.tsx` | DEGRADED |

**Legend:**
- **MISSING** — Feature does not exist in GUI at all
- **DEGRADED** — Feature exists but with significantly reduced capability
- **PARTIAL** — Core functionality exists but incomplete
- **COMPLETE** — Feature fully ported (none currently qualify for all features)

---

*This document is the authoritative reference for USBVault Enterprise gap analysis. All implementation work should consult this document to ensure security-first principles and feature parity with the Original App.*
