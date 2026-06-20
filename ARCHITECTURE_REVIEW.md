# USBVault Enterprise — Architecture Review & Redesign Recommendations

**Date:** March 23, 2026
**Scope:** Full-stack system design analysis across all 6 modules

---

## Executive Summary

USBVault Enterprise is a well-architected, security-first encrypted storage platform spanning 6 codebases: a React Native/Expo frontend, a Go API server, a Rust cryptographic core, an Electron desktop shell, a Node.js USB companion service, and a Next.js landing page. The overall engineering quality is high — zero-knowledge encryption, SRP-6a mutual authentication, disciplined state management, and proper memory lifecycle handling are all present and correctly implemented.

That said, there are structural patterns that will become pain points as the product scales in users, contributors, and feature surface. This document identifies 12 areas where redesign would yield meaningful improvements in maintainability, performance, security posture, or developer velocity.

---

## Current Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────┐
│  Clients                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────────┐  │
│  │ iOS/     │  │ Web      │  │ Desktop (Electron)           │  │
│  │ Android  │  │ (Expo    │  │  ┌─────────┐ ┌────────────┐ │  │
│  │ (Expo    │  │  export) │  │  │ Renderer│ │ Companion  │ │  │
│  │  native) │  │          │  │  │ (Web)   │ │ (USB svc)  │ │  │
│  └────┬─────┘  └────┬─────┘  │  └────┬────┘ └─────┬──────┘ │  │
│       │              │        └───────┼────────────┼────────┘  │
│       └──────┬───────┘                │            │           │
│              │                        │            │           │
└──────────────┼────────────────────────┼────────────┼───────────┘
               │ HTTPS                  │ localhost  │ USB I/O
               ▼                        ▼            ▼
