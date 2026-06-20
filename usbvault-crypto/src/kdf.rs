//! Key derivation functions using Argon2id and HKDF
//!
//! ## SG-013: HKDF Domain Separation Map
//!
//! Every HKDF derivation uses a unique context string (info parameter) to ensure
//! keys derived for one purpose cannot be reused for another. This prevents
//! cross-protocol attacks even if the same master key material is used.
//!
//! | Context String                      | Module          | Purpose                                |
//! |-------------------------------------|-----------------|----------------------------------------|
//! | `"vault_index_encryption"`          | vault/index.rs  | Derive index encryption key from master|
//! | `"file_encryption:{file_id}"`       | kdf.rs          | Per-file encryption key from MEK       |
//! | `"stream_chunk_key:" \|\| nonce(24)`  | streaming.rs    | Per-chunk key for streaming AEAD       |
//! | `"stream_hmac_key"`                 | streaming.rs    | HMAC key for record integrity          |
//! | `"kek_wrapping"`                    | bridge.ts       | KEK domain separation (TypeScript)     |
//! | `"srp-verifier" \|\| salt \|\| identity` | srp_client.rs   | SRP x-derivation salt (Argon2id)     |
//! | `"file_version:" \|\| ver \|\| filename` | cipher.rs       | AEAD AD for rollback protection      |
//!
//! **Rule**: No two operations may share the same info string.

use crate::error::{CryptoError, Result};
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Algorithm, Argon2, Version,
};
use hkdf::Hkdf;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;
use zeroize::Zeroizing;

/// Master key (64 bytes): 32 bytes encryption key + 32 bytes HMAC key
#[derive(Clone)]
pub struct MasterKey(Zeroizing<[u8; 64]>);

impl MasterKey {
    /// Get the encryption key (first 32 bytes)
    pub fn encryption_key(&self) -> &[u8; 32] {
        let bytes: &[u8; 64] = &self.0;
        <&[u8; 32]>::try_from(&bytes[0..32]).unwrap()
    }

    /// Get the HMAC key (last 32 bytes)
    pub fn hmac_key(&self) -> &[u8; 32] {
        let bytes: &[u8; 64] = &self.0;
        <&[u8; 32]>::try_from(&bytes[32..64]).unwrap()
    }

    /// Get the raw key material (all 64 bytes)
    pub fn as_bytes(&self) -> &[u8; 64] {
        &self.0
    }
}

impl Drop for MasterKey {
    fn drop(&mut self) {
        // Zeroizing wrapper handles secure cleanup
    }
}

/// Key Encryption Key - derived from password, used to wrap the Master Encryption Key
#[derive(Clone)]
pub struct KeyEncryptionKey(Zeroizing<[u8; 32]>);

impl KeyEncryptionKey {
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl Drop for KeyEncryptionKey {
    fn drop(&mut self) {
        // Zeroizing wrapper handles cleanup
    }
}

/// Master Encryption Key - random key wrapped by KEK, used for actual encryption
#[derive(Clone)]
pub struct MasterEncryptionKey(Zeroizing<[u8; 64]>);

impl MasterEncryptionKey {
    /// Get the encryption key (first 32 bytes)
    pub fn encryption_key(&self) -> &[u8; 32] {
        <&[u8; 32]>::try_from(&self.0[0..32]).unwrap()
    }

    /// Get the HMAC key (last 32 bytes)
    pub fn hmac_key(&self) -> &[u8; 32] {
        <&[u8; 32]>::try_from(&self.0[32..64]).unwrap()
    }

    /// Get raw bytes
    pub fn as_bytes(&self) -> &[u8; 64] {
        let bytes: &[u8; 64] = &self.0;
        bytes
    }

    /// Generate a new random MEK
    pub fn generate() -> Self {
        let mut key = [0u8; 64];
        // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
        OsRng.fill_bytes(&mut key);
        MasterEncryptionKey(Zeroizing::new(key))
    }

    /// Create from raw bytes
    pub fn from_bytes(bytes: [u8; 64]) -> Self {
        MasterEncryptionKey(Zeroizing::new(bytes))
    }
}

impl Drop for MasterEncryptionKey {
    fn drop(&mut self) {
        // Zeroizing wrapper handles cleanup
    }
}

/// Wrapped MEK blob: nonce(24) || ciphertext(64+16) = 104 bytes
pub const WRAPPED_MEK_SIZE: usize = 24 + 64 + 16;

/// Derive a master key from password using Argon2id
///
/// # Arguments
/// * `password` - User password
/// * `salt` - 32-byte salt
///
/// # Returns
/// Master key with 64 bytes: 32 for encryption + 32 for HMAC
pub fn derive_master_key(password: &[u8], salt: &[u8]) -> Result<MasterKey> {
    if salt.len() != 32 {
        return Err(CryptoError::InvalidArgument);
    }

    // Argon2id with 64MB memory, 3 iterations, 4 lanes
    // Note: Parameters::new(m_cost, t_cost, p_cost, output_len)
    // m_cost in KiB, t_cost is iterations, p_cost is parallelism
    let params =
        argon2::Params::new(65536, 3, 4, Some(64)).map_err(|_| CryptoError::KeyDerivationFailed)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::default(), params);

