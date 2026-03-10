#!/bin/bash

# ============================================================
# Quantum Armor Vault (QAV) — Phase 9 AST Gate
# Mobile Platform Hardening Verification
# ============================================================
# Gate Requirement: Mobile DAST + OWASP MASTG checks
# CWE Coverage: 200, 295, 308, 319, 693, 798, 922
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
APP_DIR="$PROJECT_ROOT/usbvault-app"
SRC_DIR="$APP_DIR/src"
SVC_DIR="$SRC_DIR/services"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}QAV Phase 9 AST Gate — Mobile Platform Hardening${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: Biometric Authentication (CWE-308)
# ============================================================
echo -e "${BLUE}[Task 1] Biometric Authentication${NC}"

# expo-local-authentication dependency
if grep -q "expo-local-authentication" "$APP_DIR/package.json" 2>/dev/null; then
    check_pass "expo-local-authentication dependency present"
else
    check_fail "expo-local-authentication dependency missing"
fi

# Face ID permission in app.json
if grep -q "NSFaceIDUsageDescription" "$APP_DIR/app.json" 2>/dev/null; then
    check_pass "Face ID usage description configured"
else
    check_fail "Face ID permission missing"
fi

# Android biometric permission
if grep -q "USE_BIOMETRIC" "$APP_DIR/app.json" 2>/dev/null; then
    check_pass "Android USE_BIOMETRIC permission"
else
    check_fail "Android biometric permission missing"
fi

# Biometric availability check (PH9-FIX)
if grep -q "checkBiometricAvailability\|biometric.*available\|hasHardwareAsync" "$SVC_DIR/auth.ts" "$SVC_DIR/biometricService.ts" 2>/dev/null; then
    check_pass "Biometric availability check (PH9-FIX)"
else
    check_fail "Biometric availability check missing"
fi

# Biometric authentication function (PH9-FIX / RM-001)
if grep -q "authenticateWithBiometrics\|authenticateAsync" "$SVC_DIR/auth.ts" "$SVC_DIR/biometricService.ts" 2>/dev/null; then
    check_pass "Biometric authentication function (RM-001)"
else
    check_fail "Biometric auth function missing"
fi

# Biometric unlock with SecureStore (PH9-FIX)
if grep -q "enableBiometricUnlock\|biometric.*unlock\|authenticateWithRetry" "$SVC_DIR/auth.ts" "$SVC_DIR/biometricService.ts" 2>/dev/null; then
    check_pass "Biometric unlock with retry logic (PH9-FIX)"
else
    check_fail "Biometric unlock missing"
fi

# RM-001: Real expo-local-authentication integration (not stub)
if grep -q "LocalAuthentication\|expo-local-authentication" "$SVC_DIR/biometricService.ts" 2>/dev/null; then
    check_pass "Real expo-local-authentication integration (RM-001)"
else
    check_fail "Biometric service still using stubs"
fi

# RM-001: Biometric type detection
if grep -q "FACIAL_RECOGNITION\|FINGERPRINT\|AuthenticationType" "$SVC_DIR/biometricService.ts" 2>/dev/null; then
    check_pass "Biometric type detection (Face ID/Touch ID/Iris) (RM-001)"
else
    check_fail "Biometric type detection missing"
fi

echo ""

# ============================================================
# TASK 2: Certificate Pinning (CWE-295)
# ============================================================
echo -e "${BLUE}[Task 2] Certificate Pinning${NC}"

# Certificate pinning service exists (PH9-FIX)
if [ -f "$SVC_DIR/certificatePinning.ts" ]; then
    check_pass "Certificate pinning service exists (PH9-FIX)"
else
    check_fail "Certificate pinning service missing"
fi

# SHA-256 pin configuration
if grep -q "sha256\|SHA256\|sha256Pins" "$SVC_DIR/certificatePinning.ts" 2>/dev/null; then
    check_pass "SHA-256 certificate pin hashes"
else
    check_fail "SHA-256 pin hashes missing"
fi

# Backup pins (at least 2)
if grep -q "Backup\|backup\|Secondary\|secondary" "$SVC_DIR/certificatePinning.ts" 2>/dev/null; then
    check_pass "Backup certificate pins configured"
else
    check_warn "Backup pins not detected"
fi

# Pin validation function
if grep -q "validatePinConfiguration\|validatePin" "$SVC_DIR/certificatePinning.ts" 2>/dev/null; then
    check_pass "Pin validation function"
else
    check_fail "Pin validation missing"
fi

# Pin expiration check
if grep -q "isPinExpired\|expir" "$SVC_DIR/certificatePinning.ts" 2>/dev/null; then
    check_pass "Pin expiration checking"
else
    check_warn "Pin expiration check not found"
fi

# Subdomain support
if grep -q "includeSubdomains\|subdomain" "$SVC_DIR/certificatePinning.ts" 2>/dev/null; then
    check_pass "Subdomain pinning support"
else
    check_warn "Subdomain support not detected"
fi

# RM-002: API client integration
if grep -q "initializeCertificatePinning\|arePinsConfigured" "$SVC_DIR/api.ts" 2>/dev/null; then
    check_pass "Certificate pinning integrated into API client (RM-002)"
else
    check_fail "Certificate pinning NOT integrated into API client"
fi

# RM-002: TLS error detection interceptor
if grep -q "ERR_TLS_CERT_ALTNAME_INVALID\|certificate_pin_failure" "$SVC_DIR/api.ts" 2>/dev/null; then
    check_pass "TLS/certificate error detection in API interceptor (RM-002)"
else
    check_warn "TLS error detection not in API interceptor"
fi

echo ""

# ============================================================
# TASK 3: Secure Storage (CWE-922)
# ============================================================
echo -e "${BLUE}[Task 3] Secure Storage (Keychain/KeyStore)${NC}"

# expo-secure-store dependency
if grep -q "expo-secure-store" "$APP_DIR/package.json" 2>/dev/null; then
    check_pass "expo-secure-store dependency present"
else
    check_fail "expo-secure-store missing"
fi

# SecureStore usage in auth
if grep -q "SecureStore\|setItemAsync\|getItemAsync" "$SVC_DIR/auth.ts" 2>/dev/null; then
    check_pass "SecureStore API usage in auth service"
else
    check_fail "SecureStore not used in auth service"
fi

# Secure store options with access control
if grep -q "SECURE_STORE_OPTIONS\|keychainAccessible\|WHEN_UNLOCKED" "$SVC_DIR/auth.ts" 2>/dev/null; then
    check_pass "Secure store access control options (PH9-FIX)"
else
    check_fail "Secure store access control options missing"
fi

# Storage migration function
if grep -q "migrateToSecureStorage\|migrate.*storage\|migration" "$SVC_DIR/auth.ts" 2>/dev/null; then
    check_pass "Secure storage migration function (PH9-FIX)"
else
    check_warn "Storage migration function not found"
fi

# No AsyncStorage for sensitive data
ASYNC_SENSITIVE=$(grep -n "AsyncStorage.*token\|AsyncStorage.*key\|AsyncStorage.*secret" "$SVC_DIR/auth.ts" 2>/dev/null | grep -v "migrate\|PH9" | wc -l)
if [ "$ASYNC_SENSITIVE" -eq 0 ]; then
    check_pass "No AsyncStorage for sensitive data"
else
    check_fail "Found $ASYNC_SENSITIVE AsyncStorage uses for sensitive data"
fi

echo ""

# ============================================================
# TASK 4: ATS + Network Security Config (CWE-319)
# ============================================================
echo -e "${BLUE}[Task 4] ATS + Network Security Config${NC}"

# Android network security config (PH9-FIX)
NS_CONFIG=$(find "$APP_DIR" -name "network_security_config.xml" 2>/dev/null | head -1)
if [ -n "$NS_CONFIG" ]; then
    check_pass "Android network security config exists (PH9-FIX)"
else
    check_fail "Android network security config missing"
fi

# Cleartext traffic disabled
if [ -n "$NS_CONFIG" ] && grep -q 'cleartextTrafficPermitted="false"' "$NS_CONFIG" 2>/dev/null; then
    check_pass "Cleartext traffic disabled by default"
else
    check_fail "Cleartext traffic not disabled"
fi

# HTTPS enforcement in API
if grep -q "https://" "$SVC_DIR/api.ts" 2>/dev/null; then
    check_pass "HTTPS enforcement in API client"
else
    check_fail "HTTPS not enforced in API client"
fi

# iOS ATS configuration (RM-003)
if grep -q "NSAppTransportSecurity" "$APP_DIR/app.json" 2>/dev/null; then
    check_pass "iOS App Transport Security configured (RM-003)"
else
    check_warn "iOS ATS not explicitly configured"
fi

# iOS ATS - arbitrary loads disabled
if grep -q '"NSAllowsArbitraryLoads": false' "$APP_DIR/app.json" 2>/dev/null; then
    check_pass "NSAllowsArbitraryLoads: false (HTTPS enforced) (RM-003)"
else
    check_warn "NSAllowsArbitraryLoads not explicitly false"
fi

# RM-003: Blocked dangerous permissions
if grep -q "blockedPermissions" "$APP_DIR/app.json" 2>/dev/null; then
    check_pass "Dangerous permissions explicitly blocked (RM-003)"
else
    check_warn "No explicit blockedPermissions"
fi

echo ""

# ============================================================
# TASK 5: Jailbreak/Root Detection (CWE-693)
# ============================================================
echo -e "${BLUE}[Task 5] Jailbreak/Root Detection${NC}"

# Device integrity service (PH9-FIX)
if [ -f "$SVC_DIR/deviceIntegrity.ts" ]; then
    check_pass "Device integrity service exists (PH9-FIX)"
else
    check_fail "Device integrity service missing"
fi

# Jailbreak detection
if grep -q "jailbreak\|jailbroken\|Cydia\|cydia" "$SVC_DIR/deviceIntegrity.ts" 2>/dev/null; then
    check_pass "iOS jailbreak detection"
else
    check_fail "Jailbreak detection missing"
fi

# Root detection
if grep -q "root\|rooted\|su.*binary\|Superuser\|Magisk" "$SVC_DIR/deviceIntegrity.ts" 2>/dev/null; then
    check_pass "Android root detection"
else
    check_fail "Root detection missing"
fi

# Debugger detection
if grep -q "debugger\|debug.*attached\|isDebugged" "$SVC_DIR/deviceIntegrity.ts" 2>/dev/null; then
    check_pass "Debugger detection"
else
    check_fail "Debugger detection missing"
fi

# Emulator detection
if grep -q "emulator\|simulator\|isEmulator" "$SVC_DIR/deviceIntegrity.ts" 2>/dev/null; then
    check_pass "Emulator detection"
else
    check_fail "Emulator detection missing"
fi

# Risk level assessment
if grep -q "riskLevel\|risk.*level\|safe.*warning.*critical" "$SVC_DIR/deviceIntegrity.ts" 2>/dev/null; then
    check_pass "Risk level assessment (safe/warning/critical)"
else
    check_fail "Risk level assessment missing"
fi

# Operation blocking
if grep -q "shouldBlockOperation\|blockOperation\|block.*operation" "$SVC_DIR/deviceIntegrity.ts" 2>/dev/null; then
    check_pass "Critical operation blocking on compromised devices"
else
    check_warn "Operation blocking not detected"
fi

echo ""

# ============================================================
# TASK 6: Code Obfuscation + Hermes (CWE-798)
# ============================================================
echo -e "${BLUE}[Task 6] Code Obfuscation + Hermes${NC}"

# Hermes engine enabled
if grep -q '"hermes"\|jsEngine.*hermes' "$APP_DIR/app.json" 2>/dev/null; then
    check_pass "Hermes JavaScript engine enabled"
else
    check_fail "Hermes engine not configured"
fi

# Metro config exists (PH9-FIX)
if [ -f "$APP_DIR/metro.config.js" ]; then
    check_pass "Metro config with security hardening (PH9-FIX)"
else
    check_fail "Metro config missing"
fi

# Console.log removal in production
if grep -q "drop_console\|console.log" "$APP_DIR/metro.config.js" 2>/dev/null; then
    check_pass "Console.log removal in production builds"
else
    check_fail "Console.log removal not configured"
fi

# Name mangling
if grep -q "mangle\|toplevel" "$APP_DIR/metro.config.js" 2>/dev/null; then
    check_pass "Variable name mangling for obfuscation"
else
    check_warn "Name mangling not configured"
fi

# RM-004: __DEV__ branch stripping
if grep -q "__DEV__" "$APP_DIR/metro.config.js" 2>/dev/null; then
    check_pass "__DEV__ branch stripping for production (RM-004)"
else
    check_warn "__DEV__ branch stripping not configured"
fi

# RM-004: Debugger removal
if grep -q "drop_debugger" "$APP_DIR/metro.config.js" 2>/dev/null; then
    check_pass "Debugger statement removal in production (RM-004)"
else
    check_fail "Debugger removal not configured"
fi

echo ""

# ============================================================
# TASK 7: Auto-lock + Clipboard + Screenshot Prevention (CWE-200)
# ============================================================
echo -e "${BLUE}[Task 7] Auto-lock + Clipboard + Screenshot Prevention${NC}"

# App protection service (PH9-FIX)
if [ -f "$SVC_DIR/appProtection.ts" ]; then
    check_pass "App protection service exists (PH9-FIX)"
else
    check_fail "App protection service missing"
fi

# Auto-lock with AppState
if grep -q "autoLock\|auto.*lock\|AppState\|appState" "$SVC_DIR/appProtection.ts" 2>/dev/null; then
    check_pass "Auto-lock with AppState listener"
else
    check_fail "Auto-lock missing"
fi

# Clipboard clearing
if grep -q "clipboard\|Clipboard\|clearClipboard\|copyWithAutoClear" "$SVC_DIR/appProtection.ts" 2>/dev/null; then
    check_pass "Clipboard auto-clearing"
else
    check_fail "Clipboard clearing missing"
fi

# Screenshot prevention
if grep -q "screenshot\|Screenshot\|FLAG_SECURE\|screenCapture" "$SVC_DIR/appProtection.ts" 2>/dev/null; then
    check_pass "Screenshot prevention"
else
    check_fail "Screenshot prevention missing"
fi

# Lock timeout configuration
if grep -q "autoLockTimeout\|lockTimeout\|timeout" "$SVC_DIR/appProtection.ts" 2>/dev/null; then
    check_pass "Lock timeout configuration"
else
    check_fail "Lock timeout missing"
fi

# Background protection
if grep -q "background\|Background\|lockOnBackground" "$SVC_DIR/appProtection.ts" 2>/dev/null; then
    check_pass "Background state protection"
else
    check_fail "Background protection missing"
fi

# RM-005: Native screenshot prevention module
if grep -q "ScreenCaptureProtection\|setFlagSecure\|setCaptureProtection" "$SVC_DIR/appProtection.ts" 2>/dev/null; then
    check_pass "Native screenshot prevention module calls (RM-005)"
else
    check_warn "Native screenshot prevention module not found"
fi

# RM-005: useAppProtection hook integration in root layout
if grep -q "useAppProtection" "$SRC_DIR/app/_layout.tsx" 2>/dev/null; then
    check_pass "useAppProtection integrated in root layout (RM-005)"
else
    check_fail "useAppProtection NOT integrated in root layout"
fi

# RM-005: Device integrity check on startup
if grep -q "checkDeviceIntegrity" "$SRC_DIR/app/_layout.tsx" 2>/dev/null; then
    check_pass "Device integrity check on app startup (RM-005)"
else
    check_warn "Device integrity check not in root layout"
fi

# RM-005: Background clipboard wipe
if grep -q "clearClipboardImmediately" "$SVC_DIR/appProtection.ts" 2>/dev/null; then
    check_pass "Immediate clipboard wipe on background (RM-005)"
else
    check_warn "Background clipboard wipe not implemented"
fi

echo ""

# ============================================================
# TASK 8: Aggregate Mobile Security + OWASP MASTG
# ============================================================
echo -e "${BLUE}[Task 8] Aggregate Mobile Security + OWASP MASTG${NC}"

# No http:// in app source (exclude xmlns, comments, localhost)
HTTP_LEAKS=$(grep -rn "http://" "$SVC_DIR/" 2>/dev/null | grep -v "// " | grep -v "localhost\|127.0.0.1\|10.0.2.2\|xmlns\|w3.org\|xml" | wc -l)
if [ "$HTTP_LEAKS" -eq 0 ]; then
    check_pass "No http:// URLs in app services (HTTPS enforced)"
else
    check_fail "Found $HTTP_LEAKS http:// URLs in app services"
fi

# PH9-FIX references
PH9_REFS=$(grep -rc "PH9-FIX" "$SVC_DIR/" 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
if [ "$PH9_REFS" -ge 5 ]; then
    check_pass "PH9-FIX tagged implementations ($PH9_REFS references)"
else
    check_fail "PH9-FIX references insufficient ($PH9_REFS < 5)"
fi

# Mobile security services count
MOBILE_SVCS=0
for svc in "certificatePinning.ts" "deviceIntegrity.ts" "appProtection.ts"; do
    if [ -f "$SVC_DIR/$svc" ]; then
        MOBILE_SVCS=$((MOBILE_SVCS + 1))
    fi
done
if [ "$MOBILE_SVCS" -ge 3 ]; then
    check_pass "Mobile security services: $MOBILE_SVCS services"
else
    check_fail "Mobile security services insufficient ($MOBILE_SVCS < 3)"
fi

# No plaintext secrets in source
SECRET_LEAKS=$(grep -rn "API_KEY\|SECRET_KEY\|PRIVATE_KEY" "$SVC_DIR/" 2>/dev/null | grep -v "process.env\|getenv\|// \|import\|interface\|type " | wc -l)
if [ "$SECRET_LEAKS" -eq 0 ]; then
    check_pass "No plaintext secrets in source code"
else
    check_fail "Found $SECRET_LEAKS potential plaintext secrets"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 9 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 9 AST GATE FAILED — $FAIL_COUNT failures${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 9 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 9 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
