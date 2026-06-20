#!/bin/bash
# =============================================================================
# USBVault Enterprise — Full Test Harness
# Runs all language test suites, type checks, and dead code analysis.
# =============================================================================
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

# Track results
declare -a STEP_NAMES=()
declare -a STEP_RESULTS=()
FAILURES=0
START_TIME=$(date +%s)

separator() {
    printf '%0.s=' {1..72}
    echo
}

banner() {
    echo ""
    separator
    echo -e "${BOLD}${CYAN}    USBVault Enterprise -- Full Test Harness${RESET}"
    separator
    echo -e "  Started: $(date '+%Y-%m-%d %H:%M:%S')"
    echo -e "  Root:    $ROOT_DIR"
    echo ""
}

# Run a step; record pass/fail
# Usage: run_step "Step Name" command args...
run_step() {
    local name="$1"
    shift

    STEP_NAMES+=("$name")

    echo ""
    echo -e "${BOLD}${CYAN}>> $name${RESET}"
    separator

    local step_start
    step_start=$(date +%s)

    if "$@" 2>&1; then
        local step_end
        step_end=$(date +%s)
        local elapsed=$(( step_end - step_start ))
        STEP_RESULTS+=("PASS")
        echo -e "${GREEN}  PASS${RESET} ($name) [${elapsed}s]"
    else
        local step_end
        step_end=$(date +%s)
        local elapsed=$(( step_end - step_start ))
        STEP_RESULTS+=("FAIL")
        FAILURES=$((FAILURES + 1))
        echo -e "${RED}  FAIL${RESET} ($name) [${elapsed}s]"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# Step functions
# ---------------------------------------------------------------------------
step_go_tests() {
    if [ ! -f "$ROOT_DIR/usbvault-server/go.mod" ]; then
        echo "  SKIP: usbvault-server/go.mod not found"
        return 0
    fi
    cd "$ROOT_DIR/usbvault-server" && go test ./... -count=1
}

step_ts_typecheck() {
    if [ ! -d "$ROOT_DIR/usbvault-app" ]; then
        echo "  SKIP: usbvault-app directory not found"
        return 0
    fi
    cd "$ROOT_DIR/usbvault-app" && npx -p typescript tsc --noEmit
}

step_jest() {
    if [ ! -d "$ROOT_DIR/usbvault-app" ]; then
        echo "  SKIP: usbvault-app directory not found"
        return 0
    fi
    cd "$ROOT_DIR/usbvault-app" && npx jest --passWithNoTests
}

step_rust_tests() {
    local manifest="$ROOT_DIR/usbvault-crypto/Cargo.toml"
    if [ ! -f "$manifest" ]; then
        echo "  SKIP: usbvault-crypto/Cargo.toml not found"
        return 0
    fi
    if ! command -v cargo &>/dev/null; then
        echo "  SKIP: cargo not found in PATH"
        return 0
    fi
    cargo test --manifest-path "$manifest"
}

step_dead_code_go() {
    if [ -x "$SCRIPT_DIR/dead-code-analysis.sh" ]; then
        "$SCRIPT_DIR/dead-code-analysis.sh"
    else
        echo "  SKIP: dead-code-analysis.sh not found or not executable"
        return 0
    fi
}

step_dead_code_ts() {
    if [ -x "$SCRIPT_DIR/dead-code-ts.sh" ]; then
        "$SCRIPT_DIR/dead-code-ts.sh"
    else
        echo "  SKIP: dead-code-ts.sh not found or not executable"
        return 0
    fi
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_summary() {
    local end_time
    end_time=$(date +%s)
    local total_elapsed=$(( end_time - START_TIME ))

    echo ""
    separator
    echo -e "${BOLD}${CYAN}    Test Harness Summary${RESET}"
    separator
    echo ""

    local i=0
    while [ $i -lt ${#STEP_NAMES[@]} ]; do
        local result="${STEP_RESULTS[$i]}"
        local color="$GREEN"
        local icon="PASS"
        if [ "$result" = "FAIL" ]; then
            color="$RED"
            icon="FAIL"
        fi
        printf "  %-40s [${color}%s${RESET}]\n" "${STEP_NAMES[$i]}" "$icon"
        i=$((i + 1))
    done

    echo ""
    separator
    printf "  Total steps : %d\n" "${#STEP_NAMES[@]}"
    printf "  Passed      : %d\n" "$(( ${#STEP_NAMES[@]} - FAILURES ))"
    printf "  Failed      : %d\n" "$FAILURES"
    printf "  Elapsed     : %dm %ds\n" "$((total_elapsed / 60))" "$((total_elapsed % 60))"
    separator

    if [ "$FAILURES" -gt 0 ]; then
        echo ""
        echo -e "${RED}${BOLD}  Some steps failed. See details above.${RESET}"
        echo ""
    else
        echo ""
        echo -e "${GREEN}${BOLD}  All steps passed.${RESET}"
        echo ""
    fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
banner

run_step "Go Tests (usbvault-server)"         step_go_tests
run_step "TypeScript Type Check (tsc --noEmit)" step_ts_typecheck
run_step "Jest Tests (usbvault-app)"           step_jest
run_step "Rust Tests (usbvault-crypto)"        step_rust_tests
run_step "Dead Code Analysis — Go"             step_dead_code_go
run_step "Dead Code Analysis — TypeScript"     step_dead_code_ts

print_summary

exit "$FAILURES"
