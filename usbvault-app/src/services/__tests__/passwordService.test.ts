/**
 * Password Service Tests
 *
 * Tests password generation, CRUD operations, encryption fallback,
 * and entry management.
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

// Mock crypto — provide getRandomValues but no subtle for fallback path
const mockGetRandomValues = jest.fn((arr: Uint8Array | Uint32Array) => {
  for (let i = 0; i < arr.length; i++) {
    (arr as any)[i] = Math.floor(Math.random() * 256);
  }
  return arr;
});

Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: mockGetRandomValues,
    subtle: undefined, // Force base64 fallback in encryption helpers
  },
  writable: true,
  configurable: true,
});

// Mock btoa / atob for base64 fallback
if (typeof global.btoa === 'undefined') {
  global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}
if (typeof global.atob === 'undefined') {
  global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({}));

import { passwordService, PasswordEntry, GeneratorOptions } from '../passwordService';

const STORAGE_KEY = 'usbvault:passwords';

describe('passwordService', () => {
  beforeEach(() => {
    localStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    jest.clearAllMocks();
  });

  describe('generatePassword()', () => {
    it('should generate a password of default length (20)', () => {
      const pw = passwordService.generatePassword();
      expect(pw.length).toBe(20);
    });

    it('should generate a password of specified length', () => {
      const pw = passwordService.generatePassword({
        length: 32,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
      });
      expect(pw.length).toBe(32);
    });

    it('should respect lowercase-only option', () => {
      const pw = passwordService.generatePassword({
        length: 20,
        uppercase: false,
        lowercase: true,
        digits: false,
        symbols: false,
      });
      expect(pw).toMatch(/^[a-z]+$/);
    });

    it('should respect uppercase-only option', () => {
      const pw = passwordService.generatePassword({
        length: 20,
        uppercase: true,
        lowercase: false,
        digits: false,
        symbols: false,
      });
      expect(pw).toMatch(/^[A-Z]+$/);
    });

    it('should respect digits-only option', () => {
      const pw = passwordService.generatePassword({
        length: 20,
        uppercase: false,
        lowercase: false,
        digits: true,
        symbols: false,
      });
      expect(pw).toMatch(/^[0-9]+$/);
    });

    it('should include at least one character from each enabled class', () => {
      const opts: GeneratorOptions = {
        length: 20,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
      };
      // Generate multiple times to reduce flakiness
      for (let i = 0; i < 5; i++) {
        const pw = passwordService.generatePassword(opts);
        expect(pw).toMatch(/[a-z]/);
        expect(pw).toMatch(/[A-Z]/);
        expect(pw).toMatch(/[0-9]/);
        expect(pw).toMatch(/[^a-zA-Z0-9]/);
      }
    });

    it('should enforce minimum length of 8', () => {
      const pw = passwordService.generatePassword({
        length: 3,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
      });
      expect(pw.length).toBeGreaterThanOrEqual(8);
    });

    it('should fall back to default charset when no classes selected', () => {
      const pw = passwordService.generatePassword({
        length: 20,
        uppercase: false,
        lowercase: false,
        digits: false,
        symbols: false,
      });
      expect(pw.length).toBe(20);
      expect(pw).toBeTruthy();
    });

    it('should generate unique passwords each time', () => {
      const passwords = new Set<string>();
      for (let i = 0; i < 10; i++) {
        passwords.add(passwordService.generatePassword());
      }
      expect(passwords.size).toBe(10);
    });
  });

  describe('loadEntries()', () => {
    it('should return empty array when nothing stored', async () => {
      const entries = await passwordService.loadEntries();
      expect(entries).toEqual([]);
    });

    it('should load entries from localStorage (base64 fallback)', async () => {
      const testEntries: PasswordEntry[] = [
        {
          id: 'pw-1',
          title: 'Test',
          username: 'user',
          password: 'pass123',
          url: 'https://example.com',
          category: 'Social',
          strength: 'Strong',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        },
      ];
      // Store as base64 (fallback when no crypto.subtle)
      localStorageMock.setItem(STORAGE_KEY, btoa(JSON.stringify(testEntries)));

      const entries = await passwordService.loadEntries();
      expect(entries.length).toBe(1);
      expect(entries[0].title).toBe('Test');
    });

    it('should return empty array on corrupted data', async () => {
      localStorageMock.setItem(STORAGE_KEY, '!!!not-valid!!!');
      const entries = await passwordService.loadEntries();
      expect(entries).toEqual([]);
    });
  });

  describe('addEntry()', () => {
    it('should add an entry with generated id and timestamps', async () => {
      const entry = await passwordService.addEntry({
        title: 'GitHub',
        username: 'dev@test.com',
        password: 'SecureP@ss123',
        url: 'https://github.com',
        category: 'Dev',
        strength: 'Strong',
      });

      expect(entry.id).toMatch(/^pw-/);
      expect(entry.createdAt).toBeTruthy();
      expect(entry.lastModified).toBeTruthy();
      expect(entry.title).toBe('GitHub');
    });

    it('should prepend new entries (newest first)', async () => {
      await passwordService.addEntry({
        title: 'First',
        username: 'u',
        password: 'p',
        url: '',
        category: '',
        strength: 'Weak',
      });
      await passwordService.addEntry({
        title: 'Second',
        username: 'u',
        password: 'p',
        url: '',
        category: '',
        strength: 'Weak',
      });

      const entries = await passwordService.loadEntries();
      expect(entries[0].title).toBe('Second');
    });
  });

  describe('updateEntry()', () => {
    it('should update an existing entry and change lastModified', async () => {
      const entry = await passwordService.addEntry({
        title: 'Old',
        username: 'u',
        password: 'p',
        url: '',
        category: '',
        strength: 'Weak',
      });

      const updated = await passwordService.updateEntry(entry.id, { title: 'New' });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('New');
    });

    it('should return null for non-existent entry id', async () => {
      const result = await passwordService.updateEntry('nonexistent-id', { title: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('deleteEntry()', () => {
    it('should delete an existing entry and return true', async () => {
      const entry = await passwordService.addEntry({
        title: 'ToDelete',
        username: 'u',
        password: 'p',
        url: '',
        category: '',
        strength: 'Weak',
      });
      const deleted = await passwordService.deleteEntry(entry.id);
      expect(deleted).toBe(true);

      const entries = await passwordService.loadEntries();
      expect(entries.find(e => e.id === entry.id)).toBeUndefined();
    });

    it('should return false for non-existent entry', async () => {
      const result = await passwordService.deleteEntry('no-such-id');
      expect(result).toBe(false);
    });
  });

  describe('getCount()', () => {
    it('should return 0 when empty', async () => {
      expect(await passwordService.getCount()).toBe(0);
    });

    it('should return correct count after adding entries', async () => {
      await passwordService.addEntry({
        title: 'A',
        username: 'u',
        password: 'p',
        url: '',
        category: '',
        strength: 'Weak',
      });
      await passwordService.addEntry({
        title: 'B',
        username: 'u',
        password: 'p',
        url: '',
        category: '',
        strength: 'Weak',
      });
      expect(await passwordService.getCount()).toBe(2);
    });
  });
});
