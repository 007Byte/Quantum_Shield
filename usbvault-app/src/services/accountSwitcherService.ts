import { auditService } from '@/services/auditService';
import { logger } from '@/utils/logger';

export interface UserAccount {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  lastActiveAt: number;
  isActive: boolean;
  vaultId: string;
  tier: 'free' | 'pro' | 'enterprise';
  storageUsed: number;
}

class AccountSwitcherService {
  private accounts: UserAccount[] = [];
  private activeAccountId: string | null = null;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('usbvault:accounts');
      const activeStored = localStorage.getItem('usbvault:active_account');

      if (stored) {
        this.accounts = JSON.parse(stored);
      }
      if (activeStored) {
        this.activeAccountId = activeStored;
      }
    } catch (error) {
      logger.error('Failed to load accounts from storage:', error);
      this.accounts = [];
      this.activeAccountId = null;
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('usbvault:accounts', JSON.stringify(this.accounts));
      if (this.activeAccountId) {
        localStorage.setItem('usbvault:active_account', this.activeAccountId);
      }
    } catch (error) {
      logger.error('Failed to save accounts to storage:', error);
    }
  }

  getAccounts(): UserAccount[] {
    return [...this.accounts];
  }

  getActiveAccount(): UserAccount | null {
    if (!this.activeAccountId) return null;
    return this.accounts.find(acc => acc.id === this.activeAccountId) || null;
  }

  async switchAccount(accountId: string): Promise<void> {
    const account = this.accounts.find(acc => acc.id === accountId);
    if (!account) {
      throw new Error(`Account with ID ${accountId} not found`);
    }

    // Deactivate previous account
    if (this.activeAccountId) {
      const prevAccount = this.accounts.find(acc => acc.id === this.activeAccountId);
      if (prevAccount) {
        prevAccount.isActive = false;
      }
    }

    // Activate new account
    account.isActive = true;
    account.lastActiveAt = Date.now();
    this.activeAccountId = accountId;

    this.saveToStorage();
    await auditService.log('ACCOUNT_SWITCH' as any, `account:${accountId}`, {
      previousAccountId: this.activeAccountId,
      newAccountId: accountId,
    });
  }

  addAccount(email: string, displayName: string): UserAccount {
    const newAccount: UserAccount = {
      id: `account_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      displayName,
      lastActiveAt: Date.now(),
      isActive: false,
      vaultId: `vault_${Date.now()}`,
      tier: 'free',
      storageUsed: 0,
    };

    this.accounts.push(newAccount);
    this.saveToStorage();

    auditService.log('ACCOUNT_CREATED' as any, `account:${newAccount.id}`, {
      email,
      displayName,
    });

    return newAccount;
  }

  removeAccount(accountId: string): void {
    const index = this.accounts.findIndex(acc => acc.id === accountId);
    if (index === -1) {
      throw new Error(`Account with ID ${accountId} not found`);
    }

    const account = this.accounts[index];
    this.accounts.splice(index, 1);

    if (this.activeAccountId === accountId) {
      this.activeAccountId = this.accounts.length > 0 ? this.accounts[0].id : null;
    }

    this.saveToStorage();

    auditService.log('ACCOUNT_REMOVED' as any, `account:${accountId}`, {
      email: account.email,
    });
  }

  updateAccount(accountId: string, partial: Partial<UserAccount>): void {
    const account = this.accounts.find(acc => acc.id === accountId);
    if (!account) {
      throw new Error(`Account with ID ${accountId} not found`);
    }

    const before = { ...account };
    Object.assign(account, partial);
    this.saveToStorage();

    auditService.log('ACCOUNT_UPDATED' as any, `account:${accountId}`, {
      changes: partial,
      before,
    });
  }

  getAccountCount(): number {
    return this.accounts.length;
  }

  isMultiAccountEnabled(): boolean {
    return this.accounts.length > 1;
  }
}

export const accountSwitcherService = new AccountSwitcherService();
