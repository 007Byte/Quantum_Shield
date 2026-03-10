//! Hybrid X25519 + ML-KEM-1024 key encapsulation
//!
//! Combines classical X25519 ECDH with post-quantum ML-KEM-1024
//! using HKDF-SHA256 to derive the final shared secret from both.
//!
//! # Security Properties
//! - **Hybrid security**: Secure if EITHER X25519 OR ML-KEM-1024 remains unbroken
//! - **Quantum resistance**: ML-KEM-1024 protects against quantum adversaries
//! - **Classical fallback**: X25519 ensures security if ML-KEM is broken
//!
//! # Sealed Box Format
//! ```text
//! x25519_ephemeral(32) || mlkem_ciphertext(1568) || nonce(24) || encrypted_data || tag(16)
//! Total overhead: 32 + 1568 + 24 + 16 = 1640 bytes before payload
//! ```

use crate::error::{CryptoError, Result};
use crate::kdf::derive_subkey;
use crate::pqc::ml_kem;

use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305,
};
use generic_array::GenericArray;
use rand::rngs::OsRng;
use rand::RngCore;
use x25519_dalek::{PublicKey, StaticSecret};

/// Hybrid public key: X25519(32) + ML-KEM-1024 encapsulation key(1568)
#[derive(Debug, Clone)]
pub struct HybridPublicKey {
    /// X25519 public key (32 bytes)
    pub x25519: [u8; 32],
    /// ML-KEM-1024 encapsulation key (1568 bytes)
    pub ml_kem: Vec<u8>,
}

/// Hybrid secret key: X25519(32) + ML-KEM-1024 decapsulation key(1568)
#[derive(Clone)]
pub struct HybridSecretKey {
    /// X25519 secret key (32 bytes, zeroed on drop)
    pub x25519: zeroize::Zeroizing<[u8; 32]>,
    /// ML-KEM-1024 decapsulation key (1568 bytes, zeroed on drop)
    pub ml_kem: zeroize::Zeroizing<Vec<u8>>,
}

impl Drop for HybridSecretKey {
    fn drop(&mut self) {
        // Zeroizing wrappers handle cleanup automatically
    }
}

/// Generate a hybrid keypair (X25519 + ML-KEM-1024)
///
/// # Returns
/// Tuple of (HybridPublicKey, HybridSecretKey)
///
/// # Note
/// Requires the `pqc` feature flag to be enabled.
#[cfg(feature = "pqc")]
pub fn generate_hybrid_keypair() -> Result<(HybridPublicKey, HybridSecretKey)> {
    // Generate X25519 keypair
    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    let x25519_secret = StaticSecret::random_from_rng(OsRng);
    let x25519_public = PublicKey::from(&x25519_secret);

    // Generate ML-KEM-1024 keypair
    let (ml_kem_ek, ml_kem_dk) = ml_kem::generate_keypair()?;

    let public_key = HybridPublicKey {
        x25519: *x25519_public.as_bytes(),
        ml_kem: ml_kem_ek,
    };

    let secret_key = HybridSecretKey {
        x25519: zeroize::Zeroizing::new(x25519_secret.to_bytes()),
        ml_kem: zeroize::Zeroizing::new(ml_kem_dk),
    };

    Ok((public_key, secret_key))
}

/// Derive a shared secret from both X25519 and ML-KEM shared secrets
///
/// Combines both secrets via HKDF-SHA256 with context string.
/// If either secret is compromised but the other isn't, security is maintained.
fn combine_shared_secrets(x25519_ss: &[u8], ml_kem_ss: &[u8]) -> Result<[u8; 32]> {
    // Concatenate both shared secrets: X25519(32) || ML-KEM(32)
    let mut combined = Vec::with_capacity(x25519_ss.len() + ml_kem_ss.len());
    combined.extend_from_slice(x25519_ss);
    combined.extend_from_slice(ml_kem_ss);

    // Derive final key via HKDF with purpose string
    // This ensures different key material is used for hybrid vs classical operations
    derive_subkey(&combined, "hybrid_seal_x25519_mlkem1024")
}

