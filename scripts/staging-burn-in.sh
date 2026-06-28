#!/usr/bin/env bash
# ==============================================================================
# Quantum_Shield — Staging Burn-In Test (LAUNCH-10)
# ==============================================================================
#
# Runs synthetic load against the staging API for a configurable duration
# (default: 7 days) and continuously monitors system health metrics.
#
# Usage:
#   STAGING_URL=https://staging.usbvault.io ./scripts/staging-burn-in.sh
#
# Environment variables:
#   STAGING_URL      — Base URL of the staging API (required)
#   DURATION_HOURS   — Duration of the burn-in in hours (default: 168 = 7 days)
#   CONCURRENCY      — Number of concurrent workers (default: 10)
#   RPS              — Target requests per second (default: 5)
#   REPORT_DIR       — Directory for reports and logs (default: ./burn-in-reports)
#   AUTH_TOKEN       — JWT token for authenticated endpoints (optional, will
#                      attempt SRP auth if not provided)
#   PROMETHEUS_URL   — Prometheus metrics URL override (default: ${STAGING_URL}/metrics)
#
# Exit codes:
#   0 — Burn-in passed all thresholds
#   1 — Threshold breach detected
#   2 — Configuration or setup error
#   3 — Interrupted by signal
#
# Requirements:
#   bash 4+, curl, jq, bc, date (GNU or BSD)
# ==============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color output helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_err()   { echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"; }
log_head()  { echo -e "\n${BOLD}${CYAN}=== $* ===${NC}\n"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
STAGING_URL="${STAGING_URL:-}"
DURATION_HOURS="${DURATION_HOURS:-168}"
CONCURRENCY="${CONCURRENCY:-10}"
RPS="${RPS:-5}"
REPORT_DIR="${REPORT_DIR:-./burn-in-reports}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
PROMETHEUS_URL="${PROMETHEUS_URL:-}"

# Thresholds (from LAUNCH_CHECKLIST.md Section 7)
THRESHOLD_ERROR_RATE="0.001"       # 0.1% — stricter than rollback (1%)
THRESHOLD_P99_LATENCY_MS="500"     # 500ms
THRESHOLD_MEMORY_GROWTH_PCT="20"   # 20% above baseline
THRESHOLD_GOROUTINE_GROWTH_PCT="10" # 10% above baseline

# Intervals
HEALTH_CHECK_INTERVAL=30           # seconds
METRICS_POLL_INTERVAL=300          # 5 minutes
LOG_ROTATE_SIZE=$((10 * 1024 * 1024))  # 10 MB

# Internal state
TOTAL_REQUESTS=0
ERROR_5XX_COUNT=0
BASELINE_MEMORY=0
BASELINE_GOROUTINES=0
START_EPOCH=0
EXIT_CODE=0
WORKER_PIDS=()

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
if [[ -z "$STAGING_URL" ]]; then
    log_err "STAGING_URL environment variable is required."
    echo "Usage: STAGING_URL=https://staging.usbvault.io $0"
    exit 2
fi

# Strip trailing slash
STAGING_URL="${STAGING_URL%/}"
PROMETHEUS_URL="${PROMETHEUS_URL:-${STAGING_URL}/metrics}"

# Check dependencies
for cmd in curl jq bc; do
    if ! command -v "$cmd" &>/dev/null; then
        log_err "Required command not found: $cmd"
        exit 2
    fi
done

# ---------------------------------------------------------------------------
# Setup report directory and log files
# ---------------------------------------------------------------------------
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
RUN_DIR="${REPORT_DIR}/run_${TIMESTAMP}"
mkdir -p "$RUN_DIR"

REQUEST_LOG="${RUN_DIR}/requests.log"
METRICS_LOG="${RUN_DIR}/metrics.jsonl"
HEALTH_LOG="${RUN_DIR}/health.jsonl"
ERROR_LOG="${RUN_DIR}/errors.log"
REPORT_FILE="${RUN_DIR}/burn-in-report.json"
MAIN_LOG="${RUN_DIR}/burn-in.log"

# Tee output to main log
exec > >(tee -a "$MAIN_LOG") 2>&1

# ---------------------------------------------------------------------------
# Signal handling and cleanup
# ---------------------------------------------------------------------------
cleanup() {
    log_head "Shutting down burn-in test"

    # Kill all worker processes
    for pid in "${WORKER_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done

    # Wait briefly for cleanup
    sleep 1

    # Force kill any stragglers
    for pid in "${WORKER_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
    done

    # Generate final report
    generate_report

    log_info "Logs and report saved to: ${RUN_DIR}"
    exit "${EXIT_CODE:-3}"
}

trap cleanup INT TERM

# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

# Rotate a log file if it exceeds LOG_ROTATE_SIZE
rotate_log() {
    local logfile="$1"
    if [[ -f "$logfile" ]]; then
        local size
        size=$(stat -f%z "$logfile" 2>/dev/null || stat --format=%s "$logfile" 2>/dev/null || echo 0)
        if (( size > LOG_ROTATE_SIZE )); then
            mv "$logfile" "${logfile}.$(date '+%Y%m%d%H%M%S').bak"
            touch "$logfile"
            log_info "Rotated log: $logfile"
        fi
    fi
}

# Make an API request and record the result
# Usage: api_request METHOD PATH [DATA]
api_request() {
    local method="$1"
    local path="$2"
    local data="${3:-}"
    local url="${STAGING_URL}${path}"
    local start_ms end_ms duration_ms http_code

    local curl_args=(-s -o /dev/null -w '%{http_code}:%{time_total}' -X "$method" --max-time 30)

    if [[ -n "$AUTH_TOKEN" ]]; then
        curl_args+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
    fi
    curl_args+=(-H "Content-Type: application/json")

    if [[ -n "$data" ]]; then
        curl_args+=(-d "$data")
    fi

    local result
    result=$(curl "${curl_args[@]}" "$url" 2>/dev/null) || result="000:0.000"

    http_code="${result%%:*}"
    local time_total="${result##*:}"
    duration_ms=$(echo "$time_total * 1000" | bc 2>/dev/null || echo "0")

    # Record
    TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))

    if [[ "$http_code" =~ ^5[0-9][0-9]$ ]]; then
        ERROR_5XX_COUNT=$((ERROR_5XX_COUNT + 1))
        echo "$(date '+%Y-%m-%d %H:%M:%S') ${method} ${path} ${http_code} ${duration_ms}ms" >> "$ERROR_LOG"
    fi

    echo "$(date '+%Y-%m-%d %H:%M:%S') ${method} ${path} ${http_code} ${duration_ms}ms" >> "$REQUEST_LOG"

    # Return http code for callers
    echo "$http_code"
}

