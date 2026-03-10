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
pub use cipher::{encrypt, decrypt, CipherId};
pub use error::{CryptoError, Result};
pub use kdf::{derive_master_key, derive_subkey, generate_salt, MasterKey,
              KeyEncryptionKey, MasterEncryptionKey, derive_kek, wrap_mek, unwrap_mek, derive_file_key,
              WRAPPED_MEK_SIZE};
pub use memory::{secure_zero, SecureVec};
pub use shamir::{create_shares, recover_secret, create_mek_shares, recover_mek,
                 DEFAULT_THRESHOLD, DEFAULT_TOTAL_SHARES};
pub use sharing::{generate_keypair, open, seal, SharePublicKey, ShareSecretKey};
pub use srp_client::{SrpClient, SrpClientSession};
pub use streaming::{StreamingDecryptor, StreamingEncryptor};
pub use vault::header::VaultHeader;
pub use vault::index::{VaultIndex, FileEntry};
