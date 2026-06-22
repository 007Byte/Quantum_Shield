//! Phase 2.7: X25519 Sealed-Box + ECDH Security Tests
//! Comprehensive verification of end-to-end encrypted sharing
//!
//! Tests coverage:
//! - Key pair generation and format
//! - Seal/open roundtrip for various sizes
//! - Wrong recipient key rejection
//! - Ephemeral key randomness
//! - Sealed box size bounds
//! - ECDH key agreement
//! - Authentication tag verification

use usbvault_crypto::sharing;

// ============================================================================
// Key Generation Tests
// ============================================================================

#[test]
fn test_keypair_generation_produces_32_byte_keys() {
    let (public, secret) = sharing::generate_keypair();

    assert_eq!(public.as_bytes().len(), 32, "Public key must be 32 bytes");
    assert_eq!(secret.as_bytes().len(), 32, "Secret key must be 32 bytes");
}

#[test]
fn test_keypair_public_keys_are_unique() {
    let (pub1, _) = sharing::generate_keypair();
    let (pub2, _) = sharing::generate_keypair();

    assert_ne!(
        pub1.as_bytes(),
        pub2.as_bytes(),
        "Different key pairs should have different public keys"
    );
}

#[test]
fn test_keypair_secret_keys_are_unique() {
    let (_, secret1) = sharing::generate_keypair();
    let (_, secret2) = sharing::generate_keypair();

    assert_ne!(
        secret1.as_bytes(),
        secret2.as_bytes(),
        "Different key pairs should have different secret keys"
    );
}

#[test]
fn test_multiple_keypairs_are_all_unique() {
    let mut keypairs = Vec::new();
    for _ in 0..10 {
        keypairs.push(sharing::generate_keypair());
    }

    // Check all public keys are unique
    for i in 0..keypairs.len() {
        for j in (i + 1)..keypairs.len() {
            assert_ne!(
                keypairs[i].0.as_bytes(),
                keypairs[j].0.as_bytes(),
                "All public keys should be unique"
            );
        }
    }
}

#[test]
fn test_public_key_not_all_zeros() {
    for _ in 0..10 {
        let (public, _) = sharing::generate_keypair();
        assert!(
            public.as_bytes().iter().any(|&b| b != 0),
            "Public key should not be all zeros"
        );
    }
}

#[test]
fn test_secret_key_not_all_zeros() {
    for _ in 0..10 {
        let (_, secret) = sharing::generate_keypair();
        assert!(
            secret.as_bytes().iter().any(|&b| b != 0),
            "Secret key should not be all zeros"
        );
    }
}

// ============================================================================
// Seal/Open Roundtrip Tests
// ============================================================================

#[test]
fn test_seal_open_empty_message() {
    let plaintext = b"";

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(
        plaintext,
        opened.as_slice(),
        "Empty message roundtrip must work"
    );
}

#[test]
fn test_seal_open_small_message() {
    let plaintext = b"Hello";

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(
        plaintext,
        opened.as_slice(),
        "Small message roundtrip must work"
    );
}

#[test]
fn test_seal_open_message_1_byte() {
    let plaintext = [0x42u8];

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, &plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(
        plaintext.to_vec(),
        opened,
        "1-byte message roundtrip must work"
    );
}

#[test]
fn test_seal_open_message_100_bytes() {
    let plaintext = vec![0x55u8; 100];

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, &plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(plaintext, opened, "100-byte message roundtrip must work");
}

#[test]
fn test_seal_open_message_64kb() {
    let plaintext = vec![0xAAu8; 65536];

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, &plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(plaintext, opened, "64KB message roundtrip must work");
}

#[test]
fn test_seal_open_message_1mb() {
    let plaintext = vec![0xBBu8; 1_000_000];

    let (public, secret) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, &plaintext).expect("Seal failed");
    let opened = sharing::open(&secret, &sealed).expect("Open failed");

    assert_eq!(plaintext, opened, "1MB message roundtrip must work");
}

#[test]
fn test_seal_open_various_patterns() {
    let pattern3 = "X".repeat(1000);
    let test_patterns = vec![
        (b"pattern1" as &[u8], "8 bytes"),
        (b"The quick brown fox jumps over the lazy dog", "phrase"),
        (pattern3.as_bytes(), "1000 chars"),
    ];

    for (plaintext, description) in test_patterns {
        let (public, secret) = sharing::generate_keypair();
        let sealed = sharing::seal(&public, plaintext)
            .unwrap_or_else(|_| panic!("Seal failed for {}", description));
        let opened = sharing::open(&secret, &sealed)
            .unwrap_or_else(|_| panic!("Open failed for {}", description));

        assert_eq!(
            plaintext,
            opened.as_slice(),
            "Pattern {} must roundtrip",
            description
        );
    }
}

