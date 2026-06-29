/**
 * Tests for the key-verification service (src/services/crypto/keyVerification.ts).
 *
 * Exercises REAL behavior (real SHA-256 via the jest webcrypto polyfill, the real
 * safety-number formatting math, and real localStorage round-trips):
 * - safety-number generation/format (Signal-style 12×5 digits), determinism, key validation
 * - QR payload generation + the full verifyScannedQR state machine (invalid/expired/
 *   fingerprint-mismatch/key-changed/verified)
 * - verification persistence, case-insensitive lookups, key-change detection (SG-009)
 * - export/import round-trip, clear, and the native (non-web) no-op storage path
 */
import { Platform } from 'react-native';
import { keyVerificationService as svc } from '../keyVerification';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// In-memory localStorage (the service persists only on web).
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => {
    store[k] = String(v);
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
});

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);
const KEY_LOCAL = '1'.repeat(64);

beforeEach(() => {
  localStorageMock.clear();
  (Platform as any).OS = 'web';
});

describe('generateSafetyNumber', () => {
  it('produces 12 groups of 5 digits', async () => {
    const sn = await svc.generateSafetyNumber(KEY_LOCAL, KEY_A);
    expect(sn).toMatch(/^(\d{5} ){11}\d{5}$/);
  });

  it('is deterministic for the same inputs', async () => {
    const a = await svc.generateSafetyNumber(KEY_LOCAL, KEY_A);
    const b = await svc.generateSafetyNumber(KEY_LOCAL, KEY_A);
    expect(a).toBe(b);
  });

  it('is order-sensitive (local+remote concatenation)', async () => {
    const ab = await svc.generateSafetyNumber(KEY_A, KEY_B);
    const ba = await svc.generateSafetyNumber(KEY_B, KEY_A);
    expect(ab).not.toBe(ba);
  });

  it.each([
    ['local', 'xyz', KEY_A, 'Invalid local public key'],
    ['remote', KEY_A, 'tooshort', 'Invalid remote public key'],
  ])('rejects an invalid %s key', async (_which, local, remote, msg) => {
    await expect(svc.generateSafetyNumber(local, remote)).rejects.toThrow(msg);
  });
});

describe('formatSafetyNumber (the digit math)', () => {
  it('maps all-zero bytes to twelve "00000" groups', () => {
    expect(svc.formatSafetyNumber('00'.repeat(24))).toBe(Array(12).fill('00000').join(' '));
  });

  it('maps all-0xff bytes to "65535" groups ((0xffff) % 100000)', () => {
    expect(svc.formatSafetyNumber('ff'.repeat(24))).toBe(Array(12).fill('65535').join(' '));
  });

  it('always yields 12 groups even when the hash is short (missing bytes → 0)', () => {
    expect(svc.formatSafetyNumber('0102')).toMatch(/^(\d{5} ){11}\d{5}$/);
  });
});

describe('hashPublicKey', () => {
  it('returns a deterministic 64-hex SHA-256', async () => {
    const h1 = await svc.hashPublicKey(KEY_A);
    const h2 = await svc.hashPublicKey(KEY_A);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);
    expect(await svc.hashPublicKey(KEY_B)).not.toBe(h1);
  });
});

describe('generateQRPayload', () => {
  it('builds a payload with a normalized email, the key, a 16-hex uppercase fingerprint, and a timestamp', async () => {
    const p = await svc.generateQRPayload(KEY_A, '  Alice@Example.COM ');
    expect(p.email).toBe('alice@example.com');
    expect(p.publicKeyHex).toBe(KEY_A);
    expect(p.fingerprint).toMatch(/^[0-9A-F]{16}$/);
    expect(() => new Date(p.generatedAt).toISOString()).not.toThrow();
    // fingerprint is the first 16 hex of SHA-256(key), uppercased
    expect(p.fingerprint).toBe((await svc.hashPublicKey(KEY_A)).substring(0, 16).toUpperCase());
  });
});

describe('verifyContact / isContactVerified / getVerificationRecord', () => {
  it('persists a verified record (case-insensitive) with hash + timestamp', async () => {
    await svc.verifyContact('Bob@Example.com', true, '12345 67890', KEY_A);
    expect(svc.isContactVerified('bob@example.com')).toBe(true);

    const rec = svc.getVerificationRecord('BOB@EXAMPLE.COM');
    expect(rec).toBeDefined();
    expect(rec!.verified).toBe(true);
    expect(rec!.safetyNumber).toBe('12345 67890');
    expect(rec!.verifiedAt).toBeDefined();
    expect(rec!.publicKeyHash).toBe(await svc.hashPublicKey(KEY_A));
    expect(rec!.keyChanged).toBe(false);
  });

  it('marking unverified clears the verified flag', async () => {
    await svc.verifyContact('bob@example.com', true, undefined, KEY_A);
    await svc.verifyContact('bob@example.com', false);
    expect(svc.isContactVerified('bob@example.com')).toBe(false);
  });

  it('isContactVerified is false for unknown contacts', () => {
    expect(svc.isContactVerified('nobody@example.com')).toBe(false);
  });
});

