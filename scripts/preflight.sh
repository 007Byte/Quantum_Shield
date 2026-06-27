#!/usr/bin/env bash
#
# preflight.sh — local pre-push QA/QC harness.
#
# Runs the SAME gates GitHub CI runs, with the SAME commands, BEFORE you push,
# so problems are caught locally instead of slipping to CI. This is the tool that
# breaks the push→CI-finds-error→fix loop: never push without `preflight.sh`
# green (and the multi-agent QC sign-off documented in docs/QA_QC.md).
#
# Usage:
#   scripts/preflight.sh [--full] [--changed] [--e2e-ci-sim]
#                        [--rust] [--go] [--migrations] [--rn] [--e2e]
#                        [--security] [--env] [--no-services] [--list]
#
#   --full         Run every locally-reproducible gate (default).
#   --changed      Only the components changed vs origin/main (fast iteration).
#   --e2e-ci-sim   Run E2E under simulated slow-CI conditions
#                  (E2E_CPU_THROTTLE=8, single worker). Slower but catches the
#                  timing flakiness a fast dev machine hides.
#   --<domain>     Run only that domain (repeatable).
#   --no-services  Don't start/stop Docker Postgres (assume it's already up).
#   --list         Print the gate catalog and exit.
#
# Gates that CANNOT run locally and are CI-only (documented in docs/QA_QC.md):
#   ffi-build.yml (10-platform cross-compile), EAS cloud build, DAST/OWASP-ZAP
#   (needs a deployed server), Trivy/SBOM. Run `scripts/build-ffi.sh` for the
#   native/iOS FFI targets if you touched FFI.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRYPTO="$ROOT/usbvault-crypto"
SERVER="$ROOT/usbvault-server"
APP="$ROOT/usbvault-app"
COMPANION="$ROOT/usb-companion"
ELECTRON="$ROOT/electron-shell"

# Tool/version pins matching CI.
GOSEC_VERSION="v2.27.1"
GITLEAKS_VERSION="8.21.2"
GOLANGCI_VERSION="v2.12.2"
# Pin the Go toolchain to CI's version (ci.yml go-version '1.25', go.mod go 1.25.0)
# so build/vet/race/govulncheck match CI instead of the local go1.26 line — which
# otherwise reports stdlib govulncheck findings CI never sees. Override by exporting
# GOTOOLCHAIN before running.
export GOTOOLCHAIN="${GOTOOLCHAIN:-go1.25.0}"

# Postgres for migrations + Go integration tests (one container, two DBs).
PG_CONTAINER="usbvault-preflight-pg"
PG_PORT="55432"
PG_IMAGE="postgres:16-alpine"
export TEST_DATABASE_URL="postgres://postgres:postgres@localhost:${PG_PORT}/usbvault_test"
MIGRATE_DSN="postgres://postgres:postgres@localhost:${PG_PORT}/usbvault_migrate?sslmode=disable"
# Redis for Go integration + auth token/jwt tests (mirrors CI's redis service on
# :6379). Without it, token_leakage_test.go / jwt_test.go t.Skip() locally yet RUN
# in CI — a silent parity hole that previously let an integration failure reach CI.
REDIS_CONTAINER="usbvault-preflight-redis"
REDIS_PORT="6379"
export REDIS_URL="redis://localhost:${REDIS_PORT}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
declare -a RESULTS=()
FAILED=0

section() { echo -e "\n${BLUE}${BOLD}━━━ $* ━━━${NC}"; }
record()  { # record <name> <exit-code>
  if [ "$2" -eq 0 ]; then RESULTS+=("PASS  $1"); echo -e "${GREEN}[✓] $1${NC}";
  else RESULTS+=("FAIL  $1"); FAILED=$((FAILED+1)); echo -e "${RED}[✗] $1 (exit $2)${NC}"; fi
}
run() { # run <name> <dir> <command...>  — command runs in a subshell (cd isolation)
  local name="$1" dir="$2"; shift 2          # but record() runs in THIS shell so
  echo -e "${YELLOW}\$ [${dir#"$ROOT"/}] $*${NC}"  # RESULTS/FAILED actually accumulate.
  if ( cd "$dir" && "$@" ); then record "$name" 0; else record "$name" $?; fi
}
advise() { RESULTS+=("WARN  $1"); echo -e "${YELLOW}[!] $1${NC}"; }   # advisory: surfaced, NOT gating
run_advisory() { # like run() but a non-zero exit WARNs instead of failing the suite
  local name="$1" dir="$2"; shift 2
  echo -e "${YELLOW}\$ [${dir#"$ROOT"/}] $* (advisory)${NC}"
  if ( cd "$dir" && "$@" ); then record "$name" 0; else advise "$name — findings (advisory, non-blocking)"; fi
}

