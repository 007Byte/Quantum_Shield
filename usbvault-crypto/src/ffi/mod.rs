//! C ABI FFI exports for USBVault React Native integration

// These are `extern "C"` exports that intentionally take raw pointers across the
// C ABI boundary; their safety contracts are documented in each `# Safety` section
// and enforced via `panic::catch_unwind`. Marking every export `unsafe fn` would
// change the generated C header surface, so we allow the lint module-wide instead.
#![allow(clippy::not_unsafe_ptr_arg_deref)]

use crate::cipher::{self, CipherId};
use crate::error::CryptoError;
use crate::kdf::{derive_master_key, generate_salt};
use crate::sharing::{self, SharePublicKey, ShareSecretKey};
use crate::streaming::{StreamingDecryptor, StreamingEncryptor};
use crate::vault::header::VaultHeader;
use crate::vault::index::VaultIndex;
use std::panic;
use std::slice;
use zeroize::Zeroizing;

// Platform-specific FFI modules
#[cfg(target_os = "ios")]
mod ios;

#[cfg(target_os = "android")]
mod android;

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
mod desktop;

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
const ERR_PASSWORD_WRONG: i32 = -17;
const ERR_FAIL_COUNTER_TAMPERED: i32 = -18;
const ERR_FAIL_COUNTER_EXCEEDED: i32 = -19;
#[allow(dead_code)]
const ERR_ROLLBACK_DETECTED: i32 = -20;
const ERR_SELF_DESTRUCTED: i32 = -21;
const ERR_DISK_FULL: i32 = -22;
const ERR_FILE_NOT_FOUND: i32 = -23;
const ERR_TFA_FAILED: i32 = -24;
const ERR_NO_AUTHENTICATOR: i32 = -25;
const ERR_LOCKED_OUT: i32 = -26;

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
        CryptoError::RollbackDetected => ERR_ROLLBACK_DETECTED,
        CryptoError::InvalidInput(_) => ERR_INVALID_ARGUMENT,
        CryptoError::PasswordWrong => ERR_PASSWORD_WRONG,
        CryptoError::FailCounterTampered => ERR_FAIL_COUNTER_TAMPERED,
        CryptoError::FailCounterExceeded => ERR_FAIL_COUNTER_EXCEEDED,
        CryptoError::SelfDestructed => ERR_SELF_DESTRUCTED,
        CryptoError::DiskFull => ERR_DISK_FULL,
        CryptoError::FileNotFound => ERR_FILE_NOT_FOUND,
        CryptoError::TfaFailed => ERR_TFA_FAILED,
        CryptoError::NoAuthenticator => ERR_NO_AUTHENTICATOR,
        CryptoError::LockedOut => ERR_LOCKED_OUT,
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
pub extern "C" fn usbvault_derive_key(
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
pub extern "C" fn usbvault_encrypt(
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
pub extern "C" fn usbvault_decrypt(
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
pub extern "C" fn usbvault_generate_keypair(public_out: *mut u8, secret_out: *mut u8) -> i32 {
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
pub extern "C" fn usbvault_seal(
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
pub extern "C" fn usbvault_open(
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
pub extern "C" fn usbvault_free(_ptr: *mut u8, _len: usize) -> i32 {
    // Memory is managed by Rust, so freeing is not necessary.
    // Return error code to signal this operation is not supported.
    ERR_INVALID_ARGUMENT
}

/// Generate a random salt
///
/// # Safety
/// Caller must ensure out can hold 32 bytes
#[no_mangle]
pub extern "C" fn usbvault_generate_salt(out: *mut u8) -> i32 {
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
/// - mlkem_pub_out can hold 1568 bytes (ML-KEM-1024 encapsulation key)
/// - x25519_sec_out can hold 32 bytes
/// - mlkem_sec_out can hold 3168 bytes (ML-KEM-1024 decapsulation key, FIPS 203)
///
/// # Returns
/// ERR_SUCCESS (0) on success, or ERR_INVALID_ARGUMENT if pqc feature not enabled
#[no_mangle]
pub extern "C" fn usbvault_pqc_generate_keypair(
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
pub extern "C" fn usbvault_pqc_seal(
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
pub extern "C" fn usbvault_pqc_open(
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
                x25519: Zeroizing::new(x25519_bytes),
                ml_kem: Zeroizing::new(mlkem_slice.to_vec()),
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

// ═══════════════════════════════════════════════════════════════
// P0: Vault Container FFI Operations
// VAULT.bin header, index, record, and fail counter management
// ═══════════════════════════════════════════════════════════════

/// A1: Create a new V4 vault header from password.
///
/// Returns header bytes (24576) + enc_key (32) + hmac_key (32) = 24640 bytes total.
/// The enc_key and hmac_key are the MEK halves for immediate use.
/// Caller MUST zero them after writing the initial empty index.
///
/// # Safety
/// - password_ptr/password_len: valid UTF-8 password
/// - cipher_id: 2 (XChaCha20) or 3 (AES-GCM-SIV)
/// - out_ptr: capacity >= 24640 bytes
/// - out_len: valid pointer for writing
#[no_mangle]
pub extern "C" fn usbvault_vault_create_header(
    password_ptr: *const u8,
    password_len: usize,
    cipher_id: u8,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if password_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let password = slice::from_raw_parts(password_ptr, password_len);

        let cipher = match CipherId::from_byte(cipher_id) {
            Ok(c) => c,
            Err(e) => return crypto_error_to_code(&e),
        };

        match VaultHeader::create_new(password, cipher) {
            Ok((header, enc_key, hmac_key)) => {
                let header_bytes = header.write();
                let total_len = header_bytes.len() + 32 + 32;

                if total_len > out_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }

                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[..header_bytes.len()].copy_from_slice(&header_bytes);
                output[header_bytes.len()..header_bytes.len() + 32].copy_from_slice(&enc_key);
                output[header_bytes.len() + 32..header_bytes.len() + 64].copy_from_slice(&hmac_key);
                *out_len = total_len;
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A2: Parse header bytes into JSON metadata (no secrets exposed).
///
/// Returns JSON string with: version, saltHex, activeIndexSlot,
/// index1Offset, index1Length, index2Offset, index2Length,
/// commitCounter, stateVersion, hasWrappedMek, indexEncrypted
///
/// # Safety
/// - header_ptr/header_len: valid header bytes
/// - out_json_ptr: capacity for JSON string
/// - out_json_len: valid pointer
#[no_mangle]
pub extern "C" fn usbvault_vault_read_header(
    header_ptr: *const u8,
    header_len: usize,
    out_json_ptr: *mut u8,
    out_json_capacity: usize,
    out_json_len: *mut usize,
) -> i32 {
    if header_ptr.is_null() || out_json_ptr.is_null() || out_json_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let data = slice::from_raw_parts(header_ptr, header_len);

        match VaultHeader::read(data) {
            Ok(header) => {
                let salt_hex = hex::encode(header.salt);
                let json = format!(
                    r#"{{"version":{},"saltHex":"{}","activeIndexSlot":{},"index1Offset":{},"index1Length":{},"index2Offset":{},"index2Length":{},"commitCounter":{},"stateVersion":{},"hasWrappedMek":{},"indexEncrypted":{},"cipherId":{},"kdfHashId":{}}}"#,
                    header.version,
                    salt_hex,
                    header.active_index_slot,
                    header.index1_offset,
                    header.index1_length,
                    header.index2_offset,
                    header.index2_length,
                    header.commit_counter,
                    header.state_version,
                    header.wrapped_mek.is_some(),
                    header.index_encrypted,
                    header.cipher_id,
                    header.kdf_hash_id,
                );

                if json.len() > out_json_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }

                let output = slice::from_raw_parts_mut(out_json_ptr, out_json_capacity);
                output[..json.len()].copy_from_slice(json.as_bytes());
                *out_json_len = json.len();
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A3: Unlock a vault header with password.
///
/// Returns enc_key (32 bytes) + hmac_key (32 bytes) = 64 bytes total.
/// These are the MEK halves needed for all subsequent operations.
///
/// # Safety
/// - header_ptr/header_len: valid header bytes (24576 for V4)
/// - password_ptr/password_len: valid password
/// - out_ptr: capacity >= 64 bytes
/// - out_len: valid pointer
#[no_mangle]
pub extern "C" fn usbvault_vault_unlock(
    header_ptr: *const u8,
    header_len: usize,
    password_ptr: *const u8,
    password_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if header_ptr.is_null() || password_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let data = slice::from_raw_parts(header_ptr, header_len);
        let password = slice::from_raw_parts(password_ptr, password_len);

        let header = match VaultHeader::read(data) {
            Ok(h) => h,
            Err(e) => return crypto_error_to_code(&e),
        };

        match header.unlock(password) {
            Ok((enc_key, hmac_key)) => {
                if out_capacity < 64 {
                    return ERR_BUFFER_TOO_SMALL;
                }

                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[..32].copy_from_slice(&enc_key);
                output[32..64].copy_from_slice(&hmac_key);
                *out_len = 64;
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A4: Encrypt a VaultIndex JSON blob.
///
/// # Safety
/// - master_key_ptr: 32-byte encryption key (MEK enc half)
/// - index_json_ptr/index_json_len: valid JSON bytes
/// - out_ptr: capacity for encrypted blob (JSON + nonce + tag overhead)
#[no_mangle]
pub extern "C" fn usbvault_vault_encrypt_index(
    master_key_ptr: *const u8,
    master_key_len: usize,
    index_json_ptr: *const u8,
    index_json_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if master_key_ptr.is_null()
        || index_json_ptr.is_null()
        || out_ptr.is_null()
        || out_len.is_null()
    {
        return ERR_INVALID_ARGUMENT;
    }
    if master_key_len != 32 {
        return ERR_INVALID_KEY;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let key_slice = slice::from_raw_parts(master_key_ptr, 32);
        let json_data = slice::from_raw_parts(index_json_ptr, index_json_len);

        let mut key = [0u8; 32];
        key.copy_from_slice(key_slice);

        let index = match VaultIndex::from_json(json_data) {
            Ok(idx) => idx,
            Err(e) => return crypto_error_to_code(&e),
        };

        match index.encrypt(&key) {
            Ok(encrypted) => {
                if encrypted.len() > out_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }
                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[..encrypted.len()].copy_from_slice(&encrypted);
                *out_len = encrypted.len();
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A5: Decrypt an encrypted VaultIndex blob back to JSON.
///
/// # Safety
/// - master_key_ptr: 32-byte encryption key
/// - encrypted_ptr/encrypted_len: encrypted blob from encrypt_index
/// - out_json_ptr: capacity for JSON output
#[no_mangle]
pub extern "C" fn usbvault_vault_decrypt_index(
    master_key_ptr: *const u8,
    master_key_len: usize,
    encrypted_ptr: *const u8,
    encrypted_len: usize,
    out_json_ptr: *mut u8,
    out_json_capacity: usize,
    out_json_len: *mut usize,
) -> i32 {
    if master_key_ptr.is_null()
        || encrypted_ptr.is_null()
        || out_json_ptr.is_null()
        || out_json_len.is_null()
    {
        return ERR_INVALID_ARGUMENT;
    }
    if master_key_len != 32 {
        return ERR_INVALID_KEY;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let key_slice = slice::from_raw_parts(master_key_ptr, 32);
        let encrypted = slice::from_raw_parts(encrypted_ptr, encrypted_len);

        let mut key = [0u8; 32];
        key.copy_from_slice(key_slice);

        match VaultIndex::decrypt(&key, encrypted) {
            Ok(index) => match index.to_json() {
                Ok(json) => {
                    if json.len() > out_json_capacity {
                        return ERR_BUFFER_TOO_SMALL;
                    }
                    let output = slice::from_raw_parts_mut(out_json_ptr, out_json_capacity);
                    output[..json.len()].copy_from_slice(&json);
                    *out_json_len = json.len();
                    ERR_SUCCESS
                }
                Err(e) => crypto_error_to_code(&e),
            },
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A6: Encrypt a file as a V2RC chunked AEAD record.
///
/// # Safety
/// - key_ptr: 32-byte encryption key (per-file key)
/// - cipher_id: 2 or 3
/// - filename_ptr/filename_len: file name
/// - data_ptr/data_len: file content
/// - out_ptr: capacity for V2RC record (data + overhead)
#[no_mangle]
pub extern "C" fn usbvault_vault_encrypt_record(
    key_ptr: *const u8,
    key_len: usize,
    cipher_id: u8,
    filename_ptr: *const u8,
    filename_len: usize,
    data_ptr: *const u8,
    data_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if key_ptr.is_null()
        || filename_ptr.is_null()
        || data_ptr.is_null()
        || out_ptr.is_null()
        || out_len.is_null()
    {
        return ERR_INVALID_ARGUMENT;
    }
    if key_len != 32 {
        return ERR_INVALID_KEY;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let key_slice = slice::from_raw_parts(key_ptr, 32);
        let filename_bytes = slice::from_raw_parts(filename_ptr, filename_len);
        let data = slice::from_raw_parts(data_ptr, data_len);

        let mut key = [0u8; 32];
        key.copy_from_slice(key_slice);

        let cipher = match CipherId::from_byte(cipher_id) {
            Ok(c) => c,
            Err(e) => return crypto_error_to_code(&e),
        };

        let filename = match std::str::from_utf8(filename_bytes) {
            Ok(s) => s,
            Err(_) => return ERR_INVALID_ARGUMENT,
        };

        let mut encryptor = StreamingEncryptor::new(cipher, &key);
        match encryptor.encrypt_record(filename, data) {
            Ok(record) => {
                if record.len() > out_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }
                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[..record.len()].copy_from_slice(&record);
                *out_len = record.len();
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A7: Decrypt a V2RC record back to filename + file data.
///
/// Output layout: filename_len(4 LE) + filename + data
///
/// # Safety
/// - key_ptr: 32-byte key
/// - record_ptr/record_len: V2RC record bytes
/// - out_ptr: capacity for filename_len(4) + filename + data
#[no_mangle]
pub extern "C" fn usbvault_vault_decrypt_record(
    key_ptr: *const u8,
    key_len: usize,
    cipher_id: u8,
    record_ptr: *const u8,
    record_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if key_ptr.is_null() || record_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }
    if key_len != 32 {
        return ERR_INVALID_KEY;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let key_slice = slice::from_raw_parts(key_ptr, 32);
        let record = slice::from_raw_parts(record_ptr, record_len);

        let mut key = [0u8; 32];
        key.copy_from_slice(key_slice);

        let cipher = match CipherId::from_byte(cipher_id) {
            Ok(c) => c,
            Err(e) => return crypto_error_to_code(&e),
        };

        match StreamingDecryptor::decrypt_record(cipher, &key, record) {
            Ok((filename, data)) => {
                // Output: filename_len(4 LE) + filename_bytes + data_bytes
                let fname_bytes = filename.as_bytes();
                let total = 4 + fname_bytes.len() + data.len();

                if total > out_capacity {
                    return ERR_BUFFER_TOO_SMALL;
                }

                let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
                output[..4].copy_from_slice(&(fname_bytes.len() as u32).to_le_bytes());
                output[4..4 + fname_bytes.len()].copy_from_slice(fname_bytes);
                output[4 + fname_bytes.len()..total].copy_from_slice(&data);
                *out_len = total;
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A8: Read and verify the fail counter from header bytes.
///
/// Returns the counter value in out_count on success.
/// Returns ERR_FAIL_COUNTER_TAMPERED if HMAC verification fails.
///
/// # Safety
/// - header_ptr/header_len: valid header bytes
/// - hmac_key_ptr: 32-byte HMAC key (MEK hmac half)
/// - out_count: valid pointer for writing u32
#[no_mangle]
pub extern "C" fn usbvault_vault_fail_counter_read(
    header_ptr: *const u8,
    header_len: usize,
    hmac_key_ptr: *const u8,
    hmac_key_len: usize,
    out_count: *mut u32,
) -> i32 {
    if header_ptr.is_null() || hmac_key_ptr.is_null() || out_count.is_null() {
        return ERR_INVALID_ARGUMENT;
    }
    if hmac_key_len != 32 {
        return ERR_INVALID_KEY;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let data = slice::from_raw_parts(header_ptr, header_len);
        let key_slice = slice::from_raw_parts(hmac_key_ptr, 32);

        let mut hmac_key = [0u8; 32];
        hmac_key.copy_from_slice(key_slice);

        let header = match VaultHeader::read(data) {
            Ok(h) => h,
            Err(e) => return crypto_error_to_code(&e),
        };

        match header.read_fail_counter(&hmac_key) {
            Ok(count) => {
                *out_count = count;
                ERR_SUCCESS
            }
            Err(e) => crypto_error_to_code(&e),
        }
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A9: Increment the fail counter and return updated header bytes.
///
/// # Safety
/// - header_ptr/header_len: valid header bytes
/// - hmac_key_ptr: 32-byte HMAC key
/// - out_ptr: capacity >= header size (24576 for V4)
#[no_mangle]
pub extern "C" fn usbvault_vault_fail_counter_increment(
    header_ptr: *const u8,
    header_len: usize,
    hmac_key_ptr: *const u8,
    hmac_key_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if header_ptr.is_null() || hmac_key_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }
    if hmac_key_len != 32 {
        return ERR_INVALID_KEY;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let data = slice::from_raw_parts(header_ptr, header_len);
        let key_slice = slice::from_raw_parts(hmac_key_ptr, 32);

        let mut hmac_key = [0u8; 32];
        hmac_key.copy_from_slice(key_slice);

        let mut header = match VaultHeader::read(data) {
            Ok(h) => h,
            Err(e) => return crypto_error_to_code(&e),
        };

        // Read current count (verify HMAC)
        let current = match header.read_fail_counter(&hmac_key) {
            Ok(c) => c,
            Err(e) => return crypto_error_to_code(&e),
        };

        let new_count = current.saturating_add(1);

        // Check if exceeded
        if new_count >= VaultHeader::MAX_FAIL_ATTEMPTS {
            // Self-destruct: zero wrapped MEK
            header.self_destruct(&hmac_key);
            let bytes = header.write();
            if bytes.len() > out_capacity {
                return ERR_BUFFER_TOO_SMALL;
            }
            let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
            output[..bytes.len()].copy_from_slice(&bytes);
            *out_len = bytes.len();
            return ERR_FAIL_COUNTER_EXCEEDED;
        }

        // Write new count with HMAC
        header.write_fail_counter(&hmac_key, new_count);
        header.increment_state_version();
        header.header_hmac = header.compute_hmac(&hmac_key);

        let bytes = header.write();
        if bytes.len() > out_capacity {
            return ERR_BUFFER_TOO_SMALL;
        }
        let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
        output[..bytes.len()].copy_from_slice(&bytes);
        *out_len = bytes.len();
        ERR_SUCCESS
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A10: Reset the fail counter to 0 and return updated header bytes.
///
/// Called after successful unlock.
///
/// # Safety
/// - header_ptr/header_len: valid header bytes
/// - hmac_key_ptr: 32-byte HMAC key
/// - out_ptr: capacity >= header size
#[no_mangle]
pub extern "C" fn usbvault_vault_fail_counter_reset(
    header_ptr: *const u8,
    header_len: usize,
    hmac_key_ptr: *const u8,
    hmac_key_len: usize,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if header_ptr.is_null() || hmac_key_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }
    if hmac_key_len != 32 {
        return ERR_INVALID_KEY;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let data = slice::from_raw_parts(header_ptr, header_len);
        let key_slice = slice::from_raw_parts(hmac_key_ptr, 32);

        let mut hmac_key = [0u8; 32];
        hmac_key.copy_from_slice(key_slice);

        let mut header = match VaultHeader::read(data) {
            Ok(h) => h,
            Err(e) => return crypto_error_to_code(&e),
        };

        // Fail-counter reset is the natural post-unlock re-save point: migrate a
        // legacy V4 vault to the wide, downgrade-resistant V5 header MAC here.
        header.upgrade_to_v5_if_eligible();

        header.write_fail_counter(&hmac_key, 0);
        header.increment_state_version();
        header.header_hmac = header.compute_hmac(&hmac_key);

        let bytes = header.write();
        if bytes.len() > out_capacity {
            return ERR_BUFFER_TOO_SMALL;
        }
        let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
        output[..bytes.len()].copy_from_slice(&bytes);
        *out_len = bytes.len();
        ERR_SUCCESS
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}

/// A11: Commit a new index — flip active slot, update offset/length, increment counters.
///
/// This is the atomic dual-index commit operation.
///
/// # Safety
/// - header_ptr/header_len: valid header bytes
/// - hmac_key_ptr: 32-byte HMAC key
/// - new_index_offset/new_index_length: the offset and size of the newly written index blob
/// - out_ptr: capacity >= header size
#[no_mangle]
pub extern "C" fn usbvault_vault_commit_index(
    header_ptr: *const u8,
    header_len: usize,
    hmac_key_ptr: *const u8,
    hmac_key_len: usize,
    new_index_offset: u32,
    new_index_length: u32,
    out_ptr: *mut u8,
    out_capacity: usize,
    out_len: *mut usize,
) -> i32 {
    if header_ptr.is_null() || hmac_key_ptr.is_null() || out_ptr.is_null() || out_len.is_null() {
        return ERR_INVALID_ARGUMENT;
    }
    if hmac_key_len != 32 {
        return ERR_INVALID_KEY;
    }

    let result = panic::catch_unwind(panic::AssertUnwindSafe(|| unsafe {
        let data = slice::from_raw_parts(header_ptr, header_len);
        let key_slice = slice::from_raw_parts(hmac_key_ptr, 32);

        let mut hmac_key = [0u8; 32];
        hmac_key.copy_from_slice(key_slice);

        let mut header = match VaultHeader::read(data) {
            Ok(h) => h,
            Err(e) => return crypto_error_to_code(&e),
        };

        header.commit_new_index(&hmac_key, new_index_offset, new_index_length);

        let bytes = header.write();
        if bytes.len() > out_capacity {
            return ERR_BUFFER_TOO_SMALL;
        }
        let output = slice::from_raw_parts_mut(out_ptr, out_capacity);
        output[..bytes.len()].copy_from_slice(&bytes);
        *out_len = bytes.len();
        ERR_SUCCESS
    }));

    match result {
        Ok(code) => code,
        Err(_) => ERR_MEMORY_ERROR,
    }
}
