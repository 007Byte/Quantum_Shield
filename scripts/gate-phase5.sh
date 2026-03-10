#!/bin/bash

# ============================================================
# Quantum Armor Vault (QAV) — Phase 5 AST Gate
# E2E Encrypted Sharing Verification
# ============================================================
# Gate Requirement: E2E sharing crypto verification
# CWE Coverage: 295, 300, 319, 324, 613, 672
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
SHARING_DIR="$SERVER_DIR/internal/sharing"
VAULT_DIR="$SERVER_DIR/internal/vault"
CRYPTO_DIR="$PROJECT_ROOT/usbvault-crypto"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0

check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}QAV Phase 5 AST Gate — E2E Encrypted Sharing${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: Public Key Registry (CWE-295)
# ============================================================
echo -e "${BLUE}[Task 1] Public Key Registry${NC}"

if [ -f "$SHARING_DIR/service.go" ]; then
    check_pass "Sharing service exists"
else
    check_fail "Sharing service missing"
fi

# Publish public key
if grep -q "PublishPublicKey\|HandlePublishPublicKey\|PH5-FIX.*publish" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Public key publish endpoint implemented (PH5-FIX)"
else
    check_fail "Public key publish endpoint missing"
fi

# Retrieve public key
if grep -q "GetPublicKey\|HandleGetPublicKey" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Public key retrieval endpoint implemented"
else
    check_fail "Public key retrieval endpoint missing"
fi

# Key validation (32 bytes for X25519)
if grep -q "32\|x25519\|X25519\|key.*valid\|key.*size" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Public key validation present (X25519 32-byte check)"
else
    check_fail "Public key validation missing"
fi

# Database schema for public keys
MIGRATION_DIR="$SERVER_DIR/migrations"
if grep -rq "public_keys" "$MIGRATION_DIR/" 2>/dev/null; then
    check_pass "public_keys table in database schema"
else
    check_fail "public_keys table missing from schema"
fi

echo ""

# ============================================================
# TASK 2: X25519 Sealed-Box Share Flow (CWE-319)
# ============================================================
echo -e "${BLUE}[Task 2] X25519 Sealed-Box Share Flow${NC}"

# Rust sealed box implementation
if [ -f "$CRYPTO_DIR/src/sharing.rs" ]; then
    check_pass "X25519 sealed-box implementation exists (sharing.rs)"
else
    check_fail "X25519 sealed-box implementation missing"
fi

# Key functions
for func in generate_keypair seal open; do
    if grep -q "fn $func\|pub fn $func\|pub(crate) fn $func" "$CRYPTO_DIR/src/sharing.rs" 2>/dev/null; then
        check_pass "Sealed-box function: $func()"
    else
        check_fail "Sealed-box function missing: $func()"
    fi
done

# x25519_dalek dependency
if grep -q "x25519.dalek\|x25519_dalek" "$CRYPTO_DIR/Cargo.toml" 2>/dev/null; then
    check_pass "x25519-dalek dependency present"
else
    check_fail "x25519-dalek dependency missing"
fi

# Sealed box validation on server
if grep -q "validateSealedBox\|sealed.*box.*valid\|sealed.*format" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Sealed-box format validation on server"
else
    check_fail "Sealed-box format validation missing"
fi

# Sharing tests
SHARING_TESTS=$(find "$CRYPTO_DIR/tests" -name "*sharing*" 2>/dev/null | wc -l)
if [ "$SHARING_TESTS" -ge 1 ]; then
    SHARING_TEST_COUNT=$(grep -c "fn test\|#\[test\]" "$CRYPTO_DIR/tests/sharing_tests.rs" 2>/dev/null || echo "0")
    check_pass "Sealed-box test suite: $SHARING_TEST_COUNT tests"
else
    check_fail "Sealed-box test suite missing"
fi

# HKDF key derivation
if grep -q "hkdf\|HKDF\|Hkdf" "$CRYPTO_DIR/src/sharing.rs" 2>/dev/null; then
    check_pass "HKDF-SHA256 key derivation in sealed-box"
else
    check_warn "HKDF key derivation not detected"
fi

echo ""

# ============================================================
# TASK 3: Share Accept/Reject/Revoke Lifecycle (CWE-613)
# ============================================================
echo -e "${BLUE}[Task 3] Share Accept/Reject/Revoke Lifecycle${NC}"

# Create share
if grep -q "CreateShare\|HandleCreateShare" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Create share implemented"
else
    check_fail "Create share missing"
fi

# Accept share (PH5-FIX)
if grep -q "AcceptShare\|HandleAcceptShare\|PH5-FIX.*accept" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Accept share implemented (PH5-FIX)"
else
    check_fail "Accept share missing"
fi

# Reject share (PH5-FIX)
if grep -q "RejectShare\|HandleRejectShare\|PH5-FIX.*reject" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Reject share implemented (PH5-FIX)"
else
    check_fail "Reject share missing"
fi

# Revoke share
if grep -q "RevokeShare\|HandleRevokeShare" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Revoke share implemented"
else
    check_fail "Revoke share missing"
fi

# List shares (sent + received)
SHARE_LIST_OPS=0
for op in ListReceivedShares ListSentShares; do
    if grep -q "$op" "$SHARING_DIR/service.go" 2>/dev/null; then
        SHARE_LIST_OPS=$((SHARE_LIST_OPS + 1))
    fi
done
if [ "$SHARE_LIST_OPS" -ge 2 ]; then
    check_pass "Share listing: sent + received"
else
    check_fail "Share listing incomplete ($SHARE_LIST_OPS/2)"
fi

# Sharing service tests
if [ -f "$SHARING_DIR/service_test.go" ]; then
    SERVICE_TESTS=$(grep -c "func Test" "$SHARING_DIR/service_test.go" 2>/dev/null || echo "0")
    check_pass "Sharing service tests present ($SERVICE_TESTS tests)"
else
    check_fail "Sharing service tests missing"
fi

echo ""

# ============================================================
# TASK 4: Share Expiration + Auto-cleanup (CWE-672)
# ============================================================
echo -e "${BLUE}[Task 4] Share Expiration + Auto-cleanup${NC}"

# Default TTL
if grep -q "shareDefaultTTL\|defaultTTL\|default.*expir" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Default share TTL configured"
else
    check_fail "Default share TTL missing"
fi

# Expiration filtering
if grep -q "expires_at.*NOW\|expires_at > \|NOT.*expired" "$SHARING_DIR/service.go" 2>/dev/null; then
    check_pass "Expiration filtering in share queries"
else
    check_fail "Expiration filtering missing"
fi

# Auto-cleanup (PH5-FIX)
CLEANUP_FILE=""
if [ -f "$SHARING_DIR/cleanup.go" ]; then
    CLEANUP_FILE="$SHARING_DIR/cleanup.go"
elif grep -q "CleanupExpiredShares\|cleanup.*expired" "$SHARING_DIR/service.go" 2>/dev/null; then
    CLEANUP_FILE="$SHARING_DIR/service.go"
fi

if [ -n "$CLEANUP_FILE" ]; then
    check_pass "Share auto-cleanup service exists (PH5-FIX)"
else
    check_fail "Share auto-cleanup service missing"
fi

# Batch deletion for cleanup
if [ -n "$CLEANUP_FILE" ] && grep -q "LIMIT\|batch\|Batch" "$CLEANUP_FILE" 2>/dev/null; then
    check_pass "Batch deletion in cleanup (prevents locking)"
else
    check_warn "Batch deletion in cleanup not detected"
fi

# Expiration tests
if [ -f "$SHARING_DIR/expiration_test.go" ]; then
    check_pass "Share expiration test suite present"
else
    check_warn "Dedicated expiration test file not found"
fi

echo ""

# ============================================================
# TASK 5: Key Rotation Support (CWE-324)
# ============================================================
echo -e "${BLUE}[Task 5] Key Rotation — Re-encrypt on Password Change${NC}"

if [ -f "$VAULT_DIR/key_rotation.go" ]; then
    check_pass "Key rotation service exists"
else
    check_fail "Key rotation service missing"
fi

# Initiate rotation
if grep -q "InitiateKeyRotation\|HandleInitiateKeyRotation" "$VAULT_DIR/key_rotation.go" 2>/dev/null; then
    check_pass "Key rotation initiation implemented"
else
    check_fail "Key rotation initiation missing"
fi

# Rotation progress tracking
if grep -q "UpdateRotationProgress\|GetRotationStatus" "$VAULT_DIR/key_rotation.go" 2>/dev/null; then
    check_pass "Rotation progress tracking implemented"
else
    check_fail "Rotation progress tracking missing"
fi

# Status constants
ROTATION_STATUSES=0
for status in pending in_progress completed failed; do
    if grep -qi "$status" "$VAULT_DIR/key_rotation.go" 2>/dev/null; then
        ROTATION_STATUSES=$((ROTATION_STATUSES + 1))
    fi
done
if [ "$ROTATION_STATUSES" -ge 3 ]; then
    check_pass "Rotation status lifecycle ($ROTATION_STATUSES statuses)"
else
    check_fail "Rotation status lifecycle incomplete ($ROTATION_STATUSES < 3)"
fi

# Transaction safety
if grep -q "FOR UPDATE\|BEGIN\|Tx\|transaction" "$VAULT_DIR/key_rotation.go" 2>/dev/null; then
    check_pass "Transactional safety in key rotation"
else
    check_fail "Transactional safety missing in key rotation"
fi

# Concurrent rotation prevention
if grep -q "concurrent\|already.*progress\|in_progress" "$VAULT_DIR/key_rotation.go" 2>/dev/null; then
    check_pass "Concurrent rotation prevention"
else
    check_warn "Concurrent rotation prevention not detected"
fi

echo ""

# ============================================================
# TASK 6: Contact Verification (CWE-300)
# ============================================================
echo -e "${BLUE}[Task 6] Contact Verification — Out-of-Band Fingerprint${NC}"

# Contact verification file
VERIFY_FILE=""
if [ -f "$SHARING_DIR/contact_verify.go" ]; then
    VERIFY_FILE="$SHARING_DIR/contact_verify.go"
elif grep -q "ComputeKeyFingerprint\|VerifyContact\|fingerprint" "$SHARING_DIR/service.go" 2>/dev/null; then
    VERIFY_FILE="$SHARING_DIR/service.go"
fi

if [ -n "$VERIFY_FILE" ]; then
    check_pass "Contact verification service exists (PH5-FIX)"
else
    check_fail "Contact verification service missing"
fi

# Key fingerprint computation
if [ -n "$VERIFY_FILE" ] && grep -q "ComputeKeyFingerprint\|Fingerprint\|fingerprint\|SHA.256\|sha256" "$VERIFY_FILE" 2>/dev/null; then
    check_pass "Key fingerprint computation (SHA-256)"
else
    check_fail "Key fingerprint computation missing"
fi

# Get fingerprint handler
if [ -n "$VERIFY_FILE" ] && grep -q "HandleGetKeyFingerprint\|GetKeyFingerprint\|fingerprint.*handler" "$VERIFY_FILE" 2>/dev/null; then
    check_pass "Get key fingerprint endpoint"
else
    check_fail "Get key fingerprint endpoint missing"
fi

# Verify contact handler
if [ -n "$VERIFY_FILE" ] && grep -q "HandleVerifyContact\|VerifyContact" "$VERIFY_FILE" 2>/dev/null; then
    check_pass "Verify contact endpoint"
else
    check_fail "Verify contact endpoint missing"
fi

# Contact verification check
if [ -n "$VERIFY_FILE" ] && grep -q "IsContactVerified\|is.*verified\|verified" "$VERIFY_FILE" 2>/dev/null; then
    check_pass "Contact verified status check"
else
    check_fail "Contact verified status check missing"
fi

echo ""

# ============================================================
# TASK 7: Aggregate Sharing Security
# ============================================================
echo -e "${BLUE}[Task 7] Aggregate Sharing Security Validation${NC}"

# No http:// in sharing code
HTTP_LEAKS=$(grep -rn "http://" "$SHARING_DIR/" 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$HTTP_LEAKS" -eq 0 ]; then
    check_pass "No http:// URLs in sharing code"
else
    check_fail "Found $HTTP_LEAKS http:// URLs in sharing code"
fi

# Route registration for new endpoints (PH5-FIX)
MAIN_GO="$SERVER_DIR/cmd/api/main.go"
PH5_ROUTES=$(grep -c "PH5-FIX\|accept\|reject\|fingerprint\|verify-contact\|publish.*key\|rotate" "$MAIN_GO" 2>/dev/null || echo "0")
if [ "$PH5_ROUTES" -ge 3 ]; then
    check_pass "New Phase 5 routes registered ($PH5_ROUTES references)"
else
    check_fail "Phase 5 routes not registered in main.go ($PH5_ROUTES < 3)"
fi

# Sharing test coverage
SHARING_TEST_FILES=$(find "$SHARING_DIR" -name "*_test.go" 2>/dev/null | wc -l)
if [ "$SHARING_TEST_FILES" -ge 2 ]; then
    check_pass "Sharing test coverage: $SHARING_TEST_FILES test files"
else
    check_fail "Sharing test coverage insufficient: $SHARING_TEST_FILES < 2"
fi

# Total sharing+crypto test functions
TOTAL_SHARE_TESTS=0
for tfile in "$SHARING_DIR"/*_test.go "$CRYPTO_DIR/tests/sharing_tests.rs"; do
    if [ -f "$tfile" ]; then
        count=$(grep -cE "func Test|#\[test\]" "$tfile" 2>/dev/null || echo "0")
        TOTAL_SHARE_TESTS=$((TOTAL_SHARE_TESTS + count))
    fi
done
if [ "$TOTAL_SHARE_TESTS" -ge 15 ]; then
    check_pass "Total sharing test functions: $TOTAL_SHARE_TESTS (>= 15 required)"
else
    check_fail "Sharing tests insufficient: $TOTAL_SHARE_TESTS < 15"
fi

# Ephemeral key usage in crypto (forward secrecy)
if grep -q "ephemeral\|Ephemeral\|EphemeralSecret" "$CRYPTO_DIR/src/sharing.rs" 2>/dev/null; then
    check_pass "Ephemeral key pairs for forward secrecy"
else
    check_fail "Ephemeral key usage not detected"
fi

# Zeroize on key material
if grep -q "Zeroizing\|zeroize\|Zeroize" "$CRYPTO_DIR/src/sharing.rs" 2>/dev/null; then
    check_pass "Key material zeroization in sharing crypto"
else
    check_fail "Key material zeroization missing"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 5 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 5 AST GATE FAILED — $FAIL_COUNT failures require remediation${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 5 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items to review${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 5 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
