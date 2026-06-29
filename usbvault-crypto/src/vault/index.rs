//! Vault index (file list) with encryption support
//!
//! The index maps filenames to file entries (offsets + optional per-file encryption keys).
//! In V4+ vaults, the entire index is encrypted before being stored in the header,
//! eliminating metadata leakage of filenames.

use crate::error::{CryptoError, Result};
use crate::kdf::derive_subkey;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Entry for a single file in the vault index
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    /// Byte offset of the file's encrypted data within the vault
    pub offset: u64,
    /// Encrypted per-file key (wrapped with MEK), None for legacy vaults
    #[serde(skip_serializing_if = "Option::is_none")]
    pub encrypted_file_key: Option<Vec<u8>>,
    /// SG-012: Monotonic version counter for rollback protection.
    /// Starts at 1 on creation, incremented on every write. Clients MUST reject
    /// any file whose version ≤ last-known version. Defaults to 0 for legacy entries.
    #[serde(default)]
    pub version: u64,
}

/// Vault index mapping filenames to file entries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultIndex {
    #[serde(flatten)]
    files: HashMap<String, FileEntry>,
}

impl VaultIndex {
    /// Create a new empty index
    pub fn new() -> Self {
        VaultIndex {
            files: HashMap::new(),
        }
    }

    /// Parse index from JSON bytes (supports both legacy u64 and new FileEntry format)
    pub fn from_json(data: &[u8]) -> Result<Self> {
        // Try new FileEntry format first
        if let Ok(index) = serde_json::from_slice::<VaultIndex>(data) {
            return Ok(index);
        }

        // Fall back to legacy format: HashMap<String, u64>
        let legacy: HashMap<String, u64> =
            serde_json::from_slice(data).map_err(|_| CryptoError::SerializationError)?;

        let files = legacy
            .into_iter()
            .map(|(name, offset)| {
                (
                    name,
                    FileEntry {
                        offset,
                        encrypted_file_key: None,
                        version: 0,
                    },
                )
            })
            .collect();

        Ok(VaultIndex { files })
    }

    /// Serialize index to JSON bytes
    pub fn to_json(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(&self).map_err(|_| CryptoError::SerializationError)
    }

    /// Encrypt the index using a key derived from the master key
    /// Returns: nonce(24) || ciphertext || tag(16)
    pub fn encrypt(&self, master_key: &[u8; 32]) -> Result<Vec<u8>> {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305,
        };
        use generic_array::GenericArray;
        use rand::Rng;

        let index_key = derive_subkey(master_key, "vault_index_encryption")?;
        let json = self.to_json()?;

        let mut nonce = [0u8; 24];
        rand::thread_rng().fill(&mut nonce);

