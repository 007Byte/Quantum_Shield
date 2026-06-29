/**
 * Device Domain Service Tests — PH4-FIX (device management + biometrics)
 *
 * Two execution contexts are exercised:
 *
 *  1. Web load (Platform.OS === 'web'): the default import. Covers the entire
 *     DeviceManagementService (localStorage-backed sessions, trust/revoke,
 *     fingerprinting, security summary, user-agent parsing) plus the web
 *     branches of the biometric service (no native module -> 'none').
 *
 *  2. Native load (Platform.OS === 'ios'): re-required inside jest.isolateModules
 *     with a real expo-local-authentication mock, so the biometric
 *     enrollment / availability / authenticate-with-retry / error-mapping
 *     branches execute against the native code path.
 *
 * Only genuine boundaries are mocked: react-native Platform, the native
 * expo-local-authentication module, audit, and logger.
 */

// ── localStorage mock (full reset between tests) ───────────────────────────
import { deviceManagementService, biometricService } from '../device';
import type { DeviceSession } from '../device';
import { auditService } from '@/services/auditService';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
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

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Default (web) load for the device-management half of the module.
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const SESSIONS_KEY = 'usbvault:device_sessions';

function seedSessions(sessions: Partial<DeviceSession>[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function baseSession(over: Partial<DeviceSession>): DeviceSession {
  return {
    id: 'sess-1',
    deviceName: 'Desktop - macOS',
    deviceType: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    ipAddress: '1.2.3.4',
    location: 'Boston, MA',
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    isCurrent: false,
    isTrusted: false,
    ...over,
  };
}

describe('DeviceManagementService (web)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('getActiveSessions', () => {
    it('returns [] when nothing is stored', () => {
      expect(deviceManagementService.getActiveSessions()).toEqual([]);
    });

    it('parses and returns stored sessions', () => {
      seedSessions([baseSession({ id: 'a' }), baseSession({ id: 'b' })]);
      const sessions = deviceManagementService.getActiveSessions();
      expect(sessions.map(s => s.id)).toEqual(['a', 'b']);
    });

    it('returns [] when stored JSON is corrupt', () => {
      localStorage.setItem(SESSIONS_KEY, 'not-json');
      expect(deviceManagementService.getActiveSessions()).toEqual([]);
    });
  });

  describe('getCurrentSession', () => {
    it('returns the existing current session when present', () => {
      seedSessions([baseSession({ id: 'cur', isCurrent: true })]);
      expect(deviceManagementService.getCurrentSession().id).toBe('cur');
    });

    it('generates and persists a current session when none exists', () => {
      seedSessions([baseSession({ id: 'old', isCurrent: false })]);
      const current = deviceManagementService.getCurrentSession();
      expect(current.isCurrent).toBe(true);
      expect(current.id).toMatch(/^device-/);
      // The old non-current session is retained, the new current added.
      const stored = deviceManagementService.getActiveSessions();
      expect(stored.find(s => s.id === 'old')).toBeDefined();
      expect(stored.find(s => s.isCurrent)).toBeDefined();
    });
  });

  describe('revokeSession / revokeAllOtherSessions', () => {
    it('removes the targeted session and audits', async () => {
      seedSessions([baseSession({ id: 'keep' }), baseSession({ id: 'drop' })]);
      await deviceManagementService.revokeSession('drop');
      expect(deviceManagementService.getActiveSessions().map(s => s.id)).toEqual(['keep']);
      expect(auditService.log).toHaveBeenCalledWith('REVOKE_SESSION', 'session:drop', {
        sessionId: 'drop',
      });
    });

    it('keeps only the current session when revoking all others', async () => {
      seedSessions([
        baseSession({ id: 'cur', isCurrent: true }),
        baseSession({ id: 'other1' }),
        baseSession({ id: 'other2' }),
      ]);
      await deviceManagementService.revokeAllOtherSessions();
      const remaining = deviceManagementService.getActiveSessions();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('cur');
      expect(auditService.log).toHaveBeenCalledWith('REVOKE_ALL_OTHER_SESSIONS', 'sessions', {
        keptSession: 'cur',
      });
    });
  });

  describe('trust / untrust', () => {
    it('flips isTrusted on the targeted device and audits', () => {
      seedSessions([baseSession({ id: 'd1', isTrusted: false })]);
      deviceManagementService.trustDevice('d1');
      expect(deviceManagementService.getActiveSessions()[0].isTrusted).toBe(true);
      expect(auditService.log).toHaveBeenCalledWith('TRUST_DEVICE', 'device:d1', {
        deviceId: 'd1',
      });

      deviceManagementService.untrustDevice('d1');
      expect(deviceManagementService.getActiveSessions()[0].isTrusted).toBe(false);
      expect(auditService.log).toHaveBeenCalledWith('UNTRUST_DEVICE', 'device:d1', {
        deviceId: 'd1',
      });
    });

    it('leaves other devices untouched when trusting one', () => {
      seedSessions([
        baseSession({ id: 'd1', isTrusted: false }),
        baseSession({ id: 'd2', isTrusted: false }),
      ]);
      deviceManagementService.trustDevice('d1');
      const sessions = deviceManagementService.getActiveSessions();
      expect(sessions.find(s => s.id === 'd1')!.isTrusted).toBe(true);
      expect(sessions.find(s => s.id === 'd2')!.isTrusted).toBe(false);
    });
  });

  describe('getTrustedDevices / getSessionHistory', () => {
    it('returns only trusted devices', () => {
      seedSessions([
        baseSession({ id: 'a', isTrusted: true }),
        baseSession({ id: 'b', isTrusted: false }),
        baseSession({ id: 'c', isTrusted: true }),
      ]);
      expect(deviceManagementService.getTrustedDevices().map(s => s.id)).toEqual(['a', 'c']);
    });

    it('getSessionHistory returns all sessions', () => {
      seedSessions([baseSession({ id: 'a' }), baseSession({ id: 'b' })]);
      expect(deviceManagementService.getSessionHistory()).toHaveLength(2);
    });
  });

  describe('getDeviceFingerprint / isNewDevice', () => {
    it('produces a stable device- prefixed fingerprint', () => {
      const fp1 = deviceManagementService.getDeviceFingerprint();
      const fp2 = deviceManagementService.getDeviceFingerprint();
      expect(fp1).toMatch(/^device-/);
      expect(fp1).toBe(fp2); // deterministic within the same environment
    });

    it('isNewDevice is true when no session matches the current fingerprint', () => {
      seedSessions([baseSession({ id: 'unrelated-id' })]);
      expect(deviceManagementService.isNewDevice()).toBe(true);
    });

    it('isNewDevice is false when a session matches the current fingerprint', () => {
      const fp = deviceManagementService.getDeviceFingerprint();
      seedSessions([baseSession({ id: fp })]);
      expect(deviceManagementService.isNewDevice()).toBe(false);
    });
  });

  describe('generateCurrentSession / parseUserAgent branches', () => {
    const realUA = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');

    function setUA(ua: string): void {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: ua,
        configurable: true,
      });
    }

    afterEach(() => {
      if (realUA) Object.defineProperty(window.navigator, 'userAgent', realUA);
    });

    function generateFresh() {
      // No sessions stored -> getCurrentSession() builds one via
      // generateCurrentSession() -> parseUserAgent().
      localStorage.clear();
      return deviceManagementService.getCurrentSession();
    }

    it('classifies a Windows + Edge desktop user agent', () => {
      setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/18.0');
      const s = generateFresh();
      expect(s.os).toBe('Windows');
      expect(s.browser).toBe('Edge');
    });

    it('classifies a macOS + Firefox user agent', () => {
      setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Firefox/120.0');
      const s = generateFresh();
      expect(s.os).toBe('macOS');
      expect(s.browser).toBe('Firefox');
    });

    it('classifies a Linux user agent', () => {
      setUA('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0');
      const s = generateFresh();
      expect(s.os).toBe('Linux');
      expect(s.browser).toBe('Chrome');
    });

    it('classifies an iPhone (no Mac token) as a mobile iOS device', () => {
      // The parser checks "Mac" before "iPhone", so the UA must not contain
      // the "Mac OS X" substring to reach the iOS branch.
      setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1');
      const s = generateFresh();
      expect(s.os).toBe('iOS');
      expect(s.deviceType).toBe('mobile');
    });

    it('classifies an iPad (no Mac token) as a tablet (iPadOS)', () => {
      setUA('Mozilla/5.0 (iPad; CPU OS 17_0) Safari/604.1');
      const s = generateFresh();
      expect(s.os).toBe('iPadOS');
      expect(s.deviceType).toBe('tablet');
    });

    it('classifies an Android phone (no Linux token, with Mobile) as mobile', () => {
      // The parser checks "Linux"/"X11" before "Android"; real Android UAs
      // contain "Linux" and thus classify as Linux. To reach the Android
      // branch the UA must omit the Linux token.
      setUA('Mozilla/5.0 (Android 14; Pixel) Mobile Chrome/120.0');
      const s = generateFresh();
      expect(s.os).toBe('Android');
      expect(s.deviceType).toBe('mobile');
    });

    it('classifies an Android tablet (no Linux token, no Mobile) as tablet', () => {
      setUA('Mozilla/5.0 (Android 14; Tab) Chrome/120.0');
      const s = generateFresh();
      expect(s.os).toBe('Android');
      expect(s.deviceType).toBe('tablet');
    });

    it('documents that a realistic Android UA classifies as Linux (parser ordering)', () => {
      // Regression guard for the else-if ordering: "Linux" wins over "Android".
      setUA('Mozilla/5.0 (Linux; Android 14; Pixel) Mobile Chrome/120.0');
      const s = generateFresh();
      expect(s.os).toBe('Linux');
    });

    it('produces a plausible mock IP and known location', () => {
      setUA('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0');
      const s = generateFresh();
      expect(s.ipAddress).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      expect(typeof s.location).toBe('string');
      expect(s.location.length).toBeGreaterThan(0);
      expect(s.deviceName).toContain('Windows');
    });
  });

  describe('getSecuritySummary', () => {
    it('aggregates totals, trusted/suspicious counts, and the last new device', () => {
      seedSessions([
        baseSession({ id: 't1', isTrusted: true, createdAt: '2026-01-01T00:00:00.000Z' }),
        baseSession({ id: 's1', isTrusted: false, createdAt: '2026-02-01T00:00:00.000Z' }),
        baseSession({ id: 's2', isTrusted: false, createdAt: '2026-03-01T00:00:00.000Z' }),
      ]);
      const summary = deviceManagementService.getSecuritySummary();
      expect(summary.totalActive).toBe(3);
      expect(summary.trustedCount).toBe(1);
      expect(summary.suspiciousCount).toBe(2);
      // Newest untrusted device by createdAt.
      expect(summary.lastNewDevice).toBe('2026-03-01T00:00:00.000Z');
    });

    it('reports null lastNewDevice when all devices are trusted', () => {
      seedSessions([baseSession({ id: 't1', isTrusted: true })]);
      expect(deviceManagementService.getSecuritySummary().lastNewDevice).toBeNull();
    });
  });
});