# Fetch a single Prometheus metric value
# Usage: prom_metric METRIC_NAME [LABEL_FILTER]
prom_metric() {
    local metric_name="$1"
    local result
    result=$(curl -s --max-time 10 "${PROMETHEUS_URL}" 2>/dev/null | \
        grep "^${metric_name}" | grep -v '^#' | head -1 | awk '{print $NF}') || true
    echo "${result:-0}"
}

# ---------------------------------------------------------------------------
# Traffic pattern workers
# ---------------------------------------------------------------------------

# Worker: Health check polling (every 30s)
worker_health_check() {
    log_info "Starting health check worker (interval: ${HEALTH_CHECK_INTERVAL}s)"
    while true; do
        local result
        result=$(curl -s --max-time 10 -w '\n%{http_code}' "${STAGING_URL}/health" 2>/dev/null) || true
        local http_code
        http_code=$(echo "$result" | tail -1)
        local body
        body=$(echo "$result" | sed '$d')

        local entry
        entry=$(jq -cn \
            --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
            --arg code "$http_code" \
            --argjson body "$(echo "$body" | jq -c '.' 2>/dev/null || echo '{}')" \
            '{timestamp: $ts, http_code: $code, body: $body}')
        echo "$entry" >> "$HEALTH_LOG"

        TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))
        if [[ "$http_code" =~ ^5[0-9][0-9]$ ]]; then
            ERROR_5XX_COUNT=$((ERROR_5XX_COUNT + 1))
            log_warn "Health check returned ${http_code}"
        fi

        sleep "$HEALTH_CHECK_INTERVAL"
    done
}