┌──────────────────────┐    ┌──────────────────────────────────┐
│  Go API Server       │    │  USB Drive (VAULT.bin)            │
│  ┌────────────────┐  │    │  Encrypted container, client-side │
│  │ chi router     │  │    │  keys never leave device          │
│  │ + middleware    │  │    └──────────────────────────────────┘
│  ├────────────────┤  │
│  │ Service layer  │  │    ┌──────────────────────────────────┐
│  │ (vault, auth,  │  │    │  Rust Crypto Core (usbvault-crypto)│
│  │  share, audit) │  │    │  FFI → iOS/Android/Desktop        │
│  ├────────────────┤  │    │  ChaCha20, Argon2, X25519, HKDF  │
│  │ PostgreSQL 16  │  │    │  Streaming AEAD, Shamir's SSS     │
│  │ Redis 7        │  │    └──────────────────────────────────┘
│  │ S3 (MinIO)     │  │
│  └────────────────┘  │
└──────────────────────┘
```

---

## What's Working Well

Before diving into redesign recommendations, it's worth acknowledging the strong foundations:

**Cryptography layer** is production-grade. The Rust core with panic isolation at the FFI boundary, Zeroizing memory, mlock pinning, and the full key hierarchy (password → Argon2id → KEK → MEK → per-file HKDF) is correctly designed. Streaming AEAD with independent chunk nonces, nonce-reuse detection via HashSet, and explicit !Send+!Sync on the encryptor are all evidence of careful threat modeling.

**Backend service isolation** is clean. Services don't call each other; handlers orchestrate multi-service workflows. The dependency graph is strictly acyclic, and the manual constructor injection in main.go — while verbose — makes data flow completely traceable.

**Frontend state management** is disciplined. Fifteen focused Zustand stores with no god-store pattern, normalized vault data (byId + ids for O(1) lookups), and proper cleanup of all timers, listeners, and WebSocket connections on logout.

**Security posture** is comprehensive. SRP-6a with mutual M2 verification, FIDO2/WebAuthn, certificate pinning, device fingerprint binding, rate limiting, circuit breakers, account lockout, screenshot prevention, clipboard auto-clear — the threat model is well-covered.

---

## Redesign Recommendations

### 1. Backend: Repository Pattern Is Half-Implemented

**Current state:** `internal/database/interfaces.go` defines repository interfaces (VaultRepository, etc.), but services like VaultService, SharingService, and AuditService bypass them entirely, holding a raw `*pgxpool.Pool` and writing SQL inline. The repository interfaces exist but aren't wired up.

**Why this matters:** Services contain both business logic *and* data access logic in the same methods. This makes unit testing require a real database (or pgxmock), makes it harder to swap storage backends, and means SQL queries are scattered across service files rather than centralized.

**Recommendation:** Complete the repository pattern. Each service should depend on its repository interface, not the pool directly. This gives you isolated unit tests (mock the repository), centralized query management, and a clean separation between "what to do" and "how to persist it."

```
Before: VaultService → pgxpool.Pool → SQL inline
After:  VaultService → VaultRepository (interface) → PostgresVaultRepo → pgxpool.Pool
```

**Effort:** Medium. The interfaces already exist; the work is wiring implementations and updating service constructors.

---

### 2. Backend: Audit Logging Is By Convention, Not By Design

**Current state:** Handlers are responsible for calling `auditService.LogAction()` after performing operations. There is no compile-time or runtime enforcement that audit logging actually happens. If a developer adds a new endpoint and forgets to call the audit service, that operation goes unlogged — a compliance gap for a SOC 2–oriented product.

**Why this matters:** For an enterprise security product, audit completeness is a requirement, not a nice-to-have. Convention-based approaches fail silently.

**Recommendation:** Move audit logging into middleware or a decorator pattern. Two options:

Option A: **Audit middleware** that logs every mutating request (POST, PUT, DELETE) automatically based on route metadata. Handlers opt out rather than opt in.

Option B: **Service-layer decorator** where each service method is wrapped with an audit-logging proxy. The audit call is structurally guaranteed.

Option A is simpler and catches new endpoints by default. Option B gives richer audit detail but requires more wiring.

---

### 3. Backend: main.go Is a 600-Line God Function

**Current state:** `cmd/api/main.go` handles environment loading, logging setup, Sentry init, tracing init, database connection, Redis connection, S3 config, all service instantiation, GC job registration, router setup, middleware composition, route registration, graceful shutdown, and signal handling — all in one function.

**Why this matters:** This is the single most-changed file in any backend refactor. It's fragile, hard to test in isolation, and difficult for new contributors to navigate.

**Recommendation:** Decompose into focused initializers:

```
cmd/api/
├── main.go           (25 lines: parse flags, call run())
├── app.go            (App struct, Run method, shutdown)
├── infra.go          (DB, Redis, S3 client init)
├── services.go       (domain service construction)
├── router.go         (middleware + route registration)
└── jobs.go           (GC scheduler config)
```

Each file exports a single factory function. `App.Run()` calls them in order. This also makes integration testing much easier — you can construct an App with test doubles.

---

### 4. Frontend: Crypto Hex-Encoding Ceiling

**Current state:** The crypto bridge (`src/crypto/bridge.ts`) hex-encodes all data crossing the FFI boundary. This 2x memory overhead is documented as acceptable for files under 100MB (PL-033), but it creates a hard ceiling on file size.

**Why this matters:** Enterprise users will hit this wall. A 200MB file requires 400MB of hex-encoded memory in the JS heap, which will crash mobile devices and is wasteful on desktop.

**Recommendation:** Migrate to Uint8Array passthrough via JSI TurboModules (React Native) or SharedArrayBuffer (web). The Rust side already operates on raw bytes — the bottleneck is purely the JS bridge serialization. This is a high-effort change but removes a fundamental scalability constraint.

**Interim mitigation:** If TurboModule migration is deferred, implement streaming at the bridge level — pass file handles instead of buffers, and let the Rust side read/write directly to the filesystem. The streaming AEAD protocol already supports this pattern.

---

### 5. Frontend: Legacy vaultStore Coexists with vaultListStore

**Current state:** `vaultStore.ts` (25.6 KB) and `vaultListStore.ts` (31.2 KB) both manage vault state. The legacy store appears to be a compatibility layer, but both are actively imported. This creates confusion about which is canonical, and risks stale or inconsistent state if one is updated without the other.

**Why this matters:** Dual sources of truth for the same domain object is a class of bug that's hard to catch in reviews and manifests as intermittent UI inconsistency.

**Recommendation:** Complete the migration to `vaultListStore` as the single canonical store. Audit every import of `vaultStore`, migrate consumers, and delete the legacy file. If backward compatibility is needed during migration, make `vaultStore` a thin re-export facade over `vaultListStore`.

---

### 6. Frontend: Web Auth Divergence

**Current state:** Native authentication uses SRP-6a with Argon2id key derivation through the Rust crypto bridge. Web authentication uses a SHA-256 hash of the password stored in localStorage. The code comments mark this as "development only," but if the web platform is shipping to users, this is a material security gap.

**Why this matters:** SHA-256 is not a key derivation function. It has no memory-hardness, no iteration cost, and no salt in the current implementation. An attacker who accesses localStorage gets a hash that's trivially brutable on modern GPUs.

**Recommendation:** Either bring web auth to parity with native (compile the Rust crypto to WASM for Argon2id in-browser), or explicitly gate web as a dev-only target with clear UI indicators. If web is a shipping platform, this is a P0 security fix, not a redesign.

---

### 7. Electron: Companion Process Architecture

**Current state:** The Electron shell spawns the USB companion as a Node.js child process via `fork()`. The companion serves the Expo web export as static files and provides USB detection APIs over localhost HTTP. Health checks poll at 500ms intervals, and the companion auto-restarts up to 5 times on crash.

**Why this matters:** Running a full Express HTTP server as a child process for what is essentially IPC between two local processes is architecturally heavy. It introduces an HTTP attack surface (even on localhost), requires port negotiation (probing 3001-3010), and adds Helmet/CORS/rate-limiting overhead for calls that never leave the machine.

**Recommendation:** Replace the HTTP companion with direct Electron IPC. The renderer already communicates with the main process via `ipcRenderer.invoke()`. Move USB detection and vault container operations into the main process (or a worker thread), and eliminate the Express server entirely for the Electron target. The companion should only exist for standalone USB mode (where there is no Electron main process).

This simplifies the architecture to:
```
Before: Renderer → IPC → Main → HTTP → Companion → USB
After:  Renderer → IPC → Main → USB (direct)
        Standalone: Web → HTTP → Companion → USB (only this case)
