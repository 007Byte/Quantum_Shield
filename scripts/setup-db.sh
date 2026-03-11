#!/bin/bash
#
# USBVault Enterprise — Full Database Setup
#
# This script initializes the complete database stack:
#   1. Starts PostgreSQL, Redis, MinIO via Docker Compose
#   2. Waits for services to be healthy
#   3. Runs all database migrations
#   4. Verifies the schema
#
# Usage:
#   ./scripts/setup-db.sh              # Full setup with Docker
#   ./scripts/setup-db.sh --migrate    # Run migrations only (assumes DB is running)
#   ./scripts/setup-db.sh --status     # Check migration status only
#   ./scripts/setup-db.sh --reset      # Drop and recreate database (DESTRUCTIVE)
#

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Resolve paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$PROJECT_ROOT/usbvault-server"

# Default DATABASE_URL for local development
DEFAULT_DB_URL="postgres://usbvault:dev_password_change_me@localhost:5432/usbvault_dev?sslmode=disable"

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${BOLD}==> $*${NC}"; }

# ────────────────────────────────────────────────
# Check prerequisites
# ────────────────────────────────────────────────
check_prerequisites() {
    log_step "Checking prerequisites"

    local missing=0

    if ! command -v docker &>/dev/null; then
        log_error "Docker is not installed. Install from https://docs.docker.com/get-docker/"
        missing=1
    else
        log_ok "Docker found: $(docker --version)"
    fi

    if ! command -v go &>/dev/null; then
        log_error "Go is not installed. Install from https://go.dev/dl/"
        missing=1
    else
        log_ok "Go found: $(go version)"
    fi

    if ! docker info &>/dev/null 2>&1; then
        log_error "Docker daemon is not running. Start Docker Desktop or the Docker service."
        missing=1
    else
        log_ok "Docker daemon is running"
    fi

    if [ $missing -ne 0 ]; then
        log_error "Missing prerequisites — cannot continue."
        exit 1
    fi
}

# ────────────────────────────────────────────────
# Start Docker services
# ────────────────────────────────────────────────
start_services() {
    log_step "Starting Docker services (PostgreSQL, Redis, MinIO)"

    cd "$PROJECT_ROOT"

    docker compose up -d postgres redis minio createbuckets 2>&1 | while read -r line; do
        echo "  $line"
    done

    log_info "Waiting for services to become healthy..."

    # Wait for PostgreSQL
    local retries=30
    while [ $retries -gt 0 ]; do
        if docker compose exec -T postgres pg_isready -U usbvault -d usbvault_dev &>/dev/null; then
            log_ok "PostgreSQL is ready"
            break
        fi
        retries=$((retries - 1))
        sleep 2
    done
    if [ $retries -eq 0 ]; then
        log_error "PostgreSQL failed to start within 60 seconds"
        exit 1
    fi

    # Wait for Redis
    retries=15
    while [ $retries -gt 0 ]; do
        if docker compose exec -T redis redis-cli -a dev_redis_pass ping 2>/dev/null | grep -q PONG; then
            log_ok "Redis is ready"
            break
        fi
        retries=$((retries - 1))
        sleep 2
    done
    if [ $retries -eq 0 ]; then
        log_warn "Redis may not be ready — continuing anyway"
    fi

    # Wait for MinIO
    retries=15
    while [ $retries -gt 0 ]; do
        if curl -sf http://localhost:9000/minio/health/live &>/dev/null; then
            log_ok "MinIO is ready"
            break
        fi
        retries=$((retries - 1))
        sleep 2
    done
    if [ $retries -eq 0 ]; then
        log_warn "MinIO may not be ready — continuing anyway"
    fi
}

# ────────────────────────────────────────────────
# Install PostgreSQL extensions
# ────────────────────────────────────────────────
install_extensions() {
    log_step "Installing PostgreSQL extensions"

    docker compose exec -T postgres psql -U usbvault -d usbvault_dev -c \
        "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";" \
        2>/dev/null

    log_ok "Extensions installed (uuid-ossp, pgcrypto)"
}

# ────────────────────────────────────────────────
# Run migrations
# ────────────────────────────────────────────────
run_migrations() {
    log_step "Running database migrations"

    export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DB_URL}"
    cd "$SERVER_DIR"

    go run ./cmd/migrate/main.go up

    log_ok "All migrations applied"
}

