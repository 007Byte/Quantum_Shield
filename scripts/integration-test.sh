#!/usr/bin/env bash

# Integration test orchestration for Quantum_Shield
# Starts isolated test infrastructure, runs backend and frontend E2E tests,
# then cleans up. All in one command.
#
# Usage:
#   ./scripts/integration-test.sh               # Run all integration tests
#   ./scripts/integration-test.sh --backend-only # Backend tests only
#   ./scripts/integration-test.sh --frontend-only # Frontend tests only
#   ./scripts/integration-test.sh --keep-services # Don't clean up Docker services

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.test.yml"
API_URL="http://localhost:8090"
HEALTHCHECK_TIMEOUT=60
HEALTHCHECK_INTERVAL=2

# Parse arguments
BACKEND_ONLY=false
FRONTEND_ONLY=false
KEEP_SERVICES=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --backend-only)
      BACKEND_ONLY=true
      shift
      ;;
    --frontend-only)
      FRONTEND_ONLY=true
      shift
      ;;
    --keep-services)
      KEEP_SERVICES=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Log functions
log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Cleanup function
cleanup() {
  if [ "$KEEP_SERVICES" = false ]; then
    log_info "Cleaning up Docker services..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans || true
  else
    log_warn "Services kept running (use 'docker compose -f docker-compose.test.yml down -v' to clean up)"
  fi
}

# Set trap to cleanup on exit (success or failure)
trap cleanup EXIT

# ─── Step 1: Start isolated test infrastructure ─────────────────────────

log_info "Starting isolated test infrastructure..."
cd "$PROJECT_ROOT"

docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" up -d --wait

log_info "Waiting for API to be healthy ($HEALTHCHECK_TIMEOUT seconds)..."
start_time=$(date +%s)
while true; do
  if curl -sf "$API_URL/health" >/dev/null 2>&1; then
    log_info "API is healthy!"
    break
  fi

  current_time=$(date +%s)
  elapsed=$((current_time - start_time))

  if [ $elapsed -gt $HEALTHCHECK_TIMEOUT ]; then
    log_error "API failed to become healthy within $HEALTHCHECK_TIMEOUT seconds"
    exit 1
  fi

  sleep $HEALTHCHECK_INTERVAL
done

# ─── Step 2: Run database migrations ───────────────────────────────────

if [ "$FRONTEND_ONLY" = false ]; then
  log_info "Running database migrations..."
  docker compose -f "$COMPOSE_FILE" exec -T api /app/migrate up
  log_info "Migrations complete"
fi

# ─── Step 3: Run backend integration tests ─────────────────────────────

if [ "$FRONTEND_ONLY" = false ]; then
  log_info "Running backend integration tests..."
  cd "$PROJECT_ROOT/usbvault-server"

  if docker compose -f "$COMPOSE_FILE" exec -T api go test -tags=integration -v -timeout=300s ./...; then
    log_info "Backend integration tests passed"
  else
    log_error "Backend integration tests failed"
    exit 1
  fi
fi

# ─── Step 4: Run frontend E2E tests ────────────────────────────────────

if [ "$BACKEND_ONLY" = false ]; then
  log_info "Running frontend E2E tests against real backend..."
  cd "$PROJECT_ROOT/usbvault-app"

  # Set API_URL for frontend tests to hit the test backend
  if API_URL="$API_URL" npx playwright test; then
    log_info "Frontend E2E tests passed"
  else
    log_error "Frontend E2E tests failed"
    exit 1
  fi
fi

# ─── Summary ───────────────────────────────────────────────────────────

log_info "All integration tests passed!"
echo ""
echo "Test Results Summary:"
echo "  Backend tests:   $([ "$FRONTEND_ONLY" = false ] && echo "✓ Passed" || echo "⊘ Skipped")"
echo "  Frontend tests:  $([ "$BACKEND_ONLY" = false ] && echo "✓ Passed" || echo "⊘ Skipped")"
echo "  Database:        ✓ Cleaned up"
echo ""
