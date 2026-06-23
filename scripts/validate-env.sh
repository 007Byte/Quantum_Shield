#!/usr/bin/env bash
# Validates production environment configuration for USBVault Enterprise
# Usage: ./scripts/validate-env.sh [.env-file]
#
# Exit codes:
#   0 - All required variables are set and valid
#   1 - One or more required variables are missing or invalid
#
# When run with --dry-run, checks that the template lists all required
# variable names (used in CI to keep .env.example in sync).

set -euo pipefail

# ------------------------------------------------------------------
# Argument parsing
# ------------------------------------------------------------------
ENV_FILE=""
DRY_RUN=false

for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=true
            ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [.env-file]"
            echo ""
            echo "Options:"
            echo "  --dry-run   Check that the template defines all required variable names"
            echo "              (does not validate values — suitable for CI)"
            echo "  .env-file   Path to .env file to source before validation"
            exit 0
            ;;
        *)
            ENV_FILE="$arg"
            ;;
    esac
done

# ------------------------------------------------------------------
# Color helpers (disabled when stdout is not a tty)
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

# ------------------------------------------------------------------
# Load .env file if provided
# ------------------------------------------------------------------
if [[ -n "$ENV_FILE" ]]; then
    if [[ ! -f "$ENV_FILE" ]]; then
        echo -e "${RED}ERROR:${NC} File not found: $ENV_FILE"
        exit 1
    fi
    echo -e "${BOLD}Loading environment from:${NC} $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    echo ""
fi

# ------------------------------------------------------------------
# Counters
# ------------------------------------------------------------------
ERRORS=0
WARNINGS=0

# ------------------------------------------------------------------
# Dry-run mode: just check that variable names appear in the file
# ------------------------------------------------------------------
if [[ "$DRY_RUN" == "true" ]]; then
    if [[ -z "$ENV_FILE" ]]; then
        echo -e "${RED}ERROR:${NC} --dry-run requires an .env file argument"
        exit 1
    fi

    echo -e "${BOLD}=== Dry-run: checking that template defines all required variables ===${NC}"
    echo ""

    REQUIRED_VARS=(
        DATABASE_URL
        REDIS_URL
        S3_ENDPOINT AWS_ENDPOINT S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY S3_ACCESS_KEY S3_SECRET_KEY
        JWT_ED25519_PRIVATE_KEY JWT_ED25519_PUBLIC_KEY
        BACKUP_ENCRYPTION_KEY
        STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET
        STRIPE_PRICE_INDIVIDUAL STRIPE_PRICE_TEAM STRIPE_PRICE_ENTERPRISE
        ENVIRONMENT
    )

    MISSING=0
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" "$ENV_FILE" 2>/dev/null || grep -q "^#.*${var}" "$ENV_FILE" 2>/dev/null; then
            pass "$var found in template"
        else
            # Some vars have aliases — check common alternatives
            case "$var" in
                AWS_ENDPOINT)
                    if grep -q "^S3_ENDPOINT=" "$ENV_FILE" 2>/dev/null; then pass "$var (aliased as S3_ENDPOINT)"; continue; fi
                    ;;
                S3_ENDPOINT)
                    if grep -q "^AWS_ENDPOINT=" "$ENV_FILE" 2>/dev/null; then pass "$var (aliased as AWS_ENDPOINT)"; continue; fi
                    ;;
                S3_ACCESS_KEY)
                    if grep -q "^AWS_ACCESS_KEY_ID=" "$ENV_FILE" 2>/dev/null; then pass "$var (aliased as AWS_ACCESS_KEY_ID)"; continue; fi
                    ;;
                S3_SECRET_KEY)
                    if grep -q "^AWS_SECRET_ACCESS_KEY=" "$ENV_FILE" 2>/dev/null; then pass "$var (aliased as AWS_SECRET_ACCESS_KEY)"; continue; fi
                    ;;
                AWS_ACCESS_KEY_ID)
                    if grep -q "^S3_ACCESS_KEY=" "$ENV_FILE" 2>/dev/null; then pass "$var (aliased as S3_ACCESS_KEY)"; continue; fi
                    ;;
                AWS_SECRET_ACCESS_KEY)
                    if grep -q "^S3_SECRET_KEY=" "$ENV_FILE" 2>/dev/null; then pass "$var (aliased as S3_SECRET_KEY)"; continue; fi
                    ;;
            esac
            fail "$var NOT found in template"
            MISSING=$((MISSING + 1))
        fi
    done

    echo ""
    if [[ "$MISSING" -gt 0 ]]; then
        echo -e "${RED}FAILED:${NC} $MISSING required variable(s) missing from template"
        exit 1
    else
        echo -e "${GREEN}PASSED:${NC} All required variables present in template"
        exit 0
    fi
