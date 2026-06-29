/**
 * Backup & Restore Service Tests (FEAT-07) — src/services/vault/backup.ts
 *
 * Exercises real behavior: backup creation + size calculation, the
 * AES-256-GCM export/import encryption ROUND-TRIP (real webcrypto +
 * PBKDF2 from jest.setup), wrong-key failure, base64 transport encoding,
 * validation branch logic, restore orchestration over a fake store,
 * auto-backup scheduling, and history/config persistence to localStorage.
 *
 * Mocked boundaries only:
 *  - react-native Platform (forced to 'web' so the storage paths run)
 *  - settingsService / auditService (collaborators, not the unit under test)
 *  - logger (noise)
 * Crypto is REAL via jest.setup's webcrypto polyfill.
 */

import type { VaultInfo, FileInfo } from '@/types/domain';

import { backupService, type BackupData } from '../backup';
import { settingsService } from '@/services/settingsService';
import { auditService } from '@/services/auditService';

// Force web platform so localStorage-backed code paths execute.
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const mockSettings = { theme: 'dark', biometricsEnabled: false } as const;
jest.mock('@/services/settingsService', () => ({
  settingsService: {
    load: jest.fn(() => ({ ...mockSettings })),
    save: jest.fn(),
  },
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
  },
}));

// localStorage mock (jsdom does not back it in this service-test env).
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const makeVault = (over: Partial<VaultInfo> = {}): VaultInfo => ({
  id: 'v1',
  name: 'My Vault',
  encryptedMetadata: 'AAAA',
  fileCount: 2,
  lastModified: '2026-01-01T00:00:00.000Z',
  securityLevel: 'high',
  ...over,
});

const makeFile = (over: Partial<FileInfo> = {}): FileInfo => ({
  id: 'f1',
  vaultId: 'v1',
  name: 'secret.txt',
  size: 1234,
  type: 'text/plain',
  modifiedAt: '2026-01-01T00:00:00.000Z',
  encryptedMetadata: 'BBBB',
  isPQCProtected: false,
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
});