# Worker: SRP auth flow simulation
worker_auth_flow() {
    local delay
    delay=$(echo "scale=2; $CONCURRENCY / $RPS" | bc 2>/dev/null || echo "2")
    log_info "Starting auth flow worker (delay: ${delay}s)"

    while true; do
        # SRP init — expects 400/422 with fake data, but exercises the endpoint
        local init_payload='{"email":"burnin-test@staging.usbvault.io","srpA":"deadbeef0123456789abcdef"}'
        api_request POST "/api/v1/auth/srp/init" "$init_payload" >/dev/null

        # SRP verify — will fail with invalid session, but exercises the path
        local verify_payload='{"email":"burnin-test@staging.usbvault.io","srpM":"deadbeef"}'
        api_request POST "/api/v1/auth/srp/verify" "$verify_payload" >/dev/null

        # Register attempt — will 409 or 422 on duplicate/bad input
        local register_payload='{"email":"burnin-noop@staging.usbvault.io","srpVerifier":"aabb","srpSalt":"ccdd"}'
        api_request POST "/api/v1/auth/register" "$register_payload" >/dev/null

        sleep "$delay"
    done
}

# Worker: Vault CRUD operations (requires AUTH_TOKEN)
worker_vault_crud() {
    local delay
    delay=$(echo "scale=2; ($CONCURRENCY / $RPS) * 2" | bc 2>/dev/null || echo "4")
    log_info "Starting vault CRUD worker (delay: ${delay}s)"

    while true; do
        # List vaults
        api_request GET "/api/v1/vaults" >/dev/null

        # Create vault
        local create_payload
        create_payload=$(jq -cn --arg name "burn-in-$(date +%s)" '{name: $name, description: "Burn-in test vault"}')
        local create_code
        create_code=$(api_request POST "/api/v1/vaults" "$create_payload")

        # List again to exercise read path
        api_request GET "/api/v1/vaults" >/dev/null

        sleep "$delay"
    done
}

# Worker: File upload/download simulation (presigned URL flow)
worker_file_ops() {
    local delay
    delay=$(echo "scale=2; ($CONCURRENCY / $RPS) * 3" | bc 2>/dev/null || echo "6")
    log_info "Starting file ops worker (delay: ${delay}s)"

    while true; do
        # These will 401/403/404 without valid vault context, but exercise the routing
        # and middleware stack (auth, rate limiting, request parsing)
        api_request POST "/api/v1/vaults/00000000-0000-0000-0000-000000000000/blobs/upload-url" \
            '{"filename":"burn-in-test.bin","size":1024}' >/dev/null

        api_request POST "/api/v1/vaults/00000000-0000-0000-0000-000000000000/blobs/download-url" \
            '{"blobId":"00000000-0000-0000-0000-000000000000"}' >/dev/null

        api_request GET "/api/v1/vaults/00000000-0000-0000-0000-000000000000/blobs" >/dev/null

        sleep "$delay"
    done
}

# Worker: WebSocket connect/disconnect cycles
worker_websocket() {
    local delay
    delay=$(echo "scale=2; ($CONCURRENCY / $RPS) * 5" | bc 2>/dev/null || echo "10")
    log_info "Starting WebSocket lifecycle worker (delay: ${delay}s)"

    while true; do
        # WebSocket health check
        api_request GET "/api/v1/sync/health" >/dev/null

        # Attempt WebSocket upgrade — will get rejected but exercises the handler
        # Using curl to do a partial WS handshake (enough to test the endpoint)
        local ws_code
        ws_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 \
            -H "Connection: Upgrade" \
            -H "Upgrade: websocket" \
            -H "Sec-WebSocket-Version: 13" \
            -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
            "${STAGING_URL}/api/v1/sync/ws" 2>/dev/null) || ws_code="000"

        TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))
        echo "$(date '+%Y-%m-%d %H:%M:%S') WS-UPGRADE /api/v1/sync/ws ${ws_code}" >> "$REQUEST_LOG"

        if [[ "$ws_code" =~ ^5[0-9][0-9]$ ]]; then
            ERROR_5XX_COUNT=$((ERROR_5XX_COUNT + 1))
        fi

        sleep "$delay"
    done
}

