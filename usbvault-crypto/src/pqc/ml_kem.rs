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

/// ML-KEM-1024 public key size in bytes
pub const PUBLIC_KEY_SIZE: usize = 1568;

/// ML-KEM-1024 ciphertext size in bytes
pub const CIPHERTEXT_SIZE: usize = 1568;

/// ML-KEM-1024 shared secret size in bytes
pub const SHARED_SECRET_SIZE: usize = 32;

/// Generate an ML-KEM-1024 keypair
#[cfg(feature = "pqc")]
pub fn generate_keypair() -> Result<(Vec<u8>, Vec<u8>)> {
    use ml_kem::{EncodedSizeUser, KemCore, MlKem1024};
    use rand::rngs::OsRng;

    let mut rng = OsRng;
    let (dk, ek) = MlKem1024::generate(&mut rng);

    Ok((ek.as_bytes().as_slice().to_vec(), dk.as_bytes().as_slice().to_vec()))
}

/// Encapsulate: generate a shared secret and ciphertext from a public key
#[cfg(feature = "pqc")]
pub fn encapsulate(encapsulation_key: &[u8]) -> Result<(Vec<u8>, Vec<u8>)> {
    use ml_kem::kem::{Encapsulate, EncapsulationKey};
    use ml_kem::{EncodedSizeUser, MlKem1024Params};
    use rand::rngs::OsRng;

    if encapsulation_key.len() != PUBLIC_KEY_SIZE {
        return Err(CryptoError::InvalidKey);
    }

    // Convert &[u8] to &[u8; N] then to &Array via From
    let ek_array: &[u8; PUBLIC_KEY_SIZE] = encapsulation_key
        .try_into()
        .map_err(|_| CryptoError::InvalidKey)?;
    let ek = EncapsulationKey::<MlKem1024Params>::from_bytes(ek_array.into());

    let mut rng = OsRng;
    let (ct, ss) = ek.encapsulate(&mut rng).map_err(|_| CryptoError::SharingError)?;

    Ok((ct.as_slice().to_vec(), ss.as_slice().to_vec()))
}

/// Decapsulate: recover the shared secret from ciphertext using the secret key
#[cfg(feature = "pqc")]
pub fn decapsulate(decapsulation_key: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>> {
    use ml_kem::kem::{Decapsulate, DecapsulationKey};
    use ml_kem::{EncodedSizeUser, KemCore, MlKem1024, MlKem1024Params};

    if ciphertext.len() != CIPHERTEXT_SIZE {
        return Err(CryptoError::InvalidKey);
    }

    // Decapsulation key may be different size from encapsulation key
    let dk = DecapsulationKey::<MlKem1024Params>::from_bytes(
        decapsulation_key.try_into().map_err(|_| CryptoError::InvalidKey)?
    );

    // Construct ciphertext using the correct Kem type alias
    let ct_array: &[u8; CIPHERTEXT_SIZE] = ciphertext
        .try_into()
        .map_err(|_| CryptoError::InvalidKey)?;
    let ct = <MlKem1024 as KemCore>::CiphertextSize::default();
    let _ = ct; // just to verify the type exists
    // Use Array::from for the fixed-size array conversion
    let ct: ml_kem::Ciphertext<MlKem1024> =
        (*ct_array).into();

    let ss = dk.decapsulate(&ct).map_err(|_| CryptoError::SharingError)?;

    Ok(ss.as_slice().to_vec())
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
        assert!(!dk.is_empty());
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
