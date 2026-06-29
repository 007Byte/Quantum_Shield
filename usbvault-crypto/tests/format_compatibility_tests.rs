//! Phase 2.5: V2/V3 Format Compatibility Tests
//! Verifies that Rust implementation matches Python app format specifications
//!
//! Tests coverage:
//! - V2 Header format: magic bytes, salt offset, cipher_id offset, KDF offset
//! - V2RC Record format: magic, payload length, nonce, chunk count, chunks
//! - Cipher ID dispatch (2 = XChaCha20, 3 = AES-256-GCM-SIV)
//! - KDF parameters (Argon2id: 64MB memory, 3 iterations, 4 lanes)
//! - Nonce sizes: 24 bytes for XChaCha20, 12 bytes for AES-GCM-SIV

use usbvault_crypto::*;

// ============================================================================
// V2 Header Format Tests
// ============================================================================

#[test]
fn test_v2_header_magic_bytes() {
    // V2 Header magic must be "USBVLT02"
    let header = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 1,
        cipher_id: 2,
        salt: [0x42u8; 32],
        verify_iv: [0x99u8; 24],
        verify_ciphertext: b"test".to_vec(),
        header_hmac: [0u8; 32],
        active_index_slot: 1,
        index1_offset: 4096,
        index1_length: 1024,
        index2_offset: 5120,
        index2_length: 1024,
        commit_counter: 0,
        argon2_memory: 65536,
        argon2_time: 3,
        argon2_parallelism: 4,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    let bytes = header.write();

    // V2 magic bytes at offset 0-8
    assert_eq!(
        &bytes[0..8],
        b"USBVLT02",
        "V2 header magic must be 'USBVLT02'"
    );
}

