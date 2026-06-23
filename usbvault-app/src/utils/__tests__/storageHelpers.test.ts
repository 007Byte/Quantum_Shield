/**
 * Storage Helpers Tests — PL-031
 *
 * Tests readLocal, writeLocal, removeLocal, readSession, writeSession,
 * readLocalRaw, writeLocalRaw, and error handling.
 */

// Mock localStorage
import {
  readLocal,
  writeLocal,
  removeLocal,
  readSession,
  writeSession,
  readLocalRaw,
  writeLocalRaw,
} from '../storageHelpers';

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

// Mock sessionStorage
const sessionStorageMock = (() => {
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
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({}));

describe('storageHelpers', () => {
  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    sessionStorageMock.getItem.mockClear();
    sessionStorageMock.setItem.mockClear();
  });

  describe('readLocal()', () => {
    it('should return the fallback when key does not exist', () => {
      const result = readLocal('missing-key', { default: true });
      expect(result).toEqual({ default: true });
    });

    it('should parse and return stored JSON values', () => {
      localStorageMock.setItem('test-key', JSON.stringify({ name: 'Alice' }));
      const result = readLocal('test-key', {});
      expect(result).toEqual({ name: 'Alice' });
    });

    it('should return stored arrays', () => {
      localStorageMock.setItem('arr-key', JSON.stringify([1, 2, 3]));
      const result = readLocal<number[]>('arr-key', []);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should return stored primitive values', () => {
      localStorageMock.setItem('num-key', JSON.stringify(42));
      const result = readLocal<number>('num-key', 0);
      expect(result).toBe(42);
    });

    it('should return fallback on invalid JSON', () => {
      localStorageMock.setItem('bad-key', 'not-json{{{');
      const result = readLocal('bad-key', 'fallback');
      expect(result).toBe('fallback');
    });

    it('should return fallback when localStorage.getItem throws', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('storage error');
      });
      const result = readLocal('key', 'safe');
      expect(result).toBe('safe');
    });
  });

  describe('writeLocal()', () => {
    it('should serialize and store a value', () => {
      writeLocal('write-key', { count: 5 });
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'write-key',
        JSON.stringify({ count: 5 })
      );
    });

    it('should store arrays', () => {
      writeLocal('arr', [1, 2]);
      const stored = localStorageMock._getStore()['arr'];
      expect(JSON.parse(stored)).toEqual([1, 2]);
    });

    it('should store primitive values', () => {
      writeLocal('bool', true);
      const stored = localStorageMock._getStore()['bool'];
      expect(JSON.parse(stored)).toBe(true);
    });

    it('should not throw when localStorage.setItem throws', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => writeLocal('key', 'value')).not.toThrow();
    });
  });

  describe('removeLocal()', () => {
    it('should remove a key from localStorage', () => {
      localStorageMock.setItem('to-remove', '"data"');
      removeLocal('to-remove');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('to-remove');
    });

    it('should not throw when removing a non-existent key', () => {
      expect(() => removeLocal('nonexistent')).not.toThrow();
    });

    it('should not throw when localStorage.removeItem throws', () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('storage error');
      });
      expect(() => removeLocal('key')).not.toThrow();
    });
  });

  describe('readSession()', () => {
    it('should return fallback when sessionStorage key is missing', () => {
      const result = readSession('missing', 'default');
      expect(result).toBe('default');
    });

    it('should parse and return stored JSON from sessionStorage', () => {
      sessionStorageMock.setItem('sess-key', JSON.stringify({ token: 'abc' }));
      const result = readSession('sess-key', {});
      expect(result).toEqual({ token: 'abc' });
    });

    it('should return fallback on invalid JSON in sessionStorage', () => {
      sessionStorageMock.setItem('bad', '{broken');
      const result = readSession('bad', null);
      expect(result).toBeNull();
    });

    it('should return fallback when sessionStorage throws', () => {
      sessionStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('access denied');
      });
      const result = readSession('key', 'safe');
      expect(result).toBe('safe');
    });
  });

  describe('writeSession()', () => {
    it('should serialize and store a value to sessionStorage', () => {
      writeSession('ws-key', { data: true });
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'ws-key',
        JSON.stringify({ data: true })
      );
    });

    it('should not throw when sessionStorage.setItem throws', () => {
      sessionStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => writeSession('key', 'value')).not.toThrow();
    });
  });

  describe('readLocalRaw()', () => {
    it('should return raw string without JSON parsing', () => {
      localStorageMock.setItem('raw-key', 'plain-text');
      const result = readLocalRaw('raw-key');
      expect(result).toBe('plain-text');
    });

    it('should return fallback when key is missing', () => {
      const result = readLocalRaw('no-key', 'default');
      expect(result).toBe('default');
    });

    it('should return null as default fallback', () => {
      const result = readLocalRaw('no-key');
      expect(result).toBeNull();
    });

    it('should return fallback when localStorage throws', () => {
      localStorageMock.getItem.mockImplementationOnce(() => {
        throw new Error('err');
      });
      const result = readLocalRaw('key', 'safe');
      expect(result).toBe('safe');
    });
  });

  describe('writeLocalRaw()', () => {
    it('should store a raw string without JSON serialization', () => {
      writeLocalRaw('raw', 'hello');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('raw', 'hello');
    });

    it('should not throw when localStorage is full', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
      });
      expect(() => writeLocalRaw('key', 'value')).not.toThrow();
    });
  });
});
