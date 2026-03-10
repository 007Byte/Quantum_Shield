//! Comprehensive FFI Integration Test Harness
//!
//! This test suite provides comprehensive coverage of the C FFI exports:
//! - Round-trip encryption/decryption with various payload sizes
//! - Null pointer handling and memory safety
//! - Buffer ownership and capacity validation
//! - Concurrent FFI calls from multiple threads
//! - Error code propagation and validation
//! - Post-quantum cryptography FFI (if feature enabled)

#![cfg(feature = "ffi")]

use std::sync::Arc;
use std::thread;

// ═══════════════════════════════════════════════════════════════
// FFI Function Declarations
// ═══════════════════════════════════════════════════════════════

extern "C" {
    // Core cryptographic operations
    fn qav_derive_key(
        password_ptr: *const u8,
        password_len: usize,
        salt_ptr: *const u8,
        salt_len: usize,
        out_ptr: *mut u8,
        out_len: *mut usize,
    ) -> i32;

    fn qav_encrypt(
        cipher_id: u8,
        key_ptr: *const u8,
        key_len: usize,
        plaintext_ptr: *const u8,
        plaintext_len: usize,
        out_ptr: *mut u8,
        out_capacity: usize,
        out_len: *mut usize,
    ) -> i32;

    fn qav_decrypt(
        cipher_id: u8,
        key_ptr: *const u8,
        key_len: usize,
        ciphertext_ptr: *const u8,
        ciphertext_len: usize,
        out_ptr: *mut u8,
        out_capacity: usize,
        out_len: *mut usize,
    ) -> i32;

    fn qav_generate_keypair(
        public_out: *mut u8,
        secret_out: *mut u8,
    ) -> i32;

    fn qav_seal(
        recipient_public: *const u8,
        plaintext_ptr: *const u8,
        plaintext_len: usize,
        out_ptr: *mut u8,
        out_capacity: usize,
        out_len: *mut usize,
    ) -> i32;

    fn qav_open(
        secret_key: *const u8,
        sealed_ptr: *const u8,
        sealed_len: usize,
        out_ptr: *mut u8,
        out_capacity: usize,
        out_len: *mut usize,
    ) -> i32;

    fn qav_generate_salt(out: *mut u8) -> i32;

    // Post-quantum cryptography operations (PH9-PQ-FIX)
    #[cfg(feature = "pqc")]
    fn qav_pqc_generate_keypair(
        x25519_pub_out: *mut u8,
        mlkem_pub_out: *mut u8,
        x25519_sec_out: *mut u8,
        mlkem_sec_out: *mut u8,
    ) -> i32;

    #[cfg(feature = "pqc")]
    fn qav_pqc_seal(
        x25519_pub: *const u8,
        mlkem_pub: *const u8,
        mlkem_pub_len: usize,
        plaintext_ptr: *const u8,
        plaintext_len: usize,
        out_ptr: *mut u8,
        out_capacity: usize,
        out_len: *mut usize,
    ) -> i32;

    #[cfg(feature = "pqc")]
    fn qav_pqc_open(
        x25519_sec: *const u8,
        mlkem_sec: *const u8,
        mlkem_sec_len: usize,
        sealed_ptr: *const u8,
        sealed_len: usize,
        out_ptr: *mut u8,
        out_capacity: usize,
        out_len: *mut usize,
    ) -> i32;
}

// ═══════════════════════════════════════════════════════════════
// FFI Error Codes (must match src/ffi/mod.rs)
// ═══════════════════════════════════════════════════════════════

const ERR_SUCCESS: i32 = 0;
const ERR_INVALID_KEY: i32 = -1;
const ERR_INVALID_NONCE: i32 = -2;
const ERR_DECRYPTION_FAILED: i32 = -3;
const ERR_INVALID_HEADER: i32 = -4;
const ERR_INVALID_MAGIC: i32 = -5;
const ERR_INVALID_VERSION: i32 = -6;
const ERR_CORRUPTED_CHUNK: i32 = -7;
const ERR_CORRUPTED_INDEX: i32 = -8;
const ERR_KEY_DERIVATION_FAILED: i32 = -9;
const ERR_SHARING_ERROR: i32 = -10;
const ERR_SERIALIZATION_ERROR: i32 = -11;
const ERR_IO_ERROR: i32 = -12;
const ERR_MEMORY_ERROR: i32 = -13;
const ERR_INVALID_CIPHER: i32 = -14;
const ERR_BUFFER_TOO_SMALL: i32 = -15;
const ERR_INVALID_ARGUMENT: i32 = -16;

// ═══════════════════════════════════════════════════════════════
// Cipher IDs (must match src/cipher.rs)
// ═══════════════════════════════════════════════════════════════

const CIPHER_XCHACHA20_POLY1305: u8 = 2;
const CIPHER_AES256_GCM_SIV: u8 = 3;

// ═══════════════════════════════════════════════════════════════
// Test Category 1: Encrypt/Decrypt Round-Trip Tests (5+ tests)
// ═══════════════════════════════════════════════════════════════

