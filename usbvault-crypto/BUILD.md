# Quantum_Shield Crypto Core - Build Guide

## Overview

This is the zero-knowledge cryptographic core for Quantum_Shield. It compiles to native libraries for:
- iOS (`.a` static library + header)
- Android (`.so` shared library via cargo-ndk)
- macOS (`.dylib`)
- Windows (`.dll`)
- Linux (`.so`)

All encryption/decryption happens in this library — the server never sees plaintext.

## Project Structure

```
usbvault-crypto/
├── Cargo.toml                 # Project manifest with dependencies
├── src/
│   ├── lib.rs                # Main library entry point and re-exports
│   ├── error.rs              # Error types
│   ├── kdf.rs                # Key derivation (Argon2id + HKDF)
│   ├── cipher.rs             # Cipher dispatch (XChaCha20-Poly1305, AES-256-GCM-SIV)
│   ├── streaming.rs          # Chunked streaming AEAD (V2 format)
│   ├── memory.rs             # Secure memory operations (mlock, zeroize)
│   ├── sharing.rs            # E2E sharing via X25519 sealed box
│   ├── srp_client.rs         # SRP-6a client for zero-knowledge auth
│   ├── vault/
│   │   ├── mod.rs
│   │   ├── header.rs         # V2/V3 vault header (byte-compatible with Python)
│   │   └── index.rs          # Vault index (file listing)
│   └── ffi/
│       ├── mod.rs            # C ABI exports for React Native
│       ├── ios.rs            # iOS platform stubs
│       ├── android.rs        # Android/JNI platform stubs
│       └── desktop.rs        # Desktop (macOS/Windows/Linux) platform stubs
└── BUILD.md                  # This file
```

## Building for Each Platform

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add targets
rustup target add aarch64-apple-ios          # iOS
rustup target add aarch64-apple-darwin       # macOS ARM64
rustup target add x86_64-apple-darwin        # macOS Intel
rustup target add x86_64-unknown-linux-gnu   # Linux
rustup target add x86_64-pc-windows-gnu      # Windows (GNU toolchain)
rustup target add x86_64-pc-windows-msvc     # Windows (MSVC toolchain)

# For Android (install cargo-ndk)
cargo install cargo-ndk
rustup target add aarch64-linux-android
rustup target add armv7-linux-androideabi
```

### iOS (Static Library)

```bash
# Build for iOS (ARM64)
cargo build --release --target aarch64-apple-ios --lib

# Build for iOS Simulator
cargo build --release --target x86_64-apple-ios --lib

# Output
# - Debug: target/aarch64-apple-ios/debug/libusbvault_crypto.a
# - Release: target/aarch64-apple-ios/release/libusbvault_crypto.a

# Create header file (manually or use cbindgen)
# cbindgen --config cbindgen.toml --crate usbvault_crypto --output usbvault_crypto.h
```

### Android (Shared Library via JNI)

```bash
# Build for Android (armv8-a)
cargo ndk -t arm64-v8a build --release

# Build for multiple architectures
cargo ndk -t arm64-v8a -t armeabi-v7a build --release

# Output
# - target/aarch64-linux-android/release/libusbvault_crypto.so
# - target/armv7-linux-androideabi/release/libusbvault_crypto.so
```

### macOS (Dynamic Library)

```bash
# Build for macOS (universal: Intel + ARM64)
cargo build --release --target x86_64-apple-darwin --lib
cargo build --release --target aarch64-apple-darwin --lib

# Create universal binary
lipo -create \
  target/x86_64-apple-darwin/release/libusbvault_crypto.dylib \
  target/aarch64-apple-darwin/release/libusbvault_crypto.dylib \
  -output libusbvault_crypto.dylib

# Output
# - target/[target]/release/libusbvault_crypto.dylib
```

### Windows (DLL)

```bash
# Build for Windows (MSVC or GNU)
cargo build --release --target x86_64-pc-windows-msvc --lib
# or
cargo build --release --target x86_64-pc-windows-gnu --lib

# Output
# - target/x86_64-pc-windows-msvc/release/usbvault_crypto.dll
# - target/x86_64-pc-windows-msvc/release/usbvault_crypto.lib
```

### Linux (Shared Object)

```bash
# Build for Linux
cargo build --release --target x86_64-unknown-linux-gnu --lib

# Output
# - target/x86_64-unknown-linux-gnu/release/libusbvault_crypto.so
```

## FFI C Interface

The library exports a C ABI for calling from React Native via FFI/JSI bridge:

### Key Functions

```c
// Key derivation
int usbvault_derive_key(
    const uint8_t *password, size_t password_len,
    const uint8_t *salt, size_t salt_len,
    uint8_t *out, size_t *out_len
);

// Encryption
int usbvault_encrypt(
    uint8_t cipher_id,
    const uint8_t *key, size_t key_len,
    const uint8_t *plaintext, size_t plaintext_len,
    uint8_t *out, size_t out_capacity,
    size_t *out_len
);