        let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&index_key));
        let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

        let ciphertext = cipher
            .encrypt(nonce_array, json.as_ref())
            .map_err(|_| CryptoError::SerializationError)?;

        let mut result = Vec::with_capacity(24 + ciphertext.len());
        result.extend_from_slice(&nonce);
        result.extend_from_slice(&ciphertext);
        Ok(result)
    }

    /// Decrypt an encrypted index blob
    pub fn decrypt(master_key: &[u8; 32], encrypted: &[u8]) -> Result<Self> {
        use chacha20poly1305::{
            aead::{Aead, KeyInit},
            XChaCha20Poly1305,
        };
        use generic_array::GenericArray;

        if encrypted.len() < 24 + 16 {
            return Err(CryptoError::CorruptedIndex);
        }

        let index_key = derive_subkey(master_key, "vault_index_encryption")?;
        let nonce = chacha20poly1305::XNonce::from_slice(&encrypted[0..24]);
        let ciphertext = &encrypted[24..];

        let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&index_key));

        let json = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| CryptoError::CorruptedIndex)?;

        Self::from_json(&json)
    }

    /// V6: encrypt the index, binding deterministic associated data (`ad`).
    ///
    /// Mirrors [`Self::encrypt`] (same derived key, same XChaCha20-Poly1305,
    /// same `nonce(24) || ciphertext||tag(16)` layout) but authenticates `ad`
    /// (typically `VaultHeader::index_ad_v6(version, salt, active_slot)`), so an
    /// index blob lifted into a different/older header fails its AEAD tag. The
    /// legacy [`Self::encrypt`] is unchanged for V<=5.
    pub fn encrypt_with_ad(&self, master_key: &[u8; 32], ad: &[u8]) -> Result<Vec<u8>> {
        use chacha20poly1305::{
            aead::{Aead, KeyInit, Payload},
            XChaCha20Poly1305,
        };
        use generic_array::GenericArray;
        use rand::Rng;

        let index_key = derive_subkey(master_key, "vault_index_encryption")?;
        let json = self.to_json()?;

        let mut nonce = [0u8; 24];
        rand::thread_rng().fill(&mut nonce);

        let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&index_key));
        let nonce_array = chacha20poly1305::XNonce::from_slice(&nonce);

        let ciphertext = cipher
            .encrypt(
                nonce_array,
                Payload {
                    msg: json.as_ref(),
                    aad: ad,
                },
            )
            .map_err(|_| CryptoError::SerializationError)?;

        let mut result = Vec::with_capacity(24 + ciphertext.len());
        result.extend_from_slice(&nonce);
        result.extend_from_slice(&ciphertext);
        Ok(result)
    }

    /// V6: decrypt an AD-bound index blob, verifying the associated data (`ad`).
    /// Fails if `ad` does not match the AD used at encrypt time. Counterpart to
    /// [`Self::encrypt_with_ad`].
    pub fn decrypt_with_ad(master_key: &[u8; 32], encrypted: &[u8], ad: &[u8]) -> Result<Self> {
        use chacha20poly1305::{
            aead::{Aead, KeyInit, Payload},
            XChaCha20Poly1305,
        };
        use generic_array::GenericArray;

        if encrypted.len() < 24 + 16 {
            return Err(CryptoError::CorruptedIndex);
        }

        let index_key = derive_subkey(master_key, "vault_index_encryption")?;
        let nonce = chacha20poly1305::XNonce::from_slice(&encrypted[0..24]);
        let ciphertext = &encrypted[24..];

        let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&index_key));

        let json = cipher
            .decrypt(
                nonce,
                Payload {
                    msg: ciphertext,
                    aad: ad,
                },
            )
            .map_err(|_| CryptoError::CorruptedIndex)?;

        Self::from_json(&json)
    }

    /// Look up a file by name
    pub fn lookup(&self, filename: &str) -> Option<u64> {
        self.files.get(filename).map(|e| e.offset)
    }

    /// Look up a file entry (with per-file key info)
    pub fn lookup_entry(&self, filename: &str) -> Option<&FileEntry> {
        self.files.get(filename)
    }

    /// Insert or update a file entry (version starts at 1 for new entries)
    pub fn insert(&mut self, filename: String, offset: u64) {
        let version = self
            .files
            .get(&filename)
            .map(|e| e.version + 1)
            .unwrap_or(1);
        self.files.insert(
            filename,
            FileEntry {
                offset,
                encrypted_file_key: None,
                version,
            },
        );
    }

    /// Insert or update a file entry with an encrypted per-file key
    pub fn insert_with_key(&mut self, filename: String, offset: u64, encrypted_file_key: Vec<u8>) {
        let version = self
            .files
            .get(&filename)
            .map(|e| e.version + 1)
            .unwrap_or(1);
        self.files.insert(
            filename,
            FileEntry {
                offset,
                encrypted_file_key: Some(encrypted_file_key),
                version,
            },
        );
    }

    /// SG-012: Insert with explicit version (used during sync/migration)
    pub fn insert_with_version(&mut self, filename: String, offset: u64, version: u64) {
        self.files.insert(
            filename,
            FileEntry {
                offset,
                encrypted_file_key: None,
                version,
            },
        );
    }

    /// SG-012: Validate that an incoming file entry does not roll back the version.
    /// Returns Err if the new version is ≤ the currently known version.
    pub fn validate_version(&self, filename: &str, incoming_version: u64) -> Result<()> {
        if let Some(existing) = self.files.get(filename) {
            if existing.version > 0 && incoming_version <= existing.version {
                return Err(CryptoError::RollbackDetected);
            }
        }
        Ok(())
    }

    /// Remove a file entry
    pub fn remove(&mut self, filename: &str) -> Option<u64> {
        self.files.remove(filename).map(|e| e.offset)
    }

    /// Get list of all filenames
    pub fn files(&self) -> Vec<&str> {
        self.files.keys().map(|s| s.as_str()).collect()
    }

    /// Get number of files in index
    pub fn len(&self) -> usize {
        self.files.len()
    }

    /// Check if index is empty
    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }

    /// Get all file entries as iterator
    pub fn iter(&self) -> impl Iterator<Item = (&String, &FileEntry)> {
        self.files.iter()
    }
}