describe('backup — createBackup', () => {
  it('builds a backup payload with metadata, counts, settings, and a computed size', async () => {
    const vaults = [makeVault(), makeVault({ id: 'v2', name: 'Other' })];
    const files = [makeFile()];

    const backup = await backupService.createBackup(vaults, files);

    expect(backup.metadata.vaultCount).toBe(2);
    expect(backup.metadata.fileCount).toBe(1);
    expect(backup.metadata.version).toBe('1.0.0');
    expect(backup.metadata.encrypted).toBe(false);
    expect(backup.metadata.id).toMatch(/^backup-\d+-[a-z0-9]+$/);
    expect(backup.metadata.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(backup.vaults).toBe(vaults);
    expect(backup.files).toBe(files);
    expect(backup.settings).toEqual(mockSettings);
    expect(settingsService.load).toHaveBeenCalled();

    // Size = vault(name+meta) + file(size+name+meta) + 1024 overhead.
    const expected =
      'My Vault'.length +
      'AAAA'.length +
      'Other'.length +
      'AAAA'.length +
      (1234 + 'secret.txt'.length + 'BBBB'.length) +
      1024;
    expect(backup.metadata.sizeBytes).toBe(expected);
  });

  it('includes an empty passwords array only when includePasswords is true', async () => {
    const withPw = await backupService.createBackup([makeVault()], [], true);
    expect(withPw.passwords).toEqual([]);

    const withoutPw = await backupService.createBackup([makeVault()], []);
    expect(withoutPw.passwords).toBeUndefined();
  });

  it('wraps failures from the settings collaborator', async () => {
    (settingsService.load as jest.Mock).mockImplementationOnce(() => {
      throw new Error('settings boom');
    });
    await expect(backupService.createBackup([], [])).rejects.toThrow(
      /Failed to create backup: settings boom/
    );
  });
});

describe('backup — export/import round-trip', () => {
  it('exports unencrypted as base64 JSON and imports back to an equal payload', async () => {
    const backup = await backupService.createBackup([makeVault()], [makeFile()]);

    const exported = await backupService.exportBackup(backup);
    expect(typeof exported).toBe('string');

    // base64 decodes to JSON whose top-level is the unencrypted backup.
    const decodedJson = JSON.parse(Buffer.from(exported, 'base64').toString('utf8'));
    expect(decodedJson.encrypted).toBeUndefined();
    expect(decodedJson.metadata.id).toBe(backup.metadata.id);

    const imported = await backupService.importBackup(exported);
    expect(imported.metadata.id).toBe(backup.metadata.id);
    expect(imported.vaults).toEqual(backup.vaults);
    expect(imported.files).toEqual(backup.files);
  });

  it('encrypts with AES-256-GCM and round-trips with the correct passphrase', async () => {
    const backup = await backupService.createBackup([makeVault()], [makeFile()]);
    const passphrase = 'correct horse battery staple';

    const exported = await backupService.exportBackup(backup, passphrase);

    // Envelope advertises encryption metadata; plaintext is NOT recoverable
    // from the transport string without the key.
    const envelope = JSON.parse(Buffer.from(exported, 'base64').toString('utf8'));
    expect(envelope.encrypted).toBe(true);
    expect(envelope.algorithm).toBe('AES-256-GCM');
    expect(typeof envelope.ciphertext).toBe('string');
    expect(typeof envelope.iv).toBe('string');
    expect(typeof envelope.salt).toBe('string');
    expect(Buffer.from(exported, 'base64').toString('utf8')).not.toContain('My Vault');

    const imported = await backupService.importBackup(exported, passphrase);
    expect(imported.metadata.id).toBe(backup.metadata.id);
    expect(imported.vaults).toEqual(backup.vaults);
    expect(imported.settings).toEqual(backup.settings);
  });

  it('produces a different IV/salt (and thus ciphertext) on each encryption of the same data', async () => {
    const backup = await backupService.createBackup([makeVault()], []);
    const a = JSON.parse(
      Buffer.from(await backupService.exportBackup(backup, 'pw'), 'base64').toString('utf8')
    );
    const b = JSON.parse(
      Buffer.from(await backupService.exportBackup(backup, 'pw'), 'base64').toString('utf8')
    );
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('fails to import an encrypted backup with the WRONG passphrase (GCM auth tag rejects)', async () => {
    const backup = await backupService.createBackup([makeVault()], []);
    const exported = await backupService.exportBackup(backup, 'right-key');

    await expect(backupService.importBackup(exported, 'wrong-key')).rejects.toThrow(
      /Failed to import backup/
    );
  });

  it('rejects importing an encrypted backup when no decryption key is provided', async () => {
    const backup = await backupService.createBackup([makeVault()], []);
    const exported = await backupService.exportBackup(backup, 'k');

    await expect(backupService.importBackup(exported)).rejects.toThrow(
      /encrypted but no decryption key/
    );
  });

  it('throws on malformed (non-base64-JSON) import data', async () => {
    await expect(backupService.importBackup('@@@not base64 json@@@')).rejects.toThrow(
      /Failed to import backup/
    );
  });
});

describe('backup — validateBackup', () => {
  const validData = (over: Record<string, unknown> = {}) => ({
    metadata: {
      id: 'x',
      createdAt: 'now',
      vaultCount: 0,
      fileCount: 0,
      sizeBytes: 1024,
      version: '1.0.0',
      encrypted: false,
    },
    vaults: [],
    files: [],
    settings: {},
    ...over,
  });

  it('accepts a well-formed backup and returns its metadata', () => {
    const result = backupService.validateBackup(validData());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.metadata?.id).toBe('x');
  });

  it('rejects non-object input', () => {
    expect(backupService.validateBackup(null).valid).toBe(false);
    expect(backupService.validateBackup('str').errors).toContain('Backup data must be an object');
  });

  it('reports each missing/invalid metadata field', () => {
    const result = backupService.validateBackup({
      metadata: { id: '', createdAt: '', vaultCount: 'x', fileCount: null, sizeBytes: 'y' },
      vaults: [],
      files: [],
      settings: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Missing backup ID',
        'Missing creation timestamp',
        'Invalid vault count',
        'Invalid file count',
        'Invalid size',
        'Missing backup version',
      ])
    );
    expect(result.metadata).toBeUndefined();
  });

  it('flags missing top-level metadata', () => {
    const result = backupService.validateBackup({ vaults: [], files: [], settings: {} });
    expect(result.errors).toContain('Missing backup metadata');
  });

  it('flags non-array vaults/files and missing settings', () => {
    const result = backupService.validateBackup(
      validData({ vaults: 'nope', files: 42, settings: undefined })
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Vaults must be an array',
        'Files must be an array',
        'Missing or invalid settings',
      ])
    );
  });
});