// Decryption
int usbvault_decrypt(
    uint8_t cipher_id,
    const uint8_t *key, size_t key_len,
    const uint8_t *ciphertext, size_t ciphertext_len,
    uint8_t *out, size_t out_capacity,
    size_t *out_len
);

// E2E Sharing
int usbvault_generate_keypair(uint8_t *public_out, uint8_t *secret_out);
int usbvault_seal(const uint8_t *recipient_public, const uint8_t *plaintext, size_t plaintext_len, uint8_t *out, size_t out_capacity, size_t *out_len);
int usbvault_open(const uint8_t *secret_key, const uint8_t *sealed, size_t sealed_len, uint8_t *out, size_t out_capacity, size_t *out_len);
```

### Error Codes

- `0` — Success (ERR_SUCCESS)
- `-1` — Invalid key (ERR_INVALID_KEY)
- `-2` — Invalid nonce (ERR_INVALID_NONCE)
- `-3` — Decryption failed (ERR_DECRYPTION_FAILED)
- `-4` — Invalid header (ERR_INVALID_HEADER)
- `-5` — Invalid magic (ERR_INVALID_MAGIC)
- `-6` — Invalid version (ERR_INVALID_VERSION)
- `-7` — Corrupted chunk (ERR_CORRUPTED_CHUNK)
- `-8` — Corrupted index (ERR_CORRUPTED_INDEX)
- `-9` — Key derivation failed (ERR_KEY_DERIVATION_FAILED)
- `-10` — Sharing error (ERR_SHARING_ERROR)
- `-11` — Serialization error (ERR_SERIALIZATION_ERROR)
- `-12` — I/O error (ERR_IO_ERROR)
- `-13` — Memory error (ERR_MEMORY_ERROR)
- `-14` — Invalid cipher (ERR_INVALID_CIPHER)
- `-15` — Buffer too small (ERR_BUFFER_TOO_SMALL)
- `-16` — Invalid argument (ERR_INVALID_ARGUMENT)

## Cryptographic Algorithms

### Key Derivation

- **Argon2id**: 64MB memory, 3 iterations, 4 lanes → 64 bytes
  - First 32 bytes: encryption key
  - Last 32 bytes: HMAC key

### Symmetric Encryption

- **XChaCha20-Poly1305** (cipher_id=2):
  - 24-byte nonce
  - 256-bit key
  - 128-bit authentication tag

- **AES-256-GCM-SIV** (cipher_id=3):
  - 12-byte nonce
  - 256-bit key
  - 128-bit authentication tag

### Asymmetric Sharing

- **X25519**: ECDH key exchange
- **HKDF-SHA256**: Derive shared secret key
- **XChaCha20-Poly1305**: Encrypt sealed message

### Authentication

- **SRP-6a**: Zero-knowledge password authentication
- **HMAC-SHA256**: Message authentication

## Vault Format (V2/V3)

### Header

- **Magic**: `USBVLT02` (V2) or `USBVLT03` (V3)
- **Size**: 4096 bytes (V2) or 16384 bytes (V3)
- **Contents**: KDF params, cipher ID, salt, password verifier, index pointers, optional TFA blocks

### Streaming Records

- **Magic**: `V2RC` (4 bytes)
- **Base Nonce**: 24 bytes
- **Chunk 0** (metadata): type, filename_len, filename, data_len
- **Chunks 1..N** (data): 64KB chunks, each encrypted independently

### Index

- **Format**: JSON
- **Contents**: `{filename: offset, ...}`

## Testing

```bash
# Run all tests
cargo test --release

# Run specific test
cargo test test_derive_master_key -- --nocapture

# Test with verbose output
cargo test -- --nocapture --test-threads=1
```

## Security Considerations

1. **Key Material**: All keys are wrapped in `Zeroizing<>` wrappers for automatic secure cleanup
2. **Nonces**: Generated randomly for each encryption operation
3. **Password Verification**: HMAC-protected; never decrypts plaintext for verification
4. **E2E Sharing**: X25519 ephemeral keys ensure perfect forward secrecy
5. **Memory Locking**: Platform-specific mlock() support (Linux)

## Integration with React Native

### JavaScript/TypeScript Bridge

```typescript
// Load native library
const crypto = NativeModules.USBVaultCrypto;

// Derive key
const masterKey = await crypto.deriveKey(password, salt);

// Encrypt
const ciphertext = await crypto.encrypt(
    2, // XChaCha20-Poly1305
    masterKey,
    plaintext
);

// Decrypt
const plaintext = await crypto.decrypt(
    2,
    masterKey,
    ciphertext
);
```

## Performance

- **Key Derivation**: ~1s (Argon2id, 64MB, 3 iterations)
- **Encryption/Decryption**: ~100MB/s (depends on platform)
- **Streaming Overhead**: <1% (chunked encryption)

## Future Enhancements

- Post-quantum cryptography support (Kyber, Dilithium)
- Hardware security module (HSM) integration
- TPM 2.0 support
- Threshold cryptography (Shamir secret sharing)
