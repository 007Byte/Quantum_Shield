#!/usr/bin/env bash
# =============================================================================
# USBVault Enterprise — Production Deployment Orchestrator
# =============================================================================
#
# Orchestrates the complete production deployment sequence:
#   1. Preflight checks (tools, credentials, connectivity)
#   2. Infrastructure provisioning (Terraform)
#   3. Kubernetes setup (namespaces, cert-manager, ExternalSecrets)
#   4. Application deployment (Helm)
#   5. Post-deploy verification (rollout, health check)
#   6. Optional burn-in trigger
#
# Usage:
#   ./scripts/deploy-production.sh [OPTIONS]
#
# Options:
#   --yes              Skip all confirmation prompts
#   --dry-run          Show what would happen without executing
#   --skip-terraform   Skip infrastructure provisioning (app-only redeploy)
#   --burn-in          Start burn-in test in background after deploy
#   -h, --help         Show this help
#
# Environment variables:
#   AWS_REGION         AWS region (default: us-east-1)
#   ENVIRONMENT        Target environment: staging | production (default: production)
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TERRAFORM_DIR="$PROJECT_ROOT/deploy/terraform"
K8S_DIR="$PROJECT_ROOT/deploy/k8s"
CHART_DIR="$PROJECT_ROOT/deploy/chart"
LOG_DIR="$PROJECT_ROOT/deploy-logs"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
LOG_FILE="$LOG_DIR/deploy-${TIMESTAMP}.log"

NAMESPACE="usbvault"
HEALTH_URL="https://api.usbvault.io/health"
DEPLOYMENT_NAME="usbvault-api"

# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

STEP_NUM=0
TOTAL_STEPS=5

info()    { echo -e "${GREEN}[INFO]${NC}    $*" | tee -a "$LOG_FILE"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}    $*" | tee -a "$LOG_FILE"; }
error()   { echo -e "${RED}[ERROR]${NC}   $*" | tee -a "$LOG_FILE" >&2; }
success() { echo -e "${GREEN}[OK]${NC}      $*" | tee -a "$LOG_FILE"; }

step() {
    STEP_NUM=$((STEP_NUM + 1))
    echo "" | tee -a "$LOG_FILE"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
    echo -e "${BOLD}${BLUE}  Step ${STEP_NUM}/${TOTAL_STEPS} — $*${NC}" | tee -a "$LOG_FILE"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
}

die() {
    error "$1"
    echo "" | tee -a "$LOG_FILE"
    error "Deployment aborted. Log: $LOG_FILE"
    exit 1
}

run_cmd() {
    local desc="$1"
    shift
    info "$desc"
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "  ${YELLOW}[DRY-RUN]${NC} $*" | tee -a "$LOG_FILE"
        return 0
    fi
    echo "  > $*" >> "$LOG_FILE"
    if ! "$@" >> "$LOG_FILE" 2>&1; then
        error "Command failed: $*"
        error "See log for details: $LOG_FILE"
        return 1
    fi
}

confirm() {
    local prompt="$1"
    if [[ "$AUTO_YES" == "true" ]]; then
        info "Auto-confirmed: $prompt"
        return 0
    fi
    echo "" | tee -a "$LOG_FILE"
    echo -ne "  ${BOLD}${prompt}${NC} [y/N]: "
    read -r answer
    echo "  User response: $answer" >> "$LOG_FILE"
    if [[ "${answer,,}" != "y" && "${answer,,}" != "yes" ]]; then
        die "User declined. Aborting."
    fi
}

# ---------------------------------------------------------------------------
# Signal trap and cleanup
# ---------------------------------------------------------------------------
CLEANUP_DONE=false