# Worker: Miscellaneous endpoint coverage
worker_misc_endpoints() {
    local delay
    delay=$(echo "scale=2; ($CONCURRENCY / $RPS) * 4" | bc 2>/dev/null || echo "8")
    log_info "Starting misc endpoint worker (delay: ${delay}s)"

    while true; do
        # Readiness probe
        api_request GET "/ready" >/dev/null

        # Metrics pool
        api_request GET "/metrics/pool" >/dev/null

        # Audit log (requires auth)
        api_request GET "/api/v1/audit" >/dev/null

        # Shares received (requires auth)
        api_request GET "/api/v1/shares/received" >/dev/null

        # Billing subscription (requires auth)
        api_request GET "/api/v1/billing/subscription" >/dev/null

        # Recovery codes remaining (requires auth)
        api_request GET "/api/v1/recovery/remaining" >/dev/null

        sleep "$delay"
    done
}

# ---------------------------------------------------------------------------
# Metrics collection and threshold checking
# ---------------------------------------------------------------------------
collect_and_check_metrics() {
    local now
    now=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    local elapsed_hours
    elapsed_hours=$(( ($(date +%s) - START_EPOCH) / 3600 ))

    # Rotate request log if needed
    rotate_log "$REQUEST_LOG"

    # Fetch Prometheus metrics
    local memory_rss goroutine_count
    memory_rss=$(prom_metric "process_resident_memory_bytes")
    goroutine_count=$(prom_metric "go_goroutines")

    # Fetch DB connection pool stats
    local pool_stats
    pool_stats=$(curl -s --max-time 10 "${STAGING_URL}/metrics/pool" 2>/dev/null || echo '{}')
    local db_acquired db_total
    db_acquired=$(echo "$pool_stats" | jq -r '.acquired_conns // 0' 2>/dev/null || echo 0)
    db_total=$(echo "$pool_stats" | jq -r '.max_conns // 1' 2>/dev/null || echo 1)

    # Fetch p99 latency from Prometheus (histogram bucket)
    # Try the standard http_request_duration_seconds summary or histogram
    local p99_latency_ms
    p99_latency_ms=$(curl -s --max-time 10 "${PROMETHEUS_URL}" 2>/dev/null | \
        grep 'http_request_duration_seconds' | grep 'quantile="0.99"' | \
        head -1 | awk '{printf "%.0f", $NF * 1000}' 2>/dev/null) || true
    p99_latency_ms="${p99_latency_ms:-0}"

    # Calculate error rate
    local error_rate="0"
    if (( TOTAL_REQUESTS > 0 )); then
        error_rate=$(echo "scale=6; $ERROR_5XX_COUNT / $TOTAL_REQUESTS" | bc 2>/dev/null || echo "0")
    fi

    # Calculate growth percentages
    local memory_growth_pct="0"
    if (( BASELINE_MEMORY > 0 )); then
        memory_growth_pct=$(echo "scale=2; (($memory_rss - $BASELINE_MEMORY) / $BASELINE_MEMORY) * 100" | bc 2>/dev/null || echo "0")
    fi

    local goroutine_growth_pct="0"
    if (( BASELINE_GOROUTINES > 0 )); then
        goroutine_growth_pct=$(echo "scale=2; (($goroutine_count - $BASELINE_GOROUTINES) / $BASELINE_GOROUTINES) * 100" | bc 2>/dev/null || echo "0")
    fi

    # Write metrics entry
    local metrics_entry
    metrics_entry=$(jq -cn \
        --arg ts "$now" \
        --arg elapsed "${elapsed_hours}h" \
        --argjson total_req "$TOTAL_REQUESTS" \
        --argjson error_5xx "$ERROR_5XX_COUNT" \
        --arg error_rate "$error_rate" \
        --arg p99_ms "$p99_latency_ms" \
        --arg memory_rss "$memory_rss" \
        --arg memory_growth "$memory_growth_pct" \
        --arg goroutines "$goroutine_count" \
        --arg goroutine_growth "$goroutine_growth_pct" \
        --arg db_acquired "$db_acquired" \
        --arg db_total "$db_total" \
        '{
            timestamp: $ts,
            elapsed: $elapsed,
            total_requests: $total_req,
            error_5xx_count: $error_5xx,
            error_rate: $error_rate,
            p99_latency_ms: $p99_ms,
            memory_rss_bytes: $memory_rss,
            memory_growth_pct: $memory_growth,
            goroutine_count: $goroutines,
            goroutine_growth_pct: $goroutine_growth,
            db_connections_acquired: $db_acquired,
            db_connections_max: $db_total
        }')
    echo "$metrics_entry" >> "$METRICS_LOG"

    # Display summary
    log_head "Metrics Snapshot — ${elapsed_hours}h elapsed"
    echo -e "  Requests:    ${BOLD}${TOTAL_REQUESTS}${NC} total, ${RED}${ERROR_5XX_COUNT}${NC} errors (5xx)"
    echo -e "  Error rate:  ${BOLD}${error_rate}${NC} (threshold: ${THRESHOLD_ERROR_RATE})"
    echo -e "  p99 latency: ${BOLD}${p99_latency_ms}ms${NC} (threshold: ${THRESHOLD_P99_LATENCY_MS}ms)"
    echo -e "  Memory RSS:  ${BOLD}${memory_rss}${NC} bytes (growth: ${memory_growth_pct}%, threshold: ${THRESHOLD_MEMORY_GROWTH_PCT}%)"
    echo -e "  Goroutines:  ${BOLD}${goroutine_count}${NC} (growth: ${goroutine_growth_pct}%, threshold: ${THRESHOLD_GOROUTINE_GROWTH_PCT}%)"
    echo -e "  DB conns:    ${BOLD}${db_acquired}/${db_total}${NC} acquired/max"

    # Threshold checks
    local breach=0

    # Error rate check (compare as integers scaled by 1M to avoid bc issues)
    local error_rate_scaled threshold_scaled
    error_rate_scaled=$(echo "$error_rate * 1000000" | bc 2>/dev/null | cut -d. -f1 || echo "0")
    threshold_scaled=$(echo "$THRESHOLD_ERROR_RATE * 1000000" | bc 2>/dev/null | cut -d. -f1 || echo "1000")
    if (( error_rate_scaled > threshold_scaled )); then
        log_err "THRESHOLD BREACH: Error rate ${error_rate} > ${THRESHOLD_ERROR_RATE}"
        breach=1
    fi

    # p99 latency check
    if (( p99_latency_ms > THRESHOLD_P99_LATENCY_MS )); then
        log_err "THRESHOLD BREACH: p99 latency ${p99_latency_ms}ms > ${THRESHOLD_P99_LATENCY_MS}ms"
        breach=1
    fi

    # Memory growth check (only after baseline is established)
    if (( BASELINE_MEMORY > 0 )); then
        local mem_growth_int
        mem_growth_int=$(echo "$memory_growth_pct" | cut -d. -f1)
        mem_growth_int="${mem_growth_int:-0}"
        # Handle negative values (memory decreased)
        if [[ "$mem_growth_int" != -* ]] && (( mem_growth_int > THRESHOLD_MEMORY_GROWTH_PCT )); then
            log_err "THRESHOLD BREACH: Memory growth ${memory_growth_pct}% > ${THRESHOLD_MEMORY_GROWTH_PCT}%"
            breach=1
        fi
    fi

    # Goroutine growth check (only after baseline is established)
    if (( BASELINE_GOROUTINES > 0 )); then
        local gr_growth_int
        gr_growth_int=$(echo "$goroutine_growth_pct" | cut -d. -f1)
        gr_growth_int="${gr_growth_int:-0}"
        if [[ "$gr_growth_int" != -* ]] && (( gr_growth_int > THRESHOLD_GOROUTINE_GROWTH_PCT )); then
            log_err "THRESHOLD BREACH: Goroutine growth ${goroutine_growth_pct}% > ${THRESHOLD_GOROUTINE_GROWTH_PCT}%"
            breach=1
        fi
    fi

    if (( breach == 0 )); then
        log_ok "All thresholds within bounds"
    else
        EXIT_CODE=1
    fi

    return $breach
}