describe('backup — restoreFromBackup', () => {
  const buildBackup = (): BackupData => ({
    metadata: {
      id: 'backup-test',
      createdAt: 'now',
      vaultCount: 2,
      fileCount: 1,
      sizeBytes: 0,
      version: '1.0.0',
      encrypted: false,
    },
    vaults: [
      makeVault({ id: 'r1', name: 'Restored A' }),
      makeVault({ id: 'r2', name: 'Restored B' }),
    ],
    files: [makeFile({ id: 'rf1' })],
    settings: { ...mockSettings } as never,
  });

  const makeStore = () => ({
    vaults: [{ id: 'old1' }, { id: 'old2' }],
    deleteVault: jest.fn(() => Promise.resolve()),
    createVault: jest.fn(() => Promise.resolve()),
    addFile: jest.fn(),
  });

  it('clears existing vaults then restores vaults, files and settings (default: no merge)', async () => {
    const store = makeStore();
    const backup = buildBackup();

    const result = await backupService.restoreFromBackup(backup, store);

    // Existing vaults deleted.
    expect(store.deleteVault).toHaveBeenCalledTimes(2);
    expect(store.deleteVault).toHaveBeenCalledWith('old1');
    // New vaults created (by name).
    expect(store.createVault).toHaveBeenCalledTimes(2);
    expect(store.createVault).toHaveBeenCalledWith('Restored A', expect.any(Uint8Array));
    // Files added.
    expect(store.addFile).toHaveBeenCalledTimes(1);
    // Settings persisted.
    expect(settingsService.save).toHaveBeenCalledWith(backup.settings);

    expect(result).toEqual({ vaultsRestored: 2, filesRestored: 1, settingsRestored: true });
    expect(auditService.log).toHaveBeenCalledWith(
      'vault_restore',
      expect.stringContaining('backup-test'),
      expect.objectContaining({ vaultsRestored: 2, filesRestored: 1, mergeExisting: false })
    );
  });

  it('does NOT clear existing vaults when mergeExisting is true', async () => {
    const store = makeStore();
    await backupService.restoreFromBackup(buildBackup(), store, { mergeExisting: true });
    expect(store.deleteVault).not.toHaveBeenCalled();
    expect(store.createVault).toHaveBeenCalledTimes(2);
  });

  it('continues past per-vault/file failures and still reports counts', async () => {
    const store = makeStore();
    store.createVault.mockRejectedValueOnce(new Error('vault exists'));
    store.addFile.mockImplementationOnce(() => {
      throw new Error('file boom');
    });

    const result = await backupService.restoreFromBackup(buildBackup(), store);
    // Counts reflect the backup's totals regardless of per-item warnings.
    expect(result.vaultsRestored).toBe(2);
    expect(result.filesRestored).toBe(1);
  });

  it('reports settingsRestored=false when settings persistence fails', async () => {
    const store = makeStore();
    (settingsService.save as jest.Mock).mockImplementationOnce(() => {
      throw new Error('settings save failed');
    });
    const result = await backupService.restoreFromBackup(buildBackup(), store);
    expect(result.settingsRestored).toBe(false);
  });

  it('logs an error audit event and rethrows when clearing existing data fails', async () => {
    const store = makeStore();
    store.deleteVault.mockRejectedValueOnce(new Error('delete failed'));

    await expect(backupService.restoreFromBackup(buildBackup(), store)).rejects.toThrow(
      /Failed to restore backup: delete failed/
    );
    expect(auditService.log).toHaveBeenCalledWith(
      'vault_restore',
      expect.any(String),
      expect.objectContaining({ error: 'delete failed' }),
      'error'
    );
  });
});

