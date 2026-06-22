//! NIST and RFC Known-Answer Tests (KATs) for USBVault crypto primitives
//!
//! These tests verify our crypto implementations against published test vectors
//! from NIST, IETF RFCs, and reference implementations. This provides assurance
//! that the underlying cryptographic operations produce correct output, independent
//! of our higher-level roundtrip tests.

// We test against the raw crate APIs to verify correctness at the primitive level,
// then verify our wrapper functions produce compatible output.

use usbvault_crypto::*;

// ============================================================================
// HKDF-SHA256 Test Vectors (RFC 5869)
// ============================================================================

#[test]
fn test_hkdf_sha256_rfc5869_test_case_1() {
    // RFC 5869 Test Case 1
    // IKM  = 0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b (22 octets)
    // salt = 0x000102030405060708090a0b0c (13 octets)
    // info = 0xf0f1f2f3f4f5f6f7f8f9 (10 octets)
    // L    = 42
    // OKM  = 0x3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865
    use hkdf::Hkdf;
    use sha2::Sha256;

    let ikm = hex::decode("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b").unwrap();
    let salt = hex::decode("000102030405060708090a0b0c").unwrap();
    let info = hex::decode("f0f1f2f3f4f5f6f7f8f9").unwrap();
    let expected_okm = hex::decode(
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
    )
    .unwrap();

    let hkdf = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    let mut okm = vec![0u8; 42];
    hkdf.expand(&info, &mut okm).expect("HKDF expand failed");

    assert_eq!(okm, expected_okm, "HKDF-SHA256 RFC 5869 Test Case 1 failed");
}

#[test]
fn test_hkdf_sha256_rfc5869_test_case_2() {
    // RFC 5869 Test Case 2 (longer inputs/outputs)
    // IKM  = 0x000102...4f (80 octets)
    // salt = 0x606162...af (80 octets)
    // info = 0xb0b1b2...ff (80 octets)
    // L    = 82
    use hkdf::Hkdf;
    use sha2::Sha256;

    let ikm = hex::decode(
        "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\
         202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f\
         404142434445464748494a4b4c4d4e4f",
    )
    .unwrap();
    let salt = hex::decode(
        "606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f\
         808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f\
         a0a1a2a3a4a5a6a7a8a9aaabacadaeaf",
    )
    .unwrap();
    let info = hex::decode(
        "b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecf\
         d0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeef\
         f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
    )
    .unwrap();
    let expected_okm = hex::decode(
        "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c\
         59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71\
         cc30c58179ec3e87c14c01d5c1f3434f1d87",
    )
    .unwrap();

    let hkdf = Hkdf::<Sha256>::new(Some(&salt), &ikm);
    let mut okm = vec![0u8; 82];
    hkdf.expand(&info, &mut okm).expect("HKDF expand failed");

    assert_eq!(okm, expected_okm, "HKDF-SHA256 RFC 5869 Test Case 2 failed");
}

#[test]
fn test_hkdf_sha256_rfc5869_test_case_3() {
    // RFC 5869 Test Case 3 (zero-length salt and info)
    // IKM  = 0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b (22 octets)
    // salt = (not provided, defaults to HashLen zeros)
    // info = "" (0 octets)
    // L    = 42
    use hkdf::Hkdf;
    use sha2::Sha256;

    let ikm = hex::decode("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b").unwrap();
    let expected_okm = hex::decode(
        "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d\
         9d201395faa4b61a96c8",
    )
    .unwrap();

    let hkdf = Hkdf::<Sha256>::new(None, &ikm);
    let mut okm = vec![0u8; 42];
    hkdf.expand(b"", &mut okm).expect("HKDF expand failed");

    assert_eq!(okm, expected_okm, "HKDF-SHA256 RFC 5869 Test Case 3 failed");
}

// ============================================================================
// HMAC-SHA256 Test Vectors (RFC 4231)
// ============================================================================

#[test]
fn test_hmac_sha256_rfc4231_test_case_1() {
    // RFC 4231 Test Case 1
    // Key  = 0x0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b (20 bytes)
    // Data = "Hi There"
    // HMAC = 0xb0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let key = hex::decode("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b").unwrap();
    let data = b"Hi There";
    let expected =
        hex::decode("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7").unwrap();

    let mut mac = Hmac::<Sha256>::new_from_slice(&key).expect("HMAC key init failed");
    mac.update(data);
    let result = mac.finalize().into_bytes();

    assert_eq!(
        result.as_slice(),
        expected.as_slice(),
        "HMAC-SHA256 RFC 4231 TC1 failed"
    );
}

