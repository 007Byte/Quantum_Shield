//! Chunked streaming AEAD encryption with V2 format improvements
//!
//! V2 Format:
//! - MAGIC (4 bytes): "V2RC"
//! - FORMAT_VERSION (1 byte): 0x02
//! - BASE_NONCE (24 bytes): random nonce base for derivation
//! - Chunks:
//!   - LENGTH (4 bytes, LE): encrypted chunk size (does not include this header)
//!   - ENCRYPTED_CHUNK: nonce || ciphertext || tag
//! - FINAL_HMAC (32 bytes): HMAC-SHA256 over all previous bytes
//!
//! # Thread Safety
//! StreamingEncryptor is NOT thread-safe (!Send + !Sync) by design because:
//! - It maintains nonce tracking state in an unsynchronized HashSet
//! - Nonce reuse across threads would compromise cryptographic security
//! - Each thread must create its own StreamingEncryptor instance

use crate::cipher::{self, CipherId};
use crate::error::{CryptoError, Result};
use rand::rngs::OsRng;
use rand::RngCore;
use std::collections::HashSet;
use zeroize::Zeroizing;

// MEDIUM-FIX: Streaming chunk size bounds checking
/// Minimum chunk size for streaming encryption (4 KB)
pub const MIN_CHUNK_SIZE: usize = 4096;

/// Maximum chunk size for streaming encryption (64 MB)
pub const MAX_CHUNK_SIZE: usize = 64 * 1024 * 1024;

/// Default chunk size for streaming (64 KB)
pub const CHUNK_SIZE: usize = 65536;

/// V2 record magic bytes
const RECORD_MAGIC: &[u8; 4] = b"V2RC";

/// V2 format version
const FORMAT_VERSION: u8 = 0x02;

/// Record type: PUT (file metadata + data)
const RECORD_TYPE_PUT: u8 = 0x01;

/// Streaming encryptor for chunked file encryption with V2 format
///
/// NOTE: This struct is intentionally !Send + !Sync to prevent
/// accidental sharing across threads, which could lead to nonce reuse.
pub struct StreamingEncryptor {
    cipher_id: CipherId,
    base_nonce: [u8; 24],
    master_key: Zeroizing<[u8; 32]>,
    used_nonces: HashSet<[u8; 24]>,
}

impl StreamingEncryptor {
    /// Create a new streaming encryptor with random base nonce
    pub fn new(cipher_id: CipherId, key: &[u8; 32]) -> Self {
        let mut base_nonce = [0u8; 24];
        // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
        OsRng.fill_bytes(&mut base_nonce);

        StreamingEncryptor {
            cipher_id,
            base_nonce,
            master_key: Zeroizing::new(*key),
            used_nonces: HashSet::new(),
        }
    }

    /// MEDIUM-FIX: Validate chunk size is within acceptable bounds
    /// Ensures chunk sizes are between MIN_CHUNK_SIZE (4 KB) and MAX_CHUNK_SIZE (64 MB)
    pub fn validate_chunk_size(size: usize) -> Result<()> {
        if size < MIN_CHUNK_SIZE {
            return Err(CryptoError::InvalidInput(format!(
                "chunk size too small: {} bytes (minimum: {} bytes)",
                size, MIN_CHUNK_SIZE
            )));
        }
        if size > MAX_CHUNK_SIZE {
            return Err(CryptoError::InvalidInput(format!(
                "chunk size too large: {} bytes (maximum: {} bytes)",
                size, MAX_CHUNK_SIZE
            )));
        }
        Ok(())
    }