// ============================================================================
// Wrong Recipient Key Tests
// ============================================================================

#[test]
fn test_cannot_open_with_wrong_recipient_key() {
    let plaintext = b"Only for Alice";

    let (alice_public, _alice_secret) = sharing::generate_keypair();
    let (_bob_public, bob_secret) = sharing::generate_keypair();

    let sealed = sharing::seal(&alice_public, plaintext).expect("Seal failed");
    let result = sharing::open(&bob_secret, &sealed);

    assert!(
        result.is_err(),
        "Bob should not be able to decrypt message sealed for Alice"
    );
}

#[test]
fn test_cannot_open_with_multiple_wrong_keys() {
    let plaintext = b"Secret message";

    let (alice_public, _) = sharing::generate_keypair();
    let sealed = sharing::seal(&alice_public, plaintext).expect("Seal failed");

    // Try decrypting with multiple different keys
    for _ in 0..5 {
        let (_, wrong_secret) = sharing::generate_keypair();
        let result = sharing::open(&wrong_secret, &sealed);
        assert!(result.is_err(), "Opening with wrong key must fail");
    }
}

#[test]
fn test_message_confidentiality() {
    // Different people with different keys should not be able to decrypt each other's messages
    let plaintext1 = b"Alice's secret";
    let plaintext2 = b"Bob's secret";

    let (alice_pub, _) = sharing::generate_keypair();
    let (bob_pub, bob_sec) = sharing::generate_keypair();
    let (_carol_pub, carol_sec) = sharing::generate_keypair();

    let sealed_for_alice = sharing::seal(&alice_pub, plaintext1).expect("Seal 1 failed");
    let sealed_for_bob = sharing::seal(&bob_pub, plaintext2).expect("Seal 2 failed");

    // Bob can't read Alice's message
    assert!(
        sharing::open(&bob_sec, &sealed_for_alice).is_err(),
        "Bob cannot read Alice's message"
    );

    // Carol can't read either message
    assert!(
        sharing::open(&carol_sec, &sealed_for_alice).is_err(),
        "Carol cannot read Alice's message"
    );
    assert!(
        sharing::open(&carol_sec, &sealed_for_bob).is_err(),
        "Carol cannot read Bob's message"
    );
}

// ============================================================================
// Ephemeral Key Randomness Tests
// ============================================================================

#[test]
fn test_different_seals_produce_different_ciphertexts() {
    let plaintext = b"Same message";

    let (public, secret) = sharing::generate_keypair();
    let sealed1 = sharing::seal(&public, plaintext).expect("Seal 1 failed");
    let sealed2 = sharing::seal(&public, plaintext).expect("Seal 2 failed");

    assert_ne!(
        sealed1, sealed2,
        "Different ephemeral keys should produce different sealed boxes"
    );

    // Both should decrypt to the same plaintext
    let opened1 = sharing::open(&secret, &sealed1).expect("Open 1 failed");
    let opened2 = sharing::open(&secret, &sealed2).expect("Open 2 failed");

    assert_eq!(plaintext, opened1.as_slice());
    assert_eq!(plaintext, opened2.as_slice());
}

#[test]
fn test_ephemeral_key_entropy() {
    // Multiple seals should show randomness in ephemeral keys
    let plaintext = b"test";
    let (public, _) = sharing::generate_keypair();

    let mut sealed_boxes = Vec::new();
    for _ in 0..10 {
        sealed_boxes.push(sharing::seal(&public, plaintext).expect("Seal failed"));
    }

    // Check that sealed boxes are different (ephemeral keys are random)
    for i in 0..sealed_boxes.len() {
        for j in (i + 1)..sealed_boxes.len() {
            assert_ne!(
                sealed_boxes[i], sealed_boxes[j],
                "Sealed boxes should differ due to random ephemeral keys"
            );
        }
    }
}

// ============================================================================
// Sealed Box Size Tests
// ============================================================================

#[test]
fn test_sealed_box_minimum_size() {
    // Sealed box format: ephemeral_public(32) || nonce(24) || ciphertext || tag(16)
    // Minimum: 32 + 24 + 0 + 16 = 72 bytes

    let plaintext = b"";
    let (public, _) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    assert!(
        sealed.len() >= 72,
        "Sealed box for empty message must be at least 72 bytes (32+24+16)"
    );
}

