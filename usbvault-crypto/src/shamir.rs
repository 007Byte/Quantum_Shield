//! Shamir's Secret Sharing over GF(256) for Master Encryption Key backup
//!
//! Provides M-of-N threshold secret sharing for the MEK, enabling
//! account recovery when the password is lost. All share operations
//! happen client-side — the server never stores complete shares.
//!
//! Implementation uses GF(256) with the AES irreducible polynomial (0x11B).
//! Coefficients are generated uniformly via OsRng — each random byte is
//! already a valid GF(256) element (0–255), so no modular reduction is needed
//! and no bias is introduced.
//!
//! Replaces the `sharks` crate which had biased coefficient generation
//! (RUSTSEC-2024-0398).

use crate::error::{CryptoError, Result};
use rand::rngs::OsRng;
use rand::RngCore;

/// Default threshold for MEK recovery (minimum shares needed)
pub const DEFAULT_THRESHOLD: u8 = 3;

/// Default total shares to generate
pub const DEFAULT_TOTAL_SHARES: usize = 5;

// ── GF(256) arithmetic with AES polynomial x^8 + x^4 + x^3 + x + 1 ──

/// Multiply two elements in GF(256) using Russian Peasant multiplication.
#[inline]
fn gf256_mul(mut a: u8, mut b: u8) -> u8 {
    let mut result: u8 = 0;
    while b > 0 {
        if b & 1 != 0 {
            result ^= a;
        }
        let carry = a & 0x80;
        a <<= 1;
        if carry != 0 {
            a ^= 0x1B; // Reduce by x^8 + x^4 + x^3 + x + 1
        }
        b >>= 1;
    }
    result
}

/// Multiplicative inverse in GF(256) via extended Euclidean / exponentiation.
/// a^254 = a^(-1) in GF(256) since a^255 = 1 for all a != 0.
#[inline]
fn gf256_inv(a: u8) -> u8 {
    if a == 0 {
        return 0; // 0 has no inverse, but we guard against this in callers
    }
    // Compute a^254 by repeated squaring
    let mut result = a;
    for _ in 0..6 {
        result = gf256_mul(result, result);
        result = gf256_mul(result, a);
    }
    // One final square: a^(2*127) = a^254
    result = gf256_mul(result, result);
    result
}

/// Evaluate a polynomial at point `x` in GF(256) using Horner's method.
/// coefficients[0] is the constant term (the secret byte).
fn gf256_eval(coefficients: &[u8], x: u8) -> u8 {
    let mut result = 0u8;
    for coeff in coefficients.iter().rev() {
        result = gf256_mul(result, x) ^ coeff;
    }
    result
}

// ── Shamir's Secret Sharing ──────────────────────────────────────────

/// Split a secret into N shares with M-of-N threshold recovery.
///
/// For each byte of the secret, a random polynomial of degree (threshold-1)
/// is constructed with the secret byte as the constant term. Shares are
/// polynomial evaluations at points x=1, x=2, ..., x=N.
///
/// # Arguments
/// * `secret` - The secret bytes to split (typically 64-byte MEK)
/// * `threshold` - Minimum shares needed to reconstruct (M, must be >= 2)
/// * `total` - Total shares to generate (N, must be >= threshold, max 255)
///
/// # Returns
/// Vector of share byte arrays. Each share is: [share_index(1B) || share_data(len(secret)B)]
pub fn create_shares(secret: &[u8], threshold: u8, total: usize) -> Result<Vec<Vec<u8>>> {
    if secret.is_empty() {
        return Err(CryptoError::InvalidArgument);
    }
    if threshold < 2 {
        return Err(CryptoError::InvalidArgument);
    }
    if total < threshold as usize || total > 255 {
        return Err(CryptoError::InvalidArgument);
    }

    let coeff_count = (threshold - 1) as usize; // Number of random coefficients per byte

    // Pre-generate all random coefficients (unbiased: each byte is a valid GF(256) element)
    let total_random_bytes = secret.len() * coeff_count;
    let mut random_coeffs = vec![0u8; total_random_bytes];
    OsRng.fill_bytes(&mut random_coeffs);

    // Build shares
    let mut shares: Vec<Vec<u8>> = (0..total)
        .map(|_| Vec::with_capacity(1 + secret.len()))
        .collect();

    // Set share indices (x-coordinates: 1, 2, ..., N)
    for (i, share) in shares.iter_mut().enumerate() {
        share.push((i + 1) as u8);
    }

    // For each byte of the secret, create polynomial and evaluate at each x
    for (byte_idx, &secret_byte) in secret.iter().enumerate() {
        // Build polynomial: [secret_byte, rand_coeff_1, ..., rand_coeff_(threshold-1)]
        let mut poly = Vec::with_capacity(threshold as usize);
        poly.push(secret_byte);
        for c in 0..coeff_count {
            poly.push(random_coeffs[byte_idx * coeff_count + c]);
        }

        // Evaluate polynomial at x = 1, 2, ..., total
        for (i, share) in shares.iter_mut().enumerate() {
            let x = (i + 1) as u8;
            share.push(gf256_eval(&poly, x));
        }
    }

    // Zero out random coefficients
    zeroize::Zeroize::zeroize(&mut random_coeffs);

    Ok(shares)
}

