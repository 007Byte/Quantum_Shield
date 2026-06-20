#!/usr/bin/env bash
# Generates production secrets for USBVault Enterprise
# Usage: ./scripts/generate-secrets.sh [output-dir]
#
# This script generates all cryptographic material and passwords needed
# for a production deployment. It is idempotent by default — existing
# secrets are preserved unless --force is passed.
#
# Generated artifacts:
#   jwt_private.key   - ED25519 private key (base64-encoded)
#   jwt_public.key    - ED25519 public key (base64-encoded)
#   backup.key        - 32-byte backup encryption key (base64-encoded)
#   postgres.password  - Strong random PostgreSQL password
#   redis.password     - Strong random Redis password

set -euo pipefail

# ------------------------------------------------------------------
# Argument parsing
# ------------------------------------------------------------------
FORCE=false
OUTPUT_DIR=""

for arg in "$@"; do
    case "$arg" in
        --force)
            FORCE=true
            ;;
        -h|--help)
            echo "Usage: $0 [--force] [output-dir]"
            echo ""
            echo "Options:"
            echo "  --force       Overwrite existing secret files"
            echo "  output-dir    Directory for generated secrets (default: ./secrets)"
            echo ""
            echo "Generated files:"
            echo "  jwt_private.key    ED25519 private key (base64)"
            echo "  jwt_public.key     ED25519 public key (base64)"
            echo "  backup.key         Backup encryption key (base64)"
            echo "  postgres.password  PostgreSQL password"
            echo "  redis.password     Redis password"
            exit 0
            ;;
        *)
            OUTPUT_DIR="$arg"
            ;;
    esac
done

OUTPUT_DIR="${OUTPUT_DIR:-./secrets}"

# ------------------------------------------------------------------
# Color helpers
# ------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ------------------------------------------------------------------
# Pre-flight checks
# ------------------------------------------------------------------
if ! command -v openssl &>/dev/null; then
    error "openssl is required but not found in PATH"
    exit 1
fi

# ------------------------------------------------------------------
# Create output directory
# ------------------------------------------------------------------
mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
info "Output directory: $OUTPUT_DIR"

# ------------------------------------------------------------------
# Helper: write secret only if it doesn't exist (or --force)
# ------------------------------------------------------------------
write_secret() {
    local file="$1"
    local description="$2"
    local value="$3"

    if [[ -f "$file" ]] && [[ "$FORCE" != "true" ]]; then
        warn "$description already exists at $file — skipping (use --force to overwrite)"
        return 0
    fi

    echo -n "$value" > "$file"
    chmod 600 "$file"
    info "Generated $description -> $file"
}

# ------------------------------------------------------------------
# 1. ED25519 JWT key pair
# ------------------------------------------------------------------
info "Generating ED25519 JWT key pair..."

TMPDIR_KEYS=$(mktemp -d)
trap 'rm -rf "$TMPDIR_KEYS"' EXIT

# Generate raw ED25519 key pair via openssl
openssl genpkey -algorithm ED25519 -out "$TMPDIR_KEYS/ed25519_private.pem" 2>/dev/null

# Extract the raw 32-byte private seed + 32-byte public key in DER, then base64-encode
# openssl outputs a 48-byte DER for ED25519 private keys (16 header + 32 seed)
# We need the full 64-byte ed25519 private key (seed || public) for Go's ed25519 package
PRIV_DER=$(openssl pkey -in "$TMPDIR_KEYS/ed25519_private.pem" -outform DER 2>/dev/null | tail -c 32)
PUB_DER=$(openssl pkey -in "$TMPDIR_KEYS/ed25519_private.pem" -pubout -outform DER 2>/dev/null | tail -c 32)

# Go's ed25519.PrivateKey is 64 bytes: seed (32) || public (32)
PRIV_B64=$(printf '%s%s' "$PRIV_DER" "$PUB_DER" | base64)
PUB_B64=$(echo -n "$PUB_DER" | base64)

write_secret "$OUTPUT_DIR/jwt_private.key" "JWT ED25519 private key" "$PRIV_B64"
write_secret "$OUTPUT_DIR/jwt_public.key"  "JWT ED25519 public key"  "$PUB_B64"

# ------------------------------------------------------------------
# 2. Backup encryption key (32 bytes, base64-encoded)
# ------------------------------------------------------------------
info "Generating backup encryption key..."
BACKUP_KEY=$(openssl rand -base64 32)
write_secret "$OUTPUT_DIR/backup.key" "Backup encryption key" "$BACKUP_KEY"

# ------------------------------------------------------------------
# 3. PostgreSQL password
# ------------------------------------------------------------------
info "Generating PostgreSQL password..."
PG_PASS=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)
write_secret "$OUTPUT_DIR/postgres.password" "PostgreSQL password" "$PG_PASS"

# ------------------------------------------------------------------
# 4. Redis password
# ------------------------------------------------------------------
info "Generating Redis password..."
REDIS_PASS=$(openssl rand -base64 32 | tr -d '/+=' | head -c 40)
write_secret "$OUTPUT_DIR/redis.password" "Redis password" "$REDIS_PASS"

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
echo ""
info "===== Secret generation complete ====="
echo ""
echo "Files created in: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"
echo ""
echo "---------------------------------------------------------------"
echo "NEXT STEPS"
echo "---------------------------------------------------------------"
echo ""
echo "1. Copy secrets to your production environment:"
echo "   scp -r $OUTPUT_DIR user@production-host:/etc/usbvault/secrets/"
echo ""
echo "2. Set environment variables by referencing the key files:"
echo "   export JWT_ED25519_PRIVATE_KEY_FILE=/etc/usbvault/secrets/jwt_private.key"
echo "   export JWT_ED25519_PUBLIC_KEY_FILE=/etc/usbvault/secrets/jwt_public.key"
echo "   export BACKUP_ENCRYPTION_KEY=\$(cat /etc/usbvault/secrets/backup.key)"
echo ""
echo "   Or load keys inline (less secure):"
echo "   export JWT_ED25519_PRIVATE_KEY=\$(cat $OUTPUT_DIR/jwt_private.key)"
echo "   export JWT_ED25519_PUBLIC_KEY=\$(cat $OUTPUT_DIR/jwt_public.key)"
echo ""
echo "3. Configure DATABASE_URL with the generated password:"
echo "   export DATABASE_URL=postgres://usbvault:\$(cat $OUTPUT_DIR/postgres.password)@db-host:5432/usbvault?sslmode=verify-full"
echo ""
echo "4. Configure REDIS_URL with the generated password:"
echo "   export REDIS_URL=redis://:\$(cat $OUTPUT_DIR/redis.password)@redis-host:6379"
echo ""
echo "5. Validate the full configuration:"
echo "   ./scripts/validate-env.sh"
echo ""
echo "IMPORTANT: Store these secrets securely. Consider using a secrets"
echo "manager (AWS Secrets Manager, HashiCorp Vault, etc.) in production."
echo "---------------------------------------------------------------"