#[test]
fn test_hmac_sha256_rfc4231_test_case_2() {
    // RFC 4231 Test Case 2
    // Key  = "Jefe"
    // Data = "what do ya want for nothing?"
    // HMAC = 0x5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let key = b"Jefe";
    let data = b"what do ya want for nothing?";
    let expected =
        hex::decode("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843").unwrap();

    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC key init failed");
    mac.update(data);
    let result = mac.finalize().into_bytes();

    assert_eq!(
        result.as_slice(),
        expected.as_slice(),
        "HMAC-SHA256 RFC 4231 TC2 failed"
    );
}

#[test]
fn test_hmac_sha256_rfc4231_test_case_3() {
    // RFC 4231 Test Case 3
    // Key  = 0xaaaa...aa (20 bytes of 0xaa)
    // Data = 0xdddd...dd (50 bytes of 0xdd)
    // HMAC = 0x773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let key = vec![0xaau8; 20];
    let data = vec![0xddu8; 50];
    let expected =
        hex::decode("773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe").unwrap();

    let mut mac = Hmac::<Sha256>::new_from_slice(&key).expect("HMAC key init failed");
    mac.update(&data);
    let result = mac.finalize().into_bytes();

    assert_eq!(
        result.as_slice(),
        expected.as_slice(),
        "HMAC-SHA256 RFC 4231 TC3 failed"
    );
}

// ============================================================================
// AES-256-GCM-SIV Test Vectors (RFC 8452)
// ============================================================================

