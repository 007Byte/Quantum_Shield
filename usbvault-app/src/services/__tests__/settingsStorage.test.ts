/**
 * Tests for settingsStorage — security vs UI settings split + legacy migration.
 *
 * Exercises the REAL behavior of SecuritySettingsStorage and UISettingsStorage:
 *  - load: cache hit, localStorage fallback merged over defaults, malformed JSON
 *  - save: merge-over-current + cache update + localStorage persistence
 *  - clearCache forcing a re-read from storage
 *  - needsMigration flag semantics
 *  - migrateFromLegacy: mapping old keys (settings + self_destruct_config) and
 *    marking the migration flag (including the failure path)
 *  - UISettingsStorage load/save merge + defaults
 *
 * No mocks: localStorage (jsdom) is the real storage under test. Each scenario
 * uses a FRESH module instance so the in-memory cache does not leak between tests.
 */

const SECURITY_SETTINGS_KEY = 'usbvault:security-settings';
const MIGRATION_KEY = 'usbvault:settings-migrated';
const UI_SETTINGS_KEY = 'usbvault:ui-settings';

type SettingsModule = typeof import('../settingsStorage');

/** Fresh module instance (the storage singletons hold an in-memory cache). */
function loadModule(): SettingsModule {
  let mod!: SettingsModule;
  jest.isolateModules(() => {
    mod = require('../settingsStorage');
  });
  return mod;
}

beforeEach(() => {
  localStorage.clear();
});

describe('SecuritySettingsStorage.load', () => {
  it('returns defaults when nothing is stored', () => {
    const { securitySettings, DEFAULT_SECURITY_SETTINGS } = loadModule();
    expect(securitySettings.load()).toEqual(DEFAULT_SECURITY_SETTINGS);
  });

  it('merges stored partial settings over defaults', () => {
    localStorage.setItem(
      SECURITY_SETTINGS_KEY,
      JSON.stringify({ autoLockTimeoutMs: 60000, biometricEnabled: true })
    );
    const { securitySettings } = loadModule();
    const loaded = securitySettings.load();
    expect(loaded.autoLockTimeoutMs).toBe(60000);
    expect(loaded.biometricEnabled).toBe(true);
    // Unspecified fields fall back to defaults.
    expect(loaded.autoLockEnabled).toBe(true);
    expect(loaded.selfDestructAttempts).toBe(10);
  });

  it('returns defaults when stored JSON is malformed', () => {
    localStorage.setItem(SECURITY_SETTINGS_KEY, '{broken json');
    const { securitySettings, DEFAULT_SECURITY_SETTINGS } = loadModule();
    expect(securitySettings.load()).toEqual(DEFAULT_SECURITY_SETTINGS);
  });

  it('returns a copy — mutating the result does not change cached state', () => {
    localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ pinEnabled: true }));
    const { securitySettings } = loadModule();
    const first = securitySettings.load();
    first.pinEnabled = false;
    // Cache populated from the first load is unaffected by external mutation.
    expect(securitySettings.load().pinEnabled).toBe(true);
  });

  it('serves subsequent loads from the in-memory cache (ignores later storage edits)', () => {
    localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ selfDestructAttempts: 3 }));
    const { securitySettings } = loadModule();
    expect(securitySettings.load().selfDestructAttempts).toBe(3);

    // Cache is now warm; a direct storage edit should NOT be observed until cleared.
    localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ selfDestructAttempts: 99 }));
    expect(securitySettings.load().selfDestructAttempts).toBe(3);
  });
});

describe('SecuritySettingsStorage.save', () => {
  it('merges over current values, updates the cache, and persists to localStorage', () => {
    const { securitySettings } = loadModule();
    securitySettings.save({ autoLockEnabled: false, autoLockTimeoutMs: 120000 });

    const loaded = securitySettings.load();
    expect(loaded.autoLockEnabled).toBe(false);
    expect(loaded.autoLockTimeoutMs).toBe(120000);

    const persisted = JSON.parse(localStorage.getItem(SECURITY_SETTINGS_KEY) as string);
    expect(persisted.autoLockEnabled).toBe(false);
    expect(persisted.autoLockTimeoutMs).toBe(120000);
    // Untouched fields retain their defaults in the persisted blob.
    expect(persisted.selfDestructEnabled).toBe(false);
  });

  it('accumulates across multiple saves without dropping earlier changes', () => {
    const { securitySettings } = loadModule();
    securitySettings.save({ biometricEnabled: true });
    securitySettings.save({ ghostModeEnabled: true });

    const loaded = securitySettings.load();
    expect(loaded.biometricEnabled).toBe(true);
    expect(loaded.ghostModeEnabled).toBe(true);
  });
});

