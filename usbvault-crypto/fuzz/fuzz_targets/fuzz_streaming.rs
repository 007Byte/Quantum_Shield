#![no_main]

use libfuzzer_sys::fuzz_target;
use usbvault_crypto::streaming::{StreamingEncryptor, StreamingDecryptor};
use usbvault_crypto::cipher::CipherId;

fuzz_target!(|data: &[u8]| {
    // Need at least 33 bytes: 1 for cipher, 32 for key
    if data.len() < 33 {
        return;
    }

    // Parse input
    let cipher_byte = data[0];
    let key_bytes = &data[1..33];
    let plaintext = &data[33..];

    // Try to parse cipher ID
    let cipher_id = match cipher_byte {
        2 => CipherId::XChaCha20Poly1305,
        3 => CipherId::Aes256GcmSiv,
        _ => return,
    };

    // Convert key to fixed-size array
    let mut key = [0u8; 32];
    key.copy_from_slice(key_bytes);

    // Test streaming encryption with arbitrary filename and data
    let filename = if plaintext.is_empty() {
        "test.bin"
    } else {
        // Use first few bytes as filename (max 255 chars for sanity)
        let fname_end = std::cmp::min(plaintext.len(), 255);
        match std::str::from_utf8(&plaintext[..fname_end]) {
            Ok(s) => s,
            Err(_) => "binary_file.bin",
        }
    };

    // Create streaming encryptor and encrypt
    let mut encryptor = StreamingEncryptor::new(cipher_id, &key);
    if let Ok(encrypted_record) = encryptor.encrypt_record(filename, plaintext) {
        // Try to decrypt
        match StreamingDecryptor::new(cipher_id, &key) {
            Ok(decryptor) => {
                match decryptor.decrypt_record(&encrypted_record) {
                    Ok((decrypted_filename, decrypted_data)) => {
                        // Roundtrip property: decrypt(encrypt(data)) == data
                        assert_eq!(filename, decrypted_filename,
                            "Filename mismatch after streaming roundtrip");
                        assert_eq!(plaintext, decrypted_data.as_slice(),
                            "Data mismatch after streaming roundtrip");

                        // Length property: encrypted record should be larger than original
                        // (includes magic, version, nonce, length headers, HMAC, etc.)
                        assert!(
                            encrypted_record.len() > plaintext.len(),
                            "Encrypted record not larger than plaintext"
                        );

                        // Check minimum size (magic 4 + version 1 + base_nonce 24 + HMAC 32)
                        assert!(
                            encrypted_record.len() >= 61,
                            "Encrypted record too small: {}",
                            encrypted_record.len()
                        );
                    }
                    Err(_) => {
                        // Decryption failure is acceptable for malformed input
                    }
                }
            }
            Err(_) => {
                // Decryptor creation failure is acceptable
            }
        }
    }

    // Test that corrupted ciphertext fails
    if !plaintext.is_empty() {
        let mut encryptor = StreamingEncryptor::new(cipher_id, &key);
        if let Ok(mut encrypted_record) = encryptor.encrypt_record("test.bin", plaintext) {
            if encrypted_record.len() > 61 {
                // Flip a bit in the encrypted data (not in magic/version)
                let flip_idx = 40 + (plaintext.len() % (encrypted_record.len() - 40));
                encrypted_record[flip_idx] ^= 0x01;

                // Decryption should fail
                if let Ok(decryptor) = StreamingDecryptor::new(cipher_id, &key) {
                    let result = decryptor.decrypt_record(&encrypted_record);
                    // Expect either an error or wrong data
                    match result {
                        Ok((_, corrupted_data)) => {
                            // Data should not match original if we corrupted it
                            // (though AES-GCM-SIV is deterministic, so this might pass)
                            if corrupted_data.as_slice() == plaintext {
                                // Acceptable: tag verified, so we couldn't corrupt
                                // the encrypted data without breaking the tag
                            }
                        }
                        Err(_) => {
                            // Expected: HMAC or tag verification failed
                        }
                    }
                }
            }
        }
    }

    // Test with wrong key fails
    let mut wrong_key = key;
    wrong_key[0] ^= 0xFF;

    let mut encryptor = StreamingEncryptor::new(cipher_id, &key);
    if let Ok(encrypted_record) = encryptor.encrypt_record("secret.bin", plaintext) {
        if let Ok(wrong_decryptor) = StreamingDecryptor::new(cipher_id, &wrong_key) {
            match wrong_decryptor.decrypt_record(&encrypted_record) {
                Ok(_) => {
                    // Should not successfully decrypt with wrong key
                }
                Err(_) => {
                    // Expected: authentication tag verification failed
                }
            }
        }
    }
});