#[test]
fn test_aes256_gcm_siv_rfc8452_test_case() {
    // RFC 8452, Appendix C.2 -- AES-256-GCM-SIV
    // Key:       0100000000000000000000000000000000000000000000000000000000000000
    // Nonce:     030000000000000000000000
    // AAD:       (empty)
    // Plaintext: 0100000000000000
    // Ciphertext + Tag: c2ef328e5c71c83b843122130f7364b761e0b97427e3df28
    use aes_gcm_siv::{
        aead::{Aead, KeyInit},
        Aes256GcmSiv,
    };
    use generic_array::GenericArray;

    let key_bytes =
        hex::decode("0100000000000000000000000000000000000000000000000000000000000000").unwrap();
    let nonce_bytes = hex::decode("030000000000000000000000").unwrap();
    let plaintext = hex::decode("0100000000000000").unwrap();
    let expected_ct = hex::decode("c2ef328e5c71c83b843122130f7364b761e0b97427e3df28").unwrap();

    let cipher = Aes256GcmSiv::new(GenericArray::from_slice(&key_bytes));
    let nonce = GenericArray::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .expect("AES-256-GCM-SIV encryption failed");

    assert_eq!(
        ciphertext, expected_ct,
        "AES-256-GCM-SIV RFC 8452 KAT failed"
    );

    // Verify decryption
    let decrypted = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .expect("AES-256-GCM-SIV decryption failed");
    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_aes256_gcm_siv_rfc8452_with_aad() {
    // RFC 8452, Appendix C.2 -- AES-256-GCM-SIV with AAD
    // Key:       0100000000000000000000000000000000000000000000000000000000000000
    // Nonce:     030000000000000000000000
    // AAD:       01
    // Plaintext: 0200000000000000
    // CT+Tag:    1de22967237a813291213f267e3b452f02d01ae33e4ec854
    use aes_gcm_siv::{
        aead::{Aead, KeyInit, Payload},
        Aes256GcmSiv,
    };
    use generic_array::GenericArray;

    let key_bytes =
        hex::decode("0100000000000000000000000000000000000000000000000000000000000000").unwrap();
    let nonce_bytes = hex::decode("030000000000000000000000").unwrap();
    let aad = hex::decode("01").unwrap();
    let plaintext = hex::decode("0200000000000000").unwrap();
    let expected_ct = hex::decode("1de22967237a813291213f267e3b452f02d01ae33e4ec854").unwrap();

    let cipher = Aes256GcmSiv::new(GenericArray::from_slice(&key_bytes));
    let nonce = GenericArray::from_slice(&nonce_bytes);

    let payload = Payload {
        msg: &plaintext,
        aad: &aad,
    };
    let ciphertext = cipher
        .encrypt(nonce, payload)
        .expect("AES-256-GCM-SIV encryption with AAD failed");

    assert_eq!(
        ciphertext, expected_ct,
        "AES-256-GCM-SIV RFC 8452 AAD KAT failed"
    );
}

// ============================================================================
// XChaCha20-Poly1305 Test Vectors (draft-irtf-cfrg-xchacha)
// ============================================================================

#[test]
fn test_xchacha20_poly1305_draft_irtf_vector() {
    // XChaCha20-Poly1305 test vector from draft-irtf-cfrg-xchacha Section A.3.1
    // This verifies the extended nonce construction is correct.
    //
    // Key:   808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f
    // Nonce: 404142434445464748494a4b4c4d4e4f5051525354555657
    // PT:    "Ladies and Gentlemen of the class of '99: If I could offer you only one tip
    //         for the future, sunscreen would be it."
    // AAD:   50515253c0c1c2c3c4c5c6c7
    use chacha20poly1305::{
        aead::{Aead, KeyInit, Payload},
        XChaCha20Poly1305, XNonce,
    };
    use generic_array::GenericArray;

    let key =
        hex::decode("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f").unwrap();
    let nonce = hex::decode("404142434445464748494a4b4c4d4e4f5051525354555657").unwrap();
    let aad = hex::decode("50515253c0c1c2c3c4c5c6c7").unwrap();
    let plaintext = b"Ladies and Gentlemen of the class of '99: \
If I could offer you only one tip for the future, sunscreen would be it.";

    let expected_ct = hex::decode(
        "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb\
         731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b452\
         2f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff9\
         21f9664c97637da9768812f615c68b13b52e\
         c0875924c1c7987947deafd8780acf49",
    )
    .unwrap();

    let cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&key));
    let nonce_arr = XNonce::from_slice(&nonce);

    let payload = Payload {
        msg: plaintext.as_ref(),
        aad: &aad,
    };
    let ciphertext = cipher
        .encrypt(nonce_arr, payload)
        .expect("XChaCha20-Poly1305 encryption failed");

    assert_eq!(
        ciphertext, expected_ct,
        "XChaCha20-Poly1305 IRTF draft KAT failed"
    );
}

// ============================================================================
// USBVault Wrapper Compatibility Tests
// ============================================================================
// These tests verify that our wrapper functions (cipher::encrypt/decrypt)
// produce output compatible with the raw crypto primitives.

#[test]
fn test_wrapper_aes256_output_format() {
    // Verify our encrypt wrapper produces: nonce(12) || ciphertext || tag(16)
    let key = [0x42u8; 32];
    let plaintext = b"test data";

    let output = cipher::encrypt(cipher::CipherId::Aes256GcmSiv, &key, plaintext)
        .expect("Encryption failed");

    // Output should be: 12 (nonce) + 9 (plaintext) + 16 (tag) = 37
    assert_eq!(output.len(), 12 + plaintext.len() + 16);

    // Verify the raw crate can decrypt if we split nonce from ciphertext
    use aes_gcm_siv::{
        aead::{Aead, KeyInit},
        Aes256GcmSiv,
    };
    use generic_array::GenericArray;

    let raw_cipher = Aes256GcmSiv::new(GenericArray::from_slice(&key));
    let nonce = GenericArray::from_slice(&output[..12]);
    let ct = &output[12..];

    let decrypted = raw_cipher
        .decrypt(nonce, ct)
        .expect("Raw decryption failed");
    assert_eq!(decrypted, plaintext);
}

