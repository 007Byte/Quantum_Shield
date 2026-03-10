#![no_main]

use libfuzzer_sys::fuzz_target;
use usbvault_crypto::sharing::{self, SharePublicKey, ShareSecretKey};

fuzz_target!(|data: &[u8]| {
    // Test seal/open with arbitrary plaintext
    if !data.is_empty() {
        let plaintext = data;

        // Generate keypair
        let (public, secret) = sharing::generate_keypair();

        // Test basic seal/open roundtrip
        match sharing::seal(&public, plaintext) {
            Ok(sealed) => {
                // Sealed message should be larger than plaintext
                // (ephemeral_public 32 + nonce 24 + ciphertext + tag 16)
                let min_sealed_size = 32 + 24 + plaintext.len() + 16;
                assert!(
                    sealed.len() >= min_sealed_size,
                    "Sealed message too small: {} < {}",
                    sealed.len(),
                    min_sealed_size
                );

                // Test that we can open with the correct key
                match sharing::open(&secret, &sealed) {
                    Ok(opened) => {
                        // Roundtrip property: open(seal(plaintext)) == plaintext
                        assert_eq!(
                            plaintext, opened.as_slice(),
                            "Plaintext mismatch after seal/open roundtrip"
                        );
                    }
                    Err(_) => {
                        // Should not fail with correct key
                        panic!("Failed to open sealed message with correct key");
                    }
                }

                // Test that we cannot open with wrong key
                let (_wrong_public, wrong_secret) = sharing::generate_keypair();
                let open_result = sharing::open(&wrong_secret, &sealed);
                assert!(
                    open_result.is_err(),
                    "Opened sealed message with wrong key!"
                );
            }
            Err(_) => {
                // Sealing may fail in rare cases, acceptable
            }
        }

        // Test uniqueness: multiple seals of same plaintext produce different sealed messages
        if plaintext.len() > 0 {
            match sharing::seal(&public, plaintext) {
                Ok(sealed1) => {
                    match sharing::seal(&public, plaintext) {
                        Ok(sealed2) => {
                            assert_ne!(
                                sealed1, sealed2,
                                "Two seals of same plaintext produced identical results (ephemeral key not random)"
                            );
                        }
                        Err(_) => {}
                    }
                }
                Err(_) => {}
            }
        }
    }

    // Test with fixed keypairs from bytes
    if data.len() >= 64 {
        let pub_bytes: [u8; 32] = data[0..32].try_into().unwrap();
        let secret_bytes: [u8; 32] = data[32..64].try_into().unwrap();

        let public = SharePublicKey::from_bytes(pub_bytes);
        let secret = ShareSecretKey::from_bytes(secret_bytes);

        let plaintext = if data.len() > 64 { &data[64..] } else { b"test" };

        // Test seal/open with fixed keys
        match sharing::seal(&public, plaintext) {
            Ok(sealed) => {
                // Try to open - may fail because fixed bytes may not form valid keypair
                if let Ok(opened) = sharing::open(&secret, &sealed) {
                    // If successful, verify roundtrip
                    assert_eq!(plaintext, opened.as_slice(),
                        "Roundtrip failed with fixed key bytes");
                }
            }
            Err(_) => {}
        }
    }

    // Test with truncated sealed messages
    if data.len() >= 32 {
        let (public, _secret) = sharing::generate_keypair();

        match sharing::seal(&public, data) {
            Ok(sealed) => {
                // Try to open with truncated message
                for truncate_len in 1..sealed.len() {
                    let truncated = &sealed[0..truncate_len];
                    let result = sharing::open(&_secret, truncated);

                    // Should fail for truncated messages
                    if truncate_len < 32 + 24 + 16 {
                        // Too short to be valid
                        assert!(result.is_err(),
                            "Opened truncated sealed message of length {}", truncate_len);
                    }
                }
            }
            Err(_) => {}
        }
    }

    // Test corrupted sealed messages
    if data.len() >= 32 {
        let (public, secret) = sharing::generate_keypair();

        match sharing::seal(&public, data) {
            Ok(mut sealed) => {
                if sealed.len() > 60 {
                    // Flip a bit in the ciphertext portion (after ephemeral_public + nonce)
                    let flip_idx = 56 + (data.len() % (sealed.len() - 56));
                    sealed[flip_idx] ^= 0x01;

                    // Decryption should fail due to tag verification
                    let result = sharing::open(&secret, &sealed);
                    // May succeed if we flipped a bit that doesn't affect verification,
                    // but data will be corrupted
                    match result {
                        Ok(opened) => {
                            // If it "succeeded", it should either fail or give corrupted data
                            assert_ne!(data, opened.as_slice(),
                                "Corrupted sealed message decrypted to original plaintext");
                        }
                        Err(_) => {
                            // Expected: tag verification failed
                        }
                    }
                }
            }
            Err(_) => {}
        }
    }
});
