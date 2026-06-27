/**
 * Cross-implementation interop KAT for the X25519 sealed-box sharing path (#71).
 *
 * Proves the web crypto fallback (src/crypto/native.ts — @noble X25519 ECDH +
 * HKDF-SHA256("seal") + XChaCha20-Poly1305, layout ephemeral_pub(32) || nonce(24)
 * || ct||tag) is byte-for-byte interoperable with the native Rust path
 * (usbvault-crypto/src/sharing.rs). The fixed vector below shares one recipient
 * keypair: NATIVE_SEALED was produced by Rust `sharing::seal`, WEB_SEALED by this
 * web impl. The companion Rust KAT (usbvault-crypto/tests/share_interop_kat.rs)
 * opens WEB_SEALED; here we open NATIVE_SEALED. Both directions must recover the
 * same plaintext, which is what makes web<->native vault sharing actually work.
 */

// Force the web crypto path (mirrors integration.test.ts) so getModule() resolves
// the real webCryptoFallback rather than the absent native module.
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  NativeModules: {},
}));

import * as bridge from '@/crypto/bridge';

// Shared interop vector. recipient keypair + plaintext are common to both sides.
const VEC = {
  recipientPublicHex: '08e3e94419ced717383e7847a2bc043488b0c7d9e0c94e10c5024c69f3e63f31',
  recipientSecretHex: 'cb71237d1f3012ab696fbd4f1148a9473951bbb915120878beac7d3fb61fdf1e',
  plaintext: 'interop-share-payload-v1',
  // Produced by Rust usbvault_crypto::seal(recipient_public, plaintext).
  nativeSealedHex:
    '2eefc2d531522a666c649daac0d7711d32080892c8ebb953435070ebe9016555' +
    'dba132b2036f329d4b4909c222138eab1a2715244384aa57adb9789256e85d03' +
    '5bc2804ce005d0510909bca64e0831289f315718da7b86bb758cd586b7a4b1ab',
};

const hex = (h: string) => Buffer.from(h, 'hex');

describe('X25519 sealed-box cross-impl interop KAT (#71)', () => {
  it('web opens a native(Rust)-sealed box and recovers the plaintext', async () => {
    const opened = await bridge.openSealed(hex(VEC.recipientSecretHex), hex(VEC.nativeSealedHex));
    expect(Buffer.from(opened).toString('utf8')).toBe(VEC.plaintext);
  });

  it('web seal -> web open round-trips against the vector recipient', async () => {
    const sealed = await bridge.sealToPublicKey(
      hex(VEC.recipientPublicHex),
      Buffer.from(VEC.plaintext, 'utf8')
    );
    // sealed layout is ephemeral_pub(32) || nonce(24) || ct||tag(16)
    expect(sealed.length).toBe(32 + 24 + VEC.plaintext.length + 16);
    const opened = await bridge.openSealed(hex(VEC.recipientSecretHex), sealed);
    expect(Buffer.from(opened).toString('utf8')).toBe(VEC.plaintext);
  });
});