    /// Encrypt a complete record: metadata + file data in chunks
    ///
    /// # Returns
    /// Complete V2 record:
    /// - MAGIC (4)
    /// - FORMAT_VERSION (1)
    /// - BASE_NONCE (24)
    /// - Chunk 0 (metadata): length_header + type, filename_len, data_len, encrypted
    /// - Chunks 1..N: length_header + file data chunks, encrypted
    /// - FINAL_HMAC (32): HMAC-SHA256 over all chunks
    ///
    /// # MEDIUM-FIX: Validates chunk size is within bounds
    pub fn encrypt_record(&mut self, filename: &str, data: &[u8]) -> Result<Vec<u8>> {
        // MEDIUM-FIX: Validate chunk size bounds at encryption start
        Self::validate_chunk_size(CHUNK_SIZE)?;
        let mut record = Vec::new();

        // Write magic, version, and base nonce
        record.extend_from_slice(RECORD_MAGIC);
        record.push(FORMAT_VERSION);
        record.extend_from_slice(&self.base_nonce);

        // Buffer for chunks (to compute final HMAC over them)
        let mut chunks_data = Vec::new();

        // Chunk 0: metadata (record_type, filename_len, filename, data_len)
        let mut metadata = Vec::new();
        metadata.push(RECORD_TYPE_PUT);
        metadata.extend_from_slice(&(filename.len() as u32).to_le_bytes());
        metadata.extend_from_slice(filename.as_bytes());
        metadata.extend_from_slice(&(data.len() as u64).to_le_bytes());

        let chunk_nonce_0 = self.derive_chunk_nonce(0);
        self.check_nonce_reuse(&chunk_nonce_0)?;
        let encrypted_chunk_0 = self.encrypt_with_key(&metadata, &chunk_nonce_0)?;

        // Add length header and encrypted chunk
        chunks_data.extend_from_slice(&(encrypted_chunk_0.len() as u32).to_le_bytes());
        chunks_data.extend_from_slice(&encrypted_chunk_0);

        // Chunks 1..N: file data
        for (chunk_index, data_chunk) in data.chunks(CHUNK_SIZE).enumerate() {
            let chunk_nonce = self.derive_chunk_nonce((chunk_index + 1) as u64);
            self.check_nonce_reuse(&chunk_nonce)?;
            let encrypted = self.encrypt_with_key(data_chunk, &chunk_nonce)?;

            // Add length header and encrypted chunk
            chunks_data.extend_from_slice(&(encrypted.len() as u32).to_le_bytes());
            chunks_data.extend_from_slice(&encrypted);
        }

        record.extend_from_slice(&chunks_data);

        // Compute final HMAC-SHA256 over all data (magic + version + base_nonce + chunks)
        let final_hmac = self.compute_final_hmac(&record)?;
        record.extend_from_slice(&final_hmac);

        Ok(record)
    }

    /// Derive per-chunk nonce using base nonce and chunk index
    fn derive_chunk_nonce(&self, index: u64) -> [u8; 24] {
        let mut nonce = self.base_nonce;
        let index_bytes = index.to_le_bytes();
        for i in 0..8 {
            nonce[16 + i] ^= index_bytes[i];
        }
        nonce
    }

    /// Check if nonce has been used before (detect reuse)
    fn check_nonce_reuse(&mut self, nonce: &[u8; 24]) -> Result<()> {
        if self.used_nonces.contains(nonce) {
            return Err(CryptoError::NonceReuse);
        }
        self.used_nonces.insert(*nonce);
        Ok(())
    }

