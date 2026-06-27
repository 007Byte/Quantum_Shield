//! Vault V2/V3/V4/V5 header format (byte-level compatible with Python implementation)

use crate::cipher::CipherId;
use crate::error::{CryptoError, Result};
use crate::kdf::{derive_kek, generate_salt, unwrap_mek, wrap_mek, MasterEncryptionKey, MasterKey};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

/// V2 magic bytes
pub const MAGIC_V2: &[u8; 8] = b"USBVLT02";

/// V3 magic bytes
pub const MAGIC_V3: &[u8; 8] = b"USBVLT03";

/// V4 magic bytes
pub const MAGIC_V4: &[u8; 8] = b"USBVLT04";

/// V5 magic bytes.
///
/// V5 is byte-layout-identical to V4 (same fields, same offsets, same size);
/// the ONLY difference is that the `header_hmac` covers the full
/// security-relevant header with a wide, domain-separated MAC (see
/// [`VaultHeader::compute_hmac`]). New vaults are written as V5; legacy
/// V2/V3/V4 vaults continue to validate with their original MAC and are
/// transparently upgraded to V5 on the next write/commit.
pub const MAGIC_V5: &[u8; 8] = b"USBVLT05";

/// V2 header size (4096 bytes)
pub const HEADER_SIZE_V2: usize = 4096;

/// V3 header size (16384 bytes)
pub const HEADER_SIZE_V3: usize = 16384;

/// V4 header size (24576 bytes = 24KB for wrapped MEK + encrypted index)
pub const HEADER_SIZE_V4: usize = 24576;

/// V5 header size — identical layout to V4 (24576 bytes).
pub const HEADER_SIZE_V5: usize = 24576;

/// Vault header structure
#[derive(Debug, Clone)]
pub struct VaultHeader {
    pub version: u8,
    pub kdf_hash_id: u8,
    pub cipher_id: u8,
    pub salt: [u8; 32],
    pub verify_iv: [u8; 24],
    pub verify_ciphertext: Vec<u8>,
    pub header_hmac: [u8; 32],
    pub active_index_slot: u8,
    pub index1_offset: u32,
    pub index1_length: u32,
    pub index2_offset: u32,
    pub index2_length: u32,
    pub commit_counter: u64,
    pub argon2_memory: u32,
    pub argon2_time: u32,
    pub argon2_parallelism: u8,
    pub identity_block: Option<Vec<u8>>,
    pub tfa_block: Option<Vec<u8>>,
    pub fail_counter_block: Option<Vec<u8>>,
    /// V4: Wrapped Master Encryption Key (KEK-encrypted MEK)
    pub wrapped_mek: Option<Vec<u8>>,
    /// V4: State version for rollback protection (monotonic counter)
    pub state_version: u64,
    /// V4: Whether the index stored in header is encrypted
    pub index_encrypted: bool,
}

impl VaultHeader {
    /// Upper bound on the verify-marker ciphertext length. The verify marker is
    /// a fixed ~23-byte plaintext sealed with XChaCha20-Poly1305 (16-byte tag),
    /// so the ciphertext is small. Reject anything larger up front rather than
    /// trusting the on-disk u16 length (which can be up to 65535).
    const MAX_VERIFY_CT_LEN: usize = 256;

