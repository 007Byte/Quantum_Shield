#!/usr/bin/env bash
# ==============================================================================
# Quantum_Shield — Synthetic Load Generator
# ==============================================================================
#
# Generates specific API traffic patterns for testing and validation.
# Simpler than the full burn-in script — meant for quick smoke tests,
# rate-limit verification, and endpoint coverage checks.
#
# Usage:
#   BASE_URL=https://staging.usbvault.io ./scripts/synthetic-load.sh [PATTERN...]
#
# Patterns (run all if none specified):
#   health       — Health check loop (30 iterations, 1s interval)
#   vault-crud   — Vault create/list/delete cycle
#   burst        — Concurrent request burst (test rate limiting)
#   websocket    — WebSocket connection lifecycle
#   auth         — SRP init/verify cycle
#   coverage     — Hit every major endpoint once
#   all          — Run all patterns sequentially
#
# Environment variables:
#   BASE_URL     — Base URL of the API (required)
#   AUTH_TOKEN   — JWT bearer token for authenticated endpoints (optional)
#   BURST_SIZE   — Number of concurrent requests in burst test (default: 50)
#   VERBOSE      — Set to "1" for detailed curl output (default: 0)
#
# Exit codes:
#   0 — All patterns completed successfully
#   1 — One or more patterns had failures
#   2 — Configuration error
#
# Requirements:
#   bash 4+, curl, jq
# ==============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

log_info()    { echo -e "${BLUE}[INFO]${NC}   $*"; }
log_ok()      { echo -e "${GREEN}[OK]${NC}     $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC}   $*"; }
log_err()     { echo -e "${RED}[FAIL]${NC}   $*"; }
log_head()    { echo -e "\n${BOLD}${CYAN}--- $* ---${NC}\n"; }
log_detail()  { [[ "${VERBOSE:-0}" == "1" ]] && echo -e "  ${DIM}$*${NC}"; return 0; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL="${BASE_URL:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
BURST_SIZE="${BURST_SIZE:-50}"
VERBOSE="${VERBOSE:-0}"

if [[ -z "$BASE_URL" ]]; then
    log_err "BASE_URL environment variable is required."
    echo "Usage: BASE_URL=https://staging.usbvault.io $0 [PATTERN...]"
    exit 2
fi

BASE_URL="${BASE_URL%/}"

for cmd in curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
        log_err "Required command not found: $cmd"
        exit 2
    fi
done

# Track results
PASS_COUNT=0
FAIL_COUNT=0
TOTAL_REQUESTS=0

# ---------------------------------------------------------------------------
# Request helper
# ---------------------------------------------------------------------------
# Usage: req METHOD PATH [DATA] [EXPECTED_CODES]
# EXPECTED_CODES is a pipe-separated list like "200|201|401"
req() {
    local method="$1"
    local path="$2"
    local data="${3:-}"
    local expected="${4:-200}"
    local url="${BASE_URL}${path}"

    local curl_args=(-s -w '\n%{http_code}|%{time_total}' -X "$method" --max-time 30)

    if [[ -n "$AUTH_TOKEN" ]]; then
        curl_args+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
    fi
    curl_args+=(-H "Content-Type: application/json")
    curl_args+=(-H "Accept: application/json")

    if [[ -n "$data" ]]; then
        curl_args+=(-d "$data")
    fi

    local output
    output=$(curl "${curl_args[@]}" "$url" 2>/dev/null) || output=$'\n000|0.000'

    local status_line
    status_line=$(echo "$output" | tail -1)
    local body
    body=$(echo "$output" | sed '$d')
    local http_code="${status_line%%|*}"
    local time_total="${status_line##*|}"
    local time_ms
    time_ms=$(echo "$time_total * 1000" | bc 2>/dev/null | cut -d. -f1 || echo "0")

    TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))

    # Check if code matches expected
    if echo "$http_code" | grep -qE "^(${expected})$"; then
        log_ok "${method} ${path} -> ${http_code} (${time_ms}ms)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_err "${method} ${path} -> ${http_code} (${time_ms}ms) [expected: ${expected}]"
        log_detail "Response: $(echo "$body" | head -c 200)"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Return body for callers that need it
    echo "$body"
}

