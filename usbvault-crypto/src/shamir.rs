//! Shamir's Secret Sharing for Master Encryption Key backup
//!
//! Provides M-of-N threshold secret sharing for the MEK, enabling
//! account recovery when the password is lost. All share operations
//! happen client-side — the server never stores complete shares.
//!
//! Typical usage: 3-of-5 threshold (need any 3 of 5 shares to recover)

use crate::error::{CryptoError, Result};
use sharks::{Share, Sharks};

/// Default threshold for MEK recovery (minimum shares needed)
pub const DEFAULT_THRESHOLD: u8 = 3;

/// Default total shares to generate
pub const DEFAULT_TOTAL_SHARES: usize = 5;

/// Split a secret into N shares with M-of-N threshold recovery
///
/// # Arguments
/// * `secret` - The secret bytes to split (typically 64-byte MEK)
/// * `threshold` - Minimum shares needed to reconstruct (M)
/// * `total` - Total shares to generate (N)
///
/// # Returns
/// Vector of share byte arrays. Each share must be stored separately.
pub fn create_shares(secret: &[u8], threshold: u8, total: usize) -> Result<Vec<Vec<u8>>> {
    if secret.is_empty() {
        return Err(CryptoError::InvalidArgument);
    }
    if threshold < 2 {
        return Err(CryptoError::InvalidArgument);
    }
    if (total as u8) < threshold {
        return Err(CryptoError::InvalidArgument);
    }

    let sharks = Sharks(threshold);
    let dealer = sharks.dealer(secret);

    let shares: Vec<Vec<u8>> = dealer.take(total).map(|share| Vec::from(&share)).collect();

    Ok(shares)
}

/// Recover a secret from M or more shares
///
/// # Arguments
/// * `shares` - Vector of share byte arrays (at least threshold shares needed)
/// * `threshold` - The threshold M used when creating shares
///
/// # Returns
/// The reconstructed secret bytes
pub fn recover_secret(shares: &[Vec<u8>], threshold: u8) -> Result<Vec<u8>> {
    if shares.len() < threshold as usize {
        return Err(CryptoError::InvalidArgument);
    }

    let sharks = Sharks(threshold);

    let parsed_shares: Vec<Share> = shares
        .iter()
        .map(|s| Share::try_from(s.as_slice()))
        .collect::<std::result::Result<Vec<_>, _>>()
        .map_err(|_| CryptoError::SharingError)?;

    let secret = sharks
        .recover(&parsed_shares)
        .map_err(|_| CryptoError::SharingError)?;

    Ok(secret)
}

/// Create default 3-of-5 shares for a 64-byte MEK
pub fn create_mek_shares(mek_bytes: &[u8; 64]) -> Result<Vec<Vec<u8>>> {
    create_shares(mek_bytes, DEFAULT_THRESHOLD, DEFAULT_TOTAL_SHARES)
}

/// Recover MEK from shares using default threshold
pub fn recover_mek(shares: &[Vec<u8>]) -> Result<[u8; 64]> {
    let secret = recover_secret(shares, DEFAULT_THRESHOLD)?;
    if secret.len() != 64 {
        return Err(CryptoError::KeyWrappingFailed);
    }
    let mut mek = [0u8; 64];
    mek.copy_from_slice(&secret);
    Ok(mek)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_recover_shares() {
        let secret = b"this is a test secret for shamir sharing!!!!!!!!"; // 48 bytes
        let shares = create_shares(secret, 3, 5).expect("Failed to create shares");

        assert_eq!(shares.len(), 5);

        // Recover with exactly threshold shares (any 3 of 5)
        let recovered = recover_secret(&shares[0..3].to_vec(), 3).expect("Failed to recover");
        assert_eq!(recovered, secret);
    }

    #[test]
    fn test_recover_with_different_share_subsets() {
        let secret = vec![0xAA; 64]; // 64-byte MEK
        let shares = create_shares(&secret, 3, 5).expect("Failed to create shares");

        // Try different subsets of 3 shares
        let recovered1 = recover_secret(
            &vec![shares[0].clone(), shares[1].clone(), shares[2].clone()],
            3,
        )
        .unwrap();
        let recovered2 = recover_secret(
            &vec![shares[2].clone(), shares[3].clone(), shares[4].clone()],
            3,
        )
        .unwrap();
        let recovered3 = recover_secret(
            &vec![shares[0].clone(), shares[2].clone(), shares[4].clone()],
            3,
        )
        .unwrap();

        assert_eq!(recovered1, secret);
        assert_eq!(recovered2, secret);
        assert_eq!(recovered3, secret);
    }

    #[test]
    fn test_insufficient_shares_fails() {
        let secret = vec![0xBB; 32];
        let shares = create_shares(&secret, 3, 5).expect("Failed to create shares");

        // Only 2 shares (below threshold of 3)
        let result = recover_secret(&shares[0..2].to_vec(), 3);
        assert!(result.is_err());
    }

    #[test]
    fn test_mek_shares_roundtrip() {
        let mek = [0x42u8; 64];
        let shares = create_mek_shares(&mek).expect("Failed to create MEK shares");

        assert_eq!(shares.len(), DEFAULT_TOTAL_SHARES as usize);

        let recovered = recover_mek(&shares[1..4].to_vec()).expect("Failed to recover MEK");
        assert_eq!(recovered, mek);
    }

    #[test]
    fn test_empty_secret_fails() {
        let result = create_shares(&[], 3, 5);
        assert!(result.is_err());
    }

    #[test]
    fn test_threshold_too_low_fails() {
        let result = create_shares(b"test", 1, 5);
        assert!(result.is_err());
    }

    #[test]
    fn test_total_less_than_threshold_fails() {
        let result = create_shares(b"test", 5, 3);
        assert!(result.is_err());
    }
}
