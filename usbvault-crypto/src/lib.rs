//! Quantum_Shield - Zero-Knowledge Cryptographic Core
//!
//! This library provides portable cryptographic operations for Quantum_Shield,
//! compiled to native libraries for iOS, Android, macOS, Windows, and Linux.
//! All encryption/decryption happens here — the server never sees plaintext.

pub mod cipher;
pub mod error;
pub mod kdf;
pub mod memory;
pub mod metrics;
pub mod shamir;
pub mod sharing;
pub mod srp_client;
pub mod streaming;
pub mod vault;

#[cfg(feature = "pqc")]
pub mod pqc;

#[cfg(feature = "ffi")]
pub mod ffi;

// Re-export public API
pub use cipher::{decrypt, encrypt, CipherId};
pub use error::{CryptoError, Result};
pub use kdf::{
    argon2_bounds, build_kdf_transcript, derive_file_key, derive_kek, derive_kek_v6,
    derive_kek_v6_with_params, derive_kek_with_params, derive_master_key, derive_subkey,
    generate_salt, unwrap_mek, unwrap_mek_ad, validate_argon2_params, wrap_mek, wrap_mek_ad,
    KeyEncryptionKey, MasterEncryptionKey, MasterKey, KDF_TRANSCRIPT_DOMAIN_V6, WRAPPED_MEK_SIZE,
};
pub use memory::{secure_zero, SecureVec};
pub use shamir::{
    create_mek_shares, create_shares, recover_mek, recover_secret, DEFAULT_THRESHOLD,
    DEFAULT_TOTAL_SHARES,
};
pub use sharing::{generate_keypair, open, seal, SharePublicKey, ShareSecretKey};
pub use srp_client::{SrpClient, SrpClientSession};
pub use streaming::{StreamingDecryptor, StreamingEncryptor};
pub use vault::header::VaultHeader;
pub use vault::index::{FileEntry, VaultIndex};