cleanup() {
    if [[ "$CLEANUP_DONE" == "true" ]]; then
        return
    fi
    CLEANUP_DONE=true

    echo "" | tee -a "$LOG_FILE"
    warn "Caught signal — cleaning up..."

    # Remove any terraform plan file if it exists
    if [[ -f "$TERRAFORM_DIR/tfplan" ]]; then
        rm -f "$TERRAFORM_DIR/tfplan"
        info "Removed terraform plan file"
    fi

    warn "Deployment interrupted. Partial state may exist."
    warn "Review log: $LOG_FILE"
    exit 130
}

trap cleanup INT TERM HUP

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
AUTO_YES=false
DRY_RUN=false
SKIP_TERRAFORM=false
BURN_IN=false

for arg in "$@"; do
    case "$arg" in
        --yes)             AUTO_YES=true ;;
        --dry-run)         DRY_RUN=true ;;
        --skip-terraform)  SKIP_TERRAFORM=true ;;
        --burn-in)         BURN_IN=true ;;
        -h|--help)
            head -30 "$0" | tail -27
            exit 0
            ;;
        *)
            error "Unknown option: $arg"
            echo "Run with --help for usage."
            exit 1
            ;;
    esac
done

# Adjust step count based on flags
if [[ "$SKIP_TERRAFORM" == "true" ]]; then
    TOTAL_STEPS=4
fi
if [[ "$BURN_IN" == "true" ]]; then
    TOTAL_STEPS=$((TOTAL_STEPS + 1))
fi

# ---------------------------------------------------------------------------
# Create log directory
# ---------------------------------------------------------------------------
mkdir -p "$LOG_DIR"
echo "USBVault Enterprise — Deployment Log" > "$LOG_FILE"
echo "Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$LOG_FILE"
echo "Options: $*" >> "$LOG_FILE"
echo "---" >> "$LOG_FILE"

echo "" | tee -a "$LOG_FILE"
echo -e "${BOLD}${CYAN}  USBVault Enterprise — Production Deployment${NC}" | tee -a "$LOG_FILE"
echo -e "  $(date -u '+%Y-%m-%d %H:%M:%S UTC')" | tee -a "$LOG_FILE"
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}DRY-RUN MODE — no changes will be made${NC}" | tee -a "$LOG_FILE"
fi
echo "" | tee -a "$LOG_FILE"

# ==========================================================================
# Step 1: Preflight Checks
# ==========================================================================
step "Preflight Checks"

# --- Check required tools ---
REQUIRED_TOOLS=(terraform kubectl helm aws jq)
MISSING_TOOLS=()

for tool in "${REQUIRED_TOOLS[@]}"; do
    if command -v "$tool" &>/dev/null; then
        local_version=$("$tool" version 2>/dev/null | head -1 || "$tool" --version 2>/dev/null | head -1 || echo "available")
        success "$tool found: $local_version"
    else
        MISSING_TOOLS+=("$tool")
        error "$tool not found in PATH"
    fi
done

if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
    die "Missing required tools: ${MISSING_TOOLS[*]}. Install them and retry."
fi

# --- Check / prompt environment variables ---
if [[ -z "${AWS_REGION:-}" ]]; then
    if [[ "$AUTO_YES" == "true" ]]; then
        export AWS_REGION="us-east-1"
        info "AWS_REGION not set, defaulting to us-east-1"
    else
        echo -ne "  ${BOLD}AWS_REGION not set. Enter region [us-east-1]:${NC} "
        read -r input_region
        export AWS_REGION="${input_region:-us-east-1}"
    fi
fi
success "AWS_REGION: $AWS_REGION"

if [[ -z "${ENVIRONMENT:-}" ]]; then
    if [[ "$AUTO_YES" == "true" ]]; then
        export ENVIRONMENT="production"
        info "ENVIRONMENT not set, defaulting to production"
    else
        echo -ne "  ${BOLD}ENVIRONMENT not set. Enter environment (staging/production) [production]:${NC} "
        read -r input_env
        export ENVIRONMENT="${input_env:-production}"
    fi
fi

