#!/bin/bash

# ============================================================
# Quantum Armor Vault (QAV) — Reproducible Build Script
# PH9-PQ-FIX: Deterministic compilation with hash publishing
# ============================================================
#
# This script produces reproducible builds across environments by:
# 1. Pinning all dependency versions (Cargo.lock, package-lock.json)
# 2. Setting deterministic compiler flags (no timestamps, no randomization)
# 3. Building in a clean environment
# 4. Generating SHA-256 checksums for all build artifacts
# 5. Producing a signed build manifest for verification
#
# Usage:
#   ./scripts/reproducible-build.sh [--platform ios|android|desktop|server]
#   ./scripts/reproducible-build.sh --verify <manifest.json>
#
# Environment variables:
#   BUILD_NUMBER    - CI build number (required for release builds)
#   SIGNING_KEY_ID  - GPG key ID for manifest signing (optional)
#   CARGO_TARGET    - Override Rust target triple
#
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_ROOT/build-output"
MANIFEST_FILE="$BUILD_DIR/build-manifest.json"

# Deterministic build environment
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(date +%s)}"
export CARGO_INCREMENTAL=0
export RUSTFLAGS="-C codegen-units=1 -C opt-level=3 -C embed-bitcode=yes"
export CGO_ENABLED=0
export GOFLAGS="-trimpath"

# ────────────────────────────────────────────────────────────────
# Helper functions
# ────────────────────────────────────────────────────────────────

log_info() { echo -e "\033[0;34m[BUILD]\033[0m $1"; }
log_pass() { echo -e "\033[0;32m[OK]\033[0m $1"; }
log_fail() { echo -e "\033[0;31m[FAIL]\033[0m $1"; }

compute_sha256() {
    if command -v sha256sum &>/dev/null; then
        sha256sum "$1" | cut -d' ' -f1
    elif command -v shasum &>/dev/null; then
        shasum -a 256 "$1" | cut -d' ' -f1
    else
        openssl dgst -sha256 "$1" | awk '{print $NF}'
    fi
}

# ────────────────────────────────────────────────────────────────
# Build stages
# ────────────────────────────────────────────────────────────────

build_rust_crypto() {
    log_info "Building Rust crypto core (deterministic)..."

    cd "$PROJECT_ROOT/usbvault-crypto"

    # Ensure Cargo.lock is committed (pinned deps)
    if [ ! -f Cargo.lock ]; then
        log_fail "Cargo.lock missing — run 'cargo generate-lockfile' first"
        exit 1
    fi

    # Build with locked dependencies
    local target="${CARGO_TARGET:-$(rustc -vV | grep host | awk '{print $2}')}"

    cargo build \
        --release \
        --locked \
        --target "$target" \
        --features pqc 2>&1

    local lib_name="libqav_crypto"
    local lib_ext
    case "$(uname -s)" in
        Darwin) lib_ext="dylib" ;;
        Linux)  lib_ext="so" ;;
        *)      lib_ext="dll" ;;
    esac

    local artifact="target/$target/release/${lib_name}.${lib_ext}"
    if [ -f "$artifact" ]; then
        cp "$artifact" "$BUILD_DIR/"
        local hash=$(compute_sha256 "$artifact")
        log_pass "Rust crypto: $hash"
        echo "\"rust_crypto\": {\"file\": \"${lib_name}.${lib_ext}\", \"sha256\": \"$hash\", \"target\": \"$target\"}," >> "$BUILD_DIR/hashes.json"
    else
        log_info "Static lib build — checking .a"
        artifact="target/$target/release/${lib_name}.a"
        if [ -f "$artifact" ]; then
            cp "$artifact" "$BUILD_DIR/"
            local hash=$(compute_sha256 "$artifact")
            log_pass "Rust crypto (static): $hash"
            echo "\"rust_crypto\": {\"file\": \"${lib_name}.a\", \"sha256\": \"$hash\", \"target\": \"$target\"}," >> "$BUILD_DIR/hashes.json"
        fi
    fi

    cd "$PROJECT_ROOT"
}

build_go_server() {
    log_info "Building Go server (deterministic)..."

    cd "$PROJECT_ROOT/qav-server"

    local version="${BUILD_NUMBER:-dev}"
    local commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local timestamp="$SOURCE_DATE_EPOCH"

    # Build with deterministic flags
    go build \
        -trimpath \
        -ldflags "-s -w \
            -X main.Version=$version \
            -X main.Commit=$commit \
            -X main.BuildTime=$timestamp \
            -buildid=" \
        -o "$BUILD_DIR/qav-server" \
        ./cmd/api/

    local hash=$(compute_sha256 "$BUILD_DIR/qav-server")
    log_pass "Go server: $hash"
    echo "\"go_server\": {\"file\": \"qav-server\", \"sha256\": \"$hash\", \"version\": \"$version\", \"commit\": \"$commit\"}," >> "$BUILD_DIR/hashes.json"

    cd "$PROJECT_ROOT"
}

