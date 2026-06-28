#!/bin/bash
# Quantum_Shield — Portable Node.js Bundler
#
# Downloads platform-specific Node.js binaries for USB-bootable deployment.
# Places them in usb-companion/node/{platform}/ for use by launcher scripts.
#
# Usage: ./scripts/bundle-portable-node.sh [--all | --macos | --linux | --windows]

set -e

NODE_VERSION="22.16.0"
BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/usb-companion/node"

echo "USBVault Portable Node.js Bundler"
echo "Node.js version: v${NODE_VERSION}"
echo "Output directory: ${OUTPUT_DIR}"
echo ""

mkdir -p "$OUTPUT_DIR"

download_and_extract() {
    local platform="$1"
    local arch="$2"
    local ext="$3"
    local filename="node-v${NODE_VERSION}-${platform}-${arch}"
    local url="${BASE_URL}/${filename}.${ext}"
    local dest="${OUTPUT_DIR}/${platform}-${arch}"

    echo "Downloading ${filename}.${ext}..."

    if [ -d "$dest" ]; then
        echo "  Already exists: ${dest} (skipping)"
        return
    fi

    mkdir -p "$dest"

    if [ "$ext" = "tar.xz" ] || [ "$ext" = "tar.gz" ]; then
        curl -fSL "$url" | tar -x --strip-components=1 -C "$dest" -J 2>/dev/null || \
        curl -fSL "$url" | tar -x --strip-components=1 -C "$dest" -z
        echo "  Extracted to: ${dest}"
        echo "  Binary: ${dest}/bin/node"
        ls -lh "${dest}/bin/node"
    elif [ "$ext" = "zip" ]; then
        local tmpzip="/tmp/node-${platform}-${arch}.zip"
        curl -fSL "$url" -o "$tmpzip"
        unzip -q "$tmpzip" -d "/tmp/node-extract-$$"
        mv "/tmp/node-extract-$$/${filename}"/* "$dest/"
        rm -rf "/tmp/node-extract-$$" "$tmpzip"
        echo "  Extracted to: ${dest}"
        echo "  Binary: ${dest}/node.exe"
        ls -lh "${dest}/node.exe"
    fi

    echo ""
}

bundle_macos() {
    download_and_extract "darwin" "arm64" "tar.gz"
    # Also bundle x64 for Intel Macs
    download_and_extract "darwin" "x64" "tar.gz"
}

bundle_linux() {
    download_and_extract "linux" "x64" "tar.xz"
    download_and_extract "linux" "arm64" "tar.xz"
}

bundle_windows() {
    download_and_extract "win" "x64" "zip"
    download_and_extract "win" "arm64" "zip"
}

case "${1:-}" in
    --macos)
        bundle_macos
        ;;
    --linux)
        bundle_linux
        ;;
    --windows)
        bundle_windows
        ;;
    --all|"")
        bundle_macos
        bundle_linux
        bundle_windows
        ;;
    *)
        echo "Usage: $0 [--all | --macos | --linux | --windows]"
        exit 1
        ;;
esac

echo "Done! Portable Node.js binaries are in: ${OUTPUT_DIR}"
echo ""
echo "Total size:"
du -sh "$OUTPUT_DIR"/* 2>/dev/null
echo ""
echo "To deploy to USB TOOLS partition:"
echo "  cp -r ${OUTPUT_DIR}/{platform}-{arch} /Volumes/TOOLS/node/"
