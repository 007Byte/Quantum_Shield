/**
 * DOC-006: USBVault Enterprise — Security Audit Package v2.0
 * Audience: Third-Party Penetration Testers, Security Auditors
 */

const H = require("./doc_helpers");

async function generate(outDir) {
  console.log("Generating DOC-006: Security Audit Package...");

  const children = [
    ...H.coverPage({
      title: "Security Audit Package",
      subtitle: "Fortress Enterprise \u2014 Penetration Testing & Cryptographic Audit Reference",
      docId: "DOC-006", version: "2.0", date: "March 15, 2026",
      classification: "CONFIDENTIAL",
      audience: "Third-Party Penetration Testers, Security Auditors",
    }),
    ...H.documentControlPage({
      distribution: [
        ["Security Team", "Full Access"],
        ["Approved Pen Test Firm (under NDA)", "Full Access"],
        ["Core Engineering", "Full Access"],
        ["Executive Leadership", "Summary Only"],
      ],
    }),
    ...H.toc(),

    // 1
    H.h1("1. Audit Scope"),
    H.p("This security audit package covers all attack surfaces of USBVault Enterprise v2.0 (codename \u201CFortress Enterprise\u201D). The audit scope encompasses four distinct subsystems, each with its own technology stack, threat model, and attack surface."),
    H.makeTableBoldFirst(
      ["Subsystem", "Technology", "Endpoints / Surface", "Critical Assets"],
      [
        ["usb-companion", "Node.js / Express", "19 REST endpoints, localhost:3001", "USB I/O, partition management, zero-trace"],
        ["usbvault-app", "TypeScript / React", "37-page SPA, Rust FFI bridge", "Password handling, key material (briefly), UI logic"],
        ["usbvault-crypto", "Rust (native library)", "FFI interface to frontend", "ALL key material, AEAD, KDF, vault format"],
        ["usbvault-server", "Go 1.25", "SRP-6a, JWT, FIDO2, Stripe, S3, WebSocket", "Auth tokens, encrypted blobs, billing data"],
      ],
      [1600, 1600, 2800, 3360]
    ),
    H.caption("Table 1.1 \u2014 Audit Scope by Subsystem"),
    H.pageBreak(),

    // 2
    H.h1("2. Architecture Overview"),
    H.p("USBVault uses a zero-knowledge, four-subsystem architecture. All cryptographic operations execute client-side in the Rust core. The server handles only encrypted blobs and authentication tokens. This section documents the trust boundaries that auditors should verify."),
    H.spacer(80),
    H.h2("2.1 Trust Boundaries"),
    H.makeTable(
      ["Boundary", "What Crosses", "What NEVER Crosses"],
      [
        ["App \u2194 Rust FFI", "Password (once), encrypted bytes, vault header bytes", "Derived keys (KEK, MEK), HMAC keys, plaintext"],
        ["App \u2194 Companion", "Encrypted bytes, drive IDs, partition metadata", "Passwords, keys, plaintext data"],
        ["App \u2194 Server", "Encrypted blobs, JWT tokens, SRP messages, FIDO2 assertions", "Vault password, MEK, KEK, plaintext content"],
        ["Companion \u2194 USB", "Raw encrypted bytes (with fsync)", "Keys, plaintext data"],
      ],
      [1800, 3780, 3780]
    ),
    H.caption("Table 2.1 \u2014 Trust Boundary Contracts"),
    H.spacer(60),
    H.h2("2.2 Audit Verification Points"),
    H.bullet("Verify the Rust FFI boundary does not leak key material to JavaScript heap"),
    H.bullet("Verify the companion cannot be bound to non-localhost addresses"),
    H.bullet("Verify server API responses contain no plaintext vault data under any error condition"),
    H.bullet("Verify CORS headers reject requests from unlisted origins"),
    H.pageBreak(),

    // 3
    H.h1("3. Cryptographic Algorithms"),
    H.makeTable(
      ["Function", "Algorithm", "Parameters", "Implementation"],
      [
        ["KDF", "Argon2id (v19)", "64 MiB, 3 iterations, 4 parallel, 64B output, 32B salt", "usbvault-crypto/src/kdf.rs"],
        ["Default AEAD", "XChaCha20-Poly1305", "256-bit key, 192-bit nonce, 128-bit tag", "usbvault-crypto/src/cipher.rs"],
        ["FIPS AEAD", "AES-256-GCM-SIV", "256-bit key, 96-bit nonce, 128-bit tag", "usbvault-crypto/src/cipher.rs"],
        ["Header integrity", "HMAC-SHA256", "256-bit key, domain-separated", "usbvault-crypto/src/vault/header.rs"],
        ["Fail counter", "HMAC-SHA256", "Domain: \u201CUSBVault-FailCounter-v1:\u201D + counter bytes", "usbvault-crypto/src/vault/header.rs"],
        ["PQC KEM", "X25519 + ML-KEM-1024", "HKDF combination, feature-gated", "usbvault-crypto/src/pqc/hybrid.rs"],
        ["Nonce derivation", "HKDF-SHA256", "Per-chunk: HKDF(base_nonce, index, domain)", "usbvault-crypto/src/streaming.rs"],
        ["App password", "PBKDF2-SHA256", "150,000 iterations, 12-char minimum", "usbvault-app/src/services/security/"],
        ["Password verify", "AEAD decrypt", "Decrypt known plaintext USBVAULT_VERIFY_OK_0000", "usbvault-crypto/src/vault/header.rs"],
      ],
      [1400, 2000, 3160, 2800]
    ),
    H.caption("Table 3.1 \u2014 Cryptographic Algorithm Reference"),
    H.spacer(100),

    H.h2("3.1 Crypto Audit Points"),
    H.bullet("Verify Argon2id parameters cannot be weakened by untrusted input (salt, memory, iterations are read from trusted header, not user-controlled)"),
    H.bullet("Verify per-chunk nonce derivation (HKDF) prevents reuse across chunks and files"),
    H.bullet("Verify constant-time comparison (subtle crate) for ALL tag/HMAC verification paths"),
    H.bullet("Verify HMAC computation zeroes the HMAC field in header before computing"),
    H.bullet("Verify PQC HKDF uses proper domain separation (\u201Chybrid_seal_x25519_mlkem1024\u201D)"),
    H.bullet("Verify MEK is generated from OS CSPRNG (not derived from password)"),
    H.bullet("Verify wrapped_mek AEAD uses authenticated encryption (not just encryption)"),
    H.bullet("Verify self-destruct 3-pass overwrite includes fsync between each pass"),
    H.bullet("Verify nonce reuse detection in runtime (streaming.rs)"),
    H.pageBreak(),

    // 4
    H.h1("4. Key Lifecycle"),
    H.p("The following table documents every phase of the encryption key lifecycle. Auditors should verify each \u201CVerify\u201D column entry."),
    H.makeTable(
      ["Phase", "Operation", "Verify"],
      [
        ["Generation", "MEK from OS CSPRNG (32 bytes)", "Source is /dev/urandom or CryptGenRandom, not a PRNG seed"],
        ["Derivation", "Password + salt \u2192 Argon2id \u2192 64B \u2192 split", "Parameters not user-configurable; salt from CSPRNG"],
        ["Wrapping", "AEAD_encrypt(KEK, MEK) \u2192 wrapped_mek", "Authenticated (tag verified before use on unwrap)"],
        ["Unwrapping", "AEAD_decrypt(KEK, wrapped_mek) \u2192 MEK", "Fail counter incremented BEFORE unwrap attempt"],
        ["Usage", "MEK encrypts file data + index", "MEK never serialized across FFI; mlock\u2019d in Rust memory"],
        ["Rotation", "New KEK wraps existing MEK", "Old wrapped_mek overwritten; fsync; HMAC updated"],
        ["Zeroing", "Zeroize on Drop; mlock; guard pages", "Memory dumps after session end show no key residual"],
        ["Self-destruct", "3-pass: random \u2192 zeros \u2192 random", "All 3 passes complete; fsync after each; header HMAC updated"],
      ],
      [1400, 3400, 4560]
    ),
    H.caption("Table 4.1 \u2014 Key Lifecycle Audit Matrix"),
    H.pageBreak(),

    // 5
    H.h1("5. Authentication Flows"),
    H.h2("5.1 SRP-6a (Cloud Mode)"),
    H.p("The server NEVER receives the user\u2019s password. SRP-6a authentication follows the standard protocol:"),
    H.numbered("Client sends username to server.", "numbers"),
    H.numbered("Server returns salt and B (server public ephemeral).", "numbers"),
    H.numbered("Client computes A (client public ephemeral) and M1 (client proof).", "numbers"),
    H.numbered("Server verifies M1 (timing-safe comparison), returns M2 (server proof) + JWT.", "numbers"),
    H.numbered("Client verifies M2, stores JWT for session.", "numbers"),
    H.spacer(60),
    H.h3("SRP-6a Audit Points"),
    H.bullet("Verify timing-safe M1 comparison (prevents timing side-channel)"),
    H.bullet("Verify server rejects A = 0 (mod N) (prevents trivial authentication bypass)"),
    H.bullet("Verify N (safe prime) and g (generator) are from RFC 5054 or equivalent"),
    H.bullet("Verify SRP state is stored in Redis with short TTL (prevents replay)"),
    H.spacer(80),

    H.h2("5.2 FIDO2 / WebAuthn"),
    H.p("FIDO2 adds a physical second factor using the PRF/hmac-secret extension. The PRF output is XORed into the key derivation chain, so both the password AND the physical key are required."),
    H.h3("FIDO2 Audit Points"),
    H.bullet("Verify origin validation and RP ID matching (prevents phishing relay)"),
    H.bullet("Verify user verification flag is checked (UV = true)"),
    H.bullet("Verify PRF output is domain-separated before XOR with enc_key"),
    H.bullet("Verify recovery blob is AEAD-encrypted with password-derived key (not stored in plaintext)"),
    H.spacer(80),

    H.h2("5.3 USB Standalone Mode"),
    H.p("In USB-only mode, there is no server authentication. The vault password serves as both authentication and encryption key derivation input. The companion service provides no authentication of its own\u2014it is localhost-only and relies on the browser same-origin policy."),
    H.bullet("Verify companion binds only to 127.0.0.1 (not 0.0.0.0)"),
    H.bullet("Verify CORS whitelist rejects non-localhost origins"),
    H.pageBreak(),

    // 6
    H.h1("6. Input Validation"),
    H.makeTable(
      ["Input", "Validation Rule", "Subsystem"],
      [
        ["Drive ID", "Alphanumeric + hyphens, max 128 characters", "Companion"],
        ["Vault name", "UTF-8, max 128 characters, no path separators (/ \\ : * ? \" < > |)", "Companion"],
        ["File paths", "Canonicalized; must be within SECURE mount point (no traversal)", "Companion"],
        ["Byte offsets", "Non-negative integer; within VAULT.bin bounds (0 to file size)", "Companion"],
        ["Mount points", "Verified against OS-reported mount list (not user-supplied)", "Companion"],
        ["Email", "RFC 5322 format; max 254 characters", "Server"],
        ["Password (SRP)", "Min 15 characters; entropy scoring; bloom filter; HIBP check", "App + Server"],
        ["JWT tokens", "HS256/RS256 signature validation; expiry check; issuer validation", "Server"],
        ["WebAuthn data", "CBOR parsing; origin check; RP ID match; counter increment", "Server"],
      ],
      [1600, 4560, 3200]
    ),
    H.caption("Table 6.1 \u2014 Input Validation Rules"),
    H.pageBreak(),

    // 7
    H.h1("7. Rate Limiting"),
    H.makeTable(
      ["Category", "Limit", "Scope", "Action on Exceed"],
      [
        ["Companion general", "60 req/min", "Per client (localhost)", "HTTP 429 Too Many Requests"],
        ["Companion destructive", "5 req/min", "Per client", "HTTP 429 + logged as alert"],
        ["Server auth", "Configurable (rec: 10/min)", "Per IP address", "HTTP 429 + temporary IP block"],
        ["Server API", "Configurable per tier", "Per authenticated user", "HTTP 429 + tier upgrade prompt"],
        ["Vault unlock", "Exponential backoff (2^n seconds)", "Per vault (hardware-enforced)", "SELF_DESTRUCT at attempt 10"],
      ],
      [2000, 2200, 2200, 2960]
    ),
    H.caption("Table 7.1 \u2014 Rate Limiting Configuration"),
    H.pageBreak(),

    // 8
    H.h1("8. Memory Security"),
    H.makeTableBoldFirst(
      ["Mechanism", "Implementation", "Purpose", "Verify"],
      [
        ["Zeroize on Drop", "zeroize crate (Rust)", "Clear key material on scope exit", "Memory dump shows no residual after drop"],
        ["mlock", "Platform-specific (libc)", "Prevent swap/page to disk", "Key pages marked MLOCK in /proc/pid/maps"],
        ["Guard pages", "mmap(PROT_NONE)", "Detect buffer overflows", "Adjacent pages trigger SIGSEGV on access"],
        ["Constant-time", "subtle crate (Rust)", "Prevent timing side-channels", "No branching on secret data in comparison loops"],
        ["No key serialization", "Type system (Rust)", "Prevent accidental key export", "Key types: no Clone, no Serialize, no Debug"],
        ["JS memory zeroing", "Best-effort ArrayBuffer.fill(0)", "Clear password in JS heap", "Limited by GC; documented as known limitation"],
      ],
      [1600, 1800, 2400, 3560]
    ),
    H.caption("Table 8.1 \u2014 Memory Security Mechanisms"),
    H.pageBreak(),

    // 9
    H.h1("9. Known Limitations"),
    H.p("The following are known security limitations that are documented by design. These should be noted in audit findings but are accepted risks."),
    H.makeTable(
      ["Limitation", "Risk Level", "Mitigation / Rationale"],
      [
        ["No process isolation in browser tab", "Medium", "Browser sandbox provides partial isolation; encrypted data only"],
        ["Anti-debug measures trivially bypassable in web", "Low", "Defense in depth; not relied upon as primary protection"],
        ["No TLS on localhost companion", "Low", "Only encrypted bytes transit; companion is localhost-only"],
        ["Password briefly in JS memory during KDF", "Medium", "Best-effort zeroing; GC limits guarantee; documented"],
        ["Clipboard exposure if user copy-pastes password", "Low", "User behavior; clipboard clearing recommended in docs"],
        ["Recovery phrase visible in browser (screenshot risk)", "Medium", "Shown once at creation; user warned not to screenshot"],
        ["Zero-trace cannot clean Registry/Prefetch without admin", "Medium", "2 Windows artifacts require admin; user notified"],
        ["ExFAT timestamps may reveal last-modified time", "Low", "Acceptable for non-adversarial USB inspection"],
      ],
      [3000, 1000, 5360]
    ),
    H.caption("Table 9.1 \u2014 Known Security Limitations"),
    H.pageBreak(),

    // 10
    H.h1("10. Threat Model"),
    H.makeTable(
      ["ID", "Threat", "Likelihood", "Impact", "Mitigation"],
      [
        ["T1", "Brute-force password", "Medium", "Critical", "Argon2id (64 MiB) + backoff + self-destruct @ 10"],
        ["T2", "Header tampering", "Low", "High", "HMAC-SHA256, domain-separated, constant-time verify"],
        ["T3", "Nonce reuse", "Very Low", "Critical", "24B nonces + HKDF derivation + runtime detection"],
        ["T4", "Memory dump", "Low", "High", "mlock + guard pages + Zeroize on Drop"],
        ["T5", "Quantum computing", "Low (future)", "Critical", "ML-KEM-1024 + X25519 hybrid; secure if either holds"],
        ["T6", "Index corruption", "Medium", "Medium", "Dual-index + commit counter + atomic commits + fsync"],
        ["T7", "Weak password", "Medium", "Critical", "15-char min + bloom filter (98K entries) + HIBP + entropy"],
        ["T8", "Forensic recovery", "Medium", "High", "23 cleaners + auto-clean + restart advisory"],
        ["T9", "Rollback attack", "Low", "High", "Monotonic counter + state_version + HMAC fail counter"],
        ["T10", "USB interception", "Medium", "Medium", "All data encrypted at rest; hidden partition"],
        ["T11", "Companion abuse", "Low", "Medium", "Localhost-only + CORS + rate limit + input validation"],
        ["T12", "Supply chain", "Low", "Critical", "cargo-audit + gosec + npm audit + Snyk; pinned deps"],
        ["T13", "Side-channel", "Low", "High", "Constant-time (subtle crate); no branching on secrets"],
      ],
      [500, 1600, 1000, 800, 5460]
    ),
    H.caption("Table 10.1 \u2014 Threat Model (13 Identified Threats)"),
    H.pageBreak(),

    // 11
    H.h1("11. SAST/DAST Results"),
    H.makeStatusTable(
      ["Tool", "Target", "Scan Type", "Result", "Last Run"],
      [
        ["cargo-audit", "Rust dependencies", "SAST (dependency)", "Clean", "2026-03-14"],
        ["clippy (pedantic)", "Rust source code", "SAST (linter)", "Clean", "2026-03-14"],
        ["gosec", "Go source code", "SAST (security)", "Clean", "2026-03-14"],
        ["npm audit", "Node.js dependencies", "SAST (dependency)", "Clean", "2026-03-14"],
        ["Snyk", "All subsystems", "SAST + SCA", "Clean", "2026-03-14"],
      ],
      [1400, 2000, 1800, 1000, 3160],
      3
    ),
    H.caption("Table 11.1 \u2014 Static Analysis Results"),
    H.pageBreak(),

    // 12
    H.h1("12. Test Coverage Summary"),
    H.makeTable(
      ["Subsystem", "Test Count", "Key Coverage Areas"],
      [
        ["Rust (usbvault-crypto)", "234 tests", "KDF params, AEAD roundtrip, streaming integrity, header HMAC, index atomicity, PQC hybrid, SRP handshake, vault lifecycle, self-destruct"],
        ["TypeScript (usbvault-app)", "45 test files", "UI flows, state management (7 stores), crypto FFI bridge, error handling, i18n, password policy"],
        ["Go (usbvault-server)", "61 test files", "Authentication (SRP, JWT, FIDO2), billing (Stripe webhooks), sharing, sync, middleware, BOLA prevention"],
        ["Total", "340 files", "All passing as of 2026-03-14; property-based fuzzing: 19 proptest suites"],
      ],
      [2000, 1200, 6160]
    ),
    H.caption("Table 12.1 \u2014 Test Coverage by Subsystem"),

    H.spacer(200),
    H.importantBox("Distribution Notice:", "This document is provided to approved penetration testing firms under NDA. Do not distribute, reproduce, or store beyond the engagement period. Destroy all copies upon engagement completion."),

    H.spacer(400),
    H.p([H.italic("End of Document \u2014 USBVault Enterprise Security Audit Package v2.0 \u2014 March 15, 2026")], { alignment: H.AlignmentType.CENTER }),
  ];

  await H.buildDoc({
    filename: "USBVault_Enterprise_Security_Audit_Package.docx",
    headerTitle: "USBVault Enterprise \u2014 Security Audit Package",
    headerClassification: "CONFIDENTIAL",
    footerDocId: "DOC-006", footerVersion: "2.0", children, outDir,
  });
}

module.exports = { generate };