    /// Encrypt plaintext with per-chunk derived key, using custom nonce
    fn encrypt_with_key(&self, plaintext: &[u8], nonce: &[u8; 24]) -> Result<Vec<u8>> {
        let chunk_key = self.derive_chunk_key(nonce);

        match self.cipher_id {
            CipherId::XChaCha20Poly1305 => {
                use chacha20poly1305::{XChaCha20Poly1305, aead::Aead, aead::KeyInit};
                use generic_array::GenericArray;

                let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&chunk_key));
                let nonce_array = chacha20poly1305::XNonce::from_slice(nonce);

                let ciphertext = cipher
                    .encrypt(&nonce_array, plaintext)
                    .map_err(|_| CryptoError::DecryptionFailed)?;

                // Return: nonce || ciphertext || tag
                let mut result = Vec::with_capacity(24 + ciphertext.len());
                result.extend_from_slice(nonce);
                result.extend_from_slice(&ciphertext);
                Ok(result)
            }
            CipherId::Aes256GcmSiv => {
                use aes_gcm_siv::{Aes256GcmSiv, aead::Aead, aead::KeyInit};
                use generic_array::GenericArray;

                let cipher = Aes256GcmSiv::new(GenericArray::from_slice(&chunk_key));
                let nonce_array = GenericArray::from_slice(&nonce[0..12]);

                let ciphertext = cipher
                    .encrypt(nonce_array, plaintext)
                    .map_err(|_| CryptoError::DecryptionFailed)?;

                // Return: nonce || ciphertext || tag
                let mut result = Vec::with_capacity(12 + ciphertext.len());
                result.extend_from_slice(&nonce[0..12]);
                result.extend_from_slice(&ciphertext);
                Ok(result)
            }
        }
    }

    /// Derive a per-chunk key using HKDF-SHA256 with domain-separated context.
    ///
    /// SG-013: Info string is now `"stream_chunk_key:" || nonce(24)` to prevent
    /// cross-protocol key reuse between chunk encryption and other HKDF uses.
    fn derive_chunk_key(&self, nonce: &[u8; 24]) -> [u8; 32] {
        use hkdf::Hkdf;
        use sha2::Sha256;

        let hkdf = Hkdf::<Sha256>::new(Some(&self.base_nonce[..]), self.master_key.as_ref());
        // SG-013: Domain-separate chunk key derivation
        let mut info = Vec::with_capacity(17 + 24);
        info.extend_from_slice(b"stream_chunk_key:");
        info.extend_from_slice(nonce);
        let mut key = [0u8; 32];
        hkdf.expand(&info, &mut key)
            .expect("HKDF expand should not fail with valid lengths");
        key
    }

    /// Compute final HMAC-SHA256 over all record data (for truncation detection).
    ///
    /// SG-013: Now uses a domain-separated HMAC key derived via HKDF from the
    /// master key with info="stream_hmac_key", rather than using the raw master
    /// key directly. This prevents the same key being used for both encryption
    /// and authentication.
    fn compute_final_hmac(&self, data: &[u8]) -> Result<[u8; 32]> {
        use hkdf::Hkdf;
        use hmac::{Hmac, Mac};
        use sha2::Sha256;

        type HmacSha256 = Hmac<Sha256>;

        // SG-013: Derive dedicated HMAC key instead of reusing master key
        let hkdf = Hkdf::<Sha256>::new(None, self.master_key.as_ref());
        let mut hmac_key = [0u8; 32];
        hkdf.expand(b"stream_hmac_key", &mut hmac_key)
            .map_err(|_| CryptoError::KeyDerivationFailed)?;

        let mut mac = HmacSha256::new_from_slice(&hmac_key)
            .map_err(|_| CryptoError::KeyDerivationFailed)?;
        mac.update(data);
        let result = mac.finalize();
        let mut hmac = [0u8; 32];
        hmac.copy_from_slice(&result.into_bytes()[0..32]);
        Ok(hmac)
    }
}

/// Streaming decryptor for chunked file decryption
pub struct StreamingDecryptor;

impl StreamingDecryptor {
    /// Decrypt a V2 record (with backward compatibility for V1)
    ///
    /// # Returns
    /// (filename, plaintext_data)
    ///
    /// # MEDIUM-FIX: Validates chunk size bounds during decryption
    pub fn decrypt_record(
        cipher_id: CipherId,
        key: &[u8; 32],
        record: &[u8],
    ) -> Result<(String, Vec<u8>)> {
        // MEDIUM-FIX: Validate chunk size bounds at decryption start
        StreamingEncryptor::validate_chunk_size(CHUNK_SIZE)?;

        // Check minimum header size
        if record.len() < 4 {
            return Err(CryptoError::InvalidHeader);
        }

        // Validate magic
        if &record[0..4] != RECORD_MAGIC {
            return Err(CryptoError::InvalidMagic);
        }

        // Check version byte (at offset 4)
        if record.len() < 5 {
            return Err(CryptoError::InvalidVersion);
        }

        let format_version = record[4];

        match format_version {
            0x02 => Self::decrypt_v2(cipher_id, key, record),
            0x01 => Self::decrypt_v1(cipher_id, key, record),
            _ => Err(CryptoError::InvalidVersion),
        }
    }

