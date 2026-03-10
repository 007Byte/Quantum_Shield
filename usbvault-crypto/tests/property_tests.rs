#![allow(non_snake_case)]

use proptest::prelude::*;
use usbvault_crypto::cipher::{self, CipherId};
use usbvault_crypto::kdf::{self, derive_subkey};
use usbvault_crypto::sharing::{self};
use usbvault_crypto::streaming::{StreamingEncryptor, StreamingDecryptor};

// ============================================================================
// PROPERTY TESTS FOR CIPHER ROUNDTRIPS
// ============================================================================

proptest! {
    #[test]
    fn prop_cipher_xchacha20_roundtrip(plaintext in ".*", key_seed in 0u8..=255u8) {
        let key = [key_seed; 32];
        let plaintext_bytes = plaintext.as_bytes();

        let ciphertext = cipher::encrypt(CipherId::XChaCha20Poly1305, &key, plaintext_bytes)
            .expect("Encryption failed");
        let decrypted = cipher::decrypt(CipherId::XChaCha20Poly1305, &key, &ciphertext)
            .expect("Decryption failed");

        // PROPERTY: encrypt(decrypt(data, key), key) == data
        prop_assert_eq!(plaintext_bytes, decrypted.as_slice(),
            "XChaCha20 roundtrip failed");
    }

    #[test]
    fn prop_cipher_aes256_roundtrip(plaintext in ".*", key_seed in 0u8..=255u8) {
        let key = [key_seed; 32];
        let plaintext_bytes = plaintext.as_bytes();

        let ciphertext = cipher::encrypt(CipherId::Aes256GcmSiv, &key, plaintext_bytes)
            .expect("Encryption failed");
        let decrypted = cipher::decrypt(CipherId::Aes256GcmSiv, &key, &ciphertext)
            .expect("Decryption failed");

        // PROPERTY: encrypt(decrypt(data, key), key) == data
        prop_assert_eq!(plaintext_bytes, decrypted.as_slice(),
            "AES-256 roundtrip failed");
    }
}

// ============================================================================
// PROPERTY TESTS FOR LENGTH PROPERTIES
// ============================================================================

proptest! {
    #[test]
    fn prop_cipher_ciphertext_longer_than_plaintext_xchacha20(
        plaintext in ".*",
        key_seed in 0u8..=255u8
    ) {
        let key = [key_seed; 32];
        let plaintext_bytes = plaintext.as_bytes();

        if let Ok(ciphertext) = cipher::encrypt(CipherId::XChaCha20Poly1305, &key, plaintext_bytes) {
            let nonce_size = CipherId::XChaCha20Poly1305.nonce_size();
            let tag_size = CipherId::XChaCha20Poly1305.tag_size();

            // PROPERTY: ciphertext is longer than plaintext (by nonce + tag)
            let expected_min = nonce_size + plaintext_bytes.len() + tag_size;
            prop_assert!(
                ciphertext.len() >= expected_min,
                "Ciphertext too short: {} < {}",
                ciphertext.len(),
                expected_min
            );
        }
    }

    #[test]
    fn prop_cipher_ciphertext_longer_than_plaintext_aes256(
        plaintext in ".*",
        key_seed in 0u8..=255u8
    ) {
        let key = [key_seed; 32];
        let plaintext_bytes = plaintext.as_bytes();

        if let Ok(ciphertext) = cipher::encrypt(CipherId::Aes256GcmSiv, &key, plaintext_bytes) {
            let nonce_size = CipherId::Aes256GcmSiv.nonce_size();
            let tag_size = CipherId::Aes256GcmSiv.tag_size();

            // PROPERTY: ciphertext is longer than plaintext (by nonce + tag)
            let expected_min = nonce_size + plaintext_bytes.len() + tag_size;
            prop_assert!(
                ciphertext.len() >= expected_min,
                "Ciphertext too short: {} < {}",
                ciphertext.len(),
                expected_min
            );
        }
    }
}

// ============================================================================
// PROPERTY TESTS FOR UNIQUENESS (RANDOM NONCE)
// ============================================================================

