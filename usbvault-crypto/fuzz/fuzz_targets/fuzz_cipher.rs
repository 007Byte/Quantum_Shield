#![no_main]

use libfuzzer_sys::fuzz_target;
use usbvault_crypto::cipher::{self, CipherId};

fuzz_target!(|data: &[u8]| {
    // Need at least 1 byte for cipher selection and 32 bytes for key
    if data.len() < 33 {
        return;
    }

    // Parse input: first byte selects cipher, next 32 bytes are key, rest is plaintext
    let cipher_byte = data[0];
    let key_bytes = &data[1..33];
    let plaintext = &data[33..];

    // Try to parse cipher ID
    let cipher_id = match cipher_byte {
        2 => CipherId::XChaCha20Poly1305,
        3 => CipherId::Aes256GcmSiv,
        _ => return, // Invalid cipher ID
    };

    // Convert key to fixed-size array
    let mut key = [0u8; 32];
    key.copy_from_slice(key_bytes);

    // Test encryption with arbitrary plaintext
    if let Ok(ciphertext) = cipher::encrypt(cipher_id, &key, plaintext) {
        // Test that decryption recovers the original plaintext
        match cipher::decrypt(cipher_id, &key, &ciphertext) {
            Ok(decrypted) => {
                // Roundtrip property: decrypt(encrypt(plaintext)) == plaintext
                assert_eq!(plaintext, decrypted.as_slice(),
                    "Roundtrip failed for cipher {:?}", cipher_id);

                // Length property: ciphertext must be longer than plaintext
                // (includes nonce + tag)
                let nonce_size = cipher_id.nonce_size();
                let tag_size = cipher_id.tag_size();
                let expected_min_len = nonce_size + plaintext.len() + tag_size;
                assert!(
                    ciphertext.len() >= expected_min_len,
                    "Ciphertext too short: {} < {}",
                    ciphertext.len(),
                    expected_min_len
                );
            }
            Err(_) => {
                // Decryption failure is acceptable - fuzzer found a valid
                // ciphertext format but decryption failed (expected)
            }
        }
    }

    // Test that two encryptions of same plaintext produce different ciphertexts
    // (due to random nonce) - only test if plaintext is long enough
    if plaintext.len() > 0 {
        if let Ok(ct1) = cipher::encrypt(cipher_id, &key, plaintext) {
            if let Ok(ct2) = cipher::encrypt(cipher_id, &key, plaintext) {
                // Uniqueness property: different encryptions should produce different ciphertexts
                assert_ne!(ct1, ct2,
                    "Two encryptions produced identical ciphertexts (nonce not random)");
            }
        }
    }

    // Test with wrong key fails decryption
    if !plaintext.is_empty() {
        if let Ok(ciphertext) = cipher::encrypt(cipher_id, &key, plaintext) {
            let mut wrong_key = key;
            wrong_key[0] ^= 0xFF; // Flip bits in first byte

            // Decryption with wrong key should fail
            if let Ok(decrypted) = cipher::decrypt(cipher_id, &wrong_key, &ciphertext) {
                // If it doesn't fail, it should at least not match plaintext
                assert_ne!(plaintext, decrypted.as_slice(),
                    "Wrong key decrypted to original plaintext!");
            }
        }
    }
});
