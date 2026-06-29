/**
 * crypto-pr6: web-side Argon2id param-bounds + self-destruct sentinel.
 *
 * These mirror the Rust bounds (usbvault-crypto/src/kdf.rs `argon2_bounds` /
 * `validate_argon2_params`) and the self-destruct sentinel
 * (VaultHeader::KDF_HASH_ID_DESTROYED). Keeping them in lockstep is what makes
 * the web and native unlock paths agree on which vaults are valid.
 */

import { ARGON2_BOUNDS, KDF_HASH_ID_DESTROYED, validateArgon2Params } from '@/crypto/native';

describe('crypto-pr6 Argon2 param bounds (web mirrors Rust)', () => {
  it('matches the Rust bounds exactly', () => {
    expect(ARGON2_BOUNDS.MIN_MEMORY_KIB).toBe(8 * 1024);
    expect(ARGON2_BOUNDS.MAX_MEMORY_KIB).toBe(1024 * 1024);
    expect(ARGON2_BOUNDS.MIN_TIME).toBe(1);
    expect(ARGON2_BOUNDS.MAX_TIME).toBe(16);
    expect(ARGON2_BOUNDS.MIN_PARALLELISM).toBe(1);
    expect(ARGON2_BOUNDS.MAX_PARALLELISM).toBe(16);
  });

  it('accepts real on-disk vault params (defaults + non-default fixtures)', () => {
    expect(() => validateArgon2Params(65536, 3, 4)).not.toThrow();
    expect(() => validateArgon2Params(131072, 4, 8)).not.toThrow();
    // Exact bounds are inclusive.
    expect(() => validateArgon2Params(8 * 1024, 1, 1)).not.toThrow();
    expect(() => validateArgon2Params(1024 * 1024, 16, 16)).not.toThrow();
  });

  it('rejects DoS / weakening params (mirrors Rust rejection set)', () => {
    expect(() => validateArgon2Params(4096, 3, 4)).toThrow(); // below MIN memory
    expect(() => validateArgon2Params(2_097_152, 3, 4)).toThrow(); // above MAX memory (2 GiB)
    expect(() => validateArgon2Params(0xffffffff, 3, 4)).toThrow(); // u32::MAX memory
    expect(() => validateArgon2Params(65536, 0, 4)).toThrow(); // time 0
    expect(() => validateArgon2Params(65536, 17, 4)).toThrow(); // time 17
    expect(() => validateArgon2Params(65536, 3, 0)).toThrow(); // parallelism 0
    expect(() => validateArgon2Params(65536, 3, 17)).toThrow(); // parallelism 17
  });

  it('uses the same self-destruct sentinel byte as Rust (0xDE)', () => {
    expect(KDF_HASH_ID_DESTROYED).toBe(0xde);
  });
});
