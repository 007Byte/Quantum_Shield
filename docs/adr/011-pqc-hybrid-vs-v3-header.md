# ADR-011: PQC Hybrid KEM vs V3 Header Extension

## Status
Accepted

## Context
The V2.0 Fortress spec defines a V3 header extension (16384 bytes) with a dedicated PQC block at offset 2048 containing ML-KEM-1024 public keys and ciphertexts. The Enterprise Edition needed to decide between this fixed-offset approach and a more flexible hybrid KEM architecture.

## Decision
Enterprise uses **X25519 + ML-KEM-1024 hybrid sealed boxes** instead of the V3 fixed PQC header block.

### Rationale
1. **Hybrid security**: Secure if EITHER X25519 OR ML-KEM-1024 remains unbroken — the V3 spec uses ML-KEM-1024 alone, which provides no classical fallback if the PQC algorithm is broken
2. **Shared secret combination**: HKDF-SHA256 with domain separation (`"hybrid_seal_x25519_mlkem1024"`) combines both shared secrets, following NIST SP 800-56C guidance
3. **Flexible format**: Sealed box format (`x25519_eph(32) || mlkem_ct(1568) || nonce(24) || ciphertext || tag(16)`) is self-describing and doesn't require fixed header offsets
4. **Feature-gated**: PQC is a Cargo feature flag (`default = ["pqc"]`) — builds without PQC still compile and work with classical crypto only

## Consequences
- V3 header magic (`USBVLT03`) is still accepted for vault discovery (backward compat)
- V3 header's ML-DSA-87 signature fields are not used — integrity is via HMAC-SHA256 instead
- The V4 header's `wrapped_mek` field can contain PQC-encrypted key material without format changes

## Implementation
- `usbvault-crypto/src/pqc/hybrid.rs` — Full hybrid seal/open implementation
- `usbvault-crypto/src/pqc/ml_kem.rs` — ML-KEM-1024 wrapper
