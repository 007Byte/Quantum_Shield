/**
 * Crypto Integration Tests — REAL crypto (no mocks).
 *
 * FIX 4 (un-mock the TS crypto integration test): the previous version replaced
 * NativeModules.USBVaultCrypto with identity/fixed-hex fakes (deriveKey -> 'a'×64,
 * encrypt -> 'b'×48 + 'c'×len + 'd'×32, decrypt slices the middle back out). That
 * proved only the bridge's hex plumbing — a real correctness regression (wrong arg
 * order, truncated nonce, swapped key halves, no AEAD) would have PASSED.
 *
 * This suite now exercises the ACTUAL web crypto path:
 *   - Platform.OS is forced to 'web', so crypto/native.ts resolves the real
 *     `webCryptoFallback` (hash-wasm Argon2id key derivation + crypto.subtle
 *     AES-256-GCM AEAD), NOT a stub.
 *   - crypto.subtle is provided by jest.setup.js (Node webcrypto) under jsdom.
 *   - The SRP assertions use the real srpClient.ts (BigInt modPow + Argon2id +
 *     crypto.subtle SHA-256).
 *
 * The invariants asserted are genuine cryptographic properties:
 *   - encrypt(x) != x  (ciphertext is not the plaintext)
 *   - decrypt(encrypt(x)) == x  (round-trip correctness)
 *   - wrong key / tampered ciphertext => decryption FAILS (AEAD authentication)
 *   - deterministic KDF (same password+salt => same key; different => different)
 *   - real public-key (ECDH) seal/open round-trip; wrong key fails
 *   - real SRP-6a derivation reproduces the locked cross-impl vector
 */

// IMPORTANT: force the web crypto path BEFORE importing the bridge/native
// modules so getModule() resolves webCryptoFallback (real crypto) rather than
// the (absent) native module. The global jest.setup mocks Platform.OS as 'ios';
// we override it to 'web' for this file only.
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  NativeModules: {},
}));

import * as bridge from '@/crypto/bridge';
import * as keyHierarchy from '@/services/keyHierarchy';
import {
  N,
  g,
  modPow,
  computeK,
  processChallenge,
  computeM2,
  verifyServerM2,
  _internal,
} from '@/crypto/srpClient';

const { bytesToHex } = _internal;

// Real Argon2id (64 MiB, 3 iterations) and 3072-bit SRP modPow are CPU-heavy;
// give each test ample headroom over the 5s jest default so a genuine slow run
// is not mistaken for a failure.
jest.setTimeout(60000);