```

---

### 8. Cross-Cutting: No Integration Test Harness

**Current state:** Backend has Go unit tests with pgxmock. Frontend has Jest unit tests and Playwright E2E. There is no integration test that exercises the full stack: frontend → API → database → S3, with the crypto bridge in the loop.

**Why this matters:** The most dangerous bugs in this architecture live at boundaries: the FFI layer, the API contract between frontend and backend, the multipart upload flow, the share acceptance handshake. Unit tests on each side can pass while the contract between them is broken.

**Recommendation:** Build a Docker Compose-based integration test suite that spins up the real stack (Go API, PostgreSQL, Redis, MinIO) and runs scenario tests: register user → create vault → upload encrypted file → share with second user → recipient decrypts. Use the existing Playwright setup to drive the frontend against the real backend. This becomes the gate for release candidates.

---

### 9. Backend: GC Jobs Lack Distributed Locking

**Current state:** The GC scheduler has a `LeaderChecker` interface for leader election, but the implementation details suggest it may be a simple boolean or Redis-based check. In a multi-replica Kubernetes deployment, multiple instances could run the same GC job simultaneously — particularly S3OrphanJob and AuditRetentionJob, which are expensive and not idempotent in all cases.

**Why this matters:** Duplicate GC runs waste resources and could cause race conditions (two instances trying to delete the same S3 object or archive the same audit records).

**Recommendation:** Implement distributed locking via Redis `SET NX EX` (or Redlock for multi-Redis) before each job execution. The lock key should include the job name and a TTL slightly longer than the job timeout. This is a small change with high reliability impact.

---

### 10. Cross-Cutting: API Versioning Strategy Is Absent

**Current state:** The API has no versioning mechanism. Routes are flat (`/auth/srp/init`, `/vaults/`, `/shares/`). The USB companion has an `apiVersion` field in its health check, but the main API server does not.

**Why this matters:** With native mobile clients that update asynchronously (App Store review delays), you will inevitably need to make breaking API changes while supporting old clients. Without versioning, this requires careful backward-compatible changes forever, or coordinated force-update campaigns.

**Recommendation:** Adopt URL-prefix versioning (`/v1/auth/srp/init`) now, before the first breaking change forces a retrofit. The chi router makes this trivial — mount the existing routes under a `/v1` group. New versions can coexist by mounting `/v2` alongside.

---

### 11. Frontend: Error Boundary Coverage Is Shallow

**Current state:** There's a root-level ErrorBoundary in `_layout.tsx` and a `withErrorBoundary` HOC available, but most screens don't use granular error boundaries. A crash in a single component (e.g., the file list renderer hitting a malformed blob) takes down the entire tab/screen.

**Why this matters:** In a security product, perceived reliability is part of the trust model. Users who see a full-screen crash while trying to access their encrypted files will lose confidence.

**Recommendation:** Add error boundaries at the screen level and around high-risk components (file list, crypto operations, share acceptance). Each boundary should show a contextual recovery UI ("Something went wrong loading your files. Tap to retry.") rather than a generic crash screen.

---

### 12. Deployment: No Blue-Green or Canary Strategy

**Current state:** The Kubernetes manifests exist in `deploy/k8s/`, but there's no evidence of a canary or blue-green deployment strategy. The CI/CD pipeline builds and pushes, but rollout strategy isn't defined.

**Why this matters:** For an encrypted storage product, a bad deployment that corrupts the vault index or breaks key derivation is catastrophic. Rolling updates with no canary means 100% of users hit a bad release simultaneously.

**Recommendation:** Implement canary deployments where 5-10% of traffic hits the new version first. Monitor error rates, latency percentiles, and audit log anomalies for 15-30 minutes before promoting. Kubernetes supports this natively via weighted service routing or tools like Argo Rollouts.

---

## Priority Matrix

| # | Area | Severity | Effort | Risk if Deferred |
|---|------|----------|--------|------------------|
| 6 | Web auth SHA-256 | **Critical** | Medium | Security vulnerability |
| 2 | Audit logging enforcement | **High** | Medium | Compliance gap |
| 9 | GC distributed locking | **High** | Low | Data races in production |
| 10 | API versioning | **High** | Low | Breaking changes block mobile releases |
| 3 | main.go decomposition | Medium | Low | Developer velocity drag |
| 1 | Repository pattern completion | Medium | Medium | Testing difficulty compounds |
| 5 | Legacy vaultStore removal | Medium | Low | State inconsistency bugs |
| 4 | Crypto hex-encoding ceiling | Medium | High | Blocks enterprise file sizes |
| 7 | Electron companion simplification | Medium | Medium | Unnecessary attack surface |
| 8 | Integration test harness | Medium | Medium | Boundary bugs ship undetected |
| 11 | Error boundary coverage | Low | Low | UX reliability perception |
| 12 | Canary deployment strategy | Low | Medium | Blast radius on bad deploys |

---

## Recommended Execution Order

**Phase 1 — Security & Compliance (Weeks 1-3):**
Items 6, 2, 9 — Fix the web auth gap, enforce audit logging, add GC locking.

**Phase 2 — API & Developer Experience (Weeks 4-6):**
Items 10, 3, 5 — Add API versioning, decompose main.go, remove legacy store.

**Phase 3 — Scalability & Reliability (Weeks 7-12):**
Items 1, 4, 7, 8 — Complete repository pattern, fix crypto encoding, simplify Electron IPC, build integration tests.

**Phase 4 — Polish (Ongoing):**
Items 11, 12 — Error boundaries and canary deployments.
