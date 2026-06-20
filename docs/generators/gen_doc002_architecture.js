/**
 * DOC-002: USBVault Enterprise — Architecture & System Design v2.0
 * Audience: System Architects, Engineering Leads, DevOps
 */

const H = require("./doc_helpers");

async function generate(outDir) {
  console.log("Generating DOC-002: Architecture & System Design...");

  const children = [

    // ─── COVER ───────────────────────────────────────────────
    ...H.coverPage({
      title: "Architecture &\nSystem Design",
      subtitle: "Fortress Enterprise \u2014 Zero-Knowledge Security Architecture",
      docId: "DOC-002",
      version: "2.0",
      date: "March 15, 2026",
      classification: "CONFIDENTIAL",
      audience: "System Architects, Engineering Leads, DevOps",
      authors: "USBVault Core Engineering",
    }),

    // ─── DOCUMENT CONTROL ────────────────────────────────────
    ...H.documentControlPage({
      revisions: [
        ["0.1", "2026-01-15", "Architecture Team", "Initial system design draft"],
        ["0.5", "2026-02-01", "Architecture Team", "Trust boundary analysis complete"],
        ["1.0", "2026-02-20", "Engineering", "Internal architecture review"],
        ["1.5", "2026-03-05", "Security Team", "Security architecture sign-off"],
        ["2.0", "2026-03-15", "Engineering", "Enterprise Edition v2.0 release"],
      ],
      distribution: [
        ["Core Engineering", "Full Access"],
        ["DevOps / Infrastructure", "Full Access"],
        ["Security & Compliance", "Full Access"],
        ["Third-Party Auditors", "Read Only (under NDA)"],
      ],
    }),

    // ─── TOC ──────────────────────────────────────────────────
    ...H.toc(),

    // ═══════════════════════════════════════════════════════════
    //  1. SYSTEM OVERVIEW
    // ═══════════════════════════════════════════════════════════
    H.h1("1. System Overview"),

    H.h2("1.1 Design Goals"),
    H.p("USBVault Enterprise v2.0 was architected to satisfy five non-negotiable design constraints simultaneously: intelligence-grade cryptographic security, zero-installation portability across Windows/macOS/Linux, zero forensic trace upon ejection, crash-safe data integrity under any failure mode, and consumer-grade simplicity requiring no technical knowledge to operate. These constraints are inherently in tension\u2014strong security typically demands complexity, and portability limits available system APIs\u2014so the architecture represents a carefully optimized set of tradeoffs."),
    H.p("The system operates in two deployment modes from a single codebase: USB-only mode (fully offline, no server infrastructure, vault password serves as the only authentication), and cloud-connected mode (optional backend for multi-device sync, vault sharing, backup, billing, and FIDO2 credential management). Both modes use identical cryptographic protocols and vault formats, ensuring that a vault created offline can be connected to the cloud later without migration."),
    H.spacer(100),

    H.h2("1.2 Zero-Knowledge Principle"),
    H.p("The foundational architectural principle is zero knowledge: the server never handles plaintext data, filenames, or encryption keys under any circumstance. All cryptographic operations execute exclusively within the Rust core on the client device. The server stores only encrypted blobs that are indistinguishable from random data without the user\u2019s password."),
    H.p("This principle is enforced at the architecture level through trust boundaries (Section 3), not merely through policy. The Rust FFI interface is designed so that derived key material cannot physically cross from the crypto core to the network layer\u2014the type system prevents it at compile time."),
    H.importantBox("Architectural Guarantee:", "Even a fully compromised server (database dump, S3 bucket access, admin shell) reveals zero information about user files, filenames, or vault contents. Authentication uses SRP-6a, so the server also never sees passwords."),
    H.pageBreak(),

    H.h2("1.3 Architecture Principles"),
    H.makeTableBoldFirst(
      ["Principle", "Description", "Enforcement"],
      [
        ["Zero Knowledge", "Server never handles plaintext, keys, or filenames", "FFI boundary; type system; SRP-6a auth"],
        ["Zero Trust", "No component trusts another implicitly; all data is verified", "HMAC verification; AEAD auth tags; commit counters"],
        ["Defense in Depth", "12 independent security layers; no single point of failure", "Each layer documented in Technical Specification"],
        ["Crash Safety", "No data loss under any failure mode (power loss, crash, kill -9)", "Dual-index atomic commits; fsync; append-only writes"],
        ["Least Privilege", "Each component has minimum necessary permissions", "Companion: localhost-only; Server: no access to plaintext"],
        ["Cryptographic Agility", "Cipher selection at vault creation; extensible cipher registry", "cipher_id field in header; per-vault algorithm choice"],
        ["Fail Secure", "Failures default to locked/denied state, never to open", "AEAD auth failures abort; corrupt index refuses open"],
      ],
      [1800, 4000, 3560]
    ),
    H.caption("Table 1.3 \u2014 Architecture Principles"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  2. COMPONENT ARCHITECTURE
    // ═══════════════════════════════════════════════════════════
    H.h1("2. Component Architecture"),
    H.p("USBVault Enterprise comprises four distinct subsystems, each implemented in the language best suited to its security and performance requirements. The subsystems communicate through well-defined interfaces with strict data contracts."),
    H.spacer(80),

    H.h2("2.1 Subsystem Overview"),
    H.makeTableBoldFirst(
      ["Subsystem", "Language", "Runtime", "Role", "Lines of Trust"],
      [
        ["usbvault-crypto", "Rust 2021", "Native (FFI)", "All cryptographic operations, vault format, memory security", "Highest: handles all secrets"],
        ["usbvault-app", "TypeScript", "React Native / Expo 54", "User interface, orchestration, state management", "Medium: sees password briefly for KDF"],
        ["usbvault-server", "Go 1.25", "Docker (Alpine)", "Cloud backend: auth, storage, billing, sync", "Low: handles only encrypted blobs"],
        ["usb-companion", "Node.js", "Express on USB", "Local USB bridge: detection, I/O, zero-trace", "Low: handles only encrypted bytes"],
      ],
      [1600, 1000, 1600, 3160, 2000]
    ),
    H.caption("Table 2.1 \u2014 Subsystem Architecture Overview"),
    H.spacer(100),

    H.h2("2.2 usbvault-crypto (Rust Core)"),
    H.p("The Rust crypto core is the most security-critical component. It is a standalone Rust library compiled as a native shared library (.so/.dylib/.dll) and linked to the frontend via FFI. The core handles every operation that touches key material: password derivation (Argon2id), authenticated encryption (XChaCha20-Poly1305, AES-256-GCM-SIV), streaming encryption (V2RC chunked format), vault header parsing and serialization, HMAC integrity verification, FIDO2 credential packing, post-quantum hybrid KEM, SRP-6a client protocol, and all memory security (Zeroize, mlock, guard pages)."),
    H.p("The FFI boundary is intentionally narrow: the frontend sends a password string in, and receives encrypted bytes out. No derived key material, intermediate state, or plaintext data ever leaves the Rust process space. This is enforced by Rust\u2019s ownership model\u2014key types implement Drop with Zeroize and cannot be cloned or serialized across the FFI boundary."),
    H.makeTable(
      ["Module", "Source File", "Responsibility"],
      [
        ["KDF", "kdf.rs", "Argon2id key derivation with configurable parameters"],
        ["Cipher", "cipher.rs", "AEAD encrypt/decrypt dispatch (XChaCha20, AES-256-GCM-SIV)"],
        ["Streaming", "streaming.rs", "V2RC chunked streaming encryption/decryption"],
        ["Header", "vault/header.rs", "V4 header serialization, HMAC, fail counter, self-destruct"],
        ["Index", "vault/index.rs", "Dual-slot encrypted index management, atomic commits"],
        ["TFA", "vault/tfa.rs", "FIDO2 credential wire format, recovery blob"],
        ["PQC", "pqc/hybrid.rs", "X25519 + ML-KEM-1024 hybrid sealed boxes"],
        ["Memory", "memory.rs", "mlock, guard pages, zeroing allocator"],
        ["Sharing", "sharing.rs", "Vault sharing protocol, multi-recipient encryption"],
        ["SRP", "srp_client.rs", "SRP-6a client-side protocol implementation"],
        ["Errors", "error.rs", "Typed error codes with no secret leakage"],
      ],
      [1200, 1800, 6360]
    ),
    H.caption("Table 2.2 \u2014 Rust Crypto Core Module Map"),
    H.spacer(100),

    H.h2("2.3 usbvault-app (Frontend)"),
    H.p("The frontend is a cross-platform application built with Expo 54, React Native 0.81, and React 19.1. It serves as the user-facing orchestration layer: it collects user input (passwords, file selections), delegates all cryptographic work to the Rust core via FFI, communicates with the companion service for USB I/O, and optionally connects to the cloud server for sync, sharing, and billing."),
    H.p("The application comprises 37 pages organized into dashboard, vault management, settings, security, and educational sections. State is managed through 7 independent Zustand stores (auth, vault, theme, sidebar, language, offline, sync), with TypeScript providing end-to-end type safety. Internationalization supports 4 languages (English, Spanish, French, German) via i18next."),
    H.spacer(60),
    H.h3("2.3.1 Key Services"),
    H.makeTable(
      ["Service", "File", "Responsibility"],
      [
        ["Vault Orchestrator", "vaultOrchestrator.ts", "Central coordinator: sequences unlock, encrypt, decrypt, compact, eject flows"],
        ["USB Service", "usbService.ts", "Companion bridge: translates app operations to REST calls to localhost:3001"],
        ["FIDO2 Service", "fido2Service.ts", "WebAuthn registration/authentication with PRF extension"],
        ["Password Policy", "passwordPolicy.ts", "NIST/OWASP scoring, entropy calculation, contextual penalties"],
        ["Bloom Filter", "weakPasswordBloom.ts", "98,735-entry SHA-256 bloom filter for weak password detection (k=10, FPR ~0.1%)"],
        ["Boot Hardening", "bootHardening.ts", "6-stage security initialization sequence on app launch"],
        ["Zero Trace Monitor", "zeroTraceMonitor.ts", "Periodic scanning and cleanup scheduling during active session"],
      ],
      [1800, 2200, 5360]
    ),
    H.caption("Table 2.3.1 \u2014 Frontend Key Services"),
    H.spacer(60),
    H.h3("2.3.2 Dual-Mode Architecture"),
    H.p("The frontend operates in two modes, selected automatically based on the presence of EXPO_PUBLIC_API_URL in the environment:"),
    H.makeTable(
      ["Aspect", "Cloud-Connected Mode", "USB-Only (Standalone) Mode"],
      [
        ["Activation", "EXPO_PUBLIC_API_URL is set", "EXPO_PUBLIC_API_URL is not set"],
        ["Authentication", "SRP-6a \u2192 JWT tokens", "Vault password = session credential"],
        ["Session storage", "HTTP-only cookies + JWT", "sessionStorage only (cleared on tab close)"],
        ["Data path", "App \u2192 Rust FFI \u2192 Companion + Server", "App \u2192 Rust FFI \u2192 Companion only"],
        ["Features", "Sync, sharing, backup, billing, FIDO2 mgmt", "Vault operations, zero-trace, local-only"],
        ["Trace model", "Standard web session cleanup", "Zero-trace: no persistent storage"],
      ],
      [1600, 3880, 3880]
    ),
    H.caption("Table 2.3.2 \u2014 Dual-Mode Feature Comparison"),
    H.pageBreak(),

    H.h2("2.4 usbvault-server (Cloud Backend)"),
    H.p("The Go server provides the optional cloud backend for USBVault Enterprise. It handles authentication (SRP-6a + JWT + FIDO2), vault metadata management, encrypted blob storage in S3, Stripe billing integration, multi-device sync via WebSocket, and administrative APIs for enterprise deployment. The server is designed as a stateless microservice deployed on Kubernetes with horizontal pod autoscaling."),
    H.makeTable(
      ["Component", "Technology", "Purpose"],
      [
        ["Router", "chi/v5", "HTTP routing with middleware chain"],
        ["Database", "PostgreSQL 16 (pgx/v5)", "14 migrations, ACID transactions, vault metadata"],
        ["Cache", "Redis (go-redis/v9)", "Session storage, rate limiting, SRP state"],
        ["Object Storage", "S3 (AWS SDK v2)", "Encrypted blob storage with cross-region replication"],
        ["Authentication", "SRP-6a + JWT + FIDO2", "Zero-knowledge password auth + token-based sessions"],
        ["Billing", "Stripe SDK", "Subscription management, webhooks, checkout/portal"],
        ["Sync", "WebSocket + CRDT", "Real-time multi-device vault synchronization"],
        ["Monitoring", "Prometheus + Sentry + OTel", "Metrics, error tracking, distributed tracing"],
        ["Deployment", "Docker (Alpine) + K8s", "Non-root container, 3 replicas, HPA (CPU 70%)"],
      ],
      [1600, 2200, 5560]
    ),
    H.caption("Table 2.4 \u2014 Server Technology Stack"),
    H.spacer(100),

    H.h2("2.5 usb-companion (USB Bridge)"),
    H.p("The companion is a lightweight Node.js/Express service that runs on the user\u2019s local machine and provides the bridge between the web-based frontend and the operating system\u2019s USB subsystem. It binds exclusively to 127.0.0.1:3001 and is never network-accessible. In USB-only mode, it also serves the static web application via express.static."),
    H.p("The companion implements 19 REST endpoints covering drive detection, provisioning, partition management, encrypted I/O, and zero-trace cleanup. All OS interactions use execFile (never shell=true) with allowlisted command arguments, validated inputs, and audit logging."),
    H.makeTable(
      ["Security Control", "Implementation"],
      [
        ["Network binding", "127.0.0.1 only (localhost); never 0.0.0.0 or external interfaces"],
        ["Helmet headers", "Standard security headers on all responses"],
        ["CORS whitelist", "Only configured origins (app frontend, localhost variants)"],
        ["Rate limiting", "60 req/min general; 5 req/min destructive operations"],
        ["Command execution", "execFile only (never shell=true); allowlisted arguments"],
        ["Input validation", "Alphanumeric drive IDs; UTF-8 vault names; canonicalized paths"],
        ["Audit logging", "All operations logged with timestamp, endpoint, drive ID, result"],
        ["Write integrity", "fsync() after every write to VAULT.bin"],
      ],
      [2200, 7160]
    ),
    H.caption("Table 2.5 \u2014 Companion Security Model"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  3. TRUST BOUNDARIES
    // ═══════════════════════════════════════════════════════════
    H.h1("3. Trust Boundaries"),
    H.p("Trust boundaries define the strict data contracts between subsystems. Each boundary specifies exactly what data crosses and what data is architecturally prevented from crossing. These boundaries are the primary mechanism for enforcing the zero-knowledge principle."),
    H.spacer(80),

    H.makeTable(
      ["Boundary", "What Crosses", "What NEVER Crosses"],
      [
        ["App \u2194 Rust FFI", "Password (once, for KDF input), encrypted bytes, vault header bytes", "Derived keys (KEK, MEK), HMAC keys, plaintext file data, intermediate crypto state"],
        ["App \u2194 Companion", "Encrypted VAULT.bin bytes, drive identifiers, partition metadata", "Passwords, encryption keys, plaintext files, decrypted data"],
        ["App \u2194 Server", "Encrypted blobs, JWT tokens, SRP-6a protocol messages, FIDO2 assertions", "Vault password, MEK, KEK, plaintext file content, file names"],
        ["Companion \u2194 USB", "Raw encrypted bytes (read/write with fsync)", "Encryption keys, plaintext data, password material"],
      ],
      [1800, 3780, 3780]
    ),
    H.caption("Table 3.1 \u2014 Trust Boundary Contracts"),
    H.spacer(100),

    H.note("The password crosses the App \u2194 Rust FFI boundary exactly once per session, when the user enters it for vault unlock. It is immediately consumed by Argon2id to derive key material, and the original password buffer is zeroed in both JavaScript (best-effort, GC limitations) and Rust (Zeroize guarantee). No other boundary ever sees the password."),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  4. DATA FLOWS
    // ═══════════════════════════════════════════════════════════
    H.h1("4. Data Flows"),
    H.p("This section documents the precise sequence of operations for the three primary vault operations: file encryption, file decryption, and vault unlock. Each step specifies which component executes the operation and what data moves across trust boundaries."),
    H.spacer(80),

    H.h2("4.1 Encrypt File Flow (9 Steps)"),
    H.numbered("User selects file via browser file picker.", "numbers"),
    H.numbered("Frontend (usbvault-app) reads file into ArrayBuffer.", "numbers"),
    H.numbered("Frontend sends plaintext bytes + MEK reference to Rust FFI.", "numbers"),
    H.numbered("Rust core generates random base nonce (24 bytes) from OS CSPRNG.", "numbers"),
    H.numbered("Rust core chunks plaintext into 64 KiB blocks, derives per-chunk nonces via HKDF, and AEAD-encrypts each chunk.", "numbers"),
    H.numbered("Rust core computes final HMAC-SHA256 over entire V2RC record.", "numbers"),
    H.numbered("Rust core returns serialized V2RC record (encrypted bytes) to frontend.", "numbers"),
    H.numbered("Frontend sends encrypted bytes to Companion via POST /usb/vault/container/append.", "numbers"),
    H.numbered("Companion appends bytes to VAULT.bin on USB, calls fsync(), and returns the byte offset. Frontend updates the encrypted index with the new entry and writes the updated index to the inactive slot, then flips active_index_slot in the header (atomic commit).", "numbers"),
    H.spacer(100),

    H.h2("4.2 Decrypt File Flow (6 Steps)"),
    H.numbered("User selects encrypted file from vault dashboard.", "numbers2"),
    H.numbered("Frontend reads the encrypted record from Companion via GET /usb/vault/container/bytes (offset + length from index).", "numbers2"),
    H.numbered("Frontend sends encrypted bytes + MEK reference to Rust FFI.", "numbers2"),
    H.numbered("Rust core verifies final HMAC, then decrypts each chunk in sequence, verifying AEAD tags.", "numbers2"),
    H.numbered("Rust core returns plaintext bytes to frontend.", "numbers2"),
    H.numbered("Frontend presents file for download or opens in-browser viewer (auto-wipe after timeout in secure mode).", "numbers2"),
    H.spacer(100),

    H.h2("4.3 Vault Unlock Flow (11 Steps)"),
    H.numbered("User enters master password.", "numbers3"),
    H.numbered("Frontend sends password + vault header bytes to Rust FFI.", "numbers3"),
    H.numbered("Rust core parses header: validates magic (USBVLT04), version, cipher_id.", "numbers3"),
    H.numbered("Rust core checks fail counter: if \u2265 10, returns SELF_DESTRUCTED. If > 0, enforces backoff delay.", "numbers3"),
    H.numbered("Rust core runs Argon2id(password, salt) \u2192 64-byte output, split into enc_key[0:32] + hmac_key[32:64].", "numbers3"),
    H.numbered("Rust core verifies header HMAC using hmac_key (constant-time comparison).", "numbers3"),
    H.numbered("Rust core decrypts wrapped_mek using enc_key as KEK.", "numbers3"),
    H.numbered("Rust core decrypts verify_ct: if result = \u201CUSBVAULT_VERIFY_OK_0000\u201D, password is correct.", "numbers3"),
    H.numbered("If FIDO2 enabled: frontend triggers WebAuthn assertion; PRF output XORed with enc_key before MEK unwrap.", "numbers3"),
    H.numbered("Rust core resets fail counter to 0 (HMAC-protected write).", "numbers3"),
    H.numbered("MEK reference returned to frontend (key material stays in Rust memory, mlock\u2019d).", "numbers3"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  5. KEY HIERARCHY
    // ═══════════════════════════════════════════════════════════
    H.h1("5. Key Hierarchy"),
    H.p("USBVault\u2019s key hierarchy is designed around the wrapped MEK pattern, which decouples file encryption from the user\u2019s password. This section documents the complete key lifecycle from generation through destruction."),
    H.spacer(80),

    H.h2("5.1 Key Derivation Chain"),
    H.p("The key derivation chain flows as follows:"),
    H.p([H.mono("Password"), H.run("  \u2192  "), H.mono("Argon2id(password, salt, 64MiB, 3, 4)"), H.run("  \u2192  "), H.mono("64 bytes")]),
    H.p([H.run("    Split: "), H.mono("enc_key[0:32]"), H.run(" = KEK  |  "), H.mono("hmac_key[32:64]"), H.run(" = Integrity Key")]),
    H.p([H.mono("KEK"), H.run("  \u2192  "), H.mono("AEAD_decrypt(KEK, wrapped_mek)"), H.run("  \u2192  "), H.mono("MEK (256-bit)")]),
    H.p([H.mono("MEK"), H.run("  \u2192  encrypts all file data, index blobs, and verify marker")]),
    H.spacer(60),
    H.p("If FIDO2 is enabled, the derivation is modified:"),
    H.p([H.mono("final_enc_key = enc_key XOR PRF_output(FIDO2_assertion)")]),
    H.p("This ensures both the password AND the physical hardware key are required. The XOR is computed before MEK unwrap, so the wrapped_mek is encrypted under a key that depends on both factors."),
    H.spacer(100),

    H.h2("5.2 Key Lifecycle"),
    H.makeTable(
      ["Phase", "Operation", "Security Guarantee"],
      [
        ["Generation", "MEK created from 32 bytes of OS CSPRNG at vault creation", "Full 256-bit entropy independent of password strength"],
        ["Derivation", "Password + salt \u2192 Argon2id \u2192 KEK (32 bytes)", "64 MiB memory-hard; 3 iterations; 4 parallel lanes"],
        ["Wrapping", "AEAD_encrypt(KEK, MEK) \u2192 wrapped_mek in header", "Authenticated encryption with integrity tag"],
        ["Storage", "wrapped_mek stored in vault header on USB", "Encrypted at rest; HMAC-protected header"],
        ["Unwrapping", "AEAD_decrypt(KEK, wrapped_mek) \u2192 MEK in memory", "Auth tag verified before use; fail counter incremented first"],
        ["Usage", "MEK encrypts/decrypts file data + index blobs", "MEK held in mlock\u2019d memory; never leaves Rust FFI boundary"],
        ["Rotation", "Password change \u2192 new KEK \u2192 re-wrap same MEK", "O(1) operation; no file re-encryption required"],
        ["Zeroing", "Zeroize on Drop trait; mlock prevents swap", "Memory shows no residual key material after session end"],
        ["Destruction", "Self-destruct: 3-pass overwrite of wrapped_mek", "Random \u2192 zeros \u2192 random; fsync each pass; MEK irrecoverable"],
      ],
      [1200, 3960, 4200]
    ),
    H.caption("Table 5.2 \u2014 Key Lifecycle Phases"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  6. DEPLOYMENT ARCHITECTURE
    // ═══════════════════════════════════════════════════════════
    H.h1("6. Deployment Architecture"),

    H.h2("6.1 Kubernetes Configuration"),
    H.p("The cloud backend deploys as a stateless Go binary in a Docker Alpine container on Kubernetes. The deployment uses a minimum of 3 replicas with horizontal pod autoscaling based on CPU utilization (target 70%, maximum 10 replicas). Database migrations run as a Kubernetes batch/v1 Job before the main deployment."),
    H.makeTable(
      ["Resource", "Configuration"],
      [
        ["Replicas", "min: 3, max: 10 (HPA, CPU target 70%)"],
        ["Container image", "Multi-stage Alpine build, non-root user, stripped binary"],
        ["Liveness probe", "GET /api/v1/health (initial delay 10s, period 30s, timeout 5s)"],
        ["Readiness probe", "GET /api/v1/health (initial delay 5s, period 10s, timeout 3s)"],
        ["Secrets management", "Kubernetes Secrets: database, Redis, S3, JWT, Stripe credentials"],
        ["Database migration", "batch/v1 Job with go-migrate; runs before deployment rollout"],
        ["Ingress", "HTTPS with TLS 1.2+ termination; WebSocket upgrade support"],
        ["Resource limits", "CPU: 500m request / 1000m limit; Memory: 256Mi request / 512Mi limit"],
      ],
      [2200, 7160]
    ),
    H.caption("Table 6.1 \u2014 Kubernetes Deployment Configuration"),
    H.spacer(100),

    H.h2("6.2 Docker Configuration"),
    H.p("The server uses a multi-stage Docker build. The build stage compiles the Go binary with static linking and symbol stripping. The runtime stage uses Alpine Linux with a non-root user. For development, a docker-compose configuration provides PostgreSQL 16 and Redis 7 alongside the server."),
    H.spacer(100),

    H.h2("6.3 Infrastructure Dependencies"),
    H.makeTable(
      ["Service", "Version", "Purpose", "Connection"],
      [
        ["PostgreSQL", "16", "Primary data store (users, vaults, metadata)", "DATABASE_URL connection string"],
        ["Redis", "7", "Sessions, rate limiting, SRP state cache", "REDIS_URL connection string"],
        ["S3 (AWS)", "SDK v2", "Encrypted blob storage", "AWS credentials + S3_BUCKET + S3_REGION"],
        ["Stripe", "Latest SDK", "Subscription billing, webhooks", "STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET"],
        ["Sentry", "Latest SDK", "Error tracking and alerting", "SENTRY_DSN (optional)"],
      ],
      [1400, 1000, 3560, 3400]
    ),
    H.caption("Table 6.3 \u2014 Infrastructure Dependencies"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  7. DATABASE SCHEMA
    // ═══════════════════════════════════════════════════════════
    H.h1("7. Database Schema"),
    H.p("The PostgreSQL database uses 14 migrations and contains the following primary tables. All tables use UUID primary keys, and all timestamps are stored in UTC. The schema enforces referential integrity through foreign keys and uses database-level constraints for data validation."),
    H.spacer(80),
    H.makeTable(
      ["Table", "Key Columns", "Purpose"],
      [
        ["users", "id, email, srp_verifier, srp_salt, tier, created_at", "User accounts and SRP authentication material"],
        ["vaults", "id, user_id, name_encrypted, cipher_id, created_at", "Vault metadata (names encrypted client-side)"],
        ["vault_blobs", "id, vault_id, s3_key, size_bytes, checksum", "S3 object references for encrypted vault data"],
        ["vault_shares", "id, vault_id, sender_id, recipient_id, sealed_mek", "Vault sharing: PQC-sealed MEK for recipient"],
        ["fido2_credentials", "id, user_id, credential_id, public_key, aaguid, label", "FIDO2/WebAuthn credential storage"],
        ["recovery_codes", "id, user_id, code_hash, used_at", "One-time recovery codes (bcrypt hashed)"],
        ["subscriptions", "id, user_id, stripe_sub_id, tier, status, period_end", "Stripe subscription state mirror"],
        ["audit_logs", "id, user_id, action, metadata, ip_address, timestamp", "Security audit trail (login, share, delete, etc.)"],
        ["sync_state", "id, vault_id, device_id, vector_clock, last_sync", "CRDT vector clocks for multi-device sync"],
        ["devices", "id, user_id, name, platform, last_seen", "Registered devices for sync"],
        ["rate_limits", "key, count, window_start", "Distributed rate limiting state"],
        ["migrations", "version, applied_at", "Schema migration tracking"],
      ],
      [1800, 3560, 4000]
    ),
    H.caption("Table 7.1 \u2014 Database Schema (Primary Tables)"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  8. API DESIGN
    // ═══════════════════════════════════════════════════════════
    H.h1("8. API Design"),
    H.p("The server exposes a RESTful API organized into 9 route groups. All endpoints require HTTPS with TLS 1.2+. Authentication uses JWT Bearer tokens obtained via SRP-6a handshake. Rate limiting is enforced per-IP and per-user with configurable thresholds by subscription tier."),
    H.spacer(80),
    H.makeTable(
      ["Route Group", "Base Path", "Auth Required", "Description"],
      [
        ["Health", "/api/v1/health", "No", "Liveness and readiness probes"],
        ["Auth", "/api/v1/auth/*", "No (SRP handshake)", "SRP-6a registration, login, token refresh"],
        ["FIDO2", "/api/v1/fido2/*", "Yes (JWT)", "WebAuthn registration, authentication, key management"],
        ["Vaults", "/api/v1/vaults/*", "Yes (JWT)", "CRUD operations on vault metadata"],
        ["Blobs", "/api/v1/blobs/*", "Yes (JWT)", "Upload/download encrypted vault data to/from S3"],
        ["Sharing", "/api/v1/sharing/*", "Yes (JWT)", "Send/accept/revoke vault shares (PQC-sealed MEK)"],
        ["Sync", "/api/v1/sync/*", "Yes (JWT + WS)", "WebSocket-based multi-device synchronization"],
        ["Billing", "/api/v1/billing/*", "Yes (JWT)", "Stripe checkout, portal, webhook processing"],
        ["Admin", "/api/v1/admin/*", "Yes (JWT + Admin)", "Enterprise management: user provisioning, audit logs"],
      ],
      [1200, 1800, 1800, 4560]
    ),
    H.caption("Table 8.1 \u2014 Server API Route Groups"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  9. OBSERVABILITY
    // ═══════════════════════════════════════════════════════════
    H.h1("9. Observability"),
    H.p("USBVault Enterprise uses a comprehensive observability stack for monitoring, alerting, error tracking, and distributed tracing. The observability architecture is designed to provide full visibility into system health without exposing any user data or encryption material."),
    H.spacer(80),
    H.makeTable(
      ["Component", "Technology", "Purpose"],
      [
        ["Metrics", "Prometheus", "HTTP request rates, latencies, error rates, DB pool utilization, S3 operation metrics"],
        ["Dashboards", "Grafana", "Pre-built dashboards for API health, authentication, billing, sync performance"],
        ["Alerting", "AlertManager", "Configurable alerts: high error rate, auth failure spike, DB pool exhaustion, cert expiry"],
        ["Error Tracking", "Sentry", "Real-time error reporting with stack traces (no user data in payloads)"],
        ["Tracing", "OpenTelemetry", "Distributed request tracing across server, database, S3, and Redis"],
      ],
      [1600, 1600, 6160]
    ),
    H.caption("Table 9.1 \u2014 Observability Stack"),
    H.spacer(100),

    H.h2("9.1 Alerting Rules"),
    H.makeStatusTable(
      ["Alert", "Condition", "Severity", "Action"],
      [
        ["High error rate", "> 5% 5xx responses over 5 minutes", "Critical", "Page on-call; investigate server logs"],
        ["Auth failure spike", "> 100 failed authentications per minute", "Critical", "Possible brute-force; review IP origins"],
        ["DB pool exhaustion", "Connection utilization > 90%", "Critical", "Scale database; investigate connection leaks"],
        ["S3 upload failures", "> 3 consecutive upload failures", "High", "Check S3 availability and IAM permissions"],
        ["Certificate expiry", "< 14 days until TLS cert expiry", "High", "Renew certificates; verify auto-renewal"],
        ["Pod restarts", "> 3 restarts in 10 minutes", "Critical", "Investigate crash loops; check resource limits"],
        ["Disk usage", "> 80% on PostgreSQL volume", "High", "Expand volume; investigate data growth"],
        ["Sync latency", "p99 > 5 seconds", "High", "Check WebSocket connections; Redis health"],
      ],
      [1800, 2600, 1000, 3960],
      2
    ),
    H.caption("Table 9.2 \u2014 Alerting Rules"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  10. DISASTER RECOVERY
    // ═══════════════════════════════════════════════════════════
    H.h1("10. Disaster Recovery"),
    H.p("This section documents recovery procedures and target metrics for six disaster scenarios. The zero-knowledge architecture means that most recovery scenarios require user cooperation (password or recovery phrase) because the server cannot independently decrypt vault data."),
    H.spacer(80),
    H.makeTable(
      ["Scenario", "RTO", "RPO", "Recovery Procedure"],
      [
        ["Server outage", "15 min", "0 (stateless)", "K8s self-healing; HPA scales replacement pods"],
        ["Database failure", "30 min", "< 5 min", "Failover to standby; restore from WAL if needed"],
        ["S3 region failure", "1 hour", "0 (cross-region)", "Automatic failover to S3 cross-region replica"],
        ["Redis failure", "5 min", "Session loss", "Restart Redis; users re-authenticate (sessions rebuilt)"],
        ["Complete infra loss", "4 hours", "< 1 hour", "Terraform re-deploy; restore DB from daily backup + WAL"],
        ["USB drive failure", "User-dependent", "Last sync", "Cloud restore to new drive (cloud mode) or irrecoverable (USB-only)"],
      ],
      [1800, 1000, 1400, 5160]
    ),
    H.caption("Table 10.1 \u2014 Disaster Recovery Scenarios"),
    H.importantBox("Critical Note:", "Recovery phrases and vault passwords are client-side only. IT administrators cannot recover user vault contents. This is a security feature, not a limitation."),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  11. NON-FUNCTIONAL REQUIREMENTS
    // ═══════════════════════════════════════════════════════════
    H.h1("11. Non-Functional Requirements"),
    H.makeTable(
      ["Requirement", "Target", "Measurement"],
      [
        ["Availability", "99.9% (cloud backend)", "Prometheus uptime monitoring; monthly SLA report"],
        ["API Latency (p50)", "< 50ms", "Prometheus histogram; Grafana dashboard"],
        ["API Latency (p99)", "< 200ms", "Prometheus histogram; alerting at > 500ms"],
        ["Throughput", "1,000 requests/sec per pod", "Load testing with k6; HPA validated"],
        ["Vault unlock time", "< 3 seconds (Argon2id)", "Client-side timing; hardware-dependent"],
        ["Encrypt/decrypt throughput", "> 100 MB/s", "Rust benchmark suite; hardware-dependent"],
        ["FIPS 140-3 compliance", "AES-256-GCM-SIV option", "Cipher ID 3 selected at vault creation"],
        ["NIST SP 800-63B", "15-char password minimum", "Password policy enforcement at UI + crypto layer"],
        ["GDPR compliance", "Zero-knowledge architecture", "Server stores no personal file data or metadata"],
        ["Concurrent users", "10,000 per server instance", "Load tested with k6 and Locust"],
      ],
      [2200, 2800, 4360]
    ),
    H.caption("Table 11.1 \u2014 Non-Functional Requirements"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  12. TECHNOLOGY STACK
    // ═══════════════════════════════════════════════════════════
    H.h1("12. Technology Stack"),
    H.p("Complete dependency matrix with pinned versions for reproducible builds."),
    H.spacer(80),

    H.h2("12.1 Rust Dependencies"),
    H.makeTable(
      ["Crate", "Purpose"],
      [
        ["chacha20poly1305", "XChaCha20-Poly1305 AEAD cipher"],
        ["aes-gcm-siv", "AES-256-GCM-SIV AEAD cipher (FIPS)"],
        ["argon2", "Argon2id password hashing"],
        ["x25519-dalek", "X25519 Diffie-Hellman key exchange"],
        ["ml-kem", "ML-KEM-1024 post-quantum KEM (NIST FIPS 203)"],
        ["zeroize", "Secure memory zeroing on drop"],
        ["hmac + sha2", "HMAC-SHA256 for header and fail counter integrity"],
        ["hkdf", "HMAC-based Key Derivation Function (RFC 5869)"],
        ["sharks", "Shamir\u2019s Secret Sharing (future: key splitting)"],
        ["subtle", "Constant-time comparison for MAC verification"],
      ],
      [2400, 6960]
    ),
    H.caption("Table 12.1 \u2014 Rust Crate Dependencies"),
    H.spacer(100),

    H.h2("12.2 Go Dependencies"),
    H.makeTable(
      ["Package", "Purpose"],
      [
        ["chi/v5", "HTTP router with middleware chain"],
        ["pgx/v5", "PostgreSQL driver with connection pooling"],
        ["go-redis/v9", "Redis client for sessions and rate limiting"],
        ["aws-sdk-go-v2", "S3 client for encrypted blob storage"],
        ["golang-jwt/jwt/v5", "JWT generation and validation"],
        ["go-webauthn/webauthn", "FIDO2/WebAuthn server-side library"],
        ["stripe-go/v78", "Stripe billing integration"],
        ["prometheus/client_golang", "Prometheus metrics exposition"],
        ["sentry-go", "Error tracking and reporting"],
        ["otel", "OpenTelemetry distributed tracing"],
      ],
      [2400, 6960]
    ),
    H.caption("Table 12.2 \u2014 Go Module Dependencies"),
    H.spacer(100),

    H.h2("12.3 Frontend Dependencies"),
    H.makeTable(
      ["Package", "Purpose"],
      [
        ["expo 54", "Cross-platform build and deployment framework"],
        ["react-native 0.81", "Cross-platform UI framework"],
        ["react 19.1", "Component library with hooks"],
        ["zustand", "Lightweight state management (7 stores)"],
        ["i18next", "Internationalization (en, es, fr, de)"],
        ["@simplewebauthn/browser", "WebAuthn/FIDO2 client-side library"],
        ["jest + playwright", "Unit and end-to-end testing"],
      ],
      [2400, 6960]
    ),
    H.caption("Table 12.3 \u2014 Frontend Dependencies"),
    H.pageBreak(),

    // ═══════════════════════════════════════════════════════════
    //  GLOSSARY
    // ═══════════════════════════════════════════════════════════
    ...H.glossarySection([
      ["AEAD", "Authenticated Encryption with Associated Data."],
      ["Argon2id", "Memory-hard password hashing algorithm (hybrid mode)."],
      ["CRDT", "Conflict-free Replicated Data Type. Used for multi-device sync."],
      ["FFI", "Foreign Function Interface. Mechanism for TypeScript to call Rust native code."],
      ["HPA", "Horizontal Pod Autoscaler (Kubernetes)."],
      ["JWT", "JSON Web Token. Used for session authentication after SRP-6a handshake."],
      ["KEK", "Key Encryption Key. Derived from password; wraps/unwraps the MEK."],
      ["MEK", "Master Encryption Key. Encrypts all vault data; generated from CSPRNG."],
      ["ML-KEM-1024", "Module Lattice-based KEM. NIST post-quantum standard (Level 5)."],
      ["PRF", "Pseudo-Random Function. FIDO2 extension for deriving key material from authenticator."],
      ["SRP-6a", "Secure Remote Password protocol. Zero-knowledge password authentication."],
      ["V2RC", "Version 2 Record, Chunked. USBVault streaming encryption format."],
      ["WAL", "Write-Ahead Log. PostgreSQL mechanism for point-in-time recovery."],
    ]),

    // ─── END ──────────────────────────────────────────────────
    H.spacer(400),
    H.p([H.italic("End of Document \u2014 USBVault Enterprise Architecture & System Design v2.0 \u2014 March 15, 2026")], { alignment: H.AlignmentType.CENTER }),
  ];

  await H.buildDoc({
    filename: "USBVault_Enterprise_Architecture_v2.docx",
    headerTitle: "USBVault Enterprise \u2014 Architecture & System Design",
    headerClassification: "CONFIDENTIAL",
    footerDocId: "DOC-002",
    footerVersion: "2.0",
    children,
    outDir,
  });
}

module.exports = { generate };