/// Recover a secret from M or more shares using Lagrange interpolation.
///
/// # Arguments
/// * `shares` - Vector of share byte arrays (format: [index(1B) || data])
/// * `threshold` - The threshold M used when creating shares
///
/// # Returns
/// The reconstructed secret bytes
pub fn recover_secret(shares: &[Vec<u8>], threshold: u8) -> Result<Vec<u8>> {
    if shares.len() < threshold as usize {
        return Err(CryptoError::InvalidArgument);
    }

    // Use exactly `threshold` shares
    let shares = &shares[..threshold as usize];

    // Validate share format: each must have index + at least 1 data byte
    let data_len = shares[0].len() - 1;
    if data_len == 0 {
        return Err(CryptoError::SharingError);
    }
    for share in shares {
        if share.len() != data_len + 1 {
            return Err(CryptoError::SharingError);
        }
    }

    // Extract x-coordinates
    let xs: Vec<u8> = shares.iter().map(|s| s[0]).collect();

    // Check for duplicate x-coordinates (would cause division by zero)
    for i in 0..xs.len() {
        for j in (i + 1)..xs.len() {
            if xs[i] == xs[j] {
                return Err(CryptoError::SharingError);
            }
        }
    }

    // Lagrange interpolation at x=0 for each byte position
    let mut secret = vec![0u8; data_len];

    for byte_idx in 0..data_len {
        let mut value = 0u8;

        for i in 0..xs.len() {
            let yi = shares[i][1 + byte_idx]; // y-value for this share at this byte

            // Compute Lagrange basis polynomial L_i(0) = product of (0 - x_j) / (x_i - x_j) for j != i
            // Simplifies to: product of x_j / (x_j - x_i) for j != i  (since 0 - x_j = x_j in GF(256))
            let mut basis = 1u8;
            for j in 0..xs.len() {
                if i == j {
                    continue;
                }
                let num = xs[j]; // x_j
                let den = xs[j] ^ xs[i]; // x_j - x_i in GF(256) is XOR
                if den == 0 {
                    return Err(CryptoError::SharingError);
                }
                basis = gf256_mul(basis, gf256_mul(num, gf256_inv(den)));
            }

            value ^= gf256_mul(yi, basis); // Addition in GF(256) is XOR
        }

        secret[byte_idx] = value;
    }

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
    fn test_gf256_mul_identity() {
        for a in 0..=255u8 {
            assert_eq!(gf256_mul(a, 1), a);
            assert_eq!(gf256_mul(1, a), a);
            assert_eq!(gf256_mul(a, 0), 0);
            assert_eq!(gf256_mul(0, a), 0);
        }
    }

    #[test]
    fn test_gf256_inv() {
        // a * a^(-1) = 1 for all non-zero a
        for a in 1..=255u8 {
            let inv = gf256_inv(a);
            assert_eq!(gf256_mul(a, inv), 1, "Failed for a={}", a);
        }
    }

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

        assert_eq!(shares.len(), DEFAULT_TOTAL_SHARES);

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

    #[test]
    fn test_single_byte_secret() {
        let secret = vec![0xFF];
        let shares = create_shares(&secret, 2, 3).unwrap();
        let recovered = recover_secret(&shares[0..2].to_vec(), 2).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn test_all_zero_secret() {
        let secret = vec![0x00; 32];
        let shares = create_shares(&secret, 3, 5).unwrap();
        let recovered = recover_secret(&shares[1..4].to_vec(), 3).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn test_2_of_2_minimum_threshold() {
        let secret = vec![0xDE, 0xAD, 0xBE, 0xEF];
        let shares = create_shares(&secret, 2, 2).unwrap();
        assert_eq!(shares.len(), 2);
        let recovered = recover_secret(&shares, 2).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn test_shares_are_different() {
        let secret = vec![0x42; 32];
        let shares = create_shares(&secret, 3, 5).unwrap();
        // Each share should be unique
        for i in 0..shares.len() {
            for j in (i + 1)..shares.len() {
                assert_ne!(shares[i], shares[j]);
            }
        }
    }

    #[test]
    fn test_wrong_threshold_recovery_gives_wrong_secret() {
        // With threshold=3, using only 2 shares should give wrong data
        // (if we bypass the length check)
        let secret = vec![0x42; 16];
        let shares = create_shares(&secret, 3, 5).unwrap();

        // Using threshold=2 with only 2 shares — should reconstruct, but incorrectly
        let wrong = recover_secret(&shares[0..2].to_vec(), 2).unwrap();
        assert_ne!(wrong, secret, "2 shares should not recover a threshold-3 secret");
    }
}
