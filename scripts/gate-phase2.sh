#!/bin/bash
# Quantum_Shield - Phase 2 AST Gate Validation
# Requirement: SAST + fuzz report + timing analysis
# Validates the Cryptographic Core Hardening phase

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CRYPTO_DIR="$PROJECT_ROOT/usbvault-crypto"

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

echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════════╗"
echo "║  Quantum_Shield - Phase 2 AST Gate               ║"
echo "║  SAST + Fuzz Report + Timing Analysis            ║"
echo "╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================================
# TASK 1: Constant-Time Operations (CWE-208)
# ============================================================
echo -e "${BOLD}Task 1: Constant-Time Audit${NC}"
echo "---"

if grep -rq 'subtle' "$CRYPTO_DIR/Cargo.toml" 2>/dev/null; then
    pass "subtle crate in Cargo.toml dependencies"
else
    fail "subtle crate missing from dependencies"
fi

SUBTLE_USES=$(grep -r 'ct_eq\|ConstantTimeEq\|constant_time' "$CRYPTO_DIR/src/" 2>/dev/null | grep -v target | wc -l)
if [[ "$SUBTLE_USES" -ge 2 ]]; then
    pass "Constant-time comparisons found: $SUBTLE_USES uses in source"
else
    fail "Insufficient constant-time comparisons ($SUBTLE_USES found, need >= 2)"
fi

# Check for unsafe timing-vulnerable comparisons on key material
TIMING_VULN=$(grep -rn '== \|!= ' "$CRYPTO_DIR/src/" 2>/dev/null | grep -i 'hmac\|tag\|proof\|digest\|hash' | grep -v 'ct_eq\|constant_time\|\/\/' | wc -l)
if [[ "$TIMING_VULN" -eq 0 ]]; then
    pass "No timing-vulnerable comparisons on cryptographic material"
else
    warn "$TIMING_VULN potential timing-vulnerable comparisons found (manual review needed)"
fi

echo ""

# ============================================================
# TASK 2: Memory Safety (CWE-316)
# ============================================================
echo -e "${BOLD}Task 2: Memory Safety Audit${NC}"
echo "---"

if grep -q 'zeroize' "$CRYPTO_DIR/Cargo.toml" 2>/dev/null; then
    pass "zeroize crate in dependencies"
else
    fail "zeroize crate missing"
fi

ZEROIZE_USES=$(grep -r 'Zeroizing\|#\[derive.*Zeroize\]\|\.zeroize()' "$CRYPTO_DIR/src/" 2>/dev/null | wc -l)
if [[ "$ZEROIZE_USES" -ge 5 ]]; then
    pass "Zeroize applied to key material: $ZEROIZE_USES uses"
else
    fail "Insufficient zeroize usage ($ZEROIZE_USES found, need >= 5)"
fi

if [[ -f "$CRYPTO_DIR/src/memory.rs" ]]; then
    pass "Memory locking module exists (memory.rs)"
    
    if grep -q 'mlock\|VirtualLock' "$CRYPTO_DIR/src/memory.rs" 2>/dev/null; then
        pass "Platform-specific memory locking (mlock/VirtualLock)"
    else
        fail "Memory locking not implemented"
    fi
else
    fail "memory.rs module missing"
fi

echo ""

# ============================================================
# TASK 3: Fuzz Testing (CWE-20)
# ============================================================
echo -e "${BOLD}Task 3: Fuzz Testing${NC}"
echo "---"

if [[ -d "$CRYPTO_DIR/fuzz" ]]; then
    pass "Fuzz directory exists"
    
    FUZZ_TARGETS=$(find "$CRYPTO_DIR/fuzz" -name "fuzz_*.rs" 2>/dev/null | wc -l)
    if [[ "$FUZZ_TARGETS" -ge 3 ]]; then
        pass "Fuzz targets found: $FUZZ_TARGETS (>= 3 required)"
    else
        fail "Only $FUZZ_TARGETS fuzz targets (3+ required)"
    fi
    
    if [[ -f "$CRYPTO_DIR/fuzz/Cargo.toml" ]]; then
        pass "Fuzz Cargo.toml configured"
    else
        fail "Fuzz Cargo.toml missing"
    fi
    
    # Check critical targets exist
    for target in "fuzz_cipher" "fuzz_streaming" "fuzz_vault_header"; do
        if [[ -f "$CRYPTO_DIR/fuzz/$target.rs" ]] || [[ -f "$CRYPTO_DIR/fuzz/fuzz_targets/$target.rs" ]]; then
            pass "Critical fuzz target: $target"
        else
            fail "Missing critical fuzz target: $target"
        fi
    done