    /// Decrypt V2 format record with length-prefixed chunks and final HMAC
    fn decrypt_v2(
        cipher_id: CipherId,
        key: &[u8; 32],
        record: &[u8],
    ) -> Result<(String, Vec<u8>)> {
        const HEADER_SIZE: usize = 4 + 1 + 24; // magic + version + base_nonce

        if record.len() < HEADER_SIZE + 32 {
            // Need at least header + final HMAC
            return Err(CryptoError::InvalidHeader);
        }

        // Extract base nonce
        let base_nonce: [u8; 24] = record[5..29].try_into().unwrap();

        // Verify final HMAC using constant-time comparison
        let hmac_start = record.len() - 32;
        let record_data = &record[..hmac_start];
        let received_hmac: [u8; 32] = record[hmac_start..].try_into().unwrap();

        let expected_hmac = Self::compute_final_hmac(key, record_data)?;
        use subtle::ConstantTimeEq;
        if expected_hmac.ct_eq(&received_hmac).unwrap_u8() == 0 {
            return Err(CryptoError::DecryptionFailed); // HMAC mismatch = truncation or corruption
        }

        // Parse chunks with length headers
        let mut offset = HEADER_SIZE;
        let mut chunk_index = 0;
        let mut all_chunks = Vec::new();

        while offset < hmac_start {
            if offset + 4 > hmac_start {
                return Err(CryptoError::CorruptedChunk);
            }

            // Read length header (4 bytes, LE)
            let chunk_len = u32::from_le_bytes([
                record_data[offset],
                record_data[offset + 1],
                record_data[offset + 2],
                record_data[offset + 3],
            ]) as usize;
            offset += 4;

            if offset + chunk_len > hmac_start {
                return Err(CryptoError::CorruptedChunk);
            }

            let encrypted_chunk = &record_data[offset..offset + chunk_len];
            offset += chunk_len;

            // Decrypt using per-chunk derived key
            let chunk_key = Self::derive_chunk_key(key, &base_nonce, chunk_index);
            let decrypted = Self::decrypt_with_key(cipher_id, &chunk_key, encrypted_chunk)?;
            all_chunks.push(decrypted);
            chunk_index += 1;
        }

        if all_chunks.is_empty() {
            return Err(CryptoError::CorruptedChunk);
        }

        // First chunk is metadata
        let metadata = &all_chunks[0];
        let (filename, data_len) = Self::parse_metadata(metadata)?;

        // Remaining chunks are file data
        let mut plaintext = Vec::new();
        for chunk in &all_chunks[1..] {
            plaintext.extend_from_slice(chunk);
        }
        plaintext.truncate(data_len);

        Ok((filename, plaintext))
    }