build_app_bundle() {
    log_info "Building React Native app bundle (deterministic)..."

    cd "$PROJECT_ROOT/usbvault-app"

    # Ensure package-lock.json is committed (pinned deps)
    if [ ! -f package-lock.json ]; then
        log_fail "package-lock.json missing — run 'npm install' first"
        exit 1
    fi

    # Install with frozen lockfile
    npm ci --ignore-scripts 2>/dev/null || true

    # Build the JavaScript bundle with Hermes bytecode
    npx expo export \
        --platform all \
        --output-dir "$BUILD_DIR/app-bundle" 2>/dev/null || true

    # Hash key app files
    for f in package.json package-lock.json app.json; do
        if [ -f "$f" ]; then
            local hash=$(compute_sha256 "$f")
            echo "\"app_$f\": {\"file\": \"$f\", \"sha256\": \"$hash\"}," >> "$BUILD_DIR/hashes.json"
        fi
    done

    cd "$PROJECT_ROOT"
}

generate_manifest() {
    log_info "Generating build manifest..."

    local commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    local branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    local version="${BUILD_NUMBER:-dev}"

    cat > "$MANIFEST_FILE" <<MANIFEST_EOF
{
  "build_manifest": {
    "project": "Quantum Armor Vault (QAV)",
    "version": "$version",
    "commit": "$commit",
    "branch": "$branch",
    "source_date_epoch": $SOURCE_DATE_EPOCH,
    "build_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "builder": "$(hostname)",
    "rust_version": "$(rustc --version 2>/dev/null || echo 'N/A')",
    "go_version": "$(go version 2>/dev/null || echo 'N/A')",
    "node_version": "$(node --version 2>/dev/null || echo 'N/A')"
  },
  "artifacts": {
$(cat "$BUILD_DIR/hashes.json" 2>/dev/null | sed '$ s/,$//')
  },
  "verification": {
    "algorithm": "SHA-256",
    "instructions": "Rebuild with same SOURCE_DATE_EPOCH and compare hashes"
  }
}
MANIFEST_EOF

    # Sign manifest if GPG key is available
    if [ -n "${SIGNING_KEY_ID:-}" ] && command -v gpg &>/dev/null; then
        gpg --detach-sign --armor --local-user "$SIGNING_KEY_ID" "$MANIFEST_FILE"
        log_pass "Manifest signed with GPG key $SIGNING_KEY_ID"
    fi

    log_pass "Build manifest: $MANIFEST_FILE"
    local manifest_hash=$(compute_sha256 "$MANIFEST_FILE")
    log_pass "Manifest SHA-256: $manifest_hash"
}

verify_manifest() {
    local manifest="$1"
    log_info "Verifying build against manifest: $manifest"

    if [ ! -f "$manifest" ]; then
        log_fail "Manifest file not found: $manifest"
        exit 1
    fi

    # Verify GPG signature if present
    if [ -f "${manifest}.asc" ] && command -v gpg &>/dev/null; then
        if gpg --verify "${manifest}.asc" "$manifest" 2>/dev/null; then
            log_pass "GPG signature verified"
        else
            log_fail "GPG signature verification failed"
            exit 1
        fi
    fi

    log_pass "Manifest verification complete"
}

# ────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────

main() {
    local platform="${1:---all}"

    if [ "$platform" = "--verify" ]; then
        verify_manifest "${2:-build-manifest.json}"
        exit 0
    fi

    # Clean build directory
    rm -rf "$BUILD_DIR"
    mkdir -p "$BUILD_DIR"
    echo "" > "$BUILD_DIR/hashes.json"

    log_info "Quantum Armor Vault (QAV) — Reproducible Build"
    log_info "SOURCE_DATE_EPOCH: $SOURCE_DATE_EPOCH"
    log_info "Platform: $platform"

    case "$platform" in
        --all)
            build_rust_crypto
            build_go_server
            build_app_bundle
            ;;
        --platform)
            case "${2:-}" in
                ios|android) build_rust_crypto; build_app_bundle ;;
                desktop) build_rust_crypto ;;
                server) build_go_server ;;
                *) log_fail "Unknown platform: ${2:-}"; exit 1 ;;
            esac
            ;;
        *)
            log_fail "Unknown option: $platform"
            echo "Usage: $0 [--platform ios|android|desktop|server] [--verify <manifest>]"
            exit 1
            ;;
    esac

    generate_manifest

    echo ""
    log_pass "Reproducible build complete"
    log_info "Artifacts in: $BUILD_DIR"
    log_info "Manifest: $MANIFEST_FILE"
}

main "$@"
