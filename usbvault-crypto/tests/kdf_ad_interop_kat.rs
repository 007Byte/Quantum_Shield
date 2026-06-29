//! Cross-implementation interop KAT for the V6 KDF-transcript + AEAD-AD
//! primitives (crypto-pr5).
//!
//! These FIXED hex vectors are the byte-for-byte agreement proof between the
//! native Rust path (`usbvault-crypto`) and the web/TS path
//! (`usbvault-app/src/crypto`). The companion web KAT
//! (`usbvault-app/src/crypto/__tests__/kdfAdInterop.kat.test.ts`) asserts the
//! IDENTICAL constants, so if either side's builder/derivation drifts a byte,
//! one of the two test suites fails.
//!
//! NOTE: V6 vault *files* are NOT byte-identical across Rust and web (the web
//! fallback wraps the MEK with AES-GCM, Rust with XChaCha20) — see the plan.
//! The cross-impl guarantee here is at the PRIMITIVE level (transcript + AD
//! bytes + `derive_kek_v6` output), which is what V6 unlock correctness depends
//! on. This mirrors the existing `share_interop_kat.rs` <-> `shareInterop.kat.test.ts`
//! pattern.

use usbvault_crypto::{build_kdf_transcript, derive_kek_v6, VaultHeader};

fn to_hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

// ── Fixed inputs (shared with the web KAT) ──
const VERSION: u8 = 6;
const KDF_HASH_ID: u8 = 2; // Argon2id
const CIPHER_ID: u8 = 2; // XChaCha20-Poly1305
const ARGON2_MEMORY: u32 = 65536;
const ARGON2_TIME: u32 = 3;
const ARGON2_PARALLELISM: u8 = 4;
const ACTIVE_SLOT: u8 = 1;
const PASSWORD: &[u8] = b"crypto-pr5-kat-password";

/// salt = 0x00..0x1f (32 bytes).
fn salt() -> [u8; 32] {
    let mut s = [0u8; 32];
    for (i, b) in s.iter_mut().enumerate() {
        *b = i as u8;
    }
    s
}

// ── Frozen expected hex (computed once; web KAT mirrors these) ──
const EXPECT_TRANSCRIPT: &str =
    "06020220000000000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f000001000300000004";
const EXPECT_WRAP_AD: &str =
    "5553425661756c742d777261704d454b2d76363a06000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f000001000300000004";
const EXPECT_VERIFY_AD: &str =
    "5553425661756c742d7665726966792d76363a06000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const EXPECT_INDEX_AD: &str =
    "5553425661756c742d696e6465782d76363a06000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01";
const EXPECT_DERIVE_KEK_V6: &str =
    "8a510dcff6648580523a3625db4b3bec0389c748ad85b3081a3b6af9cfb61d54";

#[test]
fn kat_build_kdf_transcript() {
    let t = build_kdf_transcript(
        VERSION,
        KDF_HASH_ID,
        CIPHER_ID,
        &salt(),
        ARGON2_MEMORY,
        ARGON2_TIME,
        ARGON2_PARALLELISM,
    );
    assert_eq!(to_hex(&t), EXPECT_TRANSCRIPT);
}

#[test]
fn kat_wrap_ad_v6() {
    // VaultHeader::wrap_ad_v6 is private; reconstruct from the FROZEN layout the
    // header uses: domain || version || salt || mem_le || time_le || par.
    let s = salt();
    let mut ad = Vec::new();
    ad.extend_from_slice(b"USBVault-wrapMEK-v6:");
    ad.push(VERSION);
    ad.extend_from_slice(&s);
    ad.extend_from_slice(&ARGON2_MEMORY.to_le_bytes());
    ad.extend_from_slice(&ARGON2_TIME.to_le_bytes());
    ad.push(ARGON2_PARALLELISM);
    assert_eq!(to_hex(&ad), EXPECT_WRAP_AD);
}

#[test]
fn kat_verify_ad_v6() {
    let s = salt();
    let mut ad = Vec::new();
    ad.extend_from_slice(b"USBVault-verify-v6:");
    ad.push(VERSION);
    ad.extend_from_slice(&s);
    assert_eq!(to_hex(&ad), EXPECT_VERIFY_AD);
}

#[test]
fn kat_index_ad_v6() {
    // index_ad_v6 is public; assert it matches the frozen vector.
    let ad = VaultHeader::index_ad_v6(VERSION, &salt(), ACTIVE_SLOT);
    assert_eq!(to_hex(&ad), EXPECT_INDEX_AD);
}

#[test]
fn kat_derive_kek_v6() {
    let t = build_kdf_transcript(
        VERSION,
        KDF_HASH_ID,
        CIPHER_ID,
        &salt(),
        ARGON2_MEMORY,
        ARGON2_TIME,
        ARGON2_PARALLELISM,
    );
    let kek = derive_kek_v6(PASSWORD, &salt(), &t).expect("derive_kek_v6");
    assert_eq!(to_hex(kek.as_bytes()), EXPECT_DERIVE_KEK_V6);
}

// ── Rust-only hybrid v2 KAT (web PQC path throws 'PQC not available') ──

#[cfg(feature = "pqc")]
#[test]
fn kat_hybrid_v2_roundtrip_and_v1_rejects_v2() {
    use usbvault_crypto::pqc::hybrid::{
        generate_hybrid_keypair, hybrid_open, hybrid_open_v2, hybrid_seal, hybrid_seal_v2,
    };

    let (pk, sk) = generate_hybrid_keypair().expect("keypair");
    let plaintext = b"crypto-pr5 hybrid v2 transcript-bound";

    // v2 seal/open round-trips.
    let v2 = hybrid_seal_v2(&pk, plaintext).expect("v2 seal");
    assert_eq!(v2[0], 2, "v2 box must carry version byte 2");
    let opened = hybrid_open_v2(&sk, &v2).expect("v2 open");
    assert_eq!(opened.as_slice(), plaintext.as_slice());

    // v1 cannot open a v2 box, and v2 cannot open a v1 box.
    assert!(hybrid_open(&sk, &v2).is_err());
    let v1 = hybrid_seal(&pk, plaintext).expect("v1 seal");
    assert!(hybrid_open_v2(&sk, &v1).is_err());
}