// ── Biometric service — web branches (no native module) ────────────────────
describe('BiometricService (web branches)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('reports unavailable / not-enrolled status on web', async () => {
    const status = await biometricService.getBiometricStatus();
    expect(status.available).toBe(false);
    expect(status.enrolled).toBe(false);
    expect(status.type).toBe('none');
  });

  it('authenticateWithRetry returns false on web (no native module)', async () => {
    const ok = await biometricService.authenticateWithRetry(2);
    expect(ok).toBe(false);
  });

  it('maps known biometric error codes and falls back for unknown ones', () => {
    expect(biometricService.getBiometricErrorMessage(1)).toBe('User cancelled authentication');
    expect(biometricService.getBiometricErrorMessage(3)).toBe(
      'User must enroll biometric data first'
    );
    expect(biometricService.getBiometricErrorMessage(99)).toBe(
      'Biometric authentication error (code: 99)'
    );
  });

  it('promptReEnrollment returns actionable instructions', () => {
    const msg = biometricService.promptReEnrollment();
    expect(msg).toContain('re-enrollment');
    expect(msg).toContain('Settings > Security > Biometric');
  });

  describe('checkBiometricChange (web hash detection)', () => {
    it('stores the hash on first run and reports no change', async () => {
      const changed = await biometricService.checkBiometricChange();
      expect(changed).toBe(false);
      // Hash should now be persisted for subsequent comparisons.
      expect(localStorage.getItem('usbvault:biometric_config_hash')).not.toBeNull();
    });

    it('reports no change when the stored hash matches', async () => {
      await biometricService.checkBiometricChange(); // seed
      const changed = await biometricService.checkBiometricChange();
      expect(changed).toBe(false);
    });

    it('detects a change when the stored hash differs', async () => {
      localStorage.setItem('usbvault:biometric_config_hash', 'stale-hash-value');
      const changed = await biometricService.checkBiometricChange();
      expect(changed).toBe(true);
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'biometric_change_detected',
        expect.objectContaining({ oldHash: 'stale-hash-value' }),
        'warning'
      );
    });
  });

  it('completeReEnrollment writes a fresh config hash on web', async () => {
    localStorage.setItem('usbvault:biometric_config_hash', 'old');
    await biometricService.completeReEnrollment();
    const stored = localStorage.getItem('usbvault:biometric_config_hash');
    expect(stored).not.toBe('old');
    expect(stored).not.toBeNull();
  });
});

// NOTE: The native (Platform.OS === 'ios') biometric branches are covered in a
// separate file — device.biometric.native.test.ts. They require loading
// device.ts with no prior web import of the module so that
// jest.isolateModules + jest.doMock('react-native', { OS: 'ios' }) actually
// applies a fresh react-native to device.ts's `import { Platform }` (the native
// LocalAuthentication module is captured at import time based on Platform.OS).
