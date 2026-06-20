# USBVault Enterprise — Future Phases TODO

**Status:** Deferred until Enterprise V2.0 is 100% working and validated.
**Last updated:** 2026-03-15

---

## Phase 6: V3.0 Cloud Split-Key (~10 days)

**Goal:** Implement ZERO-TRUST principle — no single system can decrypt alone.
**Principle impact:** ZERO-TRUST goes from PARTIAL → TRUE (8/8 principles)

- [ ] Key splitting protocol: `MASTER_KEY = HKDF(LOCAL_KEY || REMOTE_KEY)`
  - LOCAL_KEY derived from password + USB salt
  - REMOTE_KEY stored encrypted on server (user's account)
  - Neither half alone can decrypt
- [ ] Server-side key shard storage
  - Go endpoint: `POST /api/v1/vaults/{id}/key-shard`
  - Shard encrypted with SRP-derived key (server never sees plaintext)
- [ ] Client-side HKDF combination in vaultOrchestrator.unlock()
  - Fetch remote shard → decrypt with SRP key → HKDF → final key
  - Fallback: cached shard from last sync (encrypted in sessionStorage)
- [ ] Offline grace period
  - Allow N offline unlocks before requiring server re-auth
  - Cached shard TTL: configurable (default 7 days)
- [ ] Migration path
  - Existing V4 vaults upgrade to split-key
  - "Enable Cloud Split-Key" toggle in provisioning wizard
  - Upgrade flow: unlock → derive split → store remote shard → re-wrap MEK

---

## Phase 7: V4.0 Advanced Security (~15 days)

**Goal:** Complete the "Ghost" vision — steganography, security tiers, duress password.

- [ ] Steganographic embedding (5 days)
  - Hide VAULT.bin inside carrier files (PNG, JPEG, WAV)
  - LSB steganography for images, echo hiding for audio
  - No visible VAULT.bin on USB — plausible deniability
  - Carrier file looks like a normal photo/song
- [ ] Security tier selection (3 days)
  - SECRET: Argon2id 64 MiB, password only
  - TOP-SECRET: Argon2id 128 MiB, password + FIDO2 required
  - PRESIDENTIAL: Argon2id 256 MiB, password + FIDO2 + cloud split-key required
  - Tier stored in vault header, enforced at unlock
- [ ] Hardware key enforcement (2 days)
  - TOP-SECRET and PRESIDENTIAL REQUIRE FIDO2 hardware key
  - Cannot fall back to password-only
  - PRF extension mandatory (not just assertion)
- [ ] Duress password (3 days)
  - Secondary password triggers self-destruct instead of unlock
  - Looks like normal login to observer
  - Generates plausible decoy data while wiping real vault
  - Stored as separate hash in vault header
- [ ] Secure file viewer (2 days)
  - In-app file preview with auto-wipe timer (default 90 seconds)
  - No temp files on host filesystem
  - Sandboxed iframe with download disabled
  - Countdown timer visible to user

---

## Phase 8: Launch Readiness (~5 days)

**Goal:** Everything needed to ship to paying customers.

- [ ] Security audit preparation (1.5 days)
  - Crypto algorithm documentation for pen testers
  - SAST/DAST report compilation
  - Threat model document
  - Test coverage report
- [ ] Legal & compliance (1 day)
  - Finalize privacy policy + terms of service
  - GDPR compliance documentation
  - Export control assessment (crypto software — EAR/ITAR)
  - Data processing agreements for enterprise customers
- [ ] Packaging & distribution (1 day)
  - USB images for distribution (ISO/IMG for direct USB write)
  - TOOLS partition template with all 3 platform launchers
  - Automated USB provisioning script for bulk deployment
- [ ] Documentation delivery (1 day)
  - Ensure all 7 documents from DOC-001 through DOC-007 are generated
  - Review for accuracy against current codebase
  - Version-stamp all documents
- [ ] Support infrastructure (0.5 day)
  - GitHub Issues for bug reporting
  - Knowledge base / FAQ
  - Sentry production configuration
  - On-call procedures and runbook

---

## Other Items (No Phase Assigned)

- [ ] Process isolation for crypto (run Rust FFI in subprocess instead of in-process)
- [ ] ptrace anti-debug for native builds (Rust implementation)
- [ ] Crypto Classroom: expand from 4 demos to full 7 ciphers + 6 KDFs per V2.0 spec
- [ ] Settings persistence: move security-critical settings from localStorage to vault header
- [ ] Centralized progress overlay for long operations (provision, compact, zero-trace)
- [ ] Windows USB eject: test the full 10-step PowerShell protocol on real hardware
- [ ] Linux USB: test on Ubuntu, Fedora, Arch with different automounters
- [ ] Mobile (iOS/Android): test Expo EAS builds on real devices
- [ ] Accessibility audit (screen reader support, keyboard navigation, color contrast)
- [ ] Performance profiling (Argon2id derivation time on low-end hardware)
