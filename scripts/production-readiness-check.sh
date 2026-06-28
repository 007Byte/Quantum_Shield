#!/usr/bin/env bash
# Quantum_Shield — Production Readiness Check
#
# Runs a comprehensive sweep to verify the codebase is production-safe:
#   1. Environment variable validation (via validate-env.sh)
#   2. Mock data not leaked into production paths
#   3. Demo mode disabled
#   4. No localhost fallbacks active in production config
#   5. Certificate pinning placeholders detected
#
# Usage: ./scripts/production-readiness-check.sh [.env-file]
# Exit codes: 0 = ready, 1 = issues found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ------------------------------------------------------------------
# Color helpers
# ------------------------------------------------------------------
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BOLD='' NC=''
fi

pass()  { echo -e "  ${GREEN}[OK]${NC}    $*"; }
warn_msg()  { echo -e "  ${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "  ${RED}[FAIL]${NC}  $*"; }

ERRORS=0
WARNINGS=0

echo -e "${BOLD}=== Quantum_Shield — Production Readiness Check ===${NC}"
echo ""

# ------------------------------------------------------------------
# 1. Environment validation (if .env file provided)
# ------------------------------------------------------------------
ENV_FILE="${1:-}"
if [[ -n "$ENV_FILE" ]]; then
    echo -e "${BOLD}--- Step 1: Environment Validation ---${NC}"
    if "$SCRIPT_DIR/validate-env.sh" "$ENV_FILE"; then
        pass "Environment validation passed"
    else
        fail "Environment validation failed — run validate-env.sh for details"
        ERRORS=$((ERRORS + 1))
    fi
    echo ""
else
    echo -e "${BOLD}--- Step 1: Environment Validation (skipped — no .env file provided) ---${NC}"
    warn_msg "Provide a .env file to validate: $0 .env.production"
    WARNINGS=$((WARNINGS + 1))
    echo ""
fi

# ------------------------------------------------------------------
# 2. Mock data gate check
# ------------------------------------------------------------------
echo -e "${BOLD}--- Step 2: Mock Data Gate ---${NC}"

MOCK_DATA_FILE="$PROJECT_ROOT/usbvault-app/src/components/dashboard2/mockData.ts"
if [[ -f "$MOCK_DATA_FILE" ]]; then
    # Check that mock data is gated behind __DEV__
    if grep -q '__DEV__' "$MOCK_DATA_FILE"; then
        pass "mockData.ts is gated behind __DEV__"
    else
        fail "mockData.ts is NOT gated behind __DEV__ — mock data will leak to production"
        ERRORS=$((ERRORS + 1))
    fi

    # Check no production components import directly from mockData
    # Exclude: test files, navigationConfig (extracts config from mockData by design)
    MOCK_IMPORTERS=$(grep -rl "from.*mockData" "$PROJECT_ROOT/usbvault-app/src/components/" "$PROJECT_ROOT/usbvault-app/src/app/" 2>/dev/null | grep -v '__tests__' | grep -v '.test.' | grep -v 'navigationConfig' || true)
    if [[ -z "$MOCK_IMPORTERS" ]]; then
        pass "No production components import from mockData"
    else
        fail "Production components still import from mockData:"
        echo "$MOCK_IMPORTERS" | while read -r f; do fail "  $f"; done
        ERRORS=$((ERRORS + 1))
    fi
else
    pass "mockData.ts does not exist (removed)"
fi

echo ""

# ------------------------------------------------------------------
# 3. Demo mode check
# ------------------------------------------------------------------
echo -e "${BOLD}--- Step 3: Demo Mode ---${NC}"

APP_ENV="$PROJECT_ROOT/usbvault-app/.env"
if [[ -f "$APP_ENV" ]]; then
    if grep -q 'EXPO_PUBLIC_DEMO_MODE=true' "$APP_ENV"; then
        fail "EXPO_PUBLIC_DEMO_MODE=true in $APP_ENV — must be false for production"
        ERRORS=$((ERRORS + 1))
    else
        pass "Demo mode is not enabled in .env"
    fi
fi

# Check DemoModeBanner is __DEV__ gated
DEMO_BANNER="$PROJECT_ROOT/usbvault-app/src/components/common/DemoModeBanner.tsx"
if [[ -f "$DEMO_BANNER" ]]; then
    if grep -q '__DEV__' "$DEMO_BANNER"; then
        pass "DemoModeBanner is gated behind __DEV__"
    else
        warn_msg "DemoModeBanner does not check __DEV__ — verify it cannot appear in production"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""

# ------------------------------------------------------------------
# 4. Localhost fallback check (Go server)
# ------------------------------------------------------------------
echo -e "${BOLD}--- Step 4: Localhost Fallback Audit ---${NC}"

HELPERS_FILE="$PROJECT_ROOT/usbvault-server/cmd/api/helpers.go"
INFRA_FILE="$PROJECT_ROOT/usbvault-server/cmd/api/infra.go"

# Check that production-fatal guards exist
if [[ -f "$HELPERS_FILE" ]]; then
    if grep -q 'ENVIRONMENT.*production' "$HELPERS_FILE"; then
        pass "helpers.go has production environment guard for CORS"
    else
        fail "helpers.go missing production guard — CORS may fall back to localhost"
        ERRORS=$((ERRORS + 1))
    fi
fi

if [[ -f "$INFRA_FILE" ]]; then
    if grep -q 'ENVIRONMENT.*production' "$INFRA_FILE"; then
        pass "infra.go has production environment guard for Redis"
    else
        fail "infra.go missing production guard — Redis may fall back to localhost"
        ERRORS=$((ERRORS + 1))
    fi
fi

echo ""

# ------------------------------------------------------------------
# 5. Certificate pinning placeholder check
# ------------------------------------------------------------------
echo -e "${BOLD}--- Step 5: Certificate Pinning ---${NC}"

PROD_ENV_EXAMPLE="$PROJECT_ROOT/usbvault-app/.env.production.example"
if [[ -f "$PROD_ENV_EXAMPLE" ]]; then
    if grep -q 'REPLACE_WITH' "$PROD_ENV_EXAMPLE"; then
        warn_msg "Certificate pin placeholders still present in .env.production.example (expected until TLS is provisioned)"
        WARNINGS=$((WARNINGS + 1))
    else
        pass "No placeholder values in .env.production.example"
    fi
fi

echo ""

# ------------------------------------------------------------------
# 6. Stripe test key check
# ------------------------------------------------------------------
echo -e "${BOLD}--- Step 6: Stripe Key Safety ---${NC}"

# Check that no sk_test_ keys are hardcoded in source (not .env files, not test files)
STRIPE_TEST_LEAKS=$(grep -rl 'sk_test_' "$PROJECT_ROOT/usbvault-server/internal/" "$PROJECT_ROOT/usbvault-app/src/" 2>/dev/null | grep -v '_test.go' | grep -v '.test.ts' | grep -v '__tests__' || true)
if [[ -z "$STRIPE_TEST_LEAKS" ]]; then
    pass "No hardcoded Stripe test keys in source code"
else
    fail "Stripe test keys found in source code:"
    echo "$STRIPE_TEST_LEAKS" | while read -r f; do fail "  $f"; done
    ERRORS=$((ERRORS + 1))
fi

echo ""

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
echo -e "${BOLD}=================================================${NC}"
if [[ "$ERRORS" -gt 0 ]]; then
    echo -e "${RED}NOT READY:${NC} $ERRORS error(s), $WARNINGS warning(s)"
    echo -e "Fix the above errors before deploying to production."
    exit 1
elif [[ "$WARNINGS" -gt 0 ]]; then
    echo -e "${YELLOW}CONDITIONALLY READY:${NC} $WARNINGS warning(s)"
    echo -e "Review warnings above. Most are expected pre-launch (pending external accounts)."
    exit 0
else
    echo -e "${GREEN}PRODUCTION READY:${NC} All checks passed"
    exit 0
fi
