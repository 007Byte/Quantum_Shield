#!/bin/bash

# ============================================================
# Quantum Armor Vault (QAV) — Phase 12 AST Gate
# Post-Quantum Cryptography & Device Trust Verification
# ============================================================
# Gate Requirement: Hybrid PQC + Device attestation + Reproducible builds
# CWE Coverage: 327 (Weak Crypto), 330 (Random), 345 (Auth), 693 (Bypass)
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CRYPTO_DIR="$PROJECT_ROOT/usbvault-crypto"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
APP_DIR="$PROJECT_ROOT/usbvault-app"
PQC_DIR="$CRYPTO_DIR/src/pqc"
FFI_DIR="$CRYPTO_DIR/src/ffi"
DEVICE_DIR="$SERVER_DIR/internal/device"
SVC_DIR="$APP_DIR/src/services"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}QAV Phase 12 AST Gate — Post-Quantum & Device Trust${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: ML-KEM-1024 Implementation (FIPS 203)
# ============================================================
echo -e "${BLUE}[Task 1] ML-KEM-1024 Implementation (FIPS 203)${NC}"

# ML-KEM module exists
if [ -f "$PQC_DIR/ml_kem.rs" ]; then
    check_pass "ML-KEM-1024 module exists"
else
    check_fail "ML-KEM-1024 module missing"
fi

# ML-KEM generate_keypair
if grep -q "generate_keypair" "$PQC_DIR/ml_kem.rs" 2>/dev/null; then
    check_pass "ML-KEM keypair generation function"
else
    check_fail "ML-KEM keypair generation missing"
fi

# ML-KEM encapsulate
if grep -q "fn encapsulate" "$PQC_DIR/ml_kem.rs" 2>/dev/null; then
    check_pass "ML-KEM encapsulation function"
else
    check_fail "ML-KEM encapsulation missing"
fi

# ML-KEM decapsulate
if grep -q "fn decapsulate" "$PQC_DIR/ml_kem.rs" 2>/dev/null; then
    check_pass "ML-KEM decapsulation function"
else
    check_fail "ML-KEM decapsulation missing"
fi

# ML-KEM key sizes
if grep -q "PUBLIC_KEY_SIZE.*1568" "$PQC_DIR/ml_kem.rs" 2>/dev/null; then
    check_pass "ML-KEM-1024 key size constants (1568 bytes)"
else
    check_fail "ML-KEM key size constants missing"
fi

# ML-KEM Cargo.toml dependency
if grep -q "ml-kem" "$CRYPTO_DIR/Cargo.toml" 2>/dev/null; then
    check_pass "ml-kem crate dependency in Cargo.toml"
else
    check_fail "ml-kem crate dependency missing"
fi

# PQC feature flag
if grep -q 'pqc.*=.*\["ml-kem"\]' "$CRYPTO_DIR/Cargo.toml" 2>/dev/null; then
    check_pass "PQC feature flag with ml-kem dependency"
else
    check_fail "PQC feature flag missing"
fi

# ML-KEM tests
ML_KEM_TESTS=$(grep -c "#\[test\]" "$PQC_DIR/ml_kem.rs" 2>/dev/null || echo "0")
if [ "$ML_KEM_TESTS" -ge 3 ]; then
    check_pass "ML-KEM unit tests: $ML_KEM_TESTS tests"
else
    check_fail "ML-KEM tests insufficient ($ML_KEM_TESTS < 3)"
fi

echo ""

# ============================================================
# TASK 2: Hybrid X25519 + ML-KEM-1024 Sealed Box
# ============================================================
echo -e "${BLUE}[Task 2] Hybrid X25519 + ML-KEM-1024 Sealed Box${NC}"

# Hybrid module exists
if [ -f "$PQC_DIR/hybrid.rs" ]; then
    check_pass "Hybrid PQC module exists"
else
    check_fail "Hybrid PQC module missing"
fi

# HybridPublicKey struct
if grep -q "HybridPublicKey" "$PQC_DIR/hybrid.rs" 2>/dev/null; then
    check_pass "HybridPublicKey struct (X25519 + ML-KEM)"
else
    check_fail "HybridPublicKey missing"
fi

# HybridSecretKey struct with zeroize
if grep -q "HybridSecretKey" "$PQC_DIR/hybrid.rs" 2>/dev/null && grep -q "zeroize" "$PQC_DIR/hybrid.rs" 2>/dev/null; then
    check_pass "HybridSecretKey with zeroize protection"
else
    check_fail "HybridSecretKey or zeroize missing"
fi

# hybrid_seal function
if grep -q "fn hybrid_seal" "$PQC_DIR/hybrid.rs" 2>/dev/null; then
    check_pass "hybrid_seal encryption function"
else
    check_fail "hybrid_seal missing"
fi

# hybrid_open function
if grep -q "fn hybrid_open" "$PQC_DIR/hybrid.rs" 2>/dev/null; then
    check_pass "hybrid_open decryption function"
else
    check_fail "hybrid_open missing"
fi

# HKDF shared secret combination
if grep -q "combine_shared_secrets\|HKDF\|hkdf\|derive_subkey" "$PQC_DIR/hybrid.rs" 2>/dev/null; then
    check_pass "HKDF shared secret combination (X25519 || ML-KEM)"
else
    check_fail "HKDF secret combination missing"
fi

# XChaCha20-Poly1305 AEAD
if grep -q "XChaCha20Poly1305" "$PQC_DIR/hybrid.rs" 2>/dev/null; then
    check_pass "XChaCha20-Poly1305 AEAD in hybrid seal"
else
    check_fail "AEAD cipher missing in hybrid module"
fi

# Hybrid tests
HYBRID_TESTS=$(grep -c "#\[test\]" "$PQC_DIR/hybrid.rs" 2>/dev/null || echo "0")
if [ "$HYBRID_TESTS" -ge 5 ]; then
    check_pass "Hybrid unit tests: $HYBRID_TESTS tests"
else
    check_fail "Hybrid tests insufficient ($HYBRID_TESTS < 5)"
fi

# Tamper detection test
if grep -q "tampered\|tamper" "$PQC_DIR/hybrid.rs" 2>/dev/null; then
    check_pass "Tamper detection test present"
else
    check_warn "No tamper detection test found"
fi

echo ""

# ============================================================
# TASK 3: PQC FFI Exports (Rust → React Native)
# ============================================================
echo -e "${BLUE}[Task 3] PQC FFI Exports${NC}"

# qav_pqc_generate_keypair
if grep -q "qav_pqc_generate_keypair" "$FFI_DIR/mod.rs" 2>/dev/null; then
    check_pass "FFI: qav_pqc_generate_keypair export"
else
    check_fail "FFI: PQC keypair generation export missing"
fi

# qav_pqc_seal
if grep -q "qav_pqc_seal" "$FFI_DIR/mod.rs" 2>/dev/null; then
    check_pass "FFI: qav_pqc_seal export"
else
    check_fail "FFI: PQC seal export missing"
fi

# qav_pqc_open
if grep -q "qav_pqc_open" "$FFI_DIR/mod.rs" 2>/dev/null; then
    check_pass "FFI: qav_pqc_open export"
else
    check_fail "FFI: PQC open export missing"
fi

# Feature gated (#[cfg(feature = "pqc")])
PQC_GATES=$(grep -c 'cfg.*feature.*pqc' "$FFI_DIR/mod.rs" 2>/dev/null || echo "0")
if [ "$PQC_GATES" -ge 3 ]; then
    check_pass "FFI: PQC exports are feature-gated ($PQC_GATES gates)"
else
    check_fail "FFI: PQC exports not properly feature-gated"
fi

# Stub fallbacks for non-PQC builds
if grep -q 'cfg.*not.*feature.*pqc' "$FFI_DIR/mod.rs" 2>/dev/null; then
    check_pass "FFI: Stub fallbacks for non-PQC builds"
else
    check_fail "FFI: No stub fallbacks"
fi

echo ""

# ============================================================
# TASK 4: TypeScript PQC Client Service
# ============================================================
echo -e "${BLUE}[Task 4] TypeScript PQC Client Service${NC}"

# pqcService.ts exists
if [ -f "$SVC_DIR/pqcService.ts" ]; then
    check_pass "PQC client service exists (PH9-PQ-FIX)"
else
    check_fail "PQC client service missing"
fi

# HybridPublicKey type
if grep -q "HybridPublicKey" "$SVC_DIR/pqcService.ts" 2>/dev/null; then
    check_pass "HybridPublicKey TypeScript interface"
else
    check_fail "HybridPublicKey interface missing"
fi

# HybridSecretKey type
if grep -q "HybridSecretKey" "$SVC_DIR/pqcService.ts" 2>/dev/null; then
    check_pass "HybridSecretKey TypeScript interface"
else
    check_fail "HybridSecretKey interface missing"
fi

# generateHybridKeypair function
if grep -q "generateHybridKeypair" "$SVC_DIR/pqcService.ts" 2>/dev/null; then
    check_pass "generateHybridKeypair client function"
else
    check_fail "generateHybridKeypair missing"
fi

# hybridSeal function
if grep -q "hybridSeal" "$SVC_DIR/pqcService.ts" 2>/dev/null; then
    check_pass "hybridSeal client function"
else
    check_fail "hybridSeal missing"
fi

# hybridOpen function
if grep -q "hybridOpen" "$SVC_DIR/pqcService.ts" 2>/dev/null; then
    check_pass "hybridOpen client function"
else
    check_fail "hybridOpen missing"
fi

# isPQCAvailable check
if grep -q "isPQCAvailable" "$SVC_DIR/pqcService.ts" 2>/dev/null; then
    check_pass "PQC availability check function"
else
    check_fail "PQC availability check missing"
fi

# Audit logging for PQC operations
if grep -q "auditService.log" "$SVC_DIR/pqcService.ts" 2>/dev/null; then
    check_pass "Audit logging for PQC operations"
else
    check_fail "PQC audit logging missing"
fi

echo ""

# ============================================================
# TASK 5: Device Attestation (App Attest + Play Integrity)
# ============================================================
echo -e "${BLUE}[Task 5] Device Attestation${NC}"

# Attestation service exists
if [ -f "$DEVICE_DIR/attestation.go" ]; then
    check_pass "Device attestation service exists (PH9-PQ-FIX)"
else
    check_fail "Device attestation service missing"
fi

# iOS App Attest verification
if grep -q "VerifyAppAttest\|AppAttest\|app_attest" "$DEVICE_DIR/attestation.go" 2>/dev/null; then
    check_pass "iOS App Attest verification"
else
    check_fail "App Attest verification missing"
fi

# Android Play Integrity verification
if grep -q "VerifyPlayIntegrity\|PlayIntegrity\|play_integrity" "$DEVICE_DIR/attestation.go" 2>/dev/null; then
    check_pass "Android Play Integrity verification"
else
    check_fail "Play Integrity verification missing"
fi

# Attestation result struct
if grep -q "AttestationResult" "$DEVICE_DIR/attestation.go" 2>/dev/null; then
    check_pass "AttestationResult struct with risk level"
else
    check_fail "AttestationResult struct missing"
fi

# Attestation TTL / expiration
if grep -q "AttestationTTL\|expires_at\|ExpiresAt" "$DEVICE_DIR/attestation.go" 2>/dev/null; then
    check_pass "Attestation expiration (TTL)"
else
    check_fail "Attestation TTL missing"
fi

# RequireAttestation middleware
if grep -q "RequireAttestation" "$DEVICE_DIR/attestation.go" 2>/dev/null; then
    check_pass "RequireAttestation middleware"
else
    check_fail "RequireAttestation middleware missing"
fi

# Device enrollment service
if [ -f "$DEVICE_DIR/service.go" ]; then
    check_pass "Device enrollment service exists"
else
    check_fail "Device enrollment service missing"
fi

# EnrollDevice + VerifyDevice + RevokeDevice
DEVICE_OPS=0
for op in "EnrollDevice" "VerifyDevice" "RevokeDevice" "TrustDevice"; do
    if grep -q "$op" "$DEVICE_DIR/service.go" 2>/dev/null; then
        DEVICE_OPS=$((DEVICE_OPS + 1))
    fi
done
if [ "$DEVICE_OPS" -ge 4 ]; then
    check_pass "Device lifecycle: $DEVICE_OPS operations (enroll/verify/revoke/trust)"
else
    check_fail "Device lifecycle operations insufficient ($DEVICE_OPS < 4)"
fi

echo ""

# ============================================================
# TASK 6: Reproducible Builds
# ============================================================
echo -e "${BLUE}[Task 6] Reproducible Builds${NC}"

# Reproducible build script
if [ -f "$PROJECT_ROOT/scripts/reproducible-build.sh" ]; then
    check_pass "Reproducible build script exists (PH9-PQ-FIX)"
else
    check_fail "Reproducible build script missing"
fi

# SOURCE_DATE_EPOCH support
if grep -q "SOURCE_DATE_EPOCH" "$PROJECT_ROOT/scripts/reproducible-build.sh" 2>/dev/null; then
    check_pass "SOURCE_DATE_EPOCH deterministic timestamp"
else
    check_fail "SOURCE_DATE_EPOCH support missing"
fi

# SHA-256 checksum generation
if grep -q "sha256sum\|sha256\|SHA-256" "$PROJECT_ROOT/scripts/reproducible-build.sh" 2>/dev/null; then
    check_pass "SHA-256 build artifact checksums"
else
    check_fail "SHA-256 checksums missing"
fi

# Build manifest generation
if grep -q "build.manifest\|build_manifest\|MANIFEST" "$PROJECT_ROOT/scripts/reproducible-build.sh" 2>/dev/null; then
    check_pass "Build manifest generation"
else
    check_fail "Build manifest missing"
fi

# Locked dependencies
if grep -q "locked\|--frozen\|npm ci" "$PROJECT_ROOT/scripts/reproducible-build.sh" 2>/dev/null; then
    check_pass "Locked dependency installation"
else
    check_fail "Dependency locking missing"
fi

# Cargo.lock exists
if [ -f "$CRYPTO_DIR/Cargo.lock" ]; then
    check_pass "Cargo.lock present (pinned Rust deps)"
else
    check_warn "Cargo.lock missing"
fi

echo ""

# ============================================================
# TASK 7: Aggregate PQ & Device Trust Validation
# ============================================================
echo -e "${BLUE}[Task 7] Aggregate Validation${NC}"

# PH9-PQ-FIX references
PQ_REFS=$(grep -rc "PH9-PQ-FIX" "$PQC_DIR/" "$FFI_DIR/mod.rs" "$DEVICE_DIR/" "$SVC_DIR/pqcService.ts" "$PROJECT_ROOT/scripts/reproducible-build.sh" 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
if [ "$PQ_REFS" -ge 5 ]; then
    check_pass "PH9-PQ-FIX tagged implementations ($PQ_REFS references)"
else
    check_fail "PH9-PQ-FIX references insufficient ($PQ_REFS < 5)"
fi

# Total PQC test count
RUST_PQC_TESTS=$(grep -c "#\[test\]" "$PQC_DIR/ml_kem.rs" 2>/dev/null || echo "0")
RUST_PQC_TESTS=$((RUST_PQC_TESTS + $(grep -c "#\[test\]" "$PQC_DIR/hybrid.rs" 2>/dev/null || echo "0")))
if [ "$RUST_PQC_TESTS" -ge 10 ]; then
    check_pass "PQC Rust tests: $RUST_PQC_TESTS (>= 10)"
else
    check_fail "PQC Rust tests insufficient ($RUST_PQC_TESTS < 10)"
fi

# QR enrollment service
if [ -f "$SVC_DIR/enterpriseQRService.ts" ]; then
    check_pass "Enterprise QR enrollment service exists"
else
    check_fail "QR enrollment service missing"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 12 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 12 AST GATE FAILED — $FAIL_COUNT failures${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 12 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 12 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