# Silent request — returns just the HTTP code (for burst testing)
req_silent() {
    local method="$1"
    local path="$2"
    local data="${3:-}"
    local url="${BASE_URL}${path}"

    local curl_args=(-s -o /dev/null -w '%{http_code}' -X "$method" --max-time 15)
    if [[ -n "$AUTH_TOKEN" ]]; then
        curl_args+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
    fi
    curl_args+=(-H "Content-Type: application/json")
    if [[ -n "$data" ]]; then
        curl_args+=(-d "$data")
    fi

    curl "${curl_args[@]}" "$url" 2>/dev/null || echo "000"
}

# ---------------------------------------------------------------------------
# Pattern: Health Check Loop
# ---------------------------------------------------------------------------
pattern_health() {
    log_head "Pattern: Health Check Loop (30 iterations)"

    local ok_count=0
    local fail_count=0

    for i in $(seq 1 30); do
        local code
        code=$(req_silent GET "/health")
        TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))

        if [[ "$code" == "200" ]]; then
            ok_count=$((ok_count + 1))
        else
            fail_count=$((fail_count + 1))
        fi

        # Print progress every 10 iterations
        if (( i % 10 == 0 )); then
            log_info "Health check progress: ${i}/30 (ok: ${ok_count}, fail: ${fail_count})"
        fi

        sleep 1
    done

    if (( fail_count == 0 )); then
        log_ok "Health check loop: ${ok_count}/30 passed"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_err "Health check loop: ${fail_count}/30 failures"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Also check /ready and /metrics
    req GET "/ready" "" "200"                  >/dev/null
    req GET "/metrics" "" "200"                >/dev/null
    req GET "/metrics/pool" "" "200"           >/dev/null
}

# ---------------------------------------------------------------------------
# Pattern: Vault CRUD Cycle
# ---------------------------------------------------------------------------
pattern_vault_crud() {
    log_head "Pattern: Vault CRUD Cycle"

    if [[ -z "$AUTH_TOKEN" ]]; then
        log_warn "AUTH_TOKEN not set — vault CRUD will get 401 responses (still exercises routing)"
    fi

    # List vaults
    local list_body
    list_body=$(req GET "/api/v1/vaults" "" "200|401")

    # Create vault
    local vault_name="synth-load-$(date +%s)"
    local create_body
    create_body=$(req POST "/api/v1/vaults" \
        "{\"name\":\"${vault_name}\",\"description\":\"Synthetic load test vault\"}" \
        "201|200|401|403")

    # Extract vault ID if creation succeeded
    local vault_id
    vault_id=$(echo "$create_body" | jq -r '.id // .vault_id // empty' 2>/dev/null || true)

    if [[ -n "$vault_id" && "$vault_id" != "null" ]]; then
        log_info "Created vault: ${vault_id}"

        # Get vault
        req GET "/api/v1/vaults/${vault_id}" "" "200|401" >/dev/null

        # Update vault
        req PUT "/api/v1/vaults/${vault_id}" \
            "{\"name\":\"${vault_name}-updated\",\"description\":\"Updated by synthetic load\"}" \
            "200|401|403" >/dev/null

        # List members
        req GET "/api/v1/vaults/${vault_id}/members" "" "200|401|403" >/dev/null

        # List blobs
        req GET "/api/v1/vaults/${vault_id}/blobs" "" "200|401|403" >/dev/null

        # Delete vault (cleanup)
        req DELETE "/api/v1/vaults/${vault_id}" "" "200|204|401|403" >/dev/null
        log_ok "Vault lifecycle complete (created + read + updated + deleted)"
    else
        log_info "No vault ID returned (likely 401) — CRUD cycle exercised routing only"
    fi

    # List vaults again to verify delete
    req GET "/api/v1/vaults" "" "200|401" >/dev/null
}

