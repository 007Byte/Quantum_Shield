//! Vault Lifecycle Integration Tests
//!
//! Tests the core crypto primitives end-to-end:
//!   header create/parse, encrypt/decrypt, streaming, TFA packing, memory

use usbvault_crypto::*;

// ════════════════════════════════════════════════════════════════
// KDF + HEADER LIFECYCLE
// ════════════════════════════════════════════════════════════════

#[test]
fn test_kdf_and_header_roundtrip() {
    let password = b"correct-horse-battery-staple-15ch";
    let salt = kdf::generate_salt();

    let master_key = kdf::derive_master_key(password, &salt).expect("KDF failed");

    // Output must be 64 bytes: 32 enc + 32 hmac
    assert_eq!(master_key.as_bytes().len(), 64);
    assert_eq!(master_key.encryption_key().len(), 32);
    assert_eq!(master_key.hmac_key().len(), 32);

    // Enc key and HMAC key must be different
    assert_ne!(master_key.encryption_key(), master_key.hmac_key());
}

#[test]
fn test_header_parse_write_parse() {
    // Build a minimal header manually, write it, parse it back
    let header = vault::header::VaultHeader {
        version: 4,
        kdf_hash_id: 2,
        cipher_id: 2, // XChaCha20
        salt: [0x42; 32],
        verify_iv: [0x11; 24],
        verify_ciphertext: vec![0xAA; 48],
        header_hmac: [0x00; 32],
        active_index_slot: 0,
        index1_offset: 24576,
        index1_length: 512,
        index2_offset: 25088,
        index2_length: 512,
        commit_counter: 1,
        argon2_memory: 65536,
        argon2_time: 3,
        argon2_parallelism: 4,
        identity_block: Some(b"{\"name\":\"Test Vault\"}".to_vec()),
        tfa_block: None,
        fail_counter_block: None,
        wrapped_mek: Some(vec![0xCC; 80]),
        state_version: 1,
        index_encrypted: true,
    };

    let bytes = header.write();
    assert_eq!(bytes.len(), vault::header::HEADER_SIZE_V4);
    assert_eq!(&bytes[0..8], b"USBVLT04");

    // Parse back
    let parsed = vault::header::VaultHeader::read(&bytes).expect("Header parse failed");

    assert_eq!(parsed.version, 4);
    assert_eq!(parsed.cipher_id, 2);
    assert_eq!(parsed.salt, [0x42; 32]);
    assert_eq!(parsed.argon2_memory, 65536);
    assert_eq!(parsed.argon2_time, 3);
    assert_eq!(parsed.argon2_parallelism, 4);
    assert_eq!(parsed.commit_counter, 1);
    assert_eq!(parsed.state_version, 1);
    assert!(parsed.identity_block.is_some());
    assert!(parsed.wrapped_mek.is_some());
    assert!(parsed.index_encrypted);
}

// ════════════════════════════════════════════════════════════════
// AEAD CIPHER ROUNDTRIPS
// ════════════════════════════════════════════════════════════════

#[test]
fn test_xchacha20_encrypt_decrypt() {
    let key = [0x42u8; 32];
    let plaintext = b"XChaCha20-Poly1305 test data for roundtrip";

    let ct = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encrypt failed");
    assert!(ct.len() > plaintext.len()); // nonce + ciphertext + tag

    let pt =
        cipher::decrypt(cipher::CipherId::XChaCha20Poly1305, &key, &ct).expect("Decrypt failed");
    assert_eq!(pt, plaintext);
}

#[test]
fn test_aes_gcm_siv_encrypt_decrypt() {
    let key = [0x42u8; 32];
    let plaintext = b"AES-256-GCM-SIV test data for roundtrip";

    let ct =
        cipher::encrypt(cipher::CipherId::Aes256GcmSiv, &key, plaintext).expect("Encrypt failed");

    let pt = cipher::decrypt(cipher::CipherId::Aes256GcmSiv, &key, &ct).expect("Decrypt failed");
    assert_eq!(pt, plaintext);
}

#[test]
fn test_wrong_key_fails_decryption() {
    let key = [0x42u8; 32];
    let wrong_key = [0x99u8; 32];
    let plaintext = b"Only the correct key should decrypt this";

    let ct = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encrypt failed");

    let result = cipher::decrypt(cipher::CipherId::XChaCha20Poly1305, &wrong_key, &ct);
    assert!(result.is_err(), "Wrong key must fail");
}

#[test]
fn test_tampered_ciphertext_fails() {
    let key = [0x42u8; 32];
    let plaintext = b"Tamper-evident data";

    let mut ct = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encrypt failed");

    // Flip a byte in the middle
    let mid = ct.len() / 2;
    ct[mid] ^= 0xFF;

    let result = cipher::decrypt(cipher::CipherId::XChaCha20Poly1305, &key, &ct);
    assert!(
        result.is_err(),
        "Tampered ciphertext must fail AEAD verification"
    );
}

// ════════════════════════════════════════════════════════════════
// STREAMING ENCRYPTION
// ════════════════════════════════════════════════════════════════

#[test]
fn test_streaming_small_file_roundtrip() {
    let key = [0x42u8; 32];
    let plaintext = b"Small file content for streaming test";

    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let encrypted = encryptor
        .encrypt_record("test.txt", plaintext)
        .expect("Encrypt failed");

    // Verify magic
    assert_eq!(&encrypted[0..4], b"V2RC");

    let (filename, data) = streaming::StreamingDecryptor::decrypt_record(
        cipher::CipherId::XChaCha20Poly1305,
        &key,
        &encrypted,
    )
    .expect("Decrypt failed");

    assert_eq!(filename, "test.txt");
    assert_eq!(data, plaintext);
}

