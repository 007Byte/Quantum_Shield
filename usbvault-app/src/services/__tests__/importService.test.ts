/**
 * Import Service Tests — Core Functionality
 *
 * Tests password import from Bitwarden, 1Password, LastPass,
 * Chrome, and KeePass formats. Also tests format detection,
 * duplicate detection, and validation.
 */

import {
  importPasswords,
  detectFormat,
  validateImportFile,
  formatLabel,
} from '../vault/import';

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

describe('ImportService', () => {
  // ============================================================================
  // Test: Format Detection
  // ============================================================================
  describe('detectFormat', () => {
    it('should detect Bitwarden CSV format', () => {
      const header = 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp';
      expect(detectFormat(header)).toBe('bitwarden');
    });

    it('should detect LastPass CSV format', () => {
      const header = 'url,username,password,totp,extra,name,grouping,fav';
      expect(detectFormat(header)).toBe('lastpass');
    });

    it('should detect 1Password CSV format', () => {
      const header = 'Title,URL,Username,Password,Notes,Type';
      expect(detectFormat(header)).toBe('1password');
    });

    it('should detect Chrome CSV format', () => {
      const header = 'name,url,username,password';
      expect(detectFormat(header)).toBe('chrome');
    });

    it('should detect KeePass JSON format', () => {
      const json = JSON.stringify({ Root: { Group: [] } });
      expect(detectFormat(json)).toBe('keepass');
    });

    it('should default to chrome for unknown format', () => {
      const header = 'some,random,columns';
      expect(detectFormat(header)).toBe('chrome');
    });
  });

  // ============================================================================
  // Test: Import Passwords — Chrome
  // ============================================================================
  describe('importPasswords (Chrome)', () => {
    it('should import Chrome CSV passwords', async () => {
      const csv = `name,url,username,password
Google,https://google.com,user@gmail.com,pass123
GitHub,https://github.com,devuser,ghp_token123`;

      const result = await importPasswords(csv, 'chrome');

      expect(result.imported).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(result.entries[0].title).toBe('Google');
      expect(result.entries[0].url).toBe('https://google.com');
      expect(result.entries[0].username).toBe('user@gmail.com');
      expect(result.entries[0].password).toBe('pass123');
    });

    it('should skip entries without passwords', async () => {
      const csv = `name,url,username,password
Google,https://google.com,user@gmail.com,pass123
Empty,https://empty.com,user,`;

      const result = await importPasswords(csv, 'chrome');

      expect(result.imported).toBe(1);
    });

    it('should generate IDs for imported entries', async () => {
      const csv = `name,url,username,password
Test,https://test.com,user,pass123`;

      const result = await importPasswords(csv, 'chrome');

      expect(result.entries[0].id).toBeDefined();
      expect(result.entries[0].id).toContain('imp_');
    });

    it('should assess password strength', async () => {
      const csv = `name,url,username,password
Weak,https://weak.com,user,123
Strong,https://strong.com,user,MyStr0ng!P@ssw0rd2025`;

      const result = await importPasswords(csv, 'chrome');

      const weak = result.entries.find(e => e.title === 'Weak');
      const strong = result.entries.find(e => e.title === 'Strong');

      expect(weak?.strength).toBe('Weak');
      expect(strong?.strength).toBe('Strong');
    });
  });

  // ============================================================================
  // Test: Import Passwords — Bitwarden
  // ============================================================================
  describe('importPasswords (Bitwarden)', () => {
    it('should import Bitwarden CSV format', async () => {
      const csv = `folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp
Social,,login,Twitter,,,,https://twitter.com,@user,twitterpass123,`;

      const result = await importPasswords(csv, 'bitwarden');

      expect(result.imported).toBe(1);
      expect(result.entries[0].title).toBe('Twitter');
      expect(result.entries[0].url).toBe('https://twitter.com');
    });
  });

  // ============================================================================
  // Test: Import Passwords — LastPass
  // ============================================================================
  describe('importPasswords (LastPass)', () => {
    it('should import LastPass CSV format', async () => {
      const csv = `url,username,password,totp,extra,name,grouping,fav
https://amazon.com,shopper@email.com,amzn_pass,,,"Amazon","Shopping",0`;

      const result = await importPasswords(csv, 'lastpass');

      expect(result.imported).toBe(1);
      expect(result.entries[0].username).toBe('shopper@email.com');
      expect(result.entries[0].category).toBe('Shopping');
    });
  });

  // ============================================================================
  // Test: Import Passwords — KeePass
  // ============================================================================
  describe('importPasswords (KeePass)', () => {
    it('should import KeePass JSON format', async () => {
      const json = JSON.stringify({
        Root: {
          Group: {
            Name: 'Root',
            Entry: [
              {
                Title: 'Bank Account',
                URL: 'https://mybank.com',
                UserName: 'banker',
                Password: 'bankpass123',
              },
            ],
          },
        },
      });

      const result = await importPasswords(json, 'keepass');

      expect(result.imported).toBe(1);
      expect(result.entries[0].title).toBe('Bank Account');
    });
  });

  // ============================================================================
  // Test: Duplicate Detection
  // ============================================================================
  describe('duplicate detection', () => {
    it('should skip duplicates against existing entries', async () => {
      const csv = `name,url,username,password
Google,https://google.com,user@gmail.com,pass123`;

      const existing = [
        {
          id: 'existing-1',
          title: 'Google',
          url: 'https://google.com',
          username: 'user@gmail.com',
          password: 'oldpass',
          strength: 'Medium' as const,
          category: 'Imported',
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        },
      ];

      const result = await importPasswords(csv, 'chrome', existing);

      expect(result.duplicates).toBe(1);
      expect(result.imported).toBe(0);
    });

    it('should skip duplicates within the same batch', async () => {
      const csv = `name,url,username,password
Google,https://google.com,user@gmail.com,pass123
Google,https://google.com,user@gmail.com,pass456`;

      const result = await importPasswords(csv, 'chrome');

      expect(result.imported).toBe(1);
      expect(result.duplicates).toBe(1);
    });
  });

  // ============================================================================
  // Test: Auto-Detection
  // ============================================================================
  describe('auto format detection', () => {
    it('should auto-detect and import Chrome CSV', async () => {
      const csv = `name,url,username,password
Test,https://test.com,user,pass123`;

      const result = await importPasswords(csv, 'auto');
      expect(result.imported).toBe(1);
    });
  });

  // ============================================================================
  // Test: Progress Callback
  // ============================================================================
  describe('progress callback', () => {
    it('should call progress callback during import', async () => {
      const csv = `name,url,username,password
Entry1,https://1.com,user1,pass1
Entry2,https://2.com,user2,pass2
Entry3,https://3.com,user3,pass3`;

      const onProgress = jest.fn();
      await importPasswords(csv, 'chrome', [], onProgress);

      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({
          current: 3,
          total: 3,
          percentage: 100,
        })
      );
    });
  });

  // ============================================================================
  // Test: Validate Import File
  // ============================================================================
  describe('validateImportFile', () => {
    it('should return valid for Chrome CSV', () => {
      const csv = `name,url,username,password
Test,https://test.com,user,pass`;

      const result = validateImportFile(csv);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('chrome');
      expect(result.estimatedCount).toBe(1);
    });

    it('should return invalid for empty content', () => {
      const result = validateImportFile('');
      expect(result.valid).toBe(false);
      expect(result.format).toBeNull();
    });

    it('should return valid for KeePass JSON', () => {
      const json = JSON.stringify({ Root: { Group: { Name: 'Root' } } });
      const result = validateImportFile(json);
      expect(result.valid).toBe(true);
      expect(result.format).toBe('keepass');
    });

    it('should return invalid for single-line content (header only)', () => {
      const result = validateImportFile('name,url,username,password');
      expect(result.valid).toBe(false);
    });
  });

  // ============================================================================
  // Test: Format Labels
  // ============================================================================
  describe('formatLabel', () => {
    it('should return human-readable labels', () => {
      expect(formatLabel('bitwarden')).toBe('Bitwarden');
      expect(formatLabel('1password')).toBe('1Password');
      expect(formatLabel('lastpass')).toBe('LastPass');
      expect(formatLabel('chrome')).toBe('Chrome');
      expect(formatLabel('keepass')).toBe('KeePass');
      expect(formatLabel('auto')).toBe('Auto-detect');
    });
  });

  // ============================================================================
  // Test: Error Handling
  // ============================================================================
  describe('error handling', () => {
    it('should return errors array for empty CSV', async () => {
      const result = await importPasswords('', 'chrome');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle malformed CSV gracefully', async () => {
      const csv = `name,url
only_header`;

      const result = await importPasswords(csv, 'chrome');
      // Should not throw, may have 0 imports or errors
      expect(result).toBeDefined();
    });

    it('should handle malformed KeePass JSON', async () => {
      const result = await importPasswords('{invalid json', 'keepass');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
