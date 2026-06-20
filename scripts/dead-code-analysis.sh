#!/bin/bash
# =============================================================================
# USBVault Enterprise — Go Dead Code Analyzer (Fast)
# Uses go vet + build checks, plus a single-pass grep index for export analysis.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$ROOT_DIR/usbvault-server"

RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

ISSUES=0

separator() { printf '%0.s-' {1..72}; echo; }

banner() {
    echo ""
    echo -e "${BOLD}${CYAN}======================================================${RESET}"
    echo -e "${BOLD}${CYAN}  USBVault Enterprise — Go Dead Code Analysis${RESET}"
    echo -e "${BOLD}${CYAN}======================================================${RESET}"
    echo ""
}

# ---------------------------------------------------------------------------
# 1) go vet
# ---------------------------------------------------------------------------
run_go_vet() {
    echo -e "${BOLD}[1/4] Running go vet ./...${RESET}"
    separator
    if [ ! -f "$SERVER_DIR/go.mod" ]; then
        echo -e "${YELLOW}  SKIP: go.mod not found${RESET}"; echo ""; return
    fi
    pushd "$SERVER_DIR" > /dev/null
    if go vet ./... 2>&1; then
        echo -e "  ${GREEN}No issues found.${RESET}"
    else
        echo -e "  ${YELLOW}go vet reported issues (see above).${RESET}"
    fi
    popd > /dev/null
    echo ""
}

# ---------------------------------------------------------------------------
# 2) Unused imports (compile check)
# ---------------------------------------------------------------------------
check_unused_imports() {
    echo -e "${BOLD}[2/4] Checking for unused imports${RESET}"
    separator
    if [ ! -f "$SERVER_DIR/go.mod" ]; then
        echo -e "${YELLOW}  SKIP: go.mod not found${RESET}"; echo ""; return
    fi
    pushd "$SERVER_DIR" > /dev/null
    local out
    out=$(go build ./... 2>&1 | grep 'imported and not used' || true)
    if [ -n "$out" ]; then
        echo -e "  ${YELLOW}Unused imports detected:${RESET}"
        echo "$out" | sed 's/^/    /'
        ISSUES=$((ISSUES + $(echo "$out" | wc -l | tr -d ' ')))
    else
        echo -e "  ${GREEN}No unused imports.${RESET}"
    fi
    popd > /dev/null
    echo ""
}

# ---------------------------------------------------------------------------
# 3) Orphaned packages (not imported by any other package)
# ---------------------------------------------------------------------------
find_orphaned_packages() {
    echo -e "${BOLD}[3/4] Checking for orphaned packages${RESET}"
    separator

    if [ ! -f "$SERVER_DIR/go.mod" ]; then
        echo -e "${YELLOW}  SKIP: go.mod not found${RESET}"; echo ""; return
    fi

    local module_path
    module_path=$(head -1 "$SERVER_DIR/go.mod" | awk '{print $2}')

    if [ -z "$module_path" ]; then
        echo -e "  ${YELLOW}Cannot determine module path${RESET}"; echo ""; return
    fi

    # Build a single index of all import paths referenced in the codebase
    local import_index="/tmp/usbvault_go_imports.txt"
    grep -rh '"'"${module_path}"'/' "$SERVER_DIR" --include='*.go' 2>/dev/null \
        | grep -oE "\"${module_path}/[^\"]+\"" \
        | sort -u > "$import_index" || true

    # Find all package directories
    local count=0
    while IFS= read -r dir; do
        # Skip cmd (entry points)
        case "$dir" in */cmd/*|*/cmd) continue ;; esac

        local rel="${dir#$SERVER_DIR/}"
        [ "$rel" = "$dir" ] && continue
        local import_path="${module_path}/${rel}"

        if ! grep -qF "\"${import_path}\"" "$import_index" 2>/dev/null; then
            echo -e "  ${YELLOW}ORPHANED PACKAGE:${RESET} usbvault-server/$rel"
            echo "    Import path: $import_path"
            count=$((count + 1))
        fi
    done < <(find "$SERVER_DIR" -name '*.go' -not -path '*/vendor/*' -not -name '*_test.go' \
             -exec dirname {} \; 2>/dev/null | sort -u)

    ISSUES=$((ISSUES + count))
    if [ "$count" -eq 0 ]; then
        echo -e "  ${GREEN}No orphaned packages detected.${RESET}"
    else
        echo -e "\n  ${RED}Found $count potentially orphaned package(s).${RESET}"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# 4) Unused exported functions (index-based, fast)
# ---------------------------------------------------------------------------
find_unused_exports() {
    echo -e "${BOLD}[4/4] Checking for unused exported functions${RESET}"
    separator

    if [ ! -d "$SERVER_DIR" ]; then
        echo -e "${YELLOW}  SKIP: server directory not found${RESET}"; echo ""; return
    fi

    # Build a single word-frequency index of all Go source
    local word_index="/tmp/usbvault_go_words.txt"
    grep -roEh '\b[A-Z][A-Za-z0-9_]+\b' "$SERVER_DIR" --include='*.go' 2>/dev/null \
        | sort | uniq -c | sort -rn > "$word_index" || true

    # Extract exported function/method definitions (non-test files only)
    local defs="/tmp/usbvault_go_defs.txt"
    grep -rnH 'func\s' "$SERVER_DIR" --include='*.go' 2>/dev/null \
        | grep -v '_test.go:' \
        | grep -v '/vendor/' \
        | sed -nE 's|^([^:]+):([0-9]+):.*func\s+(\([^)]*\)\s+)?([A-Z][A-Za-z0-9_]*)\s*\(.*|\1:\4|p' \
        > "$defs" || true

    if [ ! -s "$defs" ]; then
        echo -e "  ${GREEN}No exported functions to check.${RESET}"; echo ""; return
    fi

    local count=0
    while IFS=: read -r file fname; do
        [ -z "$fname" ] && continue

        # Skip common framework functions
        case "$fname" in
            Main|Init|Setup|Run|Start|Stop|Close|String|Error|ServeHTTP|Handle*|New*|Must*|Register*|Test*)
                continue ;;
        esac

        # Check word index: if the symbol appears only once (its definition), it's unused
        local occurrences
        occurrences=$(awk -v w="$fname" '$2 == w {print $1; exit}' "$word_index")
        occurrences=${occurrences:-0}

        if [ "$occurrences" -le 1 ]; then
            local relpath="${file#$ROOT_DIR/}"
            echo -e "  ${YELLOW}UNUSED EXPORT:${RESET} $fname"
            echo "    Defined in: $relpath"
            count=$((count + 1))
        fi
    done < "$defs"

    ISSUES=$((ISSUES + count))
    if [ "$count" -eq 0 ]; then
        echo -e "  ${GREEN}No unused exported functions detected.${RESET}"
    else
        echo -e "\n  ${RED}Found $count potentially unused exported function(s).${RESET}"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_summary() {
    separator
    echo -e "${BOLD}Summary${RESET}"
    separator
    printf "  Total potential issues: %d\n" "$ISSUES"
    echo ""
    if [ "$ISSUES" -gt 0 ]; then
        echo -e "${YELLOW}Review the items above. Some may be false positives (e.g., interface"
        echo -e "implementations, reflection-based usage, or planned future APIs).${RESET}"
    else
        echo -e "${GREEN}Codebase looks clean — no dead code detected.${RESET}"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
banner
run_go_vet
check_unused_imports
find_orphaned_packages
find_unused_exports
print_summary

exit 0