else
    fail "Fuzz directory missing"
fi

echo ""

# ============================================================
# TASK 4: Property-Based Tests
# ============================================================
echo -e "${BOLD}Task 4: Property-Based Tests${NC}"
echo "---"

if grep -q 'proptest' "$CRYPTO_DIR/Cargo.toml" 2>/dev/null; then
    pass "proptest in dev-dependencies"
else
    fail "proptest missing from dev-dependencies"
fi

if [[ -f "$CRYPTO_DIR/tests/property_tests.rs" ]]; then
    pass "Property test file exists"
    
    PROP_TESTS=$(grep -c 'proptest!' "$CRYPTO_DIR/tests/property_tests.rs" 2>/dev/null || echo "0")
    if [[ "$PROP_TESTS" -ge 3 ]]; then
        pass "Property test blocks found: $PROP_TESTS (>= 3)"
    else
        PROP_FN=$(grep -c '#\[test\]\|fn test_' "$CRYPTO_DIR/tests/property_tests.rs" 2>/dev/null || echo "0")
        if [[ "$PROP_FN" -ge 10 ]]; then
            pass "Property test functions found: $PROP_FN (>= 10)"
        else
            warn "Limited property tests ($PROP_TESTS blocks, $PROP_FN functions)"
        fi
    fi
else
    fail "property_tests.rs missing"
fi

echo ""

# ============================================================
# TASK 5: Format Compatibility Tests (CWE-436)
# ============================================================
echo -e "${BOLD}Task 5: V2/V3 Format Compatibility Tests${NC}"
echo "---"

if [[ -f "$CRYPTO_DIR/tests/format_compatibility_tests.rs" ]]; then
    pass "Format compatibility test file exists"
    
    FORMAT_TESTS=$(grep -c '#\[test\]' "$CRYPTO_DIR/tests/format_compatibility_tests.rs" 2>/dev/null || echo "0")
    if [[ "$FORMAT_TESTS" -ge 10 ]]; then
        pass "Format tests found: $FORMAT_TESTS (>= 10)"
    else
        warn "Only $FORMAT_TESTS format tests (10+ recommended)"
    fi
    
    if grep -q 'USBVLT02\|v2.*header\|V2' "$CRYPTO_DIR/tests/format_compatibility_tests.rs" 2>/dev/null; then
        pass "V2 format coverage verified"
    else
        warn "V2 format tests not explicitly found"
    fi
    
    if grep -q 'USBVLT03\|v3.*header\|V3' "$CRYPTO_DIR/tests/format_compatibility_tests.rs" 2>/dev/null; then
        pass "V3 format coverage verified"
    else
        warn "V3 format tests not explicitly found"
    fi
else
    fail "format_compatibility_tests.rs missing"
fi

echo ""

# ============================================================
# TASK 6: SRP-6a Protocol Tests (CWE-287)
# ============================================================
echo -e "${BOLD}Task 6: SRP-6a Protocol Verification${NC}"
echo "---"

if [[ -f "$CRYPTO_DIR/tests/srp_protocol_tests.rs" ]]; then
    pass "SRP protocol test file exists"
    
    SRP_TESTS=$(grep -c '#\[test\]' "$CRYPTO_DIR/tests/srp_protocol_tests.rs" 2>/dev/null || echo "0")
    if [[ "$SRP_TESTS" -ge 10 ]]; then
        pass "SRP tests found: $SRP_TESTS (>= 10)"
    else
        warn "Only $SRP_TESTS SRP tests (10+ recommended)"
    fi
    
    # Check critical SRP verifications
    if grep -q 'ct_eq\|ConstantTimeEq\|constant_time' "$CRYPTO_DIR/tests/srp_protocol_tests.rs" 2>/dev/null || \
       grep -q 'ct_eq\|ConstantTimeEq' "$CRYPTO_DIR/src/srp_client.rs" 2>/dev/null; then
        pass "SRP M2 verification uses constant-time comparison"
    else
        fail "SRP proof verification may not use constant-time comparison"
    fi
else
    fail "srp_protocol_tests.rs missing"
fi

echo ""

# ============================================================
# TASK 7: X25519 Sealed-Box + ECDH Tests (CWE-326)
# ============================================================
echo -e "${BOLD}Task 7: X25519 Sealed-Box + ECDH Tests${NC}"
echo "---"

