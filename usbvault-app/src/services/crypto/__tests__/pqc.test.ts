/**
 * Post-Quantum Cryptography Service Tests
 *
 * Real-behavior coverage for `src/services/crypto/pqc.ts`:
 *  - Hybrid key (de)serialization round-trips + size validation
 *  - Native-backed seal/open/keygen logic, key-size validation, error wrapping
 *  - Capability reporting (isPQCAvailable / getPQCStatus)
 *  - PQC enrollment + CNSA compliance + key-rotation status state machine
 *
 * IMPORTANT: pqc.ts captures `isWeb = Platform.OS === 'web'` at module-load
 * time, and the native functions short-circuit on web while the status/storage
 * functions only persist on web. We therefore load the module under two
 * distinct platform contexts via `jest.isolateModules` + `jest.doMock`:
 *   - loadWeb():    Platform.OS = 'web'  (status/storage + localStorage path)
 *   - loadNative(): Platform.OS = 'ios'  (+ a mocked native PQC module)
 *
 * The global jest.setup.js already mocks 'react-native'; each loader installs a
 * scoped mock so the captured `isWeb` is correct for that module instance. Only
 * genuine boundaries are mocked: the native Rust PQC bridge (NativeModules) and
 * auditService (which itself touches storage). pqc.ts's own logic is real.
 */

import { Buffer } from 'buffer';

type PqcModule = typeof import('../pqc');

interface MockNative {
  pqcGenerateKeypair: jest.Mock;
  pqcSeal: jest.Mock;
  pqcOpen: jest.Mock;
  pqcIsAvailable: jest.Mock;
}

// Shared audit spy — populated by the audit mock factory inside each load.
const auditLog = jest.fn().mockResolvedValue(undefined);

/** Build a fresh native PQC module mock with sensible defaults. */
function makeMockNative(overrides: Partial<MockNative> = {}): MockNative {
  return {
    pqcGenerateKeypair: jest.fn(),
    pqcSeal: jest.fn(),
    pqcOpen: jest.fn(),
    pqcIsAvailable: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

/**
 * Load pqc.ts fresh with Platform.OS === 'web'. Status/storage functions
 * persist to localStorage in this mode; native crypto functions throw.
 */
function loadWeb(): PqcModule {
  let mod: PqcModule;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
      NativeModules: {},
    }));
    jest.doMock('../../auditService', () => ({ auditService: { log: auditLog } }));
    mod = require('../pqc') as PqcModule;
  });
  return mod!;
}

/**
 * Load pqc.ts fresh with Platform.OS === 'ios' and a native PQC module present.
 * Native crypto functions run their real validation/audit/wrapping logic and
 * delegate to the supplied mock at the FFI boundary.
 */
function loadNative(native: MockNative | null): PqcModule {
  let mod: PqcModule;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
      NativeModules: native ? { USBVaultPQC: native } : {},
    }));
    jest.doMock('../../auditService', () => ({ auditService: { log: auditLog } }));
    mod = require('../pqc') as PqcModule;
  });
  return mod!;
}

const b64 = (bytes: number[] | Uint8Array): string =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)).toString('base64');

/** A valid-size hybrid public key (X25519=32, ML-KEM pub=1568). */
function validPublicKey(): { x25519: string; mlKem: string } {
  return {
    x25519: b64(new Uint8Array(32).fill(1)),
    mlKem: b64(new Uint8Array(1568).fill(2)),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  auditLog.mockResolvedValue(undefined);
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});

// ──────────────────────────────────────────────────────────────────
describe('constants', () => {
  it('exposes the documented ML-KEM-1024 / X25519 sizes and derived overhead', () => {
    const pqc = loadWeb();
    expect(pqc.MLKEM_PUBLIC_KEY_SIZE).toBe(1568);
    expect(pqc.MLKEM_CIPHERTEXT_SIZE).toBe(1568);
    expect(pqc.X25519_KEY_SIZE).toBe(32);
    // overhead = x25519_eph(32) + mlkem_ct(1568) + nonce(24) + tag(16)
    expect(pqc.HYBRID_SEAL_OVERHEAD).toBe(32 + 1568 + 24 + 16);
    expect(pqc.HYBRID_SEAL_OVERHEAD).toBe(1640);
  });
});

