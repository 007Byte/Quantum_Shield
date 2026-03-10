//! End-to-end encrypted sharing using X25519 sealed box
//!
//! # Post-Quantum Cryptography
//! For hybrid post-quantum key encapsulation combining X25519 with ML-KEM-1024,
//! see the `pqc` module (enabled with the `pqc` feature flag).
//! This provides quantum-resistant key agreement for future-proofing.

use crate::error::{CryptoError, Result};
use crate::kdf::derive_subkey;
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305,
};
use generic_array::GenericArray;
use rand::rngs::OsRng;
use rand::RngCore;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

/// Public key for sharing (X25519 public key)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SharePublicKey([u8; 32]);

impl SharePublicKey {
    /// Create from bytes
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        SharePublicKey(bytes)
    }

    /// Get as bytes
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

/// Secret key for sharing (X25519 secret key, securely zeroed)
#[derive(Clone)]
pub struct ShareSecretKey(Zeroizing<[u8; 32]>);

impl ShareSecretKey {
    /// Create from bytes
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        ShareSecretKey(Zeroizing::new(bytes))
    }

    /// Get as bytes
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl Drop for ShareSecretKey {
    fn drop(&mut self) {
        // Zeroizing wrapper handles cleanup
    }
}

/// Generate X25519 keypair for sharing
pub fn generate_keypair() -> (SharePublicKey, ShareSecretKey) {
    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);

    let mut secret_bytes = [0u8; 32];
    secret_bytes.copy_from_slice(&secret.to_bytes());

    let mut public_bytes = [0u8; 32];
    public_bytes.copy_from_slice(public.as_bytes());

    (
        SharePublicKey(public_bytes),
        ShareSecretKey(Zeroizing::new(secret_bytes)),
    )
}

/// Seal plaintext for a recipient using their public key
///
/// # Returns
/// ephemeral_public (32) || nonce (24) || ciphertext || tag (16)
pub fn seal(recipient_public: &SharePublicKey, plaintext: &[u8]) -> Result<Vec<u8>> {
    // Generate ephemeral keypair
    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    let ephemeral_secret = StaticSecret::random_from_rng(OsRng);
    let ephemeral_public = PublicKey::from(&ephemeral_secret);

    // Perform ECDH
    let recipient_pk = PublicKey::from(*recipient_public.as_bytes());
    let shared_secret = ephemeral_secret.diffie_hellman(&recipient_pk);

    // Derive encryption key via HKDF-SHA256
    let key = derive_subkey(shared_secret.as_bytes(), "seal")?;

    // Encrypt plaintext
    let mut nonce = [0u8; 24];
    // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
    OsRng.fill_bytes(&mut nonce);

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&key));
    let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

    let ciphertext = cipher
        .encrypt(nonce_array, plaintext)
        .map_err(|_| CryptoError::SharingError)?;

    // Return: ephemeral_public || nonce || ciphertext || tag
    let mut result = Vec::with_capacity(32 + 24 + ciphertext.len());
    result.extend_from_slice(ephemeral_public.as_bytes());
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Open a sealed message using the recipient's secret key
pub fn open(recipient_secret: &ShareSecretKey, sealed: &[u8]) -> Result<Vec<u8>> {
    const EPHEMERAL_SIZE: usize = 32;
    const NONCE_SIZE: usize = 24;

    if sealed.len() < EPHEMERAL_SIZE + NONCE_SIZE + 16 {
        return Err(CryptoError::SharingError);
    }

    // Extract components
    // DV-002 FIX: Replace unwrap() with proper error handling
    let ephemeral_public_bytes: [u8; 32] = sealed[0..32]
        .try_into()
        .map_err(|_| CryptoError::SharingError)?;
    let nonce: [u8; 24] = sealed[32..56]
        .try_into()
        .map_err(|_| CryptoError::SharingError)?;
    let ciphertext = &sealed[56..];

    // Perform ECDH
    let ephemeral_pk = PublicKey::from(ephemeral_public_bytes);
    let secret = StaticSecret::from(*recipient_secret.as_bytes());
    let shared_secret = secret.diffie_hellman(&ephemeral_pk);

    // Derive decryption key
    let key = derive_subkey(shared_secret.as_bytes(), "seal")?;

    // Decrypt
    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&key));
    let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

    cipher
        .decrypt(nonce_array, ciphertext)
        .map_err(|_| CryptoError::SharingError)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keypair_generation() {
        let (public, secret) = generate_keypair();
        assert_eq!(public.as_bytes().len(), 32);
        assert_eq!(secret.as_bytes().len(), 32);
    }

    #[test]
    fn test_seal_open_roundtrip() {
        let plaintext = b"Secret message for sharing";

        let (public, secret) = generate_keypair();
        let sealed = seal(&public, plaintext).expect("Seal failed");
        let opened = open(&secret, &sealed).expect("Open failed");

        assert_eq!(plaintext, opened.as_slice());
    }

    #[test]
    fn test_cannot_open_with_wrong_key() {
        let plaintext = b"Only for Alice";

        let (alice_public, _alice_secret) = generate_keypair();
        let (_bob_public, bob_secret) = generate_keypair();

        let sealed = seal(&alice_public, plaintext).expect("Seal failed");
        let result = open(&bob_secret, &sealed);

        assert!(result.is_err()); // Bob can't decrypt Alice's message
    }
}
