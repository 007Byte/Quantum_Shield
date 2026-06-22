/**
 * Session Service Tests — SEC-07
 *
 * Tests session creation, validation, expiry, refresh, revocation,
 * device remembering, and cleanup.
 */

// Mock localStorage
import { sessionService, Session } from '../sessionService';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    _getStore: () => store,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock crypto.getRandomValues
const mockGetRandomValues = jest.fn((arr: Uint8Array) => {
  for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
});

Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: mockGetRandomValues,
    subtle: {},
  },
  writable: true,
});

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({}));

// Mock audit service
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

const SESSIONS_KEY = 'usbvault:sessions';
const DEVICES_KEY = 'usbvault:remembered_devices';

describe('sessionService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    jest.clearAllMocks();
  });

  describe('createSession()', () => {
    it('should create a session with all required fields', async () => {
      const session = await sessionService.createSession('user-1');

      expect(session.userId).toBe('user-1');
      expect(session.token).toBeTruthy();
      expect(session.deviceId).toBeTruthy();
      expect(session.isActive).toBe(true);
      expect(session.createdAt).toBeTruthy();
      expect(session.expiresAt).toBeTruthy();
    });

    it('should set an expiry time in the future', async () => {
      const session = await sessionService.createSession('user-1');
      const expiresAt = new Date(session.expiresAt);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should persist the session to localStorage', async () => {
      await sessionService.createSession('user-1');

      expect(localStorageMock.setItem).toHaveBeenCalledWith(SESSIONS_KEY, expect.any(String));

      const stored = JSON.parse(localStorageMock._getStore()[SESSIONS_KEY]);
      expect(stored.length).toBeGreaterThanOrEqual(1);
    });

    it('should generate unique tokens for different sessions', async () => {
      const s1 = await sessionService.createSession('user-1');
      const s2 = await sessionService.createSession('user-1');

      expect(s1.token).not.toBe(s2.token);
    });
  });

  describe('validateSession()', () => {
    it('should return the session for a valid token', async () => {
      const created = await sessionService.createSession('user-1');
      const validated = await sessionService.validateSession(created.token);

      expect(validated).not.toBeNull();
      expect(validated!.userId).toBe('user-1');
    });

    it('should return null for an unknown token', async () => {
      const result = await sessionService.validateSession('nonexistent-token');
      expect(result).toBeNull();
    });

    it('should return null for an expired session', async () => {
      const created = await sessionService.createSession('user-1');

      // Manually expire the session in storage
      const sessions: Session[] = JSON.parse(localStorageMock._getStore()[SESSIONS_KEY]);
      sessions[sessions.length - 1].expiresAt = new Date(Date.now() - 1000).toISOString();
      localStorageMock.setItem(SESSIONS_KEY, JSON.stringify(sessions));

      const result = await sessionService.validateSession(created.token);
      expect(result).toBeNull();
    });

    it('should return null for an inactive session', async () => {
      const created = await sessionService.createSession('user-1');
      await sessionService.revokeSession(created.token);

      const result = await sessionService.validateSession(created.token);
      expect(result).toBeNull();
    });
  });

  describe('refreshSession()', () => {
    it('should extend the expiry of a valid session', async () => {
      const created = await sessionService.createSession('user-1');
      const originalExpiry = new Date(created.expiresAt).getTime();

      // Small delay to ensure time advances
      const refreshed = await sessionService.refreshSession(created.token);

      expect(refreshed).not.toBeNull();
      expect(new Date(refreshed!.expiresAt).getTime()).toBeGreaterThanOrEqual(originalExpiry);
    });

    it('should return null for a non-existent token', async () => {
      const result = await sessionService.refreshSession('fake-token');
      expect(result).toBeNull();
    });

    it('should deactivate and return null for an expired session', async () => {
      const created = await sessionService.createSession('user-1');

      // Expire the session
      const sessions: Session[] = JSON.parse(localStorageMock._getStore()[SESSIONS_KEY]);
      sessions[sessions.length - 1].expiresAt = new Date(Date.now() - 1000).toISOString();
      localStorageMock.setItem(SESSIONS_KEY, JSON.stringify(sessions));

      const result = await sessionService.refreshSession(created.token);
      expect(result).toBeNull();
    });
  });

  describe('revokeSession()', () => {
    it('should revoke an active session', async () => {
      const created = await sessionService.createSession('user-1');
      const revoked = await sessionService.revokeSession(created.token);
      expect(revoked).toBe(true);
    });

    it('should return false for unknown token', async () => {
      const revoked = await sessionService.revokeSession('nonexistent');
      expect(revoked).toBe(false);
    });

    it('should make the session fail validation after revocation', async () => {
      const created = await sessionService.createSession('user-1');
      await sessionService.revokeSession(created.token);

      const validated = await sessionService.validateSession(created.token);
      expect(validated).toBeNull();
    });
  });

  describe('revokeAllSessions()', () => {
    it('should revoke all sessions for a user', async () => {
      await sessionService.createSession('user-1');
      await sessionService.createSession('user-1');
      await sessionService.createSession('user-2');

      const count = await sessionService.revokeAllSessions('user-1');
      expect(count).toBe(2);
    });

    it('should return 0 when user has no active sessions', async () => {
      const count = await sessionService.revokeAllSessions('unknown-user');
      expect(count).toBe(0);
    });

    it('should not revoke sessions of other users', async () => {
      const otherSession = await sessionService.createSession('user-2');
      await sessionService.createSession('user-1');
      await sessionService.revokeAllSessions('user-1');

      const validated = await sessionService.validateSession(otherSession.token);
      expect(validated).not.toBeNull();
    });
  });

  describe('setSessionDuration() / getSessionDuration()', () => {
    it('should accept valid durations', () => {
      sessionService.setSessionDuration(60);
      expect(sessionService.getSessionDuration()).toBe(60);
    });

    it('should reject invalid durations and keep the previous value', () => {
      sessionService.setSessionDuration(60);
      sessionService.setSessionDuration(999);
      expect(sessionService.getSessionDuration()).toBe(60);
    });

    it('should persist valid duration to localStorage', () => {
      sessionService.setSessionDuration(120);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'usbvault:session_duration_minutes',
        '120'
      );
    });
  });

  describe('rememberDevice() / isDeviceRemembered() / forgetDevice()', () => {
    it('should remember a device and verify it', async () => {
      const token = await sessionService.rememberDevice('device-1', 'user-1');
      expect(token).toBeTruthy();
      expect(sessionService.isDeviceRemembered('device-1')).toBe(true);
    });

    it('should return false for unknown device', () => {
      expect(sessionService.isDeviceRemembered('unknown-device')).toBe(false);
    });

    it('should forget a previously remembered device', async () => {
      await sessionService.rememberDevice('device-1', 'user-1');
      const forgotten = await sessionService.forgetDevice('device-1');
      expect(forgotten).toBe(true);
      expect(sessionService.isDeviceRemembered('device-1')).toBe(false);
    });

    it('should return false when forgetting a device that was never remembered', async () => {
      const result = await sessionService.forgetDevice('unknown-device');
      expect(result).toBe(false);
    });

    it('should clean up expired remembered devices', async () => {
      await sessionService.rememberDevice('device-1', 'user-1');

      // Expire the device token in storage
      const devices = JSON.parse(localStorageMock._getStore()[DEVICES_KEY]);
      devices[0].expiresAt = new Date(Date.now() - 1000).toISOString();
      localStorageMock.setItem(DEVICES_KEY, JSON.stringify(devices));

      expect(sessionService.isDeviceRemembered('device-1')).toBe(false);
    });
  });
});
