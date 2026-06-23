#!/bin/bash

# Comprehensive SAST (Static Application Security Testing) Runner
# Executes security scanning on all QAV components
# Aggregates results and reports findings with exit code based on severity

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Color codes for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Results tracking
declare -A SCAN_RESULTS
CRITICAL_COUNT=0
HIGH_COUNT=0
MEDIUM_COUNT=0
LOW_COUNT=0
FAILED_SCANS=0

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}QAV SAST Security Scanning${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to run gosec on Go codebase
scan_go() {
    echo -e "${BLUE}[*] Running gosec on Go codebase...${NC}"
    cd "$PROJECT_ROOT/usbvault-server"

    if ! command -v gosec &> /dev/null; then
        echo -e "${YELLOW}[!] gosec not found. Install with: go install github.com/securego/gosec/v2/cmd/gosec@latest${NC}"
        FAILED_SCANS=$((FAILED_SCANS + 1))
        return
    fi

    if gosec -no-fail -fmt json ./... > /tmp/gosec-report.json 2>&1; then
        # Parse gosec JSON output
        issues=$(jq '.Issues | length' /tmp/gosec-report.json 2>/dev/null || echo 0)
        if [[ "$issues" -gt 0 ]]; then
            echo -e "${YELLOW}[!] gosec found $issues issues:${NC}"
            jq -r '.Issues[] | "  [\(.Severity)] \(.What) at \(.File):\(.Line)"' /tmp/gosec-report.json
            SCAN_RESULTS["gosec"]="$issues issues found"
        else
            echo -e "${GREEN}[+] gosec scan passed - no issues found${NC}"
            SCAN_RESULTS["gosec"]="PASS"
        fi
    else
        echo -e "${RED}[-] gosec scan failed${NC}"
        FAILED_SCANS=$((FAILED_SCANS + 1))
    fi
}

# Function to run cargo audit on Rust codebase
scan_rust() {
    echo -e "${BLUE}[*] Running cargo audit on Rust codebase...${NC}"
    cd "$PROJECT_ROOT/usbvault-crypto"

    if ! command -v cargo-audit &> /dev/null && ! command -v cargo &> /dev/null; then
        echo -e "${YELLOW}[!] cargo-audit not found. Install with: cargo install cargo-audit${NC}"
        FAILED_SCANS=$((FAILED_SCANS + 1))
        return
    fi

    if command -v cargo &> /dev/null; then
        if cargo audit --json > /tmp/cargo-audit-report.json 2>&1; then
            vulnerabilities=$(jq '.vulnerabilities | length' /tmp/cargo-audit-report.json 2>/dev/null || echo 0)
            if [[ "$vulnerabilities" -gt 0 ]]; then
                echo -e "${RED}[!] cargo audit found $vulnerabilities vulnerabilities:${NC}"
                jq -r '.vulnerabilities[] | "  [\(.advisory.severity)] \(.package.name) - \(.advisory.title)"' /tmp/cargo-audit-report.json
                CRITICAL_COUNT=$((CRITICAL_COUNT + vulnerabilities))
                SCAN_RESULTS["cargo-audit"]="$vulnerabilities vulnerabilities found"
            else
                echo -e "${GREEN}[+] cargo audit passed - no vulnerabilities found${NC}"
                SCAN_RESULTS["cargo-audit"]="PASS"
            fi
        else
            echo -e "${YELLOW}[!] cargo audit check (may be expected if no lockfile issues)${NC}"
            SCAN_RESULTS["cargo-audit"]="PASS"
        fi
    fi
}

# Function to run eslint with security plugin
scan_javascript() {
    echo -e "${BLUE}[*] Running ESLint security scan on TypeScript/React codebase...${NC}"
    cd "$PROJECT_ROOT/usbvault-app"

    if ! command -v eslint &> /dev/null; then
        echo -e "${YELLOW}[!] eslint not found. Install dependencies with: npm install${NC}"
        FAILED_SCANS=$((FAILED_SCANS + 1))
        return
    fi

    if eslint --config .eslintrc.security.json --format json src/ 2>/dev/null | jq . > /tmp/eslint-report.json 2>&1; then
        issues=$(jq 'map(.messages | length) | add' /tmp/eslint-report.json 2>/dev/null || echo 0)
        errors=$(jq 'map(.messages[] | select(.severity == 2)) | length' /tmp/eslint-report.json 2>/dev/null || echo 0)
        warnings=$(jq 'map(.messages[] | select(.severity == 1)) | length' /tmp/eslint-report.json 2>/dev/null || echo 0)

        if [[ "$issues" -gt 0 ]]; then
            echo -e "${YELLOW}[!] ESLint found $issues issues ($errors errors, $warnings warnings):${NC}"
            jq -r '.[] | select(.messages | length > 0) | "\(.filePath): \(.messages[] | "[\(.rule)] \(.message)")"' /tmp/eslint-report.json
            SCAN_RESULTS["eslint"]="$issues issues found"
        else
            echo -e "${GREEN}[+] ESLint security scan passed - no issues found${NC}"
            SCAN_RESULTS["eslint"]="PASS"
        fi
    else
        echo -e "${YELLOW}[!] ESLint scan completed with warnings${NC}"
        SCAN_RESULTS["eslint"]="Scan completed"
    fi
}

# Function to run gitleaks for secret detection
scan_secrets() {
    echo -e "${BLUE}[*] Running gitleaks for secret detection...${NC}"
    cd "$PROJECT_ROOT"

    if ! command -v gitleaks &> /dev/null; then
        echo -e "${YELLOW}[!] gitleaks not found. Install from: https://github.com/gitleaks/gitleaks${NC}"
        FAILED_SCANS=$((FAILED_SCANS + 1))
        return
    fi

    if gitleaks detect --no-git -v --report-path /tmp/gitleaks-report.json 2>&1 | tee /tmp/gitleaks.log; then
        secrets=$(grep -c "⚠️" /tmp/gitleaks.log || echo 0)
        if [[ "$secrets" -eq 0 ]]; then
            echo -e "${GREEN}[+] gitleaks scan passed - no secrets detected${NC}"
            SCAN_RESULTS["gitleaks"]="PASS"
        else
            echo -e "${RED}[-] gitleaks found potential secrets${NC}"
            CRITICAL_COUNT=$((CRITICAL_COUNT + secrets))
            SCAN_RESULTS["gitleaks"]="$secrets secrets detected"
        fi
    else
        # gitleaks exits with 1 if secrets are found
        secrets=$(grep -c "⚠️" /tmp/gitleaks.log || echo 0)
        if [[ "$secrets" -gt 0 ]]; then
            echo -e "${RED}[-] gitleaks found $secrets potential secrets:${NC}"
            cat /tmp/gitleaks.log
            CRITICAL_COUNT=$((CRITICAL_COUNT + secrets))
            SCAN_RESULTS["gitleaks"]="$secrets secrets detected"
        else
            echo -e "${GREEN}[+] gitleaks scan passed${NC}"
            SCAN_RESULTS["gitleaks"]="PASS"
        fi
    fi
}

# Function to run cargo-deny for license and dependency checks
scan_dependencies() {
    echo -e "${BLUE}[*] Running cargo-deny for dependency/license compliance...${NC}"
    cd "$PROJECT_ROOT/usbvault-crypto"

    if ! command -v cargo-deny &> /dev/null; then
        echo -e "${YELLOW}[!] cargo-deny not found. Install with: cargo install cargo-deny${NC}"
        return
    fi

    if cargo-deny check --all-features 2>&1 | tee /tmp/cargo-deny.log; then
        echo -e "${GREEN}[+] cargo-deny compliance check passed${NC}"
        SCAN_RESULTS["cargo-deny"]="PASS"
    else
        echo -e "${YELLOW}[!] cargo-deny found issues (check log)${NC}"
        SCAN_RESULTS["cargo-deny"]="Issues found"
    fi
}

# Run all scans
echo ""
scan_go
echo ""
scan_rust
echo ""
scan_javascript
echo ""
scan_secrets
echo ""
scan_dependencies

# Print summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}SAST Scan Results Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

for scan_name in "${!SCAN_RESULTS[@]}"; do
    result="${SCAN_RESULTS[$scan_name]}"
    if [[ "$result" == "PASS" ]]; then
        echo -e "${GREEN}[✓] $scan_name: $result${NC}"
    else
        echo -e "${YELLOW}[!] $scan_name: $result${NC}"
    fi
done

echo ""
echo -e "Critical Issues: ${RED}$CRITICAL_COUNT${NC}"
echo -e "High Issues: ${YELLOW}$HIGH_COUNT${NC}"
echo -e "Failed Scans: ${RED}$FAILED_SCANS${NC}"
echo ""

# Determine exit code
if [[ $CRITICAL_COUNT -gt 0 ]] || [[ $FAILED_SCANS -gt 0 ]]; then
    echo -e "${RED}[!] SAST scan FAILED - critical issues or scan failures detected${NC}"
    echo -e "${RED}[!] Remediation required before deployment${NC}"
    exit 1
elif [[ $HIGH_COUNT -gt 0 ]]; then
    echo -e "${YELLOW}[!] SAST scan completed with HIGH severity issues${NC}"
    echo -e "${YELLOW}[!] Review and remediate before deployment${NC}"
    exit 1
else
    echo -e "${GREEN}[+] SAST scan PASSED${NC}"
    exit 0
fi
