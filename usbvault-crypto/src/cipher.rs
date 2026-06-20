//! Cryptographic cipher implementation supporting XChaCha20-Poly1305 and AES-256-GCM-SIV

use crate::error::{CryptoError, Result};
use aes_gcm_siv::{
    aead::{Aead, KeyInit},
    Aes256GcmSiv,
};
use chacha20poly1305::XChaCha20Poly1305;
use generic_array::GenericArray;
use rand::rngs::OsRng;
use rand::RngCore;

/// Cipher algorithm identifier
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CipherId {
    /// XChaCha20-Poly1305 (24-byte nonce)
    XChaCha20Poly1305 = 2,
    /// AES-256-GCM-SIV (12-byte nonce)
    Aes256GcmSiv = 3,
}

impl CipherId {
    /// Get nonce size in bytes
    pub fn nonce_size(&self) -> usize {
        match self {
            CipherId::XChaCha20Poly1305 => 24,
            CipherId::Aes256GcmSiv => 12,
        }
    }

    /// Get tag size in bytes (AEAD authentication tag)
    pub fn tag_size(&self) -> usize {
        16 // Both algorithms use 128-bit tags
    }

    /// Construct from byte
    pub fn from_byte(b: u8) -> Result<Self> {
        match b {
            2 => Ok(CipherId::XChaCha20Poly1305),
            3 => Ok(CipherId::Aes256GcmSiv),
            _ => Err(CryptoError::InvalidCipher),
        }
    }

    /// Get as byte
    pub fn as_byte(&self) -> u8 {
        *self as u8
    }
}

/// Encrypt plaintext with random nonce
///
/// # Returns
/// nonce || ciphertext || tag (nonce prepended to ciphertext)
pub fn encrypt(cipher_id: CipherId, key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
    if key.len() != 32 {
        return Err(CryptoError::InvalidKey);
    }

    match cipher_id {
        CipherId::XChaCha20Poly1305 => encrypt_xchacha20(key, plaintext),
        CipherId::Aes256GcmSiv => encrypt_aes256(key, plaintext),
    }
}

/// Decrypt ciphertext
///
/// # Arguments
/// * `cipher_id` - Algorithm identifier
/// * `key` - 32-byte encryption key
/// * `ciphertext` - nonce || ciphertext || tag
///
/// # Returns
/// Decrypted plaintext
pub fn decrypt(cipher_id: CipherId, key: &[u8; 32], ciphertext: &[u8]) -> Result<Vec<u8>> {
    if key.len() != 32 {
        return Err(CryptoError::InvalidKey);
    }

    match cipher_id {
        CipherId::XChaCha20Poly1305 => decrypt_xchacha20(key, ciphertext),
        CipherId::Aes256GcmSiv => decrypt_aes256(key, ciphertext),
    }
}

/// XChaCha20-Poly1305 encryption
fn encrypt_xchacha20(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(key));
    let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

    let ciphertext = cipher
        .encrypt(&nonce_array, plaintext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    // Return: nonce || ciphertext
    let mut result = Vec::with_capacity(24 + ciphertext.len());
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// XChaCha20-Poly1305 decryption
fn decrypt_xchacha20(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
    const NONCE_SIZE: usize = 24;
    const TAG_SIZE: usize = 16;
    // DV-007 FIX: Valid AEAD ciphertext must contain at least nonce + tag
    // Previously allowed empty ciphertext (just nonce with no encrypted data)
    if data.len() < NONCE_SIZE + TAG_SIZE {
        return Err(CryptoError::InvalidNonce);
    }

    let (nonce_bytes, ciphertext) = data.split_at(NONCE_SIZE);
    let nonce = chacha20poly1305::XNonce::from_slice(nonce_bytes);

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(key));

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)
}

/// AES-256-GCM-SIV encryption
fn encrypt_aes256(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);

    let cipher = Aes256GcmSiv::new(GenericArray::from_slice(key));
    let nonce_array: &GenericArray<u8, _> = GenericArray::from_slice(&nonce);

    let ciphertext = cipher
        .encrypt(nonce_array, plaintext)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    // Return: nonce || ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// AES-256-GCM-SIV decryption
fn decrypt_aes256(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
    const NONCE_SIZE: usize = 12;
    const TAG_SIZE: usize = 16;
    // DV-007 FIX: Valid AEAD ciphertext must contain at least nonce + tag
    // Previously allowed empty ciphertext (just nonce with no encrypted data)
    if data.len() < NONCE_SIZE + TAG_SIZE {
        return Err(CryptoError::InvalidNonce);
    }

    let (nonce_bytes, ciphertext) = data.split_at(NONCE_SIZE);
    let nonce: &GenericArray<u8, _> = GenericArray::from_slice(nonce_bytes);

    let cipher = Aes256GcmSiv::new(GenericArray::from_slice(key));

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| CryptoError::DecryptionFailed)
}

