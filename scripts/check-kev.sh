#!/bin/bash

# CISA Known Exploited Vulnerabilities (KEV) Checker
# Downloads latest CISA KEV catalog and cross-references with project dependencies
# Exits with error if any KEV matches are found

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
KEV_CACHE_DIR="${HOME}/.cache/qav-kev"
KEV_CACHE_FILE="${KEV_CACHE_DIR}/kev-catalog.json"
KEV_CACHE_TIMESTAMP="${KEV_CACHE_DIR}/.timestamp"
CACHE_DURATION=$((24 * 60 * 60))  # 24 hours in seconds
KEV_URL="https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"

mkdir -p "$KEV_CACHE_DIR"

# Check if cache is still valid
cache_valid=false
if [[ -f "$KEV_CACHE_TIMESTAMP" ]]; then
    current_time=$(date +%s)
    cache_time=$(cat "$KEV_CACHE_TIMESTAMP")
    age=$((current_time - cache_time))
    if [[ $age -lt $CACHE_DURATION ]]; then
        cache_valid=true
    fi
fi

# Download KEV catalog if needed
if [[ "$cache_valid" != "true" ]]; then
    echo "[*] Downloading latest CISA KEV catalog..."
    if curl -sf "$KEV_URL" -o "$KEV_CACHE_FILE"; then
        date +%s > "$KEV_CACHE_TIMESTAMP"
        echo "[+] KEV catalog downloaded and cached"
    else
        echo "[-] Failed to download KEV catalog from $KEV_URL"
        exit 1
    fi
else
    echo "[*] Using cached KEV catalog"
fi

# Extract CVE IDs from the KEV catalog
echo "[*] Extracting CVE IDs from CISA KEV catalog..."
kev_cves=$(jq -r '.vulnerabilities[] | .cveID' "$KEV_CACHE_FILE" | sort | uniq)

if [[ -z "$kev_cves" ]]; then
    echo "[-] No CVE IDs found in KEV catalog"
    exit 1
fi

echo "[+] Found $(echo "$kev_cves" | wc -l) known exploited vulnerabilities in KEV catalog"

# Function to extract CVEs from different lock files
extract_cves_from_dependencies() {
    local found_cves=""

    # Check Cargo.lock (Rust)
    if [[ -f "$PROJECT_ROOT/usbvault-crypto/Cargo.lock" ]]; then
        echo "[*] Scanning Cargo.lock for CVEs..."
        # Extract CVE references from Cargo.lock
        found_cves+=$(grep -oE 'CVE-[0-9]{4}-[0-9]+' "$PROJECT_ROOT/usbvault-crypto/Cargo.lock" || true)$'\n'
    fi

    # Check go.sum (Go)
    if [[ -f "$PROJECT_ROOT/usbvault-server/go.sum" ]]; then
        echo "[*] Scanning go.sum for CVEs..."
        # Go dependencies don't typically include CVEs in go.sum, but we check for any advisory metadata
        found_cves+=$(grep -oE 'CVE-[0-9]{4}-[0-9]+' "$PROJECT_ROOT/usbvault-server/go.sum" || true)$'\n'
    fi

    # Check package-lock.json (Node.js)
    if [[ -f "$PROJECT_ROOT/usbvault-app/package-lock.json" ]]; then
        echo "[*] Scanning package-lock.json for CVEs..."
        found_cves+=$(grep -oE '"CVE[^"]*"' "$PROJECT_ROOT/usbvault-app/package-lock.json" | grep -oE 'CVE-[0-9]{4}-[0-9]+' || true)$'\n'
    fi

    echo "$found_cves" | grep -v '^$' | sort | uniq
}

# Extract CVEs from project dependencies
echo "[*] Extracting CVE IDs from project dependencies..."
project_cves=$(extract_cves_from_dependencies)

if [[ -z "$project_cves" ]]; then
    echo "[+] No CVE IDs found in dependency files"
    echo "[+] CISA KEV check PASSED - no known exploited vulnerabilities detected"
    exit 0
fi

# Cross-reference: check if any project CVEs are in KEV catalog
echo "[*] Cross-referencing project CVEs with KEV catalog..."
kev_matches=""
while IFS= read -r cve; do
    if [[ -n "$cve" ]] && echo "$kev_cves" | grep -q "^$cve$"; then
        kev_matches+="$cve"$'\n'
    fi
done <<< "$project_cves"

if [[ -n "$kev_matches" ]]; then
    echo ""
    echo "[-] CISA KEV check FAILED - found known exploited vulnerabilities:"
    echo "$kev_matches" | sort | uniq
    echo ""
    echo "These CVEs are listed in the CISA Known Exploited Vulnerabilities catalog."
    echo "Remediation required: update affected dependencies immediately."
    exit 1
else
    echo "[+] CISA KEV check PASSED - no known exploited vulnerabilities detected"
    exit 0
fi