impl Default for VaultIndex {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_index_operations() {
        let mut index = VaultIndex::new();

        index.insert("file1.txt".to_string(), 1000);
        index.insert("file2.txt".to_string(), 2000);

        assert_eq!(index.lookup("file1.txt"), Some(1000));
        assert_eq!(index.lookup("file2.txt"), Some(2000));
        assert_eq!(index.lookup("file3.txt"), None);

        assert_eq!(index.len(), 2);

        let removed = index.remove("file1.txt");
        assert_eq!(removed, Some(1000));
        assert_eq!(index.len(), 1);
    }

    #[test]
    fn test_json_roundtrip() {
        let mut index = VaultIndex::new();
        index.insert("test.bin".to_string(), 4096);
        index.insert("data.json".to_string(), 8192);

        let json = index.to_json().expect("Serialization failed");
        let parsed = VaultIndex::from_json(&json).expect("Deserialization failed");

        assert_eq!(parsed.lookup("test.bin"), Some(4096));
        assert_eq!(parsed.lookup("data.json"), Some(8192));
    }

    #[test]
    fn test_legacy_json_compatibility() {
        // Legacy format: {"filename": offset_number}
        let legacy_json = br#"{"file1.txt": 1000, "file2.txt": 2000}"#;
        let index = VaultIndex::from_json(legacy_json).expect("Legacy parse failed");

        assert_eq!(index.lookup("file1.txt"), Some(1000));
        assert_eq!(index.lookup("file2.txt"), Some(2000));
        // Legacy entries should have no per-file key
        assert!(index
            .lookup_entry("file1.txt")
            .unwrap()
            .encrypted_file_key
            .is_none());
    }

    #[test]
    fn test_encrypted_index_roundtrip() {
        let master_key = [0x42u8; 32];
        let mut index = VaultIndex::new();
        index.insert("secret_file.txt".to_string(), 4096);
        index.insert_with_key("encrypted_file.bin".to_string(), 8192, vec![0xAA; 104]);

        let encrypted = index.encrypt(&master_key).expect("Encryption failed");

        // Encrypted blob should NOT contain plaintext filenames
        let encrypted_str = String::from_utf8_lossy(&encrypted);
        assert!(!encrypted_str.contains("secret_file.txt"));

        let decrypted = VaultIndex::decrypt(&master_key, &encrypted).expect("Decryption failed");
        assert_eq!(decrypted.lookup("secret_file.txt"), Some(4096));
        assert_eq!(decrypted.lookup("encrypted_file.bin"), Some(8192));
        assert!(decrypted
            .lookup_entry("encrypted_file.bin")
            .unwrap()
            .encrypted_file_key
            .is_some());
    }

    #[test]
    fn test_encrypted_index_wrong_key_fails() {
        let key1 = [0x42u8; 32];
        let key2 = [0x99u8; 32];
        let mut index = VaultIndex::new();
        index.insert("test.txt".to_string(), 1000);

        let encrypted = index.encrypt(&key1).unwrap();
        let result = VaultIndex::decrypt(&key2, &encrypted);
        assert!(result.is_err());
    }

    // ── V6: AD-bound index encrypt/decrypt (crypto-pr5) ──

