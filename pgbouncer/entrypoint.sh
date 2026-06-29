#!/bin/sh
# PgBouncer entrypoint: render the userlist for the configured auth_type, then
# start PgBouncer.
#
# POSIX sh (the edoburu/pgbouncer image is Alpine and ships NO bash). The
# auth_type is read from the MOUNTED pgbouncer.ini so dev (md5) and prod
# (scram-sha-256) share one script without drift.
set -eu

CONFIG=/etc/pgbouncer/pgbouncer.ini
USERLIST=/etc/pgbouncer/userlist.txt
CERT_DIR=/etc/pgbouncer/certs

PGBOUNCER_USER="${PGBOUNCER_USER:-usbvault}"
PGBOUNCER_PASSWORD="${PGBOUNCER_PASSWORD:-dev_password_change_me}"

# auth_type as configured in the mounted ini (first uncommented occurrence).
AUTH_TYPE=$(sed -n 's/^[[:space:]]*auth_type[[:space:]]*=[[:space:]]*//p' "$CONFIG" | head -n1 | tr -d '[:space:]')

case "$AUTH_TYPE" in
  scram-sha-256)
    # SCRAM-SHA-256 verifiers require PBKDF2/HMAC, which this minimal image
    # cannot compute (no openssl/python). The verifier is therefore supplied
    # OUT-OF-BAND so we never derive or ship a wrong credential:
    #   - PGBOUNCER_SCRAM_VERIFIER       — the verifier string, or
    #   - PGBOUNCER_SCRAM_VERIFIER_FILE  — a file/secret containing it.
    # Generate it with pgbouncer/generate-scram-verifier.sh (or from Postgres:
    # SELECT rolpassword FROM pg_authid WHERE rolname='<user>'). It MUST match
    # the password the API uses to connect. Fail loudly if absent — a missing
    # verifier must never silently fall back to an insecure or broken auth.
    if [ -n "${PGBOUNCER_SCRAM_VERIFIER:-}" ]; then
      VERIFIER="$PGBOUNCER_SCRAM_VERIFIER"
    elif [ -n "${PGBOUNCER_SCRAM_VERIFIER_FILE:-}" ] && [ -s "${PGBOUNCER_SCRAM_VERIFIER_FILE}" ]; then
      VERIFIER=$(cat "${PGBOUNCER_SCRAM_VERIFIER_FILE}")
    else
      echo "FATAL: auth_type=scram-sha-256 but no SCRAM verifier provided." >&2
      echo "  Set PGBOUNCER_SCRAM_VERIFIER or PGBOUNCER_SCRAM_VERIFIER_FILE for user '${PGBOUNCER_USER}'." >&2
      echo "  Generate it with: pgbouncer/generate-scram-verifier.sh '<password>'" >&2
      exit 1
    fi
    case "$VERIFIER" in
      'SCRAM-SHA-256$'*) : ;;
      *)
        echo "FATAL: PGBOUNCER_SCRAM_VERIFIER is not a SCRAM-SHA-256 verifier" >&2
        echo "  (expected 'SCRAM-SHA-256\$<iter>:<salt>\$<storedkey>:<serverkey>')." >&2
        exit 1
        ;;
    esac
    printf '"%s" "%s"\n' "$PGBOUNCER_USER" "$VERIFIER" > "$USERLIST"
    ;;
  md5|"")
    # Legacy MD5 (dev/test). md5sum IS present in the image. The verifier is
    # md5(password || username), prefixed with the literal "md5".
    MD5_PASS=$(printf '%s' "${PGBOUNCER_PASSWORD}${PGBOUNCER_USER}" | md5sum | cut -d' ' -f1)
    printf '"%s" "md5%s"\n' "$PGBOUNCER_USER" "$MD5_PASS" > "$USERLIST"
    ;;
  *)
    echo "FATAL: unsupported auth_type '${AUTH_TYPE}' in ${CONFIG} (expected md5 or scram-sha-256)" >&2
    exit 1
    ;;
esac

# Cert-presence guard: if the mounted config enables client TLS, the server
# cert+key MUST be present or PgBouncer would silently refuse every TLS
# handshake (turning into a total API->DB outage). Fail loudly instead.
# Dev/test mount the plain pgbouncer.ini (no client_tls_sslmode line), so this
# guard is a no-op there and dev keeps working unchanged.
if grep -q '^client_tls_sslmode' "$CONFIG" && [ "${PGBOUNCER_REQUIRE_TLS:-1}" = "1" ]; then
  if [ ! -s "$CERT_DIR/pgbouncer.crt" ] || [ ! -s "$CERT_DIR/pgbouncer.key" ]; then
    echo "FATAL: client_tls_sslmode set but $CERT_DIR/pgbouncer.{crt,key} missing/empty" >&2
    exit 1
  fi
fi

exec pgbouncer "$CONFIG"
