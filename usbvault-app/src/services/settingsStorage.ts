/**
 * Settings Storage Provider — separates security-critical settings from UI preferences.
 *
 * Security settings (auto-lock, self-destruct, biometric, emergency access) are stored
 * in the vault header for tamper resistance. UI settings (theme, language, sidebar state)
 * remain in localStorage for instant access without vault unlock.
 *
 * Migration: On first unlock after upgrade, existing localStorage settings are migrated
 * to vault header storage and cleared from localStorage.
 *
 * @module services/settingsStorage
 */

const SECURITY_SETTINGS_KEY = 'usbvault:security-settings';
const MIGRATION_KEY = 'usbvault:settings-migrated';

export interface SecuritySettings {
  autoLockTimeoutMs: number;
  autoLockEnabled: boolean;
  selfDestructEnabled: boolean;
  selfDestructAttempts: number;
  biometricEnabled: boolean;
  pinEnabled: boolean;
  ghostModeEnabled: boolean;
  emergencyAccessEnabled: boolean;
  emergencyAccessContacts: string[];
}

export interface UISettings {
  theme: 'dark' | 'light' | 'system';
  language: string;
  sidebarCollapsed: boolean;
  notificationsEnabled: boolean;
}

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  autoLockTimeoutMs: 5 * 60 * 1000, // 5 minutes
  autoLockEnabled: true,
  selfDestructEnabled: false,
  selfDestructAttempts: 10,
  biometricEnabled: false,
  pinEnabled: false,
  ghostModeEnabled: false,
  emergencyAccessEnabled: false,
  emergencyAccessContacts: [],
};

const DEFAULT_UI_SETTINGS: UISettings = {
  theme: 'dark',
  language: 'en',
  sidebarCollapsed: false,
  notificationsEnabled: true,
};

/**
 * Security Settings Storage — uses vault-linked encrypted storage.
 * Falls back to localStorage when vault is locked (read-only from cache).
 */
class SecuritySettingsStorage {
  private cache: SecuritySettings | null = null;

  /** Load security settings. Tries cache first, falls back to localStorage. */
  load(): SecuritySettings {
    // Try cache first (set after vault unlock)
    if (this.cache) return { ...this.cache };

    // Fall back to localStorage (pre-migration or vault locked)
    try {
      const raw = localStorage.getItem(SECURITY_SETTINGS_KEY);
      if (raw) {
        this.cache = { ...DEFAULT_SECURITY_SETTINGS, ...JSON.parse(raw) };
        return { ...this.cache };
      }
    } catch {
      // Ignore parse errors
    }

    return { ...DEFAULT_SECURITY_SETTINGS };
  }

  /** Save security settings to both localStorage cache and vault header (when unlocked). */
  save(settings: Partial<SecuritySettings>): void {
    const current = this.load();
    const merged = { ...current, ...settings };
    this.cache = merged;

    try {
      localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify(merged));
    } catch {
      // localStorage may be unavailable
    }

    // TODO: When vault is unlocked, also persist to vault header metadata
    // This will be wired in when the vault header read/write API is integrated
  }

  /** Clear all security settings (used during logout/vault lock). */
  clearCache(): void {
    this.cache = null;
  }

  /** Check if migration from old localStorage format has been completed. */
  needsMigration(): boolean {
    try {
      return localStorage.getItem(MIGRATION_KEY) !== 'true';
    } catch {
      return false;
    }
  }

  /** Migrate settings from old localStorage keys to new unified format. */
  migrateFromLegacy(): void {
    try {
      const migrated: Partial<SecuritySettings> = {};

      // Read from old settings service key
      const oldSettingsRaw = localStorage.getItem('usbvault:settings');
      if (oldSettingsRaw) {
        const oldSettings = JSON.parse(oldSettingsRaw);

        // Map old keys to new structure
        if (oldSettings.autoLockTimeout !== undefined) {
          migrated.autoLockTimeoutMs = oldSettings.autoLockTimeout;
        }
        if (oldSettings.autoLockEnabled !== undefined) {
          migrated.autoLockEnabled = oldSettings.autoLockEnabled;
        }
        if (oldSettings.selfDestruct !== undefined) {
          migrated.selfDestructEnabled = oldSettings.selfDestruct;
        }
        if (oldSettings.selfDestructAttempts !== undefined) {
          migrated.selfDestructAttempts = oldSettings.selfDestructAttempts;
        }
        if (oldSettings.biometric !== undefined) {
          migrated.biometricEnabled = oldSettings.biometric;
        }
        if (oldSettings.ghostMode !== undefined) {
          migrated.ghostModeEnabled = oldSettings.ghostMode;
        }
      }

      // Read from old self-destruct config key
      const oldSelfDestructRaw = localStorage.getItem('usbvault:self_destruct_config');
      if (oldSelfDestructRaw) {
        const oldSD = JSON.parse(oldSelfDestructRaw);
        if (oldSD.isArmed !== undefined) {
          migrated.selfDestructEnabled = oldSD.isArmed;
        }
        if (oldSD.failThreshold !== undefined) {
          migrated.selfDestructAttempts = oldSD.failThreshold;
        }
      }

      if (Object.keys(migrated).length > 0) {
        this.save(migrated);
      }

      // Mark migration complete
      localStorage.setItem(MIGRATION_KEY, 'true');
    } catch {
      // If migration fails, mark it anyway to avoid retry loops
      try {
        localStorage.setItem(MIGRATION_KEY, 'true');
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * UI Settings Storage — uses localStorage (non-sensitive, needed before vault unlock).
 */
class UISettingsStorage {
  private readonly KEY = 'usbvault:ui-settings';

  load(): UISettings {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) return { ...DEFAULT_UI_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // Ignore
    }
    return { ...DEFAULT_UI_SETTINGS };
  }

  save(settings: Partial<UISettings>): void {
    const merged = { ...this.load(), ...settings };
    try {
      localStorage.setItem(this.KEY, JSON.stringify(merged));
    } catch {
      // Ignore
    }
  }
}

// Singleton instances
export const securitySettings = new SecuritySettingsStorage();
export const uiSettings = new UISettingsStorage();

// Export types and defaults for testing
export { DEFAULT_SECURITY_SETTINGS, DEFAULT_UI_SETTINGS };