#[test]
fn test_sealed_box_size_grows_with_plaintext() {
    let (public, _) = sharing::generate_keypair();

    let sizes = [0, 1, 10, 100, 1000];
    let mut sealed_sizes = Vec::new();

    for size in sizes.iter() {
        let plaintext = vec![0u8; *size];
        let sealed = sharing::seal(&public, &plaintext).expect("Seal failed");
        sealed_sizes.push(sealed.len());
    }

    // Sealed box size should grow roughly linearly with plaintext
    for i in 1..sealed_sizes.len() {
        let delta = sealed_sizes[i] - sealed_sizes[i - 1];
        let plaintext_delta = sizes[i] - sizes[i - 1];
        assert_eq!(
            delta, plaintext_delta,
            "Sealed box size should grow exactly by plaintext delta"
        );
    }
}

#[test]
fn test_sealed_box_overhead_constant() {
    let (public, _) = sharing::generate_keypair();

    // Overhead should be: ephemeral(32) + nonce(24) + tag(16) = 72
    let plaintext1 = vec![0u8; 100];
    let plaintext2 = vec![0u8; 200];

    let sealed1 = sharing::seal(&public, &plaintext1).expect("Seal 1 failed");
    let sealed2 = sharing::seal(&public, &plaintext2).expect("Seal 2 failed");

    let overhead = sealed1.len() - plaintext1.len();
    let expected_overhead = 32 + 24 + 16; // ephemeral + nonce + tag

    assert_eq!(
        overhead, expected_overhead,
        "Overhead must be constant 72 bytes"
    );

    let delta = sealed2.len() - sealed1.len();
    assert_eq!(
        delta, 100,
        "Growing plaintext by 100 should grow sealed box by 100"
    );
}

// ============================================================================
// ECDH Key Agreement Tests
// ============================================================================

#[test]
fn test_ecdh_forward_secrecy() {
    // Same plaintext with different ephemeral keys should produce different seals
    let plaintext = b"Message";
    let (public, secret) = sharing::generate_keypair();

    let sealed1 = sharing::seal(&public, plaintext).expect("Seal 1 failed");
    let sealed2 = sharing::seal(&public, plaintext).expect("Seal 2 failed");

    assert_ne!(
        sealed1, sealed2,
        "Different ephemeral keys provide forward secrecy"
    );

    // Both decrypt correctly
    let open1 = sharing::open(&secret, &sealed1).expect("Open 1 failed");
    let open2 = sharing::open(&secret, &sealed2).expect("Open 2 failed");

    assert_eq!(open1, open2, "Both seals contain same plaintext");
}

#[test]
fn test_sealed_box_contains_ephemeral_public_key() {
    // First 32 bytes of sealed box should be ephemeral public key
    let plaintext = b"test";
    let (public, _) = sharing::generate_keypair();

    let sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Extract ephemeral public key (first 32 bytes)
    let ephemeral_pubkey = &sealed[0..32];

    // Ephemeral key should have entropy (not all zeros)
    assert!(
        ephemeral_pubkey.iter().any(|&b| b != 0),
        "Ephemeral public key should not be all zeros"
    );

    // Different seals should have different ephemeral keys
    let sealed2 = sharing::seal(&public, plaintext).expect("Seal 2 failed");
    let ephemeral_pubkey2 = &sealed2[0..32];

    assert_ne!(
        ephemeral_pubkey, ephemeral_pubkey2,
        "Ephemeral keys should be different"
    );
}

#[test]
fn test_sealed_box_nonce_location() {
    // Nonce should be at bytes 32-56 (24 bytes)
    let plaintext = b"test";
    let (public, _) = sharing::generate_keypair();
    let sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Verify structure: ephemeral(0-32) || nonce(32-56) || ciphertext(56+)
    assert!(sealed.len() >= 56, "Sealed box must have ephemeral+nonce");

    let nonce = &sealed[32..56];

    // Nonce should have entropy
    assert!(
        nonce.iter().any(|&b| b != 0),
        "Nonce should not be all zeros"
    );

    // Different encryptions should have different nonces
    let sealed2 = sharing::seal(&public, plaintext).expect("Seal 2 failed");
    let nonce2 = &sealed2[32..56];

    assert_ne!(nonce, nonce2, "Nonces should be different across seals");
}

// ============================================================================
// Authentication Tag Verification Tests
// ============================================================================

#[test]
fn test_corrupted_ciphertext_fails_authentication() {
    let plaintext = b"Sensitive data";

    let (public, secret) = sharing::generate_keypair();
    let mut sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Corrupt ciphertext (skip ephemeral and nonce, tamper with encrypted data)
    if sealed.len() > 60 {
        sealed[60] ^= 0xFF;
    }

    let result = sharing::open(&secret, &sealed);
    assert!(
        result.is_err(),
        "Corrupted ciphertext must fail authentication"
    );
}