# ---------------------------------------------------------------------------
# Report generation
# ---------------------------------------------------------------------------
generate_report() {
    local end_epoch
    end_epoch=$(date +%s)
    local duration_actual_hours
    duration_actual_hours=$(( (end_epoch - START_EPOCH) / 3600 ))
    local duration_actual_min
    duration_actual_min=$(( (end_epoch - START_EPOCH) / 60 ))

    local final_error_rate="0"
    if (( TOTAL_REQUESTS > 0 )); then
        final_error_rate=$(echo "scale=6; $ERROR_5XX_COUNT / $TOTAL_REQUESTS" | bc 2>/dev/null || echo "0")
    fi

    # Read last metrics snapshot for final values
    local last_metrics
    last_metrics=$(tail -1 "$METRICS_LOG" 2>/dev/null || echo '{}')

    # Count metrics snapshots
    local snapshot_count
    snapshot_count=$(wc -l < "$METRICS_LOG" 2>/dev/null | tr -d ' ' || echo "0")

    # Count health checks
    local health_count health_failures
    health_count=$(wc -l < "$HEALTH_LOG" 2>/dev/null | tr -d ' ' || echo "0")
    health_failures=$(grep -c '"5[0-9][0-9]"' "$HEALTH_LOG" 2>/dev/null || echo "0")

    # Determine pass/fail
    local result="PASS"
    if (( EXIT_CODE != 0 )); then
        result="FAIL"
    fi

    # Generate JSON report
    jq -cn \
        --arg result "$result" \
        --arg start "$(date -r "$START_EPOCH" -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -d "@$START_EPOCH" -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo 'unknown')" \
        --arg end "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --argjson duration_min "$duration_actual_min" \
        --argjson duration_hours "$duration_actual_hours" \
        --argjson target_hours "$DURATION_HOURS" \
        --argjson concurrency "$CONCURRENCY" \
        --argjson rps "$RPS" \
        --arg staging_url "$STAGING_URL" \
        --argjson total_requests "$TOTAL_REQUESTS" \
        --argjson error_5xx "$ERROR_5XX_COUNT" \
        --arg error_rate "$final_error_rate" \
        --argjson metric_snapshots "$snapshot_count" \
        --argjson health_checks "$health_count" \
        --argjson health_failures "$health_failures" \
        --argjson baseline_memory "$BASELINE_MEMORY" \
        --argjson baseline_goroutines "$BASELINE_GOROUTINES" \
        --arg threshold_error_rate "$THRESHOLD_ERROR_RATE" \
        --arg threshold_p99_ms "$THRESHOLD_P99_LATENCY_MS" \
        --arg threshold_mem_growth "${THRESHOLD_MEMORY_GROWTH_PCT}%" \
        --arg threshold_gr_growth "${THRESHOLD_GOROUTINE_GROWTH_PCT}%" \
        --argjson last_snapshot "$(echo "$last_metrics" | jq '.' 2>/dev/null || echo '{}')" \
        '{
            burn_in_result: $result,
            configuration: {
                staging_url: $staging_url,
                target_duration_hours: $target_hours,
                concurrency: $concurrency,
                target_rps: $rps
            },
            timing: {
                start: $start,
                end: $end,
                actual_duration_minutes: $duration_min,
                actual_duration_hours: $duration_hours
            },
            traffic_summary: {
                total_requests: $total_requests,
                error_5xx_count: $error_5xx,
                final_error_rate: $error_rate,
                health_checks: $health_checks,
                health_failures: $health_failures,
                metric_snapshots: $metric_snapshots
            },
            baselines: {
                memory_rss_bytes: $baseline_memory,
                goroutine_count: $baseline_goroutines
            },
            thresholds: {
                error_rate: $threshold_error_rate,
                p99_latency_ms: $threshold_p99_ms,
                memory_growth: $threshold_mem_growth,
                goroutine_growth: $threshold_gr_growth
            },
            last_metric_snapshot: $last_snapshot
        }' > "$REPORT_FILE"

    log_head "Burn-In Report"
    echo -e "  Result:      ${BOLD}$([ "$result" = "PASS" ] && echo -e "${GREEN}PASS" || echo -e "${RED}FAIL")${NC}"
    echo -e "  Duration:    ${duration_actual_hours}h ${duration_actual_min}m"
    echo -e "  Requests:    ${TOTAL_REQUESTS} total, ${ERROR_5XX_COUNT} errors"
    echo -e "  Error rate:  ${final_error_rate}"
    echo -e "  Report file: ${REPORT_FILE}"
    echo ""
}

