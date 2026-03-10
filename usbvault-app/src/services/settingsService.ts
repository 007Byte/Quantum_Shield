/**
 * Settings Service — persist user preferences to localStorage
 *
 * Covers: biometric lock, auto-lock timeout, 2FA, ghost mode, self-destruct,
 * key provider, backup preferences, and notification settings.
 */

import { logger } from '@/utils/logger';

const SETTINGS_KEY = 'usbvault:settings';

export interface UserSettings {
  // Security
  biometricLockEnabled: boolean;
  twoFactorEnabled: boolean;
  autoLockTimeoutMin: number; // in minutes
  ghostModeEnabled: boolean;
  selfDestructEnabled: boolean;
  selfDestructAttempts: number; // wipe after N failed login attempts

  // Crypto
  keyProvider: 'software' | 'hardware' | 'hybrid';
  pqcEnabled: boolean;

  // Backup
  autoBackupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  lastBackupAt: string | null;

  // App
  notificationsEnabled: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  biometricLockEnabled: true,
  twoFactorEnabled: false,
  autoLockTimeoutMin: 15,
  ghostModeEnabled: false,
  selfDestructEnabled: false,
  selfDestructAttempts: 10,
  keyProvider: 'software',
  pqcEnabled: true,
  autoBackupEnabled: false,
  backupFrequency: 'weekly',
  lastBackupAt: null,
  notificationsEnabled: true,
};

class SettingsService {
  private cache: UserSettings | null = null;

  load(): UserSettings {
    if (this.cache) return { ...this.cache };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.cache = { ...DEFAULT_SETTINGS, ...parsed };
      } else {
        this.cache = { ...DEFAULT_SETTINGS };
      }
    } catch {
      this.cache = { ...DEFAULT_SETTINGS };
    }
    // All branches above assign this.cache, so it's guaranteed non-null here.
    return { ...this.cache! };
  }

  save(settings: Partial<UserSettings>): UserSettings {
    const current = this.load();
    // Merge partial updates onto the full current settings.
    // Object.assign mutates `current` in-place, which is safe because
    // load() already returned a shallow copy. The result is guaranteed
    // to be a complete UserSettings because `current` already is one.
    const updated = Object.assign(current, settings) as unknown as UserSettings;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
      this.cache = updated;
      logger.log('[Settings] Saved settings update:', Object.keys(settings).join(', '));
    } catch (err) {
      logger.error('[Settings] Failed to save:', err);
    }
    return { ...updated };
  }

  get<K extends keyof UserSettings>(key: K): UserSettings[K] {
    return this.load()[key];
  }

  set<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    this.save({ [key]: value } as Partial<UserSettings>);
  }

  reset(): void {
    try {
      localStorage.removeItem(SETTINGS_KEY);
      this.cache = null;
    } catch {
      // silent
    }
  }
}

export const settingsService = new SettingsService();
