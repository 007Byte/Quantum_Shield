# ADR-014: Build Pipeline Integrity vs Ed25519 Manifest Signing

## Status
Accepted

## Context
The V2.0 Fortress spec requires Ed25519-signed SHA-256 manifests for binary integrity verification. The `ed25519-dalek` crate was imported in `Cargo.toml` but never used in the Rust crypto core.

## Decision
Remove `ed25519-dalek` from the crypto crate. Integrity verification is handled by the build pipeline instead of runtime manifest checking.

### Rationale
1. **Different build model**: V2.0 bundles Python `.pyc`/`.so` files that can be individually tampered — runtime manifest verification catches this. Enterprise ships compiled Rust binaries where individual modules can't be swapped.
2. **Build pipeline verification**: `cargo-audit` (dependency CVEs), `cargo-deny` (license compliance), reproducible builds, and CI/CD signing replace runtime manifest checks.
3. **HMAC header integrity**: The V4 vault header's HMAC-SHA256 covers all security-critical fields — this protects vault data integrity, which is the actual security requirement.
4. **Binary size**: Removing ed25519-dalek reduces the compiled binary by ~200KB.

### What Replaces Ed25519 Manifest Signing

| V2.0 Integrity Check | Enterprise Equivalent |
|----------------------|----------------------|
| Ed25519 manifest over .pyc/.so files | `cargo-audit` in CI + reproducible builds |
| SHA-256 hash per bundled file | Docker content-addressable layers |
| Runtime signature verification | CSP headers (web) + code signing (native) |
| Manifest embedded in binary | HMAC-SHA256 over vault header |

## Consequences
- `ed25519-dalek` removed from `Cargo.toml`
- X25519 (key exchange for sharing) remains via `x25519-dalek` — different algorithm, different purpose
- If runtime manifest verification is needed in future, it can be re-added

## Implementation
- `usbvault-crypto/Cargo.toml` — Dependency removed
- `.github/workflows/security.yml` — `cargo-audit` runs on every CI build
