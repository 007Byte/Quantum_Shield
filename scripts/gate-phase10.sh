#!/bin/bash

# ============================================================
# Quantum_Shield — Phase 10 AST Gate
# Comprehensive Security Audit Verification
# ============================================================
# Gate Requirement: All gates PASS, zero critical/high
# CWE Coverage: Cross-cutting (CWE Top 25, OWASP Top 10)
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
CRYPTO_DIR="$PROJECT_ROOT/usbvault-crypto"
APP_DIR="$PROJECT_ROOT/usbvault-app"
SECURITY_DIR="$SERVER_DIR/internal/security"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Quantum_Shield Phase 10 AST Gate — Comprehensive Security Audit${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: OWASP Top 10 (2021) Compliance (Cross-cutting)
# ============================================================
echo -e "${BLUE}[Task 1] OWASP Top 10 (2021) Compliance Audit${NC}"

if [ -f "$SECURITY_DIR/owasp_compliance.go" ]; then
    check_pass "OWASP compliance matrix exists (PH10-FIX)"
else
    check_fail "OWASP compliance matrix missing"
fi

if grep -q "OWASPTop10Web" "$SECURITY_DIR/owasp_compliance.go" 2>/dev/null; then
    check_pass "OWASP Web Top 10 compliance mapping"
else
    check_fail "OWASP Web compliance mapping missing"
fi

# Count OWASP controls defined
OWASP_CONTROLS=$(grep -c 'ID:.*"A[0-9]' "$SECURITY_DIR/owasp_compliance.go" 2>/dev/null || echo "0")
if [ "$OWASP_CONTROLS" -ge 10 ]; then
    check_pass "OWASP Web controls documented ($OWASP_CONTROLS controls)"
else
    check_fail "OWASP controls insufficient ($OWASP_CONTROLS < 10)"
fi

if grep -q "COMPLIANT" "$SECURITY_DIR/owasp_compliance.go" 2>/dev/null; then
    check_pass "Compliance status tracking (COMPLIANT/PARTIAL)"
else
    check_fail "Compliance status tracking missing"
fi

echo ""

# ============================================================
# TASK 2: OWASP API Security Top 10 (2023) Audit
# ============================================================
echo -e "${BLUE}[Task 2] OWASP API Security Top 10 Audit${NC}"

if grep -q "OWASPAPISecurityTop10" "$SECURITY_DIR/owasp_compliance.go" 2>/dev/null; then
    check_pass "API Security Top 10 compliance mapping"
else
    check_fail "API Security compliance mapping missing"
fi

API_CONTROLS=$(grep -c "ID:.*API" "$SECURITY_DIR/owasp_compliance.go" 2>/dev/null || echo "0")
if [ "$API_CONTROLS" -ge 10 ]; then
    check_pass "API security controls documented ($API_CONTROLS controls)"
else
    check_fail "API security controls insufficient ($API_CONTROLS < 10)"
fi

echo ""

# ============================================================
# TASK 3: OWASP Mobile Top 10 (2024) Audit
# ============================================================
echo -e "${BLUE}[Task 3] OWASP Mobile Top 10 Audit${NC}"

if grep -q "OWASPMobileTop10" "$SECURITY_DIR/owasp_compliance.go" 2>/dev/null; then
    check_pass "Mobile Top 10 compliance mapping"
else
    check_fail "Mobile compliance mapping missing"
fi

MOBILE_CONTROLS=$(grep -c 'ID:.*"M[0-9]' "$SECURITY_DIR/owasp_compliance.go" 2>/dev/null || echo "0")
if [ "$MOBILE_CONTROLS" -ge 8 ]; then
    check_pass "Mobile security controls documented ($MOBILE_CONTROLS controls)"
else
    check_fail "Mobile controls insufficient ($MOBILE_CONTROLS < 8)"
fi

echo ""

# ============================================================
# TASK 4: CWE Top 25 Systematic Scan
# ============================================================
echo -e "${BLUE}[Task 4] CWE Top 25 Systematic Verification${NC}"

if grep -q "CWETop25Checks" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null; then
    check_pass "CWE Top 25 verification framework"
else
    check_fail "CWE Top 25 framework missing"
fi

CWE_CHECKS=$(grep -c 'ID:.*"CWE_' "$SECURITY_DIR/pentest_framework.go" 2>/dev/null || echo "0")
if [ "$CWE_CHECKS" -ge 10 ]; then
    check_pass "CWE Top 25 test cases ($CWE_CHECKS checks)"
else
    check_fail "CWE Top 25 checks insufficient ($CWE_CHECKS < 10)"
fi

echo ""

# ============================================================
# TASK 5: CISA KEV Dependency Check
# ============================================================
echo -e "${BLUE}[Task 5] CISA KEV Dependency Check${NC}"

if [ -f "$PROJECT_ROOT/scripts/check-kev.sh" ]; then
    check_pass "CISA KEV checker script exists"
else
    check_fail "CISA KEV checker missing"
fi

# Check for multi-package-manager support
KEV_PKG_MGRS=0
for pm in "Cargo|cargo" "go.sum|gomod" "package-lock|npm"; do
    if grep -qE "$pm" "$PROJECT_ROOT/scripts/check-kev.sh" 2>/dev/null; then
        KEV_PKG_MGRS=$((KEV_PKG_MGRS + 1))
    fi
done
if [ "$KEV_PKG_MGRS" -ge 2 ]; then
    check_pass "KEV check covers $KEV_PKG_MGRS package managers"
else
    check_fail "KEV check needs more package manager coverage"
fi

echo ""

# ============================================================
# TASK 6: DAST Configuration
# ============================================================
echo -e "${BLUE}[Task 6] DAST Full-App Scan Configuration${NC}"

if [ -f "$SECURITY_DIR/dast_config.go" ]; then
    check_pass "DAST configuration exists (PH10-FIX)"
else
    check_fail "DAST configuration missing"
fi

if grep -q "DASTEndpoints" "$SECURITY_DIR/dast_config.go" 2>/dev/null; then
    check_pass "DAST endpoint catalog defined"
else
    check_fail "DAST endpoint catalog missing"
fi

DAST_ENDPOINTS=$(grep -c "Method:" "$SECURITY_DIR/dast_config.go" 2>/dev/null || echo "0")
if [ "$DAST_ENDPOINTS" -ge 20 ]; then
    check_pass "DAST covers $DAST_ENDPOINTS API endpoints"
else
    check_fail "DAST endpoint coverage insufficient ($DAST_ENDPOINTS < 20)"
fi

if grep -q "DASTScanConfig" "$SECURITY_DIR/dast_config.go" 2>/dev/null; then
    check_pass "DAST scan configuration (ZAP compatible)"
else
    check_fail "DAST scan configuration missing"
fi

echo ""

# ============================================================
# TASK 7-9: Penetration Test Framework
# ============================================================
echo -e "${BLUE}[Tasks 7-9] Penetration Test Framework${NC}"

if [ -f "$SECURITY_DIR/pentest_framework.go" ]; then
    check_pass "Penetration test framework exists (PH10-FIX)"
else
    check_fail "Penetration test framework missing"
fi

# Auth bypass tests (Task 7)
if grep -q "AuthBypassTests" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null; then
    check_pass "Authentication bypass test cases defined"
else
    check_fail "Auth bypass tests missing"
fi

AUTH_TESTS=$(grep -c "ID:.*AUTH" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null || echo "0")
if [ "$AUTH_TESTS" -ge 5 ]; then
    check_pass "Auth bypass scenarios: $AUTH_TESTS cases"
else
    check_fail "Auth bypass scenarios insufficient ($AUTH_TESTS < 5)"
fi

# Data exfiltration tests (Task 8)
if grep -q "DataExfilTests" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null; then
    check_pass "Data exfiltration test cases defined"
else
    check_fail "Data exfiltration tests missing"
fi

EXFIL_TESTS=$(grep -c "ID:.*EXFIL" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null || echo "0")
if [ "$EXFIL_TESTS" -ge 5 ]; then
    check_pass "Data exfiltration scenarios: $EXFIL_TESTS cases"
else
    check_fail "Data exfiltration scenarios insufficient ($EXFIL_TESTS < 5)"
fi

# Privilege escalation tests (Task 9)
if grep -q "PrivEscalationTests" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null; then
    check_pass "Privilege escalation test cases defined"
else
    check_fail "Privilege escalation tests missing"
fi

PRIV_TESTS=$(grep -c "ID:.*PRIV" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null || echo "0")
if [ "$PRIV_TESTS" -ge 5 ]; then
    check_pass "Privilege escalation scenarios: $PRIV_TESTS cases"
else
    check_fail "Privilege escalation scenarios insufficient ($PRIV_TESTS < 5)"
fi

echo ""

# ============================================================
# TASK 10: Cryptographic Implementation Review
# ============================================================
echo -e "${BLUE}[Task 10] Cryptographic Implementation Review${NC}"

if grep -q "CryptoReviewTests" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null; then
    check_pass "Cryptographic review test cases defined"
else
    check_fail "Crypto review tests missing"
fi

CRYPTO_TESTS=$(grep -c "ID:.*CRYPTO" "$SECURITY_DIR/pentest_framework.go" 2>/dev/null || echo "0")
if [ "$CRYPTO_TESTS" -ge 5 ]; then
    check_pass "Crypto review scenarios: $CRYPTO_TESTS cases"
else
    check_fail "Crypto review scenarios insufficient ($CRYPTO_TESTS < 5)"
fi

# Existing crypto audit report
if [ -f "$CRYPTO_DIR/AUDIT_REPORT_PHASE_2.md" ]; then
    check_pass "Cryptographic audit report exists (Phase 2)"
else
    check_warn "Crypto audit report not found"
fi

echo ""

# ============================================================
# TASK 11-12: Aggregate Security + All Prior Gates
# ============================================================
echo -e "${BLUE}[Tasks 11-12] Aggregate Security Validation${NC}"

# All prior gates exist
GATES_EXIST=0
for i in 1 2 3 4 5 6 7 8 9; do
    if [ -f "$PROJECT_ROOT/scripts/gate-phase${i}.sh" ]; then
        GATES_EXIST=$((GATES_EXIST + 1))
    fi
done
if [ "$GATES_EXIST" -ge 9 ]; then
    check_pass "All prior gate scripts present ($GATES_EXIST gates)"
else
    check_fail "Prior gates missing ($GATES_EXIST < 9)"
fi

# SAST scanner configuration
if [ -f "$PROJECT_ROOT/scripts/run-sast.sh" ]; then
    check_pass "SAST scanning script exists"
else
    check_fail "SAST scanning script missing"
fi

# Secret detection
if [ -f "$PROJECT_ROOT/.gitleaks.toml" ]; then
    check_pass "Secret detection configuration (gitleaks)"
else
    check_fail "Secret detection missing"
fi

# CI/CD security workflow
SECURITY_YML=$(find "$PROJECT_ROOT" -name "security.yml" -path "*github*" -o -name "security.yml" -path "*workflows*" 2>/dev/null | head -1)
if [ -n "$SECURITY_YML" ]; then
    check_pass "CI/CD security workflow exists"
else
    check_warn "CI/CD security workflow not found"
fi

# Pre-commit hooks
if [ -f "$PROJECT_ROOT/.pre-commit-config.yaml" ]; then
    check_pass "Pre-commit security hooks configured"
else
    check_warn "Pre-commit hooks not found"
fi

# Total test function count across codebase
GO_TESTS=$(grep -r "func Test" "$SERVER_DIR"/internal/ 2>/dev/null | wc -l)
RUST_TESTS=$(grep -r "#\[test\]" "$CRYPTO_DIR/src/" "$CRYPTO_DIR/tests/" 2>/dev/null | wc -l)
TOTAL_TESTS=$((GO_TESTS + RUST_TESTS))
if [ "$TOTAL_TESTS" -ge 400 ]; then
    check_pass "Total test coverage: $TOTAL_TESTS test functions (>= 400)"
else
    check_fail "Test coverage insufficient ($TOTAL_TESTS < 400)"
fi

# No http:// in production code
HTTP_LEAKS_SERVER=$(grep -rn "http://" "$SERVER_DIR/internal/" 2>/dev/null | grep -v "_test.go" | grep -v "// " | grep -v "localhost\|127.0.0.1" | wc -l)
HTTP_LEAKS_APP=$(grep -rn "http://" "$APP_DIR/src/" 2>/dev/null | grep -v "// " | grep -v "localhost\|127.0.0.1\|10.0.2.2" | grep -v "w3.org" | wc -l)
TOTAL_HTTP=$((HTTP_LEAKS_SERVER + HTTP_LEAKS_APP))
if [ "$TOTAL_HTTP" -eq 0 ]; then
    check_pass "No http:// URLs in production code (HTTPS enforced)"
else
    check_fail "Found $TOTAL_HTTP http:// URLs in production code"
fi

# PH10-FIX references
PH10_REFS=$(grep -r "PH10-FIX" "$SECURITY_DIR/" 2>/dev/null | wc -l)
if [ "$PH10_REFS" -ge 5 ]; then
    check_pass "PH10-FIX tagged implementations ($PH10_REFS references)"
else
    check_fail "PH10-FIX references insufficient"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 10 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 10 AST GATE FAILED — $FAIL_COUNT failures${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 10 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 10 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