# ── Service management ───────────────────────────────────────────────────────
# Fail-fast when Docker is required but unavailable, so a dead daemon is NEVER
# mistaken for a code failure (the exact confusion that derailed a push before).
require_docker() {
  [ "$NO_SERVICES" = "1" ] && return 0
  command -v docker >/dev/null 2>&1 || {
    echo -e "${RED}${BOLD}Docker CLI not found${NC} — the Go integration, migrations and Redis gates need it."
    echo -e "${YELLOW}Install Docker, or pass --no-services if Postgres+Redis are already running.${NC}"; exit 3; }
  docker info >/dev/null 2>&1 || {
    echo -e "${RED}${BOLD}Docker daemon is NOT running.${NC}"
    echo -e "${RED}DB / Redis / integration gates would fail for an INFRASTRUCTURE reason — not a code problem.${NC}"
    echo -e "${YELLOW}Start Docker Desktop and re-run, or pass --no-services if PG(:$PG_PORT)+Redis(:$REDIS_PORT) are already up.${NC}"; exit 3; }
}
start_pg() {
  [ "$NO_SERVICES" = "1" ] && return 0
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$PG_CONTAINER" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=usbvault_test -p "${PG_PORT}:5432" "$PG_IMAGE" >/dev/null \
    || { echo -e "${RED}${BOLD}failed to start Postgres container${NC}"; exit 3; }
  for _ in $(seq 1 30); do docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
  docker exec "$PG_CONTAINER" psql -U postgres -tAc \
    "CREATE DATABASE usbvault_migrate;" >/dev/null 2>&1 || true
  docker exec "$PG_CONTAINER" psql -U postgres -d usbvault_migrate -c \
    "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS pgcrypto;" >/dev/null 2>&1 || true
}
stop_pg() { [ "$NO_SERVICES" = "1" ] && return 0; docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true; }
# Redis mirrors CI's `redis:7-alpine` service so integration/auth tests RUN locally
# instead of t.Skip()-ping past — closing the parity hole that hid token_leakage.
start_redis() {
  [ "$NO_SERVICES" = "1" ] && return 0
  docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$REDIS_CONTAINER" -p "${REDIS_PORT}:6379" redis:7-alpine >/dev/null \
    || { echo -e "${RED}${BOLD}failed to start Redis container${NC}"; exit 3; }
  for _ in $(seq 1 30); do docker exec "$REDIS_CONTAINER" redis-cli ping >/dev/null 2>&1 && break; sleep 1; done
}
stop_redis() { [ "$NO_SERVICES" = "1" ] && return 0; docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true; }

