//! TFA Credential Packing — V2.0 Fortress Spec §2 Wire Format
//!
//! Serializes/deserializes FIDO2 credentials for storage in the V4 header's
//! TFA block. Each credential entry follows the spec wire format:
//!
//! ```text
//! +-------------+---------------+----------+-----------+-----------+
//! | cred_id_len | credential_id | aaguid   | label_len | label     |
//! | (2B u16 LE) | (variable)    | (16B)    | (1B)      | (var, max |
//! |             |               |          |           |  32B UTF8)|
//! +-------------+---------------+----------+-----------+-----------+
//! ```
//!
//! The TFA block header contains method, max_attempts, salt, and recovery blob
//! before the credential entries.

use crate::error::{CryptoError, Result};

/// Maximum credential ID size (prevent DoS via oversized entries)
const MAX_CRED_ID_SIZE: usize = 256;

/// Maximum label size (per spec: 32 bytes UTF-8)
const MAX_LABEL_SIZE: usize = 32;

/// Maximum total credentials (per spec)
const MAX_CREDENTIALS: usize = 4;

/// AAGUID size (fixed per WebAuthn spec)
const AAGUID_SIZE: usize = 16;

/// TFA methods (V2.0 Fortress Spec §2 offset 768)
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum TfaMethod {
    None = 0,
    Fido2 = 1,
}

impl TfaMethod {
    pub fn from_byte(b: u8) -> Result<Self> {
        match b {
            0 => Ok(TfaMethod::None),
            1 => Ok(TfaMethod::Fido2),
            _ => Err(CryptoError::InvalidInput(format!(
                "Unknown TFA method: {b}"
            ))),
        }
    }
}

/// A single FIDO2 credential entry in the TFA block.
#[derive(Debug, Clone)]
pub struct TfaCredentialEntry {
    /// WebAuthn credential ID (variable length, max 256 bytes)
    pub credential_id: Vec<u8>,
    /// Authenticator Attestation GUID (16 bytes, from authenticator)
    pub aaguid: [u8; AAGUID_SIZE],
    /// Human-readable label (max 32 bytes UTF-8)
    pub label: String,
}

/// Complete TFA block as stored in the V4 header.
#[derive(Debug, Clone)]
pub struct TfaBlock {
    /// TFA method (0 = none, 1 = FIDO2)
    pub method: TfaMethod,
    /// Maximum authentication attempts
    pub max_attempts: u8,
    /// FIDO2 hmac-secret salt (32 bytes)
    pub fido2_salt: [u8; 32],
    /// Recovery blob (60 bytes: 12B nonce + 32B ciphertext + 16B tag)
    pub recovery_blob: Vec<u8>,
    /// Registered credentials
    pub credentials: Vec<TfaCredentialEntry>,
}

impl TfaBlock {
    /// Create an empty TFA block (no 2FA configured).
    pub fn empty() -> Self {
        TfaBlock {
            method: TfaMethod::None,
            max_attempts: 3,
            fido2_salt: [0u8; 32],
            recovery_blob: Vec::new(),
            credentials: Vec::new(),
        }
    }

