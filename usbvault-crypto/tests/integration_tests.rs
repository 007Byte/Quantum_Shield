//! Comprehensive integration tests for QAV crypto crate
//! Tests security-critical cryptographic operations

use usbvault_crypto::*;

// ============================================================================
// KDF Tests (Argon2id key derivation)
// ============================================================================

#[test]
fn test_kdf_output_size() {
    let password = b"test_password";
    let salt = [0x42u8; 32];

    let key = kdf::derive_master_key(password, &salt)
        .expect("Key derivation failed");

    assert_eq!(key.as_bytes().len(), 64);
    assert_eq!(key.encryption_key().len(), 32);
    assert_eq!(key.hmac_key().len(), 32);
}

#[test]
fn test_kdf_deterministic() {
    let password = b"test_password";
    let salt = [0x42u8; 32];

    let key1 = kdf::derive_master_key(password, &salt)
        .expect("Key derivation 1 failed");
    let key2 = kdf::derive_master_key(password, &salt)
        .expect("Key derivation 2 failed");

    assert_eq!(key1.as_bytes(), key2.as_bytes());
}

#[test]
fn test_kdf_different_salts_produce_different_keys() {
    let password = b"test_password";
    let salt1 = [0x42u8; 32];
    let salt2 = [0x99u8; 32];

    let key1 = kdf::derive_master_key(password, &salt1)
        .expect("Key derivation 1 failed");
    let key2 = kdf::derive_master_key(password, &salt2)
        .expect("Key derivation 2 failed");

    assert_ne!(key1.as_bytes(), key2.as_bytes());
}

#[test]
fn test_kdf_different_passwords_produce_different_keys() {
    let password1 = b"password_one";
    let password2 = b"password_two";
    let salt = [0x42u8; 32];

    let key1 = kdf::derive_master_key(password1, &salt)
        .expect("Key derivation 1 failed");
    let key2 = kdf::derive_master_key(password2, &salt)
        .expect("Key derivation 2 failed");

    assert_ne!(key1.as_bytes(), key2.as_bytes());
}

#[test]
fn test_kdf_empty_password() {
    let password = b"";
    let salt = [0x42u8; 32];

    let key = kdf::derive_master_key(password, &salt)
        .expect("Key derivation with empty password failed");

    assert_eq!(key.as_bytes().len(), 64);
}

#[test]
fn test_kdf_invalid_salt_size() {
    let password = b"password";
    let short_salt = [0x42u8; 16];

    let result = kdf::derive_master_key(password, &short_salt);
    assert!(result.is_err());
}

#[test]
fn test_kdf_derive_subkey() {
    let master = [0x42u8; 32];
    let info = "test_context";

    let subkey = kdf::derive_subkey(&master, info)
        .expect("Subkey derivation failed");

    assert_eq!(subkey.len(), 32);
}

#[test]
fn test_kdf_subkey_deterministic() {
    let master = [0x42u8; 32];
    let info = "test_context";

    let subkey1 = kdf::derive_subkey(&master, info)
        .expect("Subkey derivation 1 failed");
    let subkey2 = kdf::derive_subkey(&master, info)
        .expect("Subkey derivation 2 failed");

    assert_eq!(subkey1, subkey2);
}

#[test]
fn test_kdf_different_contexts_produce_different_subkeys() {
    let master = [0x42u8; 32];

    let subkey1 = kdf::derive_subkey(&master, "context_1")
        .expect("Subkey derivation 1 failed");
    let subkey2 = kdf::derive_subkey(&master, "context_2")
        .expect("Subkey derivation 2 failed");

    assert_ne!(subkey1, subkey2);
}

#[test]
fn test_kdf_generate_salt_randomness() {
    let salt1 = kdf::generate_salt();
    let salt2 = kdf::generate_salt();

    // Should be random (extremely unlikely to be the same)
    assert_ne!(salt1, salt2);
}

// ============================================================================
// Cipher Tests (XChaCha20-Poly1305 and AES-256-GCM-SIV)
// ============================================================================

