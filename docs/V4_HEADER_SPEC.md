# USBVault V4 Header Specification

## Overview

The V4 header is an **evolution** of the original V2 "Fortress" header format, extended for the Enterprise Edition's Rust-based crypto core. The key design goals are:

1. **Wrapped MEK architecture**: Key Encryption Key (KEK) wraps a Master Encryption Key (MEK), enabling password changes without re-encrypting all data
2. **PQC readiness**: Extra header space accommodates ML-KEM-1024 (1568-byte) public keys and ciphertexts
3. **Rollback protection**: Monotonic state_version counter detects header downgrades
4. **Backward compatibility**: Discovery accepts V2/V3/V4 magic bytes; identity block readable without password

## Format Comparison

| Property | V2 (Fortress) | V3 (PQC Extension) | V4 (Enterprise) |
|----------|---------------|---------------------|-----------------|
| Magic | `USBVLT02` | `USBVLT03` | `USBVLT04` |
| Header size | 4096 B | 16384 B | 24576 B (24 KiB) |
| Key architecture | Direct (password -> key) | Direct + PQC hybrid | Wrapped MEK (password -> KEK -> MEK) |
| Index offsets | u64 (8B each) | u64 (8B each) | u32 (4B each) |
| Rollback protection | None | None | state_version counter |
| PQC support | None | ML-KEM-1024 block | Feature-gated in Rust |
| Identity block | Fixed at offset 224 (544B) | Same | Length-prefixed, variable position |
| TFA block | Fixed at offset 768 (638B) | Same | Length-prefixed, variable position |
| Fail counter | Fixed at offset 1408 (304B) | Same | Length-prefixed, variable position |

## V4 Field Map (Sequential Layout)

V4 uses a sequential length-prefixed format instead of fixed offsets. This enables variable-length blocks without wasted padding.

```
Offset  Size   Field                  Encoding         Notes
──────  ────   ─────                  ────────         ─────
0       8      Magic                  "USBVLT04"       File identification
8       1      KDF Hash ID            uint8            2 = Argon2id (only valid value)
9       1      Cipher ID              uint8            2 = XChaCha20-Poly1305, 3 = AES-256-GCM-SIV
10      32     Salt                   raw bytes        os.urandom(32) at provision
42      24     Verify IV              raw bytes        Nonce for verify marker
66      2      Verify CT length       uint16 LE        Length of verify ciphertext
68      var    Verify ciphertext      raw bytes        Encrypted verify marker + tag
var     32     Header HMAC            HMAC-SHA256      Over header with HMAC field zeroed
var     1      Active index slot      uint8            0 or 1 (dual-index commit)
var     4      Index 1 offset         uint32 LE        Byte position in VAULT.bin
var     4      Index 1 length         uint32 LE        Encrypted index size
var     4      Index 2 offset         uint32 LE        Backup slot offset
var     4      Index 2 length         uint32 LE        Backup slot size
var     8      Commit counter         uint64 LE        Monotonic for crash recovery
var     4      Argon2 memory (KiB)    uint32 LE        Default: 65536 (64 MiB)
var     4      Argon2 time cost       uint32 LE        Default: 3
var     1      Argon2 parallelism     uint8            Default: 4

── V3+ Variable-Length Blocks ──
var     4      Identity block length  uint32 LE        0 = absent
var     var    Identity block         JSON + padding   Plaintext vault metadata
var     4      TFA block length       uint32 LE        0 = absent
var     var    TFA block              raw bytes        FIDO2 credentials + config
var     4      Fail counter length    uint32 LE        0 = absent
var     var    Fail counter block     raw bytes        count(4B) + HMAC(32B)

── V4 Extended Fields ──
var     4      Wrapped MEK length     uint32 LE        0 = absent
var     var    Wrapped MEK            raw bytes        KEK-encrypted master key
var     8      State version          uint64 LE        Monotonic rollback counter
var     1      Index encrypted flag   uint8            1 = index is encrypted

── Padding ──
var     var    Reserved               zero-filled      Pad to 24576 bytes total
```

## V2 → V4 Field Mapping

For every V2 field, this table shows the equivalent V4 location:

| V2 Field | V2 Offset | V4 Equivalent | V4 Location |
|----------|-----------|---------------|-------------|
| Magic (8B) | 0 | Magic | Offset 0 (changed to USBVLT04) |
| Version (2B) | 8 | Embedded in magic | Magic bytes encode version |
| Header size (2B) | 10 | Implicit | 24576 (constant) |
| Iterations legacy (4B) | 12 | Removed | Unused in V2; dropped in V4 |
| KDF Hash ID (1B) | 16 | KDF Hash ID | Offset 8 |
| Cipher ID (1B) | 17 | Cipher ID | Offset 9 |
| Salt (32B) | 20 | Salt | Offset 10 |
| Verify IV (16B) | 52 | Verify IV (24B) | Offset 42 (expanded for XChaCha20) |
| Verify CT (64B) | 68 | Verify CT (var) | Offset 68 (length-prefixed) |
| Header HMAC (32B) | 132 | Header HMAC | After verify CT |
| Active index slot (1B) | 164 | Active index slot | After HMAC |
| Index 1 offset (8B) | 172 | Index 1 offset (4B) | After active slot (narrowed to u32) |
| Index 1 length (8B) | 180 | Index 1 length (4B) | After index 1 offset |
| Index 2 offset (8B) | 188 | Index 2 offset (4B) | After index 1 length |
| Index 2 length (8B) | 196 | Index 2 length (4B) | After index 2 offset |
| Commit counter (8B) | 204 | Commit counter | After index 2 length |
| Argon2 memory (4B) | 212 | Argon2 memory | After commit counter |
| Argon2 time (4B) | 216 | Argon2 time | After argon2 memory |
| Argon2 parallelism (4B) | 220 | Argon2 parallelism (1B) | After argon2 time (narrowed to u8) |
| Identity block (544B) | 224 | Identity block | Length-prefixed variable position |
| TFA method (1B) | 768 | TFA block | Length-prefixed variable position |
| TFA credentials (540B) | 866 | TFA block | Included in TFA block |
| FIDO2 salt (32B) | 772 | TFA block | Included in TFA block |
| Recovery blob (60B) | 804 | TFA block | Included in TFA block |
| Fail count (4B) | 1408 | Fail counter block | Length-prefixed variable position |
| Fail timestamp (8B) | 1412 | Fail counter block | Included in fail counter block |
| Fail HMAC (32B) | 1420 | Fail counter block | Included in fail counter block |
| Self-destruct (1B) | 1452 | Fail counter block | Config in fail counter block |
| Email config (256B) | 1456 | Removed | Server-side in Enterprise |
| **NEW: Wrapped MEK** | N/A | Wrapped MEK | Length-prefixed V4 field |
| **NEW: State version** | N/A | State version | V4 field (rollback protection) |
| **NEW: Index encrypted** | N/A | Index encrypted flag | V4 field |

## Rationale for Changes

### Why 24576 bytes instead of 4096?
- Wrapped MEK blob varies from 80-200 bytes depending on cipher
- PQC public keys (ML-KEM-1024) are 1568 bytes each
- Variable-length blocks need room to grow
- 24 KiB is a common page-aligned size for USB flash translation layers

### Why u32 index offsets instead of u64?
- VAULT.bin files on USB drives will not exceed 4 GiB in practice
- USB drives max at ~2 TiB; ExFAT supports larger but no USB vault will use it
- Saves 8 bytes per index slot (16B total) for other fields

### Why length-prefixed blocks instead of fixed offsets?
- V2's fixed offsets waste space: identity block always reserves 544B even for 30B of JSON
- TFA block always reserves 638B even with 0 credentials
- Variable blocks allow future extensions without header size changes

### Why wrapped MEK?
- V2: `password → Argon2id → enc_key` — changing password requires re-encrypting all data
- V4: `password → Argon2id → KEK → unwrap(MEK)` — changing password only re-wraps MEK
- MEK is generated once at provision time and never changes
- Password change is O(1) instead of O(n) where n = vault size

## Backward Compatibility

- **Discovery**: `vaultContainerService.js` accepts V2, V3, and V4 magic bytes
- **Identity reading**: Plaintext identity block is readable from any version (offset parsed dynamically)
- **V2 vaults**: Can be opened by the Enterprise app for read-only access (migration path)
- **V4 vaults**: Cannot be opened by the original V2 Python app (one-way upgrade)

## Security Invariants (Preserved from V2)

1. All key material in `bytearray`/`Zeroizing<T>` (mutable, zeroed after use)
2. Header HMAC covers all security-critical fields
3. Fail counter HMAC domain-separated with `"USBVault-FailCounter-v1:"`
4. Verify marker confirms correct password without exposing user data
5. Dual-index atomic commits for crash safety
6. Self-destruct: 3-pass random overwrite of wrapped_mek on max failures
7. Constant-time comparisons via `subtle::ConstantTimeEq`

## Implementation References

- **Rust parser**: `usbvault-crypto/src/vault/header.rs` — `VaultHeader::read()` and `VaultHeader::write()`
- **JS reader**: `usb-companion/src/services/vaultContainerService.js` — `readVaultHeader()`, `readVaultIdentity()`
- **TS bridge**: `usbvault-app/src/crypto/bridge.ts` — `readVaultHeader()`, `createVaultHeader()`