// ──────────────────────────────────────────────────────────────────
describe('serializePublicKey / deserializePublicKey', () => {
  it('round-trips a hybrid public key through a single base64 blob', () => {
    const pqc = loadWeb();
    const key = {
      x25519: b64(Array.from({ length: 32 }, (_, i) => i & 0xff)),
      mlKem: b64(Array.from({ length: 1568 }, (_, i) => (i * 7) & 0xff)),
    };
    const serialized = pqc.serializePublicKey(key);
    const restored = pqc.deserializePublicKey(serialized);
    expect(restored.x25519).toBe(key.x25519);
    expect(restored.mlKem).toBe(key.mlKem);
  });

  it('produces a 1600-byte concatenation (x25519 || ml-kem)', () => {
    const pqc = loadWeb();
    const serialized = pqc.serializePublicKey(validPublicKey());
    expect(Buffer.from(serialized, 'base64').length).toBe(32 + 1568);
  });

  it('preserves the X25519 prefix and ML-KEM suffix byte boundary', () => {
    const pqc = loadWeb();
    // Distinct fill values so we can prove the split lands at byte 32.
    const key = {
      x25519: b64(new Uint8Array(32).fill(0xaa)),
      mlKem: b64(new Uint8Array(1568).fill(0xbb)),
    };
    const raw = Buffer.from(pqc.serializePublicKey(key), 'base64');
    expect(Array.from(raw.subarray(0, 32))).toEqual(new Array(32).fill(0xaa));
    expect(Array.from(raw.subarray(32, 34))).toEqual([0xbb, 0xbb]);
  });

  it('rejects a serialized blob of the wrong length with a descriptive error', () => {
    const pqc = loadWeb();
    const tooShort = b64(new Uint8Array(100));
    expect(() => pqc.deserializePublicKey(tooShort)).toThrow(/Invalid serialized key size/);
    expect(() => pqc.deserializePublicKey(tooShort)).toThrow(/expected 1600, got 100/);
  });

  it('accepts exactly 1600 bytes and splits 32 / 1568', () => {
    const pqc = loadWeb();
    const exact = b64(new Uint8Array(1600).fill(9));
    const out = pqc.deserializePublicKey(exact);
    expect(Buffer.from(out.x25519, 'base64').length).toBe(32);
    expect(Buffer.from(out.mlKem, 'base64').length).toBe(1568);
  });
});

