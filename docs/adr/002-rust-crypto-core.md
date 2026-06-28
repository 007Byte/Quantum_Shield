# ADR-002: Rust for Cryptographic Core

## Status: Accepted

## Date: 2024-01-20

## Context

The cryptographic core is the most security-critical component of Quantum_Shield. It must:

- Implement XChaCha20-Poly1305 with timing-attack resistance
- Support ML-KEM-1024 for post-quantum key encapsulation
- Manage sensitive key material (no accidental allocations, zerofication on drop)
- Provide high-throughput operations for bulk data encryption
- Run across Linux, macOS, and Windows platforms

Go's crypto/cipher provides adequate AES implementations, but lacks:
- Native timing-attack-resistant implementations
- PostQuantumCrypto library support (KEM)
- Automatic memory zeroization on scope exit

## Decision

Implement the cryptographic core in **Rust 1.75+ (stable)** and expose via C FFI.

Key design:
- Dedicated `qav-crypto` crate using `chacha20poly1305`, `ml-kem`, `x25519-dalek`
- C bindings via `cbindgen` to auto-generate headers
- FFI bridge in Go (`pkg/crypto`) using `cgo`
- All sensitive data zeroized via `zeroize` crate on drop
- No unsafe code except minimal FFI boundary

## Alternatives Considered

1. **Go crypto (crypto/cipher + crypto/aes)**
   - Pros: Simpler deployment (single binary), no FFI complexity
   - Cons: Lacks AEAD NONCE randomization control, no native XCHACHA20, no post-quantum library, memory management less transparent

2. **C/C++ with OpenSSL**
   - Pros: Maximum performance, OpenSSL is mature and audited
   - Cons: Manual memory management error-prone, security patches slow, undefined behavior risks

3. **WebAssembly (TweetNaCl.js)**
   - Pros: Platform-independent, sandboxed execution
   - Cons: JavaScript FFI overhead, slower than native, unsuitable for server-side use

## Consequences

### Positive Outcomes

- Timing-attack resistance automatic via Rust compiler
- Zeroization guaranteed at scope end (no manual cleanup bugs)
- Post-quantum KEM support available today
- Excellent error handling (no null pointers, no buffer overflows)
- Minimal performance overhead vs C/C++
- Type system prevents entire categories of bugs

### Negative Outcomes

- Deployment requires coordinating Rust and Go builds (mitigated via Docker)
- FFI overhead per call (~100ns-1μs per encrypt/decrypt depending on size)
- Team must maintain two codebases with different toolchains
- Debugging crashes across FFI boundary more complex

## Implementation Notes

- Crypto operations bulk-locked via `Arc<Mutex<CryptoState>>` to prevent race conditions
- Go `crypto.Encrypt()` calls `C.xchacha20_poly1305_encrypt()` with panic recovery
- Memory layout verified with `#[repr(C)]` for struct alignment
- CI includes both `cargo test` and Go integration tests
- Cross-compilation via Docker (build Rust artifacts in container, link with Go binary)