#[test]
fn test_corrupted_ephemeral_key_fails_decryption() {
    let plaintext = b"Secret";

    let (public, secret) = sharing::generate_keypair();
    let mut sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Corrupt ephemeral public key (first 32 bytes)
    if !sealed.is_empty() {
        sealed[0] ^= 0xFF;
    }

    let result = sharing::open(&secret, &sealed);
    assert!(
        result.is_err(),
        "Corrupted ephemeral key must fail decryption"
    );
}

#[test]
fn test_corrupted_nonce_fails_decryption() {
    let plaintext = b"Data";

    let (public, secret) = sharing::generate_keypair();
    let mut sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Corrupt nonce (bytes 32-56)
    if sealed.len() > 32 {
        sealed[32] ^= 0xFF;
    }

    let result = sharing::open(&secret, &sealed);
    assert!(result.is_err(), "Corrupted nonce must fail decryption");
}

#[test]
fn test_truncated_sealed_box_fails() {
    let plaintext = b"Message";

    let (public, secret) = sharing::generate_keypair();
    let mut sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Truncate sealed box (remove last 20 bytes)
    if sealed.len() > 20 {
        sealed.truncate(sealed.len() - 20);
    }

    let result = sharing::open(&secret, &sealed);
    assert!(result.is_err(), "Truncated sealed box must fail");
}

#[test]
fn test_short_sealed_box_fails() {
    let (_public, secret) = sharing::generate_keypair();

    // Sealed box too short to contain header
    let short_box = vec![0u8; 30];

    let result = sharing::open(&secret, &short_box);
    assert!(result.is_err(), "Too-short sealed box must fail");
}

#[test]
fn test_extended_sealed_box_fails() {
    // Adding bytes to end should fail authentication
    let plaintext = b"Test";

    let (public, secret) = sharing::generate_keypair();
    let mut sealed = sharing::seal(&public, plaintext).expect("Seal failed");

    // Append garbage data
    sealed.extend_from_slice(&[0xFFu8; 10]);

    let result = sharing::open(&secret, &sealed);
    assert!(result.is_err(), "Extended sealed box must fail");
}

// ============================================================================
// ECDH Interoperability Tests
// ============================================================================

#[test]
fn test_ecdh_symmetric_decryption() {
    // Two parties can establish shared secret via ECDH
    let (pub_alice, sec_alice) = sharing::generate_keypair();
    let (pub_bob, sec_bob) = sharing::generate_keypair();

    // Alice sends message to Bob
    let msg_from_alice = b"Hello Bob";
    let sealed = sharing::seal(&pub_bob, msg_from_alice).expect("Seal failed");
    let opened_by_bob = sharing::open(&sec_bob, &sealed).expect("Open failed");

    assert_eq!(msg_from_alice, opened_by_bob.as_slice());

    // Bob sends message back to Alice
    let msg_from_bob = b"Hello Alice";
    let sealed_back = sharing::seal(&pub_alice, msg_from_bob).expect("Seal failed");
    let opened_by_alice = sharing::open(&sec_alice, &sealed_back).expect("Open failed");

    assert_eq!(msg_from_bob, opened_by_alice.as_slice());
}

#[test]
fn test_multiple_recipients_independence() {
    let plaintext = b"Broadcast message";

    let (alice_pub, alice_sec) = sharing::generate_keypair();
    let (bob_pub, bob_sec) = sharing::generate_keypair();
    let (carol_pub, carol_sec) = sharing::generate_keypair();

    // Same plaintext sealed for different recipients
    let sealed_alice = sharing::seal(&alice_pub, plaintext).expect("Seal for Alice failed");
    let sealed_bob = sharing::seal(&bob_pub, plaintext).expect("Seal for Bob failed");
    let sealed_carol = sharing::seal(&carol_pub, plaintext).expect("Seal for Carol failed");

    // Each can decrypt their own
    assert_eq!(
        plaintext,
        sharing::open(&alice_sec, &sealed_alice)
            .expect("Alice open failed")
            .as_slice()
    );
    assert_eq!(
        plaintext,
        sharing::open(&bob_sec, &sealed_bob)
            .expect("Bob open failed")
            .as_slice()
    );
    assert_eq!(
        plaintext,
        sharing::open(&carol_sec, &sealed_carol)
            .expect("Carol open failed")
            .as_slice()
    );

    // Cross-decryption fails
    assert!(sharing::open(&bob_sec, &sealed_alice).is_err());
    assert!(sharing::open(&carol_sec, &sealed_bob).is_err());
    assert!(sharing::open(&alice_sec, &sealed_carol).is_err());
}