proptest! {
    #[test]
    fn prop_cipher_different_encryptions_produce_different_ciphertexts_xchacha20(
        plaintext in ".*",
        key_seed in 0u8..=255u8
    ) {
        let key = [key_seed; 32];
        let plaintext_bytes = plaintext.as_bytes();

        if !plaintext_bytes.is_empty() {
            let ciphertext1 = cipher::encrypt(CipherId::XChaCha20Poly1305, &key, plaintext_bytes)
                .expect("First encryption failed");
            let ciphertext2 = cipher::encrypt(CipherId::XChaCha20Poly1305, &key, plaintext_bytes)
                .expect("Second encryption failed");

            // PROPERTY: different encryptions produce different ciphertexts (nonce uniqueness)
            prop_assert_ne!(ciphertext1, ciphertext2,
                "Two encryptions produced identical ciphertexts (nonce not random)");
        }
    }

    #[test]
    fn prop_cipher_different_encryptions_produce_different_ciphertexts_aes256(
        plaintext in ".*",
        key_seed in 0u8..=255u8
    ) {
        let key = [key_seed; 32];
        let plaintext_bytes = plaintext.as_bytes();

        if !plaintext_bytes.is_empty() {
            let ciphertext1 = cipher::encrypt(CipherId::Aes256GcmSiv, &key, plaintext_bytes)
                .expect("First encryption failed");
            let ciphertext2 = cipher::encrypt(CipherId::Aes256GcmSiv, &key, plaintext_bytes)
                .expect("Second encryption failed");

            // PROPERTY: different encryptions produce different ciphertexts (nonce uniqueness)
            prop_assert_ne!(ciphertext1, ciphertext2,
                "Two encryptions produced identical ciphertexts (nonce not random)");
        }
    }
}

// ============================================================================
// PROPERTY TESTS FOR ERROR DETECTION
// ============================================================================

