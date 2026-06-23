# QA/QC: run CI locally, before you push

## Why this exists

For a stretch we shipped a change, waited ~25 min for GitHub CI, let CI find the
next problem, fixed it, and pushed again — an endless push→CI→fix loop. The fix
is simple discipline backed by tooling: **run the same gates CI runs, on your
machine, before every push.** Nothing reaches CI unvalidated. CI becomes a
confirmation, not a discovery tool.

This is enforced by `scripts/preflight.sh` (the local CI mirror) + a git
**pre-push hook** + an optional multi-agent QA pass for larger changes.

## The one rule

> **Never push without `scripts/preflight.sh` green.** For anything non-trivial,
> also get the multi-agent **qc-adversary** sign-off (below). The pre-push hook
> enforces the harness automatically; bypass it only in a real emergency with
> `git push --no-verify`, and say so.

## `scripts/preflight.sh` — the local CI mirror

Runs the **exact** CI commands (same flags, working dirs, env/DSNs, pinned tool
versions) and prints a PASS/FAIL summary; exits non-zero if any gate fails.

```bash
scripts/preflight.sh --full          # every locally-reproducible gate (default)
scripts/preflight.sh --changed       # only components changed vs origin/main
scripts/preflight.sh --rn --e2e      # specific domains (repeatable)
scripts/preflight.sh --e2e-ci-sim    # E2E under simulated slow CI (see below)
scripts/preflight.sh --no-services   # don't manage Docker Postgres (already up)
scripts/preflight.sh --list          # show the gate catalog
```

Gates (each = the real CI command): **rust** (check/test/clippy `-D warnings`/
fmt/audit), **go** (mod tidy/build/vet/`test -race`/govulncheck/`-tags=integration`),
**migrations** (up + idempotency on Postgres), **rn** (`npm ci`/`npm audit
--omit=dev --audit-level=critical`/`tsc --noEmit`/eslint/jest service+components),
**e2e** (9 functional Playwright specs, chromium), **security** (gitleaks/semgrep/
gosec/`security-audit.sh --quick`/CRLF), **env** (`validate-env.sh`).

It manages its own throwaway Postgres (`postgres:16-alpine` on :55432, two DBs)
for the go-integration and migration gates, and starts/stops the Expo web server
for E2E.

## Installing the pre-push gate

```bash
make setup-hooks   # installs pre-commit (fmt/secrets) AND the pre-push hook
```

The pre-push hook runs `scripts/preflight.sh --changed`, so a push that would
break CI is refused locally first.

## E2E parity: simulate the slow CI runner

CI runners are ~6× slower than a dev machine. A fast machine hides timing
flakiness, which is exactly how a flaky E2E gate slipped to CI once. To catch it
locally, the E2E base test (`usbvault-app/e2e/test-base.ts`) throttles browser
CPU when `E2E_CPU_THROTTLE` is set:

```bash
cd usbvault-app
E2E_CPU_THROTTLE=8 npx playwright test --project=chromium --workers=1 e2e/*.spec.ts
```

`preflight.sh --e2e-ci-sim` does this for you. **Before making any E2E change a
blocking gate, run it ≥3× under throttle with 0 flakes.** Tests use web-first
waits (`expect(...).toBeVisible()`, `waitFor`), never fixed `waitForTimeout`
sleeps — that's what makes them machine-speed-independent.

**Port:** E2E defaults to `:8081` (CI's port). If `8081` is already taken on your
machine, `preflight.sh` detects it and runs Expo + Playwright on `:8090` instead
(via `E2E_PORT`, which `playwright.config.ts` reads); specs use relative URLs, so
behavior is identical. To run byte-identically to CI, free `8081` first.

## Local tooling gotchas (cost real time — encoded in `preflight.sh`)

- **semgrep**: install with `pip install --user --break-system-packages
  --only-binary=:all: semgrep` (→ `~/Library/Python/3.x/bin`). `pipx install
  semgrep` fails (it compiles the `cryptography` native wheel). The launcher
  `exec`s `pysemgrep` from its own bin dir, so that dir **must be on `PATH`** or
  it dies `execvp pysemgrep: No such file`. `preflight.sh` resolves it via
  `site.USER_BASE/bin` and prepends that dir to `PATH` automatically.
- **`tsc` does not type-check `e2e/`** — `tsconfig.json` `include` is `src` only,
  and there's no `e2e/tsconfig.json`. ESLint *does* lint `e2e/` (so type-ish
  errors via lint rules are caught), but a pure type error in an `e2e/*.ts` file
  would not fail CI's `tsc` step. If you add heavy typing to E2E, add an
  `e2e/tsconfig.json` and a `tsc -p e2e` gate.