# Validate environment value
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    die "ENVIRONMENT must be 'staging' or 'production', got: $ENVIRONMENT"
fi
success "ENVIRONMENT: $ENVIRONMENT"

# --- Check AWS credentials ---
info "Verifying AWS credentials..."
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} aws sts get-caller-identity" | tee -a "$LOG_FILE"
else
    CALLER_IDENTITY=$(aws sts get-caller-identity --output json 2>&1) || die "AWS credentials invalid or expired. Run 'aws configure' or refresh your SSO session."
    AWS_ACCOUNT=$(echo "$CALLER_IDENTITY" | jq -r '.Account')
    AWS_ARN=$(echo "$CALLER_IDENTITY" | jq -r '.Arn')
    success "AWS authenticated: account=$AWS_ACCOUNT arn=$AWS_ARN"
fi

# --- Check kubectl connectivity ---
info "Verifying kubectl cluster connectivity..."
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} kubectl cluster-info" | tee -a "$LOG_FILE"
else
    CLUSTER_INFO=$(kubectl cluster-info 2>&1 | head -1) || die "kubectl cannot reach the cluster. Check your kubeconfig and VPN connection."
    success "Cluster reachable: $CLUSTER_INFO"
fi

# --- Check Helm repo access ---
info "Verifying Helm repo access..."
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} helm repo list" | tee -a "$LOG_FILE"
else
    if helm repo list &>/dev/null; then
        success "Helm repos accessible"
    else
        warn "No Helm repos configured. This is OK if using local charts."
    fi
fi

# --- Verify required deploy files exist ---
if [[ "$SKIP_TERRAFORM" != "true" ]]; then
    [[ -d "$TERRAFORM_DIR" ]] || die "Terraform directory not found: $TERRAFORM_DIR"
    [[ -f "$TERRAFORM_DIR/main.tf" ]] || die "main.tf not found in $TERRAFORM_DIR"
    success "Terraform directory verified: $TERRAFORM_DIR"
fi

[[ -d "$K8S_DIR" ]] || die "Kubernetes manifests directory not found: $K8S_DIR"
[[ -f "$K8S_DIR/namespace.yaml" ]] || die "namespace.yaml not found in $K8S_DIR"
[[ -f "$K8S_DIR/cert-manager-issuer.yaml" ]] || die "cert-manager-issuer.yaml not found in $K8S_DIR"
[[ -f "$K8S_DIR/secrets.yaml" ]] || die "secrets.yaml not found in $K8S_DIR"
success "Kubernetes manifests verified: $K8S_DIR"

[[ -f "$K8S_DIR/production-values.yaml" ]] || die "production-values.yaml not found in $K8S_DIR"
success "Helm values file verified: $K8S_DIR/production-values.yaml"

# --- Confirmation ---
echo "" | tee -a "$LOG_FILE"
echo -e "  ${BOLD}Deployment Summary:${NC}" | tee -a "$LOG_FILE"
echo -e "    Environment:      ${BOLD}$ENVIRONMENT${NC}" | tee -a "$LOG_FILE"
echo -e "    AWS Region:       ${BOLD}$AWS_REGION${NC}" | tee -a "$LOG_FILE"
echo -e "    Skip Terraform:   ${BOLD}$SKIP_TERRAFORM${NC}" | tee -a "$LOG_FILE"
echo -e "    Burn-in:          ${BOLD}$BURN_IN${NC}" | tee -a "$LOG_FILE"
echo -e "    Dry Run:          ${BOLD}$DRY_RUN${NC}" | tee -a "$LOG_FILE"
echo -e "    Log File:         ${BOLD}$LOG_FILE${NC}" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

if [[ "$ENVIRONMENT" == "production" ]]; then
    echo -e "  ${RED}${BOLD}WARNING: You are deploying to PRODUCTION.${NC}" | tee -a "$LOG_FILE"
fi

confirm "Proceed with deployment?"
success "Deployment confirmed"