describe('backup — auto-backup config + scheduling', () => {
  it('returns defaults when no config has been stored', () => {
    const cfg = backupService.getAutoBackupConfig();
    expect(cfg).toEqual({
      enabled: false,
      intervalHours: 168,
      maxBackups: 5,
      lastBackupAt: null,
    });
  });

  it('merges and persists partial config updates', () => {
    backupService.setAutoBackupConfig({ enabled: true, intervalHours: 24 });
    const cfg = backupService.getAutoBackupConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.intervalHours).toBe(24);
    expect(cfg.maxBackups).toBe(5); // preserved default
    // Persisted to localStorage under the documented key.
    expect(localStorage.getItem('usbvault_auto_backup_config')).toContain('"enabled":true');
    expect(auditService.log).toHaveBeenCalledWith(
      'settings_change',
      'auto_backup_config',
      expect.any(Object)
    );
  });

  it('shouldAutoBackup: false when disabled', () => {
    backupService.setAutoBackupConfig({ enabled: false });
    expect(backupService.shouldAutoBackup()).toBe(false);
  });

  it('shouldAutoBackup: true when enabled and never backed up', () => {
    backupService.setAutoBackupConfig({ enabled: true, lastBackupAt: null });
    expect(backupService.shouldAutoBackup()).toBe(true);
  });

  it('shouldAutoBackup: respects the interval since lastBackupAt', () => {
    backupService.setAutoBackupConfig({
      enabled: true,
      intervalHours: 24,
      lastBackupAt: new Date().toISOString(),
    });
    expect(backupService.shouldAutoBackup()).toBe(false); // just backed up

    const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    backupService.setAutoBackupConfig({ lastBackupAt: longAgo });
    expect(backupService.shouldAutoBackup()).toBe(true); // 48h > 24h interval
  });

  it('getLastBackupTime reflects the stored timestamp', () => {
    expect(backupService.getLastBackupTime()).toBeNull();
    const ts = '2026-02-02T00:00:00.000Z';
    backupService.setAutoBackupConfig({ lastBackupAt: ts });
    expect(backupService.getLastBackupTime()).toBe(ts);
  });
});

describe('backup — history persistence', () => {
  const entry = (id: string) => ({
    id,
    createdAt: 'now',
    sizeBytes: 10,
    vaultCount: 1,
    fileCount: 0,
    status: 'success' as const,
  });

  it('starts empty, then add/list/delete round-trips through localStorage', () => {
    expect(backupService.getBackupHistory()).toEqual([]);

    backupService.addToHistory(entry('b1'));
    backupService.addToHistory(entry('b2'));
    expect(backupService.getBackupHistory().map(h => h.id)).toEqual(['b1', 'b2']);

    backupService.deleteBackupHistory('b1');
    expect(backupService.getBackupHistory().map(h => h.id)).toEqual(['b2']);
  });

  it('tolerates corrupt history JSON in storage and returns an empty list', () => {
    localStorage.setItem('usbvault_backup_history', '{not valid json');
    expect(backupService.getBackupHistory()).toEqual([]);
  });
});

describe('backup — downloadBackup', () => {
  it('serializes BackupData to a Blob and triggers an anchor download with a default filename', () => {
    const clickSpy = jest.fn();
    const realCreate = document.createElement.bind(document);
    const createElSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement;
      if (tag === 'a') el.click = clickSpy;
      return el as HTMLElement;
    });

    const data = { metadata: { id: 'x' } } as unknown as BackupData;
    backupService.downloadBackup(data);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    createElSpy.mockRestore();
  });

  it('honors a Blob input and a custom filename', () => {
    const clickSpy = jest.fn();
    const realCreate = document.createElement.bind(document);
    let captured: HTMLAnchorElement | undefined;
    const createElSpy = jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement;
      if (tag === 'a') {
        el.click = clickSpy;
        captured = el;
      }
      return el as HTMLElement;
    });

    const blob = new Blob(['hello'], { type: 'application/json' });
    backupService.downloadBackup(blob, 'custom.json');

    expect(captured?.download).toBe('custom.json');
    expect(clickSpy).toHaveBeenCalled();
    createElSpy.mockRestore();
  });
});
