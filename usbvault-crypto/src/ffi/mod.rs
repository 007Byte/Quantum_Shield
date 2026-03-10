//! C ABI FFI exports for React Native integration

use crate::cipher::{self, CipherId};
use crate::error::CryptoError;
use crate::kdf::{derive_master_key, generate_salt};
use crate::sharing::{self, SharePublicKey, ShareSecretKey};
use std::panic;
use std::slice;

// Platform-specific FFI modules
#[cfg(target_os = "ios")]
pub mod ios;

#[cfg(target_os = "android")]
pub mod android;

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
pub mod desktop;

/// FFI error codes matching CryptoError variants
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

/// Convert CryptoError to FFI error code
fn crypto_error_to_code(err: &CryptoError) -> i32 {
    match err {
        CryptoError::InvalidKey => ERR_INVALID_KEY,
        CryptoError::InvalidNonce => ERR_INVALID_NONCE,
        CryptoError::DecryptionFailed => ERR_DECRYPTION_FAILED,
        CryptoError::InvalidHeader => ERR_INVALID_HEADER,
        CryptoError::InvalidMagic => ERR_INVALID_MAGIC,
        CryptoError::InvalidVersion => ERR_INVALID_VERSION,
        CryptoError::CorruptedChunk => ERR_CORRUPTED_CHUNK,
        CryptoError::CorruptedIndex => ERR_CORRUPTED_INDEX,
        CryptoError::KeyDerivationFailed => ERR_KEY_DERIVATION_FAILED,
        CryptoError::SharingError => ERR_SHARING_ERROR,
        CryptoError::SerializationError => ERR_SERIALIZATION_ERROR,
        CryptoError::IoError => ERR_IO_ERROR,
        CryptoError::MemoryError => ERR_MEMORY_ERROR,
        CryptoError::InvalidCipher => ERR_INVALID_CIPHER,
        CryptoError::BufferTooSmall => ERR_BUFFER_TOO_SMALL,
        CryptoError::InvalidArgument => ERR_INVALID_ARGUMENT,
        CryptoError::SrpError(_) => ERR_INVALID_ARGUMENT,
        CryptoError::NonceReuse => ERR_INVALID_NONCE,
        CryptoError::KeyWrappingFailed => ERR_KEY_DERIVATION_FAILED,
        CryptoError::RollbackDetected => ERR_INVALID_VERSION,
        CryptoError::InvalidInput(_) => ERR_INVALID_ARGUMENT,
    }
}

