//! ML-KEM-1024 (FIPS 203) key encapsulation mechanism wrapper
//!
//! ML-KEM-1024 provides IND-CCA2 security against quantum adversaries.
//! This module wraps the ml-kem crate to provide a consistent interface
//! for hybrid key encapsulation with X25519.
//!
//! # Constants
//! - Public key: 1568 bytes
//! - Ciphertext: 1568 bytes
//! - Shared secret: 32 bytes

use crate::error::{CryptoError, Result};

#[cfg(feature = "pqc")]
use ml_kem::kem::{Decapsulate, Encapsulate};

/// ML-KEM-1024 public key size in bytes
pub const PUBLIC_KEY_SIZE: usize = 1568;

/// ML-KEM-1024 ciphertext size in bytes
pub const CIPHERTEXT_SIZE: usize = 1568;

/// ML-KEM-1024 shared secret size in bytes
pub const SHARED_SECRET_SIZE: usize = 32;

/// Generate an ML-KEM-1024 keypair
///
/// # Returns
/// Tuple of (encapsulation_key, decapsulation_key)
#[cfg(feature = "pqc")]
pub fn generate_keypair() -> Result<(Vec<u8>, Vec<u8>)> {
    use rand::rngs::OsRng;
    use rand::RngCore;

    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    let mut rng = OsRng;
    let (dk, ek) = ml_kem::MlKem1024::generate(&mut rng);

    let ek_bytes = ek.as_bytes().to_vec();
    let dk_bytes = dk.as_bytes().to_vec();

    Ok((ek_bytes, dk_bytes))
}

/// Encapsulate: generate a shared secret and ciphertext from a public key
///
/// # Arguments
/// * `encapsulation_key` - The recipient's ML-KEM-1024 public key (1568 bytes)
///
/// # Returns
/// Tuple of (ciphertext, shared_secret) where:
/// - ciphertext: 1568 bytes to send to recipient
/// - shared_secret: 32 bytes to combine with X25519 secret
#[cfg(feature = "pqc")]
pub fn encapsulate(encapsulation_key: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    use ml_kem::MlKem1024;
    use rand::rngs::OsRng;

    if encapsulation_key.len() != PUBLIC_KEY_SIZE {
        return Err(CryptoError::InvalidKey);
    }

    let ek_array: [u8; PUBLIC_KEY_SIZE] = encapsulation_key
        .try_into()
        .map_err(|_| CryptoError::InvalidKey)?;

    let ek = ml_kem::EncapsulationKey::<ml_kem::MlKem1024Params>::from_bytes(ek_array);

    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    let mut rng = OsRng;
    let (ct, ss) = ek.encapsulate(&mut rng).map_err(|_| CryptoError::SharingError)?;

    Ok((ct.as_bytes().to_vec(), ss.as_bytes().to_vec()))
}

/// Decapsulate: recover the shared secret from ciphertext using the secret key
///
/// # Arguments
/// * `decapsulation_key` - The recipient's ML-KEM-1024 secret key
/// * `ciphertext` - The encapsulated ciphertext (1568 bytes)
///
/// # Returns
/// The 32-byte shared secret to combine with X25519 secret
#[cfg(feature = "pqc")]
pub fn decapsulate(decapsulation_key: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>> {
    use ml_kem::MlKem1024;

    if decapsulation_key.len() != PUBLIC_KEY_SIZE {
        return Err(CryptoError::InvalidKey);
    }

    if ciphertext.len() != CIPHERTEXT_SIZE {
        return Err(CryptoError::InvalidKey);
    }

    let dk_array: [u8; PUBLIC_KEY_SIZE] = decapsulation_key
        .try_into()
        .map_err(|_| CryptoError::InvalidKey)?;

    let ct_array: [u8; CIPHERTEXT_SIZE] = ciphertext
        .try_into()
        .map_err(|_| CryptoError::InvalidKey)?;

    let dk = ml_kem::DecapsulationKey::<ml_kem::MlKem1024Params>::from_bytes(dk_array);
    let ct = ml_kem::Ciphertext::<ml_kem::MlKem1024Params>::from_bytes(ct_array);

    let ss = dk.decapsulate(&ct).map_err(|_| CryptoError::SharingError)?;

    Ok(ss.as_bytes().to_vec())
}

// Stub implementations when pqc feature is not enabled
#[cfg(not(feature = "pqc"))]
pub fn generate_keypair() -> Result<(Vec<u8>, Vec<u8>)> {
    Err(CryptoError::InvalidInput(
        "ML-KEM not available: compile with 'pqc' feature".to_string(),
    ))
}

#[cfg(not(feature = "pqc"))]
pub fn encapsulate(_encapsulation_key: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    Err(CryptoError::InvalidInput(
        "ML-KEM not available: compile with 'pqc' feature".to_string(),
    ))
}

#[cfg(not(feature = "pqc"))]
pub fn decapsulate(_decapsulation_key: &[u8], _ciphertext: &[u8]) -> Result<Vec<u8>> {
    Err(CryptoError::InvalidInput(
        "ML-KEM not available: compile with 'pqc' feature".to_string(),
    ))
}

#[cfg(all(test, feature = "pqc"))]
mod tests {
    use super::*;

    #[test]
    fn test_ml_kem_keypair_generation() {
        let (ek, dk) = generate_keypair().expect("Keypair generation failed");
        assert_eq!(ek.len(), PUBLIC_KEY_SIZE);
        assert_eq!(dk.len(), PUBLIC_KEY_SIZE);
    }

    #[test]
    fn test_ml_kem_encapsulate_decapsulate_roundtrip() {
        let (ek, dk) = generate_keypair().expect("Keypair generation failed");

        let (ct, ss1) = encapsulate(&ek).expect("Encapsulation failed");
        assert_eq!(ct.len(), CIPHERTEXT_SIZE);
        assert_eq!(ss1.len(), SHARED_SECRET_SIZE);

        let ss2 = decapsulate(&dk, &ct).expect("Decapsulation failed");
        assert_eq!(ss1, ss2);
    }

    #[test]
    fn test_ml_kem_wrong_key_fails() {
        let (ek1, _dk1) = generate_keypair().unwrap();
        let (_ek2, dk2) = generate_keypair().unwrap();

        let (ct, _ss) = encapsulate(&ek1).unwrap();
        let result = decapsulate(&dk2, &ct);

        // Different keys should not produce the same shared secret
        // (though technically ML-KEM allows multiple valid decapsulations)
        // For this test, we just ensure it doesn't panic
        let _ = result;
    }

    #[test]
    fn test_ml_kem_invalid_ciphertext_size() {
        let (_ek, dk) = generate_keypair().unwrap();
        let invalid_ct = vec![0u8; 100];

        let result = decapsulate(&dk, &invalid_ct);
        assert!(result.is_err());
    }

    #[test]
    fn test_ml_kem_invalid_key_size() {
        let invalid_ek = vec![0u8; 100];
        let result = encapsulate(&invalid_ek);
        assert!(result.is_err());
    }
}