    #[test]
    fn test_index_encrypt_with_ad_roundtrip() {
        let master_key = [0x42u8; 32];
        let mut index = VaultIndex::new();
        index.insert("secret.txt".to_string(), 4096);

        let ad = b"USBVault-index-v6:context-A";
        let encrypted = index.encrypt_with_ad(&master_key, ad).unwrap();
        let decrypted = VaultIndex::decrypt_with_ad(&master_key, &encrypted, ad).unwrap();
        assert_eq!(decrypted.lookup("secret.txt"), Some(4096));
    }

    #[test]
    fn test_index_decrypt_with_wrong_ad_fails() {
        let master_key = [0x42u8; 32];
        let mut index = VaultIndex::new();
        index.insert("secret.txt".to_string(), 4096);

        let encrypted = index.encrypt_with_ad(&master_key, b"ad-with-slot-0").unwrap();
        // Different active_slot / salt / version -> different AD -> tag fails.
        assert!(VaultIndex::decrypt_with_ad(&master_key, &encrypted, b"ad-with-slot-1").is_err());
    }

    #[test]
    fn test_index_ad_blob_not_openable_by_plain_decrypt() {
        let master_key = [0x42u8; 32];
        let mut index = VaultIndex::new();
        index.insert("secret.txt".to_string(), 4096);

        let encrypted = index.encrypt_with_ad(&master_key, b"some-ad").unwrap();
        // The plain (no-AD) decrypt cannot open an AD-bound blob.
        assert!(VaultIndex::decrypt(&master_key, &encrypted).is_err());
    }

    #[test]
    fn test_insert_with_per_file_key() {
        let mut index = VaultIndex::new();
        let fake_wrapped_key = vec![0xBB; 104];
        index.insert_with_key("file.dat".to_string(), 5000, fake_wrapped_key.clone());

        let entry = index.lookup_entry("file.dat").expect("Entry not found");
        assert_eq!(entry.offset, 5000);
        assert_eq!(entry.encrypted_file_key, Some(fake_wrapped_key));
    }

    // SG-012: Rollback protection tests

    #[test]
    fn test_version_auto_increment() {
        let mut index = VaultIndex::new();

        // First insert → version 1
        index.insert("file.txt".to_string(), 1000);
        assert_eq!(index.lookup_entry("file.txt").unwrap().version, 1);

        // Update same file → version 2
        index.insert("file.txt".to_string(), 2000);
        assert_eq!(index.lookup_entry("file.txt").unwrap().version, 2);

        // Another update → version 3
        index.insert("file.txt".to_string(), 3000);
        assert_eq!(index.lookup_entry("file.txt").unwrap().version, 3);
    }

    #[test]
    fn test_version_validation_rejects_rollback() {
        let mut index = VaultIndex::new();
        index.insert("file.txt".to_string(), 1000); // v1
        index.insert("file.txt".to_string(), 2000); // v2
        index.insert("file.txt".to_string(), 3000); // v3

        // Trying to apply v2 when we have v3 → reject
        assert!(index.validate_version("file.txt", 2).is_err());
        // Trying to apply v3 again → reject (must be strictly greater)
        assert!(index.validate_version("file.txt", 3).is_err());
        // v4 should succeed
        assert!(index.validate_version("file.txt", 4).is_ok());
    }

    #[test]
    fn test_legacy_entries_have_version_zero() {
        let legacy_json = br#"{"file1.txt": 1000}"#;
        let index = VaultIndex::from_json(legacy_json).expect("Legacy parse failed");
        // Legacy entries default to version 0
        assert_eq!(index.lookup_entry("file1.txt").unwrap().version, 0);
        // Validation should pass for any version when existing is 0
        assert!(index.validate_version("file1.txt", 1).is_ok());
    }

    #[test]
    fn test_version_json_roundtrip() {
        let mut index = VaultIndex::new();
        index.insert("file.txt".to_string(), 1000); // v1
        index.insert("file.txt".to_string(), 2000); // v2

        let json = index.to_json().expect("Serialization failed");
        let parsed = VaultIndex::from_json(&json).expect("Deserialization failed");
        assert_eq!(parsed.lookup_entry("file.txt").unwrap().version, 2);
    }
}