/// Derive master key from password
///
/// # Safety
/// Caller must ensure:
/// - password_ptr is valid and password_len is correct
/// - salt_ptr is valid and salt_len is 32
/// - out_ptr can hold 64 bytes
/// - out_len pointer is valid for writing
#[no_mangle]
pub extern "C" fn qav_derive_key(
    password_ptr: *const u8,
    password_len: usize,
    salt_ptr: *const u8,
    salt_len: usize,
    out_ptr: *mut u8,
    out_len: *mut usize,
) -> i32 {
    if password_ptr.is_null() || salt_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    if salt_len != 32 {
        return ERR_INVALID_ARGUMENT;
    }

    // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let password = slice::from_raw_parts(password_ptr, password_len);
        let salt_slice = slice::from_raw_parts(salt_ptr, salt_len);

        let mut salt = [0u8; 32];
        salt.copy_from_slice(salt_slice);

        match derive_master_key(password, &salt) {
            Ok(key) => {
                let key_bytes = key.as_bytes();
                let output = slice::from_raw_parts_mut(out_ptr, 64);
                output.copy_from_slice(key_bytes);
                *out_len = 64;
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
    }
}

/// Encrypt plaintext
///
/// # Safety
/// Caller must ensure all pointers are valid and lengths are correct
#[no_mangle]
pub extern "C" fn qav_encrypt(
    cipher_id: u8,
    key_ptr: *const u8,
    key_len: usize,
    plaintext_ptr: *const u8,
    plaintext_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if key_ptr.is_null() || plaintext_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    if key_len != 32 {
        return ERR_INVALID_KEY;
    }

    // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
    // Note: out_capacity check happens inside unsafe block after crypto operation (intentional)
    // since we must perform encryption before knowing the output size.
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let cipher = match CipherId::from_byte(cipher_id) {
            Ok(c) => c,
            Err(e) => return crypto_error_to_code(&e),
        };

        let key_slice = slice::from_raw_parts(key_ptr, key_len);
        let plaintext = slice::from_raw_parts(plaintext_ptr, plaintext_len);

        let mut key = [0u8; 32];
        key.copy_from_slice(key_slice);

        match cipher::encrypt(cipher, &key, plaintext) {
            Ok(ciphertext) => {
                if ciphertext.len() > out_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }
                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[0..ciphertext.len()].copy_from_slice(&ciphertext);
                *out_len = ciphertext.len();
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
    }
}

/// Decrypt ciphertext
///
/// # Safety
/// Caller must ensure all pointers are valid and lengths are correct
#[no_mangle]
pub extern "C" fn qav_decrypt(
    cipher_id: u8,
    key_ptr: *const u8,
    key_len: usize,
    ciphertext_ptr: *const u8,
    ciphertext_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if key_ptr.is_null() || ciphertext_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    if key_len != 32 {
        return ERR_INVALID_KEY;
    }

    // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
    // Note: out_capacity check happens inside unsafe block after crypto operation (intentional)
    // since we must perform decryption before knowing the output size.
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let cipher = match CipherId::from_byte(cipher_id) {
            Ok(c) => c,
            Err(e) => return crypto_error_to_code(&e),
        };

        let key_slice = slice::from_raw_parts(key_ptr, key_len);
        let ciphertext = slice::from_raw_parts(ciphertext_ptr, ciphertext_len);

        let mut key = [0u8; 32];
        key.copy_from_slice(key_slice);

        match cipher::decrypt(cipher, &key, ciphertext) {
            Ok(plaintext) => {
                if plaintext.len() > out_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }
                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[0..plaintext.len()].copy_from_slice(&plaintext);
                *out_len = plaintext.len();
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
    }
}

/// Generate X25519 keypair for sharing
///
/// # Safety
/// Caller must ensure:
/// - public_out can hold 32 bytes
/// - secret_out can hold 32 bytes
#[no_mangle]
pub extern "C" fn qav_generate_keypair(public_out: *mut u8, secret_out: *mut u8) -> i32 {
    if public_out.is_null() || secret_out.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        let (public, secret) = sharing::generate_keypair();

        unsafe {
            let pub_slice = slice::from_raw_parts_mut(public_out, 32);
            pub_slice.copy_from_slice(public.as_bytes());

            let sec_slice = slice::from_raw_parts_mut(secret_out, 32);
            sec_slice.copy_from_slice(secret.as_bytes());

            ERR_SUCCESS
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
    }
}

/// Seal plaintext for a recipient
///
/// # Safety
/// Caller must ensure all pointers are valid and lengths are correct
#[no_mangle]
pub extern "C" fn qav_seal(
    recipient_public: *const u8,
    plaintext_ptr: *const u8,
    plaintext_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if recipient_public.is_null()
        || plaintext_ptr.is_null()
        || out_ptr.is_null()
        || out_len.is_null()
    {
        return ERR_INVALID_ARGUMENT;
    }

    // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
    // Note: out_capacity check happens inside unsafe block after crypto operation (intentional)
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let pub_slice = slice::from_raw_parts(recipient_public, 32);
        let plaintext = slice::from_raw_parts(plaintext_ptr, plaintext_len);

        let mut pub_bytes = [0u8; 32];
        pub_bytes.copy_from_slice(pub_slice);
        let public_key = SharePublicKey::from_bytes(pub_bytes);

        match sharing::seal(&public_key, plaintext) {
            Ok(sealed) => {
                if sealed.len() > out_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }
                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[0..sealed.len()].copy_from_slice(&sealed);
                *out_len = sealed.len();
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
    }
}

/// Open a sealed message
///
/// # Safety
/// Caller must ensure all pointers are valid and lengths are correct
#[no_mangle]
pub extern "C" fn qav_open(
    secret_key: *const u8,
    sealed_ptr: *const u8,
    sealed_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if secret_key.is_null() || sealed_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
    // Note: out_capacity check happens inside unsafe block after crypto operation (intentional)
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let sec_slice = slice::from_raw_parts(secret_key, 32);
        let sealed = slice::from_raw_parts(sealed_ptr, sealed_len);

        let mut sec_bytes = [0u8; 32];
        sec_bytes.copy_from_slice(sec_slice);
        let secret = ShareSecretKey::from_bytes(sec_bytes);

        match sharing::open(&secret, sealed) {
            Ok(plaintext) => {
                if plaintext.len() > out_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }
                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[0..plaintext.len()].copy_from_slice(&plaintext);
                *out_len = plaintext.len();
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
    }
}

/// Free allocated memory
///
/// # Safety
/// Caller must ensure the pointer was allocated by this library
///
/// # Note
/// Memory is managed by Rust's allocator, so this function is not required.
/// This function exists for C ABI compatibility but is a no-op since buffers
/// are managed by Rust and should not be freed manually.
///
/// Returns ERR_INVALID_ARGUMENT to indicate the function is not supported.
#[no_mangle]
pub extern "C" fn qav_free(_ptr: *mut u8, _len: usize) -> i32 {
    // Memory is managed by Rust, so freeing is not necessary.
    // Return error code to signal this operation is not supported.
    ERR_INVALID_ARGUMENT
}

/// Generate a random salt
///
/// # Safety
/// Caller must ensure out can hold 32 bytes
#[no_mangle]
pub extern "C" fn qav_generate_salt(out: *mut u8) -> i32 {
    if out.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| {
        let salt = generate_salt();

        unsafe {
            let output = slice::from_raw_parts_mut(out, 32);
            output.copy_from_slice(&salt);
            ERR_SUCCESS
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
    }
}

// ═══════════════════════════════════════════════════════════════
// PH9-PQ-FIX: Post-Quantum Cryptography FFI Exports
// Hybrid X25519 + ML-KEM-1024 sealed box operations
// ═══════════════════════════════════════════════════════════════

/// Generate a hybrid X25519 + ML-KEM-1024 keypair
///
/// # Safety
/// Caller must ensure:
/// - x25519_pub_out can hold 32 bytes
/// - mlkem_pub_out can hold 1568 bytes
/// - x25519_sec_out can hold 32 bytes
/// - mlkem_sec_out can hold 1568 bytes
///
/// # Returns
/// ERR_SUCCESS (0) on success, or ERR_INVALID_ARGUMENT if pqc feature not enabled
#[no_mangle]
pub extern "C" fn qav_pqc_generate_keypair(
    x25519_pub_out: *mut u8,
    mlkem_pub_out: *mut u8,
    x25519_sec_out: *mut u8,
    mlkem_sec_out: *mut u8,
) -> i32 {
    if x25519_pub_out.is_null()
        || mlkem_pub_out.is_null()
        || x25519_sec_out.is_null()
        || mlkem_sec_out.is_null()
    {
        return ERR_INVALID_ARGUMENT;
    }

    #[cfg(feature = "pqc")]
    {
        use crate::pqc::hybrid::generate_hybrid_keypair;

        // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
        let result =
            panic::catch_unwind(panic::AssertUnwindSafe(|| {
                match generate_hybrid_keypair() {
                    Ok((pk, sk)) => unsafe {
                        let x25519_pub = slice::from_raw_parts_mut(x25519_pub_out, 32);
                        x25519_pub.copy_from_slice(&pk.x25519);

                        let mlkem_pub = slice::from_raw_parts_mut(mlkem_pub_out, pk.ml_kem.len());
                        mlkem_pub.copy_from_slice(&pk.ml_kem);

                        let x25519_sec = slice::from_raw_parts_mut(x25519_sec_out, 32);
                        x25519_sec.copy_from_slice(sk.x25519.as_ref());

                        let mlkem_sec = slice::from_raw_parts_mut(mlkem_sec_out, sk.ml_kem.len());
                        mlkem_sec.copy_from_slice(&sk.ml_kem);

                        ERR_SUCCESS
                    },
                    Err(e) => crypto_error_to_code(&e),
                }
            }));

        match result {
            Ok(code) => code,
            Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
        }
    }

    #[cfg(not(feature = "pqc"))]
    {
        let _ = (x25519_pub_out, mlkem_pub_out, x25519_sec_out, mlkem_sec_out);
        ERR_INVALID_ARGUMENT // PQC feature not enabled
    }
}

/// Hybrid seal: encrypt plaintext for a recipient using X25519 + ML-KEM-1024
///
/// # Safety
/// Caller must ensure:
/// - x25519_pub is 32 bytes (recipient X25519 public key)
/// - mlkem_pub is 1568 bytes (recipient ML-KEM-1024 encapsulation key)
/// - plaintext_ptr/plaintext_len are valid
/// - out_ptr has capacity for sealed output (plaintext_len + 1640 overhead)
///
/// # Format
/// Output: x25519_eph(32) || mlkem_ct(1568) || nonce(24) || ciphertext || tag(16)
#[no_mangle]
pub extern "C" fn qav_pqc_seal(
    x25519_pub: *const u8,
    mlkem_pub: *const u8,
    mlkem_pub_len: usize,
    plaintext_ptr: *const u8,
    plaintext_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if x25519_pub.is_null()
        || mlkem_pub.is_null()
        || plaintext_ptr.is_null()
        || out_ptr.is_null()
        || out_len.is_null()
    {
        return ERR_INVALID_ARGUMENT;
    }

    #[cfg(feature = "pqc")]
    {
        use crate::pqc::hybrid::{hybrid_seal, HybridPublicKey};

        // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
        // Note: out_capacity check happens inside unsafe block after crypto operation (intentional)
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
            let x25519_slice = slice::from_raw_parts(x25519_pub, 32);
            let mlkem_slice = slice::from_raw_parts(mlkem_pub, mlkem_pub_len);
            let plaintext = slice::from_raw_parts(plaintext_ptr, plaintext_len);

            let mut x25519_bytes = [0u8; 32];
            x25519_bytes.copy_from_slice(x25519_slice);

            let recipient = HybridPublicKey {
                x25519: x25519_bytes,
                ml_kem: mlkem_slice.to_vec(),
            };

            match hybrid_seal(&recipient, plaintext) {
                Ok(sealed) => {
                    if sealed.len() > out_capacity {
                        return ERR_BUFFER_TOO_SMALL;
                    }
                    let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                    output[..sealed.len()].copy_from_slice(&sealed);
                    *out_len = sealed.len();
                    ERR_SUCCESS
                }
                Err(e) => crypto_error_to_code(&e),
            }
        }));

        match result {
            Ok(code) => code,
            Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
        }
    }

    #[cfg(not(feature = "pqc"))]
    {
        let _ = (
            x25519_pub,
            mlkem_pub,
            mlkem_pub_len,
            plaintext_ptr,
            plaintext_len,
            out_ptr,
            out_capacity,
            out_len,
        );
        ERR_INVALID_ARGUMENT
    }
}

