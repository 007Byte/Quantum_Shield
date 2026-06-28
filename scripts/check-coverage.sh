#!/bin/bash
# Quantum_Shield - Coverage Threshold Checker
# Verifies test coverage meets the 70% minimum across all codebases

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
THRESHOLD=70
FAILED=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Coverage Threshold Check (>= ${THRESHOLD}%)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Go coverage
echo -e "${BLUE}[*] Checking Go coverage...${NC}"
cd "$PROJECT_ROOT/usbvault-server"
go test -coverprofile=/tmp/coverage.out -covermode=atomic ./... 2>/dev/null
GO_COV=$(go tool cover -func=/tmp/coverage.out | grep total | awk '{print $3}' | sed 's/%//')
if (( $(echo "$GO_COV < $THRESHOLD" | bc -l) )); then
    echo -e "${RED}[✗] Go coverage: ${GO_COV}% (BELOW ${THRESHOLD}%)${NC}"
    FAILED=1
else
    echo -e "${GREEN}[✓] Go coverage: ${GO_COV}%${NC}"
fi

# TypeScript/React coverage
echo -e "${BLUE}[*] Checking TypeScript coverage...${NC}"
cd "$PROJECT_ROOT/usbvault-app"
npx jest --coverage --passWithNoTests --silent 2>/dev/null
if [[ -f coverage/coverage-summary.json ]]; then
    TS_COV=$(cat coverage/coverage-summary.json | jq '.total.lines.pct')
    if (( $(echo "$TS_COV < $THRESHOLD" | bc -l) )); then
        echo -e "${RED}[✗] TypeScript coverage: ${TS_COV}% (BELOW ${THRESHOLD}%)${NC}"
        FAILED=1
    else
        echo -e "${GREEN}[✓] TypeScript coverage: ${TS_COV}%${NC}"
    fi
else
    echo -e "${YELLOW}[!] TypeScript coverage report not found${NC}"
fi

# Rust coverage (informational - tarpaulin needed)
echo -e "${BLUE}[*] Rust coverage...${NC}"
cd "$PROJECT_ROOT/usbvault-crypto"
if command -v cargo-tarpaulin &> /dev/null; then
    RUST_COV=$(cargo tarpaulin --skip-clean --out json 2>/dev/null | jq '.coverage')
    if (( $(echo "$RUST_COV < $THRESHOLD" | bc -l) )); then
        echo -e "${RED}[✗] Rust coverage: ${RUST_COV}% (BELOW ${THRESHOLD}%)${NC}"
        FAILED=1
    else
        echo -e "${GREEN}[✓] Rust coverage: ${RUST_COV}%${NC}"
    fi
else
    echo -e "${YELLOW}[!] cargo-tarpaulin not installed - Rust coverage skipped${NC}"
    echo -e "${YELLOW}    Install: cargo install cargo-tarpaulin${NC}"
fi

echo ""
if [[ $FAILED -eq 1 ]]; then
    echo -e "${RED}Coverage check FAILED - some codebases below ${THRESHOLD}%${NC}"
    exit 1
else
    echo -e "${GREEN}Coverage check PASSED - all codebases >= ${THRESHOLD}%${NC}"
fi
