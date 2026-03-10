#!/usr/bin/env bash
# QAV Certificate Pin Extraction Script
# Usage: ./scripts/extract-pins.sh [hostname] [port]
#
# Extracts SHA-256 SPKI pins from a server's TLS certificate chain.
# Output can be directly used in EXPO_PUBLIC_PIN_* environment variables.
#
# Example:
#   ./scripts/extract-pins.sh api.usbvault.io 443
#   export EXPO_PUBLIC_PIN_PRIMARY="sha256/abc123..."
#   export EXPO_PUBLIC_PIN_BACKUP="sha256/def456..."

set -euo pipefail

HOSTNAME="${1:-api.usbvault.io}"
PORT="${2:-443}"

echo "=== QAV Certificate Pin Extraction ==="
echo "Host: ${HOSTNAME}:${PORT}"
echo ""

# Extract the full certificate chain
CHAIN=$(openssl s_client -connect "${HOSTNAME}:${PORT}" \
  -servername "${HOSTNAME}" \
  -showcerts < /dev/null 2>/dev/null)

if [ -z "$CHAIN" ]; then
  echo "ERROR: Could not connect to ${HOSTNAME}:${PORT}"
  exit 1
fi

# Parse each certificate in the chain
CERT_NUM=0
echo "$CHAIN" | awk '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/' | \
while IFS= read -r line; do
  if [[ "$line" == "-----BEGIN CERTIFICATE-----" ]]; then
    CERT_NUM=$((CERT_NUM + 1))
    CERT_FILE=$(mktemp)
    echo "$line" > "$CERT_FILE"
  elif [[ "$line" == "-----END CERTIFICATE-----" ]]; then
    echo "$line" >> "$CERT_FILE"

    # Extract SPKI pin
    PIN=$(openssl x509 -in "$CERT_FILE" -pubkey -noout 2>/dev/null | \
          openssl pkey -pubin -outform der 2>/dev/null | \
          openssl dgst -sha256 -binary | \
          base64)

    # Get subject and issuer
    SUBJECT=$(openssl x509 -in "$CERT_FILE" -noout -subject 2>/dev/null | sed 's/subject=//')
    ISSUER=$(openssl x509 -in "$CERT_FILE" -noout -issuer 2>/dev/null | sed 's/issuer=//')
    EXPIRY=$(openssl x509 -in "$CERT_FILE" -noout -enddate 2>/dev/null | sed 's/notAfter=//')

    echo "--- Certificate #${CERT_NUM} ---"
    echo "  Subject: ${SUBJECT}"
    echo "  Issuer:  ${ISSUER}"
    echo "  Expires: ${EXPIRY}"
    echo "  SPKI Pin: sha256/${PIN}"
    echo ""

    if [ "$CERT_NUM" -eq 1 ]; then
      echo "  >> Use as EXPO_PUBLIC_PIN_PRIMARY=\"sha256/${PIN}\""
    elif [ "$CERT_NUM" -eq 2 ]; then
      echo "  >> Use as EXPO_PUBLIC_PIN_BACKUP=\"sha256/${PIN}\""
    fi
    echo ""

    rm -f "$CERT_FILE"
  else
    echo "$line" >> "$CERT_FILE"
  fi
done

echo "=== Configuration ==="
echo "Add to your .env or CI/CD pipeline:"
echo "  EXPO_PUBLIC_API_HOSTNAME=${HOSTNAME}"
echo "  EXPO_PUBLIC_PIN_PRIMARY=\"sha256/<leaf-pin-from-above>\""
echo "  EXPO_PUBLIC_PIN_BACKUP=\"sha256/<intermediate-pin-from-above>\""
echo "  EXPO_PUBLIC_PIN_EXPIRATION=\"<expiry-date-YYYY-MM-DD>\""