# ==========================================================================
# Step 2: Infrastructure Provisioning (Terraform)
# ==========================================================================
if [[ "$SKIP_TERRAFORM" == "true" ]]; then
    info "Skipping infrastructure provisioning (--skip-terraform)"
else
    step "Infrastructure Provisioning (Terraform)"

    # terraform init
    info "Initializing Terraform..."
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "  ${YELLOW}[DRY-RUN]${NC} cd $TERRAFORM_DIR && terraform init" | tee -a "$LOG_FILE"
    else
        (cd "$TERRAFORM_DIR" && terraform init -input=false) >> "$LOG_FILE" 2>&1 \
            || die "terraform init failed. Check backend configuration and network connectivity."
        success "Terraform initialized"
    fi

    # terraform plan
    info "Generating Terraform plan..."
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "  ${YELLOW}[DRY-RUN]${NC} cd $TERRAFORM_DIR && terraform plan -out=tfplan -var=\"environment=$ENVIRONMENT\" -var=\"aws_region=$AWS_REGION\"" | tee -a "$LOG_FILE"
    else
        (cd "$TERRAFORM_DIR" && terraform plan \
            -var="environment=$ENVIRONMENT" \
            -var="aws_region=$AWS_REGION" \
            -input=false \
            -out=tfplan) >> "$LOG_FILE" 2>&1 \
            || die "terraform plan failed. Review the log: $LOG_FILE"
        success "Terraform plan generated"

        # Show plan summary
        echo "" | tee -a "$LOG_FILE"
        info "Plan summary:"
        (cd "$TERRAFORM_DIR" && terraform show -no-color tfplan) 2>/dev/null | \
            grep -E "^(Plan:|  #|  \+|  -|  ~)" | head -30 | tee -a "$LOG_FILE"
        echo "" | tee -a "$LOG_FILE"
    fi

    # Confirm apply
    confirm "Apply this Terraform plan?"

    # terraform apply
    info "Applying Terraform plan..."
    if [[ "$DRY_RUN" == "true" ]]; then
        echo -e "  ${YELLOW}[DRY-RUN]${NC} cd $TERRAFORM_DIR && terraform apply tfplan" | tee -a "$LOG_FILE"
    else
        (cd "$TERRAFORM_DIR" && terraform apply -input=false tfplan) >> "$LOG_FILE" 2>&1 \
            || die "terraform apply failed. Infrastructure may be in a partial state. Review: $LOG_FILE"
        success "Terraform apply complete"

        # Clean up plan file
        rm -f "$TERRAFORM_DIR/tfplan"
    fi
fi

# ==========================================================================
# Step 3: Kubernetes Setup
# ==========================================================================
step "Kubernetes Setup"

# Apply namespace
run_cmd "Applying namespace..." \
    kubectl apply -f "$K8S_DIR/namespace.yaml" \
    || die "Failed to apply namespace manifest"
success "Namespace '$NAMESPACE' applied"

# Apply cert-manager issuer
run_cmd "Applying cert-manager ClusterIssuer..." \
    kubectl apply -f "$K8S_DIR/cert-manager-issuer.yaml" \
    || die "Failed to apply cert-manager issuer. Is cert-manager installed?"
success "ClusterIssuer applied"

# Apply ExternalSecrets
run_cmd "Applying ExternalSecrets configuration..." \
    kubectl apply -f "$K8S_DIR/secrets.yaml" \
    || die "Failed to apply ExternalSecrets. Is the ExternalSecrets Operator installed?"
success "ExternalSecrets applied"

