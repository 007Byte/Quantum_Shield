/**
 * Recovery (SG-006) Service Tests
 *
 * Exercises Shamir's Secret Sharing over GF(256): split/reconstruct
 * round-trips, threshold semantics, validation/error paths, base32
 * recovery-code encode/decode, and the high-level MEK recovery flow.
 *
 * The ONLY mocked boundary is `@/crypto/bridge.randomBytes` (a native
 * module unavailable under jest). It is replaced with real CSPRNG bytes
 * from webcrypto so the SSS polynomial math, Lagrange interpolation and
 * round-trips are all exercised for real.
 */

// Genuine boundary: native randomBytes -> real webcrypto CSPRNG.
import {
  splitSecret,
  reconstructSecret,
  encodeRecoveryCode,
  decodeRecoveryCode,
  generateRecoveryCodes,
  recoverMEK,
  type ShamirShare,
} from '../recovery';

jest.mock('@/crypto/bridge', () => ({
  randomBytes: jest.fn(async (length: number) => {
    const out = new Uint8Array(length);
    (globalThis.crypto as Crypto).getRandomValues(out);
    return out;
  }),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
  },
}));

/** All C(n,k) combinations of `arr` of size `k`. */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

const randomSecret = (len: number): Uint8Array => {
  const s = new Uint8Array(len);
  (globalThis.crypto as Crypto).getRandomValues(s);
  return s;
};