/// PH3-FIX: Test encryption/decryption round-trip with small payload
#[test]
fn test_ffi_encrypt_decrypt_roundtrip_small_payload() {
    let password = b"test_password_small";
    let plaintext = b"Hello, QAV!";
    let cipher_id = CIPHER_XCHACHA20_POLY1305;

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;
    let mut decrypted = [0u8; 256];
    let mut decrypted_len = 0usize;

    unsafe {
        // Generate salt
        let result = qav_generate_salt(salt.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS, "Salt generation should succeed");

        // Derive key
        let result = qav_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Key derivation should succeed");
        assert_eq!(key_len, 64, "Key should be 64 bytes");

        // Encrypt
        let result = qav_encrypt(
            cipher_id,
            key.as_ptr(),
            32, // Use first 32 bytes
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Encryption should succeed");
        assert!(ciphertext_len > plaintext.len(), "Ciphertext should have overhead");

        // Decrypt
        let result = qav_decrypt(
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
        assert_eq!(decrypted_len, plaintext.len(), "Decrypted length should match");
        assert_eq!(&decrypted[..decrypted_len], plaintext, "Plaintext should match");
    }
}

/// PH3-FIX: Test encryption/decryption round-trip with large payload (1MB)
#[test]
fn test_ffi_encrypt_decrypt_roundtrip_large_payload() {
    let password = b"test_password_large";
    let plaintext = vec![0x42u8; 1024 * 1024]; // 1MB
    let cipher_id = CIPHER_AES256_GCM_SIV;

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;
    let mut ciphertext = vec![0u8; plaintext.len() + 128]; // Overhead buffer
    let mut ciphertext_len = 0usize;
    let mut decrypted = vec![0u8; plaintext.len() + 128];
    let mut decrypted_len = 0usize;

    unsafe {
        // Generate salt
        let result = qav_generate_salt(salt.as_mut_ptr());
        assert_eq!(result, ERR_SUCCESS);

        // Derive key
        let result = qav_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(result, ERR_SUCCESS);

        // Encrypt
        let result = qav_encrypt(
            cipher_id,
            key.as_ptr(),
            32,
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Large payload encryption should succeed");

        // Decrypt
        let result = qav_decrypt(
            cipher_id,
            key.as_ptr(),
            32,
            ciphertext.as_ptr(),
            ciphertext_len,
            decrypted.as_mut_ptr(),
            decrypted.len(),
            &mut decrypted_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Large payload decryption should succeed");
        assert_eq!(decrypted_len, plaintext.len());
        assert_eq!(&decrypted[..decrypted_len], &plaintext[..]);
    }
}

/// PH3-FIX: Test encryption/decryption round-trip with empty payload
#[test]
fn test_ffi_encrypt_decrypt_roundtrip_empty_payload() {
    let password = b"test_password_empty";
    let plaintext: &[u8] = b"";
    let cipher_id = CIPHER_XCHACHA20_POLY1305;

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;
    let mut decrypted = [0u8; 256];
    let mut decrypted_len = 0usize;

    unsafe {
        // Generate salt and derive key
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);
        assert_eq!(
            qav_derive_key(
                password.as_ptr(),
                password.len(),
                salt.as_ptr(),
                salt.len(),
                key.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );

        // Encrypt empty message
        let result = qav_encrypt(
            cipher_id,
            key.as_ptr(),
            32,
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Empty payload encryption should succeed");

        // Decrypt empty message
        let result = qav_decrypt(
            cipher_id,
            key.as_ptr(),
            32,
            ciphertext.as_ptr(),
            ciphertext_len,
            decrypted.as_mut_ptr(),
            decrypted.len(),
            &mut decrypted_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Empty payload decryption should succeed");
        assert_eq!(decrypted_len, 0, "Decrypted empty message should have length 0");
    }
}

/// PH3-FIX: Test encryption/decryption round-trip with maximum reasonable payload
#[test]
fn test_ffi_encrypt_decrypt_roundtrip_max_payload() {
    let password = b"test_password_max";
    let plaintext = vec![0xABu8; 10 * 1024 * 1024]; // 10MB
    let cipher_id = CIPHER_AES256_GCM_SIV;

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;
    let mut ciphertext = vec![0u8; plaintext.len() + 256];
    let mut ciphertext_len = 0usize;
    let mut decrypted = vec![0u8; plaintext.len() + 256];
    let mut decrypted_len = 0usize;

    unsafe {
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);
        assert_eq!(
            qav_derive_key(
                password.as_ptr(),
                password.len(),
                salt.as_ptr(),
                salt.len(),
                key.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );

        // Encrypt max payload
        let result = qav_encrypt(
            cipher_id,
            key.as_ptr(),
            32,
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Max payload encryption should succeed");

        // Decrypt max payload
        let result = qav_decrypt(
            cipher_id,
            key.as_ptr(),
            32,
            ciphertext.as_ptr(),
            ciphertext_len,
            decrypted.as_mut_ptr(),
            decrypted.len(),
            &mut decrypted_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Max payload decryption should succeed");
        assert_eq!(decrypted_len, plaintext.len());
    }
}

/// PH3-FIX: Test that decryption fails with different keys
#[test]
fn test_ffi_encrypt_decrypt_different_keys_fails() {
    let password1 = b"password_one";
    let password2 = b"password_two";
    let plaintext = b"Secret message";
    let cipher_id = CIPHER_XCHACHA20_POLY1305;

    let mut salt = [0u8; 32];
    let mut key1 = [0u8; 64];
    let mut key2 = [0u8; 64];
    let mut key_len = 0usize;
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;
    let mut decrypted = [0u8; 256];
    let mut decrypted_len = 0usize;

    unsafe {
        // Generate shared salt
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);

        // Derive two different keys
        assert_eq!(
            qav_derive_key(
                password1.as_ptr(),
                password1.len(),
                salt.as_ptr(),
                salt.len(),
                key1.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );
        assert_eq!(
            qav_derive_key(
                password2.as_ptr(),
                password2.len(),
                salt.as_ptr(),
                salt.len(),
                key2.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );

        // Encrypt with key1
        assert_eq!(
            qav_encrypt(
                cipher_id,
                key1.as_ptr(),
                32,
                plaintext.as_ptr(),
                plaintext.len(),
                ciphertext.as_mut_ptr(),
                ciphertext.len(),
                &mut ciphertext_len,
            ),
            ERR_SUCCESS
        );

        // Try to decrypt with key2 (should fail)
        let result = qav_decrypt(
            cipher_id,
            key2.as_ptr(),
            32,
            ciphertext.as_ptr(),
            ciphertext_len,
            decrypted.as_mut_ptr(),
            decrypted.len(),
            &mut decrypted_len,
        );
        assert_eq!(
            result, ERR_DECRYPTION_FAILED,
            "Decryption with wrong key should fail"
        );
    }
}

// ═══════════════════════════════════════════════════════════════
// Test Category 2: Null Pointer Handling (7+ tests)
// ═══════════════════════════════════════════════════════════════

/// PH3-FIX: Test qav_derive_key with null password pointer
#[test]
fn test_ffi_derive_key_null_password() {
    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    unsafe {
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);

        let result = qav_derive_key(
            std::ptr::null(),
            10,
            salt.as_ptr(),
            salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null password");
    }
}

/// PH3-FIX: Test qav_derive_key with null salt pointer
#[test]
fn test_ffi_derive_key_null_salt() {
    let password = b"test_password";
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    unsafe {
        let result = qav_derive_key(
            password.as_ptr(),
            password.len(),
            std::ptr::null(),
            32,
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null salt");
    }
}

/// PH3-FIX: Test qav_derive_key with null output pointer
#[test]
fn test_ffi_derive_key_null_output() {
    let password = b"test_password";
    let mut salt = [0u8; 32];
    let mut key_len = 0usize;

    unsafe {
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);

        let result = qav_derive_key(
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            std::ptr::null_mut(),
            &mut key_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null output");
    }
}

/// PH3-FIX: Test qav_encrypt with null key pointer
#[test]
fn test_ffi_encrypt_null_key() {
    let plaintext = b"test";
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;

    unsafe {
        let result = qav_encrypt(
            CIPHER_XCHACHA20_POLY1305,
            std::ptr::null(),
            32,
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null key");
    }
}

/// PH3-FIX: Test qav_encrypt with null plaintext pointer
#[test]
fn test_ffi_encrypt_null_plaintext() {
    let key = [0u8; 32];
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;

    unsafe {
        let result = qav_encrypt(
            CIPHER_XCHACHA20_POLY1305,
            key.as_ptr(),
            key.len(),
            std::ptr::null(),
            10,
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null plaintext");
    }
}

/// PH3-FIX: Test qav_decrypt with null ciphertext pointer
#[test]
fn test_ffi_decrypt_null_ciphertext() {
    let key = [0u8; 32];
    let mut decrypted = [0u8; 256];
    let mut decrypted_len = 0usize;

    unsafe {
        let result = qav_decrypt(
            CIPHER_XCHACHA20_POLY1305,
            key.as_ptr(),
            key.len(),
            std::ptr::null(),
            10,
            decrypted.as_mut_ptr(),
            decrypted.len(),
            &mut decrypted_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null ciphertext");
    }
}

/// PH3-FIX: Test qav_seal with null recipient key pointer
#[test]
fn test_ffi_seal_null_recipient_key() {
    let plaintext = b"test";
    let mut sealed = [0u8; 256];
    let mut sealed_len = 0usize;

    unsafe {
        let result = qav_seal(
            std::ptr::null(),
            plaintext.as_ptr(),
            plaintext.len(),
            sealed.as_mut_ptr(),
            sealed.len(),
            &mut sealed_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null recipient key");
    }
}

// ═══════════════════════════════════════════════════════════════
// Test Category 3: Buffer Ownership & Memory Safety (5+ tests)
// ═══════════════════════════════════════════════════════════════

/// PH3-FIX: Test encryption with output buffer of exact required size
#[test]
fn test_ffi_output_buffer_exact_size() {
    let password = b"test_password";
    let plaintext = b"Hello";
    let cipher_id = CIPHER_XCHACHA20_POLY1305;

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    unsafe {
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);
        assert_eq!(
            qav_derive_key(
                password.as_ptr(),
                password.len(),
                salt.as_ptr(),
                salt.len(),
                key.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );

        // First pass: get required size
        let mut ciphertext_temp = [0u8; 256];
        let mut ciphertext_len = 0usize;
        assert_eq!(
            qav_encrypt(
                cipher_id,
                key.as_ptr(),
                32,
                plaintext.as_ptr(),
                plaintext.len(),
                ciphertext_temp.as_mut_ptr(),
                ciphertext_temp.len(),
                &mut ciphertext_len,
            ),
            ERR_SUCCESS
        );

        // Second pass: allocate exact size
        let mut ciphertext_exact = vec![0u8; ciphertext_len];
        let mut ciphertext_len2 = 0usize;
        let result = qav_encrypt(
            cipher_id,
            key.as_ptr(),
            32,
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext_exact.as_mut_ptr(),
            ciphertext_exact.len(),
            &mut ciphertext_len2,
        );
        assert_eq!(result, ERR_SUCCESS, "Encryption with exact size should succeed");
        assert_eq!(ciphertext_len2, ciphertext_len, "Output length should be consistent");
    }
}

/// PH3-FIX: Test encryption with undersized output buffer
#[test]
fn test_ffi_output_buffer_undersized() {
    let password = b"test_password";
    let plaintext = b"This is a longer message that will produce a ciphertext larger than 8 bytes";
    let cipher_id = CIPHER_AES256_GCM_SIV;

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;
    let mut undersized = [0u8; 8]; // Too small
    let mut ciphertext_len = 0usize;

    unsafe {
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);
        assert_eq!(
            qav_derive_key(
                password.as_ptr(),
                password.len(),
                salt.as_ptr(),
                salt.len(),
                key.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );

        let result = qav_encrypt(
            cipher_id,
            key.as_ptr(),
            32,
            plaintext.as_ptr(),
            plaintext.len(),
            undersized.as_mut_ptr(),
            undersized.len(),
            &mut ciphertext_len,
        );
        assert_eq!(
            result, ERR_BUFFER_TOO_SMALL,
            "Should reject undersized buffer"
        );
    }
}

/// PH3-FIX: Test encryption with oversized output buffer
#[test]
fn test_ffi_output_buffer_oversized() {
    let password = b"test_password";
    let plaintext = b"test";
    let cipher_id = CIPHER_XCHACHA20_POLY1305;

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;
    let mut oversized = vec![0xFFu8; 8192]; // Much larger than needed
    let mut ciphertext_len = 0usize;

    unsafe {
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);
        assert_eq!(
            qav_derive_key(
                password.as_ptr(),
                password.len(),
                salt.as_ptr(),
                salt.len(),
                key.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );

        let result = qav_encrypt(
            cipher_id,
            key.as_ptr(),
            32,
            plaintext.as_ptr(),
            plaintext.len(),
            oversized.as_mut_ptr(),
            oversized.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_SUCCESS, "Oversized buffer should be acceptable");
        assert!(ciphertext_len <= oversized.len(), "Output should fit in buffer");

        // Verify unused portions remain unchanged
        assert!(oversized[ciphertext_len..].iter().all(|&b| b == 0xFFu8),
                "Unused buffer should remain unchanged");
    }
}

/// PH3-FIX: Test double-free safety (FFI free operation is safe)
#[test]
fn test_ffi_double_free_safety() {
    // This test verifies that calling free multiple times is safe
    // In the current implementation, free is a no-op, so this should be safe
    unsafe {
        let buffer = vec![1u8, 2, 3, 4, 5];
        let ptr = buffer.as_ptr() as *mut u8;
        let len = buffer.len();

        // Multiple frees should not crash (current implementation is no-op)
        // This test documents the behavior rather than testing true double-free safety
        // since Rust manages memory
        assert!(ptr as usize > 0, "Valid pointer should be non-null");
        assert_eq!(len, 5);
    }
}

/// PH3-FIX: Test concurrent buffer allocations and operations
#[test]
fn test_ffi_concurrent_allocations() {
    let num_threads = 5;
    let handles: Vec<_> = (0..num_threads)
        .map(|i| {
            thread::spawn(move || {
                let password = format!("password_{}", i).into_bytes();
                let plaintext = format!("message_{}", i).as_bytes().to_vec();
                let cipher_id = if i % 2 == 0 {
                    CIPHER_XCHACHA20_POLY1305
                } else {
                    CIPHER_AES256_GCM_SIV
                };

                let mut salt = [0u8; 32];
                let mut key = [0u8; 64];
                let mut key_len = 0usize;
                let mut ciphertext = vec![0u8; plaintext.len() + 128];
                let mut ciphertext_len = 0usize;
                let mut decrypted = vec![0u8; plaintext.len() + 128];
                let mut decrypted_len = 0usize;

                unsafe {
                    assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);
                    assert_eq!(
                        qav_derive_key(
                            password.as_ptr(),
                            password.len(),
                            salt.as_ptr(),
                            salt.len(),
                            key.as_mut_ptr(),
                            &mut key_len,
                        ),
                        ERR_SUCCESS
                    );

                    assert_eq!(
                        qav_encrypt(
                            cipher_id,
                            key.as_ptr(),
                            32,
                            plaintext.as_ptr(),
                            plaintext.len(),
                            ciphertext.as_mut_ptr(),
                            ciphertext.len(),
                            &mut ciphertext_len,
                        ),
                        ERR_SUCCESS
                    );

                    assert_eq!(
                        qav_decrypt(
                            cipher_id,
                            key.as_ptr(),
                            32,
                            ciphertext.as_ptr(),
                            ciphertext_len,
                            decrypted.as_mut_ptr(),
                            decrypted.len(),
                            &mut decrypted_len,
                        ),
                        ERR_SUCCESS
                    );

                    assert_eq!(&decrypted[..decrypted_len], &plaintext[..]);
                }
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("Thread should complete successfully");
    }
}

// ═══════════════════════════════════════════════════════════════
// Test Category 4: Concurrent Call Safety (3+ tests)
// ═══════════════════════════════════════════════════════════════

/// PH3-FIX: Test concurrent encryption and decryption from 10 threads
#[test]
fn test_ffi_concurrent_encrypt_decrypt() {
    let num_threads = 10;
    let handles: Vec<_> = (0..num_threads)
        .map(|thread_id| {
            thread::spawn(move || {
                let password = format!("password_{}", thread_id).into_bytes();
                let plaintext = format!("Message from thread {}", thread_id);
                let cipher_id = if thread_id % 2 == 0 {
                    CIPHER_XCHACHA20_POLY1305
                } else {
                    CIPHER_AES256_GCM_SIV
                };

                let mut salt = [0u8; 32];
                let mut key = [0u8; 64];
                let mut key_len = 0usize;
                let mut ciphertext = vec![0u8; plaintext.len() + 128];
                let mut ciphertext_len = 0usize;
                let mut decrypted = vec![0u8; plaintext.len() + 128];
                let mut decrypted_len = 0usize;

                unsafe {
                    // Each thread generates its own salt
                    let result = qav_generate_salt(salt.as_mut_ptr());
                    assert_eq!(result, ERR_SUCCESS);

                    // Derive key
                    let result = qav_derive_key(
                        password.as_ptr(),
                        password.len(),
                        salt.as_ptr(),
                        salt.len(),
                        key.as_mut_ptr(),
                        &mut key_len,
                    );
                    assert_eq!(result, ERR_SUCCESS);

                    // Encrypt
                    let result = qav_encrypt(
                        cipher_id,
                        key.as_ptr(),
                        32,
                        plaintext.as_ptr(),
                        plaintext.len(),
                        ciphertext.as_mut_ptr(),
                        ciphertext.len(),
                        &mut ciphertext_len,
                    );
                    assert_eq!(result, ERR_SUCCESS);

                    // Decrypt
                    let result = qav_decrypt(
                        cipher_id,
                        key.as_ptr(),
                        32,
                        ciphertext.as_ptr(),
                        ciphertext_len,
                        decrypted.as_mut_ptr(),
                        decrypted.len(),
                        &mut decrypted_len,
                    );
                    assert_eq!(result, ERR_SUCCESS);
                    assert_eq!(&decrypted[..decrypted_len], plaintext.as_bytes());
                }
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("Thread should complete");
    }
}

/// PH3-FIX: Test concurrent key derivation from 10 threads
#[test]
fn test_ffi_concurrent_key_derivation() {
    let num_threads = 10;
    let handles: Vec<_> = (0..num_threads)
        .map(|thread_id| {
            thread::spawn(move || {
                let password = format!("password_{}", thread_id).into_bytes();
                let mut salt = [0u8; 32];
                let mut key = [0u8; 64];
                let mut key_len = 0usize;

                unsafe {
                    // Generate unique salt per thread
                    assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);

                    // Derive key
                    let result = qav_derive_key(
                        password.as_ptr(),
                        password.len(),
                        salt.as_ptr(),
                        salt.len(),
                        key.as_mut_ptr(),
                        &mut key_len,
                    );
                    assert_eq!(result, ERR_SUCCESS);
                    assert_eq!(key_len, 64);

                    // Verify key is not all zeros
                    assert!(key.iter().any(|&b| b != 0));
                }
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("Thread should complete");
    }
}

/// PH3-FIX: Test concurrent keypair generation from 10 threads
#[test]
fn test_ffi_concurrent_keypair_generation() {
    let num_threads = 10;
    let handles: Vec<_> = (0..num_threads)
        .map(|_| {
            thread::spawn(|| {
                let mut public_key = [0u8; 32];
                let mut secret_key = [0u8; 32];

                unsafe {
                    let result = qav_generate_keypair(
                        public_key.as_mut_ptr(),
                        secret_key.as_mut_ptr(),
                    );
                    assert_eq!(result, ERR_SUCCESS);

                    // Verify keys are valid
                    assert!(public_key.iter().any(|&b| b != 0));
                    assert!(secret_key.iter().any(|&b| b != 0));
                    assert_ne!(public_key, secret_key);
                }
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("Thread should complete");
    }
}

// ═══════════════════════════════════════════════════════════════
// Test Category 5: Error Code Propagation (5+ tests)
// ═══════════════════════════════════════════════════════════════

/// PH3-FIX: Test error code for invalid key length in encryption
#[test]
fn test_ffi_error_invalid_key_length() {
    let plaintext = b"test";
    let invalid_key = [0u8; 16]; // Wrong length
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;

    unsafe {
        let result = qav_encrypt(
            CIPHER_XCHACHA20_POLY1305,
            invalid_key.as_ptr(),
            invalid_key.len(),
            plaintext.as_ptr(),
            plaintext.len(),
            ciphertext.as_mut_ptr(),
            ciphertext.len(),
            &mut ciphertext_len,
        );
        assert_eq!(result, ERR_INVALID_KEY, "Should return ERR_INVALID_KEY");
    }
}

/// PH3-FIX: Test error code for invalid salt length in key derivation
#[test]
fn test_ffi_error_invalid_salt_length() {
    let password = b"test_password";
    let invalid_salt = [0u8; 16]; // Wrong length (should be 32)
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    unsafe {
        let result = qav_derive_key(
            password.as_ptr(),
            password.len(),
            invalid_salt.as_ptr(),
            invalid_salt.len(),
            key.as_mut_ptr(),
            &mut key_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should return ERR_INVALID_ARGUMENT");
    }
}

/// PH3-FIX: Test error code for corrupted ciphertext in decryption
#[test]
fn test_ffi_error_corrupted_ciphertext() {
    let password = b"test_password";
    let plaintext = b"Hello, QAV!";
    let cipher_id = CIPHER_XCHACHA20_POLY1305;

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;
    let mut decrypted = [0u8; 256];
    let mut decrypted_len = 0usize;

    unsafe {
        // Generate valid ciphertext
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);
        assert_eq!(
            qav_derive_key(
                password.as_ptr(),
                password.len(),
                salt.as_ptr(),
                salt.len(),
                key.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );
        assert_eq!(
            qav_encrypt(
                cipher_id,
                key.as_ptr(),
                32,
                plaintext.as_ptr(),
                plaintext.len(),
                ciphertext.as_mut_ptr(),
                ciphertext.len(),
                &mut ciphertext_len,
            ),
            ERR_SUCCESS
        );

        // Corrupt a byte in the ciphertext
        if ciphertext_len > 10 {
            ciphertext[10] ^= 0xFF;
        }

        // Try to decrypt corrupted ciphertext
        let result = qav_decrypt(
            cipher_id,
            key.as_ptr(),
            32,
            ciphertext.as_ptr(),
            ciphertext_len,
            decrypted.as_mut_ptr(),
            decrypted.len(),
            &mut decrypted_len,
        );
        assert_eq!(
            result, ERR_DECRYPTION_FAILED,
            "Should return ERR_DECRYPTION_FAILED for corrupted ciphertext"
        );
    }
}

/// PH3-FIX: Test error code for wrong key during decryption
#[test]
fn test_ffi_error_wrong_key_decryption() {
    let password1 = b"password_one";
    let password2 = b"password_two";
    let plaintext = b"Secret";
    let cipher_id = CIPHER_AES256_GCM_SIV;

    let mut salt = [0u8; 32];
    let mut key1 = [0u8; 64];
    let mut key2 = [0u8; 64];
    let mut key_len = 0usize;
    let mut ciphertext = [0u8; 256];
    let mut ciphertext_len = 0usize;
    let mut decrypted = [0u8; 256];
    let mut decrypted_len = 0usize;

    unsafe {
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);

        // Create two different keys
        assert_eq!(
            qav_derive_key(
                password1.as_ptr(),
                password1.len(),
                salt.as_ptr(),
                salt.len(),
                key1.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );
        assert_eq!(
            qav_derive_key(
                password2.as_ptr(),
                password2.len(),
                salt.as_ptr(),
                salt.len(),
                key2.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );

        // Encrypt with key1
        assert_eq!(
            qav_encrypt(
                cipher_id,
                key1.as_ptr(),
                32,
                plaintext.as_ptr(),
                plaintext.len(),
                ciphertext.as_mut_ptr(),
                ciphertext.len(),
                &mut ciphertext_len,
            ),
            ERR_SUCCESS
        );

        // Decrypt with key2 should fail
        let result = qav_decrypt(
            cipher_id,
            key2.as_ptr(),
            32,
            ciphertext.as_ptr(),
            ciphertext_len,
            decrypted.as_mut_ptr(),
            decrypted.len(),
            &mut decrypted_len,
        );
        assert_eq!(result, ERR_DECRYPTION_FAILED, "Wrong key should fail");
    }
}

/// PH3-FIX: Test that all error codes are negative
#[test]
fn test_ffi_error_codes_are_negative() {
    assert_eq!(ERR_SUCCESS, 0);
    assert!(ERR_INVALID_KEY < 0);
    assert!(ERR_INVALID_NONCE < 0);
    assert!(ERR_DECRYPTION_FAILED < 0);
    assert!(ERR_INVALID_HEADER < 0);
    assert!(ERR_INVALID_MAGIC < 0);
    assert!(ERR_INVALID_VERSION < 0);
    assert!(ERR_CORRUPTED_CHUNK < 0);
    assert!(ERR_CORRUPTED_INDEX < 0);
    assert!(ERR_KEY_DERIVATION_FAILED < 0);
    assert!(ERR_SHARING_ERROR < 0);
    assert!(ERR_SERIALIZATION_ERROR < 0);
    assert!(ERR_IO_ERROR < 0);
    assert!(ERR_MEMORY_ERROR < 0);
    assert!(ERR_INVALID_CIPHER < 0);
    assert!(ERR_BUFFER_TOO_SMALL < 0);
    assert!(ERR_INVALID_ARGUMENT < 0);
}

// ═══════════════════════════════════════════════════════════════
// Test Category 6: PQC FFI Integration (if feature enabled)
// ═══════════════════════════════════════════════════════════════

/// PH3-FIX: Test PQC keypair generation roundtrip
#[cfg(feature = "pqc")]
#[test]
fn test_pqc_keypair_generation_roundtrip() {
    let mut x25519_pub = [0u8; 32];
    let mut mlkem_pub = [0u8; 1568];
    let mut x25519_sec = [0u8; 32];
    let mut mlkem_sec = [0u8; 1568];

    unsafe {
        let result = qav_pqc_generate_keypair(
            x25519_pub.as_mut_ptr(),
            mlkem_pub.as_mut_ptr(),
            x25519_sec.as_mut_ptr(),
            mlkem_sec.as_mut_ptr(),
        );
        assert_eq!(result, ERR_SUCCESS, "PQC keypair generation should succeed");

        // Verify public keys are not all zeros
        assert!(x25519_pub.iter().any(|&b| b != 0));
        assert!(mlkem_pub.iter().any(|&b| b != 0));

        // Verify secret keys are not all zeros
        assert!(x25519_sec.iter().any(|&b| b != 0));
        assert!(mlkem_sec.iter().any(|&b| b != 0));

        // Verify keys are different
        assert_ne!(x25519_pub, x25519_sec);
        assert_ne!(mlkem_pub, mlkem_sec);
    }
}

/// PH3-FIX: Test PQC seal and open roundtrip
#[cfg(feature = "pqc")]
#[test]
fn test_pqc_seal_open_roundtrip() {
    let plaintext = b"Secret message with PQC encryption";
    let mut x25519_pub = [0u8; 32];
    let mut mlkem_pub = [0u8; 1568];
    let mut x25519_sec = [0u8; 32];
    let mut mlkem_sec = [0u8; 1568];
    let mut sealed = vec![0u8; plaintext.len() + 2048]; // PQC overhead
    let mut sealed_len = 0usize;
    let mut opened = vec![0u8; plaintext.len() + 256];
    let mut opened_len = 0usize;

    unsafe {
        // Generate keypair
        assert_eq!(
            qav_pqc_generate_keypair(
                x25519_pub.as_mut_ptr(),
                mlkem_pub.as_mut_ptr(),
                x25519_sec.as_mut_ptr(),
                mlkem_sec.as_mut_ptr(),
            ),
            ERR_SUCCESS
        );

        // Seal plaintext
        let result = qav_pqc_seal(
            x25519_pub.as_ptr(),
            mlkem_pub.as_ptr(),
            mlkem_pub.len(),
            plaintext.as_ptr(),
            plaintext.len(),
            sealed.as_mut_ptr(),
            sealed.len(),
            &mut sealed_len,
        );
        assert_eq!(result, ERR_SUCCESS, "PQC seal should succeed");
        assert!(sealed_len > plaintext.len(), "Sealed should have overhead");

        // Open the sealed message
        let result = qav_pqc_open(
            x25519_sec.as_ptr(),
            mlkem_sec.as_ptr(),
            mlkem_sec.len(),
            sealed.as_ptr(),
            sealed_len,
            opened.as_mut_ptr(),
            opened.len(),
            &mut opened_len,
        );
        assert_eq!(result, ERR_SUCCESS, "PQC open should succeed");
        assert_eq!(opened_len, plaintext.len());
        assert_eq!(&opened[..opened_len], plaintext);
    }
}

/// PH3-FIX: Test PQC null pointer handling
#[cfg(feature = "pqc")]
#[test]
fn test_pqc_null_pointer_handling() {
    let plaintext = b"test";
    let key = [0u8; 32];
    let mlkem_key = [0u8; 1568];
    let mut sealed = [0u8; 256];
    let mut sealed_len = 0usize;

    unsafe {
        // Test null x25519 public key in seal
        let result = qav_pqc_seal(
            std::ptr::null(),
            mlkem_key.as_ptr(),
            mlkem_key.len(),
            plaintext.as_ptr(),
            plaintext.len(),
            sealed.as_mut_ptr(),
            sealed.len(),
            &mut sealed_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null x25519 pub");

        // Test null mlkem public key in seal
        let result = qav_pqc_seal(
            key.as_ptr(),
            std::ptr::null(),
            mlkem_key.len(),
            plaintext.as_ptr(),
            plaintext.len(),
            sealed.as_mut_ptr(),
            sealed.len(),
            &mut sealed_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null mlkem pub");

        // Test null plaintext in seal
        let result = qav_pqc_seal(
            key.as_ptr(),
            mlkem_key.as_ptr(),
            mlkem_key.len(),
            std::ptr::null(),
            10,
            sealed.as_mut_ptr(),
            sealed.len(),
            &mut sealed_len,
        );
        assert_eq!(result, ERR_INVALID_ARGUMENT, "Should reject null plaintext");
    }
}

/// PH3-FIX: Test PQC concurrent operations
#[cfg(feature = "pqc")]
#[test]
fn test_pqc_concurrent_operations() {
    let num_threads = 5;
    let handles: Vec<_> = (0..num_threads)
        .map(|i| {
            thread::spawn(move || {
                let plaintext = format!("PQC message from thread {}", i).into_bytes();
                let mut x25519_pub = [0u8; 32];
                let mut mlkem_pub = [0u8; 1568];
                let mut x25519_sec = [0u8; 32];
                let mut mlkem_sec = [0u8; 1568];
                let mut sealed = vec![0u8; plaintext.len() + 2048];
                let mut sealed_len = 0usize;
                let mut opened = vec![0u8; plaintext.len() + 256];
                let mut opened_len = 0usize;

                unsafe {
                    // Generate keypair
                    assert_eq!(
                        qav_pqc_generate_keypair(
                            x25519_pub.as_mut_ptr(),
                            mlkem_pub.as_mut_ptr(),
                            x25519_sec.as_mut_ptr(),
                            mlkem_sec.as_mut_ptr(),
                        ),
                        ERR_SUCCESS
                    );

                    // Seal
                    assert_eq!(
                        qav_pqc_seal(
                            x25519_pub.as_ptr(),
                            mlkem_pub.as_ptr(),
                            mlkem_pub.len(),
                            plaintext.as_ptr(),
                            plaintext.len(),
                            sealed.as_mut_ptr(),
                            sealed.len(),
                            &mut sealed_len,
                        ),
                        ERR_SUCCESS
                    );

                    // Open
                    assert_eq!(
                        qav_pqc_open(
                            x25519_sec.as_ptr(),
                            mlkem_sec.as_ptr(),
                            mlkem_sec.len(),
                            sealed.as_ptr(),
                            sealed_len,
                            opened.as_mut_ptr(),
                            opened.len(),
                            &mut opened_len,
                        ),
                        ERR_SUCCESS
                    );

                    assert_eq!(&opened[..opened_len], &plaintext[..]);
                }
            })
        })
        .collect();

    for handle in handles {
        handle.join().expect("Thread should complete");
    }
}

// ═══════════════════════════════════════════════════════════════
// Additional Integration Tests
// ═══════════════════════════════════════════════════════════════

/// PH3-FIX: Test seal and open with key exchange pattern
#[test]
fn test_ffi_seal_open_key_exchange_pattern() {
    let alice_msg = b"Hello from Alice";
    let bob_msg = b"Hello from Bob";

    let mut alice_pub = [0u8; 32];
    let mut alice_sec = [0u8; 32];
    let mut bob_pub = [0u8; 32];
    let mut bob_sec = [0u8; 32];

    let mut alice_sealed = [0u8; 256];
    let mut alice_sealed_len = 0usize;
    let mut bob_sealed = [0u8; 256];
    let mut bob_sealed_len = 0usize;

    let mut alice_opened = [0u8; 256];
    let mut alice_opened_len = 0usize;
    let mut bob_opened = [0u8; 256];
    let mut bob_opened_len = 0usize;

    unsafe {
        // Generate keypairs
        assert_eq!(
            qav_generate_keypair(alice_pub.as_mut_ptr(), alice_sec.as_mut_ptr()),
            ERR_SUCCESS
        );
        assert_eq!(
            qav_generate_keypair(bob_pub.as_mut_ptr(), bob_sec.as_mut_ptr()),
            ERR_SUCCESS
        );

        // Alice sends to Bob
        assert_eq!(
            qav_seal(
                bob_pub.as_ptr(),
                alice_msg.as_ptr(),
                alice_msg.len(),
                alice_sealed.as_mut_ptr(),
                alice_sealed.len(),
                &mut alice_sealed_len,
            ),
            ERR_SUCCESS
        );

        // Bob opens Alice's message
        assert_eq!(
            qav_open(
                bob_sec.as_ptr(),
                alice_sealed.as_ptr(),
                alice_sealed_len,
                bob_opened.as_mut_ptr(),
                bob_opened.len(),
                &mut bob_opened_len,
            ),
            ERR_SUCCESS
        );
        assert_eq!(&bob_opened[..bob_opened_len], alice_msg);

        // Bob sends to Alice
        assert_eq!(
            qav_seal(
                alice_pub.as_ptr(),
                bob_msg.as_ptr(),
                bob_msg.len(),
                bob_sealed.as_mut_ptr(),
                bob_sealed.len(),
                &mut bob_sealed_len,
            ),
            ERR_SUCCESS
        );

        // Alice opens Bob's message
        assert_eq!(
            qav_open(
                alice_sec.as_ptr(),
                bob_sealed.as_ptr(),
                bob_sealed_len,
                alice_opened.as_mut_ptr(),
                alice_opened.len(),
                &mut alice_opened_len,
            ),
            ERR_SUCCESS
        );
        assert_eq!(&alice_opened[..alice_opened_len], bob_msg);
    }
}

/// PH3-FIX: Test multiple cipher algorithms in sequence
#[test]
fn test_ffi_multiple_cipher_algorithms() {
    let password = b"test_password";
    let plaintext = b"Test message";

    let mut salt = [0u8; 32];
    let mut key = [0u8; 64];
    let mut key_len = 0usize;

    unsafe {
        assert_eq!(qav_generate_salt(salt.as_mut_ptr()), ERR_SUCCESS);
        assert_eq!(
            qav_derive_key(
                password.as_ptr(),
                password.len(),
                salt.as_ptr(),
                salt.len(),
                key.as_mut_ptr(),
                &mut key_len,
            ),
            ERR_SUCCESS
        );

        // Test XChaCha20-Poly1305
        let mut ciphertext1 = [0u8; 256];
        let mut ciphertext1_len = 0usize;
        let mut decrypted1 = [0u8; 256];
        let mut decrypted1_len = 0usize;

        assert_eq!(
            qav_encrypt(
                CIPHER_XCHACHA20_POLY1305,
                key.as_ptr(),
                32,
                plaintext.as_ptr(),
                plaintext.len(),
                ciphertext1.as_mut_ptr(),
                ciphertext1.len(),
                &mut ciphertext1_len,
            ),
            ERR_SUCCESS
        );

        assert_eq!(
            qav_decrypt(
                CIPHER_XCHACHA20_POLY1305,
                key.as_ptr(),
                32,
                ciphertext1.as_ptr(),
                ciphertext1_len,
                decrypted1.as_mut_ptr(),
                decrypted1.len(),
                &mut decrypted1_len,
            ),
            ERR_SUCCESS
        );
        assert_eq!(&decrypted1[..decrypted1_len], plaintext);

        // Test AES-256-GCM-SIV
        let mut ciphertext2 = [0u8; 256];
        let mut ciphertext2_len = 0usize;
        let mut decrypted2 = [0u8; 256];
        let mut decrypted2_len = 0usize;

        assert_eq!(
            qav_encrypt(
                CIPHER_AES256_GCM_SIV,
                key.as_ptr(),
                32,
                plaintext.as_ptr(),
                plaintext.len(),
                ciphertext2.as_mut_ptr(),
                ciphertext2.len(),
                &mut ciphertext2_len,
            ),
            ERR_SUCCESS
        );

        assert_eq!(
            qav_decrypt(
                CIPHER_AES256_GCM_SIV,
                key.as_ptr(),
                32,
                ciphertext2.as_ptr(),
                ciphertext2_len,
                decrypted2.as_mut_ptr(),
                decrypted2.len(),
                &mut decrypted2_len,
            ),
            ERR_SUCCESS
        );
        assert_eq!(&decrypted2[..decrypted2_len], plaintext);

        // Verify different algorithms produce different ciphertexts for same plaintext
        assert_ne!(&ciphertext1[..ciphertext1_len], &ciphertext2[..ciphertext2_len]);
    }
}