    /// Parse header from bytes.
    ///
    /// Every read is bounds-checked against `data.len()` BEFORE indexing, so a
    /// crafted or truncated VAULT.bin yields a clean `Err(InvalidHeader)`
    /// instead of an out-of-bounds panic (crypto review C-2).
    pub fn read(data: &[u8]) -> Result<Self> {
        if data.len() < 128 {
            return Err(CryptoError::InvalidHeader);
        }

        let mut offset = 0usize;

        // Checked fixed-width readers. Each verifies `offset + N <= data.len()`
        // and returns `InvalidHeader` on overrun (never panics).
        macro_rules! take {
            ($n:expr) => {{
                let n = $n;
                let end = offset.checked_add(n).ok_or(CryptoError::InvalidHeader)?;
                let slice = data.get(offset..end).ok_or(CryptoError::InvalidHeader)?;
                offset = end;
                slice
            }};
        }
        macro_rules! read_u8 {
            () => {{
                take!(1)[0]
            }};
        }
        macro_rules! read_u16_le {
            () => {{
                let b = take!(2);
                u16::from_le_bytes([b[0], b[1]])
            }};
        }
        macro_rules! read_u32_le {
            () => {{
                let b = take!(4);
                u32::from_le_bytes([b[0], b[1], b[2], b[3]])
            }};
        }
        macro_rules! read_u64_le {
            () => {{
                let b = take!(8);
                u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]])
            }};
        }

        // Magic (8 bytes)
        let magic = take!(8);
        let version = if magic == MAGIC_V2 {
            2
        } else if magic == MAGIC_V3 {
            3
        } else if magic == MAGIC_V4 {
            4
        } else if magic == MAGIC_V5 {
            5
        } else {
            return Err(CryptoError::InvalidMagic);
        };

        // KDF hash ID (1 byte)
        let kdf_hash_id = read_u8!();

        // Cipher ID (1 byte)
        let cipher_id = read_u8!();
        let _ = CipherId::from_byte(cipher_id)?; // Validate

        // Salt (32 bytes)
        let mut salt = [0u8; 32];
        salt.copy_from_slice(take!(32));

        // Verify IV (24 bytes)
        let mut verify_iv = [0u8; 24];
        verify_iv.copy_from_slice(take!(24));

        // Verify ciphertext length (2 bytes) — bound it before slicing so a
        // crafted length (up to 65535) cannot drive an out-of-range read.
        let verify_ct_len = read_u16_le!() as usize;
        if verify_ct_len > Self::MAX_VERIFY_CT_LEN {
            return Err(CryptoError::InvalidHeader);
        }

        // Verify ciphertext (variable, bounds-checked)
        let verify_ciphertext = take!(verify_ct_len).to_vec();

        // Header HMAC (32 bytes)
        let mut header_hmac = [0u8; 32];
        header_hmac.copy_from_slice(take!(32));

        // Active index slot (1 byte)
        let active_index_slot = read_u8!();

        // Index 1 offset (4 bytes)
        let index1_offset = read_u32_le!();
        // Index 1 length (4 bytes)
        let index1_length = read_u32_le!();
        // Index 2 offset (4 bytes)
        let index2_offset = read_u32_le!();
        // Index 2 length (4 bytes)
        let index2_length = read_u32_le!();

        // Commit counter (8 bytes)
        let commit_counter = read_u64_le!();

        // Argon2 parameters
        let argon2_memory = read_u32_le!();
        let argon2_time = read_u32_le!();
        let argon2_parallelism = read_u8!();

        // Optional blocks (V3 and V4). These are best-effort: a missing/short
        // optional block is tolerated (returns None), but any length that runs
        // past the buffer also degrades to None rather than panicking.
        let (identity_block, tfa_block, fail_counter_block) =
            if version >= 3 && offset + 12 <= data.len() {
                // Identity block length (4 bytes)
                let identity_len = read_u32_le!() as usize;

                let identity_block = match identity_len {
                    0 => None,
                    _ => match data.get(offset..offset + identity_len) {
                        Some(block) => {
                            let v = Some(block.to_vec());
                            offset += identity_len;
                            v
                        }
                        None => None,
                    },
                };

                // TFA block length (4 bytes) — only present if there is room.
                let tfa_block = if offset + 4 <= data.len() {
                    let tfa_len = read_u32_le!() as usize;
                    match tfa_len {
                        0 => None,
                        _ => match data.get(offset..offset + tfa_len) {
                            Some(block) => {
                                let v = Some(block.to_vec());
                                offset += tfa_len;
                                v
                            }
                            None => None,
                        },
                    }
                } else {
                    None
                };

                // Fail counter block length (4 bytes) — only present if room.
                let fail_counter_block = if offset + 4 <= data.len() {
                    let fail_counter_len = read_u32_le!() as usize;
                    match fail_counter_len {
                        0 => None,
                        _ => data.get(offset..offset + fail_counter_len).map(|block| {
                            let v = block.to_vec();
                            offset += fail_counter_len;
                            v
                        }),
                    }
                } else {
                    None
                };

                (identity_block, tfa_block, fail_counter_block)
            } else {
                (None, None, None)
            };

        // V4/V5 extended fields (identical byte layout for both versions).
        let (wrapped_mek, state_version, index_encrypted) =
            if version >= 4 && offset + 4 <= data.len() {
                // Wrapped MEK length (4 bytes)
                let wmek_len = read_u32_le!() as usize;

                let wrapped_mek = match wmek_len {
                    0 => None,
                    _ => match data.get(offset..offset + wmek_len) {
                        Some(blob) => {
                            let v = Some(blob.to_vec());
                            offset += wmek_len;
                            v
                        }
                        None => None,
                    },
                };

                // State version (8 bytes)
                let sv = if offset + 8 <= data.len() {
                    read_u64_le!()
                } else {
                    0
                };

                // Index encrypted flag (1 byte)
                let ie = match data.get(offset) {
                    // Last field parsed; no further reads, so `offset` is not advanced.
                    Some(b) => *b != 0,
                    None => false,
                };

                (wrapped_mek, sv, ie)
            } else {
                (None, 0, false)
            };

        Ok(VaultHeader {
            version,
            kdf_hash_id,
            cipher_id,
            salt,
            verify_iv,
            verify_ciphertext,
            header_hmac,
            active_index_slot,
            index1_offset,
            index1_length,
            index2_offset,
            index2_length,
            commit_counter,
            argon2_memory,
            argon2_time,
            argon2_parallelism,
            identity_block,
            tfa_block,
            fail_counter_block,
            wrapped_mek,
            state_version,
            index_encrypted,
        })
    }

    /// Serialize header to bytes
    pub fn write(&self) -> Vec<u8> {
        let header_size = match self.version {
            5 => HEADER_SIZE_V5,
            4 => HEADER_SIZE_V4,
            3 => HEADER_SIZE_V3,
            _ => HEADER_SIZE_V2,
        };

        let mut data = vec![0u8; header_size];
        let mut offset = 0;

        // Magic
        let magic = match self.version {
            5 => MAGIC_V5,
            4 => MAGIC_V4,
            3 => MAGIC_V3,
            _ => MAGIC_V2,
        };
        data[offset..offset + 8].copy_from_slice(magic);
        offset += 8;

        // KDF hash ID
        data[offset] = self.kdf_hash_id;
        offset += 1;

        // Cipher ID
        data[offset] = self.cipher_id;
        offset += 1;

        // Salt
        data[offset..offset + 32].copy_from_slice(&self.salt);
        offset += 32;

        // Verify IV
        data[offset..offset + 24].copy_from_slice(&self.verify_iv);
        offset += 24;

        // Verify ciphertext length and data
        let verify_ct_len = self.verify_ciphertext.len() as u16;
        data[offset..offset + 2].copy_from_slice(&verify_ct_len.to_le_bytes());
        offset += 2;

        data[offset..offset + self.verify_ciphertext.len()]
            .copy_from_slice(&self.verify_ciphertext);
        offset += self.verify_ciphertext.len();

        // Header HMAC
        data[offset..offset + 32].copy_from_slice(&self.header_hmac);
        offset += 32;

        // Active index slot
        data[offset] = self.active_index_slot;
        offset += 1;

        // Index offsets and lengths
        data[offset..offset + 4].copy_from_slice(&self.index1_offset.to_le_bytes());
        offset += 4;
        data[offset..offset + 4].copy_from_slice(&self.index1_length.to_le_bytes());
        offset += 4;
        data[offset..offset + 4].copy_from_slice(&self.index2_offset.to_le_bytes());
        offset += 4;
        data[offset..offset + 4].copy_from_slice(&self.index2_length.to_le_bytes());
        offset += 4;

        // Commit counter
        data[offset..offset + 8].copy_from_slice(&self.commit_counter.to_le_bytes());
        offset += 8;

        // Argon2 parameters
        data[offset..offset + 4].copy_from_slice(&self.argon2_memory.to_le_bytes());
        offset += 4;
        data[offset..offset + 4].copy_from_slice(&self.argon2_time.to_le_bytes());
        offset += 4;
        data[offset] = self.argon2_parallelism;
        offset += 1;

        // Optional blocks (V3 and V4)
        if self.version >= 3 {
            let identity_len = self.identity_block.as_ref().map(|b| b.len()).unwrap_or(0) as u32;
            data[offset..offset + 4].copy_from_slice(&identity_len.to_le_bytes());
            offset += 4;
            if let Some(ref block) = self.identity_block {
                data[offset..offset + block.len()].copy_from_slice(block);
                offset += block.len();
            }

            let tfa_len = self.tfa_block.as_ref().map(|b| b.len()).unwrap_or(0) as u32;
            data[offset..offset + 4].copy_from_slice(&tfa_len.to_le_bytes());
            offset += 4;
            if let Some(ref block) = self.tfa_block {
                data[offset..offset + block.len()].copy_from_slice(block);
                offset += block.len();
            }

            let fail_counter_len = self
                .fail_counter_block
                .as_ref()
                .map(|b| b.len())
                .unwrap_or(0) as u32;
            data[offset..offset + 4].copy_from_slice(&fail_counter_len.to_le_bytes());
            offset += 4;
            if let Some(ref block) = self.fail_counter_block {
                data[offset..offset + block.len()].copy_from_slice(block);
            }
        }

        // V4/V5 extended fields (identical byte layout for both versions).
        if self.version >= 4 {
            let wmek_len = self.wrapped_mek.as_ref().map(|b| b.len()).unwrap_or(0) as u32;
            data[offset..offset + 4].copy_from_slice(&wmek_len.to_le_bytes());
            offset += 4;
            if let Some(ref blob) = self.wrapped_mek {
                data[offset..offset + blob.len()].copy_from_slice(blob);
                offset += blob.len();
            }

            data[offset..offset + 8].copy_from_slice(&self.state_version.to_le_bytes());
            offset += 8;

            data[offset] = if self.index_encrypted { 1 } else { 0 };
        }

        data
    }

    /// Verify password by checking the verify marker
    pub fn verify_password(&self, key: &MasterKey) -> Result<bool> {
        let hmac_key = key.hmac_key();
        let computed_hmac =
            Self::compute_verify_hmac(hmac_key, &self.verify_iv, &self.verify_ciphertext);

        // Constant-time comparison
        Ok(computed_hmac.ct_eq(&self.header_hmac).unwrap_u8() != 0)
    }

    /// Domain separator for the widened V5 header HMAC. Distinguishes the new
    /// wide-coverage MAC from the legacy narrow MAC so the two can never be
    /// confused even if an attacker downgrades the version byte (the version
    /// itself is also covered by the MAC input — see [`Self::compute_hmac`]).
    const HEADER_HMAC_DOMAIN_V5: &'static [u8] = b"USBVault-HeaderHMAC-v5:";

    /// Compute HMAC-SHA256 over the security-relevant header content.
    ///
    /// The MAC is *version-gated* so that on-disk vaults always validate with
    /// the exact MAC that produced their stored `header_hmac`:
    ///
    /// * **V2/V3/V4 (legacy):** the ORIGINAL narrow MAC over
    ///   `salt || verify_iv || u16(verify_ct_len) || verify_ct`. Preserved
    ///   verbatim so every legacy vault on disk — including V4 vaults written
    ///   before this change — keeps validating unchanged.
    ///
    /// * **V5+:** a widened, length-prefixed, domain-separated MAC that
    ///   authenticates the FULL security-relevant header — version/kdf/cipher
    ///   ids, salt, verify marker, the dual-index offsets/lengths, the active
    ///   slot, commit/state counters, all Argon2 params, the `index_encrypted`
    ///   flag, and the length-prefixed wrapped MEK — closing the index-pointer /
    ///   wrapped-MEK / state-version / Argon2-downgrade tampering gaps (crypto
    ///   review M-4).
    ///
    /// ## Downgrade resistance
    ///
    /// The wide V5 MAC feeds `self.version` as its first authenticated field
    /// (right after the V5 domain tag). An attacker who flips a V5 vault's
    /// magic to `USBVLT04` to make `read()` treat it as legacy — and thereby
    /// strip the wide-MAC protection from the index pointers / wrapped MEK /
    /// Argon2 params — would cause verification to fall through to the *narrow*
    /// MAC branch. The narrow MAC does not match the stored V5 `header_hmac`
    /// (which was computed with the V5 domain tag + wide coverage), so unlock
    /// fails with `InvalidHeader`. Conversely, flipping V4→V5 makes the wide
    /// branch recompute over a different (and version-bound) input, also
    /// failing. The version byte is thus cryptographically bound to the chosen
    /// MAC algorithm, so the version/magic cannot be silently downgraded.
    pub fn compute_hmac(&self, hmac_key: &[u8; 32]) -> [u8; 32] {
        type HmacSha256 = Hmac<Sha256>;

        let mut mac = HmacSha256::new_from_slice(hmac_key).unwrap();

        if self.version >= 5 {
            // Widened, length-prefixed, domain-separated MAC for V5+.
            mac.update(Self::HEADER_HMAC_DOMAIN_V5);
            mac.update(&[self.version, self.kdf_hash_id, self.cipher_id]);
            mac.update(&self.salt);
            mac.update(&self.verify_iv);
            mac.update(&(self.verify_ciphertext.len() as u32).to_le_bytes());
            mac.update(&self.verify_ciphertext);
            mac.update(&[self.active_index_slot]);
            mac.update(&self.index1_offset.to_le_bytes());
            mac.update(&self.index1_length.to_le_bytes());
            mac.update(&self.index2_offset.to_le_bytes());
            mac.update(&self.index2_length.to_le_bytes());
            mac.update(&self.commit_counter.to_le_bytes());
            mac.update(&self.state_version.to_le_bytes());
            mac.update(&self.argon2_memory.to_le_bytes());
            mac.update(&self.argon2_time.to_le_bytes());
            mac.update(&[self.argon2_parallelism]);
            mac.update(&[self.index_encrypted as u8]);
            // Wrapped MEK (length-prefixed; 0xFFFFFFFF length sentinel = absent).
            match self.wrapped_mek.as_ref() {
                Some(w) => {
                    mac.update(&(w.len() as u32).to_le_bytes());
                    mac.update(w);
                }
                None => mac.update(&u32::MAX.to_le_bytes()),
            }
        } else {
            // Legacy V2/V3/V4 narrow MAC — unchanged for on-disk compatibility.
            mac.update(&self.salt);
            mac.update(&self.verify_iv);
            mac.update(&(self.verify_ciphertext.len() as u16).to_le_bytes());
            mac.update(&self.verify_ciphertext);
        }

        let result = mac.finalize();
        let mut out = [0u8; 32];
        out.copy_from_slice(&result.into_bytes()[0..32]);
        out
    }

    /// Compute verification HMAC
    fn compute_verify_hmac(
        hmac_key: &[u8; 32],
        verify_iv: &[u8; 24],
        verify_ciphertext: &[u8],
    ) -> [u8; 32] {
        type HmacSha256 = Hmac<Sha256>;

        let mut mac = HmacSha256::new_from_slice(hmac_key).unwrap();
        mac.update(verify_iv);
        mac.update(verify_ciphertext);

        let result = mac.finalize();
        let mut out = [0u8; 32];
        out.copy_from_slice(&result.into_bytes()[0..32]);
        out
    }

    /// Verify that this header's state version is strictly greater than the previous
    /// Returns error if rollback is detected
    pub fn verify_no_rollback(&self, previous_state_version: u64) -> Result<()> {
        if self.state_version <= previous_state_version && previous_state_version > 0 {
            return Err(CryptoError::RollbackDetected);
        }
        Ok(())
    }

    /// Increment the state version for a new commit
    pub fn increment_state_version(&mut self) {
        self.state_version = self.state_version.saturating_add(1);
    }

    // ═══════════════════════════════════════════════════════════════
    // P0: High-level vault operations
    // ═══════════════════════════════════════════════════════════════

    /// Domain separator for fail counter HMAC
    const FAIL_COUNTER_DOMAIN: &'static [u8] = b"USBVault-FailCounter-v1:";

    /// Maximum failed unlock attempts before self-destruct
    pub const MAX_FAIL_ATTEMPTS: u32 = 10;

    /// Create a new V5 vault header from a password.
    ///
    /// Generates salt, derives KEK, generates random MEK, wraps MEK,
    /// creates verify marker, computes header HMAC.
    ///
    /// Returns (header, enc_key_32, hmac_key_32) — the MEK halves for
    /// immediate use. The caller MUST zero these after writing the
    /// initial empty index.
    pub fn create_new(password: &[u8], cipher_id: CipherId) -> Result<(Self, [u8; 32], [u8; 32])> {
        let salt = generate_salt();

        // Derive KEK from password
        let kek = derive_kek(password, &salt)?;

        // Generate random MEK
        let mek = MasterEncryptionKey::generate();

        // Wrap MEK with KEK
        let wrapped = wrap_mek(&kek, &mek)?;

        // Create verify marker: encrypt known plaintext with MEK enc key
        let verify_plaintext = b"USBVAULT_VERIFY_OK_0000";
        let mut verify_iv = [0u8; 24];
        rand::rngs::OsRng.fill_bytes(&mut verify_iv);
        let verify_ciphertext = {
            use chacha20poly1305::{
                aead::{Aead, KeyInit},
                XChaCha20Poly1305,
            };
            use generic_array::GenericArray;
            let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(mek.encryption_key()));
            let nonce = chacha20poly1305::XNonce::from_slice(&verify_iv);
            cipher
                .encrypt(nonce, verify_plaintext.as_ref())
                .map_err(|_| CryptoError::KeyDerivationFailed)?
        };

        // Build header with initial dual-index pointers.
        // New vaults are written as V5 (wide, downgrade-resistant header MAC).
        // Both index slots initially empty (offset=HEADER_SIZE_V5, length=0)
        let mut header = VaultHeader {
            version: 5,
            kdf_hash_id: 2, // Argon2id
            cipher_id: cipher_id.as_byte(),
            salt,
            verify_iv,
            verify_ciphertext,
            header_hmac: [0u8; 32], // Computed below
            active_index_slot: 0,
            index1_offset: HEADER_SIZE_V5 as u32,
            index1_length: 0,
            index2_offset: HEADER_SIZE_V5 as u32,
            index2_length: 0,
            commit_counter: 0,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: Some(wrapped),
            state_version: 1,
            index_encrypted: true,
        };

        // Initialize fail counter to 0
        header.write_fail_counter(mek.hmac_key(), 0);

        // Compute header HMAC
        header.header_hmac = header.compute_hmac(mek.hmac_key());

        // Extract MEK halves for the caller
        let mut enc_key = [0u8; 32];
        let mut hmac_key = [0u8; 32];
        enc_key.copy_from_slice(mek.encryption_key());
        hmac_key.copy_from_slice(mek.hmac_key());

        Ok((header, enc_key, hmac_key))
    }

    /// Unlock a vault header with a password.
    ///
    /// Derives KEK, unwraps MEK, verifies password via verify marker, then
    /// validates the header HMAC with the version-appropriate MAC (narrow for
    /// V2/V3/V4, wide for V5). All on-disk versions parse and validate
    /// unchanged. To migrate a legacy V4 vault to V5, call
    /// [`Self::upgrade_to_v5_if_eligible`] (also done automatically on the next
    /// `commit_new_index`) and re-write the header.
    ///
    /// Returns the MEK halves (enc_key, hmac_key) on success.
    pub fn unlock(&self, password: &[u8]) -> Result<([u8; 32], [u8; 32])> {
        let wrapped = self
            .wrapped_mek
            .as_ref()
            .ok_or(CryptoError::InvalidHeader)?;

        // Derive KEK from password + header salt
        let kek = derive_kek(password, &self.salt)?;

        // Unwrap MEK
        let mek = unwrap_mek(&kek, wrapped).map_err(|_| CryptoError::PasswordWrong)?;

        // Verify password by decrypting verify marker
        let is_valid = {
            use chacha20poly1305::{
                aead::{Aead, KeyInit},
                XChaCha20Poly1305,
            };
            use generic_array::GenericArray;
            let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(mek.encryption_key()));
            let nonce = chacha20poly1305::XNonce::from_slice(&self.verify_iv);
            match cipher.decrypt(nonce, self.verify_ciphertext.as_ref()) {
                Ok(plaintext) => plaintext.starts_with(b"USBVAULT_VERIFY"),
                Err(_) => false,
            }
        };

        if !is_valid {
            return Err(CryptoError::PasswordWrong);
        }

        // Verify header HMAC
        let computed = self.compute_hmac(mek.hmac_key());
        if computed.ct_eq(&self.header_hmac).unwrap_u8() == 0 {
            return Err(CryptoError::InvalidHeader);
        }

        let mut enc_key = [0u8; 32];
        let mut hmac_key = [0u8; 32];
        enc_key.copy_from_slice(mek.encryption_key());
        hmac_key.copy_from_slice(mek.hmac_key());

        Ok((enc_key, hmac_key))
    }

    /// Read the fail counter from the header, verifying its HMAC.
    ///
    /// Returns the current fail count, or error if the block is
    /// tampered or missing.
    pub fn read_fail_counter(&self, hmac_key: &[u8; 32]) -> Result<u32> {
        let block = self
            .fail_counter_block
            .as_ref()
            .ok_or(CryptoError::InvalidHeader)?;

        if block.len() != 36 {
            return Err(CryptoError::InvalidHeader);
        }

        let counter = u32::from_le_bytes([block[0], block[1], block[2], block[3]]);
        let stored_hmac = &block[4..36];

        let expected = Self::compute_fail_counter_hmac(hmac_key, counter);
        if expected.ct_eq(stored_hmac).unwrap_u8() == 0 {
            return Err(CryptoError::FailCounterTampered);
        }

        Ok(counter)
    }

    /// Write a new fail counter value with HMAC protection.
    pub fn write_fail_counter(&mut self, hmac_key: &[u8; 32], count: u32) {
        let mut block = vec![0u8; 36];
        block[0..4].copy_from_slice(&count.to_le_bytes());
        let mac = Self::compute_fail_counter_hmac(hmac_key, count);
        block[4..36].copy_from_slice(&mac);
        self.fail_counter_block = Some(block);
    }

    /// Compute HMAC for fail counter value (domain-separated).
    fn compute_fail_counter_hmac(hmac_key: &[u8; 32], counter: u32) -> [u8; 32] {
        type HmacSha256 = Hmac<Sha256>;
        let mut mac = HmacSha256::new_from_slice(hmac_key).unwrap();
        mac.update(Self::FAIL_COUNTER_DOMAIN);
        mac.update(&counter.to_le_bytes());
        let result = mac.finalize();
        let mut out = [0u8; 32];
        out.copy_from_slice(&result.into_bytes());
        out
    }

    /// Upgrade a successfully-unlocked legacy header to V5 in place.
    ///
    /// V5 has the same byte layout as V4 but a wide, downgrade-resistant header
    /// MAC. Upgrading is only valid for V4 vaults, whose on-disk extended-field
    /// layout (wrapped MEK, state_version, index_encrypted) already matches V5.
    /// V2/V3 vaults lack a wrapped MEK and are NOT upgraded here (they keep
    /// their legacy version and narrow MAC). The caller is expected to recompute
    /// the header HMAC after this — `commit_new_index`/`self_destruct` do so
    /// automatically, so any unlocked V4 vault becomes V5 on its next write.
    ///
    /// Returns `true` if the version was changed.
    pub fn upgrade_to_v5_if_eligible(&mut self) -> bool {
        if self.version == 4 && self.wrapped_mek.is_some() {
            self.version = 5;
            true
        } else {
            false
        }
    }

    /// Commit a new index: flip the active index slot, update the
    /// inactive slot's offset/length, increment counters, recompute HMAC.
    ///
    /// This is the atomic commit operation for dual-index crash safety. A
    /// successfully-unlocked legacy V4 vault is transparently upgraded to V5
    /// here, so the wide header MAC is adopted on the next on-disk write.
    pub fn commit_new_index(
        &mut self,
        hmac_key: &[u8; 32],
        new_index_offset: u32,
        new_index_length: u32,
    ) {
        // Transparently migrate a legacy V4 vault to V5 on re-save.
        self.upgrade_to_v5_if_eligible();

        // Write to the INACTIVE slot
        if self.active_index_slot == 0 {
            self.index2_offset = new_index_offset;
            self.index2_length = new_index_length;
            self.active_index_slot = 1;
        } else {
            self.index1_offset = new_index_offset;
            self.index1_length = new_index_length;
            self.active_index_slot = 0;
        }

        self.commit_counter = self.commit_counter.saturating_add(1);
        self.increment_state_version();

        // Recompute header HMAC
        self.header_hmac = self.compute_hmac(hmac_key);
    }

    /// Self-destruct: overwrite the wrapped MEK with random bytes,
    /// making the vault permanently inaccessible.
    pub fn self_destruct(&mut self, hmac_key: &[u8; 32]) {
        use rand::RngCore;

        if let Some(ref mut wmek) = self.wrapped_mek {
            // 3-pass overwrite: random, zeros, random
            rand::rngs::OsRng.fill_bytes(wmek);
            wmek.iter_mut().for_each(|b| *b = 0);
            rand::rngs::OsRng.fill_bytes(wmek);
        }

        self.increment_state_version();
        self.header_hmac = self.compute_hmac(hmac_key);
    }
}