describe('recovery — Shamir Secret Sharing (SG-006)', () => {
  describe('splitSecret', () => {
    it('produces n shares with sequential indices 1..n and correct data length', async () => {
      const secret = randomSecret(16);
      const shares = await splitSecret(secret, 5, 3);

      expect(shares).toHaveLength(5);
      shares.forEach((share, i) => {
        expect(share.index).toBe(i + 1);
        expect(share.data).toBeInstanceOf(Uint8Array);
        expect(share.data.length).toBe(secret.length);
      });
    });

    it('rejects threshold < 2', async () => {
      await expect(splitSecret(randomSecret(8), 5, 1)).rejects.toThrow(/Invalid threshold/);
    });

    it('rejects threshold > n', async () => {
      await expect(splitSecret(randomSecret(8), 3, 4)).rejects.toThrow(/Invalid threshold/);
    });

    it('rejects n > 255', async () => {
      await expect(splitSecret(randomSecret(8), 256, 3)).rejects.toThrow(/more than 255 shares/);
    });

    it('rejects an empty secret', async () => {
      await expect(splitSecret(new Uint8Array(0), 5, 3)).rejects.toThrow(/cannot be empty/);
    });

    it('produces different share data across two splits of the same secret (random polynomial)', async () => {
      const secret = randomSecret(16);
      const a = await splitSecret(secret, 5, 3);
      const b = await splitSecret(secret, 5, 3);
      // Index 1 share data should differ because the polynomial coefficients are random.
      expect(Array.from(a[0].data)).not.toEqual(Array.from(b[0].data));
    });
  });

  describe('reconstructSecret — round-trips', () => {
    it('reconstructs the exact secret from EXACTLY k shares (any combination)', async () => {
      const secret = randomSecret(32);
      const shares = await splitSecret(secret, 5, 3);

      // Every 3-of-5 subset must reconstruct the original secret.
      for (const subset of combinations(shares, 3)) {
        const recovered = reconstructSecret(subset);
        expect(Array.from(recovered)).toEqual(Array.from(secret));
      }
    });

    it('reconstructs from MORE than k shares (all n)', async () => {
      const secret = randomSecret(20);
      const shares = await splitSecret(secret, 5, 3);
      const recovered = reconstructSecret(shares);
      expect(Array.from(recovered)).toEqual(Array.from(secret));
    });

    it('does NOT recover the secret from fewer than k shares', async () => {
      const secret = randomSecret(32);
      const shares = await splitSecret(secret, 5, 3);
      // Only 2 shares (threshold is 3): interpolation at x=0 yields a wrong value.
      const wrong = reconstructSecret([shares[0], shares[1]]);
      expect(Array.from(wrong)).not.toEqual(Array.from(secret));
    });

    it('supports a 2-of-2 split/reconstruct', async () => {
      const secret = randomSecret(8);
      const shares = await splitSecret(secret, 2, 2);
      expect(Array.from(reconstructSecret(shares))).toEqual(Array.from(secret));
    });

    it('handles secret bytes including 0x00 and 0xFF correctly', async () => {
      const secret = new Uint8Array([0, 255, 0, 128, 1, 254, 0, 0]);
      const shares = await splitSecret(secret, 4, 2);
      expect(Array.from(reconstructSecret([shares[1], shares[3]]))).toEqual(Array.from(secret));
    });
  });

  describe('reconstructSecret — validation/error paths', () => {
    it('rejects fewer than 2 shares', () => {
      expect(() => reconstructSecret([{ index: 1, data: new Uint8Array([1]) }])).toThrow(
        /at least 2 shares/
      );
    });

    it('rejects shares of mismatched data length', () => {
      const shares: ShamirShare[] = [
        { index: 1, data: new Uint8Array([1, 2, 3]) },
        { index: 2, data: new Uint8Array([1, 2]) },
      ];
      expect(() => reconstructSecret(shares)).toThrow(/same data length/);
    });

    it('rejects an out-of-range share index', () => {
      const shares: ShamirShare[] = [
        { index: 0, data: new Uint8Array([1, 2]) },
        { index: 2, data: new Uint8Array([3, 4]) },
      ];
      expect(() => reconstructSecret(shares)).toThrow(/Invalid share index/);
    });

    it('rejects duplicate share indices', () => {
      const shares: ShamirShare[] = [
        { index: 2, data: new Uint8Array([1, 2]) },
        { index: 2, data: new Uint8Array([3, 4]) },
      ];
      expect(() => reconstructSecret(shares)).toThrow(/Duplicate share indices/);
    });

    it('rejects when reconstructed length does not match the expected length', async () => {
      const secret = randomSecret(16);
      const shares = await splitSecret(secret, 3, 2);
      expect(() => reconstructSecret([shares[0], shares[1]], 99)).toThrow(/doesn't match expected/);
    });

    it('accepts when reconstructed length matches the expected length', async () => {
      const secret = randomSecret(16);
      const shares = await splitSecret(secret, 3, 2);
      expect(() => reconstructSecret([shares[0], shares[1]], 16)).not.toThrow();
    });
  });

  describe('encodeRecoveryCode / decodeRecoveryCode', () => {
    it('round-trips a share through base32 encode/decode', async () => {
      const shares = await splitSecret(randomSecret(64), 5, 3);
      const share = shares[2];

      const code = encodeRecoveryCode(share);
      const decoded = decodeRecoveryCode(code);

      expect(decoded.index).toBe(share.index);
      expect(Array.from(decoded.data)).toEqual(Array.from(share.data));
    });

    it('groups the encoded code into dash-separated 4-char blocks', async () => {
      const shares = await splitSecret(randomSecret(64), 5, 3);
      const code = encodeRecoveryCode(shares[0]);

      const groups = code.split('-');
      expect(groups.length).toBeGreaterThan(1);
      // Every group except possibly the last is exactly 4 characters.
      groups.slice(0, -1).forEach(g => expect(g.length).toBe(4));
    });

    it('decodes case-insensitively and ignores dashes/whitespace', async () => {
      const shares = await splitSecret(randomSecret(64), 5, 3);
      const code = encodeRecoveryCode(shares[1]);

      const messy = `  ${code.toLowerCase().replace(/-/g, '')}  `;
      const decoded = decodeRecoveryCode(messy);

      expect(decoded.index).toBe(shares[1].index);
      expect(Array.from(decoded.data)).toEqual(Array.from(shares[1].data));
    });

    it('rejects codes that are too short', () => {
      // A single base32 char decodes to <2 payload bytes.
      expect(() => decodeRecoveryCode('A')).toThrow(/too short/);
    });

    it('rejects invalid base32 characters', () => {
      // '1', '8', '9', '0' are not in the RFC4648 base32 alphabet used here.
      expect(() => decodeRecoveryCode('ABCD-1888')).toThrow(/Invalid base32 character/);
    });
  });

  describe('generateRecoveryCodes / recoverMEK — high-level flow', () => {
    it('generates the configured number of codes and recovers the MEK from a threshold subset', async () => {
      const mek = randomSecret(64);
      const codes = await generateRecoveryCodes(mek, { totalShares: 5, threshold: 3 });

      expect(codes).toHaveLength(5);
      codes.forEach(c => expect(typeof c).toBe('string'));

      // Any 3 of the 5 codes must reconstruct the original 64-byte MEK.
      const recovered = recoverMEK([codes[0], codes[2], codes[4]]);
      expect(recovered.length).toBe(64);
      expect(Array.from(recovered)).toEqual(Array.from(mek));
    });

    it('uses default config (5 shares / 3 threshold) when none provided', async () => {
      const mek = randomSecret(64);
      const codes = await generateRecoveryCodes(mek);
      expect(codes).toHaveLength(5);

      const recovered = recoverMEK(codes.slice(0, 3));
      expect(Array.from(recovered)).toEqual(Array.from(mek));
    });

    it('wraps generation failures in a descriptive error', async () => {
      // Empty MEK triggers splitSecret's "cannot be empty" guard.
      await expect(generateRecoveryCodes(new Uint8Array(0))).rejects.toThrow(
        /Recovery code generation failed/
      );
    });

    it('recoverMEK throws when the reconstructed length is not 64 bytes', async () => {
      // Codes generated from a 32-byte secret reconstruct to 32 bytes, but
      // recoverMEK asserts 64 -> length mismatch -> wrapped error.
      const codes = await generateRecoveryCodes(randomSecret(32), { totalShares: 5, threshold: 3 });
      expect(() => recoverMEK(codes.slice(0, 3))).toThrow(/MEK recovery failed/);
    });

    it('recoverMEK throws on malformed codes', () => {
      expect(() => recoverMEK(['not-valid-1888', 'also-bad'])).toThrow(/MEK recovery failed/);
    });
  });
});