    /// Serialize to bytes for storage in the V4 header TFA block.
    ///
    /// Format:
    /// ```text
    /// [1B method][1B max_attempts][32B fido2_salt]
    /// [1B recovery_blob_len][recovery_blob]
    /// [1B credential_count]
    /// [credential_entry_1][credential_entry_2]...
    /// ```
    pub fn pack(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(128);

        // Header fields
        buf.push(self.method as u8);
        buf.push(self.max_attempts);
        buf.extend_from_slice(&self.fido2_salt);

        // Recovery blob (length-prefixed)
        let rb_len = self.recovery_blob.len().min(255) as u8;
        buf.push(rb_len);
        buf.extend_from_slice(&self.recovery_blob[..rb_len as usize]);

        // Credential count
        let cred_count = self.credentials.len().min(MAX_CREDENTIALS) as u8;
        buf.push(cred_count);

        // Credential entries (per-spec wire format)
        for cred in self.credentials.iter().take(MAX_CREDENTIALS) {
            // cred_id_len (2B u16 LE)
            let cred_id_len = cred.credential_id.len().min(MAX_CRED_ID_SIZE) as u16;
            buf.extend_from_slice(&cred_id_len.to_le_bytes());

            // credential_id (variable)
            buf.extend_from_slice(&cred.credential_id[..cred_id_len as usize]);

            // aaguid (16B)
            buf.extend_from_slice(&cred.aaguid);

            // label_len (1B)
            let label_bytes = cred.label.as_bytes();
            let label_len = label_bytes.len().min(MAX_LABEL_SIZE) as u8;
            buf.push(label_len);

            // label (variable, max 32B UTF-8)
            buf.extend_from_slice(&label_bytes[..label_len as usize]);
        }

        buf
    }