describe('SecuritySettingsStorage.clearCache', () => {
  it('forces the next load to re-read from localStorage', () => {
    const { securitySettings } = loadModule();
    securitySettings.save({ selfDestructAttempts: 5 });
    expect(securitySettings.load().selfDestructAttempts).toBe(5);

    // Externally rewrite storage, then drop the cache.
    localStorage.setItem(SECURITY_SETTINGS_KEY, JSON.stringify({ selfDestructAttempts: 7 }));
    securitySettings.clearCache();
    expect(securitySettings.load().selfDestructAttempts).toBe(7);
  });
});

describe('SecuritySettingsStorage.needsMigration', () => {
  it('returns true when the migration flag is absent', () => {
    const { securitySettings } = loadModule();
    expect(securitySettings.needsMigration()).toBe(true);
  });

  it('returns false once the migration flag is set', () => {
    localStorage.setItem(MIGRATION_KEY, 'true');
    const { securitySettings } = loadModule();
    expect(securitySettings.needsMigration()).toBe(false);
  });
});

describe('SecuritySettingsStorage.migrateFromLegacy', () => {
  it('maps legacy settings keys into the new structure and marks migration complete', () => {
    localStorage.setItem(
      'usbvault:settings',
      JSON.stringify({
        autoLockTimeout: 90000,
        autoLockEnabled: false,
        selfDestruct: true,
        selfDestructAttempts: 4,
        biometric: true,
        ghostMode: true,
      })
    );
    const { securitySettings } = loadModule();
    securitySettings.migrateFromLegacy();

    const loaded = securitySettings.load();
    expect(loaded.autoLockTimeoutMs).toBe(90000);
    expect(loaded.autoLockEnabled).toBe(false);
    expect(loaded.selfDestructEnabled).toBe(true);
    expect(loaded.selfDestructAttempts).toBe(4);
    expect(loaded.biometricEnabled).toBe(true);
    expect(loaded.ghostModeEnabled).toBe(true);

    expect(localStorage.getItem(MIGRATION_KEY)).toBe('true');
    expect(securitySettings.needsMigration()).toBe(false);
  });

  it('maps legacy self_destruct_config (isArmed/failThreshold) over base settings', () => {
    localStorage.setItem('usbvault:settings', JSON.stringify({ selfDestruct: false }));
    localStorage.setItem(
      'usbvault:self_destruct_config',
      JSON.stringify({ isArmed: true, failThreshold: 6 })
    );
    const { securitySettings } = loadModule();
    securitySettings.migrateFromLegacy();

    const loaded = securitySettings.load();
    // self_destruct_config is read after settings, so isArmed wins.
    expect(loaded.selfDestructEnabled).toBe(true);
    expect(loaded.selfDestructAttempts).toBe(6);
  });

  it('marks migration complete even when there is nothing to migrate', () => {
    const { securitySettings } = loadModule();
    securitySettings.migrateFromLegacy();
    expect(localStorage.getItem(MIGRATION_KEY)).toBe('true');
    // No legacy data was written, so security settings stay at defaults.
    expect(securitySettings.load().autoLockTimeoutMs).toBe(5 * 60 * 1000);
  });

  it('still marks migration complete when legacy JSON is malformed', () => {
    localStorage.setItem('usbvault:settings', '{not json at all');
    const { securitySettings } = loadModule();
    securitySettings.migrateFromLegacy();
    expect(localStorage.getItem(MIGRATION_KEY)).toBe('true');
  });
});

describe('UISettingsStorage', () => {
  it('returns defaults when nothing is stored', () => {
    const { uiSettings, DEFAULT_UI_SETTINGS } = loadModule();
    expect(uiSettings.load()).toEqual(DEFAULT_UI_SETTINGS);
  });

  it('merges stored UI settings over defaults', () => {
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify({ theme: 'light', language: 'fr' }));
    const { uiSettings } = loadModule();
    const loaded = uiSettings.load();
    expect(loaded.theme).toBe('light');
    expect(loaded.language).toBe('fr');
    // Defaults fill the rest.
    expect(loaded.sidebarCollapsed).toBe(false);
    expect(loaded.notificationsEnabled).toBe(true);
  });

  it('save merges over the current stored settings and persists', () => {
    const { uiSettings } = loadModule();
    uiSettings.save({ sidebarCollapsed: true });
    uiSettings.save({ theme: 'system' });

    const loaded = uiSettings.load();
    expect(loaded.sidebarCollapsed).toBe(true);
    expect(loaded.theme).toBe('system');

    const persisted = JSON.parse(localStorage.getItem(UI_SETTINGS_KEY) as string);
    expect(persisted.sidebarCollapsed).toBe(true);
    expect(persisted.theme).toBe('system');
  });

  it('falls back to defaults when stored UI JSON is malformed', () => {
    localStorage.setItem(UI_SETTINGS_KEY, 'not-json');
    const { uiSettings, DEFAULT_UI_SETTINGS } = loadModule();
    expect(uiSettings.load()).toEqual(DEFAULT_UI_SETTINGS);
  });
});