// ── SG-012: AEAD with Associated Data (version binding) ──────────

/// SG-012: Encrypt plaintext with AEAD associated data (version binding).
///
/// The associated data (AD) is authenticated but NOT encrypted.
/// This binds the ciphertext to the AD — decryption fails if AD doesn't match.
/// Used to bind encrypted file data to its monotonic version counter.
///
/// # Returns
/// nonce || ciphertext || tag
pub fn encrypt_with_ad(
    cipher_id: CipherId,
    key: &[u8; 32],
    plaintext: &[u8],
    ad: &[u8],
) -> Result<Vec<u8>> {
    match cipher_id {
        CipherId::XChaCha20Poly1305 => encrypt_xchacha20_ad(key, plaintext, ad),
        CipherId::Aes256GcmSiv => encrypt_aes256_ad(key, plaintext, ad),
    }
}

/// SG-012: Decrypt ciphertext verifying AEAD associated data.
///
/// Decryption fails if AD doesn't match what was used during encryption,
/// detecting rollback or version tampering.
pub fn decrypt_with_ad(
    cipher_id: CipherId,
    key: &[u8; 32],
    ciphertext: &[u8],
    ad: &[u8],
) -> Result<Vec<u8>> {
    match cipher_id {
        CipherId::XChaCha20Poly1305 => decrypt_xchacha20_ad(key, ciphertext, ad),
        CipherId::Aes256GcmSiv => decrypt_aes256_ad(key, ciphertext, ad),
    }
}

/// SG-012: Build associated data from file version and filename for AEAD binding.
///
/// Format: `"file_version:" || version_le_bytes(8) || ":" || filename_bytes`
///
/// This deterministic format ensures both version and filename are
/// cryptographically bound to the ciphertext.
pub fn build_version_ad(version: u64, filename: &str) -> Vec<u8> {
    let mut ad = Vec::with_capacity(14 + filename.len());
    ad.extend_from_slice(b"file_version:");
    ad.extend_from_slice(&version.to_le_bytes());
    ad.push(b':');
    ad.extend_from_slice(filename.as_bytes());
    ad
}

/// XChaCha20-Poly1305 encryption with associated data
fn encrypt_xchacha20_ad(key: &[u8; 32], plaintext: &[u8], ad: &[u8]) -> Result<Vec<u8>> {
    use chacha20poly1305::aead::Payload;

    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(key));
    let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

    let payload = Payload {
        msg: plaintext,
        aad: ad,
    };
    let ciphertext = cipher
        .encrypt(nonce_array, payload)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    let mut result = Vec::with_capacity(24 + ciphertext.len());
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// XChaCha20-Poly1305 decryption with associated data
fn decrypt_xchacha20_ad(key: &[u8; 32], data: &[u8], ad: &[u8]) -> Result<Vec<u8>> {
    use chacha20poly1305::aead::Payload;
    const NONCE_SIZE: usize = 24;
    const TAG_SIZE: usize = 16;

    if data.len() < NONCE_SIZE + TAG_SIZE {
        return Err(CryptoError::InvalidNonce);
    }

    let (nonce_bytes, ciphertext) = data.split_at(NONCE_SIZE);
    let nonce = chacha20poly1305::XNonce::from_slice(nonce_bytes);
    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(key));

    let payload = Payload {
        msg: ciphertext,
        aad: ad,
    };
    cipher
        .decrypt(nonce, payload)
        .map_err(|_| CryptoError::DecryptionFailed)
}

/// AES-256-GCM-SIV encryption with associated data
fn encrypt_aes256_ad(key: &[u8; 32], plaintext: &[u8], ad: &[u8]) -> Result<Vec<u8>> {
    use aes_gcm_siv::aead::Payload;

    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);

    let cipher = Aes256GcmSiv::new(GenericArray::from_slice(key));
    let nonce_array: &GenericArray<u8, _> = GenericArray::from_slice(&nonce);

    let payload = Payload {
        msg: plaintext,
        aad: ad,
    };
    let ciphertext = cipher
        .encrypt(nonce_array, payload)
        .map_err(|_| CryptoError::DecryptionFailed)?;

    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// AES-256-GCM-SIV decryption with associated data
