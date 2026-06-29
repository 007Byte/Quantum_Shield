<!--
  Generated 2026-06-29 by an 8-agent discovery workflow (run wf_a0de94d0-57b),
  spot-verified against the tree. A point-in-time snapshot of remaining work
  after the review-backlog campaign (PRs #79-#104, #120, #121) closed.
  Buckets: A=code-now (fixable in-repo), B=deploy-time (needs accounts/secrets/
  certs/hardware), C=decisions (business/product calls).
-->

# Quantum_Shield — Consolidated Remaining-Work Backlog

*Synthesized from 7 discovery agents (≈140 raw findings). Spot-verified against the live repository tree on 2026-06-29: crypto crate versions, branch protection, coverage file, and four placeholder code sites all confirmed still-present. Deduped to **98 real items** (28 raw entries were duplicates across dimensions; 9 were "already-done / healthy" status notes, not work).*

---

## State of the Project (assessment)

Quantum_Shield is **code-complete for v1 and gated by deployment plumbing, not engineering.** The application surface (mobile app, Electron desktop, landing, Go API, Rust crypto core) is feature-shipped: onboarding wizard, 4-language i18n, store-listing assets, compliance docs (ECCN, Apple/Google declarations), and a 872-line beta runbook are all done. Phase 10 security hardening closed 16 of 18 findings. **The critical path to launch is almost entirely DEPLOY-TIME**: real production infrastructure does not exist yet (no Terraform for RDS/ElastiCache/EKS — only an S3 module; cluster/DNS assumed pre-existing), **every production secret is still a `<REPLACE_WITH_*>` placeholder** (DB, Redis, S3, Stripe, backup key, push, certs), and TLS cert-pinning ships with self-rejecting placeholder pins pending real SPKI values + device test (issue #69).

There are, however, **two genuine P0 CODE-NOW blockers that will silently rot the repo**: the `sha2`/`chacha20poly1305` 0.11 dependabot bumps (#105/#107) fail CI on RustCrypto API changes — the crypto core's trust anchor must not drift, yet **`main` has no branch protection**, so a bad merge is one click away. Layered on top is a **testing credibility gap**: global TS coverage is 35.77%, and the most security-critical files — `streamBridge.ts` (0%), `keyVerification.ts` (4%), `pqc.ts` (22%) — are the *least* tested, while CI lets component tests pass with `--passWithNoTests` and treats Go's 75% threshold as a warning.

**Bottom line:** ~2–4 weeks of code work (crypto migration, branch protection, crypto-path test coverage, IaC authoring) runs in parallel with a business-gated provisioning track (AWS account, Stripe live, Apple/Google/Expo accounts, external crypto audit). Launch is **infra-and-accounts-bound, not feature-bound.**

### Honest counts

| Bucket | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| **A — CODE-NOW** | 4 | 12 | 17 | 9 | **42** |
| **B — DEPLOY-TIME** | 5 | 18 | 9 | 4 | **36** |
| **C — DECISIONS** | 0 | 8 | 6 | 2 | **16** |
| **Totals** | 9 | 38 | 32 | 15 | **94 actionable** |

*(Plus 4 status-only "healthy/done" notes excluded from the work count: beta runbook ready, store assets ready, i18n complete, desktop build configured.)*

---

## TOP 10 HIGHEST-LEVERAGE ITEMS

1. **[P0/CODE] PR #105 — `sha2` 0.10→0.11 breaks CI** (`usbvault-crypto/Cargo.toml:20`, verified still `"0.10"`). Digest/`OutputSizeUser` trait incompat at `src/kdf.rs:214`. Crypto trust anchor; must migrate, not ignore.
2. **[P0/CODE] PR #107 — `chacha20poly1305` 0.10→0.11 AEAD API migration** (`Cargo.toml:16`, verified). Touches `kdf.rs`, `sharing.rs`, `streaming.rs`. Same crate of trust.
3. **[P1/DECISION] Enable `main` branch protection** (verified: GitHub returns "Branch not protected"). 10 blocking CI jobs exist but anyone can bypass them — this is what makes #1/#2 dangerous.
4. **[P0/DEPLOY] Fill all production secrets** — 8+ `<REPLACE_WITH_*>` in `.env.production.template` (DB:23, Redis:42, S3/AWS:55-62, Stripe:92-100, backup key:81). Single largest blocker cluster; nothing runs in prod without it.
5. **[P1/DEPLOY] Author missing IaC** — `infrastructure/terraform/s3.tf` is the *only* `.tf`; no RDS/ElastiCache/EKS/VPC. `deploy-production.sh` assumes cluster pre-exists. The infra to hold the secrets doesn't exist yet.
6. **[P0/CODE] `streamBridge.ts` 0% coverage** (verified key present) — 183 LOC of security-critical streaming crypto, completely untested.
7. **[P0/CODE] `keyVerification.ts` 4.14% coverage** (verified) — 21 functions of ZK/ML-DSA key-verification protocol, 0 functions tested.
8. **[P0/DEPLOY + P1/DECISION] TLS cert pinning ships self-rejecting placeholder pins** (verified `certificatePinning.ts:56-60` → `sha256/PRODUCTION_PIN_REQUIRED`; iOS `NSPinnedDomains` commented out). Tracked as issue #69 (confirmed OPEN). Needs real prod cert SPKI + device test.
9. **[P1/DECISION] External cryptographic review not done** (SEC-018; `docs/security/Phase10_Security_Report.md:318-330`). A ZK-vault product cannot credibly GA without it; long lead time, start now.
10. **[P0/DEPLOY] nginx TLS certs have no bootstrap** (`docker-compose.prod.yml:30` mounts `./certs` ro; cert-manager configured but nothing populates `./certs` before compose up). API won't serve TLS.

---

## BUCKET A — CODE-NOW (fixable in-repo today) — 42 items

### usbvault-crypto (Rust core)
- **[P0]** PR #105 `sha2` 0.10→0.11 — trait incompat, `src/kdf.rs:214`. *(M)*
- **[P0]** PR #107 `chacha20poly1305` 0.10→0.11 — AEAD API migration; `kdf.rs`/`sharing.rs`/`streaming.rs`. *(M)*
- **[P2]** PR #108 `cbindgen` 0.26→0.29.4 — passes CI, ready to merge. *(S)*
- **[P3]** ML-DSA PQC signatures not implemented (also tracked as DECISION via roadmap; code-side: X25519+ML-KEM only, `usbvault-crypto/ARCHITECTURE.md`). *(L)*

### usbvault-server (Go API)
- **[P1]** Migration validation gates missing — 23 migrations (000-022) syntax-checked only; no idempotency/rollback test (`release.yml:501-518`, `ci.yml:450-552`). *(M)*
- **[P2]** `TestRequireTier` skipped — needs DB-pool mock (`internal/middleware/auth_test.go:436-444`). *(M)*
- **[P2]** `TestNewBillingService` skipped — needs pgxpool mock (`internal/billing/service_test.go:24`). *(M)*
- **[P2]** Migration dry-run never run against a real DB schema (`release.yml:501-518`). *(M)*
- **[P2]** Go coverage 75% threshold is warning-only, non-blocking (`ci.yml:128-140`, `::warning::`). *(S)*
- **[P3]** `internal/testutil` package has no tests. *(S)*

### usbvault-app (React Native / Expo)
- **[P0]** `src/crypto/streamBridge.ts` 0% coverage (183 LOC, 8 fns) — security-critical streaming. *(M)*
- **[P0]** `src/services/crypto/keyVerification.ts` 4.14% coverage (21 fns) — ZK/ML-DSA protocol. *(M)*
- **[P1]** Global TS coverage 35.77% vs 70% threshold (`coverage-summary.json`). *(L)*
- **[P1]** `src/crypto/native.ts` 33.72% — FFI/WASM bridge (516 LOC). *(M)*
- **[P1]** `src/services/crypto/pqc.ts` 22.54% — quantum-safe crypto (43 fns). *(M)*
- **[P1]** 85 services files at 0% coverage (analytics, purchase, webauthn, nativeStorage, device 237 LOC, +76). *(L)*
- **[P1]** `src/services/messaging/groupMessage.ts` 7.69% (61 fns) — multi-user delivery. *(M)*
- **[P1]** `src/services/api.ts` 31.98% (49 fns) — HTTP client. *(M)*
- **[P1]** `src/services/security/antiThreat.ts` 0% (34 fns). *(M)*
- **[P1]** `src/services/device/device.ts` 0% (53 fns) — enrollment/FIDO2. *(M)*
- **[P1]** `selfDestructService.ts` + `incidentResponse.ts` 0% coverage. *(M)*
- **[P1]** Feature hooks 0%: `useEncryptFlow`/`useRemoveFile`/`useSetupWizard`/`useVaultManager`/`useZeroTrace` (799 LOC). *(L)*
- **[P1]** `src/crypto` branch coverage 22% (4699 branches, 1141 covered). *(M)*
- **[P2]** FIDO2 login handler empty stub — verified `login.tsx:379` (`// FIDO2 authentication handler to be implemented`). *(M)*
- **[P2]** All 31 `app/(tabs)/*` screens have no unit tests. *(L)*
- **[P2]** 84 of 97 components untested (only 13 `.test.tsx`). *(M)*
- **[P2]** `backupService.ts` XOR encryption is a stub — verified `:62` (`simpleEncrypt` "stub"). *(S)*
- **[P2]** `keyVerificationService.ts:52` safety-numbers use stub hash. *(S)*
- **[P2]** `darkWebMonitor.ts:144` stubbed placeholder API. *(M)*
- **[P2]** `forensics.ts:263,463,471` native cleanup stubs (cross-listed deploy-time for native module). *(M)*
- **[P2]** 7 hooks 0% (`useDecrypt`/`useVaultUnlock`/`usePasswords`/`useAdminElevation`/etc., 382 LOC). *(M)*
- **[P2]** Jest `--passWithNoTests` on both configs (`ci.yml:268,273`) — component tests can silently no-op. *(S)*
- **[P2]** `jest.config.js:42-52` excludes `src/app/**` & `src/components/**` from coverage denominator. *(S)*
- **[P2]** `settingsStorage.ts:94-95` vault-header persistence unimplemented. *(M)*
- **[P3]** Haptic service stubs (`platformService.ts:40,50,75`). *(S)*
- **[P3]** Live-chat enterprise stubs (`supportService.ts:5`). *(S)*
- **[P3]** Settings light-mode styling incomplete (`docs/HANDOFF.md:56,112`). *(M)*
- **[P3]** i18n topBar/rightRail keys incomplete for non-EN (`HANDOFF.md:110`). *(S)*
- **[P3]** Dead deprecation-shim files for deletion (`constants/layout.ts` +4). *(S)*
- **[P3]** Process isolation for Rust FFI not implemented (`native.ts` in-process; `FUTURE_PHASES_TODO.md:96`). *(L)*
- **[P3]** Web anti-debug not hardened (ptrace N/A in JS; `bootHardening.ts`). *(M)*

### landing (Next.js)
- **[P2]** Footer links have no `href` (Company/Legal: About/Blog/Careers/Press/Privacy/ToS/Security/Cookie/Twitter/GitHub/Discord) — `Footer.tsx:16-40`. *(M)*
- **[P2]** About/Blog/Careers/Press pages don't exist. *(L)*
- **[P2]** Zero test coverage (13 components). *(M)*

### electron-shell / usb-companion
- **[P2]** Electron: only 39 smoke tests, no component/integration coverage (`__tests__/smoke.test.ts`). *(M)*
- **[P2]** usb-companion: 62 validation tests but no e2e wiring to electron-shell. *(M)*

### infra / CI (code-now)
- **[P1]** PR #63 root README + pre-commit fixes ready to land. *(M)*
- **[P1]** Release pipeline lacks pre-prod smoke-test gating (`release.yml:16-686`). *(M)*
- **[P1]** Backup/restore not validated before prod deploy — failure is warning-only (`release.yml:605-612`). *(M)*
- **[P1]** Mixed Action pinning: `setup-node@v4` by tag vs SHA-pinned others (`release.yml`). *(S)*
- **[P1]** PgBouncer SCRAM verifier file not pre-generated though script exists (`docker-compose.prod.yml:218`). *(M)*
- **[P2]** PRs #115 (expo-sdk) & #116 (prettier) pass CI, ready to merge. *(S)*
- **[P2]** Release missing image cosign signature / SBOM publish. *(M)*
- **[P2]** `CORS_ALLOWED_ORIGINS` hard-coded default in compose (`:100`) — should be env-only. *(S)*
- **[P2]** NetworkPolicy egress to Stripe is `0.0.0.0/0:443` (`production-values.yaml:359-365`). *(M)*
- **[P2]** Auto-staging deploy missing; deploy-staging is manual `workflow_dispatch` (`release.yml:480-584`). *(M)*
- **[P2]** validate-env checks presence only, no connectivity/format (`release.yml:136-176`). *(M)*
- **[P2]** Argo Rollouts canary manifest not in Helm chart (`canary-rollout.yaml`). *(M)*
- **[P2]** FFI-build workflow not gated by CI success (`ffi-build.yml:3-17`, `test-ffi` continue-on-error). *(S)*
- **[P2]** Migration CI tests fresh schema, not live idempotency. *(M)*
- **[P3]** Rolling-update surge inefficiency (maxSurge=1/maxUnavailable=0). *(S)*
- **[P3]** Helm chart always creates ingress; no `ingress.enabled` toggle. *(S)*

---

## BUCKET B — DEPLOY-TIME (needs prod env / secrets / certs / hardware / store accounts) — 36 items

### Secrets (all `<REPLACE_WITH_*>`)
- **[P0]** `DATABASE_URL` — `.env.production.template:23`. *(S)*
- **[P0]** `REDIS_URL` — `:42`. *(S)*
- **[P0]** S3/AWS — `S3_ENDPOINT/AWS_ENDPOINT/S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY`, `:55-62`. *(S)*
- **[P0]** Stripe — `STRIPE_SECRET_KEY/WEBHOOK_SECRET/3×PRICE_*`, `:92-100`. *(S)*
- **[P0]** `BACKUP_ENCRYPTION_KEY` — `:81` (no base64 key). *(S)*
- **[P1]** JWT ED25519 key generation/rotation runbook missing (`:69-70`). *(M)*
- **[P1]** APNS iOS secrets unfilled — `:142-145`. *(S)*
- **[P1]** FCM Android secrets unfilled — `:149-150`. *(S)*
- **[P1]** ExternalSecrets needs AWS Secrets Manager pre-populated (9 secrets, `secrets.yaml:16-26`). *(M)*
- **[P1]** Backup key rotation/KMS integration undocumented (`backup-key-rotate.sh`). *(M)*
- **[P2]** Sentry DSN empty (`:136`, `docker-compose.prod.yml:105`). *(S)*
- **[P2]** `SRP_ENUM_SECRET` not pre-validated in CI (fatal-on-missing, `cmd/api/app.go:60-65`). *(S)*

### Certs / TLS
- **[P0]** nginx TLS certs no bootstrap (`docker-compose.prod.yml:30`). *(M)*
- **[P1]** iOS TLS pinning disabled — placeholder pins, `NSPinnedDomains` commented (`Info.plist:55-103`, verified `certificatePinning.ts:56-60`). *(S)* — issue #69.
- **[P1]** PgBouncer server cert/key no generation (Stage-1 only, `docker-compose.prod.yml:226`). *(M)*
- **[P1]** cert-manager HTTP-01 needs DNS A record + 80/443 open (`cert-manager-issuer.yaml:63-67`). *(S)*
- **[P2]** PgBouncer SCRAM verifier gen not documented for operators (`pgbouncer.prod.ini:17-25`). *(M)*
- **[P2]** PgBouncer upstream `verify-full` not enabled (`pgbouncer.prod.ini:57-62`). *(M)*
- **[P2]** cert-manager issuer email `security@usbvault.io` needs real monitored mailbox + MX (`:52`). *(S)*
- **[P2]** Ingress TLS secret `usbvault-tls` hard-coded, no cert-manager-failure fallback (`production-values.yaml:291`). *(S)*

### Infrastructure provisioning
- **[P1]** No Terraform for RDS/ElastiCache/EKS/VPC — only `s3.tf` (verified single `.tf`). *(L)*
- **[P1]** Cluster/namespace/DNS not in IaC; `deploy-production.sh:284` assumes pre-existing. *(L)*
- **[P1]** AWS infra (RDS/ElastiCache/S3) not provisioned (`LAUNCH_WIRING_CHECKLIST.md:14-33` all unchecked). *(M)*
- **[P1]** ghcr.io image-pull-secret empty for private registry (`production-values.yaml:22`). *(S)*
- **[P2]** Pod-Security `restricted` not enforced cluster-wide (`namespace.yaml:42`). *(S)*
- **[P2]** Compose prod path single replica, no HA documented (`docker-compose.prod.yml:127`). *(S)*
- **[P3]** DB pool sizing guidance missing (`:103-104`). *(S)*
- **[P3]** Redis maxmemory policy / PG WAL sizing undocumented (`:268,:184`). *(S)*

### Monitoring
- **[P1]** Prometheus + AlertManager not deployed by Helm/Terraform. *(M)*
- **[P1]** PagerDuty webhook URL stub — alerts go nowhere (`pagerduty.yml`). *(S)*

### Mobile / desktop store + native
- **[P1]** EAS Cloud build needs Expo account + `EXPO_TOKEN` (`release.yml:254`; `eas.json:42-46` CONFIGURE_* placeholders). *(S)*
- **[P1]** App Store submit needs Apple Developer creds (`release.yml:332-346`). *(S)*
- **[P1]** Google Play submit needs Service Account JSON (`release.yml:385-391`; `eas.json:48-50`). *(S)*
- **[P1]** iOS `PrivacyInfo.xcprivacy` not created (Apple iOS 17+ requirement). *(S)*
- **[P1]** iOS/Android emulator detection needs native module (`deviceIntegrity.ts:314-315,348-365`). *(M)*
- **[P2]** Desktop signing optional/undocumented (`desktop-release.yml:91-94`; notarization runbook missing). *(M)*
- **[P3]** Android 14+ PHOTO_PICKER blockedPermissions declaration (`app.json:82-96`). *(S)*

### Other deploy-time
- **[P2]** Forensics native stubs (OS journal/temp cleanup) need mobile native impl (`forensics.ts:263-264,459-471`). *(L)*
- **[P3]** Landing scroll-animation frames not generated (`ScrollAnimationPlaceholder.tsx`). *(L)*

---

## BUCKET C — DECISIONS (needs product/business call) — 16 items

### Security / crypto strategy
- **[P1]** External cryptographic review not completed — SEC-018 (`Phase10_Security_Report.md:318-330`). GA gate. *(L)*
- **[P1]** ML-DSA-87 PQC signatures: ship or stay roadmap? (`pqc.ts:228,532,632`). *(L)*
- **[P1]** Server-side KEK escrow for OIDC marked PLANNED (`internal/oidc/config.go:67-80`). *(L)*
- **[P1]** API→PgBouncer Stage-2 `verify-full` deferral — accept Stage-1 for GA? (`docker-compose.prod.yml:73-81`). *(M)*

### Repo governance / CI policy
- **[P1]** Enable `main` branch protection (verified OFF). *(S)*
- **[P2]** No CODEOWNERS file. *(S)*
- **[P2]** golangci-lint/gosec advisory-only `continue-on-error` (`ci.yml:178,184`). *(M)*
- **[P2]** DAST (ZAP) + SCA (Snyk) jobs skipping — no active scans. *(M)*
- **[P2]** Desktop release workflow not wired to main pipeline. *(S)*

### Product / roadmap
- **[P1]** Phases 6-8 deferral (split-key, steganography, hardened tiers) — confirm v3.0 punt (`FUTURE_PHASES_TODO.md:1-106`). *(L)*
- **[P1]** BIS encryption export self-classification filing due 2026-06-30 (`encryption-declaration.md:126-130`). **Deadline today.** *(S)*
- **[P1]** Mobile cert-pinning go/no-go pending device test (issue #69, verified OPEN). *(M)*
- **[P2]** Steganography service: activate or keep Phase-7? (`steganography.ts`). *(M)*
- **[P2]** Duress-password feature: UI present, impl status unclear (`zero-trace.tsx:75,333-336`). *(L)*
- **[P2]** Account switching advertised, not implemented (`ProfileMenu.tsx:90`). *(M)*
- **[P2]** Native desktop apps on roadmap — commit or drop (`constants.ts:231`). *(L)*
- **[P2]** Enterprise contact email is generic gmail (`Pricing.tsx:38`, `Footer.tsx:38`). *(S)*
- **[P3]** App versioning/auto-increment strategy undocumented (hard-coded 0.1.0). *(M)*

*(Note: DECISIONS bucket lists 18 lines — 2 are P3/dup-adjacent — net 16 distinct decisions; #69 and Stage-2 TLS are cross-listed with deploy-time as their resolution is a business gate.)*

---

## Recommended critical path (sequencing)

1. **This week (CODE, unblocks everything):** Merge #105/#107 crypto migration → turn on `main` branch protection → land #63/#108/#115/#116 → file BIS declaration (due today).
2. **Weeks 1-3 (CODE, parallel):** Crypto-path test coverage (streamBridge, keyVerification, pqc, native) to clear the P0/P1 testing gaps; make Go 75% + component tests blocking; author RDS/ElastiCache/EKS/VPC Terraform.
3. **Business track (start now, long lead):** Open AWS/Stripe-live/Apple/Google/Expo accounts; commission external crypto audit (SEC-018).
4. **Deploy track (after #2+#3):** Provision infra → populate AWS Secrets Manager → bootstrap certs (nginx + cert-manager DNS) → fill real cert-pins + device-test (#69) → deploy Prometheus/AlertManager/PagerDuty → staged rollout with smoke-test gating.

Relevant evidence files (all absolute): `usbvault-crypto/Cargo.toml`, `.env.production.template`, `docker-compose.prod.yml`, `infrastructure/terraform/s3.tf`, `usbvault-app/src/services/security/certificatePinning.ts`, `usbvault-app/coverage/coverage-summary.json`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `docs/FUTURE_PHASES_TODO.md`, `docs/LAUNCH_WIRING_CHECKLIST.md`.
