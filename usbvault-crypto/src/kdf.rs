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

/// Argon2id parameter bounds enforced on every unlock (crypto-pr6).
///
/// argon2's own `Params::new` only rejects `m_cost < 8` and accepts values up to
/// `u32::MAX` (4 TiB of memory), so a dedicated bounds layer is required to
/// reject DoS (huge allocation / huge iteration count) and weakening (absurdly
/// cheap) parameters read from an untrusted on-disk header. The Rust and web
/// (TypeScript) unlock paths use IDENTICAL bounds so they agree on which vaults
/// are valid.
pub mod argon2_bounds {
    /// m_cost (KiB). Min 8 MiB (8192) — well below the 64 MiB default but still
    /// expensive enough to be meaningful; Max 1 GiB (1048576) to bound peak
    /// allocation and prevent OOM/DoS on unlock.
    pub const MIN_MEMORY_KIB: u32 = 8 * 1024; // 8 MiB
    pub const MAX_MEMORY_KIB: u32 = 1024 * 1024; // 1 GiB
    /// t_cost (iterations).
    pub const MIN_TIME: u32 = 1;
    pub const MAX_TIME: u32 = 16;
    /// p_cost (lanes / parallelism).
    pub const MIN_PARALLELISM: u8 = 1;
    pub const MAX_PARALLELISM: u8 = 16;
    /// Canonical defaults for newly-created vaults (unchanged from the original
    /// hardcoded values, so the param-driven path is byte-identical for them).
    pub const DEFAULT_MEMORY_KIB: u32 = 65536; // 64 MiB
    pub const DEFAULT_TIME: u32 = 3;
    pub const DEFAULT_PARALLELISM: u8 = 4;
}

/// Validate Argon2id parameters read from an untrusted header (crypto-pr6).
///
/// Rejects params outside the sane DoS/weakness bounds in [`argon2_bounds`].
/// Existing V4/V5/V6 vaults were all written with `65536/3/4`, which is inside
/// the bounds, so this never rejects a real on-disk vault.
pub fn validate_argon2_params(memory_kib: u32, time: u32, parallelism: u8) -> Result<()> {
    use argon2_bounds::*;
    if !(MIN_MEMORY_KIB..=MAX_MEMORY_KIB).contains(&memory_kib)
        || !(MIN_TIME..=MAX_TIME).contains(&time)
        || !(MIN_PARALLELISM..=MAX_PARALLELISM).contains(&parallelism)
    {
        return Err(CryptoError::InvalidArgument);
    }
    Ok(())
}

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

/// V6 KDF-transcript domain tag. Binds the KEK to the full key-derivation context.
pub const KDF_TRANSCRIPT_DOMAIN_V6: &[u8] = b"USBVault-KDF-transcript-v6:";

/// Build a canonical, length-prefixed transcript of the key-derivation context.
///
/// Order/format is FROZEN — the Rust and web (TypeScript) implementations MUST
/// agree byte-for-byte (see the cross-impl KAT in
/// `tests/kdf_ad_interop_kat.rs` / `kdfAdInterop.kat.test.ts`).
///
/// layout: `u8(version) || u8(kdf_hash_id) || u8(cipher_id)`
///       `|| u32le(salt.len) || salt`
///       `|| u32le(argon2_memory) || u32le(argon2_time) || u8(argon2_parallelism)`
pub fn build_kdf_transcript(
    version: u8,
    kdf_hash_id: u8,
    cipher_id: u8,
    salt: &[u8],
    argon2_memory: u32,
    argon2_time: u32,
    argon2_parallelism: u8,
) -> Vec<u8> {
    let mut t = Vec::with_capacity(3 + 4 + salt.len() + 9);
    t.push(version);
    t.push(kdf_hash_id);
    t.push(cipher_id);
    t.extend_from_slice(&(salt.len() as u32).to_le_bytes());
    t.extend_from_slice(salt);
    t.extend_from_slice(&argon2_memory.to_le_bytes());
    t.extend_from_slice(&argon2_time.to_le_bytes());
    t.push(argon2_parallelism);
    t
}

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