describe('checkKeyChanged (SG-009)', () => {
  it('reports no change for a brand-new contact', async () => {
    const r = await svc.checkKeyChanged('new@example.com', KEY_A);
    expect(r.changed).toBe(false);
    expect(r.wasVerified).toBe(false);
    expect(r.currentKeyHash).toBe(await svc.hashPublicKey(KEY_A));
  });

  it('reports no change when the key matches the verified key', async () => {
    await svc.verifyContact('bob@example.com', true, undefined, KEY_A);
    const r = await svc.checkKeyChanged('bob@example.com', KEY_A);
    expect(r.changed).toBe(false);
    expect(r.wasVerified).toBe(true);
  });

  it('detects a changed key and INVALIDATES the verification', async () => {
    await svc.verifyContact('bob@example.com', true, undefined, KEY_A);
    const r = await svc.checkKeyChanged('bob@example.com', KEY_B);

    expect(r.changed).toBe(true);
    expect(r.previousKeyHash).toBe(await svc.hashPublicKey(KEY_A));
    expect(r.currentKeyHash).toBe(await svc.hashPublicKey(KEY_B));
    // verification auto-invalidated + flagged
    expect(svc.isContactVerified('bob@example.com')).toBe(false);
    const rec = svc.getVerificationRecord('bob@example.com')!;
    expect(rec.keyChanged).toBe(true);
    expect(rec.keyChangedAt).toBeDefined();
  });
});

describe('verifyScannedQR (state machine)', () => {
  it('rejects non-JSON payloads', async () => {
    const r = await svc.verifyScannedQR('not-json{', KEY_LOCAL);
    expect(r).toMatchObject({ valid: false, status: 'invalid_format' });
  });

  it('rejects payloads missing required fields', async () => {
    const r = await svc.verifyScannedQR(JSON.stringify({ email: 'a@b.com' }), KEY_LOCAL);
    expect(r.status).toBe('invalid_format');
  });

  it('rejects a malformed public key', async () => {
    const bad = {
      email: 'a@b.com',
      publicKeyHex: 'zz',
      fingerprint: 'X',
      generatedAt: new Date().toISOString(),
    };
    const r = await svc.verifyScannedQR(JSON.stringify(bad), KEY_LOCAL);
    expect(r.status).toBe('invalid_format');
  });

  it('rejects an expired QR (older than the 10-minute window)', async () => {
    const p = await svc.generateQRPayload(KEY_A, 'alice@example.com');
    p.generatedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const r = await svc.verifyScannedQR(JSON.stringify(p), KEY_LOCAL);
    expect(r.status).toBe('expired');
    expect(r.email).toBe('alice@example.com');
  });

  it('rejects a tampered fingerprint', async () => {
    const p = await svc.generateQRPayload(KEY_A, 'alice@example.com');
    p.fingerprint = '0000000000000000';
    const r = await svc.verifyScannedQR(JSON.stringify(p), KEY_LOCAL);
    expect(r.status).toBe('fingerprint_mismatch');
  });

  it('verifies a valid QR and marks the contact verified with a safety number', async () => {
    const p = await svc.generateQRPayload(KEY_A, 'alice@example.com');
    const r = await svc.verifyScannedQR(JSON.stringify(p), KEY_LOCAL);

    expect(r.valid).toBe(true);
    expect(r.status).toBe('verified');
    expect(r.email).toBe('alice@example.com');
    expect(r.safetyNumber).toMatch(/^(\d{5} ){11}\d{5}$/);
    expect(svc.isContactVerified('alice@example.com')).toBe(true);
  });

  it('flags key_changed when a valid QR carries a different key than the verified one', async () => {
    // previously verified alice with KEY_A
    await svc.verifyContact('alice@example.com', true, undefined, KEY_A);
    // now scan a (self-consistent) QR carrying KEY_B for the same contact
    const p = await svc.generateQRPayload(KEY_B, 'alice@example.com');
    const r = await svc.verifyScannedQR(JSON.stringify(p), KEY_LOCAL);
    expect(r.status).toBe('key_changed');
    expect(r.valid).toBe(false);
  });
});

describe('export / import / clear', () => {
  it('round-trips records through export → clear → import', async () => {
    await svc.verifyContact('alice@example.com', true, '11111 22222', KEY_A);
    const backup = svc.exportVerifications();
    expect(backup).toContain('alice@example.com');

    svc.clearAllVerifications();
    expect(svc.isContactVerified('alice@example.com')).toBe(false);

    svc.importVerifications(backup);
    expect(svc.isContactVerified('alice@example.com')).toBe(true);
    expect(svc.getVerificationRecord('alice@example.com')!.safetyNumber).toBe('11111 22222');
  });

  it('importVerifications throws on invalid JSON', () => {
    expect(() => svc.importVerifications('}{not json')).toThrow('Failed to import verifications');
  });

  it('clearVerification removes a single contact', async () => {
    await svc.verifyContact('alice@example.com', true, undefined, KEY_A);
    await svc.verifyContact('bob@example.com', true, undefined, KEY_B);
    svc.clearVerification('alice@example.com');
    expect(svc.isContactVerified('alice@example.com')).toBe(false);
    expect(svc.isContactVerified('bob@example.com')).toBe(true);
  });

  it('getVerificationStatus returns all records', async () => {
    await svc.verifyContact('a@x.com', true, undefined, KEY_A);
    await svc.verifyContact('b@x.com', true, undefined, KEY_B);
    expect(svc.getVerificationStatus().size).toBe(2);
  });
});

describe('native (non-web) platform — storage is a no-op', () => {
  it('does not persist verifications off web', async () => {
    (Platform as any).OS = 'ios';
    await svc.verifyContact('alice@example.com', true, undefined, KEY_A);
    expect(svc.isContactVerified('alice@example.com')).toBe(false);
    expect(svc.getVerificationStatus().size).toBe(0);
  });
});
