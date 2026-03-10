#!/bin/bash
set -euo pipefail

# QAV FFI Cross-Platform Build Script
# Builds the Rust FFI library for all target platforms

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CRYPTO_DIR="$PROJECT_ROOT/usbvault-crypto"
OUTPUT_DIR="$PROJECT_ROOT/ffi-build-output"

# Platform detection
OS_TYPE=$(uname -s)
ARCH=$(uname -m)

# Functions
print_header() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}"
}

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_usage() {
    cat << EOF
QAV FFI Cross-Platform Build Script

Usage: $0 <platform> [options]

Platforms:
  ios              Build for iOS (device + simulator)
  android          Build for Android (all ABIs)
  macos            Build for macOS (universal binary)
  windows          Build for Windows (MSVC)
  linux            Build for Linux (x86_64 and aarch64)
  all              Build for all platforms (requires toolchains)

Options:
  --output DIR     Output directory (default: $OUTPUT_DIR)
  --verbose        Enable verbose output
  --release        Build in release mode (default: true)
  --debug          Build in debug mode
  --clean          Clean before building
  --no-strip       Don't strip binaries
  --help           Show this help message

Examples:
  $0 ios                    # Build iOS device + simulator
  $0 android                # Build Android all ABIs
  $0 macos --verbose        # Build macOS with verbose output
  $0 all --output ./libs    # Build all platforms to ./libs

EOF
}

# Check if cargo is installed
check_cargo() {
    if ! command -v cargo &> /dev/null; then
        print_error "Rust/Cargo not installed"
        exit 1
    fi
}

# Ensure FFI feature is enabled in Cargo.toml
enable_ffi_feature() {
    cd "$CRYPTO_DIR"
    print_info "Ensuring FFI feature is enabled..."
}

# Install toolchain targets
install_targets() {
    local targets="$1"
    print_info "Installing Rust targets: $targets"
    rustup target add $targets
}

# Build iOS libraries
build_ios() {
    print_header "Building iOS FFI Libraries"
    enable_ffi_feature

    local ios_output="$OUTPUT_DIR/ios"
    mkdir -p "$ios_output/device"
    mkdir -p "$ios_output/simulator"

    print_info "Installing iOS targets..."
    install_targets "aarch64-apple-ios aarch64-apple-ios-sim"

    print_info "Building iOS device library (aarch64-apple-ios)..."
    cd "$CRYPTO_DIR"
    CARGO_CFG_TARGET_OS=ios cargo build --release \
        --target aarch64-apple-ios \
        --lib \
        --features ffi \
        $CARGO_OPTS

    cp target/aarch64-apple-ios/release/libqav_crypto.a "$ios_output/device/"

    print_info "Building iOS simulator library (aarch64-apple-ios-sim)..."
    CARGO_CFG_TARGET_OS=ios cargo build --release \
        --target aarch64-apple-ios-sim \
        --lib \
        --features ffi \
        $CARGO_OPTS

    cp target/aarch64-apple-ios-sim/release/libqav_crypto.a "$ios_output/simulator/"

    print_info "Building iOS xcframework..."
    local xcf_output="$OUTPUT_DIR/ios/xcframework"
    mkdir -p "$xcf_output"

    xcodebuild -create-xcframework \
        -library "$ios_output/device/libqav_crypto.a" \
        -library "$ios_output/simulator/libqav_crypto.a" \
        -output "$xcf_output/QAVCrypto.xcframework"

    print_info "iOS build complete: $ios_output"
}

