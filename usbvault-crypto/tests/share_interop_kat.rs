//! Cross-implementation interop KAT for X25519 sealed-box sharing (issue #71).
//!
//! Proves the native Rust sharing path (`sharing::open`) can decrypt a box sealed
//! by the WEB implementation (usbvault-app @noble): X25519 ECDH, then
//! HKDF-SHA256("seal"), then XChaCha20-Poly1305, with layout ephemeral_pub(32)
//! then nonce(24) then ct/tag. The companion web KAT
//! (usbvault-app/src/crypto/__tests__/shareInterop.kat.test.ts)
//! opens the Rust-sealed vector; here we open the web-sealed one. Both share a
//! single recipient keypair, so together they prove web<->native interoperability.

use usbvault_crypto::{open, seal, SharePublicKey, ShareSecretKey};

fn from_hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).expect("valid hex"))
        .collect()
}

const RECIPIENT_PUBLIC_HEX: &str =
    "08e3e94419ced717383e7847a2bc043488b0c7d9e0c94e10c5024c69f3e63f31";
const RECIPIENT_SECRET_HEX: &str =
    "cb71237d1f3012ab696fbd4f1148a9473951bbb915120878beac7d3fb61fdf1e";
const PLAINTEXT: &[u8] = b"interop-share-payload-v1";
// Produced by the web @noble sealToPublicKey() against RECIPIENT_PUBLIC_HEX.
const WEB_SEALED_HEX: &str = "357d0c8a00678f114d12461e7395d19191d56cc3de67ca26fdce8fbd5f59065fa88e7bd820ece320ea43be903be5c7014358219f074b6c7193ebe1f6d798175cb3c5cb5fd319c639fa00f5fbdbc511a26938682995e7423ab3af7c7fc384fbe9";

#[test]
fn rust_opens_web_sealed_box() {
    let sec_bytes: [u8; 32] = from_hex(RECIPIENT_SECRET_HEX).try_into().unwrap();
    let secret = ShareSecretKey::from_bytes(sec_bytes);
    let sealed = from_hex(WEB_SEALED_HEX);

    let opened = open(&secret, &sealed).expect("Rust must open the web-sealed box");
    assert_eq!(opened, PLAINTEXT, "web->native sealed-box interop mismatch");
}

#[test]
fn rust_roundtrip_against_vector_recipient() {
    // Sanity: the vector's recipient public key is the X25519 public of its secret,
    // and Rust seal/open round-trips for it.
    let pub_bytes: [u8; 32] = from_hex(RECIPIENT_PUBLIC_HEX).try_into().unwrap();
    let sec_bytes: [u8; 32] = from_hex(RECIPIENT_SECRET_HEX).try_into().unwrap();
    let recipient_public = SharePublicKey::from_bytes(pub_bytes);
    let recipient_secret = ShareSecretKey::from_bytes(sec_bytes);

    let sealed = seal(&recipient_public, PLAINTEXT).expect("seal");
    let opened = open(&recipient_secret, &sealed).expect("open");
    assert_eq!(opened, PLAINTEXT);
}