#[test]
fn test_streaming_large_file_multi_chunk() {
    let key = [0x42u8; 32];
    let plaintext: Vec<u8> = (0..200_000).map(|i| (i % 256) as u8).collect();

    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let encrypted = encryptor
        .encrypt_record("large_file.bin", &plaintext)
        .expect("Encrypt failed");

    let (filename, data) = streaming::StreamingDecryptor::decrypt_record(
        cipher::CipherId::XChaCha20Poly1305,
        &key,
        &encrypted,
    )
    .expect("Decrypt failed");

    assert_eq!(filename, "large_file.bin");
    assert_eq!(data.len(), plaintext.len());
    assert_eq!(data, plaintext);
}

#[test]
fn test_streaming_tamper_detection() {
    let key = [0x42u8; 32];
    let plaintext = b"Tamper-evident streaming data";

    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let encrypted = encryptor
        .encrypt_record("tamper.txt", plaintext)
        .expect("Encrypt failed");

    // Tamper with data portion
    let mut tampered = encrypted.clone();
    let mid = tampered.len() / 2;
    tampered[mid] ^= 0xFF;

    let result = streaming::StreamingDecryptor::decrypt_record(
        cipher::CipherId::XChaCha20Poly1305,
        &key,
        &tampered,
    );
    assert!(result.is_err(), "Tampered stream must fail");
}

#[test]
fn test_streaming_wrong_key_fails() {
    let key = [0x42u8; 32];
    let wrong_key = [0x99u8; 32];

    let mut encryptor =
        streaming::StreamingEncryptor::new(cipher::CipherId::XChaCha20Poly1305, &key);
    let encrypted = encryptor
        .encrypt_record("secret.txt", b"secret")
        .expect("Encrypt failed");

    let result = streaming::StreamingDecryptor::decrypt_record(
        cipher::CipherId::XChaCha20Poly1305,
        &wrong_key,
        &encrypted,
    );
    assert!(result.is_err(), "Wrong key must fail streaming decryption");
}

// ════════════════════════════════════════════════════════════════
// TFA CREDENTIAL PACKING
// ════════════════════════════════════════════════════════════════

#[test]
fn test_tfa_block_full_lifecycle() {
    use vault::tfa::*;

    let block = TfaBlock {
        method: TfaMethod::Fido2,
        max_attempts: 5,
        fido2_salt: [0xAA; 32],
        recovery_blob: vec![0x01; 60],
        credentials: vec![
            TfaCredentialEntry {
                credential_id: vec![0x10; 64],
                aaguid: [0xBB; 16],
                label: "YubiKey 5 NFC".to_string(),
            },
            TfaCredentialEntry {
                credential_id: vec![0x20; 32],
                aaguid: [0xCC; 16],
                label: "Backup Key".to_string(),
            },
        ],
    };

    let packed = block.pack();
    let unpacked = TfaBlock::unpack(&packed).expect("Unpack failed");

    assert_eq!(unpacked.method, TfaMethod::Fido2);
    assert_eq!(unpacked.max_attempts, 5);
    assert_eq!(unpacked.fido2_salt, [0xAA; 32]);
    assert_eq!(unpacked.recovery_blob.len(), 60);
    assert_eq!(unpacked.credentials.len(), 2);
    assert_eq!(unpacked.credentials[0].label, "YubiKey 5 NFC");
    assert_eq!(unpacked.credentials[1].label, "Backup Key");
}

// ════════════════════════════════════════════════════════════════
// MEMORY SECURITY
// ════════════════════════════════════════════════════════════════

#[test]
fn test_secure_zero_clears_buffer() {
    let mut buf = vec![0xFFu8; 128];
    memory::secure_zero(&mut buf);
    assert!(buf.iter().all(|&b| b == 0));
}

#[test]
fn test_mlock_munlock_no_crash() {
    let data = [0u8; 4096];
    let _ = memory::mlock(data.as_ptr(), data.len());
    let _ = memory::munlock(data.as_ptr(), data.len());
    // No crash = pass
}

// ════════════════════════════════════════════════════════════════
// PQC HYBRID
// ════════════════════════════════════════════════════════════════

#[cfg(feature = "pqc")]
#[test]
fn test_pqc_hybrid_roundtrip() {
    let (pk, sk) = pqc::hybrid::generate_hybrid_keypair().expect("Keygen failed");
    let plaintext = b"Post-quantum protected message";

    let sealed = pqc::hybrid::hybrid_seal(&pk, plaintext).expect("Seal failed");
    let opened = pqc::hybrid::hybrid_open(&sk, &sealed).expect("Open failed");

    assert_eq!(opened, plaintext);
}

#[cfg(feature = "pqc")]
#[test]
fn test_pqc_wrong_key_rejected() {
    let (pk1, _sk1) = pqc::hybrid::generate_hybrid_keypair().expect("Keygen 1 failed");
    let (_pk2, sk2) = pqc::hybrid::generate_hybrid_keypair().expect("Keygen 2 failed");

    let sealed = pqc::hybrid::hybrid_seal(&pk1, b"secret").expect("Seal failed");
    assert!(pqc::hybrid::hybrid_open(&sk2, &sealed).is_err());
}
