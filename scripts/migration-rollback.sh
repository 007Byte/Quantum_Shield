#!/usr/bin/env bash
#
# USBVault Migration Rollback Guide
#
# Since USBVault uses forward-only migrations (no down migrations),
# rollback is accomplished by restoring from a database backup.
#
# Usage:
#   ./scripts/migration-rollback.sh <backup-file>
#   ./scripts/migration-rollback.sh --backup              # Create backup only
#   ./scripts/migration-rollback.sh --status              # Show current migration version
#   ./scripts/migration-rollback.sh --list-backups        # List available backups
#
# Environment variables:
#   DATABASE_URL    — PostgreSQL connection string (required)
#   BACKUP_DIR      — Directory for backups (default: ./backups)
#   PG_HOST         — PostgreSQL host (parsed from DATABASE_URL if not set)
#   PG_PORT         — PostgreSQL port (parsed from DATABASE_URL if not set)
#   PG_USER         — PostgreSQL user (parsed from DATABASE_URL if not set)
#   PG_DB           — PostgreSQL database (parsed from DATABASE_URL if not set)
#

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_ROOT/backups}"

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step()  { echo -e "\n${BOLD}==> $*${NC}"; }

# Parse DATABASE_URL into components
parse_db_url() {
    local url="${DATABASE_URL:-}"
    if [ -z "$url" ]; then
        log_error "DATABASE_URL environment variable is required"
        exit 1
    fi

    # Parse: postgres://user:pass@host:port/dbname?params
    PG_USER="${PG_USER:-$(echo "$url" | sed -E 's|.*://([^:]+):.*|\1|')}"
    PG_HOST="${PG_HOST:-$(echo "$url" | sed -E 's|.*@([^:]+):.*|\1|')}"
    PG_PORT="${PG_PORT:-$(echo "$url" | sed -E 's|.*:([0-9]+)/.*|\1|')}"
    PG_DB="${PG_DB:-$(echo "$url" | sed -E 's|.*/([^?]+).*|\1|')}"
}

# ────────────────────────────────────────────────
# Create a backup
# ────────────────────────────────────────────────
create_backup() {
    log_step "Creating database backup"
    parse_db_url

    mkdir -p "$BACKUP_DIR"
    local timestamp
    timestamp=$(date -u +'%Y%m%d_%H%M%S')
    local backup_file="$BACKUP_DIR/usbvault_${PG_DB}_${timestamp}.dump"

    log_info "Backing up $PG_DB on $PG_HOST:$PG_PORT..."

    pg_dump \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d "$PG_DB" \
        -Fc \
        --no-owner \
        --no-privileges \
        -f "$backup_file"

    local size
    size=$(du -h "$backup_file" | cut -f1)
    log_ok "Backup created: $backup_file ($size)"
    echo "$backup_file"
}

# ────────────────────────────────────────────────
# List available backups
# ────────────────────────────────────────────────
list_backups() {
    log_step "Available backups"
    mkdir -p "$BACKUP_DIR"

    local count
    count=$(find "$BACKUP_DIR" -name "usbvault_*.dump" 2>/dev/null | wc -l | tr -d ' ')

    if [ "$count" -eq 0 ]; then
        log_warn "No backups found in $BACKUP_DIR"
        return
    fi

    find "$BACKUP_DIR" -name "usbvault_*.dump" -exec ls -lh {} \; | sort -k6,7
    echo ""
    log_info "$count backup(s) found"
}

# ────────────────────────────────────────────────
# Show current migration status
# ────────────────────────────────────────────────
show_status() {
    log_step "Current migration status"
    parse_db_url

    local result
    result=$(psql \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d "$PG_DB" \
        -tAc "SELECT version, applied_at FROM schema_migrations ORDER BY version;" 2>/dev/null) || {
        log_error "Failed to query migration status. Is the database running?"
        exit 1
    }

    if [ -z "$result" ]; then
        log_warn "No migrations have been applied"
    else
        echo "$result" | while IFS='|' read -r version applied_at; do
            echo "  $version  (applied: $applied_at)"
        done
        local count
        count=$(echo "$result" | wc -l | tr -d ' ')
        log_ok "$count migration(s) applied"
    fi
}

# ────────────────────────────────────────────────
# Restore from backup
# ────────────────────────────────────────────────
restore_backup() {
    local backup_file="$1"

    if [ ! -f "$backup_file" ]; then
        log_error "Backup file not found: $backup_file"
        exit 1
    fi

    parse_db_url

    echo -e "${RED}${BOLD}"
    echo "WARNING: Database Rollback"
    echo "========================="
    echo "This will:"
    echo "  1. Stop accepting new connections to $PG_DB"
    echo "  2. Drop and recreate the database"
    echo "  3. Restore from: $backup_file"
    echo ""
    echo "ALL CURRENT DATA WILL BE REPLACED with the backup contents."
    echo -e "${NC}"

    read -p "Type 'restore' to confirm: " confirm
    if [ "$confirm" != "restore" ]; then
        log_info "Rollback cancelled"
        exit 0
    fi

    log_step "Step 1: Creating safety backup before rollback"
    local safety_backup
    safety_backup=$(create_backup) || {
        log_error "Failed to create safety backup. Aborting rollback."
        exit 1
    }
    log_ok "Safety backup at: $safety_backup"

    log_step "Step 2: Terminating active connections"
    psql \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d postgres \
        -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PG_DB' AND pid <> pg_backend_pid();" \
        2>/dev/null || true

    log_step "Step 3: Dropping and recreating database"
    psql \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d postgres \
        -c "DROP DATABASE IF EXISTS $PG_DB;" \
        2>/dev/null

    psql \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d postgres \
        -c "CREATE DATABASE $PG_DB;" \
        2>/dev/null

    log_step "Step 4: Restoring from backup"
    pg_restore \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d "$PG_DB" \
        --no-owner \
        --no-privileges \
        --clean \
        --if-exists \
        "$backup_file" 2>/dev/null || {
        log_warn "pg_restore completed with warnings (this is normal for --clean --if-exists)"
    }

    log_step "Step 5: Verifying restored migration status"
    show_status

    log_step "Step 6: Verifying database connectivity"
    local table_count
    table_count=$(psql \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d "$PG_DB" \
        -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null)

    log_ok "Database restored with $table_count tables"

    echo ""
    echo -e "${GREEN}${BOLD}Rollback complete.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify the application works: curl http://localhost:8080/health"
    echo "  2. If using Kubernetes, restart pods: kubectl rollout restart deployment/usbvault-api -n usbvault"
    echo "  3. Safety backup preserved at: $safety_backup"
    echo ""
}

# ────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────
main() {
    echo -e "${BOLD}${CYAN}"
    echo "USBVault Migration Rollback"
    echo "==========================="
    echo -e "${NC}"

    case "${1:-}" in
        --backup|-b)
            create_backup
            ;;
        --status|-s)
            show_status
            ;;
        --list-backups|-l)
            list_backups
            ;;
        --help|-h|"")
            echo "Usage: $0 <backup-file> | --backup | --status | --list-backups"
            echo ""
            echo "  <backup-file>    Restore database from a .dump backup file"
            echo "  --backup, -b     Create a new backup of the current database"
            echo "  --status, -s     Show current migration status"
            echo "  --list-backups   List available backup files"
            echo ""
            echo "Environment: DATABASE_URL (required), BACKUP_DIR (default: ./backups)"
            exit 1
            ;;
        *)
            restore_backup "$1"
            ;;
    esac
}

main "$@"
