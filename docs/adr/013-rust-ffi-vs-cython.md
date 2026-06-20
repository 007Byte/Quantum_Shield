# ADR-013: Rust FFI vs Cython Compilation

## Status
Accepted

## Context
The V2.0 Fortress spec uses a 5-step signed build pipeline: Cython compilation of 14 security modules to native `.so`/`.pyd`, XOR string obfuscation, PyInstaller bundling, Ed25519 manifest signing, and verification. The Enterprise Edition needed an equivalent approach for a TypeScript/React Native application.

## Decision
Enterprise uses **Rust compiled to native libraries** (via `cbindgen` FFI) instead of Cython compilation.

### Mapping: Cython Modules → Rust Crate

| V2.0 Cython Module | Enterprise Rust Equivalent |
|---------------------|---------------------------|
| `vault_crypto.py` | `usbvault-crypto/src/cipher.rs` + `kdf.rs` |
| `vault_streaming.py` | `usbvault-crypto/src/streaming.rs` |
| `vault_core.py` | `usbvault-crypto/src/vault/header.rs` + `index.rs` |
| `vault_mlock.py` | `usbvault-crypto/src/memory.rs` |
| `vault_anti_debug.py` | `usbvault-app/src/services/security/deviceIntegrity.ts` |
| `vault_integrity.py` | HMAC-SHA256 header integrity (no separate manifest) |
| `vault_brute_force.py` | `usbvault-crypto/src/vault/header.rs` (fail counter) |
| `vault_self_destruct.py` | `usbvault-crypto/src/vault/header.rs` (3-pass overwrite) |
| `vault_ghost.py` | `usbvault-app/src/services/security/forensics.ts` |
| `vault_fido2.py` | `usbvault-app/src/services/fido2Service.ts` |
| `vault_hardening.py` | `usbvault-app/src/services/security/bootHardening.ts` |
| `password_policy.py` | `usbvault-app/src/utils/passwordPolicy.ts` |
| `weak_passwords.py` | `usbvault-app/src/utils/weakPasswordBloom.ts` |
| `obfuscate_strings.py` | N/A — strings in compiled Rust binary are not readable |

### Rationale
1. **Memory safety**: Rust's ownership model prevents buffer overflows, use-after-free, and data races at compile time — stronger than Cython's C extension behavior
2. **Cross-platform**: Single Rust crate compiles to x86_64/ARM64 Linux, macOS, Windows, and WASM — Cython requires per-platform compilation
3. **Performance**: Rust's `opt-level=3` + LTO produces faster code than Cython for crypto operations
4. **No GIL**: Rust operations don't hold Python's Global Interpreter Lock — parallel operations are truly concurrent
5. **Zeroize**: `zeroize` crate provides compiler-guaranteed memory zeroing — Python's `bytearray[:] = b"\x00"` can be optimized away

### Why Not String Obfuscation
- Rust compiles to native machine code — source strings are embedded in the binary, not readable as Python source
- `strip = true` in `Cargo.toml` removes symbol names
- `panic = "abort"` removes stack unwinding code
- These provide stronger anti-RE than XOR obfuscation of Python strings

### Build Pipeline Equivalent
| V2.0 Step | Enterprise Equivalent |
|-----------|----------------------|
| Cython compilation | `cargo build --release` |
| String obfuscation | N/A (compiled binary) |
| PyInstaller bundle | Expo EAS build (mobile) / Docker (server) |
| Ed25519 manifest signing | `cargo-audit` + CI/CD integrity checks |
| Verification | Reproducible builds (`scripts/reproducible-build.sh`) |

## Consequences
- No `.pyc`/`.so` files to sign — integrity is verified through the build pipeline
- Ed25519 signing is no longer needed for the crypto core (kept for server JWT rotation)
- `ed25519-dalek` dependency can be removed from `Cargo.toml` (unused)

## Implementation
- `usbvault-crypto/Cargo.toml` — Build configuration
- `usbvault-crypto/src/ffi/mod.rs` — C FFI exports via `cbindgen`
- `.github/workflows/release.yml` — Multi-platform Rust builds
