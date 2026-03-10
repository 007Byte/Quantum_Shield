#!/bin/bash
# PH2-FIX: PgBouncer entrypoint with dynamic password from env
set -e

# Generate userlist from environment
PGBOUNCER_USER=${PGBOUNCER_USER:-qav}
PGBOUNCER_PASSWORD=${PGBOUNCER_PASSWORD:-dev_password_change_me}

# Generate MD5 password
MD5_PASS=$(echo -n "${PGBOUNCER_PASSWORD}${PGBOUNCER_USER}" | md5sum | cut -d' ' -f1)
echo "\"${PGBOUNCER_USER}\" \"md5${MD5_PASS}\"" > /etc/pgbouncer/userlist.txt

exec pgbouncer /etc/pgbouncer/pgbouncer.ini