# ── Domain gates (EXACT CI commands) ─────────────────────────────────────────
gate_rust() {
  section "Rust (usbvault-crypto)"
  run "rust: cargo check"  "$CRYPTO" cargo check --all-targets --all-features
  run "rust: cargo test"   "$CRYPTO" cargo test --all-features
  run "rust: clippy -D"    "$CRYPTO" cargo clippy --all-targets --all-features -- -D warnings
  run "rust: fmt --check"  "$CRYPTO" cargo fmt --all -- --check
  command -v cargo-audit >/dev/null || cargo install cargo-audit >/dev/null 2>&1 || true
  run "rust: cargo audit"  "$CRYPTO" bash -c 'cargo audit 2>&1 | tail -3; [ "${PIPESTATUS[0]}" -eq 0 ]'
}
gate_go() {
  section "Go (usbvault-server) — unit + race + vet + govulncheck + integration"
  # Non-destructive: verify `go mod tidy` runs clean WITHOUT persisting drift
  # (CI runs tidy in place on a throwaway runner and does NOT gate on staleness,
  # so we must neither dirty the local tree nor be stricter than CI).
  run "go: mod tidy (non-destructive)" "$SERVER" bash -c \
    'cp go.mod /tmp/pf-go.mod && cp go.sum /tmp/pf-go.sum; go mod tidy; rc=$?; mv /tmp/pf-go.mod go.mod && mv /tmp/pf-go.sum go.sum; exit $rc'
  run "go: build"      "$SERVER" go build ./...
  run "go: vet"        "$SERVER" go vet ./...
  run "go: test -race" "$SERVER" go test -race ./...
  command -v govulncheck >/dev/null || go install golang.org/x/vuln/cmd/govulncheck@latest >/dev/null 2>&1 || true
  # BLOCKING on THIRD-PARTY reachable vulns — mirrors ci.yml's gate EXACTLY (same
  # `jq -rs` slurp counting non-stdlib reachable OSVs, exit 1 when >0). That gate
  # DOES fire (it caught pgx GO-2026-5004); the prior "advisory, CI is a no-op"
  # assumption here is precisely what let govulncheck blindside us. Stdlib findings
  # stay advisory (cleared by the GOTOOLCHAIN pin above), matching CI's stdlib warning.
  run "go: govulncheck (third-party blocks, mirrors CI)" "$SERVER" bash -c '
    govulncheck -json ./... > /tmp/pf-govuln.json 2>/dev/null || true
    tp=$(jq -rs "[.[] | select(.finding.trace[0].function != null) | select(.finding.trace[0].module != \"stdlib\") | .finding.osv] | unique | length" /tmp/pf-govuln.json 2>/dev/null || echo 0)
    sl=$(jq -rs "[.[] | select(.finding.trace[0].function != null) | select(.finding.trace[0].module == \"stdlib\") | .finding.osv] | unique | length" /tmp/pf-govuln.json 2>/dev/null || echo 0)
    echo "govulncheck: $tp third-party reachable, $sl stdlib reachable (stdlib advisory)"
    [ "$tp" -eq 0 ]'
  run "go: integration (-tags=integration)" "$SERVER" go test -tags=integration ./...
}
gate_migrations() {
  section "Database migrations"
  ( cd "$SERVER" && go build -o /tmp/preflight-migrate ./cmd/migrate ) || { record "migrations: build" 1; return; }
  # Run from usbvault-server (CI's working-directory) AND pin MIGRATIONS_DIR to an
  # absolute path — cmd/migrate resolves `migrations/` relative to cwd, so running
  # from repo root can't find it. MIGRATIONS_DIR is honored first, cwd-independent.
  run "migrations: up"         "$SERVER" env DATABASE_URL="$MIGRATE_DSN" MIGRATIONS_DIR="$SERVER/migrations" /tmp/preflight-migrate up
  run "migrations: idempotent" "$SERVER" env DATABASE_URL="$MIGRATE_DSN" MIGRATIONS_DIR="$SERVER/migrations" /tmp/preflight-migrate up
}
gate_rn() {
  section "React Native (usbvault-app) — npm ci/audit/tsc/eslint/jest"
  run "rn: npm ci" "$APP" npm ci
  run "rn: npm audit (prod, critical)" "$APP" \
      bash -c 'c=$(npm audit --omit=dev --json 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin)[\"metadata\"][\"vulnerabilities\"][\"critical\"])"); echo "critical=$c"; [ "$c" = "0" ]'
  run "rn: tsc --noEmit" "$APP" npx tsc --noEmit
  run "rn: eslint (errors block)" "$APP" npx eslint . --ext .ts,.tsx,.js,.jsx
  run "rn: jest service (coverage)" "$APP" npx jest --config jest.config.js --coverage --passWithNoTests --cacheDirectory=.jest-cache
  run "rn: jest components" "$APP" npx jest --config jest.config.components.js --passWithNoTests --cacheDirectory=.jest-cache
}
gate_e2e() {
  section "E2E (Playwright, 9 functional specs, chromium)"
  pkill -f "expo start" >/dev/null 2>&1 || true; sleep 1
  # Prefer 8081 (CI's port). If something else is already listening there (e.g. a
  # local service), fall back to 8090 — specs navigate with relative URLs and the
  # config reads E2E_PORT, so only the port number changes. Keeps --full runnable
  # on a dev box without disturbing whatever owns 8081.
  local port=8081
  if lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
    port=8090
    echo -e "${YELLOW}port 8081 is in use — running Expo/Playwright on $port (E2E_PORT=$port)${NC}"
  fi
  export E2E_PORT="$port"
  ( cd "$APP" && CI=1 EXPO_NO_TELEMETRY=1 E2E_PORT="$port" npx expo start --web --port "$port" >/tmp/preflight-expo.log 2>&1 & )
  local up=0; for _ in $(seq 1 60); do curl -sf -o /dev/null "http://localhost:$port" 2>/dev/null && { up=1; break; }; sleep 3; done
  [ "$up" = "1" ] || { record "e2e: expo web server (:$port)" 1; return; }
  local specs="e2e/auth.spec.ts e2e/vault-creation.spec.ts e2e/encrypt.spec.ts e2e/decrypt.spec.ts e2e/share.spec.ts e2e/session.spec.ts e2e/i18n.spec.ts e2e/error-scenarios.spec.ts e2e/full-crypto-cycle.spec.ts"
  if [ "$E2E_CI_SIM" = "1" ]; then
    run "e2e: 9 specs (CI-sim throttle 8x, workers=1)" "$APP" \
        env E2E_PORT="$port" E2E_CPU_THROTTLE=8 npx playwright test --project=chromium --workers=1 $specs
  else
    run "e2e: 9 specs (chromium)" "$APP" env E2E_PORT="$port" npx playwright test --project=chromium $specs
  fi
  pkill -f "expo start" >/dev/null 2>&1 || true
}
gate_security() {
  section "Security — gitleaks / semgrep / gosec / consolidated audit / env"
  local GL; GL="$(command -v gitleaks || echo "$(go env GOPATH)/bin/gitleaks")"
  if [ -x "$GL" ] || command -v gitleaks >/dev/null; then
    run "sec: gitleaks" "$ROOT" "$GL" detect --config .gitleaks.toml --no-banner --redact
  else record "sec: gitleaks (install gitleaks $GITLEAKS_VERSION)" 1; fi
  local SEMGREP; SEMGREP="$(command -v semgrep || true)"
  [ -n "$SEMGREP" ] || SEMGREP="$(python3 -c 'import site;print(site.USER_BASE)' 2>/dev/null)/bin/semgrep"
  if [ -x "$SEMGREP" ]; then
    # The semgrep launcher execs `pysemgrep` from its OWN bin dir, so that dir
    # MUST be on PATH or it dies with "execvp pysemgrep: No such file". Prepend it.
    local SDIR; SDIR="$(dirname "$SEMGREP")"
    # Mirror security.yml EXACTLY: two scans — Go rules on the server, TS rules on
    # the app src — gating on ERROR severity only (WARNINGs are advisory on CI).
    run "sec: semgrep go (ERROR blocks)" "$ROOT" \
      env PATH="$SDIR:$PATH" "$SEMGREP" scan --config "p/owasp-top-ten" --config "p/golang" --config ".semgrep/usbvault-rules.yaml" --severity ERROR --error --quiet usbvault-server/
    run "sec: semgrep ts (ERROR blocks)" "$ROOT" \
      env PATH="$SDIR:$PATH" "$SEMGREP" scan --config "p/owasp-top-ten" --config "p/typescript" --config ".semgrep/usbvault-rules.yaml" --severity ERROR --error --quiet usbvault-app/src/
  else record "sec: semgrep (pip install --user --break-system-packages --only-binary=:all: semgrep)" 1; fi
  local GS; GS="$(go env GOPATH)/bin/gosec"
  [ -x "$GS" ] || go install "github.com/securego/gosec/v2/cmd/gosec@${GOSEC_VERSION}" >/dev/null 2>&1 || true
  run "sec: gosec (0 HIGH/CRITICAL)" "$SERVER" bash -c "\"$GS\" -no-fail -fmt json -out /tmp/preflight-gosec.json ./... >/dev/null 2>&1; python3 -c \"import json;d=json.load(open('/tmp/preflight-gosec.json'));h=[i for i in d['Issues'] if i['severity'] in ('HIGH','CRITICAL')];print('HIGH/CRIT:',len(h));exit(1 if h else 0)\""
  run "sec: consolidated audit (--quick)" "$ROOT" bash scripts/security-audit.sh --quick
  run "sec: CRLF check" "$ROOT" bash -c 'f=$(grep -rIl $"\r" --include="*.sh" . 2>/dev/null | grep -vE "node_modules|/target/|\.git/"); [ -z "$f" ] || { echo "CRLF in: $f"; false; }'
}
gate_env() {
  section "Env template validation"
  chmod +x "$ROOT/scripts/validate-env.sh"
  run "env: validate .env.example" "$ROOT" ./scripts/validate-env.sh --dry-run .env.example
}
gate_companion() {
  # CI ci.yml usb-companion job (BLOCKING): npm ci + npm test (node --test) — the
  # 62 path-traversal / file-type input-validation cases. Had NO preflight gate.
  section "USB Companion (usb-companion) — npm ci + input-validation tests"
  run "companion: npm ci"   "$COMPANION" npm ci
  run "companion: npm test" "$COMPANION" npm test
}
gate_electron() {
  # CI ci.yml electron-shell job (BLOCKING): npm ci + npm test (jest) — 39 smoke
  # cases. Had NO preflight gate.
  section "Electron Shell (electron-shell) — npm ci + smoke tests"
  run "electron: npm ci"   "$ELECTRON" npm ci
  run "electron: npm test" "$ELECTRON" npm test
}