fi

# ------------------------------------------------------------------
# Full validation mode
# ------------------------------------------------------------------
echo -e "${BOLD}=== USBVault Enterprise — Production Environment Validation ===${NC}"
echo ""

# Helper: check a required variable
require_var() {
    local var_name="$1"
    local description="${2:-}"
    local value="${!var_name:-}"

    if [[ -z "$value" ]]; then
        fail "$var_name is not set${description:+ ($description)}"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    return 0
}

# Helper: check one of two alternative variables
require_either() {
    local var_a="$1"
    local var_b="$2"
    local description="${3:-}"
    local val_a="${!var_a:-}"
    local val_b="${!var_b:-}"

    if [[ -n "$val_a" ]] || [[ -n "$val_b" ]]; then
        return 0
    fi
    fail "Neither $var_a nor $var_b is set${description:+ ($description)}"
    ERRORS=$((ERRORS + 1))
    return 1
}

# Helper: check an optional variable
optional_var() {
    local var_name="$1"
    local description="${2:-}"
    local value="${!var_name:-}"

    if [[ -z "$value" ]]; then
        warn_msg "$var_name is not set${description:+ ($description)}"
        WARNINGS=$((WARNINGS + 1))
        return 1
    fi
    return 0
}

# ==================================================================
# SECTION: Database
# ==================================================================
echo -e "${BOLD}--- Database ---${NC}"

