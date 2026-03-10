# ADR-005: XChaCha20-Poly1305 as Primary Cipher

## Status: Accepted

## Date: 2024-02-10

## Context

QAV encrypts all user data with an AEAD cipher. Requirements:

- Random nonce for every message (prevent replay attacks)
- Deterministic authentication (detect tampering)
- 256-bit key strength
- Performance suitable for bulk encryption (documents, file attachments)
- Timing-attack resistance

Initial evaluation included AES-256-GCM and AES-256-GCM-SIV.

## Decision

**XChaCha20-Poly1305** as the default cipher for:

1. Symmetric data encryption (vault records, documents)
2. File attachment encryption (client and server-side)

With AES-256-GCM as secondary cipher for compatibility (future cryptographic agility).

Key parameters:
- 192-bit random nonce (XChaCha20 extension allows 24 bytes vs AES-GCM's 12)
- 256-bit key from HKDF-SHA256 key derivation
- Poly1305 for authentication (16-byte AEAD tag)
- Plaintext compression before encryption (reduce ciphertext size)

## Alternatives Considered

1. **AES-256-GCM (standard mode)**
   - Pros: Hardware acceleration (AES-NI), well-studied, NIST-standardized
   - Cons: 12-byte nonce limit encourages nonce-reuse bugs, slower without hardware, timing attacks if implementation naive

2. **AES-256-GCM-SIV (Synthetic IV mode)**
   - Pros: Nonce misuse-resistant (safe if nonce reused), deterministic authentication
   - Cons: No performance advantage vs XChaCha20-Poly1305, less deployed code paths, deterministic output leaks patterns

## Consequences

### Positive Outcomes

- XChaCha20 longer nonce (24 bytes vs 12) allows random generation without nonce management complexity
- Chacha20 proven in practice (Signal, WireGuard, IETF RFC 8439)
- Poly1305 authentication equivalent to AES-GCM (both 128-bit security margin)
- Software-based constant-time implementation immune to timing attacks
- Excellent performance: comparable to AES-GCM on modern CPUs (2-3GB/s)
- No hardware acceleration required (works on all platforms)

### Negative Outcomes

- Chacha20 slightly slower than AES-GCM on systems with AES-NI (mitigated: our throughput adequate)
- Fewer deployed implementations vs AES-GCM (mitigated: standardized in IETF RFC 8439)
- Hardware acceleration unavailable (future ARM NEON, x86 AVX-512 support would improve)

## Implementation Notes

- Key derivation: `HKDF-SHA256(masterKey, salt=nonce[:16], info="encryption")`
- Nonce generated from `rand.Read()` on every encryption (no counter management)
- Ciphertext format: `[nonce (24 bytes) | tag (16 bytes) | encrypted_data]`
- Compression via `flate` before encryption (reduces plaintext size 30-50%)
- No nonce replay checks required (random 24-byte nonce collision negligible: ~2^96 birthday)
- Rust implementation via `chacha20poly1305` crate, exposed via FFI