# Wait for ExternalSecrets to sync
info "Waiting for ExternalSecrets to sync (timeout: 120s)..."
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} kubectl wait --for=condition=Ready externalsecret/usbvault-secrets -n $NAMESPACE --timeout=120s" | tee -a "$LOG_FILE"
else
    if ! kubectl wait --for=condition=Ready externalsecret/usbvault-secrets \
        -n "$NAMESPACE" --timeout=120s >> "$LOG_FILE" 2>&1; then
        warn "ExternalSecret 'usbvault-secrets' did not reach Ready state within 120s."
        warn "Secrets may still be syncing. Check: kubectl get externalsecret -n $NAMESPACE"
        confirm "Continue anyway?"
    else
        success "ExternalSecret 'usbvault-secrets' is Ready"
    fi

    # Also wait for JWT keys secret
    info "Waiting for JWT keys ExternalSecret (timeout: 120s)..."
    if ! kubectl wait --for=condition=Ready externalsecret/usbvault-jwt-keys \
        -n "$NAMESPACE" --timeout=120s >> "$LOG_FILE" 2>&1; then
        warn "ExternalSecret 'usbvault-jwt-keys' did not reach Ready state within 120s."
        confirm "Continue anyway?"
    else
        success "ExternalSecret 'usbvault-jwt-keys' is Ready"
    fi
fi

# ==========================================================================
# Step 4: Application Deployment (Helm)
# ==========================================================================
step "Application Deployment (Helm)"

HELM_CMD=(
    helm upgrade --install "$NAMESPACE" "$CHART_DIR/"
    -f "$K8S_DIR/production-values.yaml"
    -n "$NAMESPACE"
    --set "global.environment=$ENVIRONMENT"
    --wait
    --timeout 5m
)

info "Deploying via Helm..."
info "  Chart:  $CHART_DIR"
info "  Values: $K8S_DIR/production-values.yaml"
info "  Namespace: $NAMESPACE"

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} ${HELM_CMD[*]}" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
    info "Running Helm dry-run to validate templates..."
    echo -e "  ${YELLOW}[DRY-RUN]${NC} helm upgrade --install $NAMESPACE $CHART_DIR/ -f $K8S_DIR/production-values.yaml -n $NAMESPACE --dry-run" | tee -a "$LOG_FILE"
else
    "${HELM_CMD[@]}" >> "$LOG_FILE" 2>&1 \
        || die "Helm deployment failed. Check: helm status $NAMESPACE -n $NAMESPACE"
    success "Helm deployment complete"
fi

# ==========================================================================
# Step 5: Post-Deploy Verification
# ==========================================================================
step "Post-Deploy Verification"

# Wait for rollout
info "Waiting for deployment rollout: $DEPLOYMENT_NAME..."
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} kubectl rollout status deployment/$DEPLOYMENT_NAME -n $NAMESPACE --timeout=300s" | tee -a "$LOG_FILE"
else
    if ! kubectl rollout status "deployment/$DEPLOYMENT_NAME" \
        -n "$NAMESPACE" --timeout=300s >> "$LOG_FILE" 2>&1; then
        error "Deployment rollout did not complete within 300s"
        error "Check pod status: kubectl get pods -n $NAMESPACE"
        error "Check events:     kubectl get events -n $NAMESPACE --sort-by=.lastTimestamp"
        die "Rollout verification failed"
    fi
    success "Deployment '$DEPLOYMENT_NAME' rolled out successfully"
fi

# Show pod status
if [[ "$DRY_RUN" != "true" ]]; then
    info "Pod status:"
    kubectl get pods -n "$NAMESPACE" -l "app=$DEPLOYMENT_NAME" \
        -o wide --no-headers 2>/dev/null | while IFS= read -r line; do
        echo "    $line" | tee -a "$LOG_FILE"
    done
fi