describe('Crypto Integration Tests (REAL web crypto)', () => {
  // ==========================================================================
  // Key Derivation — real Argon2id (hash-wasm)
  // ==========================================================================
  describe('Key Derivation (Argon2id)', () => {
    it('derives a deterministic 32-byte key from the same password + salt', async () => {
      const password = 'test-password-123';
      const salt = new Uint8Array(32).fill(0x01);

      const key1 = await bridge.deriveKey(password, salt);
      const key2 = await bridge.deriveKey(password, salt);

      expect(key1.length).toBe(32);
      // REAL Argon2id is deterministic for identical inputs.
      expect(Buffer.from(key1).toString('hex')).toBe(Buffer.from(key2).toString('hex'));
    });

    it('derives DIFFERENT keys from different passwords', async () => {
      const salt = new Uint8Array(32).fill(0x01);
      const key1 = await bridge.deriveKey('password1', salt);
      const key2 = await bridge.deriveKey('password2', salt);
      expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
    });

    it('derives DIFFERENT keys from different salts', async () => {
      const password = 'same-password';
      const key1 = await bridge.deriveKey(password, new Uint8Array(32).fill(0x01));
      const key2 = await bridge.deriveKey(password, new Uint8Array(32).fill(0x02));
      expect(Buffer.from(key1).toString('hex')).not.toBe(Buffer.from(key2).toString('hex'));
    });

    it('rejects an empty password', async () => {
      await expect(bridge.deriveKey('', new Uint8Array(32))).rejects.toThrow(
        'Password cannot be empty'
      );
    });
  });

  // ==========================================================================
  // Encrypt/Decrypt Round-Trip — real AES-256-GCM (crypto.subtle)
  // ==========================================================================
  describe('Encrypt/Decrypt Round-Trip (AEAD)', () => {
    it('ciphertext differs from plaintext and round-trips correctly', async () => {
      const key = new Uint8Array(32).fill(0x42);
      const plaintext = Buffer.from('Hello, World!');

      const ciphertext = await bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, plaintext);
      // REAL crypto: ciphertext must NOT equal/contain the plaintext.
      expect(Buffer.from(ciphertext).equals(Buffer.from(plaintext))).toBe(false);
      expect(ciphertext.length).toBeGreaterThan(plaintext.length); // nonce + ct + tag

      const decrypted = await bridge.decrypt(bridge.CipherId.XChaCha20Poly1305, key, ciphertext);
      expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
    });

    it('round-trips 1MB of data', async () => {
      const key = new Uint8Array(32).fill(0x55);
      const plaintext = new Uint8Array(1024 * 1024).fill(0xaa);

      const ciphertext = await bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, plaintext);
      const decrypted = await bridge.decrypt(bridge.CipherId.XChaCha20Poly1305, key, ciphertext);
      expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
    });

    it('rejects empty plaintext', async () => {
      const key = new Uint8Array(32).fill(0x77);
      await expect(
        bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, new Uint8Array(0))
      ).rejects.toThrow('Plaintext cannot be empty');
    });

    it('FAILS decryption with the wrong key (AEAD authentication)', async () => {
      const key1 = new Uint8Array(32).fill(0x11);
      const key2 = new Uint8Array(32).fill(0x22);
      const plaintext = Buffer.from('Test message');

      const ciphertext = await bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key1, plaintext);
      await expect(
        bridge.decrypt(bridge.CipherId.XChaCha20Poly1305, key2, ciphertext)
      ).rejects.toThrow();
    });

    it('FAILS decryption with tampered ciphertext (AEAD authentication)', async () => {
      const key = new Uint8Array(32).fill(0x33);
      const plaintext = Buffer.from('Secret message');

      const ciphertext = await bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, plaintext);
      const tampered = new Uint8Array(ciphertext);
      // Flip a byte inside the ciphertext body (past the 12-byte nonce).
      tampered[tampered.length - 1] ^= 0xff;

      await expect(
        bridge.decrypt(bridge.CipherId.XChaCha20Poly1305, key, tampered)
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Key Hierarchy — real KEK(Argon2id) wrap/unwrap MEK
  // ==========================================================================
  describe('Key Hierarchy (KEK + MEK)', () => {
    it('creates and unlocks a key hierarchy, recovering the SAME MEK', async () => {
      const password = 'my-vault-password';
      const creation = await keyHierarchy.createKeyHierarchy(password);

      expect(creation.mek.length).toBe(64);
      expect(creation.wrappedMek.length).toBeGreaterThan(64);
      expect(creation.kekSalt.length).toBe(32);

      const unlock = await keyHierarchy.unlockKeyHierarchy(
        password,
        creation.kekSalt,
        creation.wrappedMek
      );
      // REAL unwrap must reproduce the exact MEK.
      expect(Buffer.from(unlock.mek).equals(Buffer.from(creation.mek))).toBe(true);
    });

    it('rotates the password while preserving the MEK', async () => {
      const oldPassword = 'old-password-123';
      const newPassword = 'new-password-456';

      const creation = await keyHierarchy.createKeyHierarchy(oldPassword);
      const rotation = await keyHierarchy.rotatePassword(
        oldPassword,
        newPassword,
        creation.kekSalt,
        creation.wrappedMek
      );

      const unlock = await keyHierarchy.unlockKeyHierarchy(
        newPassword,
        rotation.newKekSalt,
        rotation.newWrappedMek
      );
      // The underlying MEK survives a password rotation.
      expect(Buffer.from(unlock.mek).equals(Buffer.from(creation.mek))).toBe(true);
    });

    it('derives unique, deterministic per-file keys', async () => {
      const creation = await keyHierarchy.createKeyHierarchy('vault-password');

      const fileKey1 = await keyHierarchy.getFileEncryptionKey(creation.mek, 'file-id-1');
      const fileKey1b = await keyHierarchy.getFileEncryptionKey(creation.mek, 'file-id-1');
      const fileKey2 = await keyHierarchy.getFileEncryptionKey(creation.mek, 'file-id-2');

      expect(fileKey1.length).toBe(32);
      // Same MEK + same file id => same key (deterministic HKDF).
      expect(Buffer.from(fileKey1).equals(Buffer.from(fileKey1b))).toBe(true);
      // Different file ids => different keys.
      expect(Buffer.from(fileKey1).equals(Buffer.from(fileKey2))).toBe(false);
    });

    it('FAILS to unlock with the wrong password (AEAD tag check)', async () => {
      const creation = await keyHierarchy.createKeyHierarchy('correct-password');
      await expect(
        keyHierarchy.unlockKeyHierarchy('wrong-password', creation.kekSalt, creation.wrappedMek)
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Public Key Encryption (real ECDH seal/open)
  // ==========================================================================
  describe('Public Key Encryption (X25519 sealed box)', () => {
    // FIXED (issue #71): the web crypto fallback now uses 32-byte X25519 sealed
    // boxes (X25519 ECDH -> HKDF-SHA256("seal") -> XChaCha20-Poly1305), matching
    // the native Rust path byte-for-byte (see the cross-impl interop KAT in
    // shareInterop.kat.test.ts). Web public-key sharing now works and interops
    // with native recipients.
    it('seals to a public key and opens with the matching secret key', async () => {
      const { publicKey, secretKey } = await bridge.generateShareKeypair();
      const plaintext = Buffer.from('Shared secret message');

      const sealed = await bridge.sealToPublicKey(publicKey, plaintext);
      expect(sealed.length).toBeGreaterThan(plaintext.length);

      const opened = await bridge.openSealed(secretKey, sealed);
      expect(Buffer.from(opened).equals(Buffer.from(plaintext))).toBe(true);
    });

    it('FAILS to open with the wrong secret key', async () => {
      const recipient = await bridge.generateShareKeypair();
      const attacker = await bridge.generateShareKeypair();
      const plaintext = Buffer.from('Secret message');

      const sealed = await bridge.sealToPublicKey(recipient.publicKey, plaintext);
      await expect(bridge.openSealed(attacker.secretKey, sealed)).rejects.toThrow();
    });
  });

  // ==========================================================================
  // Hash + random — real SHA-256 / CSPRNG
  // ==========================================================================
  describe('Hashing and Randomness', () => {
    it('produces a real, input-dependent SHA-256', async () => {
      const h1 = await bridge.hashSha256(Buffer.from('Test data to hash'));
      const h1b = await bridge.hashSha256(Buffer.from('Test data to hash'));
      const h2 = await bridge.hashSha256(Buffer.from('different data'));
      expect(h1.length).toBe(64);
      expect(h1).toBe(h1b); // deterministic
      expect(h1).not.toBe(h2); // input-dependent
      // Known SHA-256("abc") vector.
      const known = await bridge.hashSha256(Buffer.from('abc'));
      expect(known).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });

    it('generates non-repeating random bytes (CSPRNG)', async () => {
      const r1 = await bridge.randomBytes(32);
      const r2 = await bridge.randomBytes(32);
      expect(r1.length).toBe(32);
      // Two CSPRNG draws must differ (the old mock returned 'e'×len, identical).
      expect(Buffer.from(r1).equals(Buffer.from(r2))).toBe(false);
    });
  });

  // ==========================================================================
  // SRP-6a — real client (srpClient.ts) against the locked cross-impl vector
  // ==========================================================================
  describe('SRP-6a (real client)', () => {
    // Fixed RNG-free scalars matching the Go/Rust/TS KAT and srp_interop_vector.json.
    const a = 3n;
    const b = 5n;
    const x = 7n;
    const EXPECTED_K = '58e7293fe5f28bfcc8ab8cd7d64934eb6a1336e77fb5faa9ed865dcfda1ab568';
    const EXPECTED_M1 = '350a85edaefb298e1322c41797462cccaaae940014aab486ba767cfcd13ad89b';
    const EXPECTED_M2 = 'c2abc70b30ad7f77598d9d91211e9a02d2e1e831cff8de5c0770762c4564db4c';

    it('reproduces K/M1/M2 from the real SRP-6a derivation', async () => {
      const k = await computeK();
      const v = modPow(g, x, N);
      const A = modPow(g, a, N);
      const gb = modPow(g, b, N);
      const B = (((k * v) % N) + gb) % N;

      const { K, M1 } = await processChallenge(a, x, B);
      expect(bytesToHex(K)).toBe(EXPECTED_K);
      expect(bytesToHex(M1)).toBe(EXPECTED_M1);

      const M2 = await computeM2(A, M1, K);
      expect(bytesToHex(M2)).toBe(EXPECTED_M2);

      // Mutual auth: accept the matching M2, reject a tampered one.
      expect(await verifyServerM2(A, M1, K, M2)).toBe(true);
      const badM2 = new Uint8Array(M2);
      badM2[0] ^= 0xff;
      expect(await verifyServerM2(A, M1, K, badM2)).toBe(false);
    });

    it('rejects a zero server public key B', async () => {
      await expect(processChallenge(3n, 7n, 0n)).rejects.toThrow('Invalid server public key B');
    });
  });
});