# ────────────────────────────────────────────────
# Check migration status
# ────────────────────────────────────────────────
check_status() {
    log_step "Checking migration status"

    export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DB_URL}"
    cd "$SERVER_DIR"

    go run ./cmd/migrate/main.go status
}

# ────────────────────────────────────────────────
# Verify schema
# ────────────────────────────────────────────────
verify_schema() {
    log_step "Verifying database schema"

    local expected_tables=(
        "schema_migrations"
        "users"
        "vaults"
        "blobs"
        "vault_members"
        "share_records"
        "public_keys"
        "audit_log"
        "audit_log_archive"
        "sessions"
        "devices"
        "subscriptions"
        "device_enrollments"
        "recovery_codes"
        "key_rotation_jobs"
        "jwt_signing_keys"
        "security_events"
    )

    local missing=0
    for table in "${expected_tables[@]}"; do
        result=$(docker compose exec -T postgres psql -U usbvault -d usbvault_dev -tAc \
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');" 2>/dev/null)
        if [ "$result" = "t" ]; then
            log_ok "Table: $table"
        else
            log_error "Missing table: $table"
            missing=$((missing + 1))
        fi
    done

    if [ $missing -eq 0 ]; then
        log_ok "All ${#expected_tables[@]} expected tables exist"
    else
        log_error "$missing table(s) missing — check migration output above"
        return 1
    fi

    # Check extensions
    for ext in uuid-ossp pgcrypto; do
        result=$(docker compose exec -T postgres psql -U usbvault -d usbvault_dev -tAc \
            "SELECT EXISTS (SELECT FROM pg_extension WHERE extname = '$ext');" 2>/dev/null)
        if [ "$result" = "t" ]; then
            log_ok "Extension: $ext"
        else
            log_warn "Extension missing: $ext"
        fi
    done
}

# ────────────────────────────────────────────────
# Reset database (DESTRUCTIVE)
# ────────────────────────────────────────────────
reset_database() {
    log_step "Resetting database (DESTRUCTIVE)"

    echo -e "${RED}${BOLD}WARNING: This will destroy ALL data in the database.${NC}"
    read -p "Type 'yes' to confirm: " confirm
    if [ "$confirm" != "yes" ]; then
        log_info "Reset cancelled"
        exit 0
    fi

    cd "$PROJECT_ROOT"
    docker compose exec -T postgres psql -U usbvault -d postgres -c "DROP DATABASE IF EXISTS usbvault_dev;" 2>/dev/null
    docker compose exec -T postgres psql -U usbvault -d postgres -c "CREATE DATABASE usbvault_dev;" 2>/dev/null
    log_ok "Database recreated"

    install_extensions
    run_migrations
    verify_schema
}

# ────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────
main() {
    echo -e "${BOLD}${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║   USBVault Enterprise — Database Setup   ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"

    case "${1:-full}" in
        --migrate|-m)
            run_migrations
            ;;
        --status|-s)
            check_status
            ;;
        --reset)
            check_prerequisites
            reset_database
            ;;
        --verify)
            verify_schema
            ;;
        full|--full)
            check_prerequisites
            start_services
            install_extensions
            run_migrations
            verify_schema
            echo ""
            log_step "Setup complete"
            echo -e "${GREEN}${BOLD}Database is fully initialized and ready.${NC}"
            echo ""
            echo "  PostgreSQL: localhost:5432 (user: usbvault, db: usbvault_dev)"
            echo "  Redis:      localhost:6379 (password: dev_redis_pass)"
            echo "  MinIO:      localhost:9000 (console: localhost:9001)"
            echo ""
            echo "  Start the API server:"
            echo "    cd usbvault-server && go run ./cmd/api/"
            echo ""
            ;;
        *)
            echo "Usage: $0 [full|--migrate|--status|--reset|--verify]"
            echo ""
            echo "  full       Full setup: Docker + extensions + migrations + verify (default)"
            echo "  --migrate  Run pending migrations only"
            echo "  --status   Show migration status"
            echo "  --reset    Drop and recreate database (DESTRUCTIVE)"
            echo "  --verify   Verify schema tables exist"
            exit 1
            ;;
    esac
}

main "$@"