# ---------------------------------------------------------------------------
# Pattern: Concurrent Burst (Rate Limit Test)
# ---------------------------------------------------------------------------
pattern_burst() {
    log_head "Pattern: Concurrent Burst (${BURST_SIZE} simultaneous requests)"
    log_info "Testing rate limiter behavior under burst traffic"

    local pids=()
    local result_file
    result_file=$(mktemp)

    # Launch BURST_SIZE parallel requests at health endpoint
    for i in $(seq 1 "$BURST_SIZE"); do
        (
            local code
            code=$(req_silent GET "/health")
            echo "$code" >> "$result_file"
        ) &
        pids+=($!)
    done

    # Wait for all to complete
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    # Analyze results
    local total ok_count rate_limited server_error other
    total=$(wc -l < "$result_file" | tr -d ' ')
    ok_count=$(grep -c '^200$' "$result_file" 2>/dev/null || echo 0)
    rate_limited=$(grep -c '^429$' "$result_file" 2>/dev/null || echo 0)
    server_error=$(grep -cE '^5[0-9][0-9]$' "$result_file" 2>/dev/null || echo 0)
    other=$((total - ok_count - rate_limited - server_error))

    TOTAL_REQUESTS=$((TOTAL_REQUESTS + total))

    echo -e "  ${BOLD}Burst results:${NC}"
    echo -e "    Total:        ${total}"
    echo -e "    200 OK:       ${GREEN}${ok_count}${NC}"
    echo -e "    429 Limited:  ${YELLOW}${rate_limited}${NC}"
    echo -e "    5xx Error:    ${RED}${server_error}${NC}"
    echo -e "    Other:        ${other}"

    if (( server_error == 0 )); then
        log_ok "Burst test: no server errors"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_err "Burst test: ${server_error} server errors under load"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    if (( rate_limited > 0 )); then
        log_ok "Rate limiter is active (${rate_limited} requests throttled)"
    else
        log_warn "Rate limiter did not trigger — may need higher burst size or stricter limits"
    fi

    rm -f "$result_file"

    # Second burst: target auth endpoint (stricter rate limit)
    log_info "Burst against auth endpoint (stricter rate limit)..."
    pids=()
    result_file=$(mktemp)

    for i in $(seq 1 "$BURST_SIZE"); do
        (
            local code
            code=$(req_silent POST "/api/v1/auth/srp/init" '{"email":"burst@test.io","srpA":"aabb"}')
            echo "$code" >> "$result_file"
        ) &
        pids+=($!)
    done

    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    total=$(wc -l < "$result_file" | tr -d ' ')
    rate_limited=$(grep -c '^429$' "$result_file" 2>/dev/null || echo 0)
    server_error=$(grep -cE '^5[0-9][0-9]$' "$result_file" 2>/dev/null || echo 0)

    TOTAL_REQUESTS=$((TOTAL_REQUESTS + total))

    echo -e "  ${BOLD}Auth burst results:${NC}"
    echo -e "    Total:        ${total}"
    echo -e "    429 Limited:  ${YELLOW}${rate_limited}${NC}"
    echo -e "    5xx Error:    ${RED}${server_error}${NC}"

    if (( rate_limited > 0 )); then
        log_ok "Auth rate limiter triggered (${rate_limited}/${total} throttled)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_warn "Auth rate limiter did not trigger"
    fi

    rm -f "$result_file"
}

