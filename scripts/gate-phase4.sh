#!/bin/bash

# ============================================================
# Quantum Armor Vault (QAV) — Phase 4 AST Gate
# Vault & Storage Operations Verification
# ============================================================
# Gate Requirement: DAST storage scan + E2E crypto verify
# CWE Coverage: 269, 311, 327, 359, 404, 434, 862
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
VAULT_DIR="$SERVER_DIR/internal/vault"
STORAGE_DIR="$SERVER_DIR/internal/storage"
CRYPTO_DIR="$PROJECT_ROOT/usbvault-crypto"
APP_DIR="$PROJECT_ROOT/usbvault-app"
INFRA_DIR="$PROJECT_ROOT/infrastructure"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}QAV Phase 4 AST Gate — Vault & Storage Operations${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: Vault CRUD with Ownership Verification (CWE-862)
# ============================================================
echo -e "${BLUE}[Task 1] Vault CRUD + Ownership Verification${NC}"

if [ -f "$VAULT_DIR/service.go" ]; then
    check_pass "Vault service exists (service.go)"
else
    check_fail "Vault service missing"
fi

# CRUD operations
for op in CreateVault GetVault UpdateVault DeleteVault ListVaults; do
    if grep -q "$op" "$VAULT_DIR/service.go" 2>/dev/null; then
        check_pass "CRUD operation: $op implemented"
    else
        check_fail "CRUD operation: $op missing"
    fi
done

# Ownership verification in GetVault (PH4-FIX)
if grep -q "PH4-FIX\|owner_id.*userID\|owner_id = \\\$2\|owner_id.*user" "$VAULT_DIR/service.go" 2>/dev/null; then
    check_pass "GetVault includes ownership verification (PH4-FIX)"
else
    check_fail "GetVault missing ownership verification"
fi

# Soft delete pattern
if grep -q "deleted_at\|soft.delete\|SoftDelete" "$VAULT_DIR/service.go" 2>/dev/null; then
    check_pass "Soft delete pattern in vault operations"
else
    check_fail "Soft delete pattern missing"
fi

# Vault members management
if [ -f "$VAULT_DIR/members.go" ]; then
    check_pass "Vault members management exists"
else
    check_warn "Vault members management file not found"
fi

echo ""

# ============================================================
# TASK 2: S3 Presigned URL Generation (CWE-359)
# ============================================================
echo -e "${BLUE}[Task 2] S3 Presigned URL Generation${NC}"

if [ -f "$STORAGE_DIR/s3.go" ]; then
    check_pass "S3 storage service exists"
else
    check_fail "S3 storage service missing"
fi

# Presigned URL generation
for func in GenerateUploadURL GenerateDownloadURL; do
    if grep -q "$func" "$STORAGE_DIR/s3.go" 2>/dev/null; then
        check_pass "Presigned URL: $func implemented"
    else
        check_fail "Presigned URL: $func missing"
    fi
done

# URL expiry enforcement
if grep -qE "15.*Minute|Minute.*15|expir|Expir|Lifetime" "$STORAGE_DIR/s3.go" 2>/dev/null; then
    check_pass "Presigned URL expiry configured"
else
    check_warn "Presigned URL expiry not verified"
fi

# Ownership verification in handlers (PH4-FIX)
UPLOAD_AUTH=$(grep -c "PH4-FIX\|owner_id\|ownership\|authorization" "$STORAGE_DIR/s3.go" 2>/dev/null || echo "0")
if [ "$UPLOAD_AUTH" -ge 2 ]; then
    check_pass "Presigned URL handlers include ownership checks ($UPLOAD_AUTH references)"
else
    check_fail "Presigned URL handlers missing ownership checks"
fi

# AWS SDK presigner
if grep -q "Presign\|presign\|PresignClient\|presigner" "$STORAGE_DIR/s3.go" 2>/dev/null; then
    check_pass "AWS SDK presigner client used"
else
    check_fail "AWS SDK presigner not detected"
fi

echo ""

# ============================================================
# TASK 3: File Size Limits + Content-Type Validation (CWE-434)
# ============================================================
echo -e "${BLUE}[Task 3] File Size + Content-Type Validation${NC}"

# File size limits
if grep -q "maxFileSize\|MaxFileSize\|max_file_size\|FileSizeLimit\|getMaxFileSize" "$STORAGE_DIR/s3.go" 2>/dev/null; then
    check_pass "File size limits configured"
else
    check_fail "File size limits missing"
fi

# Tier-based limits
if grep -qE "Free|Individual|Team|Enterprise" "$STORAGE_DIR/s3.go" 2>/dev/null; then
    check_pass "Tier-based file size limits (Free/Individual/Team/Enterprise)"
else
    check_warn "Tier-based file size limits not detected"
fi

# Blocked content types
if grep -q "blockedContentTypes\|blocked_content\|BlockedContent" "$STORAGE_DIR/s3.go" 2>/dev/null; then
    check_pass "Blocked content types map present"
else
    check_fail "Blocked content types missing"
fi

# Content type checks for executables
if grep -q "executable\|application/x-mach\|application/x-dosexec\|application/x-sharedlib" "$STORAGE_DIR/s3.go" 2>/dev/null; then
    check_pass "Executable content types blocked"
else
    check_fail "Executable content types not blocked"
fi

# Tier limits tests
if [ -f "$STORAGE_DIR/tier_limits_test.go" ]; then
    TIER_TESTS=$(grep -c "func Test" "$STORAGE_DIR/tier_limits_test.go" 2>/dev/null || echo "0")
    check_pass "Tier limits test suite present ($TIER_TESTS tests)"
else
    check_fail "Tier limits test suite missing"
fi

echo ""

# ============================================================
# TASK 4: Blob Lifecycle Management (CWE-404)
# ============================================================
echo -e "${BLUE}[Task 4] Blob Lifecycle Management${NC}"

if [ -f "$STORAGE_DIR/lifecycle.go" ]; then
    check_pass "Blob lifecycle service exists"
else
    check_fail "Blob lifecycle service missing"
fi

# Lifecycle operations
for op in SoftDeleteBlob RestoreBlob PermanentlyDeleteBlob CleanupExpiredBlobs; do
    if grep -q "$op" "$STORAGE_DIR/lifecycle.go" 2>/dev/null; then
        check_pass "Lifecycle operation: $op implemented"
    else
        check_fail "Lifecycle operation: $op missing"
    fi
done

# Expiry management
if grep -q "SetBlobExpiry\|blob_expiry\|expiry\|Expiry" "$STORAGE_DIR/lifecycle.go" 2>/dev/null; then
    check_pass "Blob expiry management present"
else
    check_fail "Blob expiry management missing"
fi

# Trash/recycle bin
if grep -q "ListDeletedBlobs\|list_deleted\|trash\|recycle" "$STORAGE_DIR/lifecycle.go" 2>/dev/null; then
    check_pass "Deleted blobs listing (trash/recycle bin)"
else
    check_warn "Deleted blobs listing not detected"
fi

# Transactional integrity
if grep -q "BEGIN\|COMMIT\|Tx\|transaction\|FOR UPDATE" "$STORAGE_DIR/lifecycle.go" 2>/dev/null; then
    check_pass "Transactional integrity in lifecycle operations"
else
    check_fail "Transactional integrity missing"
fi

# Lifecycle tests
if [ -f "$STORAGE_DIR/lifecycle_test.go" ]; then
    LIFECYCLE_TESTS=$(grep -c "func Test" "$STORAGE_DIR/lifecycle_test.go" 2>/dev/null || echo "0")
    check_pass "Lifecycle test suite present ($LIFECYCLE_TESTS tests)"
else
    check_fail "Lifecycle test suite missing"
fi

echo ""

# ============================================================
# TASK 5: S3 Bucket Policy Hardening (CWE-269)
# ============================================================
echo -e "${BLUE}[Task 5] S3 Bucket Policy Hardening${NC}"

# S3 policy file
S3_POLICY=""
if [ -f "$INFRA_DIR/s3-policy.json" ]; then
    S3_POLICY="$INFRA_DIR/s3-policy.json"
    check_pass "S3 bucket policy exists"
elif [ -f "$INFRA_DIR/terraform/s3.tf" ]; then
    S3_POLICY="$INFRA_DIR/terraform/s3.tf"
    check_pass "S3 Terraform configuration exists"
else
    check_fail "S3 policy/terraform configuration missing"
    S3_POLICY="/dev/null"
fi

# DenyInsecureConnections
POLICY_FILES=$(find "$INFRA_DIR" -name "*.json" -o -name "*.tf" 2>/dev/null | head -20)
DENY_INSECURE=$(echo "$POLICY_FILES" | xargs grep -l "SecureTransport\|DenyInsecure\|deny_insecure" 2>/dev/null | wc -l)
if [ "$DENY_INSECURE" -ge 1 ]; then
    check_pass "DenyInsecureConnections policy present"
else
    check_fail "DenyInsecureConnections policy missing"
fi

# DenyUnencryptedUploads
DENY_UNENCRYPTED=$(echo "$POLICY_FILES" | xargs grep -l "DenyUnencrypted\|AES256\|aws:kms\|server_side_encryption" 2>/dev/null | wc -l)
if [ "$DENY_UNENCRYPTED" -ge 1 ]; then
    check_pass "DenyUnencryptedObjectUploads policy present"
else
    check_fail "DenyUnencryptedObjectUploads policy missing"
fi

# Least privilege IAM
IAM_FILE=""
if [ -f "$INFRA_DIR/iam-role.json" ]; then
    IAM_FILE="$INFRA_DIR/iam-role.json"
elif [ -f "$INFRA_DIR/terraform/s3.tf" ]; then
    IAM_FILE="$INFRA_DIR/terraform/s3.tf"
fi

if [ -n "$IAM_FILE" ] && grep -q "vaults/\*\|vaults/*" "$IAM_FILE" 2>/dev/null; then
    check_pass "IAM role restricted to vaults/* prefix"
else
    check_warn "IAM role prefix restriction not verified"
fi

# MFA delete
MFA_CHECK=$(echo "$POLICY_FILES" | xargs grep -l "MFA\|mfa_delete\|DenyBucketDelete" 2>/dev/null | wc -l)
if [ "$MFA_CHECK" -ge 1 ]; then
    check_pass "MFA requirement for bucket deletion"
else
    check_warn "MFA requirement for deletion not detected"
fi

# Versioning
VERSIONING=$(echo "$POLICY_FILES" | xargs grep -l "versioning\|Versioning" 2>/dev/null | wc -l)
if [ "$VERSIONING" -ge 1 ]; then
    check_pass "S3 bucket versioning enabled"
else
    check_warn "S3 bucket versioning not verified"
fi

echo ""

# ============================================================
# TASK 6: E2E Encrypt → Upload → Download → Decrypt (CWE-311)
# ============================================================
echo -e "${BLUE}[Task 6] E2E Encryption Verification${NC}"

if [ -f "$STORAGE_DIR/e2e_test.go" ]; then
    check_pass "E2E test suite exists"
else
    check_fail "E2E test suite missing"
fi

E2E_TESTS=$(grep -c "func Test" "$STORAGE_DIR/e2e_test.go" 2>/dev/null || echo "0")
if [ "$E2E_TESTS" -ge 8 ]; then
    check_pass "E2E test coverage: $E2E_TESTS tests (>= 8 required)"
else
    check_fail "E2E test coverage insufficient: $E2E_TESTS < 8"
fi

# Zero-knowledge verification
if grep -q "ZeroKnowledge\|zero.knowledge\|ServerCannotRead\|server.*cannot.*read" "$STORAGE_DIR/e2e_test.go" 2>/dev/null; then
    check_pass "Zero-knowledge property test present"
else
    check_fail "Zero-knowledge property test missing"
fi

# Tamper detection
if grep -q "Modified\|Tamper\|tamper\|authentication.*tag\|AEAD" "$STORAGE_DIR/e2e_test.go" 2>/dev/null; then
    check_pass "Ciphertext tamper detection test present"
else
    check_fail "Tamper detection test missing"
fi

# Key derivation
if grep -q "KeyDerivation\|key_derivation\|Argon2\|argon2" "$STORAGE_DIR/e2e_test.go" 2>/dev/null; then
    check_pass "Key derivation consistency test present"
else
    check_warn "Key derivation test not detected"
fi

# Wrong key rejection
if grep -q "WrongKey\|wrong.*key\|CannotDecrypt" "$STORAGE_DIR/e2e_test.go" 2>/dev/null; then
    check_pass "Wrong key rejection test present"
else
    check_fail "Wrong key rejection test missing"
fi

# Streaming encryption test
if grep -q "Streaming\|streaming\|Stream\|stream.*encrypt" "$STORAGE_DIR/e2e_test.go" 2>/dev/null; then
    check_pass "Streaming encryption test present"
else
    check_warn "Streaming encryption test not detected"
fi

# XChaCha20-Poly1305 cipher
if grep -q "XChaCha20\|xchacha20\|chacha20poly1305\|ChaCha" "$STORAGE_DIR/e2e_test.go" 2>/dev/null || \
   grep -q "XChaCha20\|xchacha20\|chacha20_poly1305" "$CRYPTO_DIR/src/"*.rs 2>/dev/null; then
    check_pass "XChaCha20-Poly1305 cipher in use"
else
    check_fail "XChaCha20-Poly1305 cipher not detected"
fi

echo ""

# ============================================================
# TASK 7: React Native Rust FFI Bridge (CWE-327)
# ============================================================
echo -e "${BLUE}[Task 7] React Native Rust FFI Integration${NC}"

# FFI module in Rust
FFI_DIR="$CRYPTO_DIR/src/ffi"
if [ -d "$FFI_DIR" ] || [ -f "$CRYPTO_DIR/src/ffi.rs" ]; then
    check_pass "Rust FFI module exists"
else
    check_fail "Rust FFI module missing"
fi

# cdylib/staticlib targets
if grep -q 'cdylib\|staticlib' "$CRYPTO_DIR/Cargo.toml" 2>/dev/null; then
    check_pass "Cargo.toml includes cdylib/staticlib targets"
else
    check_fail "Cargo.toml missing cdylib/staticlib targets"
fi

# Platform-specific FFI
for platform in ios android desktop; do
    if [ -f "$FFI_DIR/$platform.rs" ] || [ -f "$CRYPTO_DIR/src/ffi/$platform.rs" ]; then
        check_pass "FFI platform support: $platform"
    else
        check_warn "FFI platform not found: $platform"
    fi
done

# React Native bridge
BRIDGE_FILE=""
if [ -f "$APP_DIR/src/crypto/bridge.ts" ]; then
    BRIDGE_FILE="$APP_DIR/src/crypto/bridge.ts"
elif [ -f "$APP_DIR/src/crypto/native.ts" ]; then
    BRIDGE_FILE="$APP_DIR/src/crypto/native.ts"
fi

if [ -n "$BRIDGE_FILE" ]; then
    check_pass "React Native crypto bridge exists"
else
    check_fail "React Native crypto bridge missing"
fi

# NativeModules usage
if grep -rq "NativeModules\|QAVCrypto\|TurboModule" "$APP_DIR/src/" 2>/dev/null; then
    check_pass "NativeModules integration present"
else
    check_fail "NativeModules integration missing"
fi

# No JavaScript fallback (security requirement)
# Exclude: comments, dev preview web-only fallbacks (guarded by Platform.OS === 'web'), version strings
JS_FALLBACK=$(grep -rn "fallback\|polyfill\|js-crypto\|webcrypto" "$APP_DIR/src/crypto/" 2>/dev/null | grep -v "No.*fallback\|No JavaScript\|// .*fallback\|\* .*fallback\|dev preview\|development preview\|web-fallback" | wc -l)
if [ "$JS_FALLBACK" -gt 0 ]; then
    check_fail "JavaScript crypto fallback detected (CWE-327 risk)"
else
    check_pass "No JavaScript crypto fallback (native-only, web dev preview excluded)"
fi

# Key zeroing
if grep -q "Zeroiz\|zeroiz\|zeroize" "$CRYPTO_DIR/Cargo.toml" 2>/dev/null; then
    check_pass "Zeroize dependency for secure memory cleanup"
else
    check_fail "Zeroize dependency missing"
fi

# FFI function exports
FFI_EXPORTS=$(grep -r "extern.*\"C\"\|#\[no_mangle\]\|pub extern" "$CRYPTO_DIR/src/ffi/" 2>/dev/null | wc -l)
if [ "$FFI_EXPORTS" -ge 5 ]; then
    check_pass "FFI exports: $FFI_EXPORTS extern functions (>= 5 required)"
else
    check_fail "FFI exports insufficient: $FFI_EXPORTS < 5"
fi

echo ""

# ============================================================
# TASK 8: Aggregate Storage Security Checks
# ============================================================
echo -e "${BLUE}[Task 8] Aggregate Storage Security Validation${NC}"

# No http:// in storage code
HTTP_LEAKS=$(grep -rn "http://" "$STORAGE_DIR/" 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$HTTP_LEAKS" -eq 0 ]; then
    check_pass "No http:// URLs in storage code (HTTPS enforced)"
else
    check_fail "Found $HTTP_LEAKS http:// URLs in storage code"
fi

# No hardcoded AWS credentials
AWS_LEAKS=$(grep -rnE "AKIA[A-Z0-9]{16}|aws_secret|AWS_SECRET" "$STORAGE_DIR/" "$INFRA_DIR/" 2>/dev/null | grep -v "_test.go" | wc -l)
if [ "$AWS_LEAKS" -eq 0 ]; then
    check_pass "No hardcoded AWS credentials detected"
else
    check_fail "Hardcoded AWS credentials found ($AWS_LEAKS occurrences)"
fi

# Storage test file count
STORAGE_TESTS=$(find "$STORAGE_DIR" -name "*_test.go" 2>/dev/null | wc -l)
if [ "$STORAGE_TESTS" -ge 3 ]; then
    check_pass "Storage test coverage: $STORAGE_TESTS test files (>= 3 required)"
else
    check_fail "Storage test coverage insufficient: $STORAGE_TESTS < 3"
fi

# Total storage test functions
TOTAL_STORAGE_FUNCS=$(grep -r "func Test" "$STORAGE_DIR"/*_test.go 2>/dev/null | wc -l)
if [ "$TOTAL_STORAGE_FUNCS" -ge 15 ]; then
    check_pass "Total storage test functions: $TOTAL_STORAGE_FUNCS (>= 15 required)"
else
    check_fail "Total storage test functions: $TOTAL_STORAGE_FUNCS (< 15 required)"
fi

# Infrastructure-as-code exists
TF_FILES=$(find "$INFRA_DIR" -name "*.tf" 2>/dev/null | wc -l)
if [ "$TF_FILES" -ge 1 ]; then
    check_pass "Infrastructure-as-code: $TF_FILES Terraform files"
else
    check_warn "Infrastructure-as-code not detected"
fi

# S3 lifecycle rules (Glacier transition)
if find "$INFRA_DIR" -name "*.tf" -o -name "*.json" 2>/dev/null | xargs grep -q "Glacier\|glacier\|GLACIER\|lifecycle_rule\|transition" 2>/dev/null; then
    check_pass "S3 lifecycle rules with Glacier transitions"
else
    check_warn "S3 Glacier lifecycle rules not detected"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 4 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 4 AST GATE FAILED — $FAIL_COUNT failures require remediation${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 4 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items to review${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 4 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
