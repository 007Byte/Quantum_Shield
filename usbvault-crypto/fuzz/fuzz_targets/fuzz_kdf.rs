#![no_main]

use libfuzzer_sys::fuzz_target;
use usbvault_crypto::kdf::{self, derive_subkey};

fuzz_target!(|data: &[u8]| {
    // Need at least 32 bytes for a valid salt
    if data.len() < 32 {
        return;
    }

    // Parse input: first 32 bytes are salt, rest is password
    let salt = &data[0..32];
    let password = &data[32..];

    // Test derive_master_key with arbitrary password and valid salt
    match kdf::derive_master_key(password, salt) {
        Ok(master_key) => {
            // Properties that must hold for valid keys
            assert_eq!(master_key.as_bytes().len(), 64,
                "Master key must be exactly 64 bytes");
            assert_eq!(master_key.encryption_key().len(), 32,
                "Encryption key must be 32 bytes");
            assert_eq!(master_key.hmac_key().len(), 32,
                "HMAC key must be 32 bytes");

            // Test reproducibility: same password + salt -> same key
            if password.len() < 1000 { // Avoid very long passwords
                match kdf::derive_master_key(password, salt) {
                    Ok(master_key_2) => {
                        assert_eq!(
                            master_key.as_bytes(),
                            master_key_2.as_bytes(),
                            "Same password/salt must produce same key"
                        );
                    }
                    Err(_) => {}
                }
            }

            // Test subkey derivation from master key
            match derive_subkey(master_key.as_bytes(), "test_context") {
                Ok(subkey) => {
                    assert_eq!(subkey.len(), 32, "Subkey must be 32 bytes");

                    // Test that different contexts produce different subkeys
                    match derive_subkey(master_key.as_bytes(), "different_context") {
                        Ok(subkey_2) => {
                            assert_ne!(subkey, subkey_2,
                                "Different contexts must produce different subkeys");
                        }
                        Err(_) => {}
                    }
                }
                Err(_) => {}
            }
        }
        Err(_) => {
            // Password derivation may fail for some inputs (e.g., if password processing
            // has limits). This is acceptable.
        }
    }

    // Test invalid salt length
    if salt.len() != 32 {
        let invalid_salt = &data[0..std::cmp::min(16, data.len())];
        let result = kdf::derive_master_key(b"test_password", invalid_salt);
        assert!(result.is_err(), "Invalid salt length should be rejected");
    }

    // Test derive_subkey with arbitrary master key material
    let test_master = &data[0..std::cmp::min(64, data.len())];
    match derive_subkey(test_master, "context1") {
        Ok(subkey) => {
            assert_eq!(subkey.len(), 32, "Subkey must be 32 bytes");

            // Test that same master + context produces same subkey
            match derive_subkey(test_master, "context1") {
                Ok(subkey_2) => {
                    assert_eq!(subkey, subkey_2,
                        "Same master/context must produce same subkey");
                }
                Err(_) => {}
            }

            // Test that different contexts produce different subkeys
            match derive_subkey(test_master, "context2") {
                Ok(subkey_3) => {
                    assert_ne!(subkey, subkey_3,
                        "Different contexts must produce different subkeys");
                }
                Err(_) => {}
            }
        }
        Err(_) => {
            // Some master key lengths may be rejected, which is acceptable
        }
    }

    // Test that different passwords produce different keys
    if password.len() > 0 && password.len() < 1000 {
        if let Ok(key1) = kdf::derive_master_key(password, salt) {
            // Create a different password by flipping first byte
            let mut modified_password = password.to_vec();
            modified_password[0] ^= 0xFF;

            if let Ok(key2) = kdf::derive_master_key(&modified_password, salt) {
                assert_ne!(
                    key1.as_bytes(),
                    key2.as_bytes(),
                    "Different passwords must produce different keys"
                );
            }
        }
    }

    // Test that different salts produce different keys
    if salt.len() == 32 {
        if let Ok(key1) = kdf::derive_master_key(password, salt) {
            let mut modified_salt = salt.to_vec();
            modified_salt[0] ^= 0xFF;

            if let Ok(key2) = kdf::derive_master_key(password, &modified_salt) {
                assert_ne!(
                    key1.as_bytes(),
                    key2.as_bytes(),
                    "Different salts must produce different keys"
                );
            }
        }
    }
});
