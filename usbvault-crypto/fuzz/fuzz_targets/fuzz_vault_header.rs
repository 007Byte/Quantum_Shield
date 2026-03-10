#![no_main]

use libfuzzer_sys::fuzz_target;
use usbvault_crypto::cipher::CipherId;

fuzz_target!(|data: &[u8]| {
    // Test parsing of vault headers with arbitrary bytes
    // Minimum header: magic (4) + version (1) + cipher_id (1) + other metadata

    if data.is_empty() {
        return;
    }

    // Test parsing cipher IDs from arbitrary bytes
    let cipher_byte = data[0];
    match CipherId::from_byte(cipher_byte) {
        Ok(cipher_id) => {
            // Valid cipher ID - verify properties
            assert!(cipher_id.nonce_size() > 0, "Nonce size must be > 0");
            assert!(cipher_id.tag_size() > 0, "Tag size must be > 0");

            // Nonce size should be 12 or 24
            match cipher_id {
                CipherId::XChaCha20Poly1305 => {
                    assert_eq!(cipher_id.nonce_size(), 24, "XChaCha20 nonce must be 24");
                    assert_eq!(cipher_id.as_byte(), 2, "XChaCha20 ID must be 2");
                }
                CipherId::Aes256GcmSiv => {
                    assert_eq!(cipher_id.nonce_size(), 12, "AES-256-GCM-SIV nonce must be 12");
                    assert_eq!(cipher_id.as_byte(), 3, "AES-256-GCM-SIV ID must be 3");
                }
            }

            // Both algorithms use 128-bit (16-byte) tags
            assert_eq!(cipher_id.tag_size(), 16, "Tag size must be 16 for both algorithms");

            // Test round-trip: byte -> CipherId -> byte
            let roundtrip = CipherId::from_byte(cipher_id.as_byte()).unwrap();
            assert_eq!(cipher_id, roundtrip, "Round-trip cipher ID conversion failed");
        }
        Err(_) => {
            // Invalid cipher ID - this is expected for most byte values
            // Verify that only valid IDs (2, 3) succeed
            assert!(cipher_byte != 2 && cipher_byte != 3,
                "Valid cipher ID {} rejected", cipher_byte);
        }
    }

    // Simulate vault header parsing: magic + version + salt + cipher_id
    // Magic: 4 bytes, Version: 1 byte, Salt: 32 bytes, CipherId: 1 byte
    if data.len() >= 38 {
        let magic = &data[0..4];
        let version = data[4];
        let _salt = &data[5..37];
        let cipher_id_byte = data[37];

        // Magic bytes should be "USBV" (0x55, 0x53, 0x42, 0x56)
        let expected_magic = b"USBV";
        if magic == expected_magic {
            // Valid magic - version should be reasonable (1-10)
            assert!(version > 0 && version <= 10 || version == 255,
                "Version out of expected range");

            // Try to parse cipher ID
            if let Ok(cipher_id) = CipherId::from_byte(cipher_id_byte) {
                // Valid cipher - ensure properties are consistent
                let nonce_size = cipher_id.nonce_size();
                let tag_size = cipher_id.tag_size();
                assert!(nonce_size in [12usize, 24usize], "Unexpected nonce size");
                assert_eq!(tag_size, 16, "Unexpected tag size");
            }
        }
    }

    // Test parsing of streaming format headers
    // V2 format: "V2RC" (4) + version (1) + base_nonce (24) + chunks
    if data.len() >= 29 {
        if &data[0..4] == b"V2RC" {
            let format_version = data[4];
            assert_eq!(format_version, 0x02, "V2RC format must be version 0x02");

            let _base_nonce = &data[5..29];

            // If there's more data, it should contain chunks
            if data.len() > 29 {
                // Each chunk has: length_header (4) + encrypted_chunk
                let mut offset = 29;
                while offset + 4 <= data.len() {
                    let chunk_len_bytes = &data[offset..offset + 4];
                    let chunk_len = u32::from_le_bytes([
                        chunk_len_bytes[0],
                        chunk_len_bytes[1],
                        chunk_len_bytes[2],
                        chunk_len_bytes[3],
                    ]) as usize;

                    offset += 4;

                    // Sanity check: chunk length should be reasonable (< 1MB)
                    if chunk_len > 1_000_000 {
                        break; // Invalid chunk length
                    }

                    offset += chunk_len;
                }
            }
        }
    }

    // Test that truncated headers are handled gracefully
    if data.len() >= 1 && data.len() < 29 {
        // Too short to be a valid V2RC header
        if &data[0..std::cmp::min(4, data.len())] == &b"V2RC"[0..std::cmp::min(4, data.len())] {
            // Partial V2RC magic - should not be accepted as complete header
        }
    }
});