/// Derive a KEK from password using Argon2id with EXPLICIT, VALIDATED params
/// (crypto-pr6).
///
/// This is the param-driven core: the m/t/p are read from the (untrusted) vault
/// header on unlock, validated against [`argon2_bounds`], then used to run
/// Argon2id. `parallelism` is a `u8` in the header (matching the on-disk byte)
/// and is widened to `u32` for argon2.
///
/// BRICK-RISK GATE: for the canonical defaults `(65536, 3, 4)` the output is
/// BYTE-IDENTICAL to the original hardcoded [`derive_kek`] — same
/// `Algorithm::Argon2id`, same `Version::default()`, same m/t/p, same 32-byte
/// output length, same `SaltString::encode_b64` path — so every existing vault
/// still unlocks. This equivalence is pinned by
/// `test_derive_kek_default_equals_params`.
pub fn derive_kek_with_params(
    password: &[u8],
    salt: &[u8],
    memory_kib: u32,
    time: u32,
    parallelism: u8,
) -> Result<KeyEncryptionKey> {
    if salt.len() != 32 {
        return Err(CryptoError::InvalidArgument);
    }
    // Validate BEFORE constructing Params so an out-of-bounds m_cost can never
    // drive a giant allocation (the rejection happens with no work done).
    validate_argon2_params(memory_kib, time, parallelism)?;

    let params = argon2::Params::new(memory_kib, time, parallelism as u32, Some(32))
        .map_err(|_| CryptoError::KeyDerivationFailed)?;
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

/// Derive a KEK from password using Argon2id with the canonical default params
/// (64 MiB / 3 / 4). Back-compat 2-arg signature: forwards to
/// [`derive_kek_with_params`] with the defaults, so all existing call-sites
/// (`srp_client.rs`, V<=5 legacy unlock) compile and behave identically.
pub fn derive_kek(password: &[u8], salt: &[u8]) -> Result<KeyEncryptionKey> {
    use argon2_bounds::*;
    derive_kek_with_params(
        password,
        salt,
        DEFAULT_MEMORY_KIB,
        DEFAULT_TIME,
        DEFAULT_PARALLELISM,
    )
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

/// V6: derive a KEK bound to the full KDF transcript.
///
/// Runs the SAME Argon2id as [`derive_kek`] (identical params), then
/// HKDF-SHA256-expands the Argon2 output (the IKM) with
/// `info = KDF_TRANSCRIPT_DOMAIN_V6 || transcript`. This commits the KEK to the
/// full key-derivation context (version, kdf/cipher ids, salt, Argon2 params)
/// so a wrapped-MEK blob cannot be transplanted into a header with a different
/// transcript. The legacy [`derive_kek`] is untouched (V<=5 path).
pub fn derive_kek_v6(password: &[u8], salt: &[u8], transcript: &[u8]) -> Result<KeyEncryptionKey> {
    use argon2_bounds::*;
    derive_kek_v6_with_params(
        password,
        salt,
        transcript,
        DEFAULT_MEMORY_KIB,
        DEFAULT_TIME,
        DEFAULT_PARALLELISM,
    )
}

/// V6 (crypto-pr6): derive a transcript-bound KEK using EXPLICIT, VALIDATED
/// Argon2 params for the underlying Argon2id work.
///
/// Identical to [`derive_kek_v6`] except the Argon2 m/t/p come from the caller
/// (the unlock path reads them from the header) instead of being hardcoded.
/// The transcript already encodes the same params, so the HKDF binding is
/// unchanged. For the canonical defaults `(65536, 3, 4)` the IKM equals the old
/// hardcoded `derive_kek`, so this is byte-identical to the pre-pr6
/// `derive_kek_v6` (pinned by the V6 KAT `kat_derive_kek_v6`).
pub fn derive_kek_v6_with_params(
    password: &[u8],
    salt: &[u8],
    transcript: &[u8],
    memory_kib: u32,
    time: u32,
    parallelism: u8,
) -> Result<KeyEncryptionKey> {
    if salt.len() != 32 {
        return Err(CryptoError::InvalidArgument);
    }
    // Reuse the param-driven Argon2id (32-byte output, validated) as IKM.
    let base = derive_kek_with_params(password, salt, memory_kib, time, parallelism)?;
    let mut info = Vec::with_capacity(KDF_TRANSCRIPT_DOMAIN_V6.len() + transcript.len());
    info.extend_from_slice(KDF_TRANSCRIPT_DOMAIN_V6);
    info.extend_from_slice(transcript);
    let hk = Hkdf::<Sha256>::new(None, base.as_bytes());
    let mut out = [0u8; 32];
    hk.expand(&info, &mut out)
        .map_err(|_| CryptoError::KeyDerivationFailed)?;
    Ok(KeyEncryptionKey(Zeroizing::new(out)))
}

/// V6: wrap (encrypt) a MEK with the KEK using XChaCha20-Poly1305, binding the
/// supplied associated data (`ad`) into the AEAD tag.
///
/// Identical to [`wrap_mek`] except the AD is authenticated, so a wrapped-MEK
/// blob produced under one header's AD cannot be opened against a different
/// header. The blob layout is unchanged: nonce(24) || ciphertext(64+16).
pub fn wrap_mek_ad(
    kek: &KeyEncryptionKey,
    mek: &MasterEncryptionKey,
    ad: &[u8],
) -> Result<Vec<u8>> {
    use chacha20poly1305::{
        aead::{Aead, KeyInit, Payload},
        XChaCha20Poly1305,
    };
    use generic_array::GenericArray;

    let mut nonce = [0u8; 24];
    OsRng.fill_bytes(&mut nonce);

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(kek.as_bytes()));
    let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

    let ciphertext = cipher
        .encrypt(
            nonce_array,
            Payload {
                msg: mek.as_bytes().as_ref(),
                aad: ad,
            },
        )
        .map_err(|_| CryptoError::KeyWrappingFailed)?;

    let mut result = Vec::with_capacity(WRAPPED_MEK_SIZE);
    result.extend_from_slice(&nonce);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

/// V6: unwrap (decrypt) a MEK from the wrapped blob, verifying the bound
/// associated data (`ad`). Fails if `ad` does not match the AD used at wrap
/// time. Counterpart to [`wrap_mek_ad`].
pub fn unwrap_mek_ad(
    kek: &KeyEncryptionKey,
    wrapped: &[u8],
    ad: &[u8],
) -> Result<MasterEncryptionKey> {
    use chacha20poly1305::{
        aead::{Aead, KeyInit, Payload},
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
        .decrypt(
            nonce,
            Payload {
                msg: ciphertext,
                aad: ad,
            },
        )
        .map_err(|_| CryptoError::KeyWrappingFailed)?;

    if plaintext.len() != 64 {
        zeroize::Zeroize::zeroize(&mut plaintext);
        return Err(CryptoError::KeyWrappingFailed);
    }

    let mut key = [0u8; 64];
    key.copy_from_slice(&plaintext);
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

    // ── crypto-pr6: BRICK-RISK GATE — back-compat equivalence proof ──

    /// THE central regression test. `derive_kek_with_params(.., 65536, 3, 4)`
    /// MUST be byte-identical to the legacy hardcoded `derive_kek` for the
    /// default params, or EVERY existing vault becomes permanently unopenable.
    #[test]
    fn test_derive_kek_default_equals_params() {
        // Multiple password/salt pairs to make the equality non-trivial.
        let cases: [(&[u8], [u8; 32]); 3] = [
            (b"test_password", [0x42u8; 32]),
            (b"", [0u8; 32]),
            (b"another-pw-\x00\xff\x7f", [0xABu8; 32]),
        ];
        for (pw, salt) in cases {
            let legacy = derive_kek(pw, &salt).expect("derive_kek");
            let params = derive_kek_with_params(pw, &salt, 65536, 3, 4).expect("with_params");
            assert_eq!(
                legacy.as_bytes(),
                params.as_bytes(),
                "BRICK RISK: derive_kek != derive_kek_with_params(65536,3,4)"
            );
        }
    }

    /// Sanity: changing the params yields a DIFFERENT KEK (proves params are
    /// actually fed to Argon2, not ignored).
    #[test]
    fn test_derive_kek_with_params_changes_with_params() {
        let pw = b"test_password";
        let salt = [0x42u8; 32];
        let default = derive_kek_with_params(pw, &salt, 65536, 3, 4).unwrap();
        let bigger = derive_kek_with_params(pw, &salt, 131072, 4, 8).unwrap();
        assert_ne!(default.as_bytes(), bigger.as_bytes());
    }

    #[test]
    fn test_validate_argon2_params_bounds() {
        // Accept the canonical default and an in-bounds non-default.
        assert!(validate_argon2_params(65536, 3, 4).is_ok());
        assert!(validate_argon2_params(131072, 4, 8).is_ok());
        // Accept exact bounds.
        assert!(validate_argon2_params(8 * 1024, 1, 1).is_ok());
        assert!(validate_argon2_params(1024 * 1024, 16, 16).is_ok());
        // Reject memory below MIN / above MAX.
        assert!(validate_argon2_params(4096, 3, 4).is_err());
        assert!(validate_argon2_params(2_097_152, 3, 4).is_err());
        // Reject time 0 / time 17.
        assert!(validate_argon2_params(65536, 0, 4).is_err());
        assert!(validate_argon2_params(65536, 17, 4).is_err());
        // Reject parallelism 0 / 17.
        assert!(validate_argon2_params(65536, 3, 0).is_err());
        assert!(validate_argon2_params(65536, 3, 17).is_err());
    }

    /// Out-of-bounds params are rejected WITHOUT attempting the (4 TiB)
    /// allocation — validation happens before `Params::new`.
    #[test]
    fn test_derive_kek_with_params_rejects_oob() {
        let pw = b"pw";
        let salt = [0x42u8; 32];
        assert!(matches!(
            derive_kek_with_params(pw, &salt, u32::MAX, 3, 4),
            Err(CryptoError::InvalidArgument)
        ));
        assert!(matches!(
            derive_kek_with_params(pw, &salt, 65536, 0, 4),
            Err(CryptoError::InvalidArgument)
        ));
        assert!(matches!(
            derive_kek_with_params(pw, &salt, 65536, 3, 0),
            Err(CryptoError::InvalidArgument)
        ));
    }

    /// V6 transcript-bound KEK: defaults path equals the param path for
    /// (65536,3,4), so the existing V6 KAT stays byte-identical.
    #[test]
    fn test_derive_kek_v6_default_equals_params() {
        let pw = b"test_password";
        let salt = [0x42u8; 32];
        let t = build_kdf_transcript(6, 2, 2, &salt, 65536, 3, 4);
        let a = derive_kek_v6(pw, &salt, &t).unwrap();
        let b = derive_kek_v6_with_params(pw, &salt, &t, 65536, 3, 4).unwrap();
        assert_eq!(a.as_bytes(), b.as_bytes());
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

    // ── V6: transcript-bound KEK + AD-bound MEK wrap (crypto-pr5) ──

    #[test]
    fn test_derive_kek_v6_differs_from_derive_kek() {
        let password = b"test_password";
        let salt = [0x42u8; 32];
        let transcript = build_kdf_transcript(6, 2, 2, &salt, 65536, 3, 4);

        let legacy = derive_kek(password, &salt).unwrap();
        let v6 = derive_kek_v6(password, &salt, &transcript).unwrap();
        // Transcript binding is observable: the V6 KEK is not the raw Argon2 KEK.
        assert_ne!(legacy.as_bytes(), v6.as_bytes());
    }

    #[test]
    fn test_derive_kek_v6_changes_with_transcript_fields() {
        let password = b"test_password";
        let salt = [0x42u8; 32];
        let base = derive_kek_v6(
            password,
            &salt,
            &build_kdf_transcript(6, 2, 2, &salt, 65536, 3, 4),
        )
        .unwrap();

        // Changing the cipher_id changes the KEK.
        let diff_cipher = derive_kek_v6(
            password,
            &salt,
            &build_kdf_transcript(6, 2, 1, &salt, 65536, 3, 4),
        )
        .unwrap();
        assert_ne!(base.as_bytes(), diff_cipher.as_bytes());

        // Changing an Argon2 param changes the KEK.
        let diff_mem = derive_kek_v6(
            password,
            &salt,
            &build_kdf_transcript(6, 2, 2, &salt, 131072, 3, 4),
        )
        .unwrap();
        assert_ne!(base.as_bytes(), diff_mem.as_bytes());

        // Same inputs are deterministic.
        let same = derive_kek_v6(
            password,
            &salt,
            &build_kdf_transcript(6, 2, 2, &salt, 65536, 3, 4),
        )
        .unwrap();
        assert_eq!(base.as_bytes(), same.as_bytes());
    }

    #[test]
    fn test_wrap_mek_ad_roundtrip() {
        let kek = derive_kek(b"pw", &[0x42u8; 32]).unwrap();
        let mek = MasterEncryptionKey::generate();
        let ad = b"USBVault-wrapMEK-v6:context";

        let wrapped = wrap_mek_ad(&kek, &mek, ad).unwrap();
        assert_eq!(wrapped.len(), WRAPPED_MEK_SIZE);
        let unwrapped = unwrap_mek_ad(&kek, &wrapped, ad).unwrap();
        assert_eq!(mek.as_bytes(), unwrapped.as_bytes());
    }

    #[test]
    fn test_unwrap_mek_ad_mismatched_ad_fails() {
        let kek = derive_kek(b"pw", &[0x42u8; 32]).unwrap();
        let mek = MasterEncryptionKey::generate();
        let wrapped = wrap_mek_ad(&kek, &mek, b"ad-A").unwrap();
        assert!(unwrap_mek_ad(&kek, &wrapped, b"ad-B").is_err());
    }

    #[test]
    fn test_ad_wrap_not_openable_by_plain_unwrap_and_vice_versa() {
        let kek = derive_kek(b"pw", &[0x42u8; 32]).unwrap();
        let mek = MasterEncryptionKey::generate();

        // A blob wrapped WITH ad is not openable by the plain (no-AD) unwrap.
        let wrapped_ad = wrap_mek_ad(&kek, &mek, b"some-ad").unwrap();
        assert!(unwrap_mek(&kek, &wrapped_ad).is_err());

        // A blob wrapped WITHOUT ad is not openable by the AD unwrap (with ad).
        let wrapped_plain = wrap_mek(&kek, &mek).unwrap();
        assert!(unwrap_mek_ad(&kek, &wrapped_plain, b"some-ad").is_err());

        // ...but plain<->plain and ad(empty)<->plain semantics are consistent.
        assert!(unwrap_mek(&kek, &wrapped_plain).is_ok());
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
