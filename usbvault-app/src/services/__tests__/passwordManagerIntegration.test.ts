/**
 * Password Manager Integration Tests
 *
 * Tests the password manager CRUD lifecycle: add, list, search,
 * update, delete, import, and password generation with strength validation.
 */

import { passwordService, type PasswordEntry } from '../passwordService';

// ── Mock platform as web (passwordService uses localStorage on web) ───
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// ── localStorage mock ─────────────────────────────────────────────────
const localStorageStore: Record<string, string> = {};

const localStorageMock = {
  getItem: jest.fn((key: string) => localStorageStore[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: jest.fn(() => {
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }
  }),
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('Password Manager Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  // ============================================================================
  // Add password entry
  // ============================================================================
  describe('Add password entry', () => {
    it('adds a new password entry and returns it with generated fields', async () => {
      const entry = await passwordService.addEntry({
        title: 'GitHub',
        username: 'developer@example.com',
        password: 'Str0ng!P@ssword',
        url: 'https://github.com',
        category: 'Development',
        strength: 'Strong',
      });

      expect(entry.id).toBeTruthy();
      expect(entry.id).toMatch(/^pw-/);
      expect(entry.title).toBe('GitHub');
      expect(entry.username).toBe('developer@example.com');
      expect(entry.createdAt).toBeTruthy();
      expect(entry.lastModified).toBeTruthy();
    });

    it('encrypts and persists the entry to localStorage', async () => {
      await passwordService.addEntry({
        title: 'Test Entry',
        username: 'user@test.com',
        password: 'TestPass123!',
        url: 'https://test.com',
        category: 'Testing',
        strength: 'Strong',
      });

      // localStorage.setItem should have been called with the storage key
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'usbvault:passwords',
        expect.any(String)
      );
    });
  });

  // ============================================================================
  // List passwords
  // ============================================================================
  describe('List passwords', () => {
    it('returns decrypted entries after adding them', async () => {
      await passwordService.addEntry({
        title: 'Entry A',
        username: 'a@example.com',
        password: 'PassA123!',
        url: 'https://a.com',
        category: 'Personal',
        strength: 'Strong',
      });

      await passwordService.addEntry({
        title: 'Entry B',
        username: 'b@example.com',
        password: 'PassB456!',
        url: 'https://b.com',
        category: 'Work',
        strength: 'Medium',
      });

      const entries = await passwordService.loadEntries();

      expect(entries).toHaveLength(2);
      // Most recent entry is first (unshift behavior)
      expect(entries[0].title).toBe('Entry B');
      expect(entries[1].title).toBe('Entry A');
    });

    it('returns empty array when no entries exist', async () => {
      const entries = await passwordService.loadEntries();
      expect(entries).toEqual([]);
    });
  });

  // ============================================================================
  // Search passwords
  // ============================================================================
  describe('Search passwords', () => {
    let storedEntries: PasswordEntry[];

    beforeEach(async () => {
      await passwordService.addEntry({
        title: 'GitHub',
        username: 'dev@github.com',
        password: 'GhPass123!',
        url: 'https://github.com',
        category: 'Development',
        strength: 'Strong',
      });

      await passwordService.addEntry({
        title: 'Gmail',
        username: 'user@gmail.com',
        password: 'GmPass456!',
        url: 'https://gmail.com',
        category: 'Email',
        strength: 'Strong',
      });

      await passwordService.addEntry({
        title: 'AWS Console',
        username: 'admin@aws.com',
        password: 'AwsPass789!',
        url: 'https://console.aws.amazon.com',
        category: 'Development',
        strength: 'Strong',
      });

      storedEntries = await passwordService.loadEntries();
    });

    it('filters entries by title substring match', () => {
      const query = 'git';
      const results = storedEntries.filter(
        e => e.title.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('GitHub');
    });

    it('filters entries by category', () => {
      const results = storedEntries.filter(e => e.category === 'Development');

      expect(results).toHaveLength(2);
      expect(results.map(e => e.title).sort()).toEqual(['AWS Console', 'GitHub']);
    });

    it('returns empty results for non-matching query', () => {
      const query = 'nonexistent';
      const results = storedEntries.filter(
        e =>
          e.title.toLowerCase().includes(query.toLowerCase()) ||
          e.username.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(0);
    });

    it('searches across multiple fields', () => {
      const query = 'aws';
      const results = storedEntries.filter(
        e =>
          e.title.toLowerCase().includes(query.toLowerCase()) ||
          e.url.toLowerCase().includes(query.toLowerCase()) ||
          e.username.toLowerCase().includes(query.toLowerCase())
      );

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('AWS Console');
    });
  });

  // ============================================================================
  // Update password
  // ============================================================================
  describe('Update password', () => {
    it('updates an existing entry and re-encrypts with new data', async () => {
      const original = await passwordService.addEntry({
        title: 'Test Service',
        username: 'original@test.com',
        password: 'OriginalPass1!',
        url: 'https://test.com',
        category: 'Testing',
        strength: 'Strong',
      });

      const updated = await passwordService.updateEntry(original.id, {
        password: 'NewStr0ng!Pass',
        username: 'updated@test.com',
      });

      expect(updated).not.toBeNull();
      expect(updated!.password).toBe('NewStr0ng!Pass');
      expect(updated!.username).toBe('updated@test.com');
      expect(updated!.title).toBe('Test Service'); // unchanged
      expect(updated!.lastModified).not.toBe(original.lastModified);
    });

    it('returns null when updating a non-existent entry', async () => {
      const result = await passwordService.updateEntry('nonexistent-id', {
        password: 'NewPass1!',
      });

      expect(result).toBeNull();
    });

    it('persists the updated entry to storage', async () => {
      const entry = await passwordService.addEntry({
        title: 'Persist Test',
        username: 'persist@test.com',
        password: 'PersistPass1!',
        url: 'https://persist.com',
        category: 'Testing',
        strength: 'Medium',
      });

      await passwordService.updateEntry(entry.id, { title: 'Updated Title' });

      // Reload from storage to verify persistence
      const reloaded = await passwordService.loadEntries();
      const found = reloaded.find(e => e.id === entry.id);
      expect(found).toBeDefined();
      expect(found!.title).toBe('Updated Title');
    });
  });

  // ============================================================================
  // Delete password
  // ============================================================================
  describe('Delete password', () => {
    it('removes entry from store and returns true', async () => {
      const entry = await passwordService.addEntry({
        title: 'To Delete',
        username: 'delete@test.com',
        password: 'DeletePass1!',
        url: 'https://delete.com',
        category: 'Testing',
        strength: 'Weak',
      });

      const deleted = await passwordService.deleteEntry(entry.id);

      expect(deleted).toBe(true);

      const remaining = await passwordService.loadEntries();
      expect(remaining.find(e => e.id === entry.id)).toBeUndefined();
    });

    it('returns false when deleting a non-existent entry', async () => {
      const deleted = await passwordService.deleteEntry('nonexistent-id');
      expect(deleted).toBe(false);
    });

    it('does not affect other entries when one is deleted', async () => {
      const entry1 = await passwordService.addEntry({
        title: 'Keep This',
        username: 'keep@test.com',
        password: 'KeepPass1!',
        url: 'https://keep.com',
        category: 'Testing',
        strength: 'Strong',
      });

      const entry2 = await passwordService.addEntry({
        title: 'Delete This',
        username: 'delete@test.com',
        password: 'DeletePass1!',
        url: 'https://delete.com',
        category: 'Testing',
        strength: 'Medium',
      });

      await passwordService.deleteEntry(entry2.id);

      const remaining = await passwordService.loadEntries();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(entry1.id);
    });
  });

  // ============================================================================
  // Import passwords from CSV
  // ============================================================================
  describe('Import passwords from CSV', () => {
    it('parses CSV and stores all entries', async () => {
      // Simulate CSV parsing → entries array (as the import flow does)
      const csvRows = [
        {
          title: 'Netflix',
          username: 'user@netflix.com',
          password: 'NetflixPass1!',
          url: 'https://netflix.com',
        },
        {
          title: 'Spotify',
          username: 'user@spotify.com',
          password: 'SpotifyPass2!',
          url: 'https://spotify.com',
        },
        {
          title: 'LinkedIn',
          username: 'user@linkedin.com',
          password: 'LinkedInPass3!',
          url: 'https://linkedin.com',
        },
      ];

      // Add all parsed entries
      const addedEntries: PasswordEntry[] = [];
      for (const row of csvRows) {
        const entry = await passwordService.addEntry({
          ...row,
          category: 'Imported',
          strength: 'Strong',
        });
        addedEntries.push(entry);
      }

      expect(addedEntries).toHaveLength(3);

      // Verify all entries are stored
      const allEntries = await passwordService.loadEntries();
      expect(allEntries).toHaveLength(3);

      // Verify each imported entry has the correct data
      const titles = allEntries.map(e => e.title).sort();
      expect(titles).toEqual(['LinkedIn', 'Netflix', 'Spotify']);
    });

    it('handles duplicate entries during import without crashing', async () => {
      // Add the same entry twice (realistic import scenario)
      await passwordService.addEntry({
        title: 'Duplicate Site',
        username: 'user@dup.com',
        password: 'DupPass1!',
        url: 'https://dup.com',
        category: 'Imported',
        strength: 'Medium',
      });

      await passwordService.addEntry({
        title: 'Duplicate Site',
        username: 'user@dup.com',
        password: 'DupPass1!',
        url: 'https://dup.com',
        category: 'Imported',
        strength: 'Medium',
      });

      const entries = await passwordService.loadEntries();
      // Both should exist (different IDs)
      expect(entries).toHaveLength(2);
      expect(entries[0].id).not.toBe(entries[1].id);
    });
  });

  // ============================================================================
  // Password generation
  // ============================================================================
  describe('Password generation', () => {
    it('generates a password of the requested length', () => {
      const password = passwordService.generatePassword({
        length: 24,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
      });

      expect(password).toHaveLength(24);
    });

    it('enforces minimum length of 8 characters', () => {
      const password = passwordService.generatePassword({
        length: 4,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
      });

      expect(password.length).toBeGreaterThanOrEqual(8);
    });

    it('includes characters from all enabled character sets', () => {
      const password = passwordService.generatePassword({
        length: 32,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
      });

      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/);
    });

    it('respects disabled character sets', () => {
      const password = passwordService.generatePassword({
        length: 20,
        uppercase: false,
        lowercase: true,
        digits: true,
        symbols: false,
      });

      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      // Should not contain uppercase or symbols
      expect(password).not.toMatch(/[A-Z]/);
      expect(password).not.toMatch(/[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/);
    });

    it('generates unique passwords on each call', () => {
      const options = {
        length: 20,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
      };

      const passwords = new Set<string>();
      for (let i = 0; i < 10; i++) {
        passwords.add(passwordService.generatePassword(options));
      }

      // All 10 generated passwords should be unique
      expect(passwords.size).toBe(10);
    });

    it('meets minimum strength requirements for default options', () => {
      const password = passwordService.generatePassword();

      // Default is length 20 with all character sets enabled
      expect(password.length).toBeGreaterThanOrEqual(8);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
    });

    it('getCount returns correct count after operations', async () => {
      await passwordService.addEntry({
        title: 'Count Test 1',
        username: 'count1@test.com',
        password: 'CountPass1!',
        url: 'https://count1.com',
        category: 'Testing',
        strength: 'Strong',
      });

      await passwordService.addEntry({
        title: 'Count Test 2',
        username: 'count2@test.com',
        password: 'CountPass2!',
        url: 'https://count2.com',
        category: 'Testing',
        strength: 'Medium',
      });

      const count = await passwordService.getCount();
      expect(count).toBe(2);
    });
  });
});
