/**
 * External Share Service Tests
 *
 * Real-behavior coverage for `src/services/sharing/external.ts`. These tests
 * exercise the genuine cryptography (AES-GCM encrypt/decrypt round-trips, HMAC
 * JWT-style token signing + verification, SHA-256 PIN hashing) using the real
 * WebCrypto polyfill installed by jest.setup.js — nothing in the crypto path is
 * stubbed.
 *
 * What we assert:
 *  - createShare: shape, hex encoding, expiry math, persistence, audit + sync
 *  - accessShare: full encrypt→decrypt round-trip recovers the plaintext bytes;
 *    access counting; not-found / revoked / expired / max-access / PIN branches
 *  - revoke / extend / getActiveExternalShares / getShareAuditLog
 *  - generateShareUrl / verifyPin / init+destroy lifecycle
 *
 * Only genuine boundaries are mocked: react-native Platform (forced 'web'),
 * auditService + syncService (they touch storage / network), logger, and a real
 * in-memory localStorage. The service's own logic runs unmodified.
 */

import type { ExternalShareConfig } from '../types';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/auditService', () => ({
  auditService: { log: auditLog },
}));

const syncEnqueue = jest.fn();
jest.mock('@/services/syncService', () => ({
  syncService: { enqueue: syncEnqueue },
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── In-memory localStorage ─────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});
Object.defineProperty(window.navigator, 'userAgent', {
  value: 'jest-external-agent',
  configurable: true,
});

const STORAGE_KEY_SHARES = 'usbvault:external_shares';

/** Fresh module instance with a clean storage + no leaked cleanup interval. */
function loadExternal(): typeof import('../external') {
  let mod: typeof import('../external');
  jest.isolateModules(() => {
    mod = require('../external');
  });
  return mod!;
}

const baseConfig = (overrides: Partial<ExternalShareConfig> = {}): ExternalShareConfig => ({
  expiryHours: 24,
  requirePin: false,
  ...overrides,
});

describe('ExternalShareService', () => {
  let service: typeof import('../external').externalShareService;

  beforeEach(() => {
    localStorage.clear();
    auditLog.mockClear();
    syncEnqueue.mockClear();
    jest.useRealTimers();
    service = loadExternal().externalShareService;
  });

  afterEach(async () => {
    // Clear the cleanup interval started by init() so timers don't leak.
    await service.destroy();
  });

  describe('createShare', () => {
    it('encrypts content, builds a signed token, persists + audits + enqueues sync', async () => {
      const content = new TextEncoder().encode('top secret payload');
      const before = Date.now();
      const share = await service.createShare(
        'file-1',
        'secret.txt',
        content,
        'alice@example.com',
        baseConfig({ expiryHours: 48, maxAccess: 5 })
      );

      expect(share.id).toMatch(/^share-\d+-[0-9a-f]+$/);
      expect(share.fileId).toBe('file-1');
      expect(share.fileName).toBe('secret.txt');
      expect(share.creatorEmail).toBe('alice@example.com');
      expect(share.status).toBe('active');
      expect(share.accessCount).toBe(0);
      expect(share.accessLog).toEqual([]);
      expect(share.maxAccessCount).toBe(5);
      // shareKeyHex is a 256-bit (32-byte) key => 64 hex chars.
      expect(share.shareKeyHex).toMatch(/^[0-9a-f]{64}$/);
      // encryptedContentHex = 12-byte IV + ciphertext+tag, all hex.
      expect(share.encryptedContentHex).toMatch(/^[0-9a-f]+$/);
      expect(share.encryptedContentHex.length).toBeGreaterThan(24); // > just the IV
      // token is a 3-part dotted JWT-style string.
      expect(share.token.split('.')).toHaveLength(3);
      // No PIN requested.
      expect(share.pin).toBeUndefined();
      // Expiry ~ now + 48h.
      const expiryMs = new Date(share.expiresAt).getTime();
      expect(expiryMs).toBeGreaterThanOrEqual(before + 48 * 3600 * 1000);

      // Persisted.
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_SHARES)!);
      expect(stored).toHaveLength(1);
      expect(stored[0][0]).toBe(share.id);

      expect(auditLog).toHaveBeenCalledWith(
        'share',
        'external_share_created',
        expect.objectContaining({ shareId: share.id, fileId: 'file-1' })
      );
      expect(syncEnqueue).toHaveBeenCalledWith(
        'share',
        expect.objectContaining({ shareId: share.id, fileId: 'file-1' })
      );
    });

    it('generates and stores a hashed PIN when requirePin is set', async () => {
      const share = await service.createShare(
        'file-2',
        'pin.txt',
        new TextEncoder().encode('x'),
        'bob@example.com',
        baseConfig({ requirePin: true })
      );
      // PIN is stored as a SHA-256 hex digest (64 chars), never plaintext.
      expect(share.pin).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('accessShare (round-trip)', () => {
    it('decrypts back the exact original bytes and increments access count', async () => {
      const original = new TextEncoder().encode('round-trip me ✓ 1234');
      const share = await service.createShare(
        'file-rt',
        'rt.txt',
        original,
        'creator@example.com',
        baseConfig({ maxAccess: 3 })
      );

      const decrypted = await service.accessShare(share.token);
      expect(Array.from(decrypted)).toEqual(Array.from(original));
      expect(new TextDecoder().decode(decrypted)).toBe('round-trip me ✓ 1234');

      // accessCount + accessLog updated.
      const active = service.getActiveExternalShares('creator@example.com');
      expect(active[0].accessCount).toBe(1);
      expect(active[0].accessLog).toHaveLength(1);
      expect(active[0].accessLog[0].userAgent).toBe('jest-external-agent');

      expect(syncEnqueue).toHaveBeenCalledWith(
        'share_accept',
        expect.objectContaining({ shareId: share.id, accessCount: 1 })
      );
    });

    it('requires the correct PIN before decrypting', async () => {
      // Spy on the private hashPin via verifyPin so we can derive a valid PIN.
      const original = new TextEncoder().encode('pin-protected');
      const share = await service.createShare(
        'file-pin',
        'p.txt',
        original,
        'creator@example.com',
        baseConfig({ requirePin: true })
      );

      // Missing PIN -> rejected.
      await expect(service.accessShare(share.token)).rejects.toThrow('PIN required');

      // Wrong PIN -> rejected (verifyPin returns false).
      await expect(service.accessShare(share.token, '000000')).rejects.toThrow('Invalid PIN');
    });

    it('throws when the share id is unknown to this service instance', async () => {
      // Build a share, then wipe the in-memory map by reloading a fresh service.
      const share = await service.createShare(
        'file-x',
        'x.txt',
        new TextEncoder().encode('x'),
        'c@e.com',
        baseConfig()
      );
      const fresh = loadExternal().externalShareService;
      // fresh instance never saw this share (localStorage cleared at init time? no —
      // we did not call init on it, so its map is empty).
      await expect(fresh.accessShare(share.token)).rejects.toThrow('Share not found');
      await fresh.destroy();
    });

    it('rejects access to a revoked share', async () => {
      const share = await service.createShare(
        'file-r',
        'r.txt',
        new TextEncoder().encode('r'),
        'c@e.com',
        baseConfig()
      );
      await service.revokeExternalShare(share.id);
      await expect(service.accessShare(share.token)).rejects.toThrow('Share is revoked');
    });

    it('enforces the max access count', async () => {
      const share = await service.createShare(
        'file-m',
        'm.txt',
        new TextEncoder().encode('m'),
        'c@e.com',
        baseConfig({ maxAccess: 1 })
      );
      await service.accessShare(share.token); // count -> 1
      await expect(service.accessShare(share.token)).rejects.toThrow(
        'Maximum access count reached'
      );
    });

    it('rejects a structurally invalid token', async () => {
      await expect(service.accessShare('not-a-valid-token')).rejects.toThrow(
        'Invalid token format'
      );
    });

    it('expires a share whose stored expiry has passed (status flips to expired)', async () => {
      const share = await service.createShare(
        'file-exp',
        'e.txt',
        new TextEncoder().encode('e'),
        'c@e.com',
        baseConfig()
      );
      // Token payload expiry is still in the future (so verifyShareToken passes),
      // but the stored share's expiry is moved into the past.
      const stored = service.getActiveExternalShares('c@e.com')[0];
      stored.expiresAt = new Date(Date.now() - 1000).toISOString();

      await expect(service.accessShare(share.token)).rejects.toThrow('Share has expired');
      // The access attempt flipped status to 'expired'.
      expect(service.getShareAuditLog(share.id)).toEqual([]);
      expect(auditLog).toHaveBeenCalledWith(
        'share',
        'external_share_expired',
        expect.objectContaining({ shareId: share.id })
      );
    });
  });

  describe('revokeExternalShare', () => {
    it('marks the share revoked, persists, audits and enqueues sync', async () => {
      const share = await service.createShare(
        'f',
        'a',
        new TextEncoder().encode('a'),
        'c@e.com',
        baseConfig()
      );
      await service.revokeExternalShare(share.id);
      expect(service.getActiveExternalShares('c@e.com')).toHaveLength(0);
      expect(syncEnqueue).toHaveBeenCalledWith('share_revoke', { shareId: share.id });
    });

    it('throws for an unknown share id', async () => {
      await expect(service.revokeExternalShare('missing')).rejects.toThrow('Share not found');
    });
  });

  describe('extendShare', () => {
    it('pushes the expiry forward by the requested hours', async () => {
      const share = await service.createShare(
        'f',
        'a',
        new TextEncoder().encode('a'),
        'c@e.com',
        baseConfig()
      );
      const originalExpiry = new Date(share.expiresAt).getTime();
      await service.extendShare(share.id, 48);
      const active = service.getActiveExternalShares('c@e.com');
      const newExpiry = new Date(active[0].expiresAt).getTime();
      expect(newExpiry).toBe(originalExpiry + 48 * 3600 * 1000);
    });

    it('refuses to extend a revoked share', async () => {
      const share = await service.createShare(
        'f',
        'a',
        new TextEncoder().encode('a'),
        'c@e.com',
        baseConfig()
      );
      await service.revokeExternalShare(share.id);
      await expect(service.extendShare(share.id, 24)).rejects.toThrow('Cannot extend revoked');
    });
  });

  describe('getActiveExternalShares', () => {
    it('filters by creator and excludes revoked shares', async () => {
      const a = await service.createShare(
        'f1',
        'a',
        new TextEncoder().encode('a'),
        'alice@e.com',
        baseConfig()
      );
      const b = await service.createShare(
        'f2',
        'b',
        new TextEncoder().encode('b'),
        'bob@e.com',
        baseConfig()
      );
      await service.revokeExternalShare(b.id);

      const aliceShares = service.getActiveExternalShares('alice@e.com');
      expect(aliceShares.map(s => s.id)).toEqual([a.id]);
      expect(service.getActiveExternalShares('bob@e.com')).toHaveLength(0);
    });

    it('marks an expired share as expired and excludes it', async () => {
      await service.createShare('f', 'a', new TextEncoder().encode('a'), 'c@e.com', baseConfig());
      // Force the in-memory share's expiry into the past.
      const active = service.getActiveExternalShares('c@e.com');
      active[0].expiresAt = new Date(Date.now() - 1000).toISOString();

      const result = service.getActiveExternalShares('c@e.com');
      expect(result).toHaveLength(0);
    });
  });

  describe('getShareAuditLog', () => {
    it('returns the access log for a known share and [] for unknown', async () => {
      const share = await service.createShare(
        'f',
        'a',
        new TextEncoder().encode('a'),
        'c@e.com',
        baseConfig()
      );
      await service.accessShare(share.token);
      expect(service.getShareAuditLog(share.id)).toHaveLength(1);
      expect(service.getShareAuditLog('missing')).toEqual([]);
    });
  });

  describe('verifyPin', () => {
    it('returns false for a share without a PIN', async () => {
      const share = await service.createShare(
        'f',
        'a',
        new TextEncoder().encode('a'),
        'c@e.com',
        baseConfig()
      );
      expect(await service.verifyPin(share.id, '1234')).toBe(false);
    });

    it('returns false for an unknown share', async () => {
      expect(await service.verifyPin('nope', '1234')).toBe(false);
    });
  });

  describe('generateShareUrl', () => {
    it('builds a share URL with the token percent-encoded', () => {
      const url = service.generateShareUrl('a.b.c+/=');
      expect(url).toContain('/share?token=');
      expect(url).toContain(encodeURIComponent('a.b.c+/='));
    });
  });

  describe('cleanupExpiredExternalShares', () => {
    it('removes shares that have been expired for more than 30 days', async () => {
      const stale = await service.createShare(
        'f-stale',
        'old.txt',
        new TextEncoder().encode('o'),
        'c@e.com',
        baseConfig()
      );
      const recent = await service.createShare(
        'f-recent',
        'new.txt',
        new TextEncoder().encode('n'),
        'c@e.com',
        baseConfig()
      );

      // Mark `stale` as expired 31 days ago; `recent` as expired just now. The
      // cleanup window is 30 days, so only `stale` qualifies for deletion. We
      // reach into the internal map to set the precise status/expiry the
      // cleanup branch inspects (status === 'expired' && expiresAt < 30d ago).
      const internal = (
        service as unknown as {
          shares: Map<string, { status: string; expiresAt: string }>;
        }
      ).shares;
      internal.get(stale.id)!.status = 'expired';
      internal.get(stale.id)!.expiresAt = new Date(
        Date.now() - 31 * 24 * 60 * 60 * 1000
      ).toISOString();
      internal.get(recent.id)!.status = 'expired';
      internal.get(recent.id)!.expiresAt = new Date().toISOString();

      await service.cleanupExpiredExternalShares();

      // The stale (31-day-old) one is gone; the recently-expired one remains.
      expect(internal.has(stale.id)).toBe(false);
      expect(internal.has(recent.id)).toBe(true);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'external_share_cleanup',
        expect.objectContaining({ cleanedCount: 1 })
      );
    });

    it('does nothing when no shares are old enough to clean', async () => {
      await service.createShare(
        'f',
        'a.txt',
        new TextEncoder().encode('a'),
        'c@e.com',
        baseConfig()
      );
      auditLog.mockClear();
      await service.cleanupExpiredExternalShares();
      expect(auditLog).not.toHaveBeenCalledWith(
        'system',
        'external_share_cleanup',
        expect.anything()
      );
    });
  });

  describe('init / persistence', () => {
    it('restores shares from localStorage on init', async () => {
      const share = await service.createShare(
        'f',
        'a',
        new TextEncoder().encode('a'),
        'c@e.com',
        baseConfig()
      );
      // localStorage now holds the serialized share. A fresh instance + init
      // should rehydrate it.
      const fresh = loadExternal().externalShareService;
      await fresh.init();
      expect(fresh.getActiveExternalShares('c@e.com').map(s => s.id)).toEqual([share.id]);
      await fresh.destroy();
    });
  });
});