if require_var DATABASE_URL "PostgreSQL connection string"; then
    DB_URL="${DATABASE_URL}"
    if [[ ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
        fail "DATABASE_URL must start with postgres:// or postgresql://"
        ERRORS=$((ERRORS + 1))
    elif [[ "$DB_URL" =~ sslmode=disable ]]; then
        fail "DATABASE_URL has sslmode=disable — production requires sslmode=verify-ca or verify-full"
        ERRORS=$((ERRORS + 1))
    else
        pass "DATABASE_URL format valid (SSL enabled)"
    fi
fi

optional_var DB_MAX_CONNECTIONS "connection pool max (default: 30)"
optional_var DB_MIN_CONNECTIONS "connection pool min (default: 5)"

# ==================================================================
# SECTION: Redis
# ==================================================================
echo ""
echo -e "${BOLD}--- Redis ---${NC}"

if require_var REDIS_URL "Redis connection string"; then
    if [[ ! "${REDIS_URL}" =~ ^redis(s)?:// ]]; then
        fail "REDIS_URL must start with redis:// or rediss://"
        ERRORS=$((ERRORS + 1))
    else
        pass "REDIS_URL format valid"
    fi
fi

# ==================================================================
# SECTION: S3 / Object Storage
# ==================================================================
echo ""
echo -e "${BOLD}--- S3 / Object Storage ---${NC}"

# The codebase uses both S3_ENDPOINT and AWS_ENDPOINT
require_either S3_ENDPOINT AWS_ENDPOINT "S3-compatible endpoint URL"
if [[ -n "${S3_ENDPOINT:-}" ]] || [[ -n "${AWS_ENDPOINT:-}" ]]; then
    ENDPOINT="${S3_ENDPOINT:-${AWS_ENDPOINT:-}}"
    if [[ "$ENDPOINT" =~ ^https?:// ]]; then
        pass "S3 endpoint format valid: $ENDPOINT"
    else
        fail "S3 endpoint must start with http:// or https://"
        ERRORS=$((ERRORS + 1))
    fi
fi

require_var S3_BUCKET "S3 bucket name"

# Accept either naming convention
require_either AWS_ACCESS_KEY_ID S3_ACCESS_KEY "S3 access key"
if require_either AWS_ACCESS_KEY_ID S3_ACCESS_KEY; then
    pass "S3 access key is set"
fi

require_either AWS_SECRET_ACCESS_KEY S3_SECRET_KEY "S3 secret key"
if require_either AWS_SECRET_ACCESS_KEY S3_SECRET_KEY; then
    pass "S3 secret key is set"
fi

# ==================================================================
# SECTION: Authentication (JWT)
# ==================================================================
echo ""
echo -e "${BOLD}--- Authentication (JWT ED25519) ---${NC}"

require_either JWT_ED25519_PRIVATE_KEY_FILE JWT_ED25519_PRIVATE_KEY "JWT signing key"
require_either JWT_ED25519_PUBLIC_KEY_FILE JWT_ED25519_PUBLIC_KEY "JWT verification key"

# If file-based keys are configured, verify files exist
if [[ -n "${JWT_ED25519_PRIVATE_KEY_FILE:-}" ]]; then
    if [[ -f "${JWT_ED25519_PRIVATE_KEY_FILE}" ]]; then
        pass "JWT private key file exists: ${JWT_ED25519_PRIVATE_KEY_FILE}"
    else
        fail "JWT private key file not found: ${JWT_ED25519_PRIVATE_KEY_FILE}"
        ERRORS=$((ERRORS + 1))
    fi
fi

if [[ -n "${JWT_ED25519_PUBLIC_KEY_FILE:-}" ]]; then
    if [[ -f "${JWT_ED25519_PUBLIC_KEY_FILE}" ]]; then
        pass "JWT public key file exists: ${JWT_ED25519_PUBLIC_KEY_FILE}"
    else
        fail "JWT public key file not found: ${JWT_ED25519_PUBLIC_KEY_FILE}"
        ERRORS=$((ERRORS + 1))
    fi
fi

if [[ -n "${JWT_ED25519_PRIVATE_KEY:-}" ]] && [[ -z "${JWT_ED25519_PRIVATE_KEY_FILE:-}" ]]; then
    warn_msg "Using inline JWT_ED25519_PRIVATE_KEY — file-based keys (JWT_ED25519_PRIVATE_KEY_FILE) are recommended"
    WARNINGS=$((WARNINGS + 1))
fi

# ==================================================================
# SECTION: Backup Encryption
# ==================================================================
echo ""
echo -e "${BOLD}--- Backup Encryption ---${NC}"

if require_var BACKUP_ENCRYPTION_KEY "32-byte base64-encoded encryption key"; then
    # Validate it decodes to 32 bytes
    DECODED_LEN=$(echo -n "${BACKUP_ENCRYPTION_KEY}" | base64 -d 2>/dev/null | wc -c | tr -d ' ')
    if [[ "$DECODED_LEN" -eq 32 ]]; then
        pass "BACKUP_ENCRYPTION_KEY is valid (32 bytes)"
    else
        fail "BACKUP_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${DECODED_LEN})"
        ERRORS=$((ERRORS + 1))
    fi
fi

# ==================================================================
# SECTION: Stripe Billing
# ==================================================================
echo ""
echo -e "${BOLD}--- Stripe Billing ---${NC}"

if require_var STRIPE_SECRET_KEY "Stripe API secret key"; then
    if [[ "${STRIPE_SECRET_KEY}" =~ ^sk_test_ ]]; then
        warn_msg "STRIPE_SECRET_KEY starts with sk_test_ — this is a TEST key, not production"
        WARNINGS=$((WARNINGS + 1))
    elif [[ "${STRIPE_SECRET_KEY}" =~ ^sk_live_ ]]; then
        pass "STRIPE_SECRET_KEY is a live key"
    else
        warn_msg "STRIPE_SECRET_KEY does not match expected sk_live_ or sk_test_ prefix"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

if require_var STRIPE_WEBHOOK_SECRET "Stripe webhook signing secret"; then
    if [[ "${STRIPE_WEBHOOK_SECRET}" =~ ^whsec_ ]]; then
        pass "STRIPE_WEBHOOK_SECRET format valid"
    else
        fail "STRIPE_WEBHOOK_SECRET must start with whsec_"
        ERRORS=$((ERRORS + 1))
    fi
fi

require_var STRIPE_PRICE_INDIVIDUAL "Stripe price ID for Individual plan"
require_var STRIPE_PRICE_TEAM "Stripe price ID for Team plan"
require_var STRIPE_PRICE_ENTERPRISE "Stripe price ID for Enterprise plan"

for PRICE_VAR in STRIPE_PRICE_INDIVIDUAL STRIPE_PRICE_TEAM STRIPE_PRICE_ENTERPRISE; do
    PRICE_VAL="${!PRICE_VAR:-}"
    if [[ -n "$PRICE_VAL" ]] && [[ "$PRICE_VAL" =~ ^price_ ]]; then
        pass "$PRICE_VAR format valid"
    elif [[ -n "$PRICE_VAL" ]]; then
        warn_msg "$PRICE_VAR does not start with price_ — verify it is correct"
        WARNINGS=$((WARNINGS + 1))
    fi
done

# ==================================================================
# SECTION: Environment
# ==================================================================
echo ""
echo -e "${BOLD}--- Environment ---${NC}"

if require_var ENVIRONMENT "must be 'production'"; then
    if [[ "${ENVIRONMENT}" == "production" ]]; then
        pass "ENVIRONMENT=production"
    else
        warn_msg "ENVIRONMENT=${ENVIRONMENT} — expected 'production' for production deploy"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

# ==================================================================
# SECTION: Optional — Certificate Pinning (Mobile App)
# ==================================================================
echo ""
echo -e "${BOLD}--- Optional: Certificate Pinning ---${NC}"

optional_var EXPO_PUBLIC_PIN_PRIMARY "primary certificate pin (SPKI SHA-256 base64)"
optional_var EXPO_PUBLIC_PIN_BACKUP "backup certificate pin (intermediate CA)"

# ==================================================================
# SECTION: Optional — Monitoring
# ==================================================================
echo ""
echo -e "${BOLD}--- Optional: Monitoring ---${NC}"

optional_var EXPO_PUBLIC_SENTRY_DSN "Sentry error tracking DSN"

# ==================================================================
# SECTION: Optional — Push Notifications
# ==================================================================
echo ""
echo -e "${BOLD}--- Optional: Push Notifications ---${NC}"

optional_var APNS_KEY_ID "APNs key ID (iOS push)"
optional_var APNS_TEAM_ID "APNs team ID"
optional_var FCM_PROJECT_ID "Firebase Cloud Messaging project ID (Android push)"

# ==================================================================
# SECTION: Optional — FIDO2/WebAuthn
# ==================================================================
echo ""
echo -e "${BOLD}--- Optional: FIDO2/WebAuthn ---${NC}"

optional_var FIDO2_RELYING_PARTY_ID "WebAuthn relying party domain"
optional_var FIDO2_RELYING_PARTY_NAME "WebAuthn relying party display name"
optional_var FIDO2_RELYING_PARTY_ORIGIN "WebAuthn origin URL"

# ==================================================================
# Summary
# ==================================================================
echo ""
echo -e "${BOLD}=================================================${NC}"
if [[ "$ERRORS" -gt 0 ]]; then
    echo -e "${RED}FAILED:${NC} $ERRORS error(s), $WARNINGS warning(s)"
    echo -e "Fix the above errors before deploying to production."
    exit 1
elif [[ "$WARNINGS" -gt 0 ]]; then
    echo -e "${YELLOW}PASSED WITH WARNINGS:${NC} $WARNINGS warning(s)"
    echo -e "Review warnings above — they may affect production functionality."
    exit 0
else
    echo -e "${GREEN}PASSED:${NC} All checks passed"
    exit 0
fi