#[test]
fn test_xchacha20_encrypt_decrypt_roundtrip() {
    let key = [0x42u8; 32];
    let plaintext = b"Hello, World!";

    let ciphertext = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encryption failed");
    let decrypted = cipher::decrypt(cipher::CipherId::XChaCha20Poly1305, &key, &ciphertext)
        .expect("Decryption failed");

    assert_eq!(plaintext, decrypted.as_slice());
}

#[test]
fn test_aes256_encrypt_decrypt_roundtrip() {
    let key = [0x42u8; 32];
    let plaintext = b"Hello, World!";

    let ciphertext = cipher::encrypt(cipher::CipherId::Aes256GcmSiv, &key, plaintext)
        .expect("Encryption failed");
    let decrypted = cipher::decrypt(cipher::CipherId::Aes256GcmSiv, &key, &ciphertext)
        .expect("Decryption failed");

    assert_eq!(plaintext, decrypted.as_slice());
}

#[test]
fn test_cipher_wrong_key_fails_decryption_xchacha20() {
    let key1 = [0x42u8; 32];
    let key2 = [0x99u8; 32];
    let plaintext = b"Secret message";

    let ciphertext = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key1, plaintext)
        .expect("Encryption failed");
    let result = cipher::decrypt(cipher::CipherId::XChaCha20Poly1305, &key2, &ciphertext);

    assert!(result.is_err());
}

#[test]
fn test_cipher_wrong_key_fails_decryption_aes256() {
    let key1 = [0x42u8; 32];
    let key2 = [0x99u8; 32];
    let plaintext = b"Secret message";

    let ciphertext = cipher::encrypt(cipher::CipherId::Aes256GcmSiv, &key1, plaintext)
        .expect("Encryption failed");
    let result = cipher::decrypt(cipher::CipherId::Aes256GcmSiv, &key2, &ciphertext);

    assert!(result.is_err());
}

#[test]
fn test_cipher_tampered_ciphertext_fails_xchacha20() {
    let key = [0x42u8; 32];
    let plaintext = b"Important data";

    let mut ciphertext = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encryption failed");

    // Tamper with ciphertext (skip nonce, tamper with actual ciphertext)
    if ciphertext.len() > 25 {
        ciphertext[25] ^= 0xFF;
    }

    let result = cipher::decrypt(cipher::CipherId::XChaCha20Poly1305, &key, &ciphertext);
    assert!(result.is_err());
}

#[test]
fn test_cipher_tampered_ciphertext_fails_aes256() {
    let key = [0x42u8; 32];
    let plaintext = b"Important data";

    let mut ciphertext = cipher::encrypt(cipher::CipherId::Aes256GcmSiv, &key, plaintext)
        .expect("Encryption failed");

    // Tamper with ciphertext (skip nonce, tamper with actual ciphertext)
    if ciphertext.len() > 13 {
        ciphertext[13] ^= 0xFF;
    }

    let result = cipher::decrypt(cipher::CipherId::Aes256GcmSiv, &key, &ciphertext);
    assert!(result.is_err());
}

#[test]
fn test_cipher_empty_plaintext_xchacha20() {
    let key = [0x42u8; 32];
    let plaintext = b"";

    let ciphertext = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encryption failed");
    let decrypted = cipher::decrypt(cipher::CipherId::XChaCha20Poly1305, &key, &ciphertext)
        .expect("Decryption failed");

    assert_eq!(plaintext, decrypted.as_slice());
}

#[test]
fn test_cipher_empty_plaintext_aes256() {
    let key = [0x42u8; 32];
    let plaintext = b"";

    let ciphertext = cipher::encrypt(cipher::CipherId::Aes256GcmSiv, &key, plaintext)
        .expect("Encryption failed");
    let decrypted = cipher::decrypt(cipher::CipherId::Aes256GcmSiv, &key, &ciphertext)
        .expect("Decryption failed");

    assert_eq!(plaintext, decrypted.as_slice());
}

#[test]
fn test_cipher_large_payload_xchacha20() {
    let key = [0x42u8; 32];
    let plaintext = vec![0x55u8; 1_000_000]; // 1 MB

    let ciphertext = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, &plaintext)
        .expect("Encryption failed");
    let decrypted = cipher::decrypt(cipher::CipherId::XChaCha20Poly1305, &key, &ciphertext)
        .expect("Decryption failed");

    assert_eq!(plaintext, decrypted);
}

