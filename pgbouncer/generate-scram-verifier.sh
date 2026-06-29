#!/usr/bin/env bash
# Generate a PostgreSQL SCRAM-SHA-256 verifier for a password, for use as the
# PgBouncer client-leg credential (auth_type = scram-sha-256).
#
# Run this on an OPS workstation / CI runner that has OpenSSL 3.x — NOT inside
# the edoburu/pgbouncer container (that minimal image has no openssl). Feed the
# output to the pgbouncer service as PGBOUNCER_SCRAM_VERIFIER (or write it to a
# mounted secret referenced by PGBOUNCER_SCRAM_VERIFIER_FILE). The password MUST
# be the one the API uses in DATABASE_URL.
#
# Output format (PostgreSQL pg_authid.rolpassword):
#   SCRAM-SHA-256$<iterations>:<base64 salt>$<base64 StoredKey>:<base64 ServerKey>
#
# Verified byte-identical to PostgreSQL's own verifier (reusing PG's salt).
#
# Usage:
#   ./generate-scram-verifier.sh '<password>' [iterations]
#   PGBOUNCER_SCRAM_VERIFIER="$(./generate-scram-verifier.sh "$POSTGRES_PASSWORD")"
set -euo pipefail

PASSWORD="${1:?usage: generate-scram-verifier.sh <password> [iterations]}"
ITERS="${2:-4096}"

if ! openssl kdf -help >/dev/null 2>&1 || ! openssl mac -help >/dev/null 2>&1; then
  echo "ERROR: OpenSSL 3.x with 'kdf' and 'mac' subcommands is required." >&2
  echo "       openssl version: $(openssl version 2>&1)" >&2
  exit 1
fi

SALT_HEX=$(openssl rand -hex 16)
SALT_B64=$(printf '%s' "$SALT_HEX" | xxd -r -p | openssl base64 -A)

# SaltedPassword = PBKDF2-HMAC-SHA256(password, salt, iterations, dkLen=32) -> hex
SALTED=$(openssl kdf -keylen 32 -kdfopt digest:SHA2-256 \
  -kdfopt "pass:${PASSWORD}" -kdfopt "hexsalt:${SALT_HEX}" -kdfopt "iter:${ITERS}" PBKDF2 \
  | tr -d ':' | tr 'A-F' 'a-f')

# ClientKey = HMAC-SHA256(SaltedPassword, "Client Key"); StoredKey = SHA256(ClientKey)
CLIENTKEY_HEX=$(printf 'Client Key' | openssl mac -digest SHA2-256 -macopt "hexkey:${SALTED}" HMAC | tr 'A-F' 'a-f')
STOREDKEY_B64=$(printf '%s' "$CLIENTKEY_HEX" | xxd -r -p | openssl dgst -sha256 -binary | openssl base64 -A)

# ServerKey = HMAC-SHA256(SaltedPassword, "Server Key")
SERVERKEY_B64=$(printf 'Server Key' | openssl mac -digest SHA2-256 -macopt "hexkey:${SALTED}" HMAC \
  | tr 'A-F' 'a-f' | xxd -r -p | openssl base64 -A)

printf 'SCRAM-SHA-256$%s:%s$%s:%s\n' "$ITERS" "$SALT_B64" "$STOREDKEY_B64" "$SERVERKEY_B64"
