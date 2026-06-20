/**
 * Settings Service Tests
 *
 * Tests load, save, update, default values, get/set, reset, and localStorage integration.
 */

// Mock localStorage
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

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { settingsService } from '../settingsService';
import type { UserSettings as _UserSettings } from '../settingsService';

const SETTINGS_KEY = 'usbvault:settings';

describe('settingsService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    // Reset the internal cache by calling reset
    settingsService.reset();
  });

  describe('load()', () => {
    it('should return default settings when localStorage is empty', () => {
      const settings = settingsService.load();

      expect(settings.biometricLockEnabled).toBe(true);
      expect(settings.twoFactorEnabled).toBe(false);
      expect(settings.autoLockTimeoutMin).toBe(15);
      expect(settings.ghostModeEnabled).toBe(false);
      expect(settings.selfDestructEnabled).toBe(false);
      expect(settings.selfDestructAttempts).toBe(10);
      expect(settings.keyProvider).toBe('software');
      expect(settings.pqcEnabled).toBe(true);
      expect(settings.autoBackupEnabled).toBe(false);
      expect(settings.backupFrequency).toBe('weekly');
      expect(settings.lastBackupAt).toBeNull();
      expect(settings.notificationsEnabled).toBe(true);
    });

    it('should load settings from localStorage when present', () => {
      const stored = { biometricLockEnabled: false, autoLockTimeoutMin: 30 };
      localStorageMock.setItem(SETTINGS_KEY, JSON.stringify(stored));

      const settings = settingsService.load();
      expect(settings.biometricLockEnabled).toBe(false);
      expect(settings.autoLockTimeoutMin).toBe(30);
      // Other fields should have defaults
      expect(settings.twoFactorEnabled).toBe(false);
      expect(settings.keyProvider).toBe('software');
    });

    it('should merge stored partial settings with defaults', () => {
      const stored = { ghostModeEnabled: true };
      localStorageMock.setItem(SETTINGS_KEY, JSON.stringify(stored));

      const settings = settingsService.load();
      expect(settings.ghostModeEnabled).toBe(true);
      expect(settings.biometricLockEnabled).toBe(true); // default
    });

    it('should return defaults when localStorage contains invalid JSON', () => {
      localStorageMock.setItem(SETTINGS_KEY, 'not-json!!!');

      const settings = settingsService.load();
      expect(settings.biometricLockEnabled).toBe(true);
      expect(settings.autoLockTimeoutMin).toBe(15);
    });

    it('should return a copy (not the same reference) each time', () => {
      const a = settingsService.load();
      const b = settingsService.load();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('should use cache on subsequent calls', () => {
      settingsService.load();
      settingsService.load();
      // First call reads localStorage, second uses cache
      // getItem called once (plus any from reset)
      expect(localStorageMock.getItem).toHaveBeenCalledWith(SETTINGS_KEY);
    });
  });

  describe('save()', () => {
    it('should save partial updates and return the full merged settings', () => {
      const result = settingsService.save({ twoFactorEnabled: true });

      expect(result.twoFactorEnabled).toBe(true);
      expect(result.biometricLockEnabled).toBe(true); // default preserved
      expect(localStorageMock.setItem).toHaveBeenCalledWith(SETTINGS_KEY, expect.any(String));
    });

    it('should persist settings to localStorage as JSON', () => {
      settingsService.save({ autoLockTimeoutMin: 60 });

      const stored = JSON.parse(localStorageMock._getStore()[SETTINGS_KEY]);
      expect(stored.autoLockTimeoutMin).toBe(60);
    });

    it('should handle multiple sequential saves correctly', () => {
      settingsService.save({ ghostModeEnabled: true });
      settingsService.save({ selfDestructEnabled: true });

      const settings = settingsService.load();
      expect(settings.ghostModeEnabled).toBe(true);
      expect(settings.selfDestructEnabled).toBe(true);
    });

    it('should return a copy of the updated settings', () => {
      const result = settingsService.save({ pqcEnabled: false });
      result.pqcEnabled = true; // mutate the copy
      const loaded = settingsService.load();
      expect(loaded.pqcEnabled).toBe(false); // original unchanged
    });
  });

  describe('get()', () => {
    it('should return a specific setting value by key', () => {
      expect(settingsService.get('autoLockTimeoutMin')).toBe(15);
    });

    it('should reflect previously saved values', () => {
      settingsService.save({ keyProvider: 'hardware' });
      expect(settingsService.get('keyProvider')).toBe('hardware');
    });

    it('should return null for lastBackupAt by default', () => {
      expect(settingsService.get('lastBackupAt')).toBeNull();
    });
  });

  describe('set()', () => {
    it('should update a single setting by key', () => {
      settingsService.set('backupFrequency', 'daily');
      expect(settingsService.get('backupFrequency')).toBe('daily');
    });

    it('should persist the change to localStorage', () => {
      settingsService.set('notificationsEnabled', false);
      const stored = JSON.parse(localStorageMock._getStore()[SETTINGS_KEY]);
      expect(stored.notificationsEnabled).toBe(false);
    });
  });

  describe('reset()', () => {
    it('should remove settings from localStorage', () => {
      settingsService.save({ twoFactorEnabled: true });
      settingsService.reset();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(SETTINGS_KEY);
    });

    it('should return defaults after reset', () => {
      settingsService.save({ autoLockTimeoutMin: 120 });
      settingsService.reset();

      const settings = settingsService.load();
      expect(settings.autoLockTimeoutMin).toBe(15);
    });
  });
});
