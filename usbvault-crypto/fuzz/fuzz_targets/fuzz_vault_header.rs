#![no_main]

use libfuzzer_sys::fuzz_target;
use usbvault_crypto::cipher::CipherId;
use usbvault_crypto::VaultHeader;

// Fuzz the REAL attacker-facing parser. `VaultHeader::read` is handed fully
// attacker-controlled bytes — the first 24 KiB of a `VAULT.bin` on an untrusted
// USB stick — and must NEVER panic: every field read is bounds-checked and returns
// `Err(InvalidHeader)` on malformed input (crypto review C-2). libFuzzer turns any
// panic / out-of-bounds into a crash, so this target is the standing regression
// guard for C-2.
//
// (The previous version of this target never called the parser at all — it
// hand-simulated a fabricated header format and additionally failed to compile,
// which the workflow's `continue-on-error` silently swallowed.)
fuzz_target!(|data: &[u8]| {
    // The function under test: for ANY input it must return Ok/Err, never panic.
    let _ = VaultHeader::read(data);

    // Cheap extra coverage: the single-byte cipher-id decoder must round-trip and
    // report sane sizes for every value it accepts.
    if let Some(&b) = data.first() {
        if let Ok(cipher_id) = CipherId::from_byte(b) {
            assert_eq!(
                CipherId::from_byte(cipher_id.as_byte()).unwrap(),
                cipher_id,
                "cipher id round-trip failed"
            );
            assert_eq!(cipher_id.tag_size(), 16, "tag size must be 16");
            assert!(
                matches!(cipher_id.nonce_size(), 12 | 24),
                "unexpected nonce size {}",
                cipher_id.nonce_size()
            );
        }
    }
});