- **`govulncheck`** is **advisory** in the harness (local Go 1.26 reports stdlib
  findings absent on CI's pinned Go 1.25, so a hard local gate would false-fail).
  On CI it is **blocking for third-party vulns**: the gate was fixed (2026-06)
  from a `jq` no-op to `jq -s` that slurps the stream and fails only on reachable
  *non-stdlib* findings; stdlib findings warn. The harness still surfaces all of
  them — triage any **third-party** advisories it prints with `go get`.

## Multi-agent QA/QC (for non-trivial changes)

Orchestrate these in parallel on **isolated** resources (a separate Postgres
port per DB agent; do not run two npm/Playwright agents on the same
`usbvault-app` tree at once), then require the adversary's sign-off:

| Agent | Runs |
|---|---|
| **rust-qa** | check/test/clippy/fmt/audit (+ KAT) |
| **go-qa** | build/vet/`test -race`/govulncheck/gosec + `-tags=integration` (own DB) |
| **migration-qa** | migrate up/idempotency/table-verify (own DB) |
| **rn-qa** | npm ci/audit/tsc/eslint/jest (service+components, coverage) |
| **e2e-qa** | Expo web + 9 specs under CI-sim throttle, ≥3 repeats; reports flakes |
| **security-qa** | gitleaks/semgrep/gosec/cargo-audit/`security-audit.sh`/env |
| **qc-adversary** | re-runs the **exact** CI commands fresh, confirms exit codes, hunts CI-vs-local divergence (cold cache, coverage thresholds, single-worker E2E, pinned tool versions) and flakiness via repetition. **Nothing is "done" until this passes.** |

## Gating policy (blocking vs advisory)

Mirrors CI. Keep the harness in sync when CI changes.

**Blocking** (must pass to merge): Rust check/test/clippy/fmt/cargo-audit · Go
build/`test -race`/vet/govulncheck (third-party)/`-tags=integration` · migrations
+ schema · RN `npm audit` critical/tsc/eslint-errors/jest · **E2E (9 functional
specs, chromium)** · env-template · gosec HIGH/CRITICAL · gitleaks · semgrep
errors · eslint-security errors · consolidated audit (critical) · FFI 10-platform.

**Advisory** (warn, don't block — "during development"): Go coverage <75% · TS
coverage <70% · golangci-lint · ci.yml gosec step · **govulncheck *stdlib*
findings** (go-toolchain-managed) · semgrep/eslint warnings · OWASP-ZAP
medium/low · Trivy · Snyk · pentest.

**E2E is blocking (re-promoted 2026-06).** It was briefly advisory after flaking
on CI, but the flakiness was a **real product bug**, now fixed. `register.tsx`'s
`handlePasswordBlur` did `const breached = await checkPasswordBreach(pw);
setBreachWarning(breached ? warn : '')` — but `checkPasswordBreach` returns an
**object** (`{ isBreached, source }`), always truthy, so the "password appeared in
a data breach" warning fired for *every* password the instant the async check
resolved, blocking registration with a valid password. It only "passed" when the
live HIBP call was slow enough to lose the race vs the Register click. Fixed:
check `result.isBreached`; plus a deterministic HIBP stub (`e2e/test-base.ts`) and
`workers: CI ? 1` (no CPU oversubscription on the 2-vCPU runner). Verified 51/51
on CI (3.5 min) and locally under 8× throttle.

**govulncheck gate (fixed 2026-06).** ci.yml's gate was a no-op — bare `jq` (no
`-s`) over a streamed object sequence always read 0, so it never fired. Now
`jq -s` slurps the stream and BLOCKS on reachable *third-party* vulns (actionable
via `go get`) while *stdlib* findings (go-toolchain-managed) only warn. The 3
reachable deps it would have caught — go-jose 4.1.3→4.1.4, x/net 0.51→0.53, otel
otlptracehttp 1.42→1.43 — are bumped (0 reachable third-party vulns remain).

Don't make a flaky thing blocking — a flaky blocking gate is worse than an honest
advisory one. E2E is the hard-won proof: advisory *while genuinely flaky*, blocking
once the root-cause bug was found, fixed, and verified.

## CI-only gates (cannot run locally; accept CI as final)

- **`ffi-build.yml`** — 10-platform cross-compile (iOS/Android/Windows/Linux);
  needs Xcode/NDK/cross toolchains. On macOS run `scripts/build-ffi.sh` for the
  native + iOS targets when you touch FFI; the rest are CI-final.
- **EAS preview** (Expo cloud), **DAST/OWASP-ZAP** (needs a deployed server),
  **Trivy/SBOM** — CI-only.

These don't run on the PR branch's `CI Pipeline`/`Security Scanning` gates today
(ffi-build is path-triggered and not part of the PR's required checks), so with
everything else verified locally they're the only place a surprise can appear —
and any surprise becomes a **new check added to `preflight.sh`** so it can't
recur.
