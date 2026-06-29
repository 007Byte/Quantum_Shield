//! Post-Quantum Cryptography module
//!
//! Provides hybrid classical + post-quantum key encapsulation,
//! combining X25519 (classical ECDH) with ML-KEM-1024 (FIPS 203).
//!
//! # Security Model
//! The hybrid approach ensures security as long as EITHER the classical
//! or post-quantum scheme remains secure. Shared secrets from both
//! are combined via HKDF to derive the final encryption key.
//!
//! # Sealed Box Format
//! ```text
//! x25519_ephemeral(32) || mlkem_ciphertext(1568) || nonce(24) || encrypted_data || tag(16)
//! ```

pub mod hybrid;
pub mod ml_kem;

// Re-export main API
pub use hybrid::{
    generate_hybrid_keypair, hybrid_open, hybrid_open_v2, hybrid_seal, hybrid_seal_v2,
    HybridPublicKey, HybridSecretKey,
};
