#!/bin/bash
# PH11-FIX: Automated database backup with encryption and verification (CWE-404)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/qav}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-qav}"
DB_USER="${DB_USER:-qav}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/qav_${TIMESTAMP}.sql.gz.enc"

# Ensure backup directory exists with restricted permissions
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[$(date)] Starting QAV database backup..."

# Create compressed, encrypted backup
# Uses pg_dump for consistent snapshot, gzip for compression, openssl for AES-256 encryption
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --verbose 2>/dev/null | \
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -pass env:BACKUP_ENCRYPTION_KEY \
    -out "$BACKUP_FILE"

# Verify backup integrity
if [ -s "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

    # Generate SHA-256 checksum
    sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"
    echo "[$(date)] Checksum: $(cat "${BACKUP_FILE}.sha256")"
else
    echo "[$(date)] ERROR: Backup file is empty or missing"
    exit 1
fi

# Upload to S3 (if configured)
if [ -n "${S3_BACKUP_BUCKET:-}" ]; then
    aws s3 cp "$BACKUP_FILE" "s3://${S3_BACKUP_BUCKET}/backups/${TIMESTAMP}/" --sse AES256
    aws s3 cp "${BACKUP_FILE}.sha256" "s3://${S3_BACKUP_BUCKET}/backups/${TIMESTAMP}/" --sse AES256
    echo "[$(date)] Backup uploaded to S3: s3://${S3_BACKUP_BUCKET}/backups/${TIMESTAMP}/"
fi

# Cleanup old backups (local)
find "$BACKUP_DIR" -name "qav_*.sql.gz.enc" -mtime +${RETENTION_DAYS} -delete
find "$BACKUP_DIR" -name "qav_*.sha256" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days"

echo "[$(date)] Backup complete"