# ── CLI ──────────────────────────────────────────────────────────────────────
MODE="full"; NO_SERVICES="0"; E2E_CI_SIM="0"; declare -a ONLY=()
for arg in "$@"; do case "$arg" in
  --full) MODE="full";; --changed) MODE="changed";; --no-services) NO_SERVICES="1";;
  --e2e-ci-sim) E2E_CI_SIM="1";;
  --rust|--go|--migrations|--rn|--companion|--electron|--e2e|--security|--env) ONLY+=("${arg#--}"); MODE="only";;
  --list) echo "Gates: rust go migrations rn companion electron e2e security env  | CI-only: ffi-build EAS DAST Trivy SBOM"; exit 0;;
  *) echo "Unknown arg: $arg"; exit 2;;
esac; done

want() { # want <domain>
  [ "$MODE" = "full" ] && return 0
  if [ "$MODE" = "only" ]; then printf '%s\n' "${ONLY[@]}" | grep -qx "$1"; return; fi
  # --changed: component touched vs origin/main
  local base; base="$(git -C "$ROOT" merge-base origin/main HEAD 2>/dev/null || echo HEAD~1)"
  local diff; diff="$(git -C "$ROOT" diff --name-only "$base" 2>/dev/null)"
  case "$1" in
    rust)        echo "$diff" | grep -q "^usbvault-crypto/";;
    go|migrations) echo "$diff" | grep -q "^usbvault-server/";;
    rn|e2e)      echo "$diff" | grep -q "^usbvault-app/";;
    companion)   echo "$diff" | grep -q "^usb-companion/";;
    electron)    echo "$diff" | grep -q "^electron-shell/";;
    security|env) return 0;; # always
  esac
}