# ---------------------------------------------------------------------------
# Main execution
# ---------------------------------------------------------------------------
main() {
    log_head "Quantum_Shield — Staging Burn-In Test (LAUNCH-10)"
    log_info "Target:      ${STAGING_URL}"
    log_info "Duration:    ${DURATION_HOURS} hours"
    log_info "Concurrency: ${CONCURRENCY} workers"
    log_info "Target RPS:  ${RPS}"
    log_info "Report dir:  ${RUN_DIR}"
    log_info "Auth token:  $([ -n "$AUTH_TOKEN" ] && echo 'provided' || echo 'not provided (unauthenticated mode)')"
    echo ""

    # Verify staging is reachable
    log_info "Verifying staging connectivity..."
    local health_code
    health_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${STAGING_URL}/health" 2>/dev/null) || health_code="000"

    if [[ "$health_code" == "000" ]]; then
        log_err "Cannot connect to ${STAGING_URL}/health — is the staging server running?"
        exit 2
    fi
    log_ok "Staging reachable (health: HTTP ${health_code})"

    # Establish baselines
    log_info "Collecting baseline metrics..."
    sleep 2
    BASELINE_MEMORY=$(prom_metric "process_resident_memory_bytes")
    BASELINE_GOROUTINES=$(prom_metric "go_goroutines")

    # Convert to integer for comparisons (strip decimals)
    BASELINE_MEMORY=$(echo "$BASELINE_MEMORY" | cut -d. -f1)
    BASELINE_GOROUTINES=$(echo "$BASELINE_GOROUTINES" | cut -d. -f1)
    BASELINE_MEMORY="${BASELINE_MEMORY:-0}"
    BASELINE_GOROUTINES="${BASELINE_GOROUTINES:-0}"

    log_ok "Baseline memory:     ${BASELINE_MEMORY} bytes"
    log_ok "Baseline goroutines: ${BASELINE_GOROUTINES}"

    START_EPOCH=$(date +%s)
    local end_epoch
    end_epoch=$(( START_EPOCH + (DURATION_HOURS * 3600) ))

    # Launch workers in background
    log_head "Launching traffic workers"

    worker_health_check &
    WORKER_PIDS+=($!)

    worker_auth_flow &
    WORKER_PIDS+=($!)

    worker_vault_crud &
    WORKER_PIDS+=($!)

    worker_file_ops &
    WORKER_PIDS+=($!)

    worker_websocket &
    WORKER_PIDS+=($!)

    worker_misc_endpoints &
    WORKER_PIDS+=($!)

    log_ok "Started ${#WORKER_PIDS[@]} traffic workers"

    # Main monitoring loop
    log_head "Monitoring (poll interval: ${METRICS_POLL_INTERVAL}s)"

    local breach_count=0
    local max_consecutive_breaches=3

    while (( $(date +%s) < end_epoch )); do
        sleep "$METRICS_POLL_INTERVAL"

        if collect_and_check_metrics; then
            breach_count=0
        else
            breach_count=$((breach_count + 1))
            log_warn "Consecutive threshold breaches: ${breach_count}/${max_consecutive_breaches}"

            if (( breach_count >= max_consecutive_breaches )); then
                log_err "BURN-IN FAILED: ${max_consecutive_breaches} consecutive threshold breaches detected"
                EXIT_CODE=1
                cleanup
            fi
        fi

        # Check workers are still running
        local alive=0
        for pid in "${WORKER_PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                alive=$((alive + 1))
            fi
        done
        if (( alive == 0 )); then
            log_err "All workers have died — aborting"
            EXIT_CODE=1
            cleanup
        fi

        local remaining_hours
        remaining_hours=$(( (end_epoch - $(date +%s)) / 3600 ))
        log_info "Workers alive: ${alive}/${#WORKER_PIDS[@]} | Time remaining: ~${remaining_hours}h"
    done

    # Duration complete
    log_ok "Burn-in duration completed (${DURATION_HOURS} hours)"
    EXIT_CODE=0

    # Final metrics check
    if ! collect_and_check_metrics; then
        log_warn "Final metrics check detected threshold breach"
        EXIT_CODE=1
    fi

    cleanup
}

main "$@"
