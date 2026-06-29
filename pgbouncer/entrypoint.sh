#!/bin/bash
# PH2-FIX: PgBouncer entrypoint with dynamic password from env
set -e

# Generate userlist from environment
PGBOUNCER_USER=${PGBOUNCER_USER:-usbvault}
PGBOUNCER_PASSWORD=${PGBOUNCER_PASSWORD:-dev_password_change_me}

# Generate MD5 password
MD5_PASS=$(echo -n "${PGBOUNCER_PASSWORD}${PGBOUNCER_USER}" | md5sum | cut -d' ' -f1)
echo "\"${PGBOUNCER_USER}\" \"md5${MD5_PASS}\"" > /etc/pgbouncer/userlist.txt

# Cert-presence guard: if the mounted config enables client TLS, the server
# cert+key MUST be present or PgBouncer would silently refuse every TLS
# handshake (turning into a total API->DB outage). Fail loudly instead.
# Dev/test mount the plain pgbouncer.ini (no client_tls_sslmode line), so this
# guard is a no-op there and dev keeps working unchanged.
CERT_DIR=/etc/pgbouncer/certs
if grep -q '^client_tls_sslmode' /etc/pgbouncer/pgbouncer.ini && [ "${PGBOUNCER_REQUIRE_TLS:-1}" = "1" ]; then
  if [ ! -s "$CERT_DIR/pgbouncer.crt" ] || [ ! -s "$CERT_DIR/pgbouncer.key" ]; then
    echo "FATAL: client_tls_sslmode set but $CERT_DIR/pgbouncer.{crt,key} missing/empty" >&2
    exit 1
  fi
fi

exec pgbouncer /etc/pgbouncer/pgbouncer.ini