#[test]
fn test_cipher_large_payload_aes256() {
    let key = [0x42u8; 32];
    let plaintext = vec![0x55u8; 1_000_000]; // 1 MB

    let ciphertext = cipher::encrypt(cipher::CipherId::Aes256GcmSiv, &key, &plaintext)
        .expect("Encryption failed");
    let decrypted = cipher::decrypt(cipher::CipherId::Aes256GcmSiv, &key, &ciphertext)
        .expect("Decryption failed");

    assert_eq!(plaintext, decrypted);
}

#[test]
fn test_cipher_different_encryptions_produce_different_ciphertexts() {
    let key = [0x42u8; 32];
    let plaintext = b"Same message";

    let ciphertext1 = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encryption 1 failed");
    let ciphertext2 = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encryption 2 failed");

    // Different random nonces should produce different ciphertexts
    assert_ne!(ciphertext1, ciphertext2);
}

#[test]
fn test_cipher_nonce_size_xchacha20() {
    let cipher_id = cipher::CipherId::XChaCha20Poly1305;
    assert_eq!(cipher_id.nonce_size(), 24);
}

#[test]
fn test_cipher_nonce_size_aes256() {
    let cipher_id = cipher::CipherId::Aes256GcmSiv;
    assert_eq!(cipher_id.nonce_size(), 12);
}

#[test]
fn test_cipher_tag_size() {
    let cipher_id1 = cipher::CipherId::XChaCha20Poly1305;
    let cipher_id2 = cipher::CipherId::Aes256GcmSiv;

    assert_eq!(cipher_id1.tag_size(), 16);
    assert_eq!(cipher_id2.tag_size(), 16);
}

// ============================================================================
// Sharing Tests (X25519 sealed box)
// ============================================================================

#[test]
fn test_sharing_keypair_generation() {
    let (public, secret) = sharing::generate_keypair();
    assert_eq!(public.as_bytes().len(), 32);
    assert_eq!(secret.as_bytes().len(), 32);
}

#[test]
fn test_sharing_keypairs_are_unique() {
    let (public1, _secret1) = sharing::generate_keypair();
    let (public2, _secret2) = sharing::generate_keypair();

    assert_ne!(public1.as_bytes(), public2.as_bytes());
}

#[test]
fn test_sharing_seal_open_roundtrip() {
    let plaintext = b"Secret message for sharing";

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(plaintext, opened.as_slice());
}

#[test]
fn test_sharing_cannot_open_with_wrong_key() {
    let plaintext = b"Only for Alice";

    let (alice_public, _alice_secret) = sharing::generate_keypair();
    let (_bob_public, bob_secret) = sharing::generate_keypair();

    let sealed = sharing::seal(&alice_public, plaintext).expect("Seal failed");
    let result = sharing::open(&bob_secret, &sealed);

    assert!(result.is_err(), "Bob should not be able to decrypt Alice's message");
}

#[test]
fn test_sharing_empty_message() {
    let plaintext = b"";

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(plaintext, opened.as_slice());
}

#[test]
fn test_sharing_large_message() {
    let plaintext = vec![0x55u8; 1_000_000]; // 1 MB

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, &plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(plaintext, opened);
}

#[test]
fn test_sharing_tampered_sealed_box_fails() {
    let plaintext = b"Sensitive data";

    let (public, secret) = sharing::generate_keypair();
    let mut sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Tamper with sealed box (skip ephemeral key and nonce)
    if sealed.len() > 60 {
        sealed[60] ^= 0xFF;
    }

    let result = sharing::open(&secret, &sealed);
    assert!(result.is_err(), "Tampered sealed box should fail");
}

#[test]
fn test_sharing_truncated_sealed_box_fails() {
    let plaintext = b"Sensitive data";

    let (public, secret) = sharing::generate_keypair();
    let mut sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Truncate sealed box
    if sealed.len() > 20 {
        sealed.truncate(sealed.len() - 20);
    }

    let result = sharing::open(&secret, &sealed);
    assert!(result.is_err(), "Truncated sealed box should fail");
}