# Build Android libraries
build_android() {
    print_header "Building Android FFI Libraries"
    enable_ffi_feature

    local android_output="$OUTPUT_DIR/android"
    mkdir -p "$android_output"

    # Check for Android NDK
    if [ -z "${ANDROID_NDK_HOME:-}" ]; then
        print_warning "ANDROID_NDK_HOME not set. Trying default locations..."
        if [ -d "$HOME/Android/Sdk/ndk/25.2.9519653" ]; then
            export ANDROID_NDK_HOME="$HOME/Android/Sdk/ndk/25.2.9519653"
        elif [ -d "$HOME/Android/Sdk/ndk-bundle" ]; then
            export ANDROID_NDK_HOME="$HOME/Android/Sdk/ndk-bundle"
        else
            print_error "Android NDK not found. Set ANDROID_NDK_HOME environment variable."
            exit 1
        fi
    fi

    print_info "Android NDK: $ANDROID_NDK_HOME"

    # Check for cargo-ndk
    if ! command -v cargo-ndk &> /dev/null; then
        print_info "Installing cargo-ndk..."
        cargo install cargo-ndk
    fi

    print_info "Installing Android targets..."
    install_targets "aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android"

    print_info "Building Android libraries..."
    cd "$CRYPTO_DIR"

    cargo ndk \
        --manifest-path Cargo.toml \
        -t arm64-v8a \
        -t armeabi-v7a \
        -t x86_64 \
        -t x86 \
        -o "$android_output" \
        build --release --features ffi $CARGO_OPTS

    # Organize into JNI structure
    print_info "Organizing JNI structure..."
    local jni_dir="$android_output/jni"
    mkdir -p "$jni_dir"

    if [ -d "$android_output/arm64-v8a" ]; then
        mkdir -p "$jni_dir/arm64-v8a"
        mv "$android_output/arm64-v8a"/*.so "$jni_dir/arm64-v8a/" 2>/dev/null || true
    fi

    if [ -d "$android_output/armeabi-v7a" ]; then
        mkdir -p "$jni_dir/armeabi-v7a"
        mv "$android_output/armeabi-v7a"/*.so "$jni_dir/armeabi-v7a/" 2>/dev/null || true
    fi

    if [ -d "$android_output/x86_64" ]; then
        mkdir -p "$jni_dir/x86_64"
        mv "$android_output/x86_64"/*.so "$jni_dir/x86_64/" 2>/dev/null || true
    fi

    if [ -d "$android_output/x86" ]; then
        mkdir -p "$jni_dir/x86"
        mv "$android_output/x86"/*.so "$jni_dir/x86/" 2>/dev/null || true
    fi

    print_info "Android build complete: $android_output"
}

# Build macOS universal binary
build_macos() {
    print_header "Building macOS FFI Libraries"
    enable_ffi_feature

    local macos_output="$OUTPUT_DIR/macos"
    mkdir -p "$macos_output"

    print_info "Installing macOS targets..."
    install_targets "aarch64-apple-darwin x86_64-apple-darwin"

    print_info "Building macOS arm64 (Apple Silicon)..."
    cd "$CRYPTO_DIR"
    cargo build --release \
        --target aarch64-apple-darwin \
        --lib \
        --features ffi \
        $CARGO_OPTS

    print_info "Building macOS x86_64 (Intel)..."
    cargo build --release \
        --target x86_64-apple-darwin \
        --lib \
        --features ffi \
        $CARGO_OPTS

    print_info "Creating universal binary..."
    lipo -create \
        target/aarch64-apple-darwin/release/libqav_crypto.a \
        target/x86_64-apple-darwin/release/libqav_crypto.a \
        -output "$macos_output/libqav_crypto.a"

    # Also keep individual libraries
    cp target/aarch64-apple-darwin/release/libqav_crypto.a "$macos_output/libqav_crypto-arm64.a"
    cp target/x86_64-apple-darwin/release/libqav_crypto.a "$macos_output/libqav_crypto-x86_64.a"

    print_info "macOS build complete: $macos_output"
}

# Build Windows library
build_windows() {
    print_header "Building Windows FFI Libraries"
    enable_ffi_feature

    local windows_output="$OUTPUT_DIR/windows"
    mkdir -p "$windows_output"

    print_info "Installing Windows target..."
    install_targets "x86_64-pc-windows-msvc"

    print_info "Building Windows library..."
    cd "$CRYPTO_DIR"
    cargo build --release \
        --target x86_64-pc-windows-msvc \
        --lib \
        --features ffi \
        $CARGO_OPTS

    cp target/x86_64-pc-windows-msvc/release/qav_crypto.dll "$windows_output/"
    cp target/x86_64-pc-windows-msvc/release/qav_crypto.dll.lib "$windows_output/" 2>/dev/null || true
    cp target/x86_64-pc-windows-msvc/release/qav_crypto.lib "$windows_output/" 2>/dev/null || true

    print_info "Windows build complete: $windows_output"
}

# Build Linux libraries
build_linux() {
    print_header "Building Linux FFI Libraries"
    enable_ffi_feature

    local linux_output="$OUTPUT_DIR/linux"
    mkdir -p "$linux_output"

    print_info "Installing Linux targets..."
    install_targets "x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu"

    # Check for cross-compilation toolchain for aarch64
    if ! command -v aarch64-linux-gnu-gcc &> /dev/null; then
        print_warning "aarch64-linux-gnu not found. Install with: apt-get install gcc-aarch64-linux-gnu"
        print_warning "Building x86_64 only"
    fi

    print_info "Building Linux x86_64 library..."
    cd "$CRYPTO_DIR"
    cargo build --release \
        --target x86_64-unknown-linux-gnu \
        --lib \
        --features ffi \
        $CARGO_OPTS

    cp target/x86_64-unknown-linux-gnu/release/libqav_crypto.so "$linux_output/"

    # Build aarch64 if toolchain is available
    if command -v aarch64-linux-gnu-gcc &> /dev/null; then
        print_info "Building Linux aarch64 library..."
        CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
        cargo build --release \
            --target aarch64-unknown-linux-gnu \
            --lib \
            --features ffi \
            $CARGO_OPTS

        cp target/aarch64-unknown-linux-gnu/release/libqav_crypto.so "$linux_output/libqav_crypto-aarch64.so"
    fi

    print_info "Linux build complete: $linux_output"
}

# Build all platforms
build_all() {
    print_header "Building for ALL Platforms"

    if [ "$OS_TYPE" = "Darwin" ]; then
        print_info "macOS detected, building iOS and macOS..."
        build_ios
        build_macos
    elif [ "$OS_TYPE" = "Linux" ]; then
        print_info "Linux detected, building Android and Linux..."
        build_android
        build_linux
    else
        print_warning "Building available platforms for $OS_TYPE..."
        if command -v cargo-ndk &> /dev/null; then
            build_android
        fi
        build_linux
    fi

    print_info "All platform builds complete: $OUTPUT_DIR"
}

# Generate C headers
generate_headers() {
    print_header "Generating C Headers"

    if ! command -v cbindgen &> /dev/null; then
        print_info "Installing cbindgen..."
        cargo install cbindgen
    fi

    cd "$CRYPTO_DIR"
    print_info "Generating headers with cbindgen..."
    cbindgen --output "$OUTPUT_DIR/qav_crypto.h"

    print_info "Headers generated: $OUTPUT_DIR/qav_crypto.h"
}

# Main script
main() {
    local platform="${1:-}"
    local gen_headers=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            ios|android|macos|windows|linux|all)
                platform="$1"
                shift
                ;;
            --output)
                OUTPUT_DIR="$2"
                shift 2
                ;;
            --verbose)
                CARGO_OPTS="${CARGO_OPTS:-} -v"
                shift
                ;;
            --release)
                CARGO_OPTS="${CARGO_OPTS:-} --release"
                shift
                ;;
            --debug)
                CARGO_OPTS="${CARGO_OPTS:-} --debug"
                shift
                ;;
            --clean)
                print_info "Cleaning build artifacts..."
                cd "$CRYPTO_DIR"
                cargo clean
                shift
                ;;
            --no-strip)
                # No-op for now, can be used for debug builds
                shift
                ;;
            --headers)
                gen_headers=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done

    # Default to release
    if [[ -z "${CARGO_OPTS:-}" ]]; then
        CARGO_OPTS="--release"
    fi

    check_cargo

    if [ -z "$platform" ]; then
        print_error "Platform not specified"
        show_usage
        exit 1
    fi

    print_info "Building FFI libraries for: $platform"
    print_info "Output directory: $OUTPUT_DIR"
    print_info "Cargo options: $CARGO_OPTS"

    case "$platform" in
        ios)
            build_ios
            ;;
        android)
            build_android
            ;;
        macos)
            build_macos
            ;;
        windows)
            build_windows
            ;;
        linux)
            build_linux
            ;;
        all)
            build_all
            ;;
        *)
            print_error "Unknown platform: $platform"
            show_usage
            exit 1
            ;;
    esac

    if [ "$gen_headers" = true ]; then
        generate_headers
    fi

    print_header "Build Complete!"
    print_info "Output directory: $OUTPUT_DIR"
    echo ""
    echo "=== Built Artifacts ==="
    find "$OUTPUT_DIR" -type f \( -name "*.a" -o -name "*.so" -o -name "*.dll" -o -name "*.h" -o -name "*.xcframework" \) 2>/dev/null | sort || true
    echo ""
}

main "$@"
