/**
 * Generate ID Utility Tests — PL-032
 *
 * Tests ID format, uniqueness, prefix handling, and secure generation.
 */

// Mock crypto.getRandomValues
import { generateId, generateSecureId } from '../generateId';

const mockGetRandomValues = jest.fn((arr: Uint8Array) => {
  for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  return arr;
});

Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: mockGetRandomValues,
  },
  writable: true,
  configurable: true,
});

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({}));

describe('generateId()', () => {
  it('should return a string starting with the given prefix', () => {
    const id = generateId('audit');
    expect(id.startsWith('audit-')).toBe(true);
  });

  it('should contain a timestamp component', () => {
    const before = Date.now();
    const id = generateId('test');
    const parts = id.split('-');
    // Second part is the timestamp
    const timestamp = parseInt(parts[1], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
  });

  it('should contain a random suffix', () => {
    const id = generateId('msg');
    const parts = id.split('-');
    // Third part is the random suffix
    expect(parts[2]).toBeTruthy();
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('should generate unique IDs on successive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId('item'));
    }
    expect(ids.size).toBe(100);
  });

  it('should handle empty prefix', () => {
    const id = generateId('');
    expect(id.startsWith('-')).toBe(true);
    expect(id.length).toBeGreaterThan(1);
  });

  it('should handle special characters in prefix', () => {
    const id = generateId('my_prefix');
    expect(id.startsWith('my_prefix-')).toBe(true);
  });

  it('should produce IDs with consistent format (prefix-timestamp-random)', () => {
    const id = generateId('abc');
    const parts = id.split('-');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('abc');
  });

  it('should produce different random suffixes for the same timestamp', () => {
    // Generate many quickly to hit same ms
    const suffixes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const id = generateId('x');
      const suffix = id.split('-')[2];
      suffixes.add(suffix);
    }
    // Most should be unique (allow minor collisions due to Math.random)
    expect(suffixes.size).toBeGreaterThan(40);
  });
});

describe('generateSecureId()', () => {
  it('should return a string starting with the given prefix', () => {
    const id = generateSecureId('alert');
    expect(id.startsWith('alert-')).toBe(true);
  });

  it('should produce a hex suffix of 16 characters (8 bytes)', () => {
    const id = generateSecureId('incident');
    const parts = id.split('-');
    // The format is prefix-{16 hex chars}
    expect(parts[1]).toMatch(/^[0-9a-f]{16}$/);
  });

  it('should call crypto.getRandomValues', () => {
    mockGetRandomValues.mockClear();
    generateSecureId('sec');
    expect(mockGetRandomValues).toHaveBeenCalled();
  });

  it('should generate unique secure IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateSecureId('uniq'));
    }
    expect(ids.size).toBe(100);
  });

  it('should fall back to generateId format when crypto.getRandomValues throws', () => {
    mockGetRandomValues.mockImplementationOnce(() => {
      throw new Error('crypto unavailable');
    });

    const id = generateSecureId('fallback');
    expect(id.startsWith('fallback-')).toBe(true);
    // Fallback format has 3 parts (prefix-timestamp-random)
    const parts = id.split('-');
    expect(parts.length).toBe(3);
  });

  it('should produce IDs with different format than generateId', () => {
    const simpleId = generateId('test');
    const secureId = generateSecureId('test');

    // Simple: prefix-timestamp-random6 (3 parts)
    // Secure: prefix-hex16 (2 parts)
    const simpleParts = simpleId.split('-');
    const secureParts = secureId.split('-');
    expect(simpleParts.length).toBe(3);
    expect(secureParts.length).toBe(2);
  });

  it('should handle empty prefix for secure IDs', () => {
    const id = generateSecureId('');
    expect(id.startsWith('-')).toBe(true);
  });
});
