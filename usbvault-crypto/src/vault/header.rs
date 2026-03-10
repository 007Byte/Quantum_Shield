//! Vault V2/V3 header format (byte-level compatible with Python implementation)

use crate::cipher::CipherId;
use crate::error::{CryptoError, Result};
use crate::kdf::MasterKey;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use subtle::ConstantTimeEq;

/// V2 magic bytes
pub const MAGIC_V2: &[u8; 8] = b"USBVLT02";

/// V3 magic bytes
pub const MAGIC_V3: &[u8; 8] = b"USBVLT03";

/// V4 magic bytes
pub const MAGIC_V4: &[u8; 8] = b"USBVLT04";

/// V2 header size (4096 bytes)
pub const HEADER_SIZE_V2: usize = 4096;

/// V3 header size (16384 bytes)
pub const HEADER_SIZE_V3: usize = 16384;

/// V4 header size (24576 bytes = 24KB for wrapped MEK + encrypted index)
pub const HEADER_SIZE_V4: usize = 24576;

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
    /// Parse header from bytes
    pub fn read(data: &[u8]) -> Result<Self> {
        if data.len() < 128 {
            return Err(CryptoError::InvalidHeader);
        }

        let mut offset = 0;

        // Magic (8 bytes)
        let magic = &data[offset..offset + 8];
        let version = if magic == MAGIC_V2 {
            2
        } else if magic == MAGIC_V3 {
            3
        } else if magic == MAGIC_V4 {
            4
        } else {
            return Err(CryptoError::InvalidMagic);
        };
        offset += 8;

        // KDF hash ID (1 byte)
        let kdf_hash_id = data[offset];
        offset += 1;

        // Cipher ID (1 byte)
        let cipher_id = data[offset];
        let _ = CipherId::from_byte(cipher_id)?; // Validate
        offset += 1;

        // Salt (32 bytes)
        let mut salt = [0u8; 32];
        salt.copy_from_slice(&data[offset..offset + 32]);
        offset += 32;

        // Verify IV (24 bytes)
        let mut verify_iv = [0u8; 24];
        verify_iv.copy_from_slice(&data[offset..offset + 24]);
        offset += 24;

        // Verify ciphertext length (2 bytes)
        let verify_ct_len = u16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
        offset += 2;

        // Verify ciphertext (variable)
        let verify_ciphertext = data[offset..offset + verify_ct_len].to_vec();
        offset += verify_ct_len;

        // Header HMAC (32 bytes)
        let mut header_hmac = [0u8; 32];
        header_hmac.copy_from_slice(&data[offset..offset + 32]);
        offset += 32;

        // Active index slot (1 byte)
        let active_index_slot = data[offset];
        offset += 1;

        // Index 1 offset (4 bytes)
        let index1_offset = u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // Index 1 length (4 bytes)
        let index1_length = u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // Index 2 offset (4 bytes)
        let index2_offset = u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // Index 2 length (4 bytes)
        let index2_length = u32::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]);
        offset += 4;

        // Commit counter (8 bytes)
        let commit_counter = u64::from_le_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
            data[offset + 4],
            data[offset + 5],
            data[offset + 6],
            data[offset + 7],
        ]);
        offset += 8;

        // Argon2 parameters
        let argon2_memory =
            u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
        offset += 4;

        let argon2_time =
            u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]);
        offset += 4;

        let argon2_parallelism = data[offset];
        offset += 1;

        // Optional blocks (only in V3)
        let (identity_block, tfa_block, fail_counter_block) = if version == 3 && offset + 12 <= data.len()
        {
            // Identity block length (4 bytes)
            let identity_len =
                u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
                    as usize;
            offset += 4;

            let identity_block = if identity_len > 0 && offset + identity_len <= data.len() {
                let block = Some(data[offset..offset + identity_len].to_vec());
                offset += identity_len;
                block
            } else {
                None
            };

            // TFA block length (4 bytes)
            let tfa_len =
                u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
                    as usize;
            offset += 4;

            let tfa_block = if tfa_len > 0 && offset + tfa_len <= data.len() {
                let block = Some(data[offset..offset + tfa_len].to_vec());
                offset += tfa_len;
                block
            } else {
                None
            };

            // Fail counter block length (4 bytes)
            let fail_counter_len =
                u32::from_le_bytes([data[offset], data[offset + 1], data[offset + 2], data[offset + 3]])
                    as usize;
            offset += 4;

            let fail_counter_block = if fail_counter_len > 0 && offset + fail_counter_len <= data.len() {
                Some(data[offset..offset + fail_counter_len].to_vec())
            } else {
                None
            };

            (identity_block, tfa_block, fail_counter_block)
        } else {
            (None, None, None)
        };

        // V4 extended fields
        let (wrapped_mek, state_version, index_encrypted) = if version == 4 && offset + 8 <= data.len() {
            // Wrapped MEK length (4 bytes)
            let wmek_len = u32::from_le_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
            offset += 4;

            let wrapped_mek = if wmek_len > 0 && offset + wmek_len <= data.len() {
                let blob = Some(data[offset..offset + wmek_len].to_vec());
                offset += wmek_len;
                blob
            } else {
                None
            };

            // State version (8 bytes)
            let sv = if offset + 8 <= data.len() {
                let v = u64::from_le_bytes([
                    data[offset], data[offset+1], data[offset+2], data[offset+3],
                    data[offset+4], data[offset+5], data[offset+6], data[offset+7],
                ]);
                offset += 8;
                v
            } else {
                0
            };

            // Index encrypted flag (1 byte)
            let ie = if offset < data.len() {
                let flag = data[offset] != 0;
                offset += 1;
                flag
            } else {
                false
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
            4 => HEADER_SIZE_V4,
            3 => HEADER_SIZE_V3,
            _ => HEADER_SIZE_V2,
        };

        let mut data = vec![0u8; header_size];
        let mut offset = 0;

        // Magic
        let magic = match self.version {
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

        data[offset..offset + self.verify_ciphertext.len()].copy_from_slice(&self.verify_ciphertext);
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

        // Optional V3 blocks
        if self.version == 3 {
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

            let fail_counter_len = self.fail_counter_block.as_ref().map(|b| b.len()).unwrap_or(0) as u32;
            data[offset..offset + 4].copy_from_slice(&fail_counter_len.to_le_bytes());
            offset += 4;
            if let Some(ref block) = self.fail_counter_block {
                data[offset..offset + block.len()].copy_from_slice(block);
            }
        }

        // V4 extended fields
        if self.version == 4 {
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
        let computed_hmac = Self::compute_verify_hmac(hmac_key, &self.verify_iv, &self.verify_ciphertext);

        // Constant-time comparison
        Ok(computed_hmac.ct_eq(&self.header_hmac).unwrap_u8() != 0)
    }

    /// Compute HMAC-SHA256 of header content
    pub fn compute_hmac(&self, hmac_key: &[u8; 32]) -> [u8; 32] {
        type HmacSha256 = Hmac<Sha256>;

        let mut mac = HmacSha256::new_from_slice(hmac_key).unwrap();

        // HMAC the non-signature part of header
        mac.update(&self.salt);
        mac.update(&self.verify_iv);
        mac.update(&(self.verify_ciphertext.len() as u16).to_le_bytes());
        mac.update(&self.verify_ciphertext);

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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_header_roundtrip() {
        let mut header = VaultHeader {
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
        assert_eq!(parsed.index_encrypted, true);
        assert_eq!(parsed.wrapped_mek.as_ref().unwrap().len(), 104);
        assert_eq!(parsed.salt, header.salt);
        assert_eq!(parsed.commit_counter, 100);
    }
}