    let salt_str = SaltString::encode_b64(salt).map_err(|_| CryptoError::KeyDerivationFailed)?;

    // Hash password
    let output = argon2
        .hash_password(password, &salt_str)
        .map_err(|_| CryptoError::KeyDerivationFailed)?;

    // Extract the raw hash (64 bytes for Argon2id)
    let hash = output.hash.ok_or(CryptoError::KeyDerivationFailed)?;
    let hash_bytes = hash.as_bytes();

    if hash_bytes.len() < 64 {
        return Err(CryptoError::KeyDerivationFailed);
    }

    let mut key = [0u8; 64];
    key.copy_from_slice(&hash_bytes[0..64]);

    Ok(MasterKey(Zeroizing::new(key)))
}

/// Derive a subkey for a specific purpose using HKDF-SHA256
///
/// # Arguments
/// * `master` - Master key material (typically 32 or 64 bytes)
/// * `info` - Context/purpose string (e.g., "index_encryption", "file_1")
///
/// # Returns
/// 32-byte subkey
pub fn derive_subkey(master: &[u8], info: &str) -> Result<[u8; 32]> {
    // DV-011 FIX: Validate master key minimum length
    if master.is_empty() {
        return Err(CryptoError::InvalidArgument);
    }

    // DV-011 FIX: Validate info string is non-empty and reasonable length
    if info.is_empty() || info.len() > 256 {
        return Err(CryptoError::InvalidArgument);
    }

    let hkdf = Hkdf::<Sha256>::new(None, master);
    let mut subkey = [0u8; 32];
    hkdf.expand(info.as_bytes(), &mut subkey)
        .map_err(|_| CryptoError::KeyDerivationFailed)?;
    Ok(subkey)
}

/// Generate a cryptographically random salt (32 bytes)
pub fn generate_salt() -> [u8; 32] {
    let mut salt = [0u8; 32];
    OsRng.fill_bytes(&mut salt);
    salt
}

/// Derive a KEK from password using Argon2id (same params as master key)
pub fn derive_kek(password: &[u8], salt: &[u8]) -> Result<KeyEncryptionKey> {
    if salt.len() != 32 {
        return Err(CryptoError::InvalidArgument);
    }

    let params =
        argon2::Params::new(65536, 3, 4, Some(32)).map_err(|_| CryptoError::KeyDerivationFailed)?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::default(), params);

    let salt_str = SaltString::encode_b64(salt).map_err(|_| CryptoError::KeyDerivationFailed)?;

    let output = argon2
        .hash_password(password, &salt_str)
        .map_err(|_| CryptoError::KeyDerivationFailed)?;

    let hash = output.hash.ok_or(CryptoError::KeyDerivationFailed)?;
    let hash_bytes = hash.as_bytes();

    if hash_bytes.len() < 32 {
        return Err(CryptoError::KeyDerivationFailed);
    }

    let mut key = [0u8; 32];
    key.copy_from_slice(&hash_bytes[0..32]);

    Ok(KeyEncryptionKey(Zeroizing::new(key)))
}

/// Wrap (encrypt) a MEK with the KEK using XChaCha20-Poly1305
pub fn wrap_mek(kek: &KeyEncryptionKey, mek: &MasterEncryptionKey) -> Result<Vec<u8>> {
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305,
    };
    use generic_array::GenericArray;

    let mut nonce = [0u8; 24];
    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    OsRng.fill_bytes(&mut nonce);

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(kek.as_bytes()));
    let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

    let ciphertext = cipher
        .encrypt(nonce_array, mek.as_bytes().as_ref())
        .map_err(|_| CryptoError::KeyWrappingFailed)?;

    // Return: nonce(24) || ciphertext(64+16)
    let mut result = Vec::with_capacity(WRAPPED_MEK_SIZE);
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// Unwrap (decrypt) a MEK from the wrapped blob using the KEK
pub fn unwrap_mek(kek: &KeyEncryptionKey, wrapped: &[u8]) -> Result<MasterEncryptionKey> {
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305,
    };
    use generic_array::GenericArray;

    if wrapped.len() < WRAPPED_MEK_SIZE {
        return Err(CryptoError::KeyWrappingFailed);
    }

    let nonce = chacha20poly1305::XNonce::from_slice(&wrapped[0..24]);
    let ciphertext = &wrapped[24..];

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(kek.as_bytes()));

    let mut plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::KeyWrappingFailed)?;

    if plaintext.len() != 64 {
        zeroize::Zeroize::zeroize(&mut plaintext);
        return Err(CryptoError::KeyWrappingFailed);
    }

    let mut key = [0u8; 64];
    key.copy_from_slice(&plaintext);
    // Zero the decrypted plaintext Vec before it's dropped
    zeroize::Zeroize::zeroize(&mut plaintext);
    Ok(MasterEncryptionKey::from_bytes(key))
}