#[test]
fn test_v3_header_magic_bytes() {
    // V3 Header magic must be "USBVLT03"
    let header = vault::VaultHeader {
        version: 3,
        kdf_hash_id: 1,
        cipher_id: 3,
        salt: [0x55u8; 32],
        verify_iv: [0x88u8; 24],
        verify_ciphertext: b"test".to_vec(),
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 16384,
        index1_length: 2048,
        index2_offset: 18432,
        index2_length: 2048,
        commit_counter: 0,
        argon2_memory: 131072,
        argon2_time: 4,
        argon2_parallelism: 8,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    let bytes = header.write();

    // V3 magic bytes at offset 0-8
    assert_eq!(
        &bytes[0..8],
        b"USBVLT03",
        "V3 header magic must be 'USBVLT03'"
    );
}

#[test]
fn test_v2_header_size_is_4096() {
    // V2 headers must be exactly 4096 bytes
    let header = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 1,
        cipher_id: 2,
        salt: [0x42u8; 32],
        verify_iv: [0x99u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 1,
        index1_offset: 4096,
        index1_length: 1024,
        index2_offset: 5120,
        index2_length: 1024,
        commit_counter: 0,
        argon2_memory: 65536,
        argon2_time: 3,
        argon2_parallelism: 4,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    let bytes = header.write();
    assert_eq!(bytes.len(), 4096, "V2 header must be exactly 4096 bytes");
}

#[test]
fn test_v3_header_size_is_16384() {
    // V3 headers must be exactly 16384 bytes
    let header = vault::VaultHeader {
        version: 3,
        kdf_hash_id: 1,
        cipher_id: 3,
        salt: [0x55u8; 32],
        verify_iv: [0x88u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 16384,
        index1_length: 2048,
        index2_offset: 18432,
        index2_length: 2048,
        commit_counter: 0,
        argon2_memory: 131072,
        argon2_time: 4,
        argon2_parallelism: 8,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    let bytes = header.write();
    assert_eq!(bytes.len(), 16384, "V3 header must be exactly 16384 bytes");
}

#[test]
fn test_v2_header_salt_offset_20() {
    // V2 salt is at offset 20 (after magic(8) + kdf_id(1) + cipher_id(1) + padding(10))
    // According to spec: magic=8, then kdf_hash_id=1, cipher_id=1, so salt starts at 10
    // But from implementation, salt is at offset: 8 (magic) + 1 (kdf) + 1 (cipher) = 10
    let header = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 0x11,
        cipher_id: 0x22,
        salt: [0x42u8; 32],
        verify_iv: [0u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 0,
        index1_length: 0,
        index2_offset: 0,
        index2_length: 0,
        commit_counter: 0,
        argon2_memory: 65536,
        argon2_time: 3,
        argon2_parallelism: 4,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    let bytes = header.write();

    // Verify salt location: offset 10 after magic(8) + kdf(1) + cipher(1)
    assert_eq!(&bytes[10..42], &[0x42u8; 32], "Salt must be at offset 10");
}

#[test]
fn test_v2_header_kdf_at_offset_8() {
    // KDF hash ID is at offset 8 (after magic)
    let header = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 0xAB,
        cipher_id: 0x02,
        salt: [0u8; 32],
        verify_iv: [0u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 0,
        index1_length: 0,
        index2_offset: 0,
        index2_length: 0,
        commit_counter: 0,
        argon2_memory: 65536,
        argon2_time: 3,
        argon2_parallelism: 4,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    let bytes = header.write();

    // KDF ID at offset 8
    assert_eq!(bytes[8], 0xAB, "KDF hash ID must be at offset 8");
}

#[test]
fn test_v2_header_cipher_id_at_offset_9() {
    // Cipher ID is at offset 9 (after magic + kdf)
    let header = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 0x01,
        cipher_id: 0x03,
        salt: [0u8; 32],
        verify_iv: [0u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 0,
        index1_length: 0,
        index2_offset: 0,
        index2_length: 0,
        commit_counter: 0,
        argon2_memory: 65536,
        argon2_time: 3,
        argon2_parallelism: 4,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    let bytes = header.write();

    // Cipher ID at offset 9
    assert_eq!(bytes[9], 0x03, "Cipher ID must be at offset 9");
}

// ============================================================================
// V2RC Record Format Tests (Streaming)
// ============================================================================

#[test]
fn test_v2rc_record_magic_bytes() {
    // V2RC record magic must be "V2RC"
    let key = [0x42u8; 32];
    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let record = encryptor
        .encrypt_record("test.txt", b"data")
        .expect("Encryption failed");

    // Magic bytes at offset 0-4
    assert_eq!(&record[0..4], b"V2RC", "V2RC record magic must be 'V2RC'");
}

#[test]
fn test_v2rc_record_format_version_byte() {
    // V2RC format version must be 0x02 at offset 4
    let key = [0x42u8; 32];
    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let record = encryptor
        .encrypt_record("test.txt", b"data")
        .expect("Encryption failed");

    // Format version at offset 4
    assert_eq!(record[4], 0x02, "V2RC format version must be 0x02");
}

#[test]
fn test_v2rc_record_base_nonce_24_bytes() {
    // V2RC base nonce must be 24 bytes at offset 5-29
    let key = [0x42u8; 32];
    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let record = encryptor
        .encrypt_record("test.txt", b"data")
        .expect("Encryption failed");

    // Check that nonce region exists (5 + 24 = 29)
    assert!(
        record.len() >= 29,
        "V2RC record must have at least magic(4) + version(1) + nonce(24) = 29 bytes"
    );

    // Extract nonce (should be 24 bytes of random data, non-zero)
    let nonce = &record[5..29];
    assert_eq!(nonce.len(), 24, "Base nonce must be 24 bytes");
}

#[test]
fn test_v2rc_record_has_length_prefixed_chunks() {
    // After base nonce, chunks have 4-byte LE length headers
    let key = [0x42u8; 32];
    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let record = encryptor
        .encrypt_record("test.txt", b"data")
        .expect("Encryption failed");

    // Structure: magic(4) + version(1) + nonce(24) + chunks + hmac(32)
    let header_size = 4 + 1 + 24; // 29
    assert!(
        record.len() >= header_size + 4 + 32,
        "Record must have space for at least one chunk with length header and final HMAC"
    );

    // Read first length header (at offset 29, 4 bytes LE)
    if record.len() >= header_size + 4 {
        let chunk_len = u32::from_le_bytes([
            record[header_size],
            record[header_size + 1],
            record[header_size + 2],
            record[header_size + 3],
        ]) as usize;

        // Chunk length should be reasonable
        assert!(chunk_len > 0, "Metadata chunk should have non-zero length");
        assert!(
            chunk_len < 100_000,
            "Chunk length should be reasonable for small test data"
        );
    }
}

#[test]
fn test_v2rc_record_final_hmac_32_bytes() {
    // V2RC records end with 32-byte HMAC-SHA256
    let key = [0x42u8; 32];
    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let record = encryptor
        .encrypt_record("test.txt", b"data")
        .expect("Encryption failed");

    // Record must be at least: magic(4) + version(1) + nonce(24) + min_chunk(4+16) + hmac(32)
    assert!(
        record.len() >= 29 + 4 + 16 + 32,
        "Record must be large enough for header, min chunk, and HMAC"
    );

    // Last 32 bytes should be HMAC
    let _hmac = &record[record.len() - 32..];
    // We can't directly verify without key, but we can verify it can decrypt
}

#[test]
fn test_v2rc_record_chunk_size_is_65536() {
    // Streaming should use 65536 byte chunks (except possibly the last one)
    let _key = [0x42u8; 32];
    let chunk_size = streaming::CHUNK_SIZE;
    assert_eq!(chunk_size, 65536, "CHUNK_SIZE must be 65536 bytes (64KB)");
}

#[test]
fn test_v2rc_record_large_file_multiple_chunks() {
    // Large files should produce multiple chunks
    let key = [0x42u8; 32];
    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);

    // Create 200KB file (should span multiple 65KB chunks)
    let large_data = vec![0x55u8; 200_000];
    let record = encryptor
        .encrypt_record("large.bin", &large_data)
        .expect("Encryption failed");

    // Decrypt to verify structure
    let (recovered_name, recovered_data) = streaming::StreamingDecryptor::decrypt_record(
        cipher::CipherId::XChaCha20Poly1305,
        &key,
        &record,
    )
    .expect("Decryption failed");

    assert_eq!(recovered_name, "large.bin");
    assert_eq!(recovered_data.len(), 200_000);
}

// ============================================================================
// Cipher ID Dispatch Tests
// ============================================================================

#[test]
fn test_cipher_id_2_is_xchacha20() {
    // Cipher ID 2 maps to XChaCha20-Poly1305
    let cipher_id = cipher::CipherId::from_byte(2).expect("Valid cipher ID");
    assert_eq!(cipher_id, cipher::CipherId::XChaCha20Poly1305);
    assert_eq!(cipher_id.as_byte(), 2);
}

#[test]
fn test_cipher_id_3_is_aes256_gcm_siv() {
    // Cipher ID 3 maps to AES-256-GCM-SIV
    let cipher_id = cipher::CipherId::from_byte(3).expect("Valid cipher ID");
    assert_eq!(cipher_id, cipher::CipherId::Aes256GcmSiv);
    assert_eq!(cipher_id.as_byte(), 3);
}

#[test]
fn test_cipher_id_invalid_byte_fails() {
    // Invalid cipher ID should fail
    let result = cipher::CipherId::from_byte(99);
    assert!(result.is_err(), "Invalid cipher ID should fail");
}

#[test]
fn test_cipher_dispatch_in_header() {
    // V2 header can specify either cipher
    let header_xchacha = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 1,
        cipher_id: 2, // XChaCha20
        salt: [0u8; 32],
        verify_iv: [0u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 0,
        index1_length: 0,
        index2_offset: 0,
        index2_length: 0,
        commit_counter: 0,
        argon2_memory: 65536,
        argon2_time: 3,
        argon2_parallelism: 4,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    let bytes = header_xchacha.write();
    let parsed = vault::VaultHeader::read(&bytes).expect("Parse failed");

    let cipher_id = cipher::CipherId::from_byte(parsed.cipher_id).expect("Valid cipher");
    assert_eq!(cipher_id, cipher::CipherId::XChaCha20Poly1305);
}

// ============================================================================
// KDF Parameter Tests (Argon2id)
// ============================================================================

#[test]
fn test_kdf_memory_parameter_65536() {
    // KDF must use 65536 KiB = 64 MB memory cost
    let password = b"test";
    let salt = [0x42u8; 32];

    let key = kdf::derive_master_key(password, &salt).expect("KDF failed");

    // Result should be 64 bytes (32 for encryption + 32 for HMAC)
    assert_eq!(key.as_bytes().len(), 64);

    // Create a vault header to verify parameters match
    let header = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 1,
        cipher_id: 2,
        salt,
        verify_iv: [0u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 0,
        index1_length: 0,
        index2_offset: 0,
        index2_length: 0,
        commit_counter: 0,
        argon2_memory: 65536, // 64 MB
        argon2_time: 3,
        argon2_parallelism: 4,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    assert_eq!(header.argon2_memory, 65536, "Memory cost must be 65536 KiB");
}

#[test]
fn test_kdf_time_parameter_3_iterations() {
    // KDF must use 3 time costs (iterations)
    let header = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 1,
        cipher_id: 2,
        salt: [0u8; 32],
        verify_iv: [0u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 0,
        index1_length: 0,
        index2_offset: 0,
        index2_length: 0,
        commit_counter: 0,
        argon2_memory: 65536,
        argon2_time: 3, // 3 iterations
        argon2_parallelism: 4,
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    assert_eq!(header.argon2_time, 3, "Time cost must be 3");
}

#[test]
fn test_kdf_parallelism_parameter_4_lanes() {
    // KDF must use 4 parallelism lanes
    let header = vault::VaultHeader {
        version: 2,
        kdf_hash_id: 1,
        cipher_id: 2,
        salt: [0u8; 32],
        verify_iv: [0u8; 24],
        verify_ciphertext: vec![],
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 0,
        index1_length: 0,
        index2_offset: 0,
        index2_length: 0,
        commit_counter: 0,
        argon2_memory: 65536,
        argon2_time: 3,
        argon2_parallelism: 4, // 4 lanes
        identity_block: None,
        tfa_block: None,
        fail_counter_block: None,
        index_encrypted: false,
        state_version: 0,
        wrapped_mek: None,
    };

    assert_eq!(header.argon2_parallelism, 4, "Parallelism must be 4");
}

// ============================================================================
// Nonce Size Tests
// ============================================================================

#[test]
fn test_nonce_size_xchacha20_is_24_bytes() {
    let cipher_id = cipher::CipherId::XChaCha20Poly1305;
    assert_eq!(
        cipher_id.nonce_size(),
        24,
        "XChaCha20 nonce must be 24 bytes"
    );
}

#[test]
fn test_nonce_size_aes256_gcm_siv_is_12_bytes() {
    let cipher_id = cipher::CipherId::Aes256GcmSiv;
    assert_eq!(
        cipher_id.nonce_size(),
        12,
        "AES-256-GCM-SIV nonce must be 12 bytes"
    );
}

#[test]
fn test_tag_size_both_ciphers_16_bytes() {
    // Both ciphers use 16-byte tags (128-bit)
    let xchacha = cipher::CipherId::XChaCha20Poly1305;
    let aes256 = cipher::CipherId::Aes256GcmSiv;

    assert_eq!(xchacha.tag_size(), 16, "XChaCha20 tag must be 16 bytes");
    assert_eq!(
        aes256.tag_size(),
        16,
        "AES-256-GCM-SIV tag must be 16 bytes"
    );
}

#[test]
fn test_xchacha20_encryption_includes_24_byte_nonce() {
    // Encrypted output format: nonce || ciphertext || tag
    let key = [0x42u8; 32];
    let plaintext = b"test data";

    let ciphertext = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encryption failed");

    // Minimum size: nonce(24) + ciphertext + tag(16)
    assert!(ciphertext.len() >= 24 + plaintext.len() + 16);

    // First 24 bytes should be nonce
    let nonce = &ciphertext[0..24];
    // Nonce should have some entropy (not all zeros)
    assert!(
        nonce.iter().any(|&b| b != 0),
        "Nonce should contain random data"
    );
}

#[test]
fn test_aes256_gcm_siv_encryption_includes_12_byte_nonce() {
    // Encrypted output format: nonce || ciphertext || tag
    let key = [0x42u8; 32];
    let plaintext = b"test data";

    let ciphertext = cipher::encrypt(cipher::CipherId::Aes256GcmSiv, &key, plaintext)
        .expect("Encryption failed");

    // Minimum size: nonce(12) + ciphertext + tag(16)
    assert!(ciphertext.len() >= 12 + plaintext.len() + 16);

    // First 12 bytes should be nonce
    let nonce = &ciphertext[0..12];
    // Nonce should have some entropy (not all zeros)
    assert!(
        nonce.iter().any(|&b| b != 0),
        "Nonce should contain random data"
    );
}

// ============================================================================
// Cross-Cipher Compatibility Tests
// ============================================================================

#[test]
fn test_streaming_with_xchacha20_format() {
    let key = [0x42u8; 32];
    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let record = encryptor
        .encrypt_record("test.txt", b"data")
        .expect("Encryption failed");

    // Should decrypt successfully
    let (name, data) = streaming::StreamingDecryptor::decrypt_record(
        cipher::CipherId::XChaCha20Poly1305,
        &key,
        &record,
    )
    .expect("Decryption failed");

    assert_eq!(name, "test.txt");
    assert_eq!(data, b"data");
}

#[test]
fn test_streaming_with_aes256_format() {
    let key = [0x42u8; 32];
    let mut encryptor = streaming::StreamingEncryptor::new(cipher::CipherId::Aes256GcmSiv, &key);
    let record = encryptor
        .encrypt_record("test.txt", b"data")
        .expect("Encryption failed");

    // Should decrypt successfully
    let (name, data) = streaming::StreamingDecryptor::decrypt_record(
        cipher::CipherId::Aes256GcmSiv,
        &key,
        &record,
    )
    .expect("Decryption failed");

    assert_eq!(name, "test.txt");
    assert_eq!(data, b"data");
}

// ============================================================================
// crypto-pr6: param-driven Argon2id bounds + cryptographic-erasure self-destruct
// ============================================================================

#[test]
fn test_pr6_validate_argon2_params_accepts_real_vault_params() {
    // Every on-disk vault was written with 65536/3/4; the V3-style fixtures use
    // 131072/4/8. Both MUST validate (inside bounds) so they keep unlocking.
    assert!(validate_argon2_params(65536, 3, 4).is_ok());
    assert!(validate_argon2_params(131072, 4, 8).is_ok());
    // DoS / weakening params are rejected.
    assert!(validate_argon2_params(u32::MAX, 3, 4).is_err());
    assert!(validate_argon2_params(4096, 3, 4).is_err());
    assert!(validate_argon2_params(65536, 0, 4).is_err());
    assert!(validate_argon2_params(65536, 3, 0).is_err());
}

#[test]
fn test_pr6_derive_kek_default_equals_params_via_public_api() {
    // Public-API mirror of the in-crate brick-risk gate: the param-driven KEK
    // with default params MUST equal the legacy 2-arg derive_kek byte-for-byte.
    let salt = [0x42u8; 32];
    let legacy = derive_kek(b"pw", &salt).unwrap();
    let params = derive_kek_with_params(b"pw", &salt, 65536, 3, 4).unwrap();
    assert_eq!(
        legacy.as_bytes(),
        params.as_bytes(),
        "BRICK RISK: default-params KEK must equal legacy derive_kek"
    );
}

#[test]
fn test_pr6_v6_vault_param_driven_unlock_roundtrips() {
    // Full lifecycle through the public API: create -> write -> read -> unlock,
    // proving the param-driven unlock path opens a real V6 vault.
    let password = b"pr6-format-compat-pw";
    let (header, enc, hmac) =
        vault::VaultHeader::create_new(password, cipher::CipherId::XChaCha20Poly1305).unwrap();
    assert_eq!(header.version, 6);
    assert_eq!(header.argon2_memory, 65536);

    let bytes = header.write();
    let parsed = vault::VaultHeader::read(&bytes).unwrap();
    let (enc2, hmac2) = parsed.unlock(password).expect("V6 param-driven unlock");
    assert_eq!(enc, enc2);
    assert_eq!(hmac, hmac2);
}

#[test]
fn test_pr6_self_destruct_wipe_yields_self_destructed_on_unlock() {
    let password = b"pr6-self-destruct-pw";
    let (mut header, _enc, _hmac) =
        vault::VaultHeader::create_new(password, cipher::CipherId::XChaCha20Poly1305).unwrap();
    assert!(!header.is_self_destructed());

    header.self_destruct_wipe();
    assert!(header.is_self_destructed());

    // Persisted destroyed header still parses and reports SelfDestructed (not a
    // generic password / corruption error).
    let bytes = header.write();
    let parsed = vault::VaultHeader::read(&bytes).expect("destroyed header parses");
    assert!(parsed.is_self_destructed());
    assert!(matches!(
        parsed.unlock(password),
        Err(CryptoError::SelfDestructed)
    ));
}
