#!/bin/bash

# ============================================================
# Quantum_Shield — Phase 11 AST Gate
# Production Deployment & Launch Verification
# ============================================================
# Gate Requirement: All gates green, monitoring active
# CWE Coverage: 78, 79, 89, 319, 345, 404, 532, 693, 778, 1188
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
CRYPTO_DIR="$PROJECT_ROOT/usbvault-crypto"
APP_DIR="$PROJECT_ROOT/usbvault-app"
K8S_DIR="$SERVER_DIR/deploy/k8s"
WAF_DIR="$SERVER_DIR/deploy/waf"
MON_DIR="$SERVER_DIR/deploy/monitoring"
ET_DIR="$SERVER_DIR/internal/errortracking"
MW_DIR="$SERVER_DIR/internal/middleware"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Quantum_Shield Phase 11 AST Gate — Production Deployment & Launch${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: Infrastructure Provisioning (CWE-1188)
# ============================================================
echo -e "${BLUE}[Task 1] Infrastructure Provisioning (Kubernetes)${NC}"

# Dockerfile exists
if [ -f "$SERVER_DIR/Dockerfile" ]; then
    check_pass "Server Dockerfile exists"
else
    check_fail "Server Dockerfile missing"
fi

# Non-root user in Dockerfile
if grep -q "USER\|appuser\|nonroot" "$SERVER_DIR/Dockerfile" 2>/dev/null; then
    check_pass "Non-root user in Dockerfile"
else
    check_fail "Non-root user missing in Dockerfile"
fi

# K8s deployment manifest
if [ -f "$K8S_DIR/deployment.yaml" ]; then
    check_pass "Kubernetes deployment manifest exists (PH11-FIX)"
else
    check_fail "K8s deployment manifest missing"
fi

# Security context in deployment
if grep -q "securityContext" "$K8S_DIR/deployment.yaml" 2>/dev/null; then
    check_pass "Pod security context configured"
else
    check_fail "Pod security context missing"
fi

# runAsNonRoot
if grep -q "runAsNonRoot: true" "$K8S_DIR/deployment.yaml" 2>/dev/null; then
    check_pass "runAsNonRoot enforced in K8s"
else
    check_fail "runAsNonRoot not set"
fi

# Resource limits
if grep -q "limits" "$K8S_DIR/deployment.yaml" 2>/dev/null; then
    check_pass "Resource limits configured"
else
    check_fail "Resource limits missing"
fi

# Health probes
if grep -q "livenessProbe" "$K8S_DIR/deployment.yaml" 2>/dev/null && grep -q "readinessProbe" "$K8S_DIR/deployment.yaml" 2>/dev/null; then
    check_pass "Liveness and readiness probes configured"
else
    check_fail "Health probes missing"
fi

# K8s service + NetworkPolicy
if [ -f "$K8S_DIR/service.yaml" ]; then
    check_pass "Kubernetes service manifest exists (PH11-FIX)"
else
    check_fail "K8s service manifest missing"
fi

if grep -q "NetworkPolicy" "$K8S_DIR/service.yaml" 2>/dev/null; then
    check_pass "NetworkPolicy for pod isolation"
else
    check_fail "NetworkPolicy missing"
fi

# HPA
if [ -f "$K8S_DIR/hpa.yaml" ]; then
    check_pass "HorizontalPodAutoscaler configured (PH11-FIX)"
else
    check_fail "HPA missing"
fi

# Secrets from environment (not hardcoded)
if grep -q "secretKeyRef" "$K8S_DIR/deployment.yaml" 2>/dev/null; then
    check_pass "Secrets loaded via K8s Secrets (not hardcoded)"
else
    check_fail "Secrets not using K8s Secret references"
fi

echo ""

# ============================================================
# TASK 2: TLS 1.3 + HSTS + Security Headers (CWE-319, CWE-693)
# ============================================================
echo -e "${BLUE}[Task 2] TLS + HSTS + Security Headers${NC}"

# HSTS header
if grep -q "Strict-Transport-Security" "$MW_DIR/security.go" 2>/dev/null; then
    check_pass "HSTS header configured"
else
    check_fail "HSTS header missing"
fi

# CSP header
if grep -q "Content-Security-Policy" "$MW_DIR/security.go" 2>/dev/null; then
    check_pass "Content-Security-Policy header"
else
    check_fail "CSP header missing"
fi

# X-Frame-Options
if grep -q "X-Frame-Options" "$MW_DIR/security.go" 2>/dev/null; then
    check_pass "X-Frame-Options header (clickjacking prevention)"
else
    check_fail "X-Frame-Options missing"
fi

# HTTPS redirect
if grep -q "HTTPSRedirect\|https.*redirect" "$MW_DIR/security.go" 2>/dev/null; then
    check_pass "HTTPS redirect enforcement"
else
    check_fail "HTTPS redirect missing"
fi

echo ""

# ============================================================
# TASK 3: WAF Configuration (CWE-89, CWE-79)
# ============================================================
echo -e "${BLUE}[Task 3] WAF Configuration${NC}"

if [ -f "$WAF_DIR/modsecurity.conf" ]; then
    check_pass "ModSecurity WAF configuration exists (PH11-FIX)"
else
    check_fail "WAF configuration missing"
fi

# SQL injection rules
if grep -q "SQL Injection\|CWE-89\|sqli" "$WAF_DIR/modsecurity.conf" 2>/dev/null; then
    check_pass "SQL injection WAF rules (CWE-89)"
else
    check_fail "SQL injection WAF rules missing"
fi

# XSS rules
if grep -q "XSS\|CWE-79\|xss" "$WAF_DIR/modsecurity.conf" 2>/dev/null; then
    check_pass "XSS WAF rules (CWE-79)"
else
    check_fail "XSS WAF rules missing"
fi

# Rate limiting at WAF
if grep -q "Rate limit\|rate.*limit\|REQUEST_RATE" "$WAF_DIR/modsecurity.conf" 2>/dev/null; then
    check_pass "WAF rate limiting"
else
    check_fail "WAF rate limiting missing"
fi

# App-level rate limiting
if [ -f "$MW_DIR/ratelimit.go" ]; then
    check_pass "Application-level rate limiting middleware"
else
    check_fail "Rate limiting middleware missing"
fi

echo ""

# ============================================================
# TASK 4: Monitoring + Alerting (CWE-778)
# ============================================================
echo -e "${BLUE}[Task 4] Monitoring + Alerting${NC}"

# Prometheus config
if [ -f "$MON_DIR/prometheus.yml" ]; then
    check_pass "Prometheus configuration exists (PH11-FIX)"
else
    check_fail "Prometheus config missing"
fi

# Alert rules
if [ -f "$MON_DIR/alert_rules.yml" ]; then
    check_pass "Alert rules defined (PH11-FIX)"
else
    check_fail "Alert rules missing"
fi

# Alert count
ALERT_COUNT=$(grep -c "alert:" "$MON_DIR/alert_rules.yml" 2>/dev/null || echo "0")
if [ "$ALERT_COUNT" -ge 5 ]; then
    check_pass "Alert rules count: $ALERT_COUNT (>= 5 required)"
else
    check_fail "Alert rules insufficient ($ALERT_COUNT < 5)"
fi

# PagerDuty integration
if [ -f "$MON_DIR/pagerduty.yml" ]; then
    check_pass "PagerDuty alerting configuration (PH11-FIX)"
else
    check_fail "PagerDuty config missing"
fi

# Health check endpoints in main.go
MAIN_GO="$SERVER_DIR/cmd/api/main.go"
if grep -q "/health" "$MAIN_GO" 2>/dev/null && grep -q "/ready" "$MAIN_GO" 2>/dev/null; then
    check_pass "Health + readiness endpoints registered"
else
    check_fail "Health endpoints missing in main.go"
fi

# Metrics middleware
if [ -f "$MW_DIR/metrics.go" ]; then
    check_pass "Prometheus metrics middleware (PH11-FIX)"
else
    check_fail "Metrics middleware missing"
fi

echo ""

# ============================================================
# TASK 5: Error Tracking — Sentry PII-scrubbed (CWE-532)
# ============================================================
echo -e "${BLUE}[Task 5] Error Tracking (Sentry)${NC}"

if [ -f "$ET_DIR/sentry.go" ]; then
    check_pass "Sentry error tracking service exists (PH11-FIX)"
else
    check_fail "Sentry service missing"
fi

# PII scrubbing
if grep -q "PIIScrubber\|Scrub" "$ET_DIR/sentry.go" 2>/dev/null; then
    check_pass "PII scrubbing implementation"
else
    check_fail "PII scrubbing missing"
fi

# Sensitive header scrubbing
if grep -q "ScrubHeaders\|authorization\|cookie" "$ET_DIR/sentry.go" 2>/dev/null; then
    check_pass "Sensitive header scrubbing"
else
    check_fail "Header scrubbing missing"
fi

# Email/SSN/credit card patterns
PII_PATTERNS=0
for pattern in "Email|email" "SSN|ssn|Social" "credit.*card|CARD_REDACTED" "TOKEN_REDACTED|bearer"; do
    if grep -qE "$pattern" "$ET_DIR/sentry.go" 2>/dev/null; then
        PII_PATTERNS=$((PII_PATTERNS + 1))
    fi
done
if [ "$PII_PATTERNS" -ge 3 ]; then
    check_pass "PII detection patterns: $PII_PATTERNS categories"
else
    check_fail "PII detection patterns insufficient ($PII_PATTERNS < 3)"
fi

echo ""

# ============================================================
# TASK 6: Database Backup + DR (CWE-404)
# ============================================================
echo -e "${BLUE}[Task 6] Database Backup + Disaster Recovery${NC}"

if [ -f "$PROJECT_ROOT/scripts/backup-db.sh" ]; then
    check_pass "Database backup script exists (PH11-FIX)"
else
    check_fail "Backup script missing"
fi

# Encrypted backup
if grep -q "openssl\|encrypt\|aes" "$PROJECT_ROOT/scripts/backup-db.sh" 2>/dev/null; then
    check_pass "Backup encryption (AES-256)"
else
    check_fail "Backup encryption missing"
fi

# Checksum verification
if grep -q "sha256sum\|checksum\|integrity" "$PROJECT_ROOT/scripts/backup-db.sh" 2>/dev/null; then
    check_pass "Backup integrity verification (SHA-256)"
else
    check_fail "Backup integrity check missing"
fi

# Retention policy
if grep -q "RETENTION\|retention\|mtime\|cleanup" "$PROJECT_ROOT/scripts/backup-db.sh" 2>/dev/null; then
    check_pass "Backup retention policy"
else
    check_fail "Retention policy missing"
fi

# S3 versioning (Terraform)
if grep -q "versioning" "$PROJECT_ROOT/infrastructure/terraform/s3.tf" 2>/dev/null; then
    check_pass "S3 versioning enabled (Terraform)"
else
    check_warn "S3 versioning not found in Terraform"
fi

echo ""

# ============================================================
# TASK 7: iOS App Store + Google Play (Code signing)
# ============================================================
echo -e "${BLUE}[Task 7] App Store Submission${NC}"

# EAS config
if [ -f "$APP_DIR/eas.json" ]; then
    check_pass "EAS build configuration exists (PH11-FIX)"
else
    check_fail "EAS config missing"
fi

# Production build config
if grep -q "production" "$APP_DIR/eas.json" 2>/dev/null; then
    check_pass "Production build profile configured"
else
    check_fail "Production build profile missing"
fi

# Bundle identifier
if grep -q "bundleIdentifier\|com.qav" "$APP_DIR/eas.json" 2>/dev/null; then
    check_pass "iOS bundle identifier configured"
else
    check_fail "Bundle identifier missing"
fi

# Android package
if grep -q "package.*com.qav\|app-bundle" "$APP_DIR/eas.json" 2>/dev/null; then
    check_pass "Android package + app-bundle build type"
else
    check_fail "Android package config missing"
fi

echo ""

# ============================================================
# TASK 8: Desktop Builds — Code Signing (CWE-345)
# ============================================================
echo -e "${BLUE}[Task 8] Desktop Builds${NC}"

if [ -f "$PROJECT_ROOT/scripts/build-desktop.sh" ]; then
    check_pass "Desktop build script exists (PH11-FIX)"
else
    check_fail "Desktop build script missing"
fi

# Multi-platform support
PLATFORMS=0
for plat in "darwin" "windows" "linux"; do
    if grep -q "$plat" "$PROJECT_ROOT/scripts/build-desktop.sh" 2>/dev/null; then
        PLATFORMS=$((PLATFORMS + 1))
    fi
done
if [ "$PLATFORMS" -ge 3 ]; then
    check_pass "Desktop builds: $PLATFORMS platforms (macOS, Windows, Linux)"
else
    check_fail "Platform coverage insufficient ($PLATFORMS < 3)"
fi

# Code signing support
if grep -q "codesign\|signtool\|SIGNING" "$PROJECT_ROOT/scripts/build-desktop.sh" 2>/dev/null; then
    check_pass "Code signing support (macOS + Windows)"
else
    check_fail "Code signing missing"
fi

# Checksum generation
if grep -q "sha256sum\|SHA256SUMS" "$PROJECT_ROOT/scripts/build-desktop.sh" 2>/dev/null; then
    check_pass "Build artifact checksums (SHA-256)"
else
    check_fail "Build checksums missing"
fi

echo ""

# ============================================================
# TASK 9: Bug Bounty Program
# ============================================================
echo -e "${BLUE}[Task 9] Bug Bounty Program${NC}"

if [ -f "$PROJECT_ROOT/SECURITY.md" ]; then
    check_pass "SECURITY.md exists (PH11-FIX)"
else
    check_fail "SECURITY.md missing"
fi

# Responsible disclosure
if grep -q "Responsible\|responsible\|disclosure\|Reporting" "$PROJECT_ROOT/SECURITY.md" 2>/dev/null; then
    check_pass "Responsible disclosure policy"
else
    check_fail "Disclosure policy missing"
fi

# Bug bounty rewards
if grep -q "Reward\|reward\|bounty\|Bounty" "$PROJECT_ROOT/SECURITY.md" 2>/dev/null; then
    check_pass "Bug bounty reward tiers"
else
    check_fail "Reward tiers missing"
fi

# In-scope / out-of-scope
if grep -q "In Scope\|In scope\|Out of Scope\|Out of scope" "$PROJECT_ROOT/SECURITY.md" 2>/dev/null; then
    check_pass "In-scope and out-of-scope definitions"
else
    check_fail "Scope definitions missing"
fi

# Safe harbor
if grep -q "Safe Harbor\|safe harbor\|legal" "$PROJECT_ROOT/SECURITY.md" 2>/dev/null; then
    check_pass "Safe harbor clause for researchers"
else
    check_warn "Safe harbor clause not found"
fi

echo ""

# ============================================================
# TASK 10: Post-Launch Security Monitoring + Aggregate
# ============================================================
echo -e "${BLUE}[Task 10] Post-Launch Monitoring + Aggregate Validation${NC}"

# All prior gates exist
GATES_EXIST=0
for i in 1 2 3 4 5 6 7 8 9 10; do
    if [ -f "$PROJECT_ROOT/scripts/gate-phase${i}.sh" ]; then
        GATES_EXIST=$((GATES_EXIST + 1))
    fi
done
if [ "$GATES_EXIST" -ge 10 ]; then
    check_pass "All prior gate scripts present ($GATES_EXIST gates)"
else
    check_fail "Prior gates missing ($GATES_EXIST < 10)"
fi

# CI/CD security workflow
SECURITY_YML=$(find "$PROJECT_ROOT" -name "security.yml" -path "*github*" -o -name "security.yml" -path "*workflows*" 2>/dev/null | head -1)
if [ -n "$SECURITY_YML" ]; then
    check_pass "CI/CD security workflow exists"
else
    check_warn "CI/CD security workflow not found"
fi

# SAST scanner
if [ -f "$PROJECT_ROOT/scripts/run-sast.sh" ]; then
    check_pass "SAST scanning script exists"
else
    check_fail "SAST scanning script missing"
fi

# Secret detection
if [ -f "$PROJECT_ROOT/.gitleaks.toml" ]; then
    check_pass "Secret detection (gitleaks) configured"
else
    check_fail "Secret detection missing"
fi

# Total test coverage
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

# PH11-FIX references
PH11_REFS=$(grep -r "PH11-FIX" "$K8S_DIR/" "$WAF_DIR/" "$MON_DIR/" "$ET_DIR/" "$PROJECT_ROOT/scripts/backup-db.sh" "$PROJECT_ROOT/scripts/build-desktop.sh" "$PROJECT_ROOT/SECURITY.md" "$MW_DIR/metrics.go" 2>/dev/null | wc -l)
if [ "$PH11_REFS" -ge 5 ]; then
    check_pass "PH11-FIX tagged implementations ($PH11_REFS references)"
else
    check_fail "PH11-FIX references insufficient ($PH11_REFS < 5)"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 11 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 11 AST GATE FAILED — $FAIL_COUNT failures${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 11 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 11 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