    /// Deserialize from bytes read from the V4 header TFA block.
    pub fn unpack(data: &[u8]) -> Result<Self> {
        if data.len() < 35 {
            return Err(CryptoError::InvalidInput(
                "TFA block too short (minimum 35 bytes)".into(),
            ));
        }

        let mut offset = 0;

        // Method (1B)
        let method = TfaMethod::from_byte(data[offset])?;
        offset += 1;

        // Max attempts (1B)
        let max_attempts = data[offset];
        offset += 1;

        // FIDO2 salt (32B)
        let mut fido2_salt = [0u8; 32];
        if offset + 32 > data.len() {
            return Err(CryptoError::InvalidInput(
                "TFA block truncated at salt".into(),
            ));
        }
        fido2_salt.copy_from_slice(&data[offset..offset + 32]);
        offset += 32;

        // Recovery blob (length-prefixed)
        if offset >= data.len() {
            return Err(CryptoError::InvalidInput(
                "TFA block truncated at recovery blob".into(),
            ));
        }
        let rb_len = data[offset] as usize;
        offset += 1;
        if offset + rb_len > data.len() {
            return Err(CryptoError::InvalidInput(
                "TFA block truncated in recovery blob data".into(),
            ));
        }
        let recovery_blob = data[offset..offset + rb_len].to_vec();
        offset += rb_len;

        // Credential count (1B)
        if offset >= data.len() {
            return Ok(TfaBlock {
                method,
                max_attempts,
                fido2_salt,
                recovery_blob,
                credentials: Vec::new(),
            });
        }
        let cred_count = data[offset] as usize;
        offset += 1;

        if cred_count > MAX_CREDENTIALS {
            return Err(CryptoError::InvalidInput(format!(
                "Too many TFA credentials: {cred_count} (max {MAX_CREDENTIALS})"
            )));
        }

        // Parse credential entries
        let mut credentials = Vec::with_capacity(cred_count);
        for _ in 0..cred_count {
            // cred_id_len (2B u16 LE)
            if offset + 2 > data.len() {
                return Err(CryptoError::InvalidInput(
                    "TFA block truncated at credential".into(),
                ));
            }
            let cred_id_len = u16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
            offset += 2;

            if cred_id_len > MAX_CRED_ID_SIZE {
                return Err(CryptoError::InvalidInput(format!(
                    "Credential ID too large: {cred_id_len} bytes"
                )));
            }

            // credential_id (variable)
            if offset + cred_id_len > data.len() {
                return Err(CryptoError::InvalidInput(
                    "TFA block truncated in credential ID".into(),
                ));
            }
            let credential_id = data[offset..offset + cred_id_len].to_vec();
            offset += cred_id_len;

            // aaguid (16B)
            if offset + AAGUID_SIZE > data.len() {
                return Err(CryptoError::InvalidInput(
                    "TFA block truncated at AAGUID".into(),
                ));
            }
            let mut aaguid = [0u8; AAGUID_SIZE];
            aaguid.copy_from_slice(&data[offset..offset + AAGUID_SIZE]);
            offset += AAGUID_SIZE;

            // label_len (1B)
            if offset >= data.len() {
                return Err(CryptoError::InvalidInput(
                    "TFA block truncated at label length".into(),
                ));
            }
            let label_len = data[offset] as usize;
            offset += 1;

            if label_len > MAX_LABEL_SIZE {
                return Err(CryptoError::InvalidInput(format!(
                    "Label too large: {label_len} bytes (max {MAX_LABEL_SIZE})"
                )));
            }

            // label (variable)
            if offset + label_len > data.len() {
                return Err(CryptoError::InvalidInput(
                    "TFA block truncated in label".into(),
                ));
            }
            let label = String::from_utf8(data[offset..offset + label_len].to_vec())
                .map_err(|_| CryptoError::InvalidInput("Label is not valid UTF-8".into()))?;
            offset += label_len;

            credentials.push(TfaCredentialEntry {
                credential_id,
                aaguid,
                label,
            });
        }

        Ok(TfaBlock {
            method,
            max_attempts,
            fido2_salt,
            recovery_blob,
            credentials,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pack_unpack_roundtrip() {
        let block = TfaBlock {
            method: TfaMethod::Fido2,
            max_attempts: 5,
            fido2_salt: [0xAA; 32],
            recovery_blob: vec![0x01, 0x02, 0x03],
            credentials: vec![
                TfaCredentialEntry {
                    credential_id: vec![0x10, 0x20, 0x30, 0x40],
                    aaguid: [0xBB; 16],
                    label: "YubiKey 5".to_string(),
                },
                TfaCredentialEntry {
                    credential_id: vec![0x50, 0x60],
                    aaguid: [0xCC; 16],
                    label: "Backup Key".to_string(),
                },
            ],
        };

        let packed = block.pack();
        let unpacked = TfaBlock::unpack(&packed).expect("Unpack should succeed");

        assert_eq!(unpacked.method, TfaMethod::Fido2);
        assert_eq!(unpacked.max_attempts, 5);
        assert_eq!(unpacked.fido2_salt, [0xAA; 32]);
        assert_eq!(unpacked.recovery_blob, vec![0x01, 0x02, 0x03]);
        assert_eq!(unpacked.credentials.len(), 2);
        assert_eq!(
            unpacked.credentials[0].credential_id,
            vec![0x10, 0x20, 0x30, 0x40]
        );
        assert_eq!(unpacked.credentials[0].label, "YubiKey 5");
        assert_eq!(unpacked.credentials[1].credential_id, vec![0x50, 0x60]);
        assert_eq!(unpacked.credentials[1].label, "Backup Key");
    }

    #[test]
    fn test_empty_block() {
        let block = TfaBlock::empty();
        let packed = block.pack();
        let unpacked = TfaBlock::unpack(&packed).expect("Unpack should succeed");

        assert_eq!(unpacked.method, TfaMethod::None);
        assert_eq!(unpacked.max_attempts, 3);
        assert_eq!(unpacked.credentials.len(), 0);
    }

    #[test]
    fn test_rejects_oversized_cred_id() {
        let mut data = vec![1u8, 3]; // method=FIDO2, max_attempts=3
        data.extend_from_slice(&[0; 32]); // salt
        data.push(0); // recovery_blob_len=0
        data.push(1); // 1 credential
        data.extend_from_slice(&300u16.to_le_bytes()); // cred_id_len=300 (over limit)
                                                       // Don't provide the actual credential data

        let result = TfaBlock::unpack(&data);
        assert!(result.is_err());
    }

    #[test]
    fn test_rejects_too_many_credentials() {
        let mut data = vec![1u8, 3]; // method=FIDO2, max_attempts=3
        data.extend_from_slice(&[0; 32]); // salt
        data.push(0); // recovery_blob_len=0
        data.push(5); // 5 credentials (over max of 4)

        let result = TfaBlock::unpack(&data);
        assert!(result.is_err());
    }
}
