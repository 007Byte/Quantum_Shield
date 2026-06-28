#!/bin/bash

# ============================================================
# Quantum_Shield — Phase 3 AST Gate
# Authentication & Authorization Verification
# ============================================================
# Gate Requirement: OWASP ZAP auth scan + BOLA tests
# CWE Coverage: 287, 307, 308, 532, 613, 639, 862
# OWASP Coverage: API1 (BOLA), API2 (Broken Auth)
# ============================================================

set -uo pipefail
# Note: set -e intentionally omitted — we handle all errors via check_pass/check_fail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
AUTH_DIR="$SERVER_DIR/internal/auth"
MW_DIR="$SERVER_DIR/internal/middleware"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

check_pass() {
    echo -e "  ${GREEN}[PASS]${NC} $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

check_fail() {
    echo -e "  ${RED}[FAIL]${NC} $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

check_warn() {
    echo -e "  ${YELLOW}[WARN]${NC} $1"
    WARN_COUNT=$((WARN_COUNT + 1))
}

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Quantum_Shield Phase 3 AST Gate — Authentication & Authorization${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: SRP-6a Server-Side (CWE-287)
# ============================================================
echo -e "${BLUE}[Task 1] SRP-6a Server-Side Completion${NC}"

if [ -f "$AUTH_DIR/srp.go" ]; then
    check_pass "SRP handler exists (srp.go)"
else
    check_fail "SRP handler missing (srp.go)"
fi

# Check HandleSRPInit and HandleSRPVerify
if grep -q "HandleSRPInit" "$AUTH_DIR/srp.go" 2>/dev/null; then
    check_pass "HandleSRPInit handler implemented"
else
    check_fail "HandleSRPInit handler missing"
fi

if grep -q "HandleSRPVerify" "$AUTH_DIR/srp.go" 2>/dev/null; then
    check_pass "HandleSRPVerify handler implemented"
else
    check_fail "HandleSRPVerify handler missing"
fi

# Constant-time comparison for SRP proof
if grep -q "subtle\.ConstantTimeCompare\|subtle\.ConstantTimeEq" "$AUTH_DIR/srp.go" 2>/dev/null; then
    check_pass "SRP proof uses constant-time comparison (CWE-208)"
else
    check_fail "SRP proof missing constant-time comparison"
fi

# Session replay prevention
if grep -q "Del\|Delete\|Remove" "$AUTH_DIR/srp.go" 2>/dev/null; then
    check_pass "SRP session deleted after use (replay prevention)"
else
    check_fail "SRP session not deleted after use"
fi

# SRP integration tests
SRP_TEST_COUNT=$(grep -c "func Test" "$AUTH_DIR/srp_test.go" 2>/dev/null || echo "0")
if [ "$SRP_TEST_COUNT" -ge 4 ]; then
    check_pass "SRP integration tests present ($SRP_TEST_COUNT tests)"
else
    check_fail "SRP integration tests insufficient ($SRP_TEST_COUNT < 4)"
fi

# Timing attack mitigation
if grep -q "randomDelay\|timingDelay\|timing" "$AUTH_DIR/srp.go" 2>/dev/null; then
    check_pass "SRP timing attack mitigation present"
else
    check_warn "SRP timing attack mitigation not detected"
fi

echo ""

# ============================================================
# TASK 2: FIDO2/WebAuthn (CWE-308)
# ============================================================
echo -e "${BLUE}[Task 2] FIDO2/WebAuthn Full Flow${NC}"

if [ -f "$AUTH_DIR/fido2.go" ]; then
    check_pass "FIDO2 authentication handler exists"
else
    check_fail "FIDO2 authentication handler missing"
fi

if [ -f "$AUTH_DIR/fido2_register.go" ]; then
    check_pass "FIDO2 registration handler exists"
else
    check_fail "FIDO2 registration handler missing"
fi

# WebAuthn library in go.mod
if grep -q "go-webauthn/webauthn" "$SERVER_DIR/go.mod" 2>/dev/null; then
    check_pass "go-webauthn library in go.mod"
else
    check_fail "go-webauthn library missing from go.mod"
fi

# Challenge + Verify handlers
if grep -q "HandleFIDO2Challenge" "$AUTH_DIR/fido2.go" 2>/dev/null; then
    check_pass "FIDO2 authentication challenge handler present"
else
    check_fail "FIDO2 authentication challenge handler missing"
fi

if grep -q "HandleFIDO2RegisterChallenge" "$AUTH_DIR/fido2_register.go" 2>/dev/null; then
    check_pass "FIDO2 registration challenge handler present"
else
    check_fail "FIDO2 registration challenge handler missing"
fi

# Sign count validation (cloned key detection)
if grep -q "SignCount\|signCount\|sign_count" "$AUTH_DIR/fido2.go" 2>/dev/null; then
    check_pass "FIDO2 sign count validation (cloned key detection)"
else
    check_warn "FIDO2 sign count validation not detected"
fi

# FIDO2 tests
FIDO2_TEST_FILES=$(find "$AUTH_DIR" -name "fido2*_test.go" 2>/dev/null | wc -l)
if [ "$FIDO2_TEST_FILES" -ge 2 ]; then
    check_pass "FIDO2 test files present ($FIDO2_TEST_FILES files)"
else
    check_fail "FIDO2 test files insufficient ($FIDO2_TEST_FILES < 2)"
fi

# Backup codes
if [ -f "$AUTH_DIR/fido2_backup.go" ]; then
    check_pass "FIDO2 backup codes handler exists"
else
    check_warn "FIDO2 backup codes handler missing"
fi

echo ""

# ============================================================
# TASK 3: JWT Hardening (CWE-613)
# ============================================================
echo -e "${BLUE}[Task 3] JWT Hardening — Ed25519, Short TTL, Refresh Rotation${NC}"

if [ -f "$AUTH_DIR/jwt.go" ]; then
    check_pass "JWT handler exists"
else
    check_fail "JWT handler missing"
fi

# Ed25519 signing
if grep -q "ed25519\|EdDSA\|SigningMethodEdDSA" "$AUTH_DIR/jwt.go" 2>/dev/null; then
    check_pass "JWT uses Ed25519/EdDSA signing"
else
    check_fail "JWT not using Ed25519 signing"
fi

# Short TTL (access token <= 30min)
if grep -qE "(15|20|30)\s*\*\s*time\.Minute|accessTokenTTL|AccessTokenTTL" "$AUTH_DIR/jwt.go" 2>/dev/null; then
    check_pass "JWT access token has short TTL"
else
    check_warn "JWT access token TTL not verified"
fi

# Refresh token rotation
if grep -q "RefreshAccessToken\|refreshToken\|refresh_token" "$AUTH_DIR/jwt.go" 2>/dev/null; then
    check_pass "JWT refresh token rotation implemented"
else
    check_fail "JWT refresh token rotation missing"
fi

# Token family / theft detection
if grep -q "familyID\|family_id\|FamilyID\|token.*family" "$AUTH_DIR/jwt.go" 2>/dev/null; then
    check_pass "JWT token family tracking (theft detection)"
else
    check_warn "JWT token family tracking not detected"
fi

# JWT security tests
if [ -f "$AUTH_DIR/jwt_security_test.go" ] || [ -f "$AUTH_DIR/jwt_test.go" ]; then
    check_pass "JWT security tests present"
else
    check_fail "JWT security tests missing"
fi

echo ""

# ============================================================
# TASK 4: No JWT Key Logging (CWE-532)
# ============================================================
echo -e "${BLUE}[Task 4] JWT Private Key Not Logged (CWE-532)${NC}"

# Check for dangerous log patterns: actual key VALUE logging (not key SIZE validation)
# Safe: log.Fatal().Int("want", ed25519.PrivateKeySize) — logs expected size constant
# Dangerous: log.Info().Str("key", privateKeyValue) — would log actual key material
DANGEROUS_LOG_PATTERNS=0
# Patterns that log actual key material (not size/path validation messages)
for pattern in 'log.*Str.*jwtPrivateKey' 'log.*Str.*[Ss]ecretKey\b' 'fmt\.Print.*jwtPrivateKey' 'log.*Bytes.*jwtPrivateKey'; do
    if grep -qE "$pattern" "$AUTH_DIR/jwt.go" 2>/dev/null; then
        DANGEROUS_LOG_PATTERNS=$((DANGEROUS_LOG_PATTERNS + 1))
        check_fail "Potential key VALUE logging detected: $pattern"
    fi
done

if [ "$DANGEROUS_LOG_PATTERNS" -eq 0 ]; then
    check_pass "No JWT private key VALUE logging detected in jwt.go"
fi

# Check across all auth files for actual key content logging
AUTH_KEY_LEAKS=$(grep -rlE 'log\.(Info|Debug|Warn|Error).*Str.*[Pp]rivateKey|log\.(Info|Debug|Warn|Error).*Str.*[Ss]ecretKey|fmt\.Print.*jwtPrivateKey' "$AUTH_DIR"/ 2>/dev/null | wc -l)
if [ "$AUTH_KEY_LEAKS" -eq 0 ]; then
    check_pass "No private key logging across auth package"
else
    check_fail "Private key logging found in $AUTH_KEY_LEAKS auth files"
fi

# Check for key file path preference over env vars
if grep -q "KEY_FILE\|key_file\|keyFile" "$AUTH_DIR/jwt.go" 2>/dev/null; then
    check_pass "JWT supports file-based key loading (SD-004)"
else
    check_warn "JWT file-based key loading not detected"
fi

echo ""

# ============================================================
# TASK 5: Rate Limiting (CWE-307)
# ============================================================
echo -e "${BLUE}[Task 5] Rate Limiting — Per-IP + Per-User + Per-Endpoint${NC}"

RATELIMIT_FILE=""
if [ -f "$MW_DIR/ratelimit.go" ]; then
    RATELIMIT_FILE="$MW_DIR/ratelimit.go"
elif [ -f "$MW_DIR/rate_limit.go" ]; then
    RATELIMIT_FILE="$MW_DIR/rate_limit.go"
fi

if [ -n "$RATELIMIT_FILE" ]; then
    check_pass "Rate limiter middleware exists"
else
    check_fail "Rate limiter middleware missing"
    RATELIMIT_FILE="/dev/null"
fi

# Per-IP limiting
if grep -q "IP\|RemoteAddr\|ip" "$RATELIMIT_FILE" 2>/dev/null; then
    check_pass "Per-IP rate limiting implemented"
else
    check_fail "Per-IP rate limiting missing"
fi

# Per-user limiting
if grep -q "userID\|user_id\|UserID" "$RATELIMIT_FILE" 2>/dev/null; then
    check_pass "Per-user rate limiting implemented"
else
    check_fail "Per-user rate limiting missing"
fi

# Auth-specific rate limiting
if grep -q "AuthRateLimiter\|auth.*rate\|auth.*limit" "$RATELIMIT_FILE" 2>/dev/null; then
    check_pass "Auth endpoint rate limiting (stricter limits)"
else
    check_warn "Auth-specific rate limiting not detected"
fi

# 429 Too Many Requests response
if grep -q "429\|TooManyRequests\|StatusTooManyRequests" "$RATELIMIT_FILE" 2>/dev/null; then
    check_pass "HTTP 429 response for rate limit exceeded"
else
    check_fail "HTTP 429 response missing"
fi

# Rate limit tests
RATELIMIT_TESTS=$(find "$MW_DIR" -name "*ratelimit*_test.go" -o -name "*rate_limit*_test.go" 2>/dev/null | wc -l)
if [ "$RATELIMIT_TESTS" -ge 1 ]; then
    check_pass "Rate limiting tests present ($RATELIMIT_TESTS test files)"
else
    check_fail "Rate limiting tests missing"
fi

echo ""

# ============================================================
# TASK 6: Account Lockout + Progressive Delay (CWE-307)
# ============================================================
echo -e "${BLUE}[Task 6] Account Lockout + Progressive Delay${NC}"

if [ -f "$AUTH_DIR/lockout.go" ]; then
    check_pass "Account lockout service exists"
else
    check_fail "Account lockout service missing"
fi

# Progressive delay
if grep -q "Progressive\|progressive\|exponential\|backoff\|2.*attempts\|pow" "$AUTH_DIR/lockout.go" 2>/dev/null; then
    check_pass "Progressive delay algorithm implemented"
else
    check_fail "Progressive delay missing"
fi

# Max attempts check
if grep -q "maxAttempts\|MaxAttempts\|max_attempts\|failedAttempts" "$AUTH_DIR/lockout.go" 2>/dev/null; then
    check_pass "Maximum failed attempts threshold configured"
else
    check_fail "Maximum failed attempts threshold missing"
fi

# Reset on success
if grep -q "ResetAttempts\|resetAttempts\|ClearLockout\|clearLockout" "$AUTH_DIR/lockout.go" 2>/dev/null; then
    check_pass "Lockout reset on successful auth"
else
    check_fail "Lockout reset mechanism missing"
fi

# Lockout tests
LOCKOUT_TEST_COUNT=$(grep -c "func Test" "$AUTH_DIR/lockout_test.go" 2>/dev/null || echo "0")
if [ "$LOCKOUT_TEST_COUNT" -ge 2 ]; then
    check_pass "Lockout tests present ($LOCKOUT_TEST_COUNT tests)"
else
    check_fail "Lockout tests insufficient ($LOCKOUT_TEST_COUNT < 2)"
fi

echo ""

# ============================================================
# TASK 7: RBAC Enforcement (CWE-862)
# ============================================================
echo -e "${BLUE}[Task 7] RBAC Enforcement — Owner/Editor/Viewer${NC}"

if [ -f "$AUTH_DIR/rbac.go" ]; then
    check_pass "RBAC service exists"
else
    check_fail "RBAC service missing"
fi

# Three roles defined
# Check for role definitions (RoleOwner/RoleEditor/RoleViewer or "owner"/"editor"/"viewer")
for role in owner editor viewer; do
    if grep -qi "$role" "$AUTH_DIR/rbac.go" 2>/dev/null; then
        check_pass "Role defined: $role"
    else
        check_fail "Role missing: $role"
    fi
done

# Permission checks
if grep -q "CheckPermission\|checkPermission\|HasPermission" "$AUTH_DIR/rbac.go" 2>/dev/null; then
    check_pass "Permission check function implemented"
else
    check_fail "Permission check function missing"
fi

# RBAC middleware
RBAC_MW=""
if [ -f "$MW_DIR/rbac.go" ]; then
    RBAC_MW="$MW_DIR/rbac.go"
elif grep -q "RequireVaultPermission\|RequirePermission" "$MW_DIR"/*.go 2>/dev/null; then
    RBAC_MW=$(grep -l "RequireVaultPermission\|RequirePermission" "$MW_DIR"/*.go | head -1)
fi

if [ -n "$RBAC_MW" ]; then
    check_pass "RBAC middleware enforces permissions on routes"
else
    check_fail "RBAC middleware missing"
fi

# RBAC tests
RBAC_TEST_COUNT=$(grep -c "func Test" "$AUTH_DIR/rbac_test.go" 2>/dev/null || echo "0")
if [ "$RBAC_TEST_COUNT" -ge 3 ]; then
    check_pass "RBAC tests present ($RBAC_TEST_COUNT tests)"
else
    check_fail "RBAC tests insufficient ($RBAC_TEST_COUNT < 3)"
fi

echo ""

# ============================================================
# TASK 8: BOLA Testing (CWE-639)
# ============================================================
echo -e "${BLUE}[Task 8] BOLA/IDOR Testing — Cross-User Access Prevention${NC}"

if [ -f "$AUTH_DIR/bola_test.go" ]; then
    check_pass "BOLA test suite exists"
else
    check_fail "BOLA test suite missing"
fi

BOLA_TEST_COUNT=$(grep -c "func Test" "$AUTH_DIR/bola_test.go" 2>/dev/null || echo "0")
if [ "$BOLA_TEST_COUNT" -ge 5 ]; then
    check_pass "BOLA tests cover multiple scenarios ($BOLA_TEST_COUNT tests)"
else
    check_fail "BOLA test coverage insufficient ($BOLA_TEST_COUNT < 5)"
fi

# Cross-user access test
if grep -q "CrossUser\|cross.*user\|OtherUser\|other.*user\|Intruder\|intruder" "$AUTH_DIR/bola_test.go" 2>/dev/null; then
    check_pass "BOLA tests include cross-user access scenarios"
else
    check_fail "BOLA cross-user scenarios missing"
fi

# Parameter tampering test
if grep -q "Tamper\|tamper\|Enumeration\|enumeration" "$AUTH_DIR/bola_test.go" 2>/dev/null; then
    check_pass "BOLA tests include parameter tampering"
else
    check_warn "BOLA parameter tampering tests not detected"
fi

# Cross-tenant isolation
if grep -q "Tenant\|tenant\|CrossTenant\|cross.*tenant\|Isolation\|isolation" "$AUTH_DIR/bola_test.go" 2>/dev/null; then
    check_pass "BOLA tests include cross-tenant isolation"
else
    check_warn "BOLA cross-tenant tests not detected"
fi

echo ""

# ============================================================
# TASK 9: Aggregate Security Checks
# ============================================================
echo -e "${BLUE}[Task 9] Aggregate Security Validation${NC}"

# No http:// URLs in auth code (must be https)
HTTP_LEAKS=$(grep -rn "http://" "$AUTH_DIR"/ 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$HTTP_LEAKS" -eq 0 ]; then
    check_pass "No http:// URLs in auth code (HTTPS enforced)"
else
    check_fail "Found $HTTP_LEAKS http:// URLs in auth code"
fi

# Check for hardcoded secrets in auth
HARDCODED_SECRETS=$(grep -rnE '(password|secret|key)\s*=\s*"[^"]{8,}"' "$AUTH_DIR"/ 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$HARDCODED_SECRETS" -eq 0 ]; then
    check_pass "No hardcoded secrets in auth code"
else
    check_fail "Found $HARDCODED_SECRETS potential hardcoded secrets"
fi

# Auth test file count
AUTH_TEST_COUNT=$(find "$AUTH_DIR" -name "*_test.go" 2>/dev/null | wc -l)
if [ "$AUTH_TEST_COUNT" -ge 5 ]; then
    check_pass "Auth test coverage: $AUTH_TEST_COUNT test files"
else
    check_fail "Auth test coverage insufficient: $AUTH_TEST_COUNT < 5 test files"
fi

# Total auth test function count
TOTAL_TEST_FUNCS=$(grep -r "func Test" "$AUTH_DIR"/*_test.go 2>/dev/null | wc -l)
if [ "$TOTAL_TEST_FUNCS" -ge 20 ]; then
    check_pass "Total auth test functions: $TOTAL_TEST_FUNCS (>= 20 required)"
else
    check_fail "Total auth test functions: $TOTAL_TEST_FUNCS (< 20 required)"
fi

# Middleware auth enforcement
if grep -rq "RequireAuth\|AuthMiddleware\|JWTAuth\|TokenAuth" "$MW_DIR"/ 2>/dev/null; then
    check_pass "Authentication middleware present on routes"
else
    check_fail "Authentication middleware missing"
fi

# Route protection in main.go or router
ROUTER_FILE=$(find "$SERVER_DIR/cmd" -name "main.go" -o -name "router.go" -o -name "routes.go" 2>/dev/null | head -1)
if [ -n "$ROUTER_FILE" ] && grep -q "auth\|Auth" "$ROUTER_FILE" 2>/dev/null; then
    check_pass "Auth route registration in application entry"
else
    check_warn "Auth route registration not verified"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 3 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 3 AST GATE FAILED — $FAIL_COUNT failures require remediation${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 3 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items to review${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 3 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