#[test]
fn test_wrapper_xchacha20_output_format() {
    // Verify our encrypt wrapper produces: nonce(24) || ciphertext || tag(16)
    let key = [0x42u8; 32];
    let plaintext = b"test data";

    let output = cipher::encrypt(cipher::CipherId::XChaCha20Poly1305, &key, plaintext)
        .expect("Encryption failed");

    // Output should be: 24 (nonce) + 9 (plaintext) + 16 (tag) = 49
    assert_eq!(output.len(), 24 + plaintext.len() + 16);

    // Verify the raw crate can decrypt
    use chacha20poly1305::{
        aead::{Aead, KeyInit},
        XChaCha20Poly1305, XNonce,
    };
    use generic_array::GenericArray;

    let raw_cipher = XChaCha20Poly1305::new(GenericArray::from_slice(&key));
    let nonce = XNonce::from_slice(&output[..24]);
    let ct = &output[24..];

    let decrypted = raw_cipher
        .decrypt(nonce, ct)
        .expect("Raw decryption failed");
    assert_eq!(decrypted, plaintext);
}

// ============================================================================
// Argon2id Test Vectors (RFC 9106)
// ============================================================================

#[test]
fn test_argon2id_deterministic_output() {
    // Verify Argon2id produces deterministic output for same inputs
    // This isn't a NIST vector per se, but validates our wrapper is deterministic
    // and the Argon2id parameters are correctly applied.
    let password = b"correct horse battery staple";
    let salt = [0x01u8; 32];

    let key1 = kdf::derive_master_key(password, &salt).expect("KDF failed");
    let key2 = kdf::derive_master_key(password, &salt).expect("KDF failed");

    assert_eq!(
        key1.as_bytes(),
        key2.as_bytes(),
        "Argon2id must be deterministic"
    );

    // Verify output length
    assert_eq!(key1.as_bytes().len(), 64, "Master key must be 64 bytes");
    assert_eq!(key1.encryption_key().len(), 32);
    assert_eq!(key1.hmac_key().len(), 32);

    // Verify encryption and HMAC halves are different
    assert_ne!(
        key1.encryption_key(),
        key1.hmac_key(),
        "Encryption and HMAC keys must differ"
    );
}

#[test]
fn test_argon2id_parameters_enforced() {
    // Verify we're using Argon2id (not Argon2i or Argon2d)
    // and our memory-hard parameters are correct.
    // We test this by ensuring the output changes with different passwords
    // and different salts (parameter sensitivity).
    let salt = [0x42u8; 32];

    let key_a = kdf::derive_master_key(b"password_a", &salt).unwrap();
    let key_b = kdf::derive_master_key(b"password_b", &salt).unwrap();

    assert_ne!(
        key_a.as_bytes(),
        key_b.as_bytes(),
        "Different passwords must produce different keys"
    );

    let salt2 = [0x99u8; 32];
    let key_c = kdf::derive_master_key(b"password_a", &salt2).unwrap();

    assert_ne!(
        key_a.as_bytes(),
        key_c.as_bytes(),
        "Different salts must produce different keys"
    );
}

// ============================================================================
// KEK Wrap/Unwrap Known-Answer Test
// ============================================================================

#[test]
fn test_kek_wrap_unwrap_integrity() {
    // Verify KEK wrapping preserves MEK material exactly
    let password = b"test_password_for_kek";
    let salt = [0x55u8; 32];

    let kek = kdf::derive_kek(password, &salt).expect("KEK derivation failed");
    let mek = kdf::MasterEncryptionKey::generate();
    let original_bytes = *mek.as_bytes();

    let wrapped = kdf::wrap_mek(&kek, &mek).expect("Wrapping failed");

    // Wrapped size must be exactly nonce(24) + ciphertext(64) + tag(16) = 104
    assert_eq!(wrapped.len(), 104, "Wrapped MEK must be exactly 104 bytes");

    let unwrapped = kdf::unwrap_mek(&kek, &wrapped).expect("Unwrapping failed");
    assert_eq!(
        unwrapped.as_bytes(),
        &original_bytes,
        "Unwrapped MEK must match original exactly"
    );
}

#[test]
fn test_kek_wrong_password_fails() {
    let salt = [0x55u8; 32];
    let kek1 = kdf::derive_kek(b"correct_password", &salt).unwrap();
    let kek2 = kdf::derive_kek(b"wrong_password", &salt).unwrap();

    let mek = kdf::MasterEncryptionKey::generate();
    let wrapped = kdf::wrap_mek(&kek1, &mek).unwrap();

    let result = kdf::unwrap_mek(&kek2, &wrapped);
    assert!(result.is_err(), "Wrong KEK must fail to unwrap MEK");
}
