/**
 * Cross-implementation interop KAT for the V6 KDF-transcript + AEAD-AD
 * primitives (crypto-pr5).
 *
 * Asserts the web/TS builders (native.ts buildKdfTranscript / buildWrapAD /
 * buildVerifyAD / buildIndexAD / deriveKekV6) produce the IDENTICAL bytes as the
 * native Rust path. The fixed hex vectors below are copied verbatim from the
 * Rust KAT (usbvault-crypto/tests/kdf_ad_interop_kat.rs); if either side drifts
 * a byte, one of the two suites fails — that is the byte-for-byte agreement
 * proof V6 unlock correctness depends on.
 *
 * NOTE: V6 vault *files* are NOT byte-identical across web/Rust (the web
 * fallback wraps the MEK with AES-GCM, Rust with XChaCha20). The cross-impl
 * guarantee is at the PRIMITIVE level (these builders + the V6 KEK), mirroring
 * the existing shareInterop.kat.test.ts <-> share_interop_kat.rs pattern.
 */

// Force the web crypto path so getModule() resolves the real webCryptoFallback.
import * as bridge from '@/crypto/bridge';

jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  NativeModules: {},
}));

const toHex = (b: Uint8Array) =>
  Array.from(b)
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');

// ── Fixed inputs (shared with the Rust KAT) ──
const VERSION = 6;
const KDF_HASH_ID = 2; // Argon2id
const CIPHER_ID = 2; // XChaCha20-Poly1305
const ARGON2_MEMORY = 65536;
const ARGON2_TIME = 3;
const ARGON2_PARALLELISM = 4;
const ACTIVE_SLOT = 1;
const PASSWORD = new TextEncoder().encode('crypto-pr5-kat-password');

// salt = 0x00..0x1f (32 bytes).
const SALT = new Uint8Array(32);
for (let i = 0; i < 32; i++) SALT[i] = i;

// ── Frozen expected hex (identical to the Rust KAT constants) ──
const EXPECT_TRANSCRIPT =
  '06020220000000000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f000001000300000004';
const EXPECT_WRAP_AD =
  '5553425661756c742d777261704d454b2d76363a06000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f000001000300000004';
const EXPECT_VERIFY_AD =
  '5553425661756c742d7665726966792d76363a06000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const EXPECT_INDEX_AD =
  '5553425661756c742d696e6465782d76363a06000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f01';
const EXPECT_DERIVE_KEK_V6 = '8a510dcff6648580523a3625db4b3bec0389c748ad85b3081a3b6af9cfb61d54';

describe('V6 KDF-transcript + AEAD-AD cross-impl interop KAT (crypto-pr5)', () => {
  it('buildKdfTranscript matches the Rust build_kdf_transcript vector', () => {
    const t = bridge.buildKdfTranscript(
      VERSION,
      KDF_HASH_ID,
      CIPHER_ID,
      SALT,
      ARGON2_MEMORY,
      ARGON2_TIME,
      ARGON2_PARALLELISM
    );
    expect(toHex(t)).toBe(EXPECT_TRANSCRIPT);
  });

  it('buildWrapAD matches the Rust wrap_ad_v6 vector', () => {
    const ad = bridge.buildWrapAD(VERSION, SALT, ARGON2_MEMORY, ARGON2_TIME, ARGON2_PARALLELISM);
    expect(toHex(ad)).toBe(EXPECT_WRAP_AD);
  });

  it('buildVerifyAD matches the Rust verify_ad_v6 vector', () => {
    expect(toHex(bridge.buildVerifyAD(VERSION, SALT))).toBe(EXPECT_VERIFY_AD);
  });

  it('buildIndexAD matches the Rust index_ad_v6 vector', () => {
    expect(toHex(bridge.buildIndexAD(VERSION, SALT, ACTIVE_SLOT))).toBe(EXPECT_INDEX_AD);
  });

  it('deriveKekV6 matches the Rust derive_kek_v6 output byte-for-byte', async () => {
    const t = bridge.buildKdfTranscript(
      VERSION,
      KDF_HASH_ID,
      CIPHER_ID,
      SALT,
      ARGON2_MEMORY,
      ARGON2_TIME,
      ARGON2_PARALLELISM
    );
    const kekHex = await bridge.deriveKekV6(PASSWORD, SALT, t);
    expect(kekHex).toBe(EXPECT_DERIVE_KEK_V6);
  });
});