fn decrypt_aes256_ad(key: &[u8; 32], data: &[u8], ad: &[u8]) -> Result<Vec<u8>> {
    use aes_gcm_siv::aead::Payload;
    const NONCE_SIZE: usize = 12;
    const TAG_SIZE: usize = 16;

    if data.len() < NONCE_SIZE + TAG_SIZE {
        return Err(CryptoError::InvalidNonce);
    }

    let (nonce_bytes, ciphertext) = data.split_at(NONCE_SIZE);
    let nonce: &GenericArray<u8, _> = GenericArray::from_slice(nonce_bytes);
    let cipher = Aes256GcmSiv::new(GenericArray::from_slice(key));

    let payload = Payload {
        msg: ciphertext,
        aad: ad,
    };
    cipher
        .decrypt(nonce, payload)
        .map_err(|_| CryptoError::DecryptionFailed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xchacha20_roundtrip() {
        let key = [0x42u8; 32];
        let plaintext = b"Hello, World!";

        let ciphertext =
            encrypt(CipherId::XChaCha20Poly1305, &key, plaintext).expect("Encryption failed");
        let decrypted =
            decrypt(CipherId::XChaCha20Poly1305, &key, &ciphertext).expect("Decryption failed");

        assert_eq!(plaintext, decrypted.as_slice());
    }

    #[test]
    fn test_aes256_roundtrip() {
        let key = [0x42u8; 32];
        let plaintext = b"Hello, World!";

        let ciphertext =
            encrypt(CipherId::Aes256GcmSiv, &key, plaintext).expect("Encryption failed");
        let decrypted =
            decrypt(CipherId::Aes256GcmSiv, &key, &ciphertext).expect("Decryption failed");

        assert_eq!(plaintext, decrypted.as_slice());
    }

    #[test]
    fn test_invalid_key() {
        let short_key = [0u8; 16];
        let plaintext = b"test";
        let result = encrypt(CipherId::XChaCha20Poly1305, &[0u8; 32], plaintext);
        assert!(result.is_ok()); // 32 bytes is valid
    }

    // SG-012: AEAD with associated data tests

    #[test]
    fn test_xchacha20_ad_roundtrip() {
        let key = [0x42u8; 32];
        let plaintext = b"Secret file content";
        let ad = build_version_ad(1, "test.txt");

        let ciphertext = encrypt_with_ad(CipherId::XChaCha20Poly1305, &key, plaintext, &ad)
            .expect("Encryption with AD failed");
        let decrypted = decrypt_with_ad(CipherId::XChaCha20Poly1305, &key, &ciphertext, &ad)
            .expect("Decryption with AD failed");

        assert_eq!(plaintext, decrypted.as_slice());
    }

    #[test]
    fn test_aes256_ad_roundtrip() {
        let key = [0x42u8; 32];
        let plaintext = b"Secret file content";
        let ad = build_version_ad(1, "test.txt");

        let ciphertext = encrypt_with_ad(CipherId::Aes256GcmSiv, &key, plaintext, &ad)
            .expect("Encryption with AD failed");
        let decrypted = decrypt_with_ad(CipherId::Aes256GcmSiv, &key, &ciphertext, &ad)
            .expect("Decryption with AD failed");

        assert_eq!(plaintext, decrypted.as_slice());
    }

    #[test]
    fn test_ad_mismatch_fails_xchacha20() {
        let key = [0x42u8; 32];
        let plaintext = b"Secret file content";
        let ad_v1 = build_version_ad(1, "test.txt");
        let ad_v2 = build_version_ad(2, "test.txt");

        let ciphertext = encrypt_with_ad(CipherId::XChaCha20Poly1305, &key, plaintext, &ad_v1)
            .expect("Encryption failed");
        // Decrypt with wrong version → must fail
        let result = decrypt_with_ad(CipherId::XChaCha20Poly1305, &key, &ciphertext, &ad_v2);
        assert!(
            result.is_err(),
            "Decryption with wrong version AD should fail"
        );
    }

    #[test]
    fn test_ad_mismatch_fails_aes256() {
        let key = [0x42u8; 32];
        let plaintext = b"Secret file content";
        let ad_v1 = build_version_ad(1, "test.txt");
        let ad_v2 = build_version_ad(2, "test.txt");

        let ciphertext = encrypt_with_ad(CipherId::Aes256GcmSiv, &key, plaintext, &ad_v1)
            .expect("Encryption failed");
        let result = decrypt_with_ad(CipherId::Aes256GcmSiv, &key, &ciphertext, &ad_v2);
        assert!(
            result.is_err(),
            "Decryption with wrong version AD should fail"
        );
    }

    #[test]
    fn test_build_version_ad_deterministic() {
        let ad1 = build_version_ad(42, "important.doc");
        let ad2 = build_version_ad(42, "important.doc");
        let ad3 = build_version_ad(43, "important.doc");
        let ad4 = build_version_ad(42, "other.doc");

        assert_eq!(ad1, ad2); // Same inputs → same AD
        assert_ne!(ad1, ad3); // Different version → different AD
        assert_ne!(ad1, ad4); // Different filename → different AD
    }
}
