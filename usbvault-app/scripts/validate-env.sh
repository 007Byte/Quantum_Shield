#!/bin/bash
# Pre-build environment validation for USBVault Enterprise.
# Ensures no placeholder values remain before production builds.
# Run: bash scripts/validate-env.sh [--production]

ERRORS=0
WARNINGS=0
IS_PRODUCTION=false

if [ "${1:-}" = "--production" ]; then
  IS_PRODUCTION=true
fi

fail() {
  echo "ERROR: $1"
  ERRORS=$((ERRORS + 1))
}

warn() {
  echo "WARN:  $1"
  WARNINGS=$((WARNINGS + 1))
}

pass() {
  echo "  OK:  $1"
}

echo "========================================"
echo "  USBVault Enterprise - Env Validator"
echo "========================================"
echo ""

# Check app.json for placeholder values
echo "> Checking app.json..."

if grep -q "Quantum Armor Vault" app.json 2>/dev/null; then
  fail "app.json name still references old branding"
else
  pass "App name updated"
fi

if grep -q "com\.qav" app.json 2>/dev/null; then
  fail "app.json still contains com.qav bundle identifier"
else
  pass "Bundle identifiers updated"
fi

# Check eas.json for placeholder values
echo ""
echo "> Checking eas.json..."

if grep -q "CONFIGURE_" eas.json 2>/dev/null; then
  if [ "$IS_PRODUCTION" = true ]; then
    fail "eas.json contains CONFIGURE_* placeholders (Apple ID/Team ID not set)"
  else
    warn "eas.json contains CONFIGURE_* placeholders (OK for dev)"
  fi
else
  pass "No CONFIGURE_* placeholders"
fi

if grep -q "com\.qav" eas.json 2>/dev/null; then
  fail "eas.json still contains com.qav package name"
else
  pass "Package names updated"
fi

# Check environment variables
echo ""
echo "> Checking environment variables..."

if [ -f .env ]; then
  if grep -q "REPLACE_WITH" .env; then
    fail ".env contains REPLACE_WITH placeholder values"
  else
    pass "No REPLACE_WITH placeholders in .env"
  fi

  if [ "$IS_PRODUCTION" = true ]; then
    SENTRY_DSN=$(grep "EXPO_PUBLIC_SENTRY_DSN" .env 2>/dev/null | cut -d= -f2- || echo "")
    if [ -z "$SENTRY_DSN" ] || [ "$SENTRY_DSN" = "https://examplePublicKey@o0.ingest.sentry.io/0" ]; then
      fail "EXPO_PUBLIC_SENTRY_DSN is not configured for production"
    else
      pass "Sentry DSN configured"
    fi

    PIN_PRIMARY=$(grep "EXPO_PUBLIC_PIN_PRIMARY" .env 2>/dev/null | cut -d= -f2- || echo "")
    if [ -z "$PIN_PRIMARY" ] || echo "$PIN_PRIMARY" | grep -q "REPLACE"; then
      fail "EXPO_PUBLIC_PIN_PRIMARY certificate pin not configured"
    else
      pass "Certificate pin (primary) configured"
    fi
  fi
else
  warn "No .env file found (using defaults)"
fi

# Check for old branding references
echo ""
echo "> Checking for stale branding..."

STALE_COUNT=$(grep -rl "Quantum Armor Vault\|quantumarmorvault\|com\.qav\." --include="*.json" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | grep -v ".env.production.example" | wc -l | tr -d ' ')
if [ "$STALE_COUNT" -gt 0 ]; then
  warn "Found $STALE_COUNT file(s) with old branding"
  grep -rl "Quantum Armor Vault\|quantumarmorvault\|com\.qav\." --include="*.json" --include="*.ts" --include="*.tsx" . 2>/dev/null | grep -v node_modules | grep -v ".env.production.example" | while read -r f; do
    echo "    -> $f"
  done
else
  pass "No stale branding references"
fi

# Summary
echo ""
echo "========================================"
if [ "$ERRORS" -gt 0 ]; then
  echo "FAILED: $ERRORS error(s), $WARNINGS warning(s)"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo "PASSED with $WARNINGS warning(s)"
  exit 0
else
  echo "ALL CHECKS PASSED"
  exit 0
fi