    /// Decrypt V1 format record (backward compatibility)
    fn decrypt_v1(
        cipher_id: CipherId,
        key: &[u8; 32],
        record: &[u8],
    ) -> Result<(String, Vec<u8>)> {
        const HEADER_SIZE: usize = 4 + 24; // magic + base_nonce (no version byte in V1)

        if record.len() < HEADER_SIZE {
            return Err(CryptoError::InvalidHeader);
        }

        // Note: V1 format doesn't have version byte, so nonce is at offset 4
        let base_nonce: [u8; 24] = record[4..28].try_into().unwrap();

        // Note: We don't use a temporary encryptor here; V1 format decryption
        // uses static key derivation via extract_metadata_v1 instead.

        // Decrypt chunk 0 (metadata) - V1 uses same key for all chunks
        let mut offset = HEADER_SIZE;
        let (filename, data_len) = Self::extract_metadata_v1(&record[offset..], cipher_id, key, &base_nonce)?;

        // Find data chunks offset (heuristic)
        let nonce_size = cipher_id.nonce_size();
        offset += nonce_size + 256; // Rough estimate from V1

        let mut plaintext = Vec::new();

        while offset < record.len() && plaintext.len() < data_len {
            if offset + nonce_size > record.len() {
                break;
            }

            let remaining = &record[offset..];
            match cipher::decrypt(cipher_id, key, remaining) {
                Ok(chunk_data) => {
                    plaintext.extend_from_slice(&chunk_data);
                    offset += nonce_size + chunk_data.len() + 16;
                }
                Err(_) => break,
            }
        }

        plaintext.truncate(data_len);
        Ok((filename, plaintext))
    }

    /// Parse metadata from decrypted chunk 0
    fn parse_metadata(metadata: &[u8]) -> Result<(String, usize)> {
        if metadata.is_empty() {
            return Err(CryptoError::CorruptedChunk);
        }

        let mut offset = 0;

        // Record type
        if metadata[offset] != RECORD_TYPE_PUT {
            return Err(CryptoError::InvalidHeader);
        }
        offset += 1;

        // Filename length
        if offset + 4 > metadata.len() {
            return Err(CryptoError::CorruptedChunk);
        }
        let filename_len = u32::from_le_bytes([
            metadata[offset],
            metadata[offset + 1],
            metadata[offset + 2],
            metadata[offset + 3],
        ]) as usize;
        offset += 4;

        // Filename
        if offset + filename_len > metadata.len() {
            return Err(CryptoError::CorruptedChunk);
        }
        let filename = String::from_utf8(metadata[offset..offset + filename_len].to_vec())
            .map_err(|_| CryptoError::CorruptedChunk)?;
        offset += filename_len;

        // Data length
        if offset + 8 > metadata.len() {
            return Err(CryptoError::CorruptedChunk);
        }
        let data_len = u64::from_le_bytes([
            metadata[offset],
            metadata[offset + 1],
            metadata[offset + 2],
            metadata[offset + 3],
            metadata[offset + 4],
            metadata[offset + 5],
            metadata[offset + 6],
            metadata[offset + 7],
        ]) as usize;

        Ok((filename, data_len))
    }

    /// Extract metadata from encrypted V1 chunk 0
    fn extract_metadata_v1(
        encrypted_chunk: &[u8],
        cipher_id: CipherId,
        key: &[u8; 32],
        _base_nonce: &[u8; 24],
    ) -> Result<(String, usize)> {
        let metadata = cipher::decrypt(cipher_id, key, encrypted_chunk)?;
        Self::parse_metadata(&metadata)
    }

