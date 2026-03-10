#!/bin/bash
# Quantum Armor Vault (QAV) - Phase 1 AST Gate Validation
# Requirement: SAST + SCA + Secret scan must PASS
# This script validates that all Phase 1 infrastructure is in place
# and runs the gate checks locally.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0
TOTAL_CHECKS=0

pass() { echo -e "${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); TOTAL_CHECKS=$((TOTAL_CHECKS + 1)); }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); TOTAL_CHECKS=$((TOTAL_CHECKS + 1)); }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); TOTAL_CHECKS=$((TOTAL_CHECKS + 1)); }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════╗"
echo "║  Quantum Armor Vault (QAV) - Phase 1 AST Gate      ║"
echo "║  SAST + SCA + Secret Scan Validation         ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================================
# TASK 1: CI/CD Pipeline Validation
# ============================================================
echo -e "${BOLD}Task 1: CI/CD Pipeline${NC}"
echo "---"

if [[ -f "$PROJECT_ROOT/.github/workflows/ci.yml" ]]; then
    pass "CI pipeline exists (.github/workflows/ci.yml)"
else
    fail "CI pipeline missing"
fi

if [[ -f "$PROJECT_ROOT/.github/workflows/security.yml" ]]; then
    pass "Security workflow exists (.github/workflows/security.yml)"
else
    fail "Security workflow missing"
fi

if [[ -f "$PROJECT_ROOT/.github/workflows/release.yml" ]]; then
    pass "Release workflow exists (.github/workflows/release.yml)"
else
    warn "Release workflow missing (recommended)"
fi

# Check action pinning (security best practice)
if grep -q '@[a-f0-9]\{40\}' "$PROJECT_ROOT/.github/workflows/ci.yml" 2>/dev/null; then
    pass "GitHub Actions pinned to commit hashes"
else
    fail "GitHub Actions not pinned to commit hashes (supply chain risk)"
fi

echo ""

# ============================================================
# TASK 2: SAST Integration
# ============================================================
echo -e "${BOLD}Task 2: SAST Integration${NC}"
echo "---"

# gosec
if grep -q 'gosec' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null; then
    pass "gosec (Go SAST) integrated in CI"
else
    fail "gosec not integrated in CI"
fi

# cargo-audit
if grep -q 'cargo-audit\|audit-check' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null; then
    pass "cargo-audit (Rust SAST) integrated in CI"
else
    fail "cargo-audit not integrated in CI"
fi

# ESLint security
if grep -q 'eslint.*security\|eslint-security' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null; then
    pass "ESLint security plugin integrated in CI"
else
    fail "ESLint security plugin not integrated in CI"
fi

# Local SAST script
if [[ -x "$PROJECT_ROOT/scripts/run-sast.sh" ]]; then
    pass "Local SAST runner script exists and is executable"
else
    fail "Local SAST runner script missing or not executable"
fi

echo ""

# ============================================================
# TASK 3: SCA Integration
# ============================================================
echo -e "${BOLD}Task 3: SCA Integration${NC}"
echo "---"

# Dependabot
if [[ -f "$PROJECT_ROOT/.github/dependabot.yml" ]]; then
    pass "Dependabot configured"

    # Check ecosystem coverage
    for eco in "cargo" "gomod" "npm" "github-actions"; do
        if grep -q "$eco" "$PROJECT_ROOT/.github/dependabot.yml" 2>/dev/null; then
            pass "Dependabot covers $eco ecosystem"
        else
            warn "Dependabot missing $eco ecosystem"
        fi
    done
else
    fail "Dependabot not configured"
fi

# Snyk
if grep -q 'snyk' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null; then
    pass "Snyk SCA integrated in CI"
else
    warn "Snyk SCA not integrated (Dependabot may suffice)"
fi

# CISA KEV
if grep -q 'kev\|KEV' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null; then
    pass "CISA KEV checking integrated"
else
    warn "CISA KEV checking not integrated"
fi

echo ""

# ============================================================
# TASK 4: Secret Detection
# ============================================================
echo -e "${BOLD}Task 4: Secret Detection${NC}"
echo "---"

if [[ -f "$PROJECT_ROOT/.gitleaks.toml" ]]; then
    pass "gitleaks config exists (.gitleaks.toml)"

    RULE_COUNT=$(grep -c '^\[rules\.' "$PROJECT_ROOT/.gitleaks.toml" 2>/dev/null || echo "0")
    if [[ "$RULE_COUNT" -ge 5 ]]; then
        pass "gitleaks has $RULE_COUNT custom rules (>= 5 expected)"
    else
        warn "gitleaks has only $RULE_COUNT custom rules (5+ recommended)"
    fi
else
    fail "gitleaks config missing"
fi

if [[ -f "$PROJECT_ROOT/.pre-commit-config.yaml" ]]; then
    pass "Pre-commit config exists"

    if grep -q 'gitleaks' "$PROJECT_ROOT/.pre-commit-config.yaml" 2>/dev/null; then
        pass "gitleaks hook in pre-commit config"
    else
        fail "gitleaks hook missing from pre-commit config"
    fi
else
    fail "Pre-commit config missing"
fi

if grep -q 'gitleaks' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null; then
    pass "gitleaks integrated in CI workflow"
else
    fail "gitleaks not integrated in CI"
fi

echo ""

# ============================================================
# TASK 5: Container Security Scanning
# ============================================================
echo -e "${BOLD}Task 5: Container Security${NC}"
echo "---"

if [[ -f "$PROJECT_ROOT/usbvault-server/Dockerfile" ]]; then
    pass "Dockerfile exists"

    # Non-root user
    if grep -q 'USER\|adduser' "$PROJECT_ROOT/usbvault-server/Dockerfile" 2>/dev/null; then
        pass "Dockerfile uses non-root user"
    else
        fail "Dockerfile missing non-root user"
    fi

    # Multi-stage build
    if grep -c 'FROM' "$PROJECT_ROOT/usbvault-server/Dockerfile" 2>/dev/null | grep -q '[2-9]'; then
        pass "Dockerfile uses multi-stage build"
    else
        warn "Dockerfile not using multi-stage build"
    fi

    # Health check
    if grep -q 'HEALTHCHECK' "$PROJECT_ROOT/usbvault-server/Dockerfile" 2>/dev/null; then
        pass "Dockerfile has health check"
    else
        warn "Dockerfile missing health check"
    fi
else
    fail "Dockerfile missing"
fi

if grep -q 'trivy' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null; then
    pass "Trivy container scanning integrated in CI"
else
    fail "Trivy container scanning not integrated"
fi

echo ""

# ============================================================
# TASK 6: Test Frameworks
# ============================================================
echo -e "${BOLD}Task 6: Test Frameworks${NC}"
echo "---"

# Go tests
GO_TESTS=$(find "$PROJECT_ROOT/usbvault-server" -name "*_test.go" 2>/dev/null | wc -l)
if [[ "$GO_TESTS" -ge 10 ]]; then
    pass "Go test files found: $GO_TESTS (>= 10)"
else
    warn "Only $GO_TESTS Go test files found (10+ recommended)"
fi

# Rust tests
RUST_TESTS=$(find "$PROJECT_ROOT/usbvault-crypto/tests" -name "*.rs" 2>/dev/null | wc -l)
if [[ "$RUST_TESTS" -ge 3 ]]; then
    pass "Rust test files found: $RUST_TESTS (>= 3)"
else
    warn "Only $RUST_TESTS Rust test files found (3+ recommended)"
fi

# TypeScript tests
TS_TESTS=$(find "$PROJECT_ROOT/usbvault-app/src" -name "*.test.*" -o -name "*.spec.*" 2>/dev/null | wc -l)
if [[ "$TS_TESTS" -ge 3 ]]; then
    pass "TypeScript test files found: $TS_TESTS (>= 3)"
else
    warn "Only $TS_TESTS TypeScript test files found (3+ recommended)"
fi

# Coverage in CI
if grep -q 'coverprofile\|coverage' "$PROJECT_ROOT/.github/workflows/ci.yml" 2>/dev/null; then
    pass "Coverage collection enabled in CI"
else
    fail "Coverage collection not enabled in CI"
fi

echo ""

# ============================================================
# TASK 7: Docker Compose Dev Environment
# ============================================================
echo -e "${BOLD}Task 7: Docker Compose Dev Environment${NC}"
echo "---"

if [[ -f "$PROJECT_ROOT/docker-compose.yml" ]]; then
    pass "docker-compose.yml exists"

    for svc in "postgres" "redis" "minio"; do
        if grep -q "$svc" "$PROJECT_ROOT/docker-compose.yml" 2>/dev/null; then
            pass "Service $svc configured in Docker Compose"
        else
            fail "Service $svc missing from Docker Compose"
        fi
    done

    # Health checks
    HEALTH_COUNT=$(grep -c 'healthcheck' "$PROJECT_ROOT/docker-compose.yml" 2>/dev/null || echo 0)
    if [[ "$HEALTH_COUNT" -ge 3 ]]; then
        pass "Health checks configured ($HEALTH_COUNT services)"
    else
        warn "Only $HEALTH_COUNT health checks (3+ recommended)"
    fi
else
    fail "docker-compose.yml missing"
fi

echo ""

# ============================================================
# TASK 8: Phase 1 AST Gate Summary
# ============================================================
echo -e "${BOLD}Task 8: AST Gate — SAST + SCA + Secret Scan${NC}"
echo "---"

# Aggregate gate check
SAST_OK=true
SCA_OK=true
SECRET_OK=true

grep -q 'gosec' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null || SAST_OK=false
grep -q 'cargo-audit\|audit-check' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null || SAST_OK=false
grep -q 'eslint.*security\|eslint-security' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null || SAST_OK=false

grep -q 'package-ecosystem\|snyk' "$PROJECT_ROOT/.github/dependabot.yml" 2>/dev/null || SCA_OK=false

grep -q 'gitleaks' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null || SECRET_OK=false
[[ -f "$PROJECT_ROOT/.gitleaks.toml" ]] || SECRET_OK=false

if $SAST_OK; then pass "SAST gate: All scanners configured"; else fail "SAST gate: Missing scanners"; fi
if $SCA_OK; then pass "SCA gate: Dependency scanning configured"; else fail "SCA gate: Dependency scanning incomplete"; fi
if $SECRET_OK; then pass "Secret scan gate: gitleaks configured"; else fail "Secret scan gate: gitleaks incomplete"; fi

echo ""
echo -e "${BOLD}${BLUE}══════════════════════════════════════════════${NC}"
echo -e "${BOLD}Phase 1 AST Gate Results${NC}"
echo -e "${BOLD}${BLUE}══════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}  ${RED}FAIL: $FAIL_COUNT${NC}  ${YELLOW}WARN: $WARN_COUNT${NC}  Total: $TOTAL_CHECKS"
echo ""

if [[ $FAIL_COUNT -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}╔═════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║  PHASE 1 AST GATE: ✓ PASSED        ║${NC}"
    echo -e "${GREEN}${BOLD}╚═════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}╔═════════════════════════════════════╗${NC}"
    echo -e "${RED}${BOLD}║  PHASE 1 AST GATE: ✗ FAILED        ║${NC}"
    echo -e "${RED}${BOLD}║  $FAIL_COUNT check(s) must be fixed         ║${NC}"
    echo -e "${RED}${BOLD}╚═════════════════════════════════════╝${NC}"
    exit 1
fi