# ---------------------------------------------------------------------------
# Pattern: WebSocket Connection Lifecycle
# ---------------------------------------------------------------------------
pattern_websocket() {
    log_head "Pattern: WebSocket Connection Lifecycle"

    # WebSocket health check
    req GET "/api/v1/sync/health" "" "200|401" >/dev/null

    # Attempt WebSocket upgrade (will be rejected without proper auth, but
    # validates the endpoint exists and responds correctly)
    log_info "Attempting WebSocket upgrade handshake..."
    local ws_result
    ws_result=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        "${BASE_URL}/api/v1/sync/ws" 2>/dev/null) || ws_result="000"

    TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))

    # WebSocket upgrade returns 101 on success, or 401/403 without auth
    if [[ "$ws_result" =~ ^(101|400|401|403|426)$ ]]; then
        log_ok "WebSocket endpoint responsive (HTTP ${ws_result})"
        PASS_COUNT=$((PASS_COUNT + 1))
    elif [[ "$ws_result" == "000" ]]; then
        log_err "WebSocket endpoint unreachable"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    else
        log_warn "WebSocket endpoint returned unexpected code: ${ws_result}"
    fi

    # Test legacy sync endpoint
    log_info "Testing legacy sync endpoint..."
    local legacy_result
    legacy_result=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
        -H "Connection: Upgrade" \
        -H "Upgrade: websocket" \
        -H "Sec-WebSocket-Version: 13" \
        -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
        "${BASE_URL}/api/v1/sync/legacy" 2>/dev/null) || legacy_result="000"

    TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))

    if [[ "$legacy_result" =~ ^(101|400|401|403|426)$ ]]; then
        log_ok "Legacy sync endpoint responsive (HTTP ${legacy_result})"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_warn "Legacy sync endpoint: HTTP ${legacy_result}"
    fi

    # Multiple rapid connect/disconnect cycles
    log_info "Running 10 rapid connect/disconnect cycles..."
    local ws_ok=0
    for i in $(seq 1 10); do
        local code
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
            -H "Connection: Upgrade" \
            -H "Upgrade: websocket" \
            -H "Sec-WebSocket-Version: 13" \
            -H "Sec-WebSocket-Key: $(openssl rand -base64 16 2>/dev/null || echo 'dGhlIHNhbXBsZSBub25jZQ==')" \
            "${BASE_URL}/api/v1/sync/ws" 2>/dev/null) || code="000"
        TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))
        [[ "$code" != "000" && ! "$code" =~ ^5 ]] && ws_ok=$((ws_ok + 1))
    done

    if (( ws_ok >= 8 )); then
        log_ok "WebSocket rapid cycle: ${ws_ok}/10 successful"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        log_err "WebSocket rapid cycle: only ${ws_ok}/10 successful"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

# ---------------------------------------------------------------------------
# Pattern: Auth Flow (SRP)
# ---------------------------------------------------------------------------
pattern_auth() {
    log_head "Pattern: Auth Flow (SRP Init/Verify)"

    # SRP init with synthetic data
    req POST "/api/v1/auth/srp/init" \
        '{"email":"synth-test@staging.usbvault.io","srpA":"deadbeef0123456789abcdef0123456789abcdef"}' \
        "200|400|404|422|429" >/dev/null

    # SRP verify with invalid session (exercises error path)
    req POST "/api/v1/auth/srp/verify" \
        '{"email":"synth-test@staging.usbvault.io","srpM":"0000000000000000"}' \
        "400|401|404|422|429" >/dev/null

    # Registration attempt (will 409 on duplicate or 422 on bad input)
    req POST "/api/v1/auth/register" \
        '{"email":"synth-noop@staging.usbvault.io","srpVerifier":"aabbccdd","srpSalt":"eeff0011"}' \
        "200|201|400|409|422|429" >/dev/null

    # Refresh token (no valid token)
    req POST "/api/v1/auth/refresh" \
        '{"refreshToken":"invalid-token"}' \
        "400|401|422|429" >/dev/null

    # Logout (exercises endpoint even without session)
    req POST "/api/v1/auth/logout" "" "200|204|401|429" >/dev/null

    # FIDO2 challenge (exercises WebAuthn flow)
    req POST "/api/v1/auth/fido2/challenge" \
        '{"email":"synth-test@staging.usbvault.io"}' \
        "200|400|404|422|429" >/dev/null

    log_ok "Auth flow pattern complete"
}