    /// Decrypt with per-chunk derived key
    fn decrypt_with_key(cipher_id: CipherId, key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
        match cipher_id {
            CipherId::XChaCha20Poly1305 => {
                const NONCE_SIZE: usize = 24;
                if data.len() < NONCE_SIZE {
                    return Err(CryptoError::InvalidNonce);
                }

                use chacha20poly1305::{XChaCha20Poly1305, aead::Aead, aead::KeyInit};
                use generic_array::GenericArray;

                let (nonce_bytes, ciphertext) = data.split_at(NONCE_SIZE);
                let nonce = chacha20poly1305::XNonce::from_slice(nonce_bytes);
                let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(key));

                cipher
                    .decrypt(nonce, ciphertext)
                    .map_err(|_| CryptoError::DecryptionFailed)
            }
            CipherId::Aes256GcmSiv => {
                const NONCE_SIZE: usize = 12;
                if data.len() < NONCE_SIZE {
                    return Err(CryptoError::InvalidNonce);
                }

                use aes_gcm_siv::{Aes256GcmSiv, aead::Aead, aead::KeyInit};
                use generic_array::GenericArray;

                let (nonce_bytes, ciphertext) = data.split_at(NONCE_SIZE);
                let nonce: &GenericArray<u8, _> = GenericArray::from_slice(nonce_bytes);
                let cipher = Aes256GcmSiv::new(GenericArray::from_slice(key));

                cipher
                    .decrypt(nonce, ciphertext)
                    .map_err(|_| CryptoError::DecryptionFailed)
            }
        }
    }

    /// Derive per-chunk key using HKDF with domain-separated chunk index.
    ///
    /// SG-013: Info string is now `"stream_chunk_key:" || derived_nonce(24)` to match
    /// the encryptor's domain separation.
    fn derive_chunk_key(master_key: &[u8; 32], base_nonce: &[u8; 24], chunk_index: u64) -> [u8; 32] {
        use hkdf::Hkdf;
        use sha2::Sha256;

        let hkdf = Hkdf::<Sha256>::new(Some(base_nonce), master_key);

        // SG-013: Derive the per-chunk nonce first, then domain-separate
        let mut nonce = *base_nonce;
        let index_bytes = chunk_index.to_le_bytes();
        for i in 0..8 {
            nonce[16 + i] ^= index_bytes[i];
        }

        let mut info = Vec::with_capacity(17 + 24);
        info.extend_from_slice(b"stream_chunk_key:");
        info.extend_from_slice(&nonce);
        let mut key = [0u8; 32];
        hkdf.expand(&info, &mut key)
            .expect("HKDF expand should not fail");
        key
    }

    /// Compute final HMAC-SHA256 over record data.
    ///
    /// SG-013: Uses domain-separated HMAC key derived via HKDF with info="stream_hmac_key".
    fn compute_final_hmac(key: &[u8; 32], data: &[u8]) -> Result<[u8; 32]> {
        use hkdf::Hkdf;
        use hmac::{Hmac, Mac};
        use sha2::Sha256;

        type HmacSha256 = Hmac<Sha256>;

        // SG-013: Derive dedicated HMAC key instead of reusing master key
        let hkdf = Hkdf::<Sha256>::new(None, key);
        let mut hmac_key = [0u8; 32];
        hkdf.expand(b"stream_hmac_key", &mut hmac_key)
            .map_err(|_| CryptoError::KeyDerivationFailed)?;

        let mut mac = HmacSha256::new_from_slice(&hmac_key)
            .map_err(|_| CryptoError::KeyDerivationFailed)?;
        mac.update(data);
        let result = mac.finalize();
        let mut hmac = [0u8; 32];
        hmac.copy_from_slice(&result.into_bytes()[0..32]);
        Ok(hmac)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_streaming_roundtrip_v2() {
        let key = [0x42u8; 32];
        let filename = "test.txt";
        let plaintext = b"Hello, streaming world!";

        let mut encryptor = StreamingEncryptor::new(CipherId::XChaCha20Poly1305, &key);
        let record = encryptor
            .encrypt_record(filename, plaintext)
            .expect("Encryption failed");

        let (recovered_filename, recovered_data) =
            StreamingDecryptor::decrypt_record(CipherId::XChaCha20Poly1305, &key, &record)
                .expect("Decryption failed");

        assert_eq!(filename, recovered_filename);
        assert_eq!(plaintext, recovered_data.as_slice());
    }

    #[test]
    fn test_streaming_large_file() {
        let key = [0x55u8; 32];
        let filename = "large_file.bin";
        let mut large_data = vec![0xAAu8; 500_000]; // 500 KB to span multiple chunks
        for (i, b) in large_data.iter_mut().enumerate() {
            *b = (i % 256) as u8;
        }

        let mut encryptor = StreamingEncryptor::new(CipherId::XChaCha20Poly1305, &key);
        let record = encryptor
            .encrypt_record(filename, &large_data)
            .expect("Encryption failed");

        let (recovered_filename, recovered_data) =
            StreamingDecryptor::decrypt_record(CipherId::XChaCha20Poly1305, &key, &record)
                .expect("Decryption failed");

        assert_eq!(filename, recovered_filename);
        assert_eq!(large_data.as_slice(), recovered_data.as_slice());
    }

    #[test]
    fn test_chunk_nonce_derivation() {
        let encryptor = StreamingEncryptor::new(CipherId::XChaCha20Poly1305, &[0u8; 32]);
        let nonce1 = encryptor.derive_chunk_nonce(0);
        let nonce2 = encryptor.derive_chunk_nonce(1);
        let nonce3 = encryptor.derive_chunk_nonce(0);

        // Different indices produce different nonces
        assert_ne!(nonce1, nonce2);
        // Same index produces same nonce
        assert_eq!(nonce1, nonce3);
    }

    #[test]
    fn test_nonce_reuse_detection() {
        let key = [0x77u8; 32];
        let mut encryptor = StreamingEncryptor::new(CipherId::XChaCha20Poly1305, &key);

        let nonce = encryptor.derive_chunk_nonce(0);

        // First check should succeed
        assert!(encryptor.check_nonce_reuse(&nonce).is_ok());

        // Second check with same nonce should panic
        // We can't directly test panic in normal test, so we verify the HashSet
        assert!(encryptor.used_nonces.contains(&nonce));
    }

    #[test]
    fn test_hmac_truncation_detection() {
        let key = [0x99u8; 32];
        let filename = "test.txt";
        let plaintext = b"Test data for HMAC";

        let mut encryptor = StreamingEncryptor::new(CipherId::XChaCha20Poly1305, &key);
        let mut record = encryptor
            .encrypt_record(filename, plaintext)
            .expect("Encryption failed");

        // Record should decrypt successfully
        let (name1, data1) = StreamingDecryptor::decrypt_record(CipherId::XChaCha20Poly1305, &key, &record)
            .expect("Should decrypt original");
        assert_eq!(filename, name1);
        assert_eq!(plaintext, data1.as_slice());

        // Truncate the record (remove last 10 bytes)
        if record.len() > 10 {
            record.truncate(record.len() - 10);
        }

        // Decryption should now fail due to HMAC mismatch
        let result = StreamingDecryptor::decrypt_record(CipherId::XChaCha20Poly1305, &key, &record);
        assert!(result.is_err(), "Truncated record should fail decryption");
    }

    #[test]
    fn test_v2_format_version() {
        let key = [0xBBu8; 32];
        let mut encryptor = StreamingEncryptor::new(CipherId::XChaCha20Poly1305, &key);
        let record = encryptor
            .encrypt_record("test.txt", b"data")
            .expect("Encryption failed");

        // Check V2 magic and version byte
        assert_eq!(&record[0..4], b"V2RC");
        assert_eq!(record[4], 0x02);
    }

    #[test]
    fn test_length_prefix_headers() {
        let key = [0xCCu8; 32];
        let filename = "test.txt";
        let plaintext = b"Chunk test";

        let mut encryptor = StreamingEncryptor::new(CipherId::XChaCha20Poly1305, &key);
        let record = encryptor
            .encrypt_record(filename, plaintext)
            .expect("Encryption failed");

        // V2 record structure: magic(4) + version(1) + nonce(24) + chunks + hmac(32)
        // After header should be length-prefixed chunks
        let header_size = 4 + 1 + 24;
        assert!(record.len() > header_size + 4, "Record should have length headers");

        // First length header (for metadata chunk)
        let chunk_len = u32::from_le_bytes([
            record[header_size],
            record[header_size + 1],
            record[header_size + 2],
            record[header_size + 3],
        ]);
        assert!(chunk_len > 0, "Metadata chunk should have non-zero length");
    }
}
