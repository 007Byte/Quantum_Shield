/**
 * External Portal Service Tests
 *
 * Real-behavior coverage for `src/services/sharing/portal.ts`:
 *  - createPortalShare: id/shape, defaulting, custom options, persistence, audit
 *  - validateAccess: not-found / revoked / expired (with side-effect) / max-downloads /
 *    PIN gating, and the happy path that appends an audit entry
 *  - recordDownload / revokePortalShare / extendPortalExpiry (incl. max-expiry clamp)
 *  - getActivePortalShares / getShareAnalytics aggregation math
 *  - config get/update merge semantics + cleanupExpiredPortalShares
 *  - generateAccessUrl / generateEmbedCode return shapes
 *
 * Only genuine boundaries are mocked: react-native Platform (forced to 'web' so
 * the localStorage-backed paths execute), the auditService (touches storage),
 * and a real in-memory localStorage. The portal service's own logic runs for
 * real against that storage — nothing under test is stubbed.
 */

// Force the web code paths (localStorage-backed persistence + analytics).
import type { PortalShare } from '../types';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const auditLog = jest.fn();
jest.mock('@/services/auditService', () => ({
  auditService: { log: auditLog },
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

// navigator.userAgent is read on the web path; give it a deterministic value.
Object.defineProperty(window.navigator, 'userAgent', {
  value: 'jest-portal-agent',
  configurable: true,
});

const CONFIG_KEY = 'usbvault:portal_config';
const SHARES_KEY = 'usbvault:portal_shares';

/**
 * Load a fresh module instance so the constructor's initializeConfig() runs
 * against a clean localStorage for each test.
 */
function loadPortal(): typeof import('../portal') {
  let mod: typeof import('../portal');
  jest.isolateModules(() => {
    mod = require('../portal');
  });
  return mod!;
}

describe('ExternalPortalService', () => {
  beforeEach(() => {
    localStorage.clear();
    auditLog.mockClear();
  });

  describe('constructor / config initialization', () => {
    it('seeds the default config into localStorage on first construction', () => {
      expect(localStorage.getItem(CONFIG_KEY)).toBeNull();
      const { externalPortalService } = loadPortal();
      const stored = localStorage.getItem(CONFIG_KEY);
      expect(stored).not.toBeNull();
      const config = JSON.parse(stored!);
      expect(config.defaultExpiry).toBe(24);
      expect(config.maxDownloads).toBe(10);
      expect(config.customBranding.companyName).toBe('USBVault');
      // The live getter reflects the seeded values.
      expect(externalPortalService.getPortalConfig().maxExpiry).toBe(720);
    });

    it('does not overwrite an existing stored config', () => {
      const custom = {
        defaultExpiry: 1,
        maxExpiry: 2,
        requirePin: true,
        maxDownloads: 3,
        allowAnonymous: false,
        customBranding: { companyName: 'Acme' },
      };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(custom));
      const { externalPortalService } = loadPortal();
      expect(externalPortalService.getPortalConfig()).toEqual(custom);
    });
  });

  describe('createPortalShare', () => {
    it('creates a share with defaults, a generated key, and persists + audits it', async () => {
      const { externalPortalService } = loadPortal();
      const before = Date.now();
      const share = await externalPortalService.createPortalShare(
        'file-1',
        'report.pdf',
        2048,
        'application/pdf',
        'ZW5jcnlwdGVkLWJsb2I='
      );

      expect(share.id).toMatch(/^share_\d+_[a-z0-9]+$/);
      expect(share.fileId).toBe('file-1');
      expect(share.fileName).toBe('report.pdf');
      expect(share.fileSize).toBe(2048);
      expect(share.fileType).toBe('application/pdf');
      expect(share.encryptedData).toBe('ZW5jcnlwdGVkLWJsb2I=');
      expect(share.downloadCount).toBe(0);
      expect(share.isActive).toBe(true);
      expect(share.maxDownloads).toBe(10); // from default config
      expect(share.encryptionKey).toHaveLength(32);
      // expiry ~= now + 24h (defaultExpiry)
      expect(share.expiresAt).toBeGreaterThanOrEqual(before + 24 * 3600 * 1000);
      expect(share.auditTrail).toHaveLength(1);
      expect(share.auditTrail[0].action).toBe('created');
      expect(share.auditTrail[0].userAgent).toBe('jest-portal-agent');

      // Persisted to localStorage.
      const stored = JSON.parse(localStorage.getItem(SHARES_KEY)!) as PortalShare[];
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(share.id);

      expect(auditLog).toHaveBeenCalledWith(
        'PORTAL_SHARE_CREATED',
        'file-1',
        expect.objectContaining({ shareId: share.id, fileName: 'report.pdf', fileSize: 2048 })
      );
    });

    it('honors caller-supplied options (expiry, key, pin, maxDownloads)', async () => {
      const { externalPortalService } = loadPortal();
      const fixedExpiry = Date.now() + 5_000;
      const share = await externalPortalService.createPortalShare(
        'file-2',
        'note.txt',
        10,
        'text/plain',
        'data',
        {
          expiresAt: fixedExpiry,
          encryptionKey: 'caller-supplied-key',
          accessPin: '1234',
          maxDownloads: 3,
        }
      );
      expect(share.expiresAt).toBe(fixedExpiry);
      expect(share.encryptionKey).toBe('caller-supplied-key');
      expect(share.accessPin).toBe('1234');
      expect(share.maxDownloads).toBe(3);
    });
  });

  describe('validateAccess', () => {
    it('returns "Share not found" for an unknown id', async () => {
      const { externalPortalService } = loadPortal();
      const result = await externalPortalService.validateAccess('does-not-exist');
      expect(result).toEqual({ valid: false, error: 'Share not found' });
    });

    it('grants access and appends an "accessed" audit entry on the happy path', async () => {
      const { externalPortalService } = loadPortal();
      const share = await externalPortalService.createPortalShare(
        'f',
        'a.bin',
        1,
        'application/octet-stream',
        'd'
      );
      const result = await externalPortalService.validateAccess(share.id);
      expect(result.valid).toBe(true);
      expect(result.share?.id).toBe(share.id);
      // The accessed entry was persisted.
      const stored = JSON.parse(localStorage.getItem(SHARES_KEY)!) as PortalShare[];
      expect(stored[0].auditTrail.map(e => e.action)).toEqual(['created', 'accessed']);
      expect(auditLog).toHaveBeenCalledWith(
        'PORTAL_SHARE_ACCESSED',
        share.id,
        expect.objectContaining({ fileName: 'a.bin' })
      );
    });

    it('rejects a revoked share', async () => {
      const { externalPortalService } = loadPortal();
      const share = await externalPortalService.createPortalShare('f', 'a', 1, 't', 'd');
      externalPortalService.revokePortalShare(share.id);
      const result = await externalPortalService.validateAccess(share.id);
      expect(result).toEqual({ valid: false, error: 'Share has been revoked' });
    });

    it('rejects + deactivates an expired share (side effect persisted)', async () => {
      const { externalPortalService } = loadPortal();
      const share = await externalPortalService.createPortalShare('f', 'a', 1, 't', 'd', {
        expiresAt: Date.now() - 1000,
      });
      const result = await externalPortalService.validateAccess(share.id);
      expect(result).toEqual({ valid: false, error: 'Share has expired' });
      const stored = JSON.parse(localStorage.getItem(SHARES_KEY)!) as PortalShare[];
      expect(stored[0].isActive).toBe(false);
    });

    it('rejects once max downloads is reached', async () => {
      const { externalPortalService } = loadPortal();
      const share = await externalPortalService.createPortalShare('f', 'a', 1, 't', 'd', {
        maxDownloads: 1,
      });
      externalPortalService.recordDownload(share.id); // downloadCount -> 1 == max
      const result = await externalPortalService.validateAccess(share.id);
      expect(result).toEqual({ valid: false, error: 'Maximum downloads exceeded' });
    });

    it('enforces a PIN only when the config requires it', async () => {
      const { externalPortalService } = loadPortal();
      externalPortalService.updatePortalConfig({ requirePin: true });
      const share = await externalPortalService.createPortalShare('f', 'a', 1, 't', 'd', {
        accessPin: '4242',
      });

      const wrong = await externalPortalService.validateAccess(share.id, '0000');
      expect(wrong).toEqual({ valid: false, error: 'Invalid access PIN' });

      const right = await externalPortalService.validateAccess(share.id, '4242');
      expect(right.valid).toBe(true);
    });
  });

  describe('recordDownload', () => {
    it('increments the count and logs an audit entry', async () => {
      const { externalPortalService } = loadPortal();
      const share = await externalPortalService.createPortalShare('f', 'a', 1, 't', 'd');
      externalPortalService.recordDownload(share.id);
      externalPortalService.recordDownload(share.id);
      const stored = JSON.parse(localStorage.getItem(SHARES_KEY)!) as PortalShare[];
      expect(stored[0].downloadCount).toBe(2);
      expect(stored[0].auditTrail.filter(e => e.action === 'downloaded')).toHaveLength(2);
      expect(auditLog).toHaveBeenCalledWith(
        'PORTAL_SHARE_DOWNLOADED',
        share.id,
        expect.objectContaining({ downloadCount: 2 })
      );
    });

    it('is a no-op for an unknown share id', async () => {
      const { externalPortalService } = loadPortal();
      expect(() => externalPortalService.recordDownload('nope')).not.toThrow();
      expect(auditLog).not.toHaveBeenCalledWith(
        'PORTAL_SHARE_DOWNLOADED',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('extendPortalExpiry', () => {
    it('extends expiry when within the max-expiry window', async () => {
      const { externalPortalService } = loadPortal();
      const share = await externalPortalService.createPortalShare('f', 'a', 1, 't', 'd');
      externalPortalService.extendPortalExpiry(share.id, 48);
      const stored = JSON.parse(localStorage.getItem(SHARES_KEY)!) as PortalShare[];
      // New expiry is ~now + 48h, which is greater than the original 24h expiry.
      expect(stored[0].expiresAt).toBeGreaterThan(share.expiresAt);
      expect(auditLog).toHaveBeenCalledWith(
        'PORTAL_SHARE_EXTENDED',
        share.id,
        expect.objectContaining({ hours: 48 })
      );
    });

    it('refuses to extend beyond the configured max expiry', async () => {
      const { externalPortalService } = loadPortal();
      const share = await externalPortalService.createPortalShare('f', 'a', 1, 't', 'd');
      const original = share.expiresAt;
      // maxExpiry default is 720h; ask for far more than that.
      externalPortalService.extendPortalExpiry(share.id, 1000);
      const stored = JSON.parse(localStorage.getItem(SHARES_KEY)!) as PortalShare[];
      expect(stored[0].expiresAt).toBe(original); // unchanged
      expect(auditLog).not.toHaveBeenCalledWith(
        'PORTAL_SHARE_EXTENDED',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('getActivePortalShares / getShareAnalytics', () => {
    it('returns only active, unexpired shares', async () => {
      const { externalPortalService } = loadPortal();
      const active = await externalPortalService.createPortalShare('f1', 'a', 1, 't', 'd');
      const revoked = await externalPortalService.createPortalShare('f2', 'b', 1, 't', 'd');
      await externalPortalService.createPortalShare('f3', 'c', 1, 't', 'd', {
        expiresAt: Date.now() - 1,
      });
      externalPortalService.revokePortalShare(revoked.id);

      const list = externalPortalService.getActivePortalShares();
      expect(list.map(s => s.id)).toEqual([active.id]);
    });

    it('aggregates analytics over active shares', async () => {
      const { externalPortalService } = loadPortal();
      const s1 = await externalPortalService.createPortalShare('f1', 'a', 1, 't', 'd');
      const s2 = await externalPortalService.createPortalShare('f2', 'b', 1, 't', 'd');
      // 3 downloads on s1, 1 on s2 -> total 4, avg 2.
      externalPortalService.recordDownload(s1.id);
      externalPortalService.recordDownload(s1.id);
      externalPortalService.recordDownload(s1.id);
      externalPortalService.recordDownload(s2.id);

      const analytics = externalPortalService.getShareAnalytics();
      expect(analytics.totalShares).toBe(2);
      expect(analytics.activeShares).toBe(2);
      expect(analytics.totalDownloads).toBe(4);
      expect(analytics.avgDownloadsPerShare).toBe(2);
      expect(analytics.mostAccessedShare?.id).toBe(s1.id);
    });
  });

  describe('config get/update', () => {
    it('deep-merges customBranding on update and audits the changed keys', () => {
      const { externalPortalService } = loadPortal();
      externalPortalService.updatePortalConfig({
        maxDownloads: 99,
        customBranding: { primaryColor: '#ff0000' },
      });
      const config = externalPortalService.getPortalConfig();
      expect(config.maxDownloads).toBe(99);
      // companyName preserved from defaults, primaryColor added.
      expect(config.customBranding.companyName).toBe('USBVault');
      expect(config.customBranding.primaryColor).toBe('#ff0000');
      expect(auditLog).toHaveBeenCalledWith(
        'PORTAL_CONFIG_UPDATED',
        'config',
        expect.objectContaining({
          changes: expect.arrayContaining(['maxDownloads', 'customBranding']),
        })
      );
    });
  });

  describe('cleanupExpiredPortalShares', () => {
    it('removes expired shares and returns the count cleaned', async () => {
      const { externalPortalService } = loadPortal();
      await externalPortalService.createPortalShare('live', 'a', 1, 't', 'd');
      await externalPortalService.createPortalShare('dead1', 'b', 1, 't', 'd', {
        expiresAt: Date.now() - 1,
      });
      await externalPortalService.createPortalShare('dead2', 'c', 1, 't', 'd', {
        expiresAt: Date.now() - 2,
      });

      const cleaned = externalPortalService.cleanupExpiredPortalShares();
      expect(cleaned).toBe(2);
      const remaining = JSON.parse(localStorage.getItem(SHARES_KEY)!) as PortalShare[];
      expect(remaining).toHaveLength(1);
      expect(remaining[0].fileId).toBe('live');
    });

    it('returns 0 and skips persistence when nothing is expired', async () => {
      const { externalPortalService } = loadPortal();
      await externalPortalService.createPortalShare('live', 'a', 1, 't', 'd');
      auditLog.mockClear();
      const cleaned = externalPortalService.cleanupExpiredPortalShares();
      expect(cleaned).toBe(0);
      expect(auditLog).not.toHaveBeenCalledWith(
        'PORTAL_SHARES_CLEANUP',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('url + embed helpers', () => {
    it('generateAccessUrl embeds the share id', () => {
      const { externalPortalService } = loadPortal();
      expect(externalPortalService.generateAccessUrl('abc')).toBe(
        'https://vault.usbvault.io/portal/abc'
      );
    });

    it('generateEmbedCode wraps the access url in an iframe', () => {
      const { externalPortalService } = loadPortal();
      const embed = externalPortalService.generateEmbedCode('xyz');
      expect(embed).toContain('https://vault.usbvault.io/portal/xyz');
      expect(embed.startsWith('<iframe')).toBe(true);
      expect(embed).toContain('allow="encrypted-media"');
    });
  });
});
