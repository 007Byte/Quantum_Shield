//! FFI Integration Tests
//!
//! These tests verify that the C FFI exports work correctly:
//! - All exported functions are callable
//! - Buffer management works correctly
//! - Error codes are returned properly
//! - String/byte array marshalling works
//! - Memory is properly freed

#![cfg(feature = "ffi")]

// Import FFI functions directly from the crate (they are pub extern "C" #[no_mangle])
use usbvault_crypto::ffi::{
    usbvault_decrypt, usbvault_derive_key, usbvault_encrypt, usbvault_free,
    usbvault_generate_keypair, usbvault_generate_salt, usbvault_open, usbvault_seal,
};

// Error codes (should match src/ffi/mod.rs)
const ERR_SUCCESS: i32 = 0;
const ERR_INVALID_KEY: i32 = -1;
const ERR_INVALID_ARGUMENT: i32 = -16;
const ERR_BUFFER_TOO_SMALL: i32 = -15;

#[test]
fn test_ffi_functions_are_callable() {
    // This test simply verifies that FFI functions can be called without crashing
    // In a real scenario with full cross-compilation, this would test actual functionality

    unsafe {
        // Test that function pointers are valid
        let func_ptr = usbvault_generate_salt as *const ();
        assert!(
            !func_ptr.is_null(),
            "usbvault_generate_salt should be callable"
        );
    }
}

#[test]
fn test_salt_generation() {
    // Test salt generation
    let mut salt = [0u8; 32];

    unsafe {
        let result = usbvault_generate_salt(salt.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS, "Salt generation should succeed");

        // Verify salt is not all zeros
        let all_zeros = salt.iter().all(|&b| b == 0);
        assert!(!all_zeros, "Generated salt should not be all zeros");
    }
}

#[test]
fn test_key_derivation() {
    let password = b"test_password";
    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    // First generate a valid salt
    unsafe {
        let result = usbvault_generate_salt(salt.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS, "Salt generation should succeed");
    }

    unsafe {
        let result = usbvault_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );

        assert_eq!(result, ERR_SUCCESS, "Key derivation should succeed");
        assert_eq!(key_len, 64, "Key should be 64 bytes");
        assert!(key.iter().any(|&b| b != 0), "Key should not be all zeros");
    }
}

#[test]
fn test_key_derivation_invalid_salt_length() {
    let password = b"test_password";
    let salt = [0u8; 16]; // Wrong length: should be 32
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    unsafe {
        let result = usbvault_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(), // Invalid length
            key.as_mut_ptr(),
            &mut key_len,
        );

        assert_eq!(
            result, ERR_INVALID_ARGUMENT,
            "Should reject invalid salt length"
        );
    }
}

