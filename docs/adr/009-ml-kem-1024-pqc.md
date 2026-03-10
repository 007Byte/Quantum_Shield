# ADR-009: ML-KEM-1024 for Post-Quantum Key Encapsulation

## Status: Accepted

## Date: 2024-03-05

## Context

Recent advances in quantum computing threaten RSA and ECC security (Shor's algorithm). QAV must prepare for post-quantum cryptography (PQC):

- NIST standardized ML-KEM-1024 in FIPS 203 (August 2024)
- Hybrid approach: combine classical (X25519) with post-quantum (ML-KEM) for future-proofing
- Gradual rollout strategy required (device OS support, client app updates)
- Feature-gated deployment to detect client compatibility issues

## Decision

Implement **ML-KEM-1024 for post-quantum key encapsulation** with:

1. **Hybrid KEX Strategy**:
   - Phase 1 (Current): X25519 only (backward-compatible)
   - Phase 2 (2025): Offer ML-KEM option, clients can upgrade
   - Phase 3 (2027): Hybrid mode (X25519 + ML-KEM) mandatory

2. **Key Exchange Protocol**:
   - Server generates ephemeral X25519 keypair + ML-KEM public key
   - Client generates ephemeral X25519 keypair + ML-KEM ciphertext
   - Shared secret: `HKDF(X25519_ss || ML-KEM-ciphertext, salt="pqc-hybrid")`
   - Backward-compatible: clients ignore unknown algorithms

3. **Feature Gate**:
   - Client: `crypto.enablePQC` flag (default false in MVP)
   - Server: Accept/reject based on client version + feature toggle
   - Metrics: Track PQC adoption rate, latency overhead

## Alternatives Considered

1. **Pure X25519 (Elliptic Curve)**
   - Pros: Proven security, widely deployed, fast
   - Cons: Vulnerable to quantum computers (timeline uncertain: 10-30 years)

2. **ML-KEM only (Post-Quantum only)**
   - Pros: Future-proof today, no hybrid complexity
   - Cons: Unproven in long-term deployment, larger keys (1568 bytes), no fallback if issues discovered

3. **Lattice-based (NTRU, Classic McEliece)**
   - Pros: Alternative post-quantum candidates
   - Cons: NIST standardized ML-KEM-1024 (superior security analysis), larger keys, slower encaps/decaps

## Consequences

### Positive Outcomes

- Protects against future quantum-capable adversaries
- Hybrid approach maintains backward compatibility
- Staged rollout allows testing without forking codebase
- NIST standardization provides confidence (FIPS 203)
- Client opt-in during Phase 2 limits deployment risk
- Incremental approach allows detection of performance issues

### Negative Outcomes

- Additional cryptographic complexity (maintenance burden)
- ML-KEM keys larger (1568 bytes vs X25519's 32 bytes)
- Encapsulation latency overhead (~5-10ms in Rust, negligible in TLS handshake context)
- Feature flag management across mobile + backend versions
- Requires client app updates (not seamless like TLS)
- Test coverage must include hybrid mode failures

## Implementation Notes

- Rust crate: `ml-kem` (NIST-approved, constant-time)
- Hybrid KEX exposed via FFI as `hybrid_encapsulate(x25519_public, mlkem_public) → (ss, ciphertext)`
- Feature gate config: `[crypto] pqc_enabled = false`
- Client-side feature flag: `expo-application.json` feature toggle
- Metrics endpoint: `GET /api/v1/metrics/pqc-adoption` (count active sessions by key type)
- Gradual rollout:
  - Phase 2 (2025-Q2): Clients can opt-in via settings
  - Phase 2 (2025-Q4): Default enabled for new installations
  - Phase 3 (2027-Q1): Require hybrid, drop X25519-only support

- Test cases:
  - X25519 + ML-KEM encapsulation succeeds
  - Decapsulation verifies shared secret matches
  - Client rejects unknown algorithm gracefully
  - Performance: encapsulation <20ms, decapsulation <20ms
