#!/bin/bash

# ============================================================
# Quantum Armor Vault (QAV) — Phase 6 AST Gate
# Audit Logging & Compliance Verification
# ============================================================
# Gate Requirement: Log coverage audit + OWASP A09
# CWE Coverage: 354, 532, 778
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
AUDIT_DIR="$SERVER_DIR/internal/audit"
MW_DIR="$SERVER_DIR/internal/middleware"
MIGRATION_DIR="$SERVER_DIR/migrations"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}QAV Phase 6 AST Gate — Audit Logging & Compliance${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: Hash-Chain Audit Log (CWE-778)
# ============================================================
echo -e "${BLUE}[Task 1] Hash-Chain Audit Log${NC}"

if [ -f "$AUDIT_DIR/service.go" ]; then
    check_pass "Audit service exists"
else
    check_fail "Audit service missing"
fi

# AuditEntry struct with hash chain
if grep -q "AuditEntry\|audit_entry" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "AuditEntry struct defined"
else
    check_fail "AuditEntry struct missing"
fi

# SHA-256 hash computation
if grep -q "sha256\|SHA256\|crypto/sha256" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "SHA-256 hash computation for chain"
else
    check_fail "SHA-256 hash computation missing"
fi

# Previous hash linking
if grep -q "prev_hash\|PrevHash\|previous_hash" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "Previous hash linking (tamper-evident chain)"
else
    check_fail "Previous hash linking missing"
fi

# LogAction method
if grep -q "LogAction\|logAction" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "LogAction method for audit entries"
else
    check_fail "LogAction method missing"
fi

# Database schema
if grep -rq "audit_log" "$MIGRATION_DIR/" 2>/dev/null; then
    check_pass "audit_log table in database schema"
else
    check_fail "audit_log table missing from schema"
fi

# Chain tests
if [ -f "$AUDIT_DIR/chain_test.go" ]; then
    CHAIN_TESTS=$(grep -c "func Test" "$AUDIT_DIR/chain_test.go" 2>/dev/null || echo "0")
    check_pass "Hash chain tests present ($CHAIN_TESTS tests)"
else
    check_fail "Hash chain tests missing"
fi

echo ""

# ============================================================
# TASK 2: Chain Integrity Verification (CWE-354)
# ============================================================
echo -e "${BLUE}[Task 2] Chain Integrity Verification${NC}"

# VerifyChain method
if grep -q "VerifyChain\|verifyChain\|verify_chain" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "VerifyChain method implemented"
else
    check_fail "VerifyChain method missing"
fi

# HTTP endpoint
if grep -q "HandleVerifyChain\|handle.*verify.*chain" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "Chain verification HTTP endpoint"
else
    check_fail "Chain verification endpoint missing"
fi

# Cursor-based pagination for verification
if grep -q "cursor\|batch\|LIMIT\|pagination" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "Cursor-based pagination in verification"
else
    check_warn "Pagination in verification not detected"
fi

# Route registration
MAIN_GO="$SERVER_DIR/cmd/api/main.go"
if grep -q "verify\|VerifyChain" "$MAIN_GO" 2>/dev/null; then
    check_pass "Chain verification route registered"
else
    check_fail "Chain verification route not registered"
fi

echo ""

# ============================================================
# TASK 3: Structured Security Event Logging (CWE-532)
# ============================================================
echo -e "${BLUE}[Task 3] Structured Security Event Logging${NC}"

# SecurityEvent struct
if grep -q "SecurityEvent" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "SecurityEvent struct defined"
else
    check_fail "SecurityEvent struct missing"
fi

# Event type constants
EVENT_TYPES=0
for evt in EventAuthLogin EventAuthFailed EventPermissionDenied EventDataAccess EventConfigChange; do
    if grep -q "$evt" "$AUDIT_DIR/service.go" 2>/dev/null; then
        EVENT_TYPES=$((EVENT_TYPES + 1))
    fi
done
if [ "$EVENT_TYPES" -ge 4 ]; then
    check_pass "Security event type constants ($EVENT_TYPES types)"
else
    check_fail "Security event type constants insufficient ($EVENT_TYPES < 4)"
fi

# PH6-FIX event types
PH6_EVENTS=0
for evt in EventTokenTheft EventKeyRotation EventPermissionChange; do
    if grep -q "$evt" "$AUDIT_DIR/service.go" 2>/dev/null; then
        PH6_EVENTS=$((PH6_EVENTS + 1))
    fi
done
if [ "$PH6_EVENTS" -ge 3 ]; then
    check_pass "PH6-FIX event types added ($PH6_EVENTS)"
else
    check_fail "PH6-FIX event types missing ($PH6_EVENTS < 3)"
fi

# Zerolog integration
if grep -q "zerolog\|rs/zerolog" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "Zerolog structured logging integration"
else
    check_fail "Zerolog integration missing"
fi

# LogSecurityEvent method
if grep -q "LogSecurityEvent\|logSecurityEvent" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "LogSecurityEvent method implemented"
else
    check_fail "LogSecurityEvent method missing"
fi

# Request logging middleware
if [ -f "$MW_DIR/logging.go" ]; then
    check_pass "Request logging middleware exists"
else
    check_fail "Request logging middleware missing"
fi

# Security events tests
if [ -f "$AUDIT_DIR/security_events_test.go" ]; then
    SE_TESTS=$(grep -c "func Test" "$AUDIT_DIR/security_events_test.go" 2>/dev/null || echo "0")
    check_pass "Security event tests present ($SE_TESTS tests)"
else
    check_fail "Security event tests missing"
fi

# No PII in logs check
if grep -q "password\|Password" "$MW_DIR/logging.go" 2>/dev/null; then
    check_fail "Potential PII logging in middleware"
else
    check_pass "No PII detected in request logging middleware"
fi

echo ""

# ============================================================
# TASK 4: Anomaly Detection (CWE-778)
# ============================================================
echo -e "${BLUE}[Task 4] Anomaly Detection${NC}"

# Anomaly detection service
ANOMALY_FILE=""
if [ -f "$AUDIT_DIR/anomaly.go" ]; then
    ANOMALY_FILE="$AUDIT_DIR/anomaly.go"
fi

if [ -n "$ANOMALY_FILE" ]; then
    check_pass "Anomaly detection service exists (PH6-FIX)"
else
    check_fail "Anomaly detection service missing"
fi

# Detection patterns
if [ -n "$ANOMALY_FILE" ]; then
    PATTERNS=0
    for pattern in "UnusualHours|unusual.*hour" "ExcessiveFailures|excessive.*fail" "GeoChange|geo.*change|geographic" "HighFrequency|high.*frequency"; do
        if grep -qE "$pattern" "$ANOMALY_FILE" 2>/dev/null; then
            PATTERNS=$((PATTERNS + 1))
        fi
    done
    if [ "$PATTERNS" -ge 3 ]; then
        check_pass "Anomaly detection patterns: $PATTERNS types"
    else
        check_fail "Anomaly detection patterns insufficient ($PATTERNS < 3)"
    fi
else
    check_fail "Cannot check anomaly patterns (file missing)"
fi

# AnomalyAlert struct
if [ -n "$ANOMALY_FILE" ] && grep -q "AnomalyAlert" "$ANOMALY_FILE" 2>/dev/null; then
    check_pass "AnomalyAlert struct defined"
else
    check_fail "AnomalyAlert struct missing"
fi

# RecordAnomaly method
if [ -n "$ANOMALY_FILE" ] && grep -q "RecordAnomaly\|recordAnomaly" "$ANOMALY_FILE" 2>/dev/null; then
    check_pass "RecordAnomaly method for storing alerts"
else
    check_fail "RecordAnomaly method missing"
fi

# HTTP handler
if [ -n "$ANOMALY_FILE" ] && grep -q "HandleGetAnomalies\|handle.*anomal" "$ANOMALY_FILE" 2>/dev/null; then
    check_pass "Anomaly listing HTTP endpoint"
else
    check_fail "Anomaly listing endpoint missing"
fi

echo ""

# ============================================================
# TASK 5: Compliance Report Generation
# ============================================================
echo -e "${BLUE}[Task 5] Compliance Report Generation${NC}"

# Compliance service
COMPLIANCE_FILE=""
if [ -f "$AUDIT_DIR/compliance.go" ]; then
    COMPLIANCE_FILE="$AUDIT_DIR/compliance.go"
fi

if [ -n "$COMPLIANCE_FILE" ]; then
    check_pass "Compliance reporting service exists (PH6-FIX)"
else
    check_fail "Compliance reporting service missing"
fi

# SOC 2 report generation
if [ -n "$COMPLIANCE_FILE" ] && grep -q "SOC2\|soc2\|GenerateSOC2\|ComplianceReport" "$COMPLIANCE_FILE" 2>/dev/null; then
    check_pass "SOC 2 compliance report generation"
else
    check_fail "SOC 2 report generation missing"
fi

# ComplianceReport struct
if [ -n "$COMPLIANCE_FILE" ] && grep -q "ComplianceReport" "$COMPLIANCE_FILE" 2>/dev/null; then
    check_pass "ComplianceReport struct defined"
else
    check_fail "ComplianceReport struct missing"
fi

# Key metrics
if [ -n "$COMPLIANCE_FILE" ]; then
    METRICS=0
    for metric in "TotalEvents|total_events" "AuthFailures|auth_failures" "PermissionDenials|permission_denials" "DataAccesses|data_accesses"; do
        if grep -qE "$metric" "$COMPLIANCE_FILE" 2>/dev/null; then
            METRICS=$((METRICS + 1))
        fi
    done
    if [ "$METRICS" -ge 3 ]; then
        check_pass "Compliance metrics tracked ($METRICS metrics)"
    else
        check_fail "Compliance metrics insufficient ($METRICS < 3)"
    fi
else
    check_fail "Cannot check compliance metrics (file missing)"
fi

# CSV export
if [ -n "$COMPLIANCE_FILE" ] && grep -q "CSV\|csv\|ExportCompliance\|export" "$COMPLIANCE_FILE" 2>/dev/null; then
    check_pass "Compliance report CSV export"
else
    check_warn "Compliance CSV export not detected"
fi

# HTTP handler
if [ -n "$COMPLIANCE_FILE" ] && grep -q "HandleGenerate\|handle.*compliance\|handle.*report" "$COMPLIANCE_FILE" 2>/dev/null; then
    check_pass "Compliance report HTTP endpoint"
else
    check_fail "Compliance report endpoint missing"
fi

echo ""

# ============================================================
# TASK 6: Aggregate Log Coverage (OWASP A09)
# ============================================================
echo -e "${BLUE}[Task 6] Aggregate Log Coverage + OWASP A09${NC}"

# Audit test file count
AUDIT_TESTS=$(find "$AUDIT_DIR" -name "*_test.go" 2>/dev/null | wc -l)
if [ "$AUDIT_TESTS" -ge 2 ]; then
    check_pass "Audit test coverage: $AUDIT_TESTS test files"
else
    check_fail "Audit test coverage insufficient ($AUDIT_TESTS < 2)"
fi

# Total audit test functions
TOTAL_AUDIT_FUNCS=$(grep -r "func Test" "$AUDIT_DIR"/*_test.go 2>/dev/null | wc -l)
if [ "$TOTAL_AUDIT_FUNCS" -ge 10 ]; then
    check_pass "Total audit test functions: $TOTAL_AUDIT_FUNCS (>= 10 required)"
else
    check_fail "Audit test functions insufficient ($TOTAL_AUDIT_FUNCS < 10)"
fi

# Audit archive table
if grep -rq "audit_log_archive\|archive" "$MIGRATION_DIR/" 2>/dev/null; then
    check_pass "Audit log archive table for retention"
else
    check_warn "Audit log archive table not detected"
fi

# PH6-FIX routes registered
PH6_ROUTES=$(grep -c "PH6-FIX\|anomal\|compliance" "$MAIN_GO" 2>/dev/null || echo "0")
if [ "$PH6_ROUTES" -ge 2 ]; then
    check_pass "PH6-FIX routes registered ($PH6_ROUTES references)"
else
    check_fail "PH6-FIX routes not registered ($PH6_ROUTES < 2)"
fi

# No http:// in audit code
HTTP_LEAKS=$(grep -rn "http://" "$AUDIT_DIR/" 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$HTTP_LEAKS" -eq 0 ]; then
    check_pass "No http:// URLs in audit code"
else
    check_fail "Found $HTTP_LEAKS http:// URLs in audit code"
fi

# Severity levels defined
if grep -q "SeverityInfo\|SeverityWarn\|SeverityCritical\|severity" "$AUDIT_DIR/service.go" 2>/dev/null; then
    check_pass "Severity levels defined for event classification"
else
    check_fail "Severity levels missing"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 6 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 6 AST GATE FAILED — $FAIL_COUNT failures${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 6 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 6 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
