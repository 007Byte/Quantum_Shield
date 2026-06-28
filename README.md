# Quantum_Shield

[![CI Pipeline](https://github.com/007Byte/Quantum_Shield/actions/workflows/ci.yml/badge.svg)](https://github.com/007Byte/Quantum_Shield/actions/workflows/ci.yml)
[![Security Scanning](https://github.com/007Byte/Quantum_Shield/actions/workflows/security.yml/badge.svg)](https://github.com/007Byte/Quantum_Shield/actions/workflows/security.yml)
[![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)](#license)

> **Zero-knowledge, post-quantum encrypted file vault** — portable across USB, web, mobile, and desktop. Your password and keys never leave your device.

Quantum_Shield is a cross-platform encrypted storage system for sensitive files. All cryptography runs **client-side**: the backend stores only ciphertext and never sees your password, keys, or plaintext. Files are protected with **hybrid post-quantum encryption** (X25519 + ML-KEM-1024), so data stays confidential even against a future quantum adversary.

> **A note on naming:** the product is **Quantum_Shield**. The `usbvault-*` names throughout the tree — the `usbvault-crypto` / `usbvault-server` / `usbvault-app` directories, the `@usbvault/*` packages, and the `usbvault.io` domains — are the **code namespace**: a deliberately-retained implementation identity, not a second product name. See [`NAMING.md`](NAMING.md).

---

## Architecture

A monorepo of three core components, plus supporting infrastructure. The client does all the cryptography; the server is **zero-knowledge** and only ever handles ciphertext.

| Component | Stack | Role |
|---|---|---|
| **[`usbvault-crypto`](usbvault-crypto/README.md)** | Rust (FFI + WASM) | The cryptographic core — ciphers, KDF, signing, post-quantum KEM, SRP, Shamir. Compiles to native libraries for iOS / Android / macOS / Windows / Linux, and to WASM for the web. |
| **[`usbvault-server`](usbvault-server/README.md)** | Go 1.25 | Zero-knowledge API backend — authentication, storage coordination (presigned S3), sharing, audit log, multi-device sync. Never sees plaintext or keys. |
| **[`usbvault-app`](usbvault-app/README.md)** | TypeScript · React Native + Expo SDK 54 | Cross-platform client (web · iOS · Android; desktop via Electron). Vault management, file encrypt/decrypt/share, password manager, backup/restore, device management, FIDO2. |

**Data flow (zero-knowledge):**

```
  Your device                                   Server (zero-knowledge)
  ───────────                                   ───────────────────────
  password ──Argon2id──▶ master key
  files ──encrypt client-side──▶ ciphertext ──presigned URL──▶ S3 / MinIO (blob storage)
       (AES-256-GCM-SIV / XChaCha20-Poly1305)
  SRP-6a proof ─────────────────────────────▶ authenticates (password never transmitted)

  Server only ever stores: ciphertext, public keys, wrapped keys, and a
  tamper-evident audit log. It never receives plaintext, master keys, or passwords.
```

Supporting directories: `electron-shell/` (desktop wrapper) · `usb-companion/` (local Node bridge for USB device access) · `landing/` (marketing site) · `infrastructure/`, `deploy/`, `pgbouncer/` (ops) · `docs/`, `runbooks/` (documentation).

---

## Security model

- **Zero-knowledge by design** — encryption happens only on the client; the server stores ciphertext + wrapped keys and never receives plaintext or passwords. File bytes move directly to/from object storage via short-lived presigned URLs.
- **Authentication** — SRP-6a (RFC 5054 protocol) over the RFC 7919 `ffdhe3072` 3072-bit group, so the password is never sent over the wire; optional FIDO2 / WebAuthn hardware keys; signed, device-bound access + refresh tokens; account lockout and rate limiting.
- **Post-quantum** — hybrid X25519 + ML-KEM-1024 (FIPS 203); data stays protected as long as *either* scheme remains unbroken.
- **Ciphers & KDF** — AES-256-GCM-SIV and XChaCha20-Poly1305 (streaming AEAD with independent per-chunk nonces); Argon2id (RFC 9106) key derivation.
- **Key hierarchy** — master password → Argon2id → master key → wrapped master-encryption-key → per-file keys (HKDF).
- **Recovery & sharing** — Shamir secret sharing (GF(256)) for guardian-based recovery; X25519 sealed-box end-to-end file sharing.
- **Hardening** — hash-chained, tamper-evident audit log; NIST SP 800-63B-4 password policy with a Have-I-Been-Pwned breach check; secure-memory zeroization; app auto-lock, clipboard auto-clear, screenshot prevention, jailbreak/root detection, and TLS certificate pinning.

Found a vulnerability? See **[`SECURITY.md`](SECURITY.md)** for the coordinated-disclosure policy.

---

## Tech stack

**Rust** 2021 (crypto core) · **Go** 1.25 (backend) · **TypeScript** 5 / **React Native** 0.81 + **Expo** SDK 54 (client)
· **PostgreSQL 16** · **Redis 7** · **MinIO** (S3-compatible) · **PgBouncer** · **Docker Compose** (local infra) · **GitHub Actions** (CI/CD)

---

## Repository layout

```
.
├── usbvault-crypto/   # Rust cryptographic core (FFI + WASM)
├── usbvault-server/   # Go zero-knowledge API backend
├── usbvault-app/      # React Native / Expo client (web · iOS · Android)
├── electron-shell/    # Desktop (Electron) wrapper
├── usb-companion/     # Local Node bridge for USB device access
├── landing/           # Marketing / landing site
├── infrastructure/    # Infrastructure-as-code & environment config
├── deploy/            # Deployment manifests
├── pgbouncer/         # Connection-pooler config
├── scripts/           # Build, CI-mirror (preflight.sh), security & ops scripts
├── docs/              # Architecture, deployment, QA/QC, ADRs
├── runbooks/          # On-call operational runbooks
├── Makefile           # Cross-component build / test / lint / security targets
└── docker-compose*.yml # Local (dev), test, and prod service stacks
```

---

## Getting started

**Prerequisites:** Rust (stable toolchain), Go 1.25, Node 20+, Docker, and `make`.

```bash
# 1. one-time dev setup — installs the pre-push QA harness (needs `pipx install pre-commit`)
make setup-hooks

# 2. start local infrastructure (PostgreSQL, Redis, MinIO, PgBouncer)
make docker-up

# 3. run the backend API (:8080)
cd usbvault-server && go run ./cmd/api

# 4. run the client on the web
cd usbvault-app && npm ci && npm run web
```

Component-specific build/run instructions live in each component's README:
[crypto](usbvault-crypto/README.md) · [server](usbvault-server/README.md) · [app](usbvault-app/README.md).

---

## Testing, CI & QA

Every change is gated by a **blocking** CI pipeline — and you can run the *exact* same gates **locally before pushing**:

```bash
scripts/preflight.sh --full     # mirror the full CI pipeline on your machine
make test                       # run all component test suites
```

- **`scripts/preflight.sh`** reproduces the CI gates locally; a **git pre-push hook** runs it automatically (`make setup-hooks`), so problems are caught before they reach CI. Full runbook: **[`docs/QA_QC.md`](docs/QA_QC.md)**.
- **GitHub Actions** — `ci.yml` (Rust · Go · React Native · DB migrations · Playwright E2E · integration · security · env — all blocking), `security.yml` (SAST / SCA / secret-scan / DAST), `ffi-build.yml` (10-platform cross-compile), plus release / preview / fuzz / container-signing workflows.
- **Dependencies** — Dependabot patch/minor updates self-merge once CI is green (`dependabot-automerge.yml`); major updates are held for human review.

---

## Documentation

| Topic | Where |
|---|---|
| Component guides | [crypto](usbvault-crypto/README.md) · [server](usbvault-server/README.md) · [app](usbvault-app/README.md) |
| Security policy & disclosure | [`SECURITY.md`](SECURITY.md) |
| Project naming (Quantum_Shield / USBVault) | [`NAMING.md`](NAMING.md) |
| Contributing | [`usbvault-app/CONTRIBUTING.md`](usbvault-app/CONTRIBUTING.md) |
| QA/QC process | [`docs/QA_QC.md`](docs/QA_QC.md) |
| Deployment & operations | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/INCIDENT_RESPONSE.md`](docs/INCIDENT_RESPONSE.md) · [`runbooks/`](runbooks/) |
| Everything else | [`docs/`](docs/) — FAQ, troubleshooting, ADRs, launch checklists |

---

## Status & known gaps

This README is intentionally honest about the project's current state:

- **Active development, pre-1.0.** Every component is at `0.1.0`; treat this as a work in progress, not a released product.
- **No `LICENSE` file.** The code is **proprietary** (`usbvault-crypto/Cargo.toml` declares `license = "Proprietary"`), but no top-level license/copyright notice is committed yet.

---

## License

**Proprietary — all rights reserved.** No open-source license is granted. A formal `LICENSE` / copyright notice has not yet been added to the repository (see [Status & known gaps](#status--known-gaps)).
