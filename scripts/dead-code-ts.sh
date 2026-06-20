#!/bin/bash
# =============================================================================
# USBVault Enterprise — TypeScript Dead Code Analyzer (Fast)
# Uses a pre-built word index for O(1) lookups instead of per-symbol grep.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/usbvault-app"
SRC_DIR="$APP_DIR/src"

RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

UNUSED_EXPORTS=0
ORPHANED_FILES=0
UNUSED_DEPS=0
ISSUES_TOTAL=0

separator() { printf '%0.s-' {1..72}; echo; }

banner() {
    echo ""
    echo -e "${BOLD}${CYAN}======================================================${RESET}"
    echo -e "${BOLD}${CYAN}  USBVault Enterprise — TypeScript Dead Code Analysis${RESET}"
    echo -e "${BOLD}${CYAN}======================================================${RESET}"
    echo ""
}

# ---------------------------------------------------------------------------
# 1) Unused exports (index-based)
# ---------------------------------------------------------------------------
find_unused_exports() {
    echo -e "${BOLD}[1/3] Checking for unused exported symbols${RESET}"
    separator

    if [ ! -d "$SRC_DIR" ]; then
        echo -e "${YELLOW}  SKIP: $SRC_DIR not found${RESET}"; echo ""; return
    fi

    # Build a word-frequency index across all TS/TSX source
    local word_index="/tmp/usbvault_ts_words.txt"
    grep -roEh '\b[A-Za-z_][A-Za-z0-9_]*\b' "$SRC_DIR" \
        --include='*.ts' --include='*.tsx' 2>/dev/null \
        | sort | uniq -c | sort -rn > "$word_index" || true

    # Extract named export definitions (skip index files, test files, .d.ts)
    local defs="/tmp/usbvault_ts_defs.txt"
    grep -rnH 'export\s\+\(async\s\+\)\?\(function\|const\|let\|var\|class\|interface\|type\|enum\)\s\+[A-Za-z_]' \
        "$SRC_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null \
        | grep -v '/index\.ts' | grep -v '/index\.tsx' \
        | grep -v '\.test\.' | grep -v '\.spec\.' | grep -v '\.d\.ts' \
        | sed -nE 's|^([^:]+):[0-9]+:.*export\s+(async\s+)?(function\|const\|let\|var\|class\|interface\|type\|enum)\s+([A-Za-z_][A-Za-z0-9_]*).*|\1:\4|p' \
        > "$defs" 2>/dev/null || true

    # Fallback: use a simpler sed if the above produced nothing
    if [ ! -s "$defs" ]; then
        grep -rnH 'export ' "$SRC_DIR" --include='*.ts' --include='*.tsx' 2>/dev/null \
            | grep -v '/index\.ts' | grep -v '\.test\.' | grep -v '\.spec\.' | grep -v '\.d\.ts' \
            | grep -E 'export\s+(async\s+)?(function|const|let|var|class|interface|type|enum)\s+' \
            | sed -E 's|^([^:]+):[0-9]+:.*export\s+(async\s+)?(function|const|let|var|class|interface|type|enum)\s+([A-Za-z_][A-Za-z0-9_]*).*|\1:\4|' \
            > "$defs" 2>/dev/null || true
    fi

    if [ ! -s "$defs" ]; then
        echo -e "  ${GREEN}No named exports to check.${RESET}"; echo ""; return
    fi

    local count=0
    while IFS=: read -r file sym; do
        [ -z "$sym" ] && continue

        # Check word index: if symbol appears only 1-2 times (definition + possible re-export),
        # it may be unused externally
        local occurrences
        occurrences=$(awk -v w="$sym" '$2 == w {print $1; exit}' "$word_index")
        occurrences=${occurrences:-0}

        # A symbol referenced only once (its own export statement) is likely unused
        # Use threshold of 2 to account for the definition line
        if [ "$occurrences" -le 2 ]; then
            local relpath="${file#$ROOT_DIR/}"
            echo -e "  ${YELLOW}UNUSED EXPORT:${RESET} $sym"
            echo "    Defined in: $relpath"
            count=$((count + 1))
        fi
    done < "$defs"

    UNUSED_EXPORTS=$count
    if [ "$count" -eq 0 ]; then
        echo -e "  ${GREEN}No unused exports detected.${RESET}"
    else
        echo -e "\n  ${RED}Found $count potentially unused export(s).${RESET}"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# 2) Orphaned files (never imported by another file)
# ---------------------------------------------------------------------------
find_orphaned_files() {
    echo -e "${BOLD}[2/3] Checking for orphaned .ts/.tsx files${RESET}"
    separator

    if [ ! -d "$SRC_DIR" ]; then
        echo -e "${YELLOW}  SKIP: $SRC_DIR not found${RESET}"; echo ""; return
    fi

    # Build an import reference index: all import/require paths across the project
    local import_index="/tmp/usbvault_ts_imports.txt"
    grep -roEh "(from\s+['\"][^'\"]+['\"]|require\(['\"][^'\"]+['\"])" "$SRC_DIR" \
        --include='*.ts' --include='*.tsx' 2>/dev/null \
        | grep -oE "['\"][^'\"]+['\"]" \
        | tr -d "\"'" \
        | sort -u > "$import_index" || true

    local count=0
    while IFS= read -r file; do
        local basename
        basename=$(basename "$file")
        local name_no_ext="${basename%.*}"
        name_no_ext="${name_no_ext%.test}"
        name_no_ext="${name_no_ext%.spec}"

        # Skip entry points and index files
        case "$basename" in
            index.ts|index.tsx|App.ts|App.tsx|app.ts|app.tsx|main.ts|main.tsx|platformSetup.ts|_layout.tsx)
                continue ;;
        esac

        # Check if the file's module name appears in any import path
        if ! grep -qF "$name_no_ext" "$import_index" 2>/dev/null; then
            local relpath="${file#$ROOT_DIR/}"
            echo -e "  ${YELLOW}ORPHANED FILE:${RESET} $relpath"
            count=$((count + 1))
        fi
    done < <(find "$SRC_DIR" -type f \( -name '*.ts' -o -name '*.tsx' \) \
             -not -path '*/node_modules/*' -not -name '*.d.ts' \
             -not -name '*.test.*' -not -name '*.spec.*' 2>/dev/null)

    ORPHANED_FILES=$count
    if [ "$count" -eq 0 ]; then
        echo -e "  ${GREEN}No orphaned files detected.${RESET}"
    else
        echo -e "\n  ${RED}Found $count potentially orphaned file(s).${RESET}"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# 3) Unused package.json dependencies
# ---------------------------------------------------------------------------
find_unused_deps() {
    echo -e "${BOLD}[3/3] Checking for unused package.json dependencies${RESET}"
    separator

    local pkg_json="$APP_DIR/package.json"
    if [ ! -f "$pkg_json" ]; then
        echo -e "  ${YELLOW}SKIP: package.json not found${RESET}"; echo ""; return
    fi

    # Build a single import index for the whole app
    local import_index="/tmp/usbvault_ts_dep_imports.txt"
    grep -roEh "(from\s+['\"][^'\"]+['\"]|require\(['\"][^'\"]+['\"])" "$APP_DIR" \
        --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' \
        --exclude-dir=node_modules 2>/dev/null \
        | grep -oE "['\"][^'\"]+['\"]" \
        | tr -d "\"'" \
        | sort -u > "$import_index" || true

    # Also check config files
    local config_content="/tmp/usbvault_ts_configs.txt"
    find "$APP_DIR" -maxdepth 2 -type f \( -name '*.config.*' -o -name '.babelrc' -o -name 'tsconfig.json' \) \
         -not -path '*/node_modules/*' -exec cat {} + 2>/dev/null > "$config_content" || true

    # Extract dependency names
    local deps
    deps=$(grep -oE '"[^"]+"\s*:\s*"[~^>=<0-9*]' "$pkg_json" 2>/dev/null \
           | sed -E 's/"([^"]+)".*/\1/' \
           | grep -v -E '^(name|version|description|main|scripts|private|homepage|repository|license|author)$' \
           | sort -u)

    if [ -z "$deps" ]; then
        echo -e "  ${GREEN}No dependencies found.${RESET}"; echo ""; return
    fi

    local count=0
    while read -r dep; do
        [ -z "$dep" ] && continue
        # Check import index and config files
        if ! grep -qF "$dep" "$import_index" 2>/dev/null && ! grep -qF "$dep" "$config_content" 2>/dev/null; then
            echo -e "  ${YELLOW}UNUSED DEPENDENCY:${RESET} $dep"
            count=$((count + 1))
        fi
    done <<< "$deps"

    UNUSED_DEPS=$count
    if [ "$count" -eq 0 ]; then
        echo -e "  ${GREEN}All dependencies appear to be in use.${RESET}"
    else
        echo -e "\n  ${RED}Found $count potentially unused dependenc(ies).${RESET}"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_summary() {
    ISSUES_TOTAL=$((UNUSED_EXPORTS + ORPHANED_FILES + UNUSED_DEPS))

    separator
    echo -e "${BOLD}Summary${RESET}"
    separator
    printf "  Unused exports       : %d\n" "$UNUSED_EXPORTS"
    printf "  Orphaned files       : %d\n" "$ORPHANED_FILES"
    printf "  Unused dependencies  : %d\n" "$UNUSED_DEPS"
    printf "  %-22s: %d\n" "Total potential issues" "$ISSUES_TOTAL"
    echo ""
    if [ "$ISSUES_TOTAL" -gt 0 ]; then
        echo -e "${YELLOW}Review the items above. Some may be false positives (e.g., re-exports"
        echo -e "through barrel files, runtime-only imports, or platform-specific code).${RESET}"
    else
        echo -e "${GREEN}Codebase looks clean — no dead code detected.${RESET}"
    fi
    echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
banner
find_unused_exports
find_orphaned_files
find_unused_deps
print_summary

exit 0
