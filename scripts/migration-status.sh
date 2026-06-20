#!/usr/bin/env bash
#
# USBVault Migration Status Check
#
# Compares applied migrations in the database against available migration files.
#
# Usage:
#   ./scripts/migration-status.sh [DATABASE_URL]
#
# Exit codes:
#   0 — All migrations applied, no gaps
#   1 — Pending migrations exist
#   2 — Gap detected (applied migrations are out of sequence)
#
# Environment variables:
#   DATABASE_URL    — PostgreSQL connection string (or pass as $1)
#   MIGRATIONS_DIR  — Path to migration SQL files (default: usbvault-server/migrations)
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
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$PROJECT_ROOT/usbvault-server/migrations}"

# Accept DATABASE_URL as argument or env var
DATABASE_URL="${1:-${DATABASE_URL:-}}"

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}[ERROR]${NC} DATABASE_URL is required"
    echo "Usage: $0 [DATABASE_URL]"
    echo "  Or set DATABASE_URL environment variable"
    exit 2
fi

# Parse DATABASE_URL into components for psql
PG_USER="$(echo "$DATABASE_URL" | sed -E 's|.*://([^:]+):.*|\1|')"
PG_HOST="$(echo "$DATABASE_URL" | sed -E 's|.*@([^:]+):.*|\1|')"
PG_PORT="$(echo "$DATABASE_URL" | sed -E 's|.*:([0-9]+)/.*|\1|')"
PG_DB="$(echo "$DATABASE_URL" | sed -E 's|.*/([^?]+).*|\1|')"

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ────────────────────────────────────────────────
# Gather available migration files
# ────────────────────────────────────────────────
get_available_migrations() {
    if [ ! -d "$MIGRATIONS_DIR" ]; then
        log_error "Migrations directory not found: $MIGRATIONS_DIR"
        exit 2
    fi

    find "$MIGRATIONS_DIR" -name "*.sql" -type f | sort | while read -r f; do
        basename "$f"
    done
}

# ────────────────────────────────────────────────
# Gather applied migrations from database
# ────────────────────────────────────────────────
get_applied_migrations() {
    psql \
        -h "$PG_HOST" \
        -p "$PG_PORT" \
        -U "$PG_USER" \
        -d "$PG_DB" \
        -tAc "SELECT version FROM schema_migrations ORDER BY version;" 2>/dev/null || {
        log_error "Failed to query schema_migrations table. Is the database running?"
        exit 2
    }
}

# ────────────────────────────────────────────────
# Main logic
# ────────────────────────────────────────────────
echo -e "${BOLD}USBVault Migration Status${NC}"
echo "========================"
echo ""

# Get lists
available=$(get_available_migrations)
applied=$(get_applied_migrations)

available_count=$(echo "$available" | grep -c . || true)
applied_count=$(echo "$applied" | grep -c . || true)

log_info "Migrations directory: $MIGRATIONS_DIR"
log_info "Database: $PG_DB on $PG_HOST:$PG_PORT"
echo ""

echo -e "${BOLD}Available migration files: $available_count${NC}"
echo -e "${BOLD}Applied migrations:        $applied_count${NC}"
echo ""

# Determine pending and gap status
has_pending=false
has_gap=false
found_unapplied=false
found_applied_after_gap=false

echo -e "${BOLD}Migration Details:${NC}"
echo "─────────────────────────────────────────────"

while IFS= read -r migration_file; do
    [ -z "$migration_file" ] && continue

    # Check if this migration version is in the applied list
    if echo "$applied" | grep -qF "$migration_file"; then
        echo -e "  ${GREEN}[APPLIED]${NC}  $migration_file"
        if $found_unapplied; then
            found_applied_after_gap=true
        fi
    else
        echo -e "  ${YELLOW}[PENDING]${NC}  $migration_file"
        has_pending=true
        found_unapplied=true
    fi
done <<< "$available"

echo "─────────────────────────────────────────────"
echo ""

# Check for gap: applied migration exists after an unapplied one
if $found_applied_after_gap; then
    has_gap=true
fi

# Report results
if $has_gap; then
    log_error "GAP DETECTED: Applied migrations exist after unapplied ones"
    log_error "This indicates migrations were applied out of order"
    echo ""
    echo "Action required: Review migration history and resolve the gap manually."
    exit 2
elif $has_pending; then
    log_warn "Pending migrations detected"
    pending_count=$((available_count - applied_count))
    echo ""
    echo "$pending_count migration(s) need to be applied."
    echo "Run: ./scripts/setup-db.sh --migrate"
    exit 1
else
    log_ok "All migrations are applied — database schema is up to date"
    exit 0
fi