echo -e "${BOLD}preflight.sh — mode=$MODE  e2e-ci-sim=$E2E_CI_SIM${NC}"
NEED_DB=0
if want go || want migrations; then NEED_DB=1; fi
if [ "$NEED_DB" = "1" ]; then
  require_docker   # fail-fast & loud if the daemon is down — never mistaken for code
  section "Starting Postgres ($PG_IMAGE on :$PG_PORT) + Redis (redis:7-alpine on :$REDIS_PORT)"
  start_pg
  start_redis
fi
trap 'stop_pg; stop_redis' EXIT

want rust       && gate_rust
want go         && gate_go
want migrations && gate_migrations
want rn         && gate_rn
want companion  && gate_companion
want electron   && gate_electron
want e2e        && gate_e2e
want security   && gate_security
want env        && gate_env

# ── Summary ──────────────────────────────────────────────────────────────────
section "PREFLIGHT SUMMARY"
if [ "${#RESULTS[@]}" -gt 0 ]; then
  printf '%s\n' "${RESULTS[@]}"
  ADV=$(printf '%s\n' "${RESULTS[@]}" | grep -c '^WARN' || true)   # grep -c prints 0 + exits 1 on no match; keep just the count
  [ "${ADV:-0}" -gt 0 ] && echo -e "\n${YELLOW}$ADV advisory warning(s) above — surfaced, non-blocking (see docs/QA_QC.md gating policy).${NC}"
fi
echo
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}${BOLD}PREFLIGHT PASSED — safe to push.${NC}"; exit 0
else
  echo -e "${RED}${BOLD}PREFLIGHT FAILED: $FAILED gate(s). Fix locally before pushing.${NC}"; exit 1
fi