// ============================================================================
// Vault Header Tests
// ============================================================================

#[test]
fn test_vault_header_v2_roundtrip() {
    let header = vault::VaultHeader {
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
    };

    let bytes = header.write();
    let parsed = vault::VaultHeader::read(&bytes)
        .expect("Failed to parse header");

    assert_eq!(parsed.version, 2);
    assert_eq!(parsed.salt, header.salt);
    assert_eq!(parsed.cipher_id, 2);
    assert_eq!(parsed.commit_counter, 42);
    assert_eq!(parsed.argon2_memory, 65536);
}

#[test]
fn test_vault_header_v3_with_identity_block() {
    let identity_data = b"identity_block_data".to_vec();

    let header = vault::VaultHeader {
        version: 3,
        kdf_hash_id: 1,
        cipher_id: 3,
        salt: [0x55u8; 32],
        verify_iv: [0x88u8; 24],
        verify_ciphertext: b"verify_ct".to_vec(),
        header_hmac: [0u8; 32],
        active_index_slot: 0,
        index1_offset: 16384,
        index1_length: 2048,
        index2_offset: 18432,
        index2_length: 2048,
        commit_counter: 100,
        argon2_memory: 131072,
        argon2_time: 4,
        argon2_parallelism: 8,
        identity_block: Some(identity_data.clone()),
        tfa_block: None,
        fail_counter_block: None,
    };

    let bytes = header.write();
    let parsed = vault::VaultHeader::read(&bytes)
        .expect("Failed to parse header");

    assert_eq!(parsed.version, 3);
    assert_eq!(parsed.identity_block, Some(identity_data));
    assert_eq!(parsed.cipher_id, 3);
}

#[test]
fn test_vault_header_invalid_magic() {
    let mut data = vec![0u8; 128];
    // Set invalid magic
    data[0..4].copy_from_slice(b"INVA");

    let result = vault::VaultHeader::read(&data);
    assert!(result.is_err());
}

// ============================================================================
// Vault Index Tests
// ============================================================================

#[test]
fn test_vault_index_insert_and_lookup() {
    let mut index = vault::VaultIndex::new();

    index.insert("file1.txt".to_string(), 1000);
    index.insert("file2.txt".to_string(), 2000);

    assert_eq!(index.lookup("file1.txt"), Some(1000));
    assert_eq!(index.lookup("file2.txt"), Some(2000));
    assert_eq!(index.lookup("nonexistent.txt"), None);
}

#[test]
fn test_vault_index_remove() {
    let mut index = vault::VaultIndex::new();

    index.insert("file1.txt".to_string(), 1000);
    index.insert("file2.txt".to_string(), 2000);

    assert_eq!(index.len(), 2);

    let removed = index.remove("file1.txt");
    assert_eq!(removed, Some(1000));
    assert_eq!(index.len(), 1);
}

#[test]
fn test_vault_index_json_roundtrip() {
    let mut index = vault::VaultIndex::new();
    index.insert("test.bin".to_string(), 4096);
    index.insert("data.json".to_string(), 8192);
    index.insert("archive.tar".to_string(), 16384);

    let json = index.to_json().expect("Serialization failed");
    let parsed = vault::VaultIndex::from_json(&json)
        .expect("Deserialization failed");

    assert_eq!(parsed.lookup("test.bin"), Some(4096));
    assert_eq!(parsed.lookup("data.json"), Some(8192));
    assert_eq!(parsed.lookup("archive.tar"), Some(16384));
}

#[test]
fn test_vault_index_is_empty() {
    let mut index = vault::VaultIndex::new();
    assert!(index.is_empty());

    index.insert("file.txt".to_string(), 1000);
    assert!(!index.is_empty());
}

// ============================================================================
// Memory Security Tests
// ============================================================================

#[test]
fn test_secure_zero() {
    let mut data = [1u8, 2, 3, 4, 5];
    memory::secure_zero(&mut data);
    assert!(data.iter().all(|&b| b == 0));
}