/// Hybrid seal: encrypt plaintext for a recipient using hybrid KEM
///
/// # Arguments
/// * `recipient` - The recipient's HybridPublicKey
/// * `plaintext` - Data to encrypt
///
/// # Returns
/// Sealed blob: x25519_eph(32) || mlkem_ct(1568) || nonce(24) || ciphertext || tag(16)
///
/// # Encryption Process
/// 1. Generate ephemeral X25519 keypair
/// 2. Perform ECDH with recipient's X25519 public key
/// 3. Encapsulate to recipient's ML-KEM-1024 key
/// 4. Combine both shared secrets via HKDF
/// 5. Encrypt plaintext with XChaCha20-Poly1305
///
/// # Note
/// Requires the `pqc` feature flag to be enabled.
#[cfg(feature = "pqc")]
pub fn hybrid_seal(recipient: &HybridPublicKey, plaintext: &[u8]) -> Result<Vec<u8>> {
    // X25519 ECDH
    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    let ephemeral_secret = StaticSecret::random_from_rng(OsRng);
    let ephemeral_public = PublicKey::from(&ephemeral_secret);
    let recipient_x25519 = PublicKey::from(recipient.x25519);
    let x25519_ss = ephemeral_secret.diffie_hellman(&recipient_x25519);

    // ML-KEM-1024 encapsulation
    let (ml_kem_ct, ml_kem_ss) = ml_kem::encapsulate(&recipient.ml_kem)?;

    // Combine shared secrets
    let key = combine_shared_secrets(x25519_ss.as_bytes(), &ml_kem_ss)?;

    // Encrypt with XChaCha20-Poly1305
    let mut nonce = [0u8; 24];
    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    OsRng.fill_bytes(&mut nonce);

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&key));
    let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

    let ciphertext = cipher
        .encrypt(nonce_array, plaintext)
        .map_err(|_| CryptoError::SharingError)?;

    // Assemble: x25519_eph(32) || mlkem_ct(1568) || nonce(24) || ciphertext || tag(16)
    let mut result = Vec::with_capacity(32 + ml_kem_ct.len() + 24 + ciphertext.len());
    result.extend_from_slice(ephemeral_public.as_bytes());
    result.extend_from_slice(&ml_kem_ct);
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Hybrid open: decrypt a hybrid sealed message
///
/// # Arguments
/// * `recipient_secret` - The recipient's HybridSecretKey
/// * `sealed` - Sealed blob from hybrid_seal()
///
/// # Returns
/// Decrypted plaintext
///
/// # Decryption Process
/// 1. Parse components: ephemeral X25519 PK, ML-KEM ciphertext, nonce, ciphertext
/// 2. Perform ECDH with ephemeral X25519 key
/// 3. Decapsulate ML-KEM ciphertext with secret key
/// 4. Combine both shared secrets via HKDF (same as seal)
/// 5. Decrypt ciphertext with XChaCha20-Poly1305
///
/// # Note
/// Requires the `pqc` feature flag to be enabled.
#[cfg(feature = "pqc")]
pub fn hybrid_open(recipient_secret: &HybridSecretKey, sealed: &[u8]) -> Result<Vec<u8>> {
    const X25519_SIZE: usize = 32;
    const MLKEM_CT_SIZE: usize = 1568;
    const NONCE_SIZE: usize = 24;
    const MIN_SIZE: usize = X25519_SIZE + MLKEM_CT_SIZE + NONCE_SIZE + 16;

    if sealed.len() < MIN_SIZE {
        return Err(CryptoError::SharingError);
    }

    let mut offset = 0;

    // Extract X25519 ephemeral public key
    let ephemeral_x25519: [u8; 32] = sealed[offset..offset + 32]
        .try_into()
        .map_err(|_| CryptoError::SharingError)?;
    offset += 32;

    // Extract ML-KEM ciphertext
    let ml_kem_ct = &sealed[offset..offset + MLKEM_CT_SIZE];
    offset += MLKEM_CT_SIZE;

    // Extract nonce
    let nonce: [u8; 24] = sealed[offset..offset + 24]
        .try_into()
        .map_err(|_| CryptoError::SharingError)?;
    offset += 24;

    // Extract ciphertext (remaining bytes)
    let ciphertext = &sealed[offset..];

    // X25519 ECDH
    let x25519_bytes: [u8; 32] = recipient_secret.x25519.as_slice().try_into().unwrap();
    let secret = StaticSecret::from(x25519_bytes);
    let ephemeral_pk = PublicKey::from(ephemeral_x25519);
    let x25519_ss = secret.diffie_hellman(&ephemeral_pk);

    // ML-KEM decapsulation
    let ml_kem_ss = ml_kem::decapsulate(&recipient_secret.ml_kem, ml_kem_ct)?;

    // Combine shared secrets (same as seal)
    let key = combine_shared_secrets(x25519_ss.as_bytes(), &ml_kem_ss)?;

    // Decrypt
    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&key));
    let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

    cipher
        .decrypt(nonce_array, ciphertext)
        .map_err(|_| CryptoError::SharingError)
}

// Stub implementations when pqc feature is not enabled
#[cfg(not(feature = "pqc"))]
pub fn generate_hybrid_keypair() -> Result<(HybridPublicKey, HybridSecretKey)> {
    Err(CryptoError::InvalidInput(
        "Hybrid PQC not available: compile with 'pqc' feature".to_string(),
    ))
}

#[cfg(not(feature = "pqc"))]
pub fn hybrid_seal(_recipient: &HybridPublicKey, _plaintext: &[u8]) -> Result<Vec<u8>> {
    Err(CryptoError::InvalidInput(
        "Hybrid PQC not available: compile with 'pqc' feature".to_string(),
    ))
}

