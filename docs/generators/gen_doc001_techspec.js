/**
 * DOC-001: USBVault Enterprise — Technical Specification v2.0
 * Audience: Engineers, Security Auditors, Penetration Testers
 */

const H = require("./doc_helpers");

async function generate(outDir) {
  console.log("Generating DOC-001: Technical Specification...");

  const children = [

    // ─── COVER ───────────────────────────────────────────────
    ...H.coverPage({
      title: "Technical Specification",
      subtitle: "Fortress Enterprise \u2014 Complete Implementation Reference",
      docId: "DOC-001",
      version: "2.0",
      date: "March 15, 2026",
      classification: "CONFIDENTIAL",
      audience: "Engineers, Security Auditors, Penetration Testers",
      authors: "USBVault Core Engineering",
    }),

    // ─── DOCUMENT CONTROL ────────────────────────────────────
    ...H.documentControlPage({
      revisions: [
        ["0.1", "2026-01-10", "Engineering", "Initial V2 architecture draft"],
        ["0.5", "2026-02-01", "Engineering", "Crypto protocol finalization"],
        ["1.0", "2026-02-20", "Engineering", "Internal review complete"],
        ["1.5", "2026-03-05", "Security Team", "Security review sign-off"],
        ["2.0", "2026-03-15", "Engineering", "Enterprise Edition v2.0 release"],
      ],
      distribution: [
        ["Core Engineering", "Full Access"],
        ["Security & Compliance", "Full Access"],
        ["Third-Party Auditors", "Read Only (under NDA)"],
        ["Executive Leadership", "Summary Section Only"],
      ],
    }),

    // ─── TOC ──────────────────────────────────────────────────
    ...H.toc(),

    // ═══════════════════════════════════════════════════════════
    //  1. EXECUTIVE SUMMARY
    // ═══════════════════════════════════════════════════════════
    H.h1("1. Executive Summary"),
    H.p("USBVault Enterprise Edition v2.0 (codename \u201CFortress Enterprise\u201D) is a portable encrypted file storage platform that enables users to carry sensitive data on a standard USB drive, access it from any computer running Windows, macOS, or Linux, and leave zero forensic evidence upon ejection. The system achieves intelligence-grade security through a layered defense architecture while maintaining consumer-grade simplicity."),
    H.p("This Technical Specification serves as the definitive engineering reference for USBVault Enterprise v2.0. It documents every binary format, cryptographic protocol, API contract, and security mechanism in sufficient detail for independent implementation, security audit, or compliance review."),
    H.spacer(100),

    H.h2("1.1 Technology Stack"),
    H.makeTableBoldFirst(
      ["Subsystem", "Language", "Purpose", "Test Count"],
      [
        ["usbvault-crypto", "Rust 2021", "All cryptographic operations: KDF, AEAD, streaming, vault format, PQC, memory security", "234"],
        ["usbvault-app", "TypeScript / React Native", "Cross-platform frontend: web, iOS, Android. 37 pages, 7 Zustand stores, i18n (4 languages)", "45 files"],
        ["usbvault-server", "Go 1.25", "Cloud backend: SRP-6a auth, vault management, S3 storage, Stripe billing, WebSocket sync", "61 files"],
        ["usb-companion", "Node.js / Express", "Local USB bridge: hardware detection, provisioning, mounting, encrypted I/O, zero-trace cleanup", "19 endpoints"],
      ],
      [1600, 1400, 4760, 1600]
    ),
    H.caption("Table 1.1 \u2014 USBVault Technology Stack Overview"),
    H.spacer(100),

    H.h2("1.2 Quality Metrics"),
    H.makeTable(
      ["Metric", "Value"],
      [
        ["Total test files", "340 across 3 subsystems"],
        ["Rust tests", "234 (unit: 77, format: 28, integration: 40, property: 19, sharing: 32, SRP: 23, lifecycle: 15)"],
        ["TypeScript coverage", "45 test files, 70% threshold (Jest + Playwright)"],
        ["Go coverage", "61 test files (auth, billing, sharing, sync, middleware, BOLA)"],
        ["SAST tools", "cargo-audit, clippy (pedantic), gosec, npm audit, Snyk \u2014 all clean"],
        ["Property-based fuzzing", "19 proptest suites (Rust crypto)"],
      ],
      [2800, 6560]
    ),
    H.caption("Table 1.2 \u2014 Quality and Test Coverage Metrics"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  2. VAULT BINARY FORMAT
    // ═══════════════════════════════════════════════════════════
    H.h1("2. Vault Binary Format"),
    H.p("The vault binary format is the foundational data structure of USBVault. Every encrypted file, index entry, and metadata record lives inside a single file called VAULT.bin, located at the root of the hidden SECURE partition. This section provides a byte-level specification of every structure within the vault file."),
    H.spacer(80),

    H.h2("2.1 VAULT.bin Layout"),
    H.p("The vault file follows an append-only design for crash safety. Data is never overwritten in place; new records are appended and the index is updated atomically using a dual-slot mechanism."),
    H.makeTable(
      ["Region", "Offset", "Size", "Description"],
      [
        ["Header", "0x0000", "24,576 bytes (24 KiB)", "Magic, version, KDF params, salt, wrapped MEK, fail counter, dual-index pointers, TFA block, identity block"],
        ["Data Records", "0x6000", "Variable (append-only)", "Encrypted file data in V2RC chunked streaming format"],
        ["Index Slot A", "header.index1_offset", "Variable", "Encrypted file index (active or backup)"],
        ["Index Slot B", "header.index2_offset", "Variable", "Encrypted file index (backup or active)"],
      ],
      [1600, 1200, 2400, 4160]
    ),
    H.caption("Table 2.1 \u2014 VAULT.bin Top-Level Layout"),
    H.spacer(100),

    H.h2("2.2 V4 Header Field Map"),
    H.p("The V4 header uses sequential length-prefixed fields rather than fixed byte offsets. This design supports future extensibility without breaking backward compatibility. The header begins with the 8-byte magic number USBVLT04 and is exactly 24,576 bytes, with unused space zero-padded."),
    H.makeTable(
      ["Field", "Type", "Size", "Description"],
      [
        ["magic", "ASCII", "8 bytes", "File signature: USBVLT04 (accepts USBVLT02/03 for discovery)"],
        ["version", "u8", "1 byte", "Header format version (currently 4)"],
        ["kdf_hash_id", "u8", "1 byte", "KDF algorithm identifier (1 = Argon2id)"],
        ["cipher_id", "u8", "1 byte", "AEAD cipher (2 = XChaCha20-Poly1305, 3 = AES-256-GCM-SIV)"],
        ["salt", "bytes", "32 bytes", "Random salt for Argon2id derivation (OS CSPRNG)"],
        ["verify_iv", "bytes", "24 bytes", "Nonce for password verification marker encryption"],
        ["verify_ct", "len+bytes", "Variable", "AEAD ciphertext of USBVAULT_VERIFY_OK_0000"],
        ["header_hmac", "bytes", "32 bytes", "HMAC-SHA256 over all header fields (this field zeroed during compute)"],
        ["active_index_slot", "u8", "1 byte", "Which index slot is active (0 or 1)"],
        ["index1_offset", "u32 LE", "4 bytes", "Byte offset of index slot A within VAULT.bin"],
        ["index1_length", "u32 LE", "4 bytes", "Byte length of index slot A"],
        ["index2_offset", "u32 LE", "4 bytes", "Byte offset of index slot B within VAULT.bin"],
        ["index2_length", "u32 LE", "4 bytes", "Byte length of index slot B"],
        ["commit_counter", "u64 LE", "8 bytes", "Monotonically increasing commit counter (anti-rollback)"],
        ["argon2_memory_kib", "u32 LE", "4 bytes", "Argon2id memory parameter (65,536 = 64 MiB)"],
        ["argon2_time_cost", "u32 LE", "4 bytes", "Argon2id iteration count (3)"],
        ["argon2_parallelism", "u32 LE", "4 bytes", "Argon2id lane count (4)"],
        ["identity_block", "len+bytes", "Variable", "Length-prefixed user identity metadata"],
        ["tfa_block", "len+bytes", "Variable", "Length-prefixed FIDO2 credential data (TFA wire format)"],
        ["fail_counter_block", "len+bytes", "Variable", "HMAC-protected failed attempt counter"],
        ["wrapped_mek", "len+bytes", "Variable", "AEAD-encrypted Master Encryption Key"],
        ["state_version", "u64 LE", "8 bytes", "Vault state version for rollback protection"],
        ["index_encrypted", "bool (u8)", "1 byte", "Whether index blobs are encrypted (always true for v4)"],
      ],
      [1800, 1000, 1000, 5560]
    ),
    H.caption("Table 2.2 \u2014 V4 Header Field Map (Sequential Length-Prefixed)"),
    H.spacer(100),

    H.h2("2.3 V2RC Streaming Record Format"),
    H.p("Every encrypted file is stored as a V2RC (Version 2 Record, Chunked) streaming record. This format enables authenticated encryption of files of arbitrary size using fixed-memory streaming, where each 64 KiB chunk is independently sealed with its own derived nonce."),
    H.makeTable(
      ["Component", "Size", "Description"],
      [
        ["magic", "4 bytes", "ASCII V2RC \u2014 identifies chunked streaming format"],
        ["version", "1 byte", "Record format version"],
        ["base_nonce", "24 bytes", "Random base nonce for HKDF chunk nonce derivation"],
        ["chunk[n].length", "4 bytes (u32 LE)", "Encrypted data length for this chunk (excluding tag)"],
        ["chunk[n].ciphertext", "Variable", "AEAD-encrypted data (max 65,536 bytes plaintext per chunk)"],
        ["chunk[n].tag", "16 bytes", "AEAD authentication tag for this chunk"],
        ["final_hmac", "32 bytes", "HMAC-SHA256 over entire record (anti-truncation)"],
      ],
      [2000, 1800, 5560]
    ),
    H.caption("Table 2.3 \u2014 V2RC Streaming Record Structure"),
    H.p("Per-chunk nonces are derived via HKDF-SHA256 with domain separation: HKDF(base_nonce, chunk_index, \"usbvault-chunk-v2\"). This ensures that even identical plaintext chunks produce different ciphertext, and nonce reuse is mathematically prevented up to 2\u00B3\u00B2 chunks (approximately 256 TiB per record)."),
    H.spacer(100),

    H.h2("2.4 TFA Wire Format"),
    H.p("The two-factor authentication block stores FIDO2 credential data in a compact binary format within the vault header. Multiple credentials can be stored for backup hardware keys."),
    H.makeTable(
      ["Field", "Type", "Size", "Description"],
      [
        ["cred_id_len", "u16 LE", "2 bytes", "Length of the WebAuthn credential ID"],
        ["credential_id", "bytes", "Variable", "FIDO2 credential identifier"],
        ["aaguid", "bytes", "16 bytes", "Authenticator Attestation GUID (identifies key model)"],
        ["label_len", "u8", "1 byte", "Length of human-readable label"],
        ["label", "UTF-8 string", "Variable (max 32B)", "User-assigned key label (e.g., \u201CYubiKey 5C\u201D)"],
      ],
      [1600, 1000, 1400, 5360]
    ),
    H.caption("Table 2.4 \u2014 TFA Credential Wire Format"),
    H.spacer(100),

    H.h2("2.5 Index Blob Structure"),
    H.p("The file index maps encrypted filenames to their data record offsets within VAULT.bin. The index is itself encrypted with the MEK before being written to one of the two index slots. The dual-slot design ensures that a crash during index write never corrupts the vault: the backup slot always contains the previous valid state."),
    H.p("Each index entry contains: the original filename (encrypted), MIME type, file size, record offset within VAULT.bin, creation timestamp, modification timestamp, and a per-file metadata block for sharing and version tracking. The index is serialized as MessagePack before AEAD encryption."),
    H.importantBox("Crash Safety:", "The active index slot alternates on each commit. A commit counter in the header tracks which slot is authoritative. If the commit counter disagrees with the slot state, a rollback attack is suspected and the vault refuses to open (ROLLBACK_DETECTED error)."),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  3. CRYPTOGRAPHIC PROTOCOLS
    // ═══════════════════════════════════════════════════════════
    H.h1("3. Cryptographic Protocols"),
    H.p("USBVault\u2019s cryptographic design follows a zero-knowledge, defense-in-depth model. All encryption and decryption occurs exclusively within the Rust crypto core (usbvault-crypto), which is linked via FFI to the TypeScript frontend. The server never handles plaintext data, filenames, or encryption keys under any circumstance. This section documents every cryptographic protocol in implementation detail."),
    H.spacer(80),

    H.h2("3.1 Key Derivation: Argon2id"),
    H.p("Argon2id is the OWASP-recommended, NIST-recognized password hashing algorithm that combines resistance to both GPU-based (data-dependent addressing) and side-channel (data-independent addressing) attacks. USBVault uses aggressive parameters that significantly exceed minimum recommendations."),
    H.makeTable(
      ["Parameter", "Value", "Rationale"],
      [
        ["Algorithm", "Argon2id (v19)", "Hybrid mode: resists both GPU and side-channel attacks"],
        ["Memory", "65,536 KiB (64 MiB)", "Forces 64 MB RAM per guess attempt; exceeds OWASP 47 MiB minimum"],
        ["Iterations (time_cost)", "3", "Three sequential passes over memory; balances UX latency vs. resistance"],
        ["Parallelism", "4 lanes", "Utilizes multi-core CPUs; increases GPU attack cost"],
        ["Output length", "64 bytes", "Split into enc_key[0:32] (AEAD key) + hmac_key[32:64] (integrity key)"],
        ["Salt", "32 bytes (OS CSPRNG)", "Per-vault random salt; prevents rainbow table attacks"],
        ["Implementation", "argon2 crate (Rust)", "Pure Rust with optional hardware acceleration"],
      ],
      [2200, 2400, 4760]
    ),
    H.caption("Table 3.1 \u2014 Argon2id KDF Parameters"),
    H.p("The output is split deterministically: the first 32 bytes become the encryption key (KEK in the wrapped MEK architecture), and the second 32 bytes become the HMAC key used for header integrity verification and fail counter protection."),
    H.spacer(100),

    H.h2("3.2 Wrapped MEK Architecture"),
    H.p("USBVault v2.0 introduces a wrapped Master Encryption Key (MEK) architecture that decouples the vault encryption key from the user\u2019s password. This design enables O(1) password changes\u2014instead of re-encrypting the entire vault, only the MEK wrapper is updated."),
    H.p("The key hierarchy operates as follows:"),
    H.numbered("User enters master password.", "numbers"),
    H.numbered("Argon2id derives a Key Encryption Key (KEK) from password + salt.", "numbers"),
    H.numbered("KEK decrypts the wrapped_mek field in the vault header via AEAD.", "numbers"),
    H.numbered("The unwrapped MEK is used for all subsequent file encryption/decryption and index operations.", "numbers"),
    H.numbered("When the user changes their password, a new KEK is derived and used to re-wrap the same MEK. No file data is re-encrypted.", "numbers"),
    H.spacer(60),
    H.importantBox("Security Property:", "The MEK is generated from the OS CSPRNG (32 bytes of entropy) at vault creation and never derives from the password. Even a weak password produces a MEK with full 256-bit security. Password changes are instant because only the 32-byte wrapper changes."),
    H.spacer(100),

    H.h2("3.3 AEAD Ciphers"),
    H.p("USBVault supports two authenticated encryption algorithms, selectable at vault creation time. Both provide 256-bit key security with authenticated encryption and associated data (AEAD) guarantees."),
    H.makeTable(
      ["Property", "XChaCha20-Poly1305 (Default)", "AES-256-GCM-SIV (FIPS)"],
      [
        ["Cipher ID", "2", "3"],
        ["Key size", "256 bits (32 bytes)", "256 bits (32 bytes)"],
        ["Nonce size", "192 bits (24 bytes)", "96 bits (12 bytes)"],
        ["Tag size", "128 bits (16 bytes)", "128 bits (16 bytes)"],
        ["FIPS 140-3 compliant", "No", "Yes"],
        ["Nonce-misuse resistant", "No (but 192-bit nonce space makes collision negligible)", "Yes (SIV construction)"],
        ["Performance", "Excellent on all CPUs (no AES-NI required)", "Excellent with AES-NI; slower without"],
        ["Default for", "Individual, Team tiers", "Government, FIPS-required environments"],
        ["Rust crate", "chacha20poly1305", "aes-gcm-siv"],
      ],
      [2400, 3480, 3480]
    ),
    H.caption("Table 3.3 \u2014 AEAD Cipher Comparison"),
    H.spacer(100),

    H.h2("3.4 Streaming Encryption Protocol"),
    H.p("Files of arbitrary size are encrypted using a chunked streaming protocol that operates in constant memory (approximately 128 KiB per stream). Each 64 KiB plaintext chunk is independently sealed with AEAD, using a per-chunk nonce derived via HKDF."),
    H.p("The streaming protocol guarantees several critical security properties: chunk reordering detection (via sequential nonce derivation), chunk truncation detection (via final HMAC), chunk duplication detection (via nonce uniqueness), and chunk substitution detection (via AEAD authentication tags). A file cannot be partially decrypted\u2014if any chunk fails authentication, the entire operation aborts."),
    H.makeTable(
      ["Property", "Value"],
      [
        ["Chunk size", "65,536 bytes (64 KiB plaintext)"],
        ["Nonce derivation", "HKDF-SHA256(base_nonce, chunk_index, \u201Cusbvault-chunk-v2\u201D)"],
        ["Max file size", "~256 TiB (2\u00B3\u00B2 chunks \u00D7 64 KiB)"],
        ["Memory usage", "~128 KiB (two chunk buffers)"],
        ["Final integrity", "HMAC-SHA256 over entire serialized record"],
        ["Implementation", "usbvault-crypto/src/streaming.rs"],
      ],
      [2400, 6960]
    ),
    H.caption("Table 3.4 \u2014 Streaming Encryption Properties"),
    H.spacer(100),

    H.h2("3.5 HMAC Integrity Verification"),
    H.p("USBVault uses HMAC-SHA256 for two distinct integrity purposes, each with a unique domain-separation prefix to prevent cross-protocol attacks:"),
    H.spacer(60),
    H.h3("3.5.1 Header HMAC"),
    H.p("The header HMAC covers all header fields. During computation, the header_hmac field itself is zeroed (set to 32 bytes of 0x00), then the HMAC is computed over the entire 24 KiB header, and the result is written into the header_hmac field. Verification follows the same zero-then-compute process and uses a constant-time comparison (subtle crate)."),
    H.spacer(60),
    H.h3("3.5.2 Fail Counter HMAC"),
    H.p("The fail counter is protected with a domain-separated HMAC using the prefix \u201CUSBVault-FailCounter-v1:\u201D concatenated with the counter bytes. This prevents an attacker from resetting the fail counter by directly editing bytes on the USB drive. Without the HMAC key (derived from the password via Argon2id), any modification to the fail counter is detected and treated as tampering."),
    H.spacer(100),

    H.h2("3.6 Password Verification Marker"),
    H.p("To verify a user\u2019s password without revealing the MEK, USBVault encrypts the known plaintext string \u201CUSBVAULT_VERIFY_OK_0000\u201D with the MEK during vault creation. On unlock, the system decrypts the verify_ct field: if decryption succeeds and yields the expected string, the password is correct. If AEAD authentication fails, the password is wrong. This approach avoids storing any password hash or verifier on disk."),
    H.spacer(100),

    H.h2("3.7 Self-Destruct Protocol"),
    H.p("When the fail counter reaches 10 (MAX_FAIL_ATTEMPTS), USBVault triggers an irreversible self-destruct sequence:"),
    H.numbered("The wrapped_mek field is overwritten with cryptographically random bytes (32 bytes from OS CSPRNG).", "numbers2"),
    H.numbered("The same field is overwritten with zeros (32 bytes of 0x00).", "numbers2"),
    H.numbered("The field is overwritten again with fresh random bytes.", "numbers2"),
    H.numbered("Each overwrite is followed by an fsync() call to ensure the data is flushed to the physical USB medium.", "numbers2"),
    H.numbered("The header HMAC is recomputed to reflect the destroyed state.", "numbers2"),
    H.p("After self-destruct, the encrypted data records remain on disk but are permanently indistinguishable from random data. The MEK is irrecoverably lost (it exists nowhere else on the device). Recovery is only possible from a cloud backup that contains a pre-destruction copy of the wrapped MEK."),
    H.warning("Self-destruct is by design and cannot be reversed. This is a security feature, not a bug. Users are warned during setup and at fail count 7, 8, and 9."),
    H.spacer(100),

    H.h2("3.8 Exponential Backoff"),
    H.p("Failed password attempts trigger exponentially increasing delays to frustrate brute-force attacks:"),
    H.makeTable(
      ["Attempt", "Delay", "Cumulative Wait"],
      [
        ["1", "2 seconds", "2 seconds"],
        ["2", "4 seconds", "6 seconds"],
        ["3", "8 seconds", "14 seconds"],
        ["4", "16 seconds", "30 seconds"],
        ["5", "32 seconds", "62 seconds"],
        ["6", "64 seconds", "~2 minutes"],
        ["7", "128 seconds", "~4 minutes"],
        ["8", "256 seconds", "~8.5 minutes"],
        ["9", "512 seconds", "~17 minutes"],
        ["10", "SELF-DESTRUCT", "N/A"],
      ],
      [1600, 2400, 5360]
    ),
    H.caption("Table 3.8 \u2014 Exponential Backoff Schedule"),
    H.p("The formula is min(2^failCount \u00D7 1000ms, 3,600,000ms), capped at one hour. Enforcement occurs in vaultOrchestrator.ts, which blocks unlock UI during the cooldown period. The fail counter is persisted on the USB drive with HMAC protection, so switching browsers or computers does not reset it."),
    H.spacer(100),

    H.h2("3.9 Post-Quantum Cryptography"),
    H.p("USBVault includes optional post-quantum protection via hybrid sealed boxes that combine classical X25519 with the NIST-standardized ML-KEM-1024 lattice-based KEM. The hybrid construction ensures security as long as either algorithm remains unbroken."),
    H.makeTable(
      ["Property", "Value"],
      [
        ["Classical KEM", "X25519 (Curve25519 ECDH)"],
        ["Post-quantum KEM", "ML-KEM-1024 (NIST FIPS 203, formerly CRYSTALS-Kyber)"],
        ["Combination", "HKDF-SHA256 with domain \u201Chybrid_seal_x25519_mlkem1024\u201D"],
        ["Security level", "NIST Level 5 (equivalent to AES-256)"],
        ["Feature gated", "Yes (opt-in at vault creation for Individual tier and above)"],
        ["Implementation", "ml-kem crate (Rust), x25519-dalek crate"],
        ["Use case", "Sealed boxes for vault sharing (encrypts MEK to recipient\u2019s public key)"],
      ],
      [2400, 6960]
    ),
    H.caption("Table 3.9 \u2014 Post-Quantum Cryptography Parameters"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  4. USB OPERATIONS
    // ═══════════════════════════════════════════════════════════
    H.h1("4. USB Operations"),
    H.p("USBVault\u2019s USB operations are handled by the companion service, a Node.js/Express application that runs locally on the user\u2019s machine and bridges the web-based frontend to the operating system\u2019s USB subsystem. The companion never transmits data over any network\u2014it binds exclusively to 127.0.0.1:3001."),
    H.spacer(80),

    H.h2("4.1 Partition Layout"),
    H.p("Every USBVault-provisioned USB drive uses a GPT partition table with ExFAT filesystems. Two partitions are created:"),
    H.makeTable(
      ["Partition", "Label", "Size", "Visibility", "Contents"],
      [
        ["TOOLS", "USBVAULT", "500 MB", "Visible to OS", "Platform launchers (.exe, .app, .sh), portable Node.js runtime, companion service, static web app, README, recovery guide"],
        ["SECURE", "(none)", "Remaining space", "Hidden (unmounted after provisioning)", "VAULT.bin (encrypted vault container)"],
      ],
      [1200, 1400, 1200, 1600, 3960]
    ),
    H.caption("Table 4.1 \u2014 USB Drive Partition Layout"),
    H.p("The TOOLS partition is intentionally visible so users can double-click a launcher on any computer without prior software installation. The SECURE partition is immediately unmounted and hidden after provisioning, making it invisible to casual inspection via file browsers or disk management GUIs."),
    H.spacer(100),

    H.h2("4.2 Platform Tools Matrix"),
    H.makeTable(
      ["Operation", "macOS", "Linux", "Windows"],
      [
        ["USB detection", "diskutil list -plist external", "lsblk -J -b", "PowerShell Get-Disk -BusType USB"],
        ["Partitioning", "diskutil partitionDisk", "parted + mkfs.exfat", "PowerShell Clear-Disk + New-Partition"],
        ["Mounting", "diskutil mount", "udisksctl mount", "Add-PartitionAccessPath"],
        ["Ejecting", "diskutil eject", "udisksctl power-off", "10-step PowerShell protocol"],
        ["Hiding", "chflags hidden", "Unmount partition", "attrib +H +S"],
      ],
      [1600, 2400, 2400, 2960]
    ),
    H.caption("Table 4.2 \u2014 Platform-Specific USB Tool Matrix"),
    H.spacer(100),

    H.h2("4.3 Companion API Reference"),
    H.p("The companion exposes 19 REST endpoints, all bound to localhost. Helmet headers, CORS whitelisting, and per-endpoint rate limiting protect every route. All destructive operations (provisioning, reset, compact) are limited to 5 requests per minute."),
    H.makeTable(
      ["Method", "Endpoint", "Category", "Description"],
      [
        ["GET", "/usb/drives", "Detection", "List all connected USB drives with capacity and partition info"],
        ["GET", "/usb/provision/preflight", "Provisioning", "Pre-check drive suitability (size, current partitions, admin status)"],
        ["POST", "/usb/provision", "Provisioning", "Create TOOLS + SECURE partitions, write initial VAULT.bin header"],
        ["POST", "/usb/provision/elevate", "Provisioning", "Request OS-level admin elevation for provisioning"],
        ["POST", "/usb/reset", "Reset", "Wipe and re-provision a USBVault drive"],
        ["POST", "/usb/mount-secure", "Mounting", "Mount the hidden SECURE partition"],
        ["POST", "/usb/unmount-secure", "Mounting", "Unmount and re-hide the SECURE partition"],
        ["POST", "/usb/eject", "Ejection", "Zero-trace cleanup + unmount + safe eject"],
        ["POST", "/usb/zero-trace", "Security", "Execute all 23 forensic artifact cleaners"],
        ["POST", "/usb/zero-trace/scan", "Security", "Scan for forensic artifacts without cleaning"],
        ["GET", "/usb/vaults", "Vault Mgmt", "List all vault containers on a drive"],
        ["POST", "/usb/vault/init", "Vault Mgmt", "Initialize a new vault container"],
        ["GET", "/usb/vault/container/header", "I/O", "Read vault header (24 KiB)"],
        ["PUT", "/usb/vault/container/header", "I/O", "Write updated vault header"],
        ["GET", "/usb/vault/container/bytes", "I/O", "Read encrypted bytes at offset+length from VAULT.bin"],
        ["POST", "/usb/vault/container/append", "I/O", "Append encrypted record to VAULT.bin (fsync)"],
        ["GET", "/usb/vault/container/size", "I/O", "Current VAULT.bin file size"],
        ["GET", "/usb/vault/container/capacity", "I/O", "Available capacity on SECURE partition"],
        ["POST", "/usb/vault/container/compact", "Maintenance", "Rewrite VAULT.bin with only active records"],
      ],
      [800, 2800, 1400, 4360]
    ),
    H.caption("Table 4.3 \u2014 Companion REST API Reference (19 Endpoints)"),
    H.spacer(100),

    H.h2("4.4 50% Capacity Rule"),
    H.p("VAULT.bin is never allowed to exceed 50% of the SECURE partition\u2019s total capacity. This safeguard reserves space for index updates, temporary compaction files, and filesystem metadata. The companion enforces this rule on every append operation, returning HTTP 507 (Insufficient Storage) with error code DISK_FULL if the threshold would be exceeded."),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  5. SECURITY MODULES
    // ═══════════════════════════════════════════════════════════
    H.h1("5. Security Modules"),
    H.p("USBVault Enterprise implements a twelve-layer defense-in-depth security architecture. Each layer operates independently: the failure or compromise of any single layer does not reduce the protection provided by the remaining layers. This section documents each layer with its implementation status and technical details."),
    H.spacer(80),

    H.h2("5.1 Defense-in-Depth Layers"),
    H.makeStatusTable(
      ["Layer", "Name", "Status", "Implementation"],
      [
        ["L1", "Steganographic Delivery", "Planned (V4.0)", "Hide VAULT.bin inside carrier files (PNG/JPEG/WAV)"],
        ["L2", "Hardware Key (FIDO2)", "Complete", "WebAuthn PRF/hmac-secret extension; XOR into key derivation"],
        ["L3", "Cloud Split-Key", "Planned (V3.0)", "HKDF(LOCAL_KEY || REMOTE_KEY) = MASTER_KEY"],
        ["L4", "Authenticated Encryption", "Complete", "XChaCha20-Poly1305 / AES-256-GCM-SIV per-chunk AEAD"],
        ["L5", "Memory-Hard KDF", "Complete", "Argon2id: 64 MiB, 3 iterations, 4 parallel lanes"],
        ["L6", "Memory Protection", "Complete", "mlock (3 platforms), guard pages (mmap PROT_NONE), Zeroize on drop"],
        ["L7", "Hidden Partition", "Complete", "SECURE partition unmounted after provisioning; invisible to OS"],
        ["L8", "Hidden File Attributes", "Complete", "chflags hidden (macOS), attrib +H +S (Windows), unmount (Linux)"],
        ["L9", "Encrypted Filenames", "Complete", "File names encrypted within AEAD metadata chunks in index"],
        ["L10", "Zero-Trace Cleanup", "Complete", "23 forensic artifact cleaners across 3 platforms; auto on eject"],
        ["L11", "App Password + Lockout", "Complete", "Secondary gate: PBKDF2-SHA256, 150K iterations, 12-char min, 3 attempts"],
        ["L12", "Crash-Safe Dual-Index", "Complete", "Dual index slots, monotonic commit counter, append-only writes, fsync"],
      ],
      [600, 2200, 1600, 4960],
      2
    ),
    H.caption("Table 5.1 \u2014 Twelve-Layer Defense-in-Depth Architecture"),
    H.spacer(100),

    H.h2("5.2 Boot Hardening"),
    H.p("Upon application launch, USBVault executes a six-stage boot hardening sequence that establishes the security perimeter before any user interaction occurs:"),
    H.makeTable(
      ["Stage", "Name", "Purpose"],
      [
        ["1", "Anti-Debug", "Device integrity verification; detects debugging tools and instrumentation"],
        ["2", "Integrity", "Content Security Policy enforcement; verifies code signature integrity"],
        ["3", "Memory Lock", "Initializes WebCrypto subsystem; locks critical memory regions"],
        ["4", "Brute-Force", "Loads fail state from vault header; activates cooldown enforcement"],
        ["5", "Self-Destruct", "Arms self-destruct callbacks; registers fail counter listeners"],
        ["6", "Ghost Mode", "Re-activates zero-trace monitoring; schedules periodic artifact scanning"],
      ],
      [800, 1800, 6760]
    ),
    H.caption("Table 5.2 \u2014 Boot Hardening Stages"),
    H.pageBreak(),

    H.h2("5.3 Zero-Trace Coverage"),
    H.p("USBVault implements 23 distinct forensic artifact cleaners that remove evidence of USB drive usage and file access across all three supported platforms. These cleaners execute automatically during the eject sequence and can also be triggered manually."),
    H.spacer(60),
    H.h3("5.3.1 Windows Artifacts (12 Types)"),
    H.makeTable(
      ["Artifact", "Location", "Privilege"],
      [
        ["Recent Items (.lnk)", "User profile", "User"],
        ["Jump Lists", "AppData", "User"],
        ["Thumbnail Cache", "AppData\\Local", "User"],
        ["Shellbags (Registry)", "NTUSER.DAT", "User"],
        ["Registry MRU", "HKCU\\Software", "User"],
        ["Search Index", "Windows Search DB", "User"],
        ["Recycle Bin", "$Recycle.Bin", "User"],
        ["USB Volume Metadata", "Registry", "User"],
        ["Session Files", "Browser profiles", "User"],
        ["Temp Artifacts", "%TEMP%", "User"],
        ["Prefetch", "C:\\Windows\\Prefetch", "Admin"],
        ["Event Logs", "C:\\Windows\\System32\\winevt", "Admin"],
      ],
      [2400, 3200, 3760]
    ),
    H.caption("Table 5.3.1 \u2014 Windows Zero-Trace Artifacts"),
    H.spacer(60),
    H.h3("5.3.2 macOS Artifacts (6 Types)"),
    H.makeTable(
      ["Artifact", "Location"],
      [
        [".DS_Store", "Volume root and subdirectories"],
        ["QuickLook Cache", "~/Library/Caches/com.apple.QuickLook.thumbnailcache"],
        ["USB Metadata", ".Trashes, .fseventsd, .Spotlight-V100 on volume"],
        ["Recent Documents", "~/Library/Application Support/com.apple.sharedfilelist (TCC-aware)"],
        ["Spotlight Re-index", "Triggers Spotlight re-index to remove file metadata"],
        ["Session Files", "Browser-specific session and history files"],
      ],
      [2400, 6960]
    ),
    H.caption("Table 5.3.2 \u2014 macOS Zero-Trace Artifacts"),
    H.spacer(60),
    H.h3("5.3.3 Linux Artifacts (6 Types)"),
    H.makeTable(
      ["Artifact", "Location"],
      [
        ["recently-used.xbel", "~/.local/share/recently-used.xbel"],
        ["Zeitgeist DB", "~/.local/share/zeitgeist/"],
        ["Thumbnail Cache", "~/.cache/thumbnails/"],
        ["USB Trash Directories", ".Trash-* on volume"],
        ["Temp Files", "/tmp/ and $XDG_RUNTIME_DIR"],
        ["GNOME Tracker Cache", "~/.cache/tracker3/"],
      ],
      [2400, 6960]
    ),
    H.caption("Table 5.3.3 \u2014 Linux Zero-Trace Artifacts"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  6. PASSWORD POLICY
    // ═══════════════════════════════════════════════════════════
    H.h1("6. Password Policy"),
    H.p("USBVault enforces a rigorous, multi-factor password policy that significantly exceeds NIST SP 800-63B and OWASP ASVS requirements. The policy combines minimum length requirements, entropy-based scoring, dictionary checking, and breach database verification to ensure every vault password provides meaningful resistance to offline brute-force attacks."),
    H.spacer(80),

    H.h2("6.1 Master Password Requirements"),
    H.makeTable(
      ["Property", "Value"],
      [
        ["Minimum length", "15 characters (NIST requires 8; OWASP recommends 12)"],
        ["Scoring algorithm", "Entropy-based + OWASP diversity + contextual penalties"],
        ["Weak password dictionary", "98,735 entries via SHA-256 bloom filter (k=10, FPR ~0.1%)"],
        ["Breach database", "Have I Been Pwned (HIBP) k-anonymity API with bloom filter offline fallback"],
        ["Contextual penalties", "Deductions for personal info (email, name) in password"],
        ["Real-time feedback", "Strength meter with entropy estimate and improvement suggestions"],
      ],
      [2800, 6560]
    ),
    H.caption("Table 6.1 \u2014 Master Password Policy"),
    H.spacer(100),

    H.h2("6.2 App Password (Secondary Gate)"),
    H.makeTable(
      ["Property", "Value"],
      [
        ["Purpose", "Optional secondary authentication gate before vault access"],
        ["Algorithm", "PBKDF2-SHA256"],
        ["Iterations", "150,000"],
        ["Minimum length", "12 characters"],
        ["Max attempts", "3 before 30-second lockout"],
        ["Storage", "Derived hash stored in local app settings"],
      ],
      [2800, 6560]
    ),
    H.caption("Table 6.2 \u2014 App Password Parameters"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  7. ERROR CODES
    // ═══════════════════════════════════════════════════════════
    H.h1("7. Error Codes"),
    H.p("USBVault defines 16 typed error codes across two categories: vault operations and USB operations. Error messages are designed to be informative to the user without revealing security-sensitive internal state. No error message ever contains key material, file paths on the host system, or internal algorithm state."),
    H.spacer(80),

    H.h2("7.1 Vault Error Codes"),
    H.makeTable(
      ["Code", "HTTP", "Description", "User Action"],
      [
        ["WRONG_PASSWORD", "401", "AEAD decryption of verify marker failed", "Re-enter password; check caps lock"],
        ["TFA_FAILED", "401", "FIDO2 assertion verification failed", "Retry with correct hardware key"],
        ["LOCKED_OUT", "429", "Exponential backoff cooldown active", "Wait for cooldown timer"],
        ["SELF_DESTRUCTED", "410", "Wrapped MEK has been destroyed (10 failures)", "Restore from backup only"],
        ["BAD_MAGIC", "400", "Header magic does not match USBVLT02/03/04", "File is not a USBVault container"],
        ["BAD_HMAC", "400", "Header HMAC verification failed", "Vault header has been tampered with"],
        ["BAD_INDEX", "500", "Both index slots failed integrity checks", "Contact support; cloud restore"],
        ["CHUNK_AUTH_FAIL", "500", "AEAD tag verification failed on a data chunk", "File data corrupted; restore from backup"],
        ["ROLLBACK_DETECTED", "409", "Commit counter mismatch (potential rollback attack)", "Contact support; verify vault source"],
        ["DISK_FULL", "507", "VAULT.bin would exceed 50% of SECURE partition", "Delete files or compact vault"],
      ],
      [1800, 600, 3400, 3560]
    ),
    H.caption("Table 7.1 \u2014 Vault Error Codes"),
    H.spacer(100),

    H.h2("7.2 USB Error Codes"),
    H.makeTable(
      ["Code", "HTTP", "Description", "User Action"],
      [
        ["NO_USB", "404", "No USB drives detected by OS", "Connect a USB drive; try a different port"],
        ["EJECT_FAILED", "500", "OS refused to eject (files in use or permission denied)", "Close open files; retry"],
        ["PROVISION_FAILED", "500", "Partitioning or filesystem creation failed", "Check drive health; try different drive"],
        ["MOUNT_FAILED", "500", "SECURE partition could not be mounted", "Verify partition exists; check permissions"],
        ["ADMIN_REQUIRED", "403", "Operation requires administrator privileges", "Grant admin access when prompted"],
        ["ADMIN_AUTH_FAILED", "401", "User denied or failed admin elevation", "Approve admin prompt to continue"],
      ],
      [2000, 600, 3400, 3360]
    ),
    H.caption("Table 7.2 \u2014 USB Error Codes"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  8. BUILD SYSTEM
    // ═══════════════════════════════════════════════════════════
    H.h1("8. Build System & CI/CD"),
    H.p("USBVault uses a multi-language build pipeline with strict quality gates at every stage. The build system produces optimized, stripped binaries for the Rust core; a bundled React Native application for web, iOS, and Android; a Docker-containerized Go server; and a portable Node.js companion package."),
    H.spacer(80),

    H.makeTable(
      ["Subsystem", "Build Command", "Optimizations", "Output"],
      [
        ["usbvault-crypto", "cargo build --release", "LTO, strip symbols, panic=abort", "Native library (.so/.dylib/.dll)"],
        ["usbvault-app", "expo export --platform web", "Tree shaking, minification, code splitting", "Static web app bundle"],
        ["usbvault-server", "go build -ldflags -s -w", "Symbol stripping, static linking", "Single binary (Alpine Docker)"],
        ["usb-companion", "npm ci --production", "Production dependencies only", "Node.js package on TOOLS partition"],
      ],
      [1600, 2400, 2800, 2560]
    ),
    H.caption("Table 8.1 \u2014 Build Pipeline Summary"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  9. TESTING
    // ═══════════════════════════════════════════════════════════
    H.h1("9. Testing"),
    H.p("USBVault maintains 340 test files across three subsystems, with a strong emphasis on cryptographic correctness through property-based testing (fuzzing) and compatibility testing against known test vectors."),
    H.spacer(80),

    H.h2("9.1 Rust Test Suites (234 Tests)"),
    H.makeTable(
      ["Suite", "Count", "Coverage Area"],
      [
        ["Unit tests (lib)", "77", "Individual function correctness: KDF, AEAD, HMAC, nonce derivation"],
        ["Format compatibility", "28", "Cross-version vault reading (V2/V3/V4), header parsing, migration"],
        ["Integration tests", "40", "End-to-end encrypt/decrypt flows, multi-file vaults, concurrent access"],
        ["Property tests (proptest)", "19", "Fuzzing: random inputs to KDF, AEAD, streaming; roundtrip invariants"],
        ["Sharing tests", "32", "Sealed boxes, PQC hybrid KEM, key agreement, multi-recipient"],
        ["SRP protocol tests", "23", "Full SRP-6a handshake, bad verifier rejection, timing consistency"],
        ["Vault lifecycle tests", "15", "Create/unlock/add/remove/compact/migrate/self-destruct sequences"],
      ],
      [2200, 800, 6360]
    ),
    H.caption("Table 9.1 \u2014 Rust Test Suite Breakdown"),
    H.spacer(100),

    H.h2("9.2 TypeScript & Go Tests"),
    H.makeTable(
      ["Subsystem", "Test Files", "Framework", "Key Coverage Areas"],
      [
        ["TypeScript (app)", "45", "Jest + Playwright", "UI flows, state management, crypto bridge, error handling, i18n"],
        ["Go (server)", "61", "go test", "Authentication, billing, sharing, sync, middleware, BOLA prevention"],
      ],
      [1800, 1000, 1800, 4760]
    ),
    H.caption("Table 9.2 \u2014 TypeScript and Go Test Coverage"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  10. CONSTANTS REFERENCE
    // ═══════════════════════════════════════════════════════════
    H.h1("10. Constants Reference"),
    H.p("The following named constants govern USBVault\u2019s behavior and are defined across the four subsystems. All values are compile-time or initialization-time constants that cannot be modified at runtime."),
    H.makeTable(
      ["Constant", "Value", "Type", "Location"],
      [
        ["HEADER_SIZE_V4", "24,576", "usize", "usbvault-crypto/src/vault/header.rs"],
        ["MAGIC_V4", "USBVLT04", "ASCII", "usbvault-crypto/src/vault/header.rs"],
        ["CHUNK_SIZE", "65,536", "usize", "usbvault-crypto/src/streaming.rs"],
        ["REC_MAGIC_CHUNKED", "V2RC", "ASCII", "usbvault-crypto/src/streaming.rs"],
        ["ARGON2_MEMORY_KIB", "65,536", "u32", "usbvault-crypto/src/kdf.rs"],
        ["ARGON2_TIME_COST", "3", "u32", "usbvault-crypto/src/kdf.rs"],
        ["ARGON2_PARALLELISM", "4", "u32", "usbvault-crypto/src/kdf.rs"],
        ["MAX_FAIL_ATTEMPTS", "10", "u32", "usbvault-crypto/src/vault/header.rs"],
        ["SELF_DESTRUCT_PASSES", "3", "u32", "usbvault-crypto/src/vault/header.rs"],
        ["FAIL_COUNTER_HMAC_DOMAIN", "USBVault-FailCounter-v1:", "str", "usbvault-crypto/src/vault/header.rs"],
        ["VAULT_SIZE_LIMIT_PERCENT", "0.50", "f64", "usb-companion/src/services/vaultContainerService.js"],
        ["MAX_BACKOFF_MS", "3,600,000", "u64", "usbvault-app/src/services/vaultOrchestrator.ts"],
        ["PASSWORD_MIN_LENGTH", "15", "usize", "usbvault-app/src/services/passwordPolicy.ts"],
        ["APP_PASSWORD_MIN_LENGTH", "12", "usize", "usbvault-app/src/services/security/appPassword.ts"],
        ["APP_PASSWORD_PBKDF2_ITERS", "150,000", "u32", "usbvault-app/src/services/security/appPassword.ts"],
        ["BLOOM_ENTRIES", "98,735", "usize", "usbvault-app/src/services/weakPasswordBloom.ts"],
        ["BLOOM_K", "10", "u8", "usbvault-app/src/services/weakPasswordBloom.ts"],
        ["COMPANION_PORT", "3001", "u16", "usb-companion/src/index.js"],
        ["TOOLS_PARTITION_MB", "500", "u32", "usb-companion/src/services/usbProvisioner.js"],
      ],
      [2600, 1800, 800, 4160]
    ),
    H.caption("Table 10.1 \u2014 Named Constants Reference"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  APPENDIX A: ARCHITECTURE DECISION RECORDS
    // ═══════════════════════════════════════════════════════════
    H.h1("Appendix A: Architecture Decision Records"),
    H.p("The following ADRs document key technology and design decisions made during USBVault Enterprise development. Each records the context, decision rationale, and consequences."),
    H.spacer(80),
    H.makeTableBoldFirst(
      ["ADR", "Title", "Rationale Summary"],
      [
        ["ADR-001", "Go backend (not Python/Django)", "Go offers superior concurrency, static typing, single-binary deployment, and lower memory footprint for a security-focused server."],
        ["ADR-002", "Rust crypto core (not Python/Cython)", "Rust\u2019s memory safety guarantees, zero-cost abstractions, and Zeroize trait eliminate entire classes of crypto implementation bugs."],
        ["ADR-003", "Expo/React Native (not Qt/PySide6)", "Cross-platform web+mobile from single codebase; modern React ecosystem; TypeScript type safety."],
        ["ADR-004", "PostgreSQL primary store", "ACID transactions, JSON support, mature ecosystem, excellent pgx driver for Go."],
        ["ADR-005", "XChaCha20-Poly1305 default AEAD", "192-bit nonce eliminates collision risk; no AES-NI dependency; recommended by libsodium/NaCl."],
        ["ADR-006", "Zero-knowledge architecture", "Server never handles plaintext; eliminates server compromise as an attack vector."],
        ["ADR-007", "Redis for sessions/rate-limiting", "Sub-millisecond key-value lookups; atomic increment for rate limiting; built-in TTL."],
        ["ADR-008", "S3 blob storage", "Scalable, durable (11 nines), cost-effective encrypted blob storage with cross-region replication."],
        ["ADR-009", "ML-KEM-1024 post-quantum KEM", "NIST Level 5 post-quantum security; hybrid with X25519 provides defense-in-depth."],
        ["ADR-010", "Zustand state management", "Minimal boilerplate; React hooks integration; 7 independent stores for separation of concerns."],
        ["ADR-011", "PQC Hybrid vs V3 fixed header", "Feature-gated PQC keeps V4 header compact; avoids format complexity for non-PQC vaults."],
        ["ADR-012", "Zustand reactive stores vs Qt signals", "Modern React patterns; simpler testing; type-safe selectors with TypeScript."],
        ["ADR-013", "Rust FFI vs Cython compilation", "FFI boundary is narrower and safer; Rust\u2019s memory model prevents use-after-free in crypto code."],
        ["ADR-014", "Build pipeline vs Ed25519 manifest", "Build pipeline verification is sufficient for current threat model; Ed25519 deferred to V3."],
      ],
      [1000, 2800, 5560]
    ),
    H.caption("Table A.1 \u2014 Architecture Decision Records (ADR-001 through ADR-014)"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  APPENDIX B: THREAT MODEL
    // ═══════════════════════════════════════════════════════════
    H.h1("Appendix B: Threat Model"),
    H.p("The following threat model enumerates the primary attack vectors against USBVault Enterprise and documents the mitigations implemented for each. Likelihood assessments assume a motivated adversary with physical access to the USB drive and network access to the cloud backend."),
    H.spacer(80),
    H.makeTable(
      ["ID", "Threat", "Likelihood", "Impact", "Mitigation"],
      [
        ["T1", "Brute-force password", "Medium", "Critical", "Argon2id (64 MiB) + exponential backoff + self-destruct at 10 attempts"],
        ["T2", "Header tampering", "Low", "High", "HMAC-SHA256 with domain separation; constant-time verification"],
        ["T3", "Nonce reuse", "Very Low", "Critical", "24-byte nonces + HKDF derivation + runtime reuse detection"],
        ["T4", "Memory dump", "Low", "High", "mlock, guard pages (mmap PROT_NONE), Zeroize on drop"],
        ["T5", "Quantum computing", "Low (future)", "Critical", "ML-KEM-1024 + X25519 hybrid; secure if either holds"],
        ["T6", "Index corruption", "Medium", "Medium", "Dual-index slots + monotonic commit counter + atomic commits"],
        ["T7", "Weak password", "Medium", "Critical", "15-char minimum + bloom filter + HIBP + entropy scoring"],
        ["T8", "Forensic recovery", "Medium", "High", "23 artifact cleaners + auto-clean on eject + restart advisory"],
        ["T9", "Rollback attack", "Low", "High", "Monotonic counter + state_version + HMAC-protected fail counter"],
        ["T10", "USB interception", "Medium", "Medium", "All data encrypted at rest; hidden partition; no plaintext on disk"],
        ["T11", "Companion abuse", "Low", "Medium", "Localhost-only binding; CORS whitelist; rate limiting; input validation"],
        ["T12", "Supply chain attack", "Low", "Critical", "cargo-audit + gosec + npm audit + Snyk; dependency pinning"],
        ["T13", "Side-channel attack", "Low", "High", "Constant-time comparisons (subtle crate); no branching on secrets"],
      ],
      [500, 1600, 1000, 1000, 5260]
    ),
    H.caption("Table B.1 \u2014 USBVault Enterprise Threat Model"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  GLOSSARY
    // ═══════════════════════════════════════════════════════════
    ...H.glossarySection([
      ["AEAD", "Authenticated Encryption with Associated Data. Encryption scheme that simultaneously provides confidentiality, integrity, and authenticity."],
      ["Argon2id", "Memory-hard password hashing algorithm. Hybrid mode combining data-dependent and data-independent addressing for resistance to GPU and side-channel attacks."],
      ["Bloom Filter", "Probabilistic data structure used to test set membership. USBVault uses a SHA-256 bloom filter with 98,735 entries and k=10 hash functions for weak password detection."],
      ["CSPRNG", "Cryptographically Secure Pseudo-Random Number Generator. Operating system\u2019s randomness source used for key generation and salt creation."],
      ["FIDO2", "Fast IDentity Online 2. Open authentication standard using public key cryptography and hardware security keys."],
      ["HKDF", "HMAC-based Key Derivation Function (RFC 5869). Used for domain-separated nonce derivation and PQC key combination."],
      ["KEK", "Key Encryption Key. Derived from the user\u2019s password via Argon2id; used to wrap/unwrap the MEK."],
      ["MEK", "Master Encryption Key. 256-bit key generated from OS CSPRNG; encrypts all vault data and indexes."],
      ["ML-KEM-1024", "Module Lattice-based Key Encapsulation Mechanism. NIST FIPS 203 post-quantum standard (formerly CRYSTALS-Kyber)."],
      ["PQC", "Post-Quantum Cryptography. Cryptographic algorithms designed to resist quantum computer attacks."],
      ["SRP-6a", "Secure Remote Password protocol version 6a. Zero-knowledge password authentication where the server never sees the password."],
      ["V2RC", "Version 2 Record, Chunked. USBVault\u2019s streaming encryption format for authenticated chunk-by-chunk file encryption."],
      ["WebAuthn", "Web Authentication API. W3C standard for strong authentication using public key credentials and hardware security keys."],
      ["XChaCha20-Poly1305", "Stream cipher (XChaCha20) with MAC (Poly1305). 256-bit key, 192-bit nonce AEAD cipher. USBVault\u2019s default encryption algorithm."],
      ["Zeroize", "Rust trait that securely overwrites memory with zeros when a value is dropped, preventing secret data from lingering in memory."],
    ]),

    // ─── END ──────────────────────────────────────────────────
    H.spacer(400),
    H.p([H.italic("End of Document \u2014 USBVault Enterprise Technical Specification v2.0 \u2014 March 15, 2026")], { alignment: H.AlignmentType.CENTER }),
  ];

  await H.buildDoc({
    filename: "USBVault_Enterprise_Technical_Specification_v2.docx",
    headerTitle: "USBVault Enterprise \u2014 Technical Specification",
    headerClassification: "CONFIDENTIAL",
    footerDocId: "DOC-001",
    footerVersion: "2.0",
    children,
    outDir,
  });
}

module.exports = { generate };