use rand::RngCore;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_roundtrip() {
        let header = VaultHeader {
            version: 2,
            kdf_hash_id: 1,
            cipher_id: 2,
            salt: [0x42u8; 32],
            verify_iv: [0x99u8; 24],
            verify_ciphertext: b"test_ciphertext".to_vec(),
            header_hmac: [0u8; 32],
            active_index_slot: 1,
            index1_offset: 4096,
            index1_length: 1024,
            index2_offset: 5120,
            index2_length: 1024,
            commit_counter: 42,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: None,
            state_version: 0,
            index_encrypted: false,
        };

        let bytes = header.write();
        let parsed = VaultHeader::read(&bytes).expect("Failed to parse");

        assert_eq!(parsed.version, 2);
        assert_eq!(parsed.salt, header.salt);
        assert_eq!(parsed.commit_counter, 42);
    }

    #[test]
    fn test_rollback_detection() {
        let mut header = VaultHeader {
            version: 4,
            kdf_hash_id: 1,
            cipher_id: 2,
            salt: [0x42u8; 32],
            verify_iv: [0x99u8; 24],
            verify_ciphertext: b"test_ct".to_vec(),
            header_hmac: [0u8; 32],
            active_index_slot: 1,
            index1_offset: 24576,
            index1_length: 2048,
            index2_offset: 26624,
            index2_length: 2048,
            commit_counter: 100,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: Some(vec![0xAB; 104]),
            state_version: 5,
            index_encrypted: true,
        };

        // Version 5 is valid when previous was 4
        assert!(header.verify_no_rollback(4).is_ok());

        // Version 5 is invalid when previous was 5 (same = rollback)
        assert!(header.verify_no_rollback(5).is_err());

        // Version 5 is invalid when previous was 6 (lower = rollback)
        assert!(header.verify_no_rollback(6).is_err());

        // Version 0 always passes (initial state)
        header.state_version = 1;
        assert!(header.verify_no_rollback(0).is_ok());
    }

    #[test]
    fn test_state_version_increment() {
        let mut header = VaultHeader {
            version: 4,
            kdf_hash_id: 1,
            cipher_id: 2,
            salt: [0x42u8; 32],
            verify_iv: [0x99u8; 24],
            verify_ciphertext: b"test_ct".to_vec(),
            header_hmac: [0u8; 32],
            active_index_slot: 1,
            index1_offset: 24576,
            index1_length: 2048,
            index2_offset: 26624,
            index2_length: 2048,
            commit_counter: 100,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: Some(vec![0xAB; 104]),
            state_version: 0,
            index_encrypted: true,
        };

        header.increment_state_version();
        assert_eq!(header.state_version, 1);
        header.increment_state_version();
        assert_eq!(header.state_version, 2);
    }

    #[test]
    fn test_v4_header_roundtrip() {
        let header = VaultHeader {
            version: 4,
            kdf_hash_id: 1,
            cipher_id: 2,
            salt: [0x42u8; 32],
            verify_iv: [0x99u8; 24],
            verify_ciphertext: b"test_ct".to_vec(),
            header_hmac: [0u8; 32],
            active_index_slot: 1,
            index1_offset: 24576,
            index1_length: 2048,
            index2_offset: 26624,
            index2_length: 2048,
            commit_counter: 100,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: Some(vec![0xAB; 104]),
            state_version: 42,
            index_encrypted: true,
        };

        let bytes = header.write();
        let parsed = VaultHeader::read(&bytes).expect("Failed to parse V4");

        assert_eq!(parsed.version, 4);
        assert_eq!(parsed.state_version, 42);
        assert!(parsed.index_encrypted);
        assert_eq!(parsed.wrapped_mek.as_ref().unwrap().len(), 104);
        assert_eq!(parsed.salt, header.salt);
        assert_eq!(parsed.commit_counter, 100);
    }

    /// A synthetic legacy V4 header whose `header_hmac` was computed with the
    /// ORIGINAL narrow MAC must still validate after the V5 migration. This is
    /// the regression guard for the bug that broke existing V4 vaults.
    #[test]
    fn test_legacy_v4_narrow_mac_still_validates() {
        let hmac_key = [0x11u8; 32];

        let mut header = VaultHeader {
            version: 4,
            kdf_hash_id: 2,
            cipher_id: 2,
            salt: [0x42u8; 32],
            verify_iv: [0x99u8; 24],
            verify_ciphertext: b"legacy_v4_verify_ct".to_vec(),
            header_hmac: [0u8; 32],
            active_index_slot: 1,
            index1_offset: 24576,
            index1_length: 2048,
            index2_offset: 26624,
            index2_length: 2048,
            commit_counter: 7,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: Some(vec![0xAB; 104]),
            state_version: 9,
            index_encrypted: true,
        };

        // Independently recompute the ORIGINAL narrow MAC and confirm
        // compute_hmac() reproduces it for a V4 header.
        let narrow = {
            type HmacSha256 = Hmac<Sha256>;
            let mut mac = HmacSha256::new_from_slice(&hmac_key).unwrap();
            mac.update(&header.salt);
            mac.update(&header.verify_iv);
            mac.update(&(header.verify_ciphertext.len() as u16).to_le_bytes());
            mac.update(&header.verify_ciphertext);
            let mut out = [0u8; 32];
            out.copy_from_slice(&mac.finalize().into_bytes()[0..32]);
            out
        };
        header.header_hmac = narrow;
        assert_eq!(header.compute_hmac(&hmac_key), narrow);

        // Round-trips through disk format and re-validates with the narrow MAC.
        let bytes = header.write();
        let parsed = VaultHeader::read(&bytes).expect("Failed to parse V4");
        assert_eq!(parsed.version, 4);
        assert_eq!(parsed.compute_hmac(&hmac_key), narrow);
        assert!(
            parsed
                .compute_hmac(&hmac_key)
                .ct_eq(&parsed.header_hmac)
                .unwrap_u8()
                != 0
        );
    }

    /// V5 headers round-trip and validate with the wide MAC; the wide MAC
    /// differs from the legacy narrow MAC over the same fields.
    #[test]
    fn test_v5_header_roundtrip_and_wide_mac() {
        let hmac_key = [0x22u8; 32];

        let mut header = VaultHeader {
            version: 5,
            kdf_hash_id: 2,
            cipher_id: 2,
            salt: [0x55u8; 32],
            verify_iv: [0x66u8; 24],
            verify_ciphertext: b"v5_verify_ct".to_vec(),
            header_hmac: [0u8; 32],
            active_index_slot: 0,
            index1_offset: HEADER_SIZE_V5 as u32,
            index1_length: 0,
            index2_offset: HEADER_SIZE_V5 as u32,
            index2_length: 0,
            commit_counter: 0,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: Some(vec![0xCD; 104]),
            state_version: 1,
            index_encrypted: true,
        };
        header.header_hmac = header.compute_hmac(&hmac_key);

        let bytes = header.write();
        assert_eq!(bytes.len(), HEADER_SIZE_V5);
        assert_eq!(&bytes[0..8], MAGIC_V5);

        let parsed = VaultHeader::read(&bytes).expect("Failed to parse V5");
        assert_eq!(parsed.version, 5);
        assert_eq!(parsed.state_version, 1);
        assert!(parsed.index_encrypted);
        assert_eq!(parsed.wrapped_mek.as_ref().unwrap().len(), 104);
        // Wide MAC validates.
        assert!(
            parsed
                .compute_hmac(&hmac_key)
                .ct_eq(&parsed.header_hmac)
                .unwrap_u8()
                != 0
        );

        // Wide MAC must NOT equal the narrow MAC over the same content.
        let narrow = {
            type HmacSha256 = Hmac<Sha256>;
            let mut mac = HmacSha256::new_from_slice(&hmac_key).unwrap();
            mac.update(&header.salt);
            mac.update(&header.verify_iv);
            mac.update(&(header.verify_ciphertext.len() as u16).to_le_bytes());
            mac.update(&header.verify_ciphertext);
            let mut out = [0u8; 32];
            out.copy_from_slice(&mac.finalize().into_bytes()[0..32]);
            out
        };
        assert_ne!(header.header_hmac, narrow);
    }

    /// Downgrade resistance: a V5 vault whose magic is flipped to V4 (to fall
    /// back to the narrow MAC and strip wide-MAC-protected fields) must fail
    /// validation. The version byte is authenticated, so the stored V5 MAC will
    /// not match the V4 narrow MAC.
    #[test]
    fn test_v5_to_v4_downgrade_is_rejected() {
        let hmac_key = [0x33u8; 32];

        let mut header = VaultHeader {
            version: 5,
            kdf_hash_id: 2,
            cipher_id: 2,
            salt: [0x77u8; 32],
            verify_iv: [0x88u8; 24],
            verify_ciphertext: b"v5_downgrade_ct".to_vec(),
            header_hmac: [0u8; 32],
            active_index_slot: 0,
            index1_offset: HEADER_SIZE_V5 as u32,
            index1_length: 0,
            index2_offset: HEADER_SIZE_V5 as u32,
            index2_length: 0,
            commit_counter: 0,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: Some(vec![0xEF; 104]),
            state_version: 3,
            index_encrypted: true,
        };
        header.header_hmac = header.compute_hmac(&hmac_key);

        let mut bytes = header.write();
        // Attacker flips magic V5 -> V4, keeping the stored (wide) MAC.
        bytes[0..8].copy_from_slice(MAGIC_V4);

        let forged = VaultHeader::read(&bytes).expect("parse as V4");
        assert_eq!(forged.version, 4);
        // V4 branch recomputes the NARROW MAC, which cannot match the stored
        // wide V5 MAC -> verification fails.
        assert!(
            forged
                .compute_hmac(&hmac_key)
                .ct_eq(&forged.header_hmac)
                .unwrap_u8()
                == 0
        );
    }

    /// A legacy V4 vault upgrades to V5 on the next re-save (commit).
    #[test]
    fn test_v4_upgrades_to_v5_on_commit() {
        let hmac_key = [0x44u8; 32];
        let mut header = VaultHeader {
            version: 4,
            kdf_hash_id: 2,
            cipher_id: 2,
            salt: [0x01u8; 32],
            verify_iv: [0x02u8; 24],
            verify_ciphertext: b"v4_ct".to_vec(),
            header_hmac: [0u8; 32],
            active_index_slot: 0,
            index1_offset: 24576,
            index1_length: 0,
            index2_offset: 24576,
            index2_length: 0,
            commit_counter: 0,
            argon2_memory: 65536,
            argon2_time: 3,
            argon2_parallelism: 4,
            identity_block: None,
            tfa_block: None,
            fail_counter_block: None,
            wrapped_mek: Some(vec![0x10; 104]),
            state_version: 1,
            index_encrypted: true,
        };

        header.commit_new_index(&hmac_key, 30000, 512);
        assert_eq!(header.version, 5);

        let bytes = header.write();
        assert_eq!(&bytes[0..8], MAGIC_V5);
        let parsed = VaultHeader::read(&bytes).expect("parse upgraded V5");
        assert_eq!(parsed.version, 5);
        assert!(
            parsed
                .compute_hmac(&hmac_key)
                .ct_eq(&parsed.header_hmac)
                .unwrap_u8()
                != 0
        );
    }
}