# ---------------------------------------------------------------------------
# Pattern: Full Endpoint Coverage
# ---------------------------------------------------------------------------
pattern_coverage() {
    log_head "Pattern: Full Endpoint Coverage"
    log_info "Hitting every major endpoint to verify routing and middleware"

    local auth_note=""
    if [[ -z "$AUTH_TOKEN" ]]; then
        auth_note=" (expecting 401 for authenticated endpoints)"
        log_warn "No AUTH_TOKEN — authenticated endpoints will return 401"
    fi

    # Infrastructure endpoints (public)
    req GET "/health" "" "200|503"                         >/dev/null
    req GET "/ready" "" "200|503"                          >/dev/null
    req GET "/metrics" "" "200"                            >/dev/null
    req GET "/metrics/pool" "" "200"                       >/dev/null
    req GET "/.well-known/security.txt" "" "200|404"       >/dev/null

    # Auth endpoints (public)
    req POST "/api/v1/auth/srp/init" '{"email":"cov@test.io","srpA":"aa"}' \
        "200|400|404|422|429" >/dev/null
    req POST "/api/v1/auth/srp/verify" '{"email":"cov@test.io","srpM":"bb"}' \
        "400|401|404|422|429" >/dev/null
    req POST "/api/v1/auth/register" '{"email":"cov@test.io","srpVerifier":"cc","srpSalt":"dd"}' \
        "200|201|400|409|422|429" >/dev/null
    req POST "/api/v1/auth/fido2/challenge" '{"email":"cov@test.io"}' \
        "200|400|404|422|429" >/dev/null
    req POST "/api/v1/auth/refresh" '{}' \
        "400|401|422|429" >/dev/null
    req POST "/api/v1/auth/logout" '' \
        "200|204|401|429" >/dev/null

    # Vault endpoints (authenticated)
    req GET "/api/v1/vaults" "" "200|401"                  >/dev/null
    req POST "/api/v1/vaults" '{"name":"coverage-test"}' \
        "200|201|401|403" >/dev/null

    # Shares endpoints (authenticated)
    req GET "/api/v1/shares/received" "" "200|401"         >/dev/null
    req GET "/api/v1/shares/sent" "" "200|401"             >/dev/null

    # Audit endpoints (authenticated)
    req GET "/api/v1/audit" "" "200|401"                   >/dev/null

    # Billing endpoints (authenticated)
    req GET "/api/v1/billing/subscription" "" "200|401|404" >/dev/null

    # Recovery endpoints (authenticated)
    req GET "/api/v1/recovery/remaining" "" "200|401"      >/dev/null

    # Sync health
    req GET "/api/v1/sync/health" "" "200|401"             >/dev/null

    log_ok "Endpoint coverage scan complete"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo -e "${BOLD}${CYAN}"
    echo "  Quantum_Shield — Synthetic Load Generator"
    echo -e "${NC}"
    log_info "Target:     ${BASE_URL}"
    log_info "Auth:       $([ -n "$AUTH_TOKEN" ] && echo 'token provided' || echo 'unauthenticated')"
    log_info "Burst size: ${BURST_SIZE}"
    echo ""

    # Verify connectivity
    local check_code
    check_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${BASE_URL}/health" 2>/dev/null) || check_code="000"
    if [[ "$check_code" == "000" ]]; then
        log_err "Cannot connect to ${BASE_URL}/health"
        exit 2
    fi
    log_ok "API reachable (HTTP ${check_code})"

    # Parse requested patterns
    local patterns=("$@")
    if (( ${#patterns[@]} == 0 )) || [[ "${patterns[0]}" == "all" ]]; then
        patterns=(health auth vault-crud burst websocket coverage)
    fi

    local start_time
    start_time=$(date +%s)

    for pattern in "${patterns[@]}"; do
        case "$pattern" in
            health)     pattern_health ;;
            auth)       pattern_auth ;;
            vault-crud) pattern_vault_crud ;;
            burst)      pattern_burst ;;
            websocket)  pattern_websocket ;;
            coverage)   pattern_coverage ;;
            all)        ;; # already expanded above
            *)
                log_err "Unknown pattern: ${pattern}"
                log_info "Available patterns: health, auth, vault-crud, burst, websocket, coverage, all"
                exit 2
                ;;
        esac
    done

    local end_time
    end_time=$(date +%s)
    local elapsed=$((end_time - start_time))

    # Summary
    log_head "Summary"
    echo -e "  Duration:      ${elapsed}s"
    echo -e "  Total requests: ${TOTAL_REQUESTS}"
    echo -e "  Passed:        ${GREEN}${PASS_COUNT}${NC}"
    echo -e "  Failed:        ${RED}${FAIL_COUNT}${NC}"
    echo ""

    if (( FAIL_COUNT > 0 )); then
        log_err "Synthetic load completed with ${FAIL_COUNT} failure(s)"
        exit 1
    else
        log_ok "All synthetic load patterns passed"
        exit 0
    fi
}

main "$@"
