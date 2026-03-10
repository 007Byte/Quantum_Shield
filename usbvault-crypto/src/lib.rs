//! Quantum Armor Vault (QAV) - Zero-Knowledge Cryptographic Core
//!
//! This library provides portable cryptographic operations for Quantum Armor Vault (QAV),
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
    derive_file_key, derive_kek, derive_master_key, derive_subkey, generate_salt, unwrap_mek,
    wrap_mek, KeyEncryptionKey, MasterEncryptionKey, MasterKey, WRAPPED_MEK_SIZE,
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