/// Hybrid open: decrypt a hybrid sealed message using X25519 + ML-KEM-1024
///
/// # Safety
/// Caller must ensure:
/// - x25519_sec is 32 bytes (recipient X25519 secret key)
/// - mlkem_sec is 1568 bytes (recipient ML-KEM-1024 decapsulation key)
/// - sealed_ptr/sealed_len are valid
/// - out_ptr has capacity for plaintext (sealed_len - 1640)
#[no_mangle]
pub extern "C" fn qav_pqc_open(
    x25519_sec: *const u8,
    mlkem_sec: *const u8,
    mlkem_sec_len: usize,
    sealed_ptr: *const u8,
    sealed_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if x25519_sec.is_null()
        || mlkem_sec.is_null()
        || sealed_ptr.is_null()
        || out_ptr.is_null()
        || out_len.is_null()
    {
        return ERR_INVALID_ARGUMENT;
    }

    #[cfg(feature = "pqc")]
    {
        use crate::pqc::hybrid::{hybrid_open, HybridSecretKey};

        // PH1-FIX: Wrap FFI unsafe block in catch_unwind to prevent panics from crossing FFI boundary
        // Note: out_capacity check happens inside unsafe block after crypto operation (intentional)
        let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
            let x25519_slice = slice::from_raw_parts(x25519_sec, 32);
            let mlkem_slice = slice::from_raw_parts(mlkem_sec, mlkem_sec_len);
            let sealed = slice::from_raw_parts(sealed_ptr, sealed_len);

            let mut x25519_bytes = [0u8; 32];
            x25519_bytes.copy_from_slice(x25519_slice);

            let secret = HybridSecretKey {
                x25519: zeroize::Zeroizing::new(x25519_bytes),
                ml_kem: zeroize::Zeroizing::new(mlkem_slice.to_vec()),
            };

            match hybrid_open(&secret, sealed) {
                Ok(plaintext) => {
                    if plaintext.len() > out_capacity {
                        return ERR_BUFFER_TOO_SMALL;
                    }
                    let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                    output[..plaintext.len()].copy_from_slice(&plaintext);
                    *out_len = plaintext.len();
                    ERR_SUCCESS
                }
                Err(e) => crypto_error_to_code(&e),
            }
        }));

        match result {
            Ok(code) => code,
            Err(_) => ERR_MEMORY_ERROR, // PH1-FIX: Prevent panic unwinding across FFI boundary
        }
    }

    #[cfg(not(feature = "pqc"))]
    {
        let _ = (
            x25519_sec,
            mlkem_sec,
            mlkem_sec_len,
            sealed_ptr,
            sealed_len,
            out_ptr,
            out_capacity,
            out_len,
        );
        ERR_INVALID_ARGUMENT
    }
}
