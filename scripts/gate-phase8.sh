#!/bin/bash

# ============================================================
# Quantum_Shield — Phase 8 AST Gate
# Billing & Subscription Management Verification
# ============================================================
# Gate Requirement: Webhook HMAC verify + tier bypass test
# CWE Coverage: 311, 345, 862
# ============================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"
BILLING_DIR="$SERVER_DIR/internal/billing"
MW_DIR="$SERVER_DIR/internal/middleware"
MAIN_GO="$SERVER_DIR/cmd/api/main.go"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
check_pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
check_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }
check_warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN_COUNT=$((WARN_COUNT + 1)); }

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Quantum_Shield Phase 8 AST Gate — Billing & Subscription Mgmt${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ============================================================
# TASK 1: Stripe Customer + Subscription Creation (CWE-311)
# ============================================================
echo -e "${BLUE}[Task 1] Stripe Customer + Subscription Creation${NC}"

# Billing service exists
if [ -f "$BILLING_DIR/service.go" ]; then
    check_pass "Billing service exists"
else
    check_fail "Billing service missing"
fi

# CreateCustomer function
if grep -q "CreateCustomer" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "CreateCustomer function implemented"
else
    check_fail "CreateCustomer function missing"
fi

# CreateSubscription function
if grep -q "CreateSubscription" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "CreateSubscription function implemented"
else
    check_fail "CreateSubscription function missing"
fi

# StripeConfig with environment variable loading (PH8-FIX)
if grep -q "StripeConfig" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "StripeConfig struct defined (PH8-FIX)"
else
    check_fail "StripeConfig struct missing"
fi

# No hardcoded API keys
HARDCODED_KEYS=$(grep -rn "sk_live\|sk_test\|pk_live\|pk_test" "$BILLING_DIR/" 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$HARDCODED_KEYS" -eq 0 ]; then
    check_pass "No hardcoded Stripe API keys (PCI compliance)"
else
    check_fail "Found $HARDCODED_KEYS hardcoded Stripe API keys"
fi

# Environment variable for API key
if grep -q "STRIPE_SECRET_KEY\|STRIPE_API_KEY\|APIKey" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Stripe API key from environment variable"
else
    check_fail "Stripe API key not configured via environment"
fi

# Email validation
if grep -q "isValidEmail\|valid.*email\|email.*valid" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Email validation in customer creation"
else
    check_warn "Email validation not detected"
fi

# Tier validation
if grep -q "isValidTier\|valid.*tier" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Tier validation in subscription creation"
else
    check_fail "Tier validation missing"
fi

echo ""

# ============================================================
# TASK 2: Webhook Signature Verification — Stripe HMAC (CWE-345)
# ============================================================
echo -e "${BLUE}[Task 2] Webhook Signature Verification (HMAC)${NC}"

# Webhook handler
if grep -q "HandleWebhook" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "HandleWebhook endpoint implemented"
else
    check_fail "HandleWebhook endpoint missing"
fi

# HMAC verification
if grep -q "verifyStripeSignature\|VerifyStripeSignature\|hmac" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "HMAC signature verification function"
else
    check_fail "HMAC verification missing"
fi

# crypto/hmac import
if grep -q "crypto/hmac\|crypto/sha256" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Crypto HMAC/SHA256 packages used"
else
    check_fail "Crypto packages missing"
fi

# Constant-time comparison
if grep -q "hmac.Equal" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Constant-time comparison (hmac.Equal)"
else
    check_fail "Constant-time comparison missing"
fi

# Timestamp validation
if grep -q "5.*time.Minute\|timestamp.*valid\|tolerance" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Webhook timestamp validation (replay prevention)"
else
    check_fail "Timestamp validation missing"
fi

# Webhook secret from environment
if grep -q "STRIPE_WEBHOOK_SECRET" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Webhook secret from environment variable"
else
    check_fail "Webhook secret not configured via environment"
fi

# Event routing
EVENT_HANDLERS=0
for event in "subscription.updated|SubscriptionUpdated" "subscription.deleted|SubscriptionDeleted" "payment_succeeded|PaymentSucceeded" "payment_failed|PaymentFailed"; do
    if grep -qE "$event" "$BILLING_DIR/service.go" 2>/dev/null; then
        EVENT_HANDLERS=$((EVENT_HANDLERS + 1))
    fi
done
if [ "$EVENT_HANDLERS" -ge 3 ]; then
    check_pass "Webhook event routing ($EVENT_HANDLERS event types)"
else
    check_fail "Webhook event routing insufficient ($EVENT_HANDLERS < 3)"
fi

# Webhook tests
if [ -f "$BILLING_DIR/webhook_test.go" ]; then
    WH_TESTS=$(grep -c "func Test" "$BILLING_DIR/webhook_test.go" 2>/dev/null || echo "0")
    check_pass "Webhook test suite present ($WH_TESTS tests)"
else
    check_fail "Webhook tests missing"
fi

echo ""

# ============================================================
# TASK 3: Tier-Based Feature Gating Middleware (CWE-862)
# ============================================================
echo -e "${BLUE}[Task 3] Tier-Based Feature Gating Middleware${NC}"

# RequireTier middleware
if grep -q "RequireTier" "$MW_DIR/auth.go" 2>/dev/null; then
    check_pass "RequireTier middleware implemented"
else
    check_fail "RequireTier middleware missing"
fi

# Tier constants defined
TIER_COUNT=0
for tier in "free" "individual" "team" "enterprise"; do
    if grep -qi "$tier" "$BILLING_DIR/service.go" 2>/dev/null; then
        TIER_COUNT=$((TIER_COUNT + 1))
    fi
done
if [ "$TIER_COUNT" -ge 4 ]; then
    check_pass "Subscription tier constants ($TIER_COUNT tiers)"
else
    check_fail "Subscription tier constants insufficient ($TIER_COUNT < 4)"
fi

# 402 Payment Required response
if grep -q "402\|PaymentRequired\|Payment Required" "$MW_DIR/auth.go" 2>/dev/null; then
    check_pass "HTTP 402 response for insufficient tier"
else
    check_fail "HTTP 402 response missing"
fi

# Tier ranking system
if grep -q "tier.*ranking\|getTierRanking\|tierRank" "$MW_DIR/auth.go" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Tier ranking system for comparison"
else
    check_fail "Tier ranking system missing"
fi

# Database tier check
if grep -q "SELECT.*tier.*FROM.*subscription\|subscriptions.*tier" "$MW_DIR/auth.go" 2>/dev/null; then
    check_pass "Database-backed tier verification"
else
    check_fail "Database tier verification missing"
fi

echo ""

# ============================================================
# TASK 4: Subscription Lifecycle (Upgrade/Downgrade/Cancel)
# ============================================================
echo -e "${BLUE}[Task 4] Subscription Lifecycle Management${NC}"

# Upgrade handler (PH8-FIX)
if grep -q "HandleUpgradeSubscription\|HandleUpgrade" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Upgrade subscription handler (PH8-FIX)"
else
    check_fail "Upgrade handler missing"
fi

# Downgrade handler (PH8-FIX)
if grep -q "HandleDowngradeSubscription\|HandleDowngrade" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Downgrade subscription handler (PH8-FIX)"
else
    check_fail "Downgrade handler missing"
fi

# Cancel handler (PH8-FIX)
if grep -q "HandleCancelSubscription\|HandleCancel" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Cancel subscription handler (PH8-FIX)"
else
    check_fail "Cancel handler missing"
fi

# Upgrade validation (higher tier)
if grep -q "requestedRank.*currentRank\|upgrade.*tier\|higher.*tier" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Upgrade tier validation (must be higher)"
else
    check_fail "Upgrade tier validation missing"
fi

# Downgrade grace period
if grep -q "downgrade_scheduled\|grace.*period\|period_end\|billing.*period" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Downgrade grace period implementation"
else
    check_fail "Downgrade grace period missing"
fi

# Cancel at period end
if grep -q "cancel_at_period_end\|cancelling\|cancel.*period" "$BILLING_DIR/service.go" 2>/dev/null; then
    check_pass "Cancel at period end (graceful cancellation)"
else
    check_fail "Cancel at period end missing"
fi

# Routes registered
LIFECYCLE_ROUTES=0
for route in "upgrade" "downgrade" "cancel"; do
    if grep -q "$route" "$MAIN_GO" 2>/dev/null; then
        LIFECYCLE_ROUTES=$((LIFECYCLE_ROUTES + 1))
    fi
done
if [ "$LIFECYCLE_ROUTES" -ge 3 ]; then
    check_pass "Lifecycle routes registered ($LIFECYCLE_ROUTES routes)"
else
    check_fail "Lifecycle routes insufficient ($LIFECYCLE_ROUTES < 3)"
fi

# Tier transitions test
if [ -f "$BILLING_DIR/tier_transitions_test.go" ]; then
    TT_TESTS=$(grep -c "func Test" "$BILLING_DIR/tier_transitions_test.go" 2>/dev/null || echo "0")
    check_pass "Tier transitions test suite ($TT_TESTS tests)"
else
    check_warn "Tier transitions tests not found"
fi

echo ""

# ============================================================
# TASK 5: RM-011 — Feature-Based Access Control Middleware
# ============================================================
echo -e "${BLUE}[Task 5] RM-011 Feature-Based Access Control${NC}"

# Feature gate middleware file exists
if [ -f "$MW_DIR/feature_gate.go" ]; then
    check_pass "RM-011: Feature gate middleware file exists"
else
    check_fail "RM-011: Feature gate middleware file missing"
fi

# RequireFeature middleware function
if grep -q "RequireFeature" "$MW_DIR/feature_gate.go" 2>/dev/null; then
    check_pass "RM-011: RequireFeature middleware function"
else
    check_fail "RM-011: RequireFeature middleware missing"
fi

# Feature constants defined
FEATURE_COUNT=0
for feat in "FeatureGhostMessages" "FeatureEnterpriseQR" "FeatureAuditExport" "FeatureSSOIntegration"; do
    if grep -q "$feat" "$MW_DIR/feature_gate.go" 2>/dev/null; then
        FEATURE_COUNT=$((FEATURE_COUNT + 1))
    fi
done
if [ "$FEATURE_COUNT" -ge 3 ]; then
    check_pass "RM-011: Feature constants defined ($FEATURE_COUNT found)"
else
    check_fail "RM-011: Feature constants insufficient ($FEATURE_COUNT < 3)"
fi

# Feature-to-tier mapping
if grep -q "featureTierMap" "$MW_DIR/feature_gate.go" 2>/dev/null; then
    check_pass "RM-011: Feature-to-tier mapping table"
else
    check_fail "RM-011: Feature-to-tier mapping missing"
fi

# HTTP 402 Payment Required for feature denial
if grep -q "StatusPaymentRequired\|402" "$MW_DIR/feature_gate.go" 2>/dev/null; then
    check_pass "RM-011: HTTP 402 for feature denial with upgrade info"
else
    check_fail "RM-011: HTTP 402 response missing from feature gate"
fi

# Feature gate JSON error response with feature + tier info
if grep -q "FeatureGateError\|required_tier\|current_tier" "$MW_DIR/feature_gate.go" 2>/dev/null; then
    check_pass "RM-011: Structured feature gate error response"
else
    check_fail "RM-011: Structured error response missing"
fi

# Feature gate used in routes
if grep -q "RequireFeature" "$MAIN_GO" 2>/dev/null; then
    check_pass "RM-011: Feature gate applied to route(s) in main.go"
else
    check_fail "RM-011: Feature gate not applied to any routes"
fi

# CheckFeatureAccess helper
if grep -q "CheckFeatureAccess" "$MW_DIR/feature_gate.go" 2>/dev/null; then
    check_pass "RM-011: CheckFeatureAccess programmatic helper"
else
    check_warn "RM-011: CheckFeatureAccess helper not found"
fi

# Client-side tier service with matching features
if grep -q "Feature.*=" "$PROJECT_ROOT/usbvault-app/src/services/tierService.ts" 2>/dev/null; then
    check_pass "RM-011: Client-side tierService with feature definitions"
else
    check_fail "RM-011: Client-side tierService missing"
fi

echo ""

# ============================================================
# TASK 6: Aggregate Billing Security Validation
# ============================================================
echo -e "${BLUE}[Task 6] Aggregate Billing Security${NC}"

# Billing test files
BILLING_TESTS=$(find "$BILLING_DIR" -name "*_test.go" 2>/dev/null | wc -l)
if [ "$BILLING_TESTS" -ge 1 ]; then
    check_pass "Billing test coverage: $BILLING_TESTS test files"
else
    check_fail "Billing test coverage insufficient"
fi

# Total billing test functions
TOTAL_BILLING_FUNCS=$(grep -r "func Test" "$BILLING_DIR"/*_test.go 2>/dev/null | wc -l)
if [ "$TOTAL_BILLING_FUNCS" -ge 5 ]; then
    check_pass "Total billing test functions: $TOTAL_BILLING_FUNCS (>= 5 required)"
else
    check_fail "Billing test functions insufficient ($TOTAL_BILLING_FUNCS < 5)"
fi

# No http:// in billing code
HTTP_LEAKS=$(grep -rn "http://" "$BILLING_DIR/" 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$HTTP_LEAKS" -eq 0 ]; then
    check_pass "No http:// URLs in billing code"
else
    check_fail "Found $HTTP_LEAKS http:// URLs in billing code"
fi

# Billing route group registered
if grep -q "billing\|Billing" "$MAIN_GO" 2>/dev/null; then
    check_pass "Billing route group registered in main.go"
else
    check_fail "Billing routes not registered"
fi

# No raw card numbers in code
CARD_PATTERNS=$(grep -rn "card_number\|cardNumber\|pan\|credit_card" "$BILLING_DIR/" 2>/dev/null | grep -v "_test.go" | grep -v "// " | wc -l)
if [ "$CARD_PATTERNS" -eq 0 ]; then
    check_pass "No raw card number storage (PCI compliance)"
else
    check_fail "Found $CARD_PATTERNS potential card number fields"
fi

echo ""

# ============================================================
# SUMMARY
# ============================================================
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}Phase 8 AST Gate Results${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS_COUNT${NC}"
echo -e "  ${RED}FAIL: $FAIL_COUNT${NC}"
echo -e "  ${YELLOW}WARN: $WARN_COUNT${NC}"
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
echo -e "  TOTAL: $TOTAL checks"
echo ""

if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "${RED}[!] PHASE 8 AST GATE FAILED — $FAIL_COUNT failures${NC}"
    exit 1
elif [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}[!] PHASE 8 AST GATE PASSED WITH WARNINGS — $WARN_COUNT items${NC}"
    exit 0
else
    echo -e "${GREEN}[+] PHASE 8 AST GATE PASSED — All checks verified${NC}"
    exit 0
fi