# Health check via curl
info "Running health check: $HEALTH_URL"
if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "  ${YELLOW}[DRY-RUN]${NC} curl -sf $HEALTH_URL" | tee -a "$LOG_FILE"
else
    HEALTH_RETRIES=5
    HEALTH_DELAY=10
    HEALTH_OK=false

    for i in $(seq 1 "$HEALTH_RETRIES"); do
        HTTP_CODE=$(curl -sf -o /dev/null -w '%{http_code}' --max-time 15 "$HEALTH_URL" 2>/dev/null) || HTTP_CODE="000"
        if [[ "$HTTP_CODE" == "200" ]]; then
            HEALTH_OK=true
            break
        fi
        info "  Attempt $i/$HEALTH_RETRIES: HTTP $HTTP_CODE — retrying in ${HEALTH_DELAY}s..."
        sleep "$HEALTH_DELAY"
    done

    if [[ "$HEALTH_OK" == "true" ]]; then
        success "Health check passed: HTTP 200"
    else
        warn "Health check did not return 200 after $HEALTH_RETRIES attempts."
        warn "The application may still be starting. Verify manually:"
        warn "  curl -v $HEALTH_URL"
    fi
fi

# ==========================================================================
# Optional: Burn-In Trigger
# ==========================================================================
if [[ "$BURN_IN" == "true" ]]; then
    step "Burn-In Trigger"

    BURN_IN_SCRIPT="$SCRIPT_DIR/staging-burn-in.sh"
    if [[ ! -x "$BURN_IN_SCRIPT" ]]; then
        warn "Burn-in script not found or not executable: $BURN_IN_SCRIPT"
        warn "Skipping burn-in."
    elif [[ "$DRY_RUN" == "true" ]]; then
        echo -e "  ${YELLOW}[DRY-RUN]${NC} STAGING_URL=$HEALTH_URL DURATION_HOURS=168 $BURN_IN_SCRIPT &" | tee -a "$LOG_FILE"
    else
        BURN_IN_URL="${HEALTH_URL%/health}"
        info "Starting burn-in test in background..."
        info "  Target: $BURN_IN_URL"
        info "  Script: $BURN_IN_SCRIPT"

        STAGING_URL="$BURN_IN_URL" nohup "$BURN_IN_SCRIPT" \
            >> "$LOG_DIR/burn-in-${TIMESTAMP}.log" 2>&1 &
        BURN_IN_PID=$!

        success "Burn-in started (PID: $BURN_IN_PID)"
        info "  Monitor: tail -f $LOG_DIR/burn-in-${TIMESTAMP}.log"
    fi
fi

# ==========================================================================
# Deployment Summary
# ==========================================================================
echo "" | tee -a "$LOG_FILE"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
echo -e "${BOLD}${GREEN}  Deployment Complete${NC}" | tee -a "$LOG_FILE"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo -e "  Environment:  ${BOLD}$ENVIRONMENT${NC}" | tee -a "$LOG_FILE"
echo -e "  Region:       ${BOLD}$AWS_REGION${NC}" | tee -a "$LOG_FILE"
echo -e "  Namespace:    ${BOLD}$NAMESPACE${NC}" | tee -a "$LOG_FILE"
echo -e "  Deployment:   ${BOLD}$DEPLOYMENT_NAME${NC}" | tee -a "$LOG_FILE"
echo -e "  Health URL:   ${BOLD}$HEALTH_URL${NC}" | tee -a "$LOG_FILE"
echo -e "  Log file:     ${BOLD}$LOG_FILE${NC}" | tee -a "$LOG_FILE"
if [[ "$BURN_IN" == "true" && "${BURN_IN_PID:-}" != "" ]]; then
    echo -e "  Burn-in PID:  ${BOLD}$BURN_IN_PID${NC}" | tee -a "$LOG_FILE"
fi
echo "" | tee -a "$LOG_FILE"
echo -e "  Useful commands:" | tee -a "$LOG_FILE"
echo -e "    kubectl get pods -n $NAMESPACE" | tee -a "$LOG_FILE"
echo -e "    kubectl logs -f deployment/$DEPLOYMENT_NAME -n $NAMESPACE" | tee -a "$LOG_FILE"
echo -e "    helm status $NAMESPACE -n $NAMESPACE" | tee -a "$LOG_FILE"
echo -e "    helm history $NAMESPACE -n $NAMESPACE" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

echo "Completed: $(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$LOG_FILE"