#[cfg(not(feature = "pqc"))]
pub fn hybrid_open(_recipient_secret: &HybridSecretKey, _sealed: &[u8]) -> Result<Vec<u8>> {
    Err(CryptoError::InvalidInput(
        "Hybrid PQC not available: compile with 'pqc' feature".to_string(),
    ))
}

#[cfg(all(test, feature = "pqc"))]
mod tests {
    use super::*;

    #[test]
    fn test_hybrid_keypair_generation() {
        let (pk, sk) = generate_hybrid_keypair().expect("Keypair generation failed");
        assert_eq!(pk.x25519.len(), 32);
        assert_eq!(pk.ml_kem.len(), ml_kem::PUBLIC_KEY_SIZE);
        assert_eq!(sk.x25519.len(), 32);
        assert_eq!(sk.ml_kem.len(), ml_kem::PUBLIC_KEY_SIZE);
    }

    #[test]
    fn test_hybrid_seal_open_roundtrip() {
        let (pk, sk) = generate_hybrid_keypair().expect("Keypair generation failed");
        let plaintext = b"Hybrid post-quantum encrypted message!";

        let sealed = hybrid_seal(&pk, plaintext).expect("Seal failed");
        let opened = hybrid_open(&sk, &sealed).expect("Open failed");

        assert_eq!(plaintext.as_slice(), opened.as_slice());
    }

    #[test]
    fn test_hybrid_seal_creates_different_ciphertexts() {
        let (pk, _sk) = generate_hybrid_keypair().unwrap();
        let plaintext = b"Same plaintext";

        let sealed1 = hybrid_seal(&pk, plaintext).unwrap();
        let sealed2 = hybrid_seal(&pk, plaintext).unwrap();

        // Different nonces should produce different sealed boxes
        // (with overwhelming probability)
        assert_ne!(sealed1, sealed2);
    }

    #[test]
    fn test_hybrid_wrong_key_fails() {
        let (pk1, _sk1) = generate_hybrid_keypair().unwrap();
        let (_pk2, sk2) = generate_hybrid_keypair().unwrap();

        let sealed = hybrid_seal(&pk1, b"secret data").unwrap();
        let result = hybrid_open(&sk2, &sealed);

        assert!(result.is_err());
    }

    #[test]
    fn test_hybrid_sealed_box_format() {
        let (pk, _sk) = generate_hybrid_keypair().unwrap();
        let sealed = hybrid_seal(&pk, b"test").unwrap();

        // Minimum: x25519(32) + mlkem_ct(1568) + nonce(24) + ct(4) + tag(16)
        assert!(sealed.len() >= 32 + 1568 + 24 + 4 + 16);
    }

    #[test]
    fn test_combined_secret_deterministic() {
        let x25519_ss = [0x42u8; 32];
        let ml_kem_ss = [0x99u8; 32];

        let key1 = combine_shared_secrets(&x25519_ss, &ml_kem_ss).unwrap();
        let key2 = combine_shared_secrets(&x25519_ss, &ml_kem_ss).unwrap();

        assert_eq!(key1, key2);
    }

    #[test]
    fn test_combined_secret_changes_with_different_inputs() {
        let x25519_ss_1 = [0x42u8; 32];
        let x25519_ss_2 = [0x43u8; 32];
        let ml_kem_ss = [0x99u8; 32];

        let key1 = combine_shared_secrets(&x25519_ss_1, &ml_kem_ss).unwrap();
        let key2 = combine_shared_secrets(&x25519_ss_2, &ml_kem_ss).unwrap();

        assert_ne!(key1, key2);
    }

    #[test]
    fn test_hybrid_empty_plaintext() {
        let (pk, sk) = generate_hybrid_keypair().unwrap();
        let sealed = hybrid_seal(&pk, b"").unwrap();
        let opened = hybrid_open(&sk, &sealed).unwrap();

        assert!(opened.is_empty());
    }

    #[test]
    fn test_hybrid_large_plaintext() {
        let (pk, sk) = generate_hybrid_keypair().unwrap();
        let plaintext = vec![0x42u8; 65536]; // 64 KB

        let sealed = hybrid_seal(&pk, &plaintext).unwrap();
        let opened = hybrid_open(&sk, &sealed).unwrap();

        assert_eq!(plaintext, opened);
    }

    #[test]
    fn test_hybrid_tampered_sealed_box_fails() {
        let (pk, sk) = generate_hybrid_keypair().unwrap();
        let mut sealed = hybrid_seal(&pk, b"secret").unwrap();

        // Tamper with the ciphertext portion
        if sealed.len() > 1640 {
            sealed[1640] ^= 0xFF;
            let result = hybrid_open(&sk, &sealed);
            assert!(result.is_err());
        }
    }

    #[test]
    fn test_hybrid_short_sealed_box_fails() {
        let (_, sk) = generate_hybrid_keypair().unwrap();
        let short_sealed = vec![0u8; 100];

        let result = hybrid_open(&sk, &short_sealed);
        assert!(result.is_err());
    }
}
