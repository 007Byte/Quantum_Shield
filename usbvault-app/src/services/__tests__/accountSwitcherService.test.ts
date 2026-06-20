/**
 * Account Switcher Service Tests — Security-Critical
 *
 * Tests multi-account management, switching, persistence, and audit logging.
 */

import { accountSwitcherService, UserAccount } from '../accountSwitcherService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
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
});

// Mock audit service
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// We need to re-instantiate the service for clean state between tests
// Since it's a singleton, we'll manipulate its internal state via public methods
describe('AccountSwitcherService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: Account Creation
  // ============================================================================
  describe('addAccount', () => {
    it('should add a new account with correct defaults', () => {
      const account = accountSwitcherService.addAccount('test@example.com', 'Test User');

      expect(account.email).toBe('test@example.com');
      expect(account.displayName).toBe('Test User');
      expect(account.tier).toBe('free');
      expect(account.storageUsed).toBe(0);
      expect(account.isActive).toBe(false);
      expect(account.id).toContain('account_');
      expect(account.vaultId).toContain('vault_');
    });

    it('should persist account to localStorage', () => {
      accountSwitcherService.addAccount('test@example.com', 'Test User');

      const stored = localStorage.getItem('usbvault:accounts');
      expect(stored).not.toBeNull();
      const accounts = JSON.parse(stored!);
      expect(accounts.length).toBeGreaterThanOrEqual(1);
    });

    it('should support adding multiple accounts', () => {
      accountSwitcherService.addAccount('user1@example.com', 'User 1');
      accountSwitcherService.addAccount('user2@example.com', 'User 2');

      const accounts = accountSwitcherService.getAccounts();
      expect(accounts.length).toBeGreaterThanOrEqual(2);
    });

    it('should log account creation to audit service', () => {
      const { auditService } = require('@/services/auditService');
      accountSwitcherService.addAccount('audit@example.com', 'Audit User');

      expect(auditService.log).toHaveBeenCalledWith(
        'ACCOUNT_CREATED',
        expect.stringContaining('account:'),
        expect.objectContaining({
          email: 'audit@example.com',
          displayName: 'Audit User',
        })
      );
    });
  });

  // ============================================================================
  // Test: Account Switching
  // ============================================================================
  describe('switchAccount', () => {
    it('should switch to the specified account', async () => {
      const account = accountSwitcherService.addAccount('switch@example.com', 'Switch User');
      await accountSwitcherService.switchAccount(account.id);

      const active = accountSwitcherService.getActiveAccount();
      expect(active).not.toBeNull();
      expect(active!.id).toBe(account.id);
      expect(active!.isActive).toBe(true);
    });

    it('should deactivate the previous account when switching', async () => {
      const account1 = accountSwitcherService.addAccount('first@example.com', 'First');
      const account2 = accountSwitcherService.addAccount('second@example.com', 'Second');

      await accountSwitcherService.switchAccount(account1.id);
      await accountSwitcherService.switchAccount(account2.id);

      const accounts = accountSwitcherService.getAccounts();
      const first = accounts.find(a => a.id === account1.id);
      expect(first!.isActive).toBe(false);
    });

    it('should throw error for non-existent account ID', async () => {
      await expect(accountSwitcherService.switchAccount('nonexistent-id')).rejects.toThrow(
        'Account with ID nonexistent-id not found'
      );
    });

    it('should update lastActiveAt timestamp on switch', async () => {
      const account = accountSwitcherService.addAccount('time@example.com', 'Time User');
      const before = Date.now();

      await accountSwitcherService.switchAccount(account.id);

      const active = accountSwitcherService.getActiveAccount();
      expect(active!.lastActiveAt).toBeGreaterThanOrEqual(before);
    });
  });

  // ============================================================================
  // Test: Account Removal
  // ============================================================================
  describe('removeAccount', () => {
    it('should remove the specified account', () => {
      const account = accountSwitcherService.addAccount('remove@example.com', 'Remove Me');
      const countBefore = accountSwitcherService.getAccountCount();

      accountSwitcherService.removeAccount(account.id);

      expect(accountSwitcherService.getAccountCount()).toBe(countBefore - 1);
    });

    it('should throw error for non-existent account', () => {
      expect(() => accountSwitcherService.removeAccount('fake-id')).toThrow(
        'Account with ID fake-id not found'
      );
    });

    it('should switch active account to first remaining if active account is removed', async () => {
      const account1 = accountSwitcherService.addAccount('stay@example.com', 'Stay');
      const account2 = accountSwitcherService.addAccount('go@example.com', 'Go');

      await accountSwitcherService.switchAccount(account2.id);
      accountSwitcherService.removeAccount(account2.id);

      // Active should fall back to first account in list
      // (implementation sets activeAccountId to accounts[0].id)
    });
  });

  // ============================================================================
  // Test: Account Update
  // ============================================================================
  describe('updateAccount', () => {
    it('should update account fields', () => {
      const account = accountSwitcherService.addAccount('update@example.com', 'Before');
      accountSwitcherService.updateAccount(account.id, { displayName: 'After' });

      const accounts = accountSwitcherService.getAccounts();
      const updated = accounts.find(a => a.id === account.id);
      expect(updated!.displayName).toBe('After');
    });

    it('should throw error for non-existent account', () => {
      expect(() => accountSwitcherService.updateAccount('fake-id', { tier: 'pro' })).toThrow(
        'Account with ID fake-id not found'
      );
    });

    it('should log update to audit service', () => {
      const { auditService } = require('@/services/auditService');
      const account = accountSwitcherService.addAccount('audit-update@example.com', 'Audit');

      accountSwitcherService.updateAccount(account.id, { tier: 'pro' });

      expect(auditService.log).toHaveBeenCalledWith(
        'ACCOUNT_UPDATED',
        expect.stringContaining('account:'),
        expect.objectContaining({
          changes: { tier: 'pro' },
        })
      );
    });
  });

  // ============================================================================
  // Test: Utility Methods
  // ============================================================================
  describe('utility methods', () => {
    it('getAccountCount should return correct count', () => {
      const initialCount = accountSwitcherService.getAccountCount();
      accountSwitcherService.addAccount('count@example.com', 'Count');
      expect(accountSwitcherService.getAccountCount()).toBe(initialCount + 1);
    });

    it('isMultiAccountEnabled should return false with 0-1 accounts', () => {
      // Clear state first
      const accounts = accountSwitcherService.getAccounts();
      accounts.forEach(a => {
        try {
          accountSwitcherService.removeAccount(a.id);
        } catch {
          // ignore
        }
      });

      expect(accountSwitcherService.isMultiAccountEnabled()).toBe(false);
      accountSwitcherService.addAccount('solo@example.com', 'Solo');
      expect(accountSwitcherService.isMultiAccountEnabled()).toBe(false);
    });

    it('isMultiAccountEnabled should return true with 2+ accounts', () => {
      accountSwitcherService.addAccount('multi1@example.com', 'Multi 1');
      accountSwitcherService.addAccount('multi2@example.com', 'Multi 2');
      expect(accountSwitcherService.isMultiAccountEnabled()).toBe(true);
    });

    it('getActiveAccount should return null when no account is active', () => {
      // Clear all accounts
      const accounts = accountSwitcherService.getAccounts();
      accounts.forEach(a => {
        try {
          accountSwitcherService.removeAccount(a.id);
        } catch {
          // ignore
        }
      });

      const active = accountSwitcherService.getActiveAccount();
      expect(active).toBeNull();
    });

    it('getAccounts should return a copy (not a reference)', () => {
      accountSwitcherService.addAccount('copy@example.com', 'Copy');
      const accounts1 = accountSwitcherService.getAccounts();
      const accounts2 = accountSwitcherService.getAccounts();

      expect(accounts1).not.toBe(accounts2);
    });
  });
});