// ──────────────────────────────────────────────────────────────────
describe('isPQCAvailable', () => {
  it('returns false on web (no native module)', async () => {
    const pqc = loadWeb();
    await expect(pqc.isPQCAvailable()).resolves.toBe(false);
  });

  it('returns false on native when no PQC native module is registered', async () => {
    const pqc = loadNative(null);
    await expect(pqc.isPQCAvailable()).resolves.toBe(false);
  });

  it('delegates to native.pqcIsAvailable() and returns true when it resolves true', async () => {
    const native = makeMockNative({ pqcIsAvailable: jest.fn().mockResolvedValue(true) });
    const pqc = loadNative(native);
    await expect(pqc.isPQCAvailable()).resolves.toBe(true);
    expect(native.pqcIsAvailable).toHaveBeenCalledTimes(1);
  });

  it('returns false when native.pqcIsAvailable() resolves false', async () => {
    const native = makeMockNative({ pqcIsAvailable: jest.fn().mockResolvedValue(false) });
    const pqc = loadNative(native);
    await expect(pqc.isPQCAvailable()).resolves.toBe(false);
  });

  it('swallows native errors and returns false', async () => {
    const native = makeMockNative({
      pqcIsAvailable: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const pqc = loadNative(native);
    await expect(pqc.isPQCAvailable()).resolves.toBe(false);
  });

  it('returns false when accessing the native module throws', async () => {
    // Simulate NativeModules.USBVaultPQC access throwing (getNativeModule catch path).
    let mod: PqcModule;
    jest.isolateModules(() => {
      const nativeModules = {};
      Object.defineProperty(nativeModules, 'USBVaultPQC', {
        get() {
          throw new Error('bridge access failed');
        },
      });
      jest.doMock('react-native', () => ({
        Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
        NativeModules: nativeModules,
      }));
      jest.doMock('../../auditService', () => ({ auditService: { log: auditLog } }));
      mod = require('../pqc') as PqcModule;
    });
    await expect(mod!.isPQCAvailable()).resolves.toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
describe('getPQCStatus', () => {
  it('reports availability=false and the documented hybrid mode/platform on web', async () => {
    const pqc = loadWeb();
    const status = await pqc.getPQCStatus();
    expect(status.available).toBe(false);
    expect(status.algorithm).toBe('ML-KEM-1024');
    expect(status.keySize).toBe(1568);
    expect(status.hybridMode).toBe('X25519 + ML-KEM-1024 (HKDF-SHA256)');
    expect(status.platform).toBe('web');
  });

  it('reflects native availability and reports the ios platform', async () => {
    const native = makeMockNative({ pqcIsAvailable: jest.fn().mockResolvedValue(true) });
    const pqc = loadNative(native);
    const status = await pqc.getPQCStatus();
    expect(status.available).toBe(true);
    expect(status.platform).toBe('ios');
    expect(status.keySize).toBe(pqc.MLKEM_PUBLIC_KEY_SIZE);
  });
});

// ──────────────────────────────────────────────────────────────────
describe('generateHybridKeypair', () => {
  it('throws when PQC is unavailable (web / no native module)', async () => {
    const pqc = loadWeb();
    await expect(pqc.generateHybridKeypair()).rejects.toThrow(/PQC not available/);
  });

  it('maps native FFI output into the hybrid public/secret key shape', async () => {
    const native = makeMockNative({
      pqcGenerateKeypair: jest.fn().mockResolvedValue({
        x25519Pub: 'XPUB',
        mlKemPub: 'KPUB',
        x25519Sec: 'XSEC',
        mlKemSec: 'KSEC',
      }),
    });
    const pqc = loadNative(native);
    const kp = await pqc.generateHybridKeypair();
    expect(kp).toEqual({
      publicKey: { x25519: 'XPUB', mlKem: 'KPUB' },
      secretKey: { x25519: 'XSEC', mlKem: 'KSEC' },
    });
    expect(native.pqcGenerateKeypair).toHaveBeenCalledTimes(1);
  });

  it('logs a success audit event tagged X25519+ML-KEM-1024', async () => {
    const native = makeMockNative({
      pqcGenerateKeypair: jest.fn().mockResolvedValue({
        x25519Pub: 'aa',
        mlKemPub: 'bbbb',
        x25519Sec: 's',
        mlKemSec: 's',
      }),
    });
    const pqc = loadNative(native);
    await pqc.generateHybridKeypair();
    expect(auditLog).toHaveBeenCalledWith(
      'crypto',
      'pqc_keypair_generated',
      expect.objectContaining({
        algorithm: 'X25519+ML-KEM-1024',
        x25519PubLength: 2,
        mlKemPubLength: 4,
      }),
      'success'
    );
  });

  it('wraps native errors, logs an error event, and rethrows a descriptive message', async () => {
    const native = makeMockNative({
      pqcGenerateKeypair: jest.fn().mockRejectedValue(new Error('rng failure')),
    });
    const pqc = loadNative(native);
    await expect(pqc.generateHybridKeypair()).rejects.toThrow(
      'PQC keypair generation failed: rng failure'
    );
    expect(auditLog).toHaveBeenCalledWith(
      'crypto',
      'pqc_keypair_error',
      { error: 'rng failure' },
      'error'
    );
  });

  it('stringifies non-Error rejections in the wrapped message', async () => {
    const native = makeMockNative({
      pqcGenerateKeypair: jest.fn().mockRejectedValue('plain-string'),
    });
    const pqc = loadNative(native);
    await expect(pqc.generateHybridKeypair()).rejects.toThrow(
      'PQC keypair generation failed: plain-string'
    );
  });
});

// ──────────────────────────────────────────────────────────────────
describe('hybridSeal', () => {
  const plaintext = b64([1, 2, 3, 4]);

  it('throws when PQC is unavailable (web)', async () => {
    const pqc = loadWeb();
    await expect(pqc.hybridSeal(validPublicKey(), plaintext)).rejects.toThrow(/PQC not available/);
  });

  it('rejects a wrong-size X25519 public key before calling native', async () => {
    const native = makeMockNative();
    const pqc = loadNative(native);
    const bad = { x25519: b64(new Uint8Array(16)), mlKem: b64(new Uint8Array(1568)) };
    await expect(pqc.hybridSeal(bad, plaintext)).rejects.toThrow(
      'Invalid X25519 public key size: expected 32, got 16'
    );
    expect(native.pqcSeal).not.toHaveBeenCalled();
  });

  it('rejects a wrong-size ML-KEM public key before calling native', async () => {
    const native = makeMockNative();
    const pqc = loadNative(native);
    const bad = { x25519: b64(new Uint8Array(32)), mlKem: b64(new Uint8Array(100)) };
    await expect(pqc.hybridSeal(bad, plaintext)).rejects.toThrow(
      'Invalid ML-KEM public key size: expected 1568, got 100'
    );
    expect(native.pqcSeal).not.toHaveBeenCalled();
  });

  it('passes valid keys + plaintext through to native and returns the sealed blob', async () => {
    const sealed = b64(new Uint8Array(1700));
    const native = makeMockNative({ pqcSeal: jest.fn().mockResolvedValue(sealed) });
    const pqc = loadNative(native);
    const key = validPublicKey();
    await expect(pqc.hybridSeal(key, plaintext)).resolves.toBe(sealed);
    expect(native.pqcSeal).toHaveBeenCalledWith(key.x25519, key.mlKem, plaintext);
  });

  it('logs a seal audit event with plaintext and sealed byte sizes', async () => {
    const sealed = b64(new Uint8Array(1700));
    const native = makeMockNative({ pqcSeal: jest.fn().mockResolvedValue(sealed) });
    const pqc = loadNative(native);
    await pqc.hybridSeal(validPublicKey(), plaintext);
    expect(auditLog).toHaveBeenCalledWith(
      'crypto',
      'pqc_seal',
      expect.objectContaining({
        algorithm: 'X25519+ML-KEM-1024+XChaCha20-Poly1305',
        plaintextSize: 4,
        sealedSize: 1700,
      }),
      'success'
    );
  });

  it('wraps native seal errors and logs an error event', async () => {
    const native = makeMockNative({ pqcSeal: jest.fn().mockRejectedValue(new Error('seal oops')) });
    const pqc = loadNative(native);
    await expect(pqc.hybridSeal(validPublicKey(), plaintext)).rejects.toThrow(
      'PQC seal failed: seal oops'
    );
    expect(auditLog).toHaveBeenCalledWith(
      'crypto',
      'pqc_seal_error',
      { error: 'seal oops' },
      'error'
    );
  });

  it('stringifies non-Error seal rejections', async () => {
    const native = makeMockNative({ pqcSeal: jest.fn().mockRejectedValue('raw-seal-fail') });
    const pqc = loadNative(native);
    await expect(pqc.hybridSeal(validPublicKey(), plaintext)).rejects.toThrow(
      'PQC seal failed: raw-seal-fail'
    );
  });
});

// ──────────────────────────────────────────────────────────────────
describe('hybridOpen', () => {
  const secretKey = { x25519: b64(new Uint8Array(32)), mlKem: b64(new Uint8Array(3168)) };
  // A sealed blob at/above the minimum overhead (1640 bytes).
  const sealed = b64(new Uint8Array(1700));

  it('throws when PQC is unavailable (web)', async () => {
    const pqc = loadWeb();
    await expect(pqc.hybridOpen(secretKey, sealed)).rejects.toThrow(/PQC not available/);
  });

  it('rejects sealed data shorter than the hybrid overhead before calling native', async () => {
    const native = makeMockNative();
    const pqc = loadNative(native);
    const tooShort = b64(new Uint8Array(100));
    await expect(pqc.hybridOpen(secretKey, tooShort)).rejects.toThrow(
      'Sealed data too short: expected >= 1640 bytes, got 100'
    );
    expect(native.pqcOpen).not.toHaveBeenCalled();
  });

  it('passes secret key + sealed blob to native and returns the recovered plaintext', async () => {
    const pt = b64([9, 8, 7]);
    const native = makeMockNative({ pqcOpen: jest.fn().mockResolvedValue(pt) });
    const pqc = loadNative(native);
    await expect(pqc.hybridOpen(secretKey, sealed)).resolves.toBe(pt);
    expect(native.pqcOpen).toHaveBeenCalledWith(secretKey.x25519, secretKey.mlKem, sealed);
  });

  it('logs an open audit event with the sealed byte size', async () => {
    const native = makeMockNative({ pqcOpen: jest.fn().mockResolvedValue(b64([1])) });
    const pqc = loadNative(native);
    await pqc.hybridOpen(secretKey, sealed);
    expect(auditLog).toHaveBeenCalledWith(
      'crypto',
      'pqc_open',
      expect.objectContaining({
        algorithm: 'X25519+ML-KEM-1024+XChaCha20-Poly1305',
        sealedSize: 1700,
      }),
      'success'
    );
  });

  it('wraps native open errors (e.g. tag mismatch) and logs an error event', async () => {
    const native = makeMockNative({
      pqcOpen: jest.fn().mockRejectedValue(new Error('auth tag mismatch')),
    });
    const pqc = loadNative(native);
    await expect(pqc.hybridOpen(secretKey, sealed)).rejects.toThrow(
      'PQC open failed: auth tag mismatch'
    );
    expect(auditLog).toHaveBeenCalledWith(
      'crypto',
      'pqc_open_error',
      { error: 'auth tag mismatch' },
      'error'
    );
  });

  it('stringifies non-Error open rejections', async () => {
    const native = makeMockNative({ pqcOpen: jest.fn().mockRejectedValue('raw-open-fail') });
    const pqc = loadNative(native);
    await expect(pqc.hybridOpen(secretKey, sealed)).rejects.toThrow(
      'PQC open failed: raw-open-fail'
    );
  });
});

// ──────────────────────────────────────────────────────────────────
describe('seal → open round-trip wiring', () => {
  it('returns the original plaintext when native faithfully round-trips', async () => {
    const plaintext = b64([42, 43, 44, 45, 46]);
    const sealedBlob = b64(new Uint8Array(1700));
    const native = makeMockNative({
      pqcSeal: jest.fn().mockResolvedValue(sealedBlob),
      pqcOpen: jest.fn().mockImplementation(async () => plaintext),
    });
    const pqc = loadNative(native);
    const out = await pqc.hybridSeal(validPublicKey(), plaintext);
    const recovered = await pqc.hybridOpen(
      { x25519: b64(new Uint8Array(32)), mlKem: b64(new Uint8Array(3168)) },
      out
    );
    expect(recovered).toBe(plaintext);
  });
});

// ──────────────────────────────────────────────────────────────────
describe('PQC status state machine (web / localStorage)', () => {
  it('returns a default un-enrolled, non-compliant status with all 5 algorithms documented', () => {
    const pqc = loadWeb();
    const status = pqc.getPQCEnrollmentStatus();
    expect(status.mlKemEnrolled).toBe(false);
    expect(status.mlDsaEnrolled).toBe(false);
    expect(status.cnsaCompliant).toBe(false);
    const names = status.algorithmDetails.map(a => a.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'ML-KEM-1024',
        'ML-DSA-87',
        'AES-256-GCM-SIV',
        'SHA-3-256',
        'HKDF-SHA256',
      ])
    );
    expect(status.algorithmDetails).toHaveLength(5);
  });

  it('documents ML-DSA-87 as planned/pending (FIPS 204), never active by default', () => {
    const pqc = loadWeb();
    const mlDsa = pqc.getAlgorithmDetails().find(a => a.name === 'ML-DSA-87');
    expect(mlDsa).toBeDefined();
    expect(mlDsa!.standard).toBe('FIPS 204');
    expect(mlDsa!.status).toBe('pending');
  });

  it('enrollMLKEM marks ML-KEM enrolled+active, assigns a key id, and persists it', () => {
    const pqc = loadWeb();
    pqc.enrollMLKEM();
    const status = pqc.getPQCEnrollmentStatus();
    expect(status.mlKemEnrolled).toBe(true);
    expect(status.mlKemKeyId).toMatch(/^pqc-key-/);
    expect(status.algorithmDetails.find(a => a.name === 'ML-KEM-1024')!.status).toBe('active');
    // CNSA still false because ML-DSA is not enrolled yet.
    expect(status.cnsaCompliant).toBe(false);
  });

  it('enrollMLDSA records intent but keeps ML-DSA status pending (not implemented)', () => {
    const pqc = loadWeb();
    pqc.enrollMLDSA();
    const status = pqc.getPQCEnrollmentStatus();
    expect(status.mlDsaEnrolled).toBe(true);
    expect(status.mlDsaKeyId).toMatch(/^pqc-key-/);
    expect(status.algorithmDetails.find(a => a.name === 'ML-DSA-87')!.status).toBe('pending');
  });

  it('becomes CNSA 2.0 compliant only after BOTH ML-KEM and ML-DSA are enrolled', () => {
    const pqc = loadWeb();
    expect(pqc.checkCNSACompliance()).toBe(false);
    pqc.enrollMLKEM();
    expect(pqc.checkCNSACompliance()).toBe(false);
    pqc.enrollMLDSA();
    expect(pqc.checkCNSACompliance()).toBe(true);
    expect(pqc.getPQCEnrollmentStatus().cnsaCompliant).toBe(true);
  });

  it('generates unique key ids per enrollment', () => {
    const pqc = loadWeb();
    pqc.enrollMLKEM();
    const firstId = pqc.getPQCEnrollmentStatus().mlKemKeyId;
    pqc.enrollMLDSA();
    const dsaId = pqc.getPQCEnrollmentStatus().mlDsaKeyId;
    expect(firstId).not.toBe(dsaId);
  });

  it('uses the crypto-random key id format when getRandomValues is available', () => {
    const pqc = loadWeb();
    pqc.enrollMLKEM();
    // 16 random bytes -> 32 hex chars: pqc-key-<32 hex>
    expect(pqc.getPQCEnrollmentStatus().mlKemKeyId).toMatch(/^pqc-key-[0-9a-f]{32}$/);
  });

  it('falls back to a timestamped key id when crypto.getRandomValues throws', () => {
    const pqc = loadWeb();
    const original = crypto.getRandomValues;
    // Force the secure path to throw so the catch-branch fallback runs.
    (crypto as unknown as { getRandomValues: unknown }).getRandomValues = () => {
      throw new Error('entropy unavailable');
    };
    try {
      pqc.enrollMLKEM();
      // Fallback format is pqc-key-<timestamp>-<base36>, not 32 hex chars.
      expect(pqc.getPQCEnrollmentStatus().mlKemKeyId).toMatch(/^pqc-key-\d+-[0-9a-z]+$/);
    } finally {
      (crypto as unknown as { getRandomValues: typeof original }).getRandomValues = original;
    }
  });
});

// ──────────────────────────────────────────────────────────────────
describe('key rotation', () => {
  it('sets lastKeyRotation and a nextKeyRotation ~90 days out', () => {
    const pqc = loadWeb();
    const before = Date.now();
    pqc.rotateKeys();
    const last = pqc.getLastKeyRotation();
    const next = pqc.getNextKeyRotation();
    expect(last).toBeDefined();
    expect(next).toBeDefined();
    const gapDays = (new Date(next!).getTime() - new Date(last!).getTime()) / 86_400_000;
    expect(Math.round(gapDays)).toBe(90);
    expect(new Date(last!).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('rotates the ML-KEM key id when enrolled', () => {
    const pqc = loadWeb();
    pqc.enrollMLKEM();
    const beforeId = pqc.getPQCEnrollmentStatus().mlKemKeyId;
    pqc.rotateKeys();
    const afterId = pqc.getPQCEnrollmentStatus().mlKemKeyId;
    expect(afterId).toBeDefined();
    expect(afterId).not.toBe(beforeId);
  });

  it('does not assign key ids for algorithms that were never enrolled', () => {
    const pqc = loadWeb();
    pqc.rotateKeys();
    const status = pqc.getPQCEnrollmentStatus();
    expect(status.mlKemKeyId).toBeUndefined();
    expect(status.mlDsaKeyId).toBeUndefined();
  });

  it('isKeyRotationDue is false immediately after a rotation (next is 90d out)', () => {
    const pqc = loadWeb();
    pqc.rotateKeys();
    expect(pqc.isKeyRotationDue()).toBe(false);
  });

  it('isKeyRotationDue is true when a past nextKeyRotation is stored', () => {
    const pqc = loadWeb();
    pqc.enrollMLKEM();
    const status = pqc.getPQCEnrollmentStatus();
    status.nextKeyRotation = new Date(Date.now() - 86_400_000).toISOString();
    localStorage.setItem('usbvault:pqc_status', JSON.stringify(status));
    expect(pqc.isKeyRotationDue()).toBe(true);
  });

  it('isKeyRotationDue with no schedule depends on enrollment (true if anything enrolled)', () => {
    const pqc = loadWeb();
    // Nothing enrolled, no schedule → not due.
    expect(pqc.isKeyRotationDue()).toBe(false);
    pqc.enrollMLKEM(); // enrolls but does not set nextKeyRotation
    expect(pqc.isKeyRotationDue()).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
describe('activateAllAlgorithms', () => {
  it('marks ML-KEM/AES/SHA-3/HKDF active, leaves ML-DSA pending, and sets full compliance', () => {
    const pqc = loadWeb();
    pqc.activateAllAlgorithms();
    const status = pqc.getPQCEnrollmentStatus();
    const byName = Object.fromEntries(status.algorithmDetails.map(a => [a.name, a.status]));
    expect(byName['ML-KEM-1024']).toBe('active');
    expect(byName['AES-256-GCM-SIV']).toBe('active');
    expect(byName['SHA-3-256']).toBe('active');
    expect(byName['HKDF-SHA256']).toBe('active');
    // ML-DSA-87 stays pending: roadmap only, signatures still use Ed25519.
    expect(byName['ML-DSA-87']).toBe('pending');
    expect(status.mlKemEnrolled).toBe(true);
    expect(status.mlDsaEnrolled).toBe(true);
    expect(status.cnsaCompliant).toBe(true);
  });

  it('seeds key ids and a rotation schedule when none exist', () => {
    const pqc = loadWeb();
    pqc.activateAllAlgorithms();
    const status = pqc.getPQCEnrollmentStatus();
    expect(status.mlKemKeyId).toMatch(/^pqc-key-/);
    expect(status.mlDsaKeyId).toMatch(/^pqc-key-/);
    expect(status.lastKeyRotation).toBeDefined();
    expect(status.nextKeyRotation).toBeDefined();
  });

  it('preserves a pre-existing rotation schedule rather than overwriting it', () => {
    const pqc = loadWeb();
    pqc.rotateKeys();
    const originalLast = pqc.getLastKeyRotation();
    pqc.activateAllAlgorithms();
    expect(pqc.getLastKeyRotation()).toBe(originalLast);
  });
});

// ──────────────────────────────────────────────────────────────────
describe('resetPQCStatus', () => {
  it('clears persisted status so the next read returns defaults', () => {
    const pqc = loadWeb();
    pqc.enrollMLKEM();
    pqc.enrollMLDSA();
    expect(pqc.checkCNSACompliance()).toBe(true);
    pqc.resetPQCStatus();
    const status = pqc.getPQCEnrollmentStatus();
    expect(status.mlKemEnrolled).toBe(false);
    expect(status.mlDsaEnrolled).toBe(false);
    expect(status.cnsaCompliant).toBe(false);
    expect(localStorage.getItem('usbvault:pqc_status')).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────
describe('readStatus resilience', () => {
  it('falls back to defaults when stored JSON is corrupt', () => {
    const pqc = loadWeb();
    localStorage.setItem('usbvault:pqc_status', '{not valid json');
    const status = pqc.getPQCEnrollmentStatus();
    expect(status.mlKemEnrolled).toBe(false);
    expect(status.algorithmDetails).toHaveLength(5);
  });

  it('persists across calls (write then read sees enrolled state)', () => {
    const pqc = loadWeb();
    pqc.enrollMLKEM();
    expect(localStorage.getItem('usbvault:pqc_status')).not.toBeNull();
    // Fresh read reflects the persisted enrollment.
    expect(pqc.getPQCEnrollmentStatus().mlKemEnrolled).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
describe('non-web status behavior', () => {
  it('does not persist enrollment on native platforms (status stays default)', () => {
    const pqc = loadNative(makeMockNative());
    pqc.enrollMLKEM();
    pqc.enrollMLDSA();
    // writeStatus is a no-op off web, so a fresh read returns defaults.
    const status = pqc.getPQCEnrollmentStatus();
    expect(status.mlKemEnrolled).toBe(false);
    expect(status.cnsaCompliant).toBe(false);
  });

  it('checkCNSACompliance is false on native (nothing persisted)', () => {
    const pqc = loadNative(makeMockNative());
    expect(pqc.checkCNSACompliance()).toBe(false);
  });

  it('resetPQCStatus is a no-op off web (does not touch localStorage)', () => {
    const pqc = loadNative(makeMockNative());
    localStorage.setItem('usbvault:pqc_status', 'sentinel');
    pqc.resetPQCStatus();
    // Off web, reset returns early without clearing storage.
    expect(localStorage.getItem('usbvault:pqc_status')).toBe('sentinel');
  });
});

// ──────────────────────────────────────────────────────────────────
describe('pqcStatusService (class wrapper)', () => {
  it('delegates each method to the corresponding module function', () => {
    const pqc = loadWeb();
    const svc = pqc.pqcStatusService;
    expect(svc.getPQCStatus().mlKemEnrolled).toBe(false);
    svc.enrollMLKEM();
    svc.enrollMLDSA();
    expect(svc.checkCNSACompliance()).toBe(true);
    expect(svc.getAlgorithmDetails()).toHaveLength(5);
    svc.rotateKeys();
    expect(svc.getNextKeyRotation()).toBeDefined();
    expect(svc.getLastKeyRotation()).toBeDefined();
    expect(typeof svc.isKeyRotationDue()).toBe('boolean');
    svc.activateAllAlgorithms();
    expect(svc.getPQCStatus().cnsaCompliant).toBe(true);
    svc.reset();
    expect(svc.getPQCStatus().mlKemEnrolled).toBe(false);
  });
});