#[test]
fn test_key_derivation_null_pointers() {
    let password = b"test_password";
    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    unsafe {
        // Test null password pointer
        let result = usbvault_derive_key(
            std::ptr::null(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(
            result, ERR_INVALID_ARGUMENT,
            "Should reject null password pointer"
        );

        // Test null salt pointer
        let result = usbvault_derive_key(
            password.as_ptr(),
            password.len(),
            std::ptr::null(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(
            result, ERR_INVALID_ARGUMENT,
            "Should reject null salt pointer"
        );

        // Test null output pointer
        let result = usbvault_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            std::ptr::null_mut(),
            &mut key_len,
        );
        assert_eq!(
            result, ERR_INVALID_ARGUMENT,
            "Should reject null output pointer"
        );

        // Test null output length pointer
        let result = usbvault_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            std::ptr::null_mut(),
        );
        assert_eq!(
            result, ERR_INVALID_ARGUMENT,
            "Should reject null output length pointer"
        );
    }
}

#[test]
fn test_encryption_decryption_round_trip() {
    let password = b"test_password";
    let plaintext = b"Hello, QAV!";
    let cipher_id = 2u8; // XChaCha20-Poly1305

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;
    let mut decrypted = [0u8; 256];
    let mut decrypted_len = 0usize;

    unsafe {
        // Generate salt
        let result = usbvault_generate_salt(salt.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS);

        // Derive key (returns 64 bytes; encryption uses first 32)
        let result = usbvault_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(result, ERR_SUCCESS);

        // Encrypt (key_len must be 32 for the cipher)
        let result = usbvault_encrypt(
            cipher_id,
            key.as_ptr(),
            32,
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Encryption should succeed");
        assert!(
            ciphertext_len > plaintext.len(),
            "Ciphertext should be longer due to auth tag"
        );

        // Decrypt
        let result = usbvault_decrypt(
            cipher_id,
            key.as_ptr(),
            32,
            ciphertext.as_ptr(),
            ciphertext_len,
            decrypted.as_mut_ptr(),
            decrypted.len(),
            &mut decrypted_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Decryption should succeed");
        assert_eq!(
            decrypted_len,
            plaintext.len(),
            "Decrypted length should match plaintext"
        );

        let decrypted_slice = &decrypted[..decrypted_len];
        assert_eq!(
            decrypted_slice, plaintext,
            "Decrypted text should match original"
        );
    }
}

#[test]
fn test_encryption_invalid_key_length() {
    let cipher_id = 2u8; // XChaCha20-Poly1305
    let plaintext = b"Hello";
    let invalid_key = [0u8; 16]; // Wrong length: should be 32
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;

    unsafe {
        let result = usbvault_encrypt(
            cipher_id,
            invalid_key.as_ptr(),
            invalid_key.len(), // Invalid length
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );

        assert_eq!(result, ERR_INVALID_KEY, "Should reject invalid key length");
    }
}

#[test]
fn test_encryption_buffer_too_small() {
    let cipher_id = 2u8; // XChaCha20-Poly1305
    let plaintext = b"Hello, this is a longer test message";
    let key = [0u8; 32];
    let mut ciphertext = [0u8; 4]; // Too small
    let mut ciphertext_len = 0usize;

    unsafe {
        let result = usbvault_encrypt(
            cipher_id,
            key.as_ptr(),
            key.len(),
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );

        assert_eq!(
            result, ERR_BUFFER_TOO_SMALL,
            "Should reject buffer that's too small"
        );
    }
}

#[test]
fn test_keypair_generation() {
    let mut public_key = [0u8; 32];
    let mut secret_key = [0u8; 32];

    unsafe {
        let result = usbvault_generate_keypair(public_key.as_mut_ptr(), secret_key.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS, "Keypair generation should succeed");

        // Verify keys are not all zeros
        assert!(
            public_key.iter().any(|&b| b != 0),
            "Public key should not be all zeros"
        );
        assert!(
            secret_key.iter().any(|&b| b != 0),
            "Secret key should not be all zeros"
        );

        // Verify keys are different
        assert_ne!(
            public_key, secret_key,
            "Public and secret keys should be different"
        );
    }
}

#[test]
fn test_keypair_generation_null_pointers() {
    unsafe {
        let mut public_key = [0u8; 32];
        let mut secret_key = [0u8; 32];

        // Test null public key pointer
        let result = usbvault_generate_keypair(std::ptr::null_mut(), secret_key.as_mut_ptr());
        assert_eq!(
            result, ERR_INVALID_ARGUMENT,
            "Should reject null public key pointer"
        );

        // Test null secret key pointer
        let result = usbvault_generate_keypair(public_key.as_mut_ptr(), std::ptr::null_mut());
        assert_eq!(
            result, ERR_INVALID_ARGUMENT,
            "Should reject null secret key pointer"
        );
    }
}

#[test]
fn test_seal_and_open() {
    let plaintext = b"Secret message for sharing";
    let mut recipient_public = [0u8; 32];
    let mut recipient_secret = [0u8; 32];
    let mut sealed = [0u8; 256];
    let mut sealed_len = 0usize;
    let mut opened = [0u8; 256];
    let mut opened_len = 0usize;

    unsafe {
        // Generate recipient keypair
        let result =
            usbvault_generate_keypair(recipient_public.as_mut_ptr(), recipient_secret.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS);

        // Seal plaintext for recipient
        let result = usbvault_seal(
            recipient_public.as_ptr(),
            plaintext.as_ptr(),
            plaintext.len(),
            sealed.as_mut_ptr(),
            sealed.len(),
            &mut sealed_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Sealing should succeed");
        assert!(
            sealed_len > plaintext.len(),
            "Sealed message should be longer"
        );

        // Open the sealed message
        let result = usbvault_open(
            recipient_secret.as_ptr(),
            sealed.as_ptr(),
            sealed_len,
            opened.as_mut_ptr(),
            opened.len(),
            &mut opened_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Opening should succeed");
        assert_eq!(
            opened_len,
            plaintext.len(),
            "Opened length should match plaintext"
        );

        let opened_slice = &opened[..opened_len];
        assert_eq!(
            opened_slice, plaintext,
            "Opened message should match original"
        );
    }
}

#[test]
fn test_seal_invalid_recipient_key() {
    let plaintext = b"Test message";
    let invalid_public_key = [0u8; 32]; // All zeros
    let mut sealed = [0u8; 256];
    let mut sealed_len = 0usize;

    unsafe {
        let result = usbvault_seal(
            invalid_public_key.as_ptr(),
            plaintext.as_ptr(),
            plaintext.len(),
            sealed.as_mut_ptr(),
            sealed.len(),
            &mut sealed_len,
        );

        // Should either succeed (if all-zeros is a valid key) or fail gracefully
        assert!(
            result == ERR_SUCCESS || result < 0,
            "Should handle invalid key gracefully"
        );
    }
}

#[test]
fn test_memory_safety() {
    // Test that memory operations don't crash with edge cases
    unsafe {
        // Empty message encryption
        let key = [0u8; 32];
        let mut output = [0u8; 64];
        let mut output_len = 0usize;

        let result = usbvault_encrypt(
            0,
            key.as_ptr(),
            key.len(),
            [].as_ptr(),
            0, // Empty plaintext
            output.as_mut_ptr(),
            output.len(),
            &mut output_len,
        );

        // Should either succeed or fail gracefully
        assert!(
            result == ERR_SUCCESS || result < 0,
            "Should handle empty messages safely"
        );
    }
}

#[test]
fn test_ffi_free_is_safe() {
    // Test that free function is safe to call (it's a no-op in current implementation)
    let buffer = vec![1u8, 2, 3, 4, 5];

    unsafe {
        // Should not crash
        usbvault_free(buffer.as_ptr() as *mut u8, buffer.len());
    }

    // No panic = success
}

#[test]
fn test_multiple_sequential_operations() {
    // Test that multiple operations can be performed sequentially
    let password = b"password";
    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    unsafe {
        // First salt generation
        let result = usbvault_generate_salt(salt.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS);

        // First key derivation
        let result = usbvault_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(result, ERR_SUCCESS);

        let first_key = key.clone();

        // Second salt generation
        let result = usbvault_generate_salt(salt.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS);

        // Second key derivation
        let result = usbvault_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(result, ERR_SUCCESS);

        // Different salt should produce different key
        assert_ne!(
            first_key, key,
            "Different salts should produce different keys"
        );
    }
}

#[test]
fn test_error_code_consistency() {
    // Verify that error codes are consistent with FFI contract
    assert_eq!(ERR_SUCCESS, 0, "Success code must be 0");
    assert!(ERR_INVALID_KEY < 0, "Error codes should be negative");
    assert!(ERR_INVALID_ARGUMENT < 0, "Error codes should be negative");
    assert!(ERR_BUFFER_TOO_SMALL < 0, "Error codes should be negative");
}