/// Derive a per-file encryption key from the MEK using HKDF
pub fn derive_file_key(mek: &MasterEncryptionKey, file_id: &str) -> Result<[u8; 32]> {
    let info = format!("file_encryption:{}", file_id);
    derive_subkey(mek.encryption_key(), &info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_master_key() {
        let password = b"test_password";
        let salt = [0x42u8; 32];

        let key = derive_master_key(password, &salt).expect("Key derivation failed");
        assert_eq!(key.as_bytes().len(), 64);
        assert_eq!(key.encryption_key().len(), 32);
        assert_eq!(key.hmac_key().len(), 32);
    }

    #[test]
    fn test_derive_subkey() {
        let master = [0x42u8; 32];
        let subkey = derive_subkey(&master, "test_context").expect("Subkey derivation failed");
        assert_eq!(subkey.len(), 32);
    }

    #[test]
    fn test_generate_salt() {
        let salt1 = generate_salt();
        let salt2 = generate_salt();
        assert_ne!(salt1, salt2); // Should be random
    }

    #[test]
    fn test_kek_derivation() {
        let password = b"test_password";
        let salt = [0x42u8; 32];
        let kek = derive_kek(password, &salt).expect("KEK derivation failed");
        assert_eq!(kek.as_bytes().len(), 32);
    }

    #[test]
    fn test_mek_wrap_unwrap_roundtrip() {
        let password = b"test_password";
        let salt = [0x42u8; 32];
        let kek = derive_kek(password, &salt).expect("KEK derivation failed");
        let mek = MasterEncryptionKey::generate();

        let wrapped = wrap_mek(&kek, &mek).expect("Wrapping failed");
        assert_eq!(wrapped.len(), WRAPPED_MEK_SIZE);

        let unwrapped = unwrap_mek(&kek, &wrapped).expect("Unwrapping failed");
        assert_eq!(mek.as_bytes(), unwrapped.as_bytes());
    }

    #[test]
    fn test_mek_unwrap_wrong_kek_fails() {
        let kek1 = derive_kek(b"password1", &[0x42u8; 32]).unwrap();
        let kek2 = derive_kek(b"password2", &[0x42u8; 32]).unwrap();
        let mek = MasterEncryptionKey::generate();

        let wrapped = wrap_mek(&kek1, &mek).unwrap();
        let result = unwrap_mek(&kek2, &wrapped);
        assert!(result.is_err());
    }

    #[test]
    fn test_derive_file_key() {
        let mek = MasterEncryptionKey::generate();
        let key1 = derive_file_key(&mek, "file-uuid-1").expect("File key derivation failed");
        let key2 = derive_file_key(&mek, "file-uuid-2").expect("File key derivation failed");
        let key3 = derive_file_key(&mek, "file-uuid-1").expect("File key derivation failed");

        assert_ne!(key1, key2); // Different files get different keys
        assert_eq!(key1, key3); // Same file ID produces same key
    }

    #[test]
    fn test_password_change_rewrap() {
        let old_kek = derive_kek(b"old_password", &[0x11u8; 32]).unwrap();
        let mek = MasterEncryptionKey::generate();
        let wrapped = wrap_mek(&old_kek, &mek).unwrap();

        // Unwrap with old password
        let recovered_mek = unwrap_mek(&old_kek, &wrapped).unwrap();

        // Re-wrap with new password (KEK)
        let new_salt = generate_salt();
        let new_kek = derive_kek(b"new_password", &new_salt).unwrap();
        let rewrapped = wrap_mek(&new_kek, &recovered_mek).unwrap();

        // Verify new password can unwrap
        let final_mek = unwrap_mek(&new_kek, &rewrapped).unwrap();
        assert_eq!(mek.as_bytes(), final_mek.as_bytes());
    }
}
