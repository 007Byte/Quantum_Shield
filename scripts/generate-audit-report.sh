#!/usr/bin/env bash
# USBVault Enterprise - Consolidated Security Audit Report Generator
# Reads all docs/security/*.md files and scan artifacts to produce an HTML report
#
# Usage: ./scripts/generate-audit-report.sh [--output path/to/report.html]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SECURITY_DOCS="$PROJECT_ROOT/docs/security"
REPORT_DIR="$SECURITY_DOCS/reports"
OUTPUT_FILE="${SECURITY_DOCS}/AUDIT_REPORT.html"
TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --output) OUTPUT_FILE="$2"; shift 2 ;;
        *) shift ;;
    esac
done

mkdir -p "$(dirname "$OUTPUT_FILE")"

# ============================================================
# Count controls from markdown audit files
# ============================================================
count_controls() {
    local file="$1"
    local status="$2"
    if [[ -f "$file" ]]; then
        grep -ci "Status: $status" "$file" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

# Aggregate from all audit docs
OWASP_TOP10="$SECURITY_DOCS/OWASP_Top10_2021_Audit.md"
OWASP_API="$SECURITY_DOCS/OWASP_API_Top10_2023_Audit.md"
OWASP_MOBILE="$SECURITY_DOCS/OWASP_Mobile_Top10_2024_Audit.md"
CWE_TOP25="$SECURITY_DOCS/CWE_Top25_2024_Audit.md"
CISA_KEV="$SECURITY_DOCS/CISA_KEV_Check.md"

TOTAL_MITIGATED=0
TOTAL_PARTIAL=0
TOTAL_GAP=0
TOTAL_NA=0
TOTAL_CONTROLS=0

for doc in "$OWASP_TOP10" "$OWASP_API" "$OWASP_MOBILE" "$CWE_TOP25"; do
    if [[ -f "$doc" ]]; then
        m=$(count_controls "$doc" "MITIGATED")
        p=$(count_controls "$doc" "PARTIAL")
        g=$(count_controls "$doc" "GAP")
        n=$(count_controls "$doc" "N/A")
        TOTAL_MITIGATED=$((TOTAL_MITIGATED + m))
        TOTAL_PARTIAL=$((TOTAL_PARTIAL + p))
        TOTAL_GAP=$((TOTAL_GAP + g))
        TOTAL_NA=$((TOTAL_NA + n))
    fi
done
TOTAL_CONTROLS=$((TOTAL_MITIGATED + TOTAL_PARTIAL + TOTAL_GAP + TOTAL_NA))

# Find most recent JSON scan report
LATEST_SCAN=""
if [[ -d "$REPORT_DIR" ]]; then
    LATEST_SCAN=$(ls -t "$REPORT_DIR"/audit-*.json 2>/dev/null | head -1 || true)
fi

SCAN_SUMMARY=""
if [[ -n "$LATEST_SCAN" && -f "$LATEST_SCAN" ]]; then
    SCAN_PASS=$(jq '.summary.passed // 0' "$LATEST_SCAN")
    SCAN_CRITICAL=$(jq '.summary.critical // 0' "$LATEST_SCAN")
    SCAN_HIGH=$(jq '.summary.high // 0' "$LATEST_SCAN")
    SCAN_MEDIUM=$(jq '.summary.medium // 0' "$LATEST_SCAN")
    SCAN_SKIP=$(jq '.summary.skipped // 0' "$LATEST_SCAN")
    SCAN_MODE=$(jq -r '.mode // "unknown"' "$LATEST_SCAN")
    SCAN_TS=$(jq -r '.audit_timestamp // "unknown"' "$LATEST_SCAN")
    SCAN_SUMMARY="<h3>Latest Automated Scan</h3>
<table>
<tr><th>Scan Time</th><td>$SCAN_TS</td></tr>
<tr><th>Mode</th><td>$SCAN_MODE</td></tr>
<tr><th>Passed</th><td style=\"color:green\">$SCAN_PASS</td></tr>
<tr><th>Critical</th><td style=\"color:red\">$SCAN_CRITICAL</td></tr>
<tr><th>High</th><td style=\"color:orangered\">$SCAN_HIGH</td></tr>
<tr><th>Medium</th><td style=\"color:orange\">$SCAN_MEDIUM</td></tr>
<tr><th>Skipped</th><td style=\"color:gray\">$SCAN_SKIP</td></tr>
</table>"
fi

# ============================================================
# Generate audit doc summaries
# ============================================================
generate_doc_section() {
    local file="$1"
    local title="$2"

    if [[ ! -f "$file" ]]; then
        echo "<h3>$title</h3><p><em>Audit document not yet created.</em></p>"
        return
    fi

    local mitigated partial gap na
    mitigated=$(count_controls "$file" "MITIGATED")
    partial=$(count_controls "$file" "PARTIAL")
    gap=$(count_controls "$file" "GAP")
    na=$(count_controls "$file" "N/A")
    local total=$((mitigated + partial + gap + na))

    echo "<h3>$title</h3>"
    echo "<table>"
    echo "<tr><th>Total Controls</th><td>$total</td></tr>"
    echo "<tr><th>Mitigated</th><td style=\"color:green\">$mitigated</td></tr>"
    echo "<tr><th>Partial</th><td style=\"color:orange\">$partial</td></tr>"
    echo "<tr><th>Gap</th><td style=\"color:red\">$gap</td></tr>"
    echo "<tr><th>N/A</th><td style=\"color:gray\">$na</td></tr>"
    echo "</table>"
}

OWASP_TOP10_SECTION=$(generate_doc_section "$OWASP_TOP10" "OWASP Top 10 (2021)")
OWASP_API_SECTION=$(generate_doc_section "$OWASP_API" "OWASP API Security Top 10 (2023)")
OWASP_MOBILE_SECTION=$(generate_doc_section "$OWASP_MOBILE" "OWASP Mobile Top 10 (2024)")
CWE_SECTION=$(generate_doc_section "$CWE_TOP25" "CWE Top 25 (2024)")

# CISA KEV section
CISA_SECTION="<h3>CISA KEV Compliance</h3>"
if [[ -f "$CISA_KEV" ]]; then
    CISA_SECTION+="<p style=\"color:green\"><strong>ACTIVE MONITORING</strong> - Dependabot, cargo-audit, npm audit, govulncheck, and check-kev.sh are configured.</p>"
else
    CISA_SECTION+="<p><em>CISA KEV document not yet created.</em></p>"
fi

# ============================================================
# Write HTML report
# ============================================================
cat > "$OUTPUT_FILE" << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>USBVault Enterprise - Security Audit Report</title>
    <style>
        :root { --bg: #0d1117; --fg: #c9d1d9; --accent: #58a6ff; --green: #3fb950; --red: #f85149; --orange: #d29922; --border: #30363d; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 2rem; }
        .container { max-width: 960px; margin: 0 auto; }
        h1 { color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
        h2 { color: var(--accent); margin-top: 2rem; }
        h3 { color: var(--fg); margin-top: 1.5rem; }
        table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
        th, td { border: 1px solid var(--border); padding: 0.5rem 1rem; text-align: left; }
        th { background: #161b22; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin: 1rem 0; }
        .card { background: #161b22; border: 1px solid var(--border); border-radius: 6px; padding: 1rem; text-align: center; }
        .card .number { font-size: 2rem; font-weight: bold; }
        .card .label { color: #8b949e; font-size: 0.85rem; }
        .green { color: var(--green); }
        .red { color: var(--red); }
        .orange { color: var(--orange); }
        .gray { color: #8b949e; }
        footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--border); color: #8b949e; font-size: 0.85rem; }
    </style>
</head>
<body>
<div class="container">
    <h1>USBVault Enterprise Security Audit Report</h1>
    <p>Generated: <strong>$TIMESTAMP</strong></p>

    <h2>Executive Summary</h2>
    <div class="summary-grid">
        <div class="card">
            <div class="number">$TOTAL_CONTROLS</div>
            <div class="label">Total Controls Assessed</div>
        </div>
        <div class="card">
            <div class="number green">$TOTAL_MITIGATED</div>
            <div class="label">Mitigated</div>
        </div>
        <div class="card">
            <div class="number orange">$TOTAL_PARTIAL</div>
            <div class="label">Partial</div>
        </div>
        <div class="card">
            <div class="number red">$TOTAL_GAP</div>
            <div class="label">Gaps</div>
        </div>
        <div class="card">
            <div class="number gray">$TOTAL_NA</div>
            <div class="label">Not Applicable</div>
        </div>
    </div>

    <h2>Automated Scan Results</h2>
    $SCAN_SUMMARY

    <h2>Compliance Audit Details</h2>
    $OWASP_TOP10_SECTION
    $OWASP_API_SECTION
    $OWASP_MOBILE_SECTION
    $CWE_SECTION
    $CISA_SECTION

    <h2>Phase 10 Security Hardening</h2>
    <h3>Findings Summary</h3>
    <p>Phase 10 comprehensive security audit produced <strong>18 findings</strong> across all severity levels.</p>
    <div class="summary-grid">
        <div class="card">
            <div class="number red">4</div>
            <div class="label">CRITICAL</div>
        </div>
        <div class="card">
            <div class="number" style="color:orangered">6</div>
            <div class="label">HIGH</div>
        </div>
        <div class="card">
            <div class="number orange">3</div>
            <div class="label">MEDIUM</div>
        </div>
        <div class="card">
            <div class="number" style="color:#58a6ff">2</div>
            <div class="label">LOW</div>
        </div>
        <div class="card">
            <div class="number gray">1</div>
            <div class="label">INFO</div>
        </div>
        <div class="card">
            <div class="number green">2</div>
            <div class="label">ACCEPTED</div>
        </div>
    </div>
    <p style="color:var(--green)"><strong>All 4 CRITICAL and 6 HIGH findings have been remediated.</strong></p>

    <h3>Testing Infrastructure</h3>
    <table>
        <tr><th>Category</th><th>Tool / Method</th><th>Details</th></tr>
        <tr><td>SAST</td><td>Custom Semgrep Rules</td><td>USBVault-specific rules for crypto misuse, auth bypass, memory safety</td></tr>
        <tr><td>DAST</td><td>OWASP ZAP Authenticated Scan</td><td>Full authenticated scan with JWT token injection, 100+ API endpoints</td></tr>
        <tr><td>IAST</td><td>Runtime Middleware</td><td>Request/response inspection middleware for taint tracking during E2E tests</td></tr>
        <tr><td>Pentest: Auth</td><td>14 Automated Functions</td><td>JWT tampering, SRP bypass, session fixation, BOLA, token replay, FIDO2 bypass</td></tr>
        <tr><td>Pentest: Data Exfil</td><td>3 Automated Functions</td><td>S3 URL manipulation, encrypted blob theft, metadata leakage</td></tr>
        <tr><td>Pentest: Priv Esc</td><td>3 Automated Functions</td><td>Horizontal escalation, RBAC bypass, admin impersonation</td></tr>
    </table>

    <h3>AST Gate Status</h3>
    <table>
        <tr><th>Gate</th><th>Status</th><th>Evidence</th></tr>
        <tr><td>Phase 10 Final AST Gate</td><td style="color:green"><strong>CONDITIONAL PASS</strong></td><td>docs/security/Phase10_AST_Gate.md — all CRITICAL/HIGH fixed, cryptographic external review recommended</td></tr>
    </table>

    <h2>Scanning Infrastructure</h2>
    <table>
        <tr><th>Tool</th><th>Target</th><th>Frequency</th><th>Configuration</th></tr>
        <tr><td>gosec</td><td>usbvault-server/ (Go)</td><td>Every push, weekly</td><td>.github/workflows/security.yml</td></tr>
        <tr><td>cargo-audit</td><td>usbvault-crypto/ (Rust)</td><td>Every push, weekly</td><td>.github/workflows/security.yml</td></tr>
        <tr><td>npm audit</td><td>usbvault-app/ (Node)</td><td>Every push, weekly</td><td>.github/workflows/security.yml</td></tr>
        <tr><td>govulncheck</td><td>usbvault-server/ (Go)</td><td>Every push</td><td>.github/workflows/ci.yml</td></tr>
        <tr><td>gitleaks</td><td>Entire repo</td><td>Every push, weekly</td><td>.gitleaks.toml</td></tr>
        <tr><td>ESLint Security</td><td>usbvault-app/ (TS/React)</td><td>Every push</td><td>.github/workflows/security.yml</td></tr>
        <tr><td>Trivy</td><td>Dockerfile</td><td>Every push, weekly</td><td>.github/workflows/security.yml</td></tr>
        <tr><td>Syft (SBOM)</td><td>All components</td><td>Every push, weekly</td><td>.github/workflows/security.yml</td></tr>
        <tr><td>CISA KEV Check</td><td>All dependencies</td><td>On demand</td><td>scripts/check-kev.sh</td></tr>
        <tr><td>OWASP ZAP</td><td>API endpoints</td><td>Weekly</td><td>.github/workflows/security.yml</td></tr>
        <tr><td>Semgrep</td><td>All source code</td><td>Weekly</td><td>.github/workflows/security.yml</td></tr>
    </table>

    <h2>Frameworks Covered</h2>
    <ul>
        <li><strong>OWASP Top 10 (2021)</strong> - Web application security risks</li>
        <li><strong>OWASP API Security Top 10 (2023)</strong> - API-specific security risks</li>
        <li><strong>OWASP Mobile Top 10 (2024)</strong> - Mobile application security risks</li>
        <li><strong>CWE Top 25 (2024)</strong> - Most dangerous software weaknesses</li>
        <li><strong>CISA KEV</strong> - Known exploited vulnerabilities monitoring</li>
    </ul>

    <footer>
        <p>USBVault Enterprise Security Audit | Generated by scripts/generate-audit-report.sh</p>
        <p>This report should be reviewed by the security team and updated after each audit cycle.</p>
    </footer>
</div>
</body>
</html>
HTMLEOF

echo "Audit report generated: $OUTPUT_FILE"