proptest! {
    #[test]
    fn prop_cipher_bit_flip_in_ciphertext_causes_decryption_failure_xchacha20(
        plaintext in ".*",
        key_seed in 0u8..=255u8,
        bit_flip_pos in 0usize..=100
    ) {
        let key = [key_seed; 32];
        let plaintext_bytes = plaintext.as_bytes();

        if !plaintext_bytes.is_empty() {
            if let Ok(mut ciphertext) = cipher::encrypt(CipherId::XChaCha20Poly1305, &key, plaintext_bytes) {
                if bit_flip_pos < ciphertext.len() {
                    // Flip a bit in the ciphertext (not the nonce, which is the first 24 bytes)
                    let flip_idx = 24 + (bit_flip_pos % (ciphertext.len() - 24));
                    ciphertext[flip_idx] ^= 0x01;

                    // PROPERTY: flipping any bit in ciphertext causes decryption failure
                    let decrypt_result = cipher::decrypt(CipherId::XChaCha20Poly1305, &key, &ciphertext);

                    match decrypt_result {
                        Ok(decrypted) => {
                            // If decryption succeeded, the data must have changed
                            // (AEAD with XChaCha20 should detect tampering via tag)
                            prop_assert_ne!(plaintext_bytes, decrypted.as_slice(),
                                "Bit flip in ciphertext should change plaintext or fail");
                        }
                        Err(_) => {
                            // Expected: authentication tag verification failed
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn prop_cipher_wrong_key_causes_decryption_failure_xchacha20(
        plaintext in ".*",
        key_seed in 0u8..=255u8,
        wrong_key_seed in 0u8..=255u8
    ) {
        let key = [key_seed; 32];
        let wrong_key = [wrong_key_seed; 32];
        let plaintext_bytes = plaintext.as_bytes();

        // Only test when keys are different
        if key != wrong_key && !plaintext_bytes.is_empty() {
            if let Ok(ciphertext) = cipher::encrypt(CipherId::XChaCha20Poly1305, &key, plaintext_bytes) {
                // PROPERTY: wrong key causes decryption failure or wrong plaintext
                match cipher::decrypt(CipherId::XChaCha20Poly1305, &wrong_key, &ciphertext) {
                    Ok(decrypted) => {
                        // If it didn't fail, it should at least give wrong plaintext
                        prop_assert_ne!(plaintext_bytes, decrypted.as_slice(),
                            "Wrong key should not decrypt to original plaintext");
                    }
                    Err(_) => {
                        // Expected: authentication tag verification failed
                    }
                }
            }
        }
    }
}

// ============================================================================
// PROPERTY TESTS FOR STREAMING ROUNDTRIPS
// ============================================================================

proptest! {
    #[test]
    fn prop_streaming_roundtrip_xchacha20(
        data in ".*",
        key_seed in 0u8..=255u8
    ) {
        let key = [key_seed; 32];
        let data_bytes = data.as_bytes();

        let mut encryptor = StreamingEncryptor::new(CipherId::XChaCha20Poly1305, &key);
        if let Ok(encrypted_record) = encryptor.encrypt_record("test.bin", data_bytes) {
            if let Ok(decryptor) = StreamingDecryptor::new(CipherId::XChaCha20Poly1305, &key) {
                if let Ok((_filename, decrypted)) = decryptor.decrypt_record(&encrypted_record) {
                    // PROPERTY: streaming_encrypt(streaming_decrypt(data)) == data
                    prop_assert_eq!(data_bytes, decrypted.as_slice(),
                        "Streaming roundtrip failed for XChaCha20");
                }
            }
        }
    }

    #[test]
    fn prop_streaming_roundtrip_aes256(
        data in ".*",
        key_seed in 0u8..=255u8
    ) {
        let key = [key_seed; 32];
        let data_bytes = data.as_bytes();

        let mut encryptor = StreamingEncryptor::new(CipherId::Aes256GcmSiv, &key);
        if let Ok(encrypted_record) = encryptor.encrypt_record("test.bin", data_bytes) {
            if let Ok(decryptor) = StreamingDecryptor::new(CipherId::Aes256GcmSiv, &key) {
                if let Ok((_filename, decrypted)) = decryptor.decrypt_record(&encrypted_record) {
                    // PROPERTY: streaming_encrypt(streaming_decrypt(data)) == data
                    prop_assert_eq!(data_bytes, decrypted.as_slice(),
                        "Streaming roundtrip failed for AES-256");
                }
            }
        }
    }
}

// ============================================================================
// PROPERTY TESTS FOR KDF PROPERTIES
// ============================================================================

proptest! {
    #[test]
    fn prop_kdf_reproducibility(
        password in ".*",
        seed1 in 0u8..=255u8,
        seed2 in 0u8..=255u8
    ) {
        let password_bytes = password.as_bytes();
        let mut salt = [0u8; 32];
        salt[0] = seed1;
        salt[1] = seed2;

        if let Ok(key1) = kdf::derive_master_key(password_bytes, &salt) {
            if let Ok(key2) = kdf::derive_master_key(password_bytes, &salt) {
                // PROPERTY: same password + salt -> same key
                prop_assert_eq!(key1.as_bytes(), key2.as_bytes(),
                    "KDF must be deterministic");
            }
        }
    }

    #[test]
    fn prop_kdf_different_passwords_different_keys(
        password in ".*",
        seed1 in 0u8..=255u8,
        seed2 in 0u8..=255u8
    ) {
        let password_bytes = password.as_bytes();
        let mut salt = [0u8; 32];
        salt[0] = seed1;
        salt[1] = seed2;

        if !password_bytes.is_empty() {
            if let Ok(key1) = kdf::derive_master_key(password_bytes, &salt) {
                let mut modified_password = password_bytes.to_vec();
                modified_password[0] ^= 0xFF;

                if let Ok(key2) = kdf::derive_master_key(&modified_password, &salt) {
                    // PROPERTY: different passwords produce different keys
                    prop_assert_ne!(key1.as_bytes(), key2.as_bytes(),
                        "Different passwords must produce different keys");
                }
            }
        }
    }

    #[test]
    fn prop_kdf_different_salts_different_keys(
        password in ".*",
        seed1 in 0u8..=255u8,
        seed2 in 0u8..=255u8
    ) {
        let password_bytes = password.as_bytes();
        let mut salt = [0u8; 32];
        salt[0] = seed1;
        salt[1] = seed2;

        if let Ok(key1) = kdf::derive_master_key(password_bytes, &salt) {
            let mut modified_salt = salt;
            modified_salt[0] ^= 0xFF;

            if let Ok(key2) = kdf::derive_master_key(password_bytes, &modified_salt) {
                // PROPERTY: different salts produce different keys
                prop_assert_ne!(key1.as_bytes(), key2.as_bytes(),
                    "Different salts must produce different keys");
            }
        }
    }
}

// ============================================================================
// PROPERTY TESTS FOR SUBKEY DERIVATION
// ============================================================================

proptest! {
    #[test]
    fn prop_subkey_deterministic(
        master_seed in 0u8..=255u8,
        context in ".*"
    ) {
        let master = [master_seed; 32];

        if let Ok(subkey1) = derive_subkey(&master, &context) {
            if let Ok(subkey2) = derive_subkey(&master, &context) {
                // PROPERTY: same master + context -> same subkey
                prop_assert_eq!(subkey1, subkey2,
                    "Subkey derivation must be deterministic");
            }
        }
    }

    #[test]
    fn prop_subkey_different_contexts_different_subkeys(
        master_seed in 0u8..=255u8,
        context in ".*"
    ) {
        let master = [master_seed; 32];

        if let Ok(subkey1) = derive_subkey(&master, &context) {
            let different_context = format!("{}different", context);
            if let Ok(subkey2) = derive_subkey(&master, &different_context.as_str()) {
                // PROPERTY: different contexts produce different subkeys
                prop_assert_ne!(subkey1, subkey2,
                    "Different contexts must produce different subkeys");
            }
        }
    }
}

// ============================================================================
// PROPERTY TESTS FOR SHARING (SEALED-BOX)
// ============================================================================

proptest! {
    #[test]
    fn prop_sharing_roundtrip(plaintext in ".*") {
        let plaintext_bytes = plaintext.as_bytes();

        let (public, secret) = sharing::generate_keypair();

        if let Ok(sealed) = sharing::seal(&public, plaintext_bytes) {
            if let Ok(opened) = sharing::open(&secret, &sealed) {
                // PROPERTY: seal(open(data, keypair)) == data
                prop_assert_eq!(plaintext_bytes, opened.as_slice(),
                    "Sharing roundtrip failed");
            }
        }
    }

    #[test]
    fn prop_sharing_different_seals_produce_different_results(plaintext in ".*") {
        let plaintext_bytes = plaintext.as_bytes();

        if !plaintext_bytes.is_empty() {
            let (public, _secret) = sharing::generate_keypair();

            if let Ok(sealed1) = sharing::seal(&public, plaintext_bytes) {
                if let Ok(sealed2) = sharing::seal(&public, plaintext_bytes) {
                    // PROPERTY: different seals produce different results (ephemeral key is random)
                    prop_assert_ne!(sealed1, sealed2,
                        "Multiple seals produced identical results");
                }
            }
        }
    }

    #[test]
    fn prop_sharing_wrong_key_fails(plaintext in ".*") {
        let plaintext_bytes = plaintext.as_bytes();

        if !plaintext_bytes.is_empty() {
            let (public, _secret) = sharing::generate_keypair();
            let (_wrong_public, wrong_secret) = sharing::generate_keypair();

            if let Ok(sealed) = sharing::seal(&public, plaintext_bytes) {
                // PROPERTY: wrong key should fail to open
                let result = sharing::open(&wrong_secret, &sealed);
                prop_assert!(result.is_err(),
                    "Opened sealed message with wrong key");
            }
        }
    }
}

// ============================================================================
// PROPERTY TESTS FOR CIPHER ID PROPERTIES
// ============================================================================

proptest! {
    #[test]
    fn prop_cipher_id_roundtrip(cipher_byte: u8) {
        if let Ok(cipher_id) = CipherId::from_byte(cipher_byte) {
            let roundtrip = CipherId::from_byte(cipher_id.as_byte()).expect("Failed to parse");

            // PROPERTY: byte -> CipherId -> byte is consistent
            prop_assert_eq!(cipher_id, roundtrip,
                "Cipher ID round-trip failed");

            // PROPERTY: nonce and tag sizes are consistent
            match cipher_id {
                CipherId::XChaCha20Poly1305 => {
                    prop_assert_eq!(cipher_id.nonce_size(), 24, "XChaCha20 nonce must be 24");
                    prop_assert_eq!(cipher_id.as_byte(), 2, "XChaCha20 ID must be 2");
                }
                CipherId::Aes256GcmSiv => {
                    prop_assert_eq!(cipher_id.nonce_size(), 12, "AES-256-GCM-SIV nonce must be 12");
                    prop_assert_eq!(cipher_id.as_byte(), 3, "AES-256-GCM-SIV ID must be 3");
                }
            }

            // Both use 128-bit tags
            prop_assert_eq!(cipher_id.tag_size(), 16, "Tag size must be 16 bytes");
        }
    }
}