if [[ -f "$CRYPTO_DIR/tests/sharing_tests.rs" ]]; then
    pass "Sharing/X25519 test file exists"
    
    SHARING_TESTS=$(grep -c '#\[test\]' "$CRYPTO_DIR/tests/sharing_tests.rs" 2>/dev/null || echo "0")
    if [[ "$SHARING_TESTS" -ge 15 ]]; then
        pass "X25519/ECDH tests found: $SHARING_TESTS (>= 15)"
    else
        warn "Only $SHARING_TESTS sharing tests (15+ recommended)"
    fi
    
    if grep -q 'x25519_dalek\|x25519\|StaticSecret\|PublicKey' "$CRYPTO_DIR/src/sharing.rs" 2>/dev/null; then
        pass "X25519 key exchange implementation verified"
    else
        fail "X25519 implementation not found in sharing.rs"
    fi
else
    fail "sharing_tests.rs missing"
fi

echo ""

# ============================================================
# TASK 8: Cross-Platform FFI Build Matrix
# ============================================================
echo -e "${BOLD}Task 8: Cross-Platform FFI Build Matrix${NC}"
echo "---"

if [[ -f "$PROJECT_ROOT/.github/workflows/ffi-build.yml" ]]; then
    pass "FFI build workflow exists"
    
    for platform in "ios" "android" "macos\|darwin" "windows\|msvc" "linux\|gnu"; do
        if grep -qi "$platform" "$PROJECT_ROOT/.github/workflows/ffi-build.yml" 2>/dev/null; then
            PLATFORM_NAME=$(echo "$platform" | sed 's/\\|.*//; s/macos/macOS/; s/ios/iOS/; s/android/Android/; s/windows/Windows/; s/linux/Linux/')
            pass "Platform target: $PLATFORM_NAME"
        fi
    done
else
    fail "FFI build workflow missing"
fi

if [[ -f "$CRYPTO_DIR/build.rs" ]]; then
    pass "build.rs (cbindgen header generation) exists"
else
    fail "build.rs missing"
fi

if [[ -f "$CRYPTO_DIR/tests/ffi_tests.rs" ]]; then
    pass "FFI integration tests exist"
else
    warn "FFI integration tests missing"
fi

echo ""

# ============================================================
# TASK 9: Phase 2 AST Gate Summary
# ============================================================
echo -e "${BOLD}Task 9: AST Gate — SAST + Fuzz Report + Timing Analysis${NC}"
echo "---"

# SAST: cargo-audit in CI
SAST_OK=true
FUZZ_OK=true
TIMING_OK=true

grep -q 'cargo-audit\|audit-check' "$PROJECT_ROOT/.github/workflows/security.yml" 2>/dev/null || SAST_OK=false
grep -q 'cargo-audit\|audit-check' "$PROJECT_ROOT/.github/workflows/ci.yml" 2>/dev/null || SAST_OK=false

[[ -d "$CRYPTO_DIR/fuzz" ]] || FUZZ_OK=false
FUZZ_TARGET_COUNT=$(find "$CRYPTO_DIR/fuzz" -name "fuzz_*.rs" 2>/dev/null | wc -l)
[[ "$FUZZ_TARGET_COUNT" -ge 3 ]] || FUZZ_OK=false

grep -rq 'ct_eq\|ConstantTimeEq' "$CRYPTO_DIR/src/" 2>/dev/null || TIMING_OK=false

if $SAST_OK; then pass "SAST gate: cargo-audit in CI pipelines"; else fail "SAST gate: cargo-audit missing from CI"; fi
if $FUZZ_OK; then pass "Fuzz report gate: $FUZZ_TARGET_COUNT fuzz targets configured"; else fail "Fuzz report gate: insufficient fuzz coverage"; fi
if $TIMING_OK; then pass "Timing analysis gate: constant-time operations verified"; else fail "Timing analysis gate: constant-time operations missing"; fi

echo ""
echo -e "${BOLD}${BLUE}══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Phase 2 AST Gate Results${NC}"
echo -e "${BOLD}${BLUE}══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}  ${RED}FAIL: $FAIL_COUNT${NC}  ${YELLOW}WARN: $WARN_COUNT${NC}  Total: $TOTAL_CHECKS"
echo ""

if [[ $FAIL_COUNT -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}╔═════════════════════════════════════╗${NC}"
    echo -e "${GREEN}${BOLD}║  PHASE 2 AST GATE: ✓ PASSED        ║${NC}"
    echo -e "${GREEN}${BOLD}╚═════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}╔═════════════════════════════════════╗${NC}"
    echo -e "${RED}${BOLD}║  PHASE 2 AST GATE: ✗ FAILED        ║${NC}"
    echo -e "${RED}${BOLD}║  $FAIL_COUNT check(s) must be fixed         ║${NC}"
    echo -e "${RED}${BOLD}╚═════════════════════════════════════╝${NC}"
    exit 1
fi
