/**
 * vaultListStore tests (web path — isWeb is a module constant set to true).
 *
 * This is the canonical vault collection store: normalized byId+ids storage,
 * CRUD actions, file operations, export, and selectors. We exercise the REAL
 * store logic — normalization, persistence calls, active-vault clearing, file
 * count bookkeeping, error mapping — and mock only the genuine boundaries:
 * api, storageService, auditService, usbService, crypto, key hierarchy,
 * id generation, polling/index-sync helpers, the orchestrator, and i18n.
 *
 * activeVaultStore (a separate, trivial store) is used REAL so we can verify
 * deleteVault clears the active selection. vaultSessionStore is mocked to a
 * minimal getState() returning a controllable vaultKey.
 */
import type { VaultInfo, FileInfo, StoredFileInfo } from '@/types/domain';

// ── Boundary mocks ────────────────────────────────────────────────
const api = {
  listVaults: jest.fn(),
  createVault: jest.fn(),
  deleteVault: jest.fn(),
};
jest.mock('@/services/api', () => api);

const storageService = {
  loadVaults: jest.fn(),
  saveVaults: jest.fn(),
  deleteVault: jest.fn(),
  loadFiles: jest.fn(),
  saveFile: jest.fn(),
  deleteFile: jest.fn(),
  loadEncryptedIndex: jest.fn(),
  saveEncryptedIndex: jest.fn(),
};
jest.mock('@/services/storageService', () => ({ storageService }));

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/auditService', () => ({
  auditService: { log: (...a: unknown[]) => auditLog(...a) },
}));

const createKeyHierarchy = jest.fn();
jest.mock('@/services/crypto/keyHierarchy', () => ({
  createKeyHierarchy: (...a: unknown[]) => createKeyHierarchy(...a),
}));

const encryptFileIndex = jest.fn();
const decryptFileIndex = jest.fn();
jest.mock('@/services/crypto', () => ({
  encryptFileIndex: (...a: unknown[]) => encryptFileIndex(...a),
  decryptFileIndex: (...a: unknown[]) => decryptFileIndex(...a),
}));

let idCounter = 0;
jest.mock('@/utils/generateId', () => ({
  generateId: (prefix: string) => `${prefix}-${(++idCounter).toString(16).padStart(8, '0')}`,
}));

const usbService = {
  listDrives: jest.fn(),
  discoverVaults: jest.fn(),
  listVaultFiles: jest.fn(),
};
jest.mock('@/services/usbService', () => ({ usbService }));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  fireAndForget: (p: Promise<unknown>) => {
    if (p && typeof (p as Promise<unknown>).catch === 'function') {
      (p as Promise<unknown>).catch(() => {});
    }
  },
}));

const markVaultLoadTime = jest.fn();
const setPollingCallbacks = jest.fn();
jest.mock('../vaultPolling', () => ({
  markVaultLoadTime: (...a: unknown[]) => markVaultLoadTime(...a),
  setPollingCallbacks: (...a: unknown[]) => setPollingCallbacks(...a),
}));

const scheduleIndexReEncrypt = jest.fn();
jest.mock('../vaultIndexSync', () => ({
  scheduleIndexReEncrypt: (...a: unknown[]) => scheduleIndexReEncrypt(...a),
  cancelAllIndexTimers: jest.fn(),
}));

const vaultOrchestrator = {
  isUnlocked: jest.fn<boolean, []>(() => false),
  getIndex: jest.fn<{ files: Record<string, { name?: string; length?: number }> } | null, []>(
    () => null
  ),
  getActiveVault: jest.fn<{ mountPoint: string } | null, []>(() => null),
};
jest.mock('@/services/vaultOrchestrator', () => ({ vaultOrchestrator }));

// vaultSessionStore is a *different* store — mock it to a minimal controllable shape.
let sessionVaultKey: Uint8Array | null = null;
jest.mock('../vaultSessionStore', () => ({
  useVaultSessionStore: { getState: () => ({ vaultKey: sessionVaultKey }) },
}));

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (k: string) => k },
}));

// Import the stores AFTER all boundary mocks + their closed-over consts are
// declared. ts-jest hoists jest.mock() but not those consts, so importing here
// keeps module-eval order correct. toStoredFileInfo/fromStoredFileInfo are real
// pure transforms. activeVaultStore (a separate trivial store) is used REAL so we
// can verify deleteVault clears the active selection. The eslint-disable prevents
// `import/order` autofix from re-hoisting these above the mocks.
/* eslint-disable import/order, import/first */
import { useVaultListStore } from '../vaultListStore';
import { useActiveVaultStore } from '../activeVaultStore';
/* eslint-enable import/order, import/first */

function vault(over: Partial<VaultInfo> = {}): VaultInfo {
  return {
    id: 'vault-aaaa1111',
    name: 'My Vault',
    encryptedMetadata: '',
    fileCount: 0,
    lastModified: '2026-06-29T00:00:00Z',
    securityLevel: 'standard',
    source: 'local',
    ...over,
  };
}

function file(over: Partial<FileInfo> = {}): FileInfo {
  return {
    id: 'file-0001',
    vaultId: 'vault-aaaa1111',
    name: 'report.pdf',
    size: 1024,
    type: 'pdf',
    modifiedAt: '2026-06-29T00:00:00Z',
    encryptedMetadata: '',
    isPQCProtected: false,
    ...over,
  };
}

const EMPTY = {
  vaultIds: [] as string[],
  vaultsById: {} as Record<string, VaultInfo>,
  vaults: [] as VaultInfo[],
  files: [] as FileInfo[],
  isLoading: false,
  error: null as string | null,
};

function seedVaults(vaults: VaultInfo[]) {
  const byId: Record<string, VaultInfo> = {};
  const ids: string[] = [];
  for (const v of vaults) {
    byId[v.id] = v;
    ids.push(v.id);
  }
  useVaultListStore.setState({ vaultIds: ids, vaultsById: byId, vaults });
}

describe('vaultListStore (web path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    idCounter = 0;
    sessionVaultKey = null;
    localStorage.clear();
    // Make the one-time migration a no-op for most tests: mark it done.
    localStorage.setItem('usbvault:vault_source_migration_v1', 'done');
    useVaultListStore.setState({ ...EMPTY });
    useActiveVaultStore.setState({ activeVaultId: null });
    storageService.loadVaults.mockResolvedValue([]);
    storageService.saveVaults.mockResolvedValue(undefined);
    storageService.deleteVault.mockResolvedValue(undefined);
    storageService.loadFiles.mockResolvedValue([]);
    storageService.deleteFile.mockResolvedValue(undefined);
    storageService.loadEncryptedIndex.mockResolvedValue(null);
    storageService.saveEncryptedIndex.mockResolvedValue(undefined);
    usbService.listDrives.mockResolvedValue([]);
    usbService.discoverVaults.mockResolvedValue([]);
    vaultOrchestrator.isUnlocked.mockReturnValue(false);
  });

  // ── Selectors ───────────────────────────────────────────────────
  describe('selectors', () => {
    it('getVaults denormalizes ids+byId into an ordered array', () => {
      seedVaults([vault({ id: 'a' }), vault({ id: 'b', name: 'Second' })]);
      const got = useVaultListStore.getState().getVaults();
      expect(got.map(v => v.id)).toEqual(['a', 'b']);
    });

    it('getVault returns a single vault by id', () => {
      seedVaults([vault({ id: 'x', name: 'Target' })]);
      expect(useVaultListStore.getState().getVault('x')?.name).toBe('Target');
    });

    it('getVault returns undefined for an unknown id', () => {
      expect(useVaultListStore.getState().getVault('nope')).toBeUndefined();
    });
  });

  // ── createVault ─────────────────────────────────────────────────
  describe('createVault', () => {
    it('inserts a normalized vault and returns its generated id', async () => {
      const id = await useVaultListStore.getState().createVault('Docs', new Uint8Array());

      const s = useVaultListStore.getState();
      expect(s.vaultIds).toContain(id);
      expect(s.vaultsById[id].name).toBe('Docs');
      expect(s.vaultsById[id].securityLevel).toBe('standard');
      expect(s.vaults.map(v => v.id)).toEqual([id]);
      expect(s.isLoading).toBe(false);
    });

    it('persists the new collection and writes an audit log', async () => {
      await useVaultListStore.getState().createVault('Docs', new Uint8Array());
      expect(storageService.saveVaults).toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalledWith('vault_create', 'Docs', expect.any(Object));
    });

    it('appends without dropping existing vaults', async () => {
      seedVaults([vault({ id: 'existing' })]);
      const id = await useVaultListStore.getState().createVault('New', new Uint8Array());
      expect(useVaultListStore.getState().vaultIds).toEqual(['existing', id]);
    });
  });

  // ── createVaultWithKeyHierarchy ──────────────────────────────────
  describe('createVaultWithKeyHierarchy', () => {
    it('stores the wrapped MEK + KEK salt and returns the raw mek', async () => {
      const mek = new Uint8Array(32).fill(4);
      createKeyHierarchy.mockResolvedValue({
        mek,
        wrappedMek: new Uint8Array([1, 2, 3, 4]),
        kekSalt: new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
      });

      const result = await useVaultListStore
        .getState()
        .createVaultWithKeyHierarchy('Secure', new Uint8Array(), 'pw');

      expect(result.mek).toBe(mek);
      const v = useVaultListStore.getState().vaultsById[result.vaultId];
      expect(v.securityLevel).toBe('maximum');
      expect(v.wrappedMekB64).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'));
      expect(v.kekSaltHex).toBe('deadbeef');
      expect(v.hasRecoveryCodes).toBe(false);
    });

    it('maps a key-hierarchy failure into the error state and rethrows', async () => {
      createKeyHierarchy.mockRejectedValue(new Error('Argon2 OOM'));

      await expect(
        useVaultListStore.getState().createVaultWithKeyHierarchy('Secure', new Uint8Array(), 'pw')
      ).rejects.toThrow('Argon2 OOM');

      const s = useVaultListStore.getState();
      expect(s.error).toBe('Argon2 OOM');
      expect(s.isLoading).toBe(false);
    });
  });

  // ── deleteVault ─────────────────────────────────────────────────
  describe('deleteVault', () => {
    it('removes the vault from ids, byId and the denormalized cache', async () => {
      seedVaults([vault({ id: 'a' }), vault({ id: 'b' })]);
      await useVaultListStore.getState().deleteVault('a');

      const s = useVaultListStore.getState();
      expect(s.vaultIds).toEqual(['b']);
      expect(s.vaultsById['a']).toBeUndefined();
      expect(s.vaults.map(v => v.id)).toEqual(['b']);
    });

    it('deletes from storage and writes an audit log', async () => {
      seedVaults([vault({ id: 'a' })]);
      await useVaultListStore.getState().deleteVault('a');
      expect(storageService.deleteVault).toHaveBeenCalledWith('a');
      expect(auditLog).toHaveBeenCalledWith('vault_delete', 'a');
    });

    it('clears the active vault selection when the deleted vault was active', async () => {
      seedVaults([vault({ id: 'a' })]);
      useActiveVaultStore.getState().selectVault('a');

      await useVaultListStore.getState().deleteVault('a');

      expect(useActiveVaultStore.getState().activeVaultId).toBeNull();
    });

    it('leaves a different active selection untouched', async () => {
      seedVaults([vault({ id: 'a' }), vault({ id: 'b' })]);
      useActiveVaultStore.getState().selectVault('b');

      await useVaultListStore.getState().deleteVault('a');

      expect(useActiveVaultStore.getState().activeVaultId).toBe('b');
    });
  });

  // ── renameVault ─────────────────────────────────────────────────
  describe('renameVault', () => {
    it('updates the name and bumps lastModified', async () => {
      seedVaults([vault({ id: 'a', name: 'Old', lastModified: '2020-01-01T00:00:00Z' })]);
      await useVaultListStore.getState().renameVault('a', 'New Name');

      const v = useVaultListStore.getState().vaultsById['a'];
      expect(v.name).toBe('New Name');
      expect(v.lastModified).not.toBe('2020-01-01T00:00:00Z');
    });

    it('refreshes the denormalized cache with the new name', async () => {
      seedVaults([vault({ id: 'a', name: 'Old' })]);
      await useVaultListStore.getState().renameVault('a', 'Renamed');
      expect(useVaultListStore.getState().vaults[0].name).toBe('Renamed');
    });

    it('is a no-op for an unknown vault id (no throw, loading cleared)', async () => {
      await useVaultListStore.getState().renameVault('ghost', 'X');
      expect(useVaultListStore.getState().isLoading).toBe(false);
    });
  });

  // ── clearError ──────────────────────────────────────────────────
  describe('clearError', () => {
    it('resets the error to null', () => {
      useVaultListStore.setState({ error: 'boom' });
      useVaultListStore.getState().clearError();
      expect(useVaultListStore.getState().error).toBeNull();
    });
  });

  // ── _updateVault / _insertVault ─────────────────────────────────
  describe('_updateVault', () => {
    it('patches an existing vault and refreshes the cache', () => {
      seedVaults([vault({ id: 'a', fileCount: 0 })]);
      useVaultListStore.getState()._updateVault('a', { fileCount: 9 });
      expect(useVaultListStore.getState().vaultsById['a'].fileCount).toBe(9);
      expect(useVaultListStore.getState().vaults[0].fileCount).toBe(9);
    });

    it('ignores a patch for an unknown vault', () => {
      useVaultListStore.getState()._updateVault('ghost', { fileCount: 1 });
      expect(useVaultListStore.getState().vaultIds).toEqual([]);
    });
  });

  describe('_insertVault', () => {
    it('adds a new vault', () => {
      useVaultListStore.getState()._insertVault(vault({ id: 'new' }));
      expect(useVaultListStore.getState().vaultIds).toEqual(['new']);
    });

    it('does not duplicate an already-present id but updates byId', () => {
      seedVaults([vault({ id: 'a', name: 'Old' })]);
      useVaultListStore.getState()._insertVault(vault({ id: 'a', name: 'Updated' }));
      const s = useVaultListStore.getState();
      expect(s.vaultIds).toEqual(['a']);
      expect(s.vaultsById['a'].name).toBe('Updated');
    });
  });

  // ── addFile ─────────────────────────────────────────────────────
  describe('addFile', () => {
    it('appends the file and increments the owning vault file count', () => {
      seedVaults([vault({ id: 'vault-aaaa1111', fileCount: 0 })]);
      useVaultListStore.getState().addFile(file());

      const s = useVaultListStore.getState();
      expect(s.files).toHaveLength(1);
      expect(s.vaultsById['vault-aaaa1111'].fileCount).toBe(1);
    });

    it('persists the file blob through storageService.saveFile', () => {
      seedVaults([vault({ id: 'vault-aaaa1111' })]);
      useVaultListStore.getState().addFile(file({ encryptedBlob: new Uint8Array([1, 2]) }));
      expect(storageService.saveFile).toHaveBeenCalled();
    });

    it('schedules an index re-encrypt for the affected vault', () => {
      seedVaults([vault({ id: 'vault-aaaa1111' })]);
      useVaultListStore.getState().addFile(file());
      expect(scheduleIndexReEncrypt).toHaveBeenCalledWith('vault-aaaa1111', expect.any(Function));
    });

    it('appends the file even when the owning vault is not in the collection', () => {
      // No vault present → file count cannot be bumped, but the file still lands.
      useVaultListStore.getState().addFile(file({ vaultId: 'unknown-vault' }));
      expect(useVaultListStore.getState().files).toHaveLength(1);
    });

    it('caches USB vault file metadata to localStorage (without binary blobs)', () => {
      seedVaults([vault({ id: 'usb-7', mountPoint: '/media/usb7' })]);

      useVaultListStore
        .getState()
        .addFile(file({ id: 'uf-1', vaultId: 'usb-7', encryptedBlob: new Uint8Array([9, 9, 9]) }));

      const raw = localStorage.getItem('usbvault:usb_file_cache');
      expect(raw).not.toBeNull();
      const entries = JSON.parse(raw!);
      const entry = entries.find((e: { vaultId: string }) => e.vaultId === 'usb-7');
      expect(entry.files[0].id).toBe('uf-1');
      // Binary blob must be stripped before caching.
      expect(entry.files[0].encryptedBlob).toBeUndefined();
    });
  });

  // ── deleteFile ──────────────────────────────────────────────────
  describe('deleteFile', () => {
    it('removes the file, decrements the count, and clears loading', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111', fileCount: 2 })]);
      useVaultListStore.setState({ files: [file({ id: 'file-0001' }), file({ id: 'file-0002' })] });

      await useVaultListStore.getState().deleteFile('vault-aaaa1111', 'file-0001');

      const s = useVaultListStore.getState();
      expect(s.files.map(f => f.id)).toEqual(['file-0002']);
      expect(s.vaultsById['vault-aaaa1111'].fileCount).toBe(1);
      expect(s.isLoading).toBe(false);
      expect(storageService.deleteFile).toHaveBeenCalledWith('vault-aaaa1111', 'file-0001');
    });

    it('never drives the file count below zero', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111', fileCount: 0 })]);
      useVaultListStore.setState({ files: [file({ id: 'file-0001' })] });

      await useVaultListStore.getState().deleteFile('vault-aaaa1111', 'file-0001');

      expect(useVaultListStore.getState().vaultsById['vault-aaaa1111'].fileCount).toBe(0);
    });

    it('maps a storage failure into the error state and rethrows', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111', fileCount: 1 })]);
      storageService.deleteFile.mockRejectedValue(new Error('disk full'));

      await expect(
        useVaultListStore.getState().deleteFile('vault-aaaa1111', 'file-0001')
      ).rejects.toThrow('disk full');
      expect(useVaultListStore.getState().error).toBe('disk full');
    });
  });

  // ── loadFiles ───────────────────────────────────────────────────
  describe('loadFiles', () => {
    it('decrypts the encrypted index when a session vaultKey is present', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111' })]);
      sessionVaultKey = new Uint8Array(32).fill(1);
      storageService.loadEncryptedIndex.mockResolvedValue('encrypted-blob');
      const stored: StoredFileInfo[] = [
        {
          id: 'file-0001',
          vaultId: 'vault-aaaa1111',
          name: 'a.txt',
          size: 5,
          type: 'txt',
          modifiedAt: '2026-06-29T00:00:00Z',
          encryptedMetadata: '',
          isPQCProtected: false,
          hasBlobStored: false,
        } as StoredFileInfo,
      ];
      decryptFileIndex.mockResolvedValue(stored);

      await useVaultListStore.getState().loadFiles('vault-aaaa1111');

      expect(decryptFileIndex).toHaveBeenCalledWith(sessionVaultKey, 'encrypted-blob');
      expect(useVaultListStore.getState().files.map(f => f.id)).toEqual(['file-0001']);
    });

    it('falls back to plaintext stored files and migrates them to encrypted storage', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111' })]);
      sessionVaultKey = new Uint8Array(32).fill(2);
      storageService.loadEncryptedIndex.mockResolvedValue(null);
      storageService.loadFiles.mockResolvedValue([
        {
          id: 'file-0009',
          vaultId: 'vault-aaaa1111',
          name: 'legacy.txt',
          size: 3,
          type: 'txt',
          modifiedAt: '2026-06-29T00:00:00Z',
          encryptedMetadata: '',
          isPQCProtected: false,
          hasBlobStored: false,
        } as StoredFileInfo,
      ]);
      encryptFileIndex.mockResolvedValue('newly-encrypted');

      await useVaultListStore.getState().loadFiles('vault-aaaa1111');

      expect(useVaultListStore.getState().files.map(f => f.id)).toEqual(['file-0009']);
      expect(storageService.saveEncryptedIndex).toHaveBeenCalledWith(
        'vault-aaaa1111',
        'newly-encrypted'
      );
    });

    it('sets an empty file list when there are no stored files', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111' })]);
      storageService.loadFiles.mockResolvedValue([]);

      await useVaultListStore.getState().loadFiles('vault-aaaa1111');

      expect(useVaultListStore.getState().files).toEqual([]);
    });

    it('loads files from the USB companion for a mounted USB vault', async () => {
      seedVaults([vault({ id: 'usb-1', mountPoint: '/media/usb0' })]);
      usbService.listVaultFiles.mockResolvedValue([
        { id: 'uf1', name: 'photo.png', size: 200, createdAt: '2026-06-29T00:00:00Z' },
      ]);

      await useVaultListStore.getState().loadFiles('usb-1');

      const s = useVaultListStore.getState();
      expect(usbService.listVaultFiles).toHaveBeenCalledWith('usb-1');
      expect(s.files).toHaveLength(1);
      expect(s.files[0].type).toBe('png');
    });

    it('falls back to local storage when the USB companion file listing fails', async () => {
      seedVaults([vault({ id: 'usb-2', mountPoint: '/media/usb2' })]);
      usbService.listVaultFiles.mockRejectedValue(new Error('drive ejected'));
      storageService.loadFiles.mockResolvedValue([
        {
          id: 'local-fb',
          vaultId: 'usb-2',
          name: 'local.txt',
          size: 1,
          type: 'txt',
          modifiedAt: '2026-06-29T00:00:00Z',
          encryptedMetadata: '',
          isPQCProtected: false,
        } as StoredFileInfo,
      ]);

      await useVaultListStore.getState().loadFiles('usb-2');

      expect(useVaultListStore.getState().files.map(f => f.id)).toEqual(['local-fb']);
    });

    it('falls through to the legacy plaintext path when index decryption returns null', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111' })]);
      sessionVaultKey = new Uint8Array(32).fill(3);
      storageService.loadEncryptedIndex.mockResolvedValue('encrypted-blob');
      decryptFileIndex.mockResolvedValue(null); // decryption failed
      storageService.loadFiles.mockResolvedValue([
        {
          id: 'legacy-1',
          vaultId: 'vault-aaaa1111',
          name: 'old.txt',
          size: 2,
          type: 'txt',
          modifiedAt: '2026-06-29T00:00:00Z',
          encryptedMetadata: '',
          isPQCProtected: false,
        } as StoredFileInfo,
      ]);
      encryptFileIndex.mockResolvedValue('re-encrypted');

      await useVaultListStore.getState().loadFiles('vault-aaaa1111');

      expect(useVaultListStore.getState().files.map(f => f.id)).toEqual(['legacy-1']);
    });

    it('recovers to an empty file list when loading throws', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111' })]);
      storageService.loadFiles.mockRejectedValue(new Error('index corrupt'));

      await useVaultListStore.getState().loadFiles('vault-aaaa1111');

      expect(useVaultListStore.getState().files).toEqual([]);
      expect(useVaultListStore.getState().error).toBeNull();
    });
  });

  // ── loadVaults ──────────────────────────────────────────────────
  describe('loadVaults', () => {
    it('merges discovered USB vaults with local-only stored vaults', async () => {
      usbService.discoverVaults.mockResolvedValue([
        {
          driveId: 'drive-1',
          driveName: 'SanDisk',
          partitions: [{ hasVault: true, label: 'Vault A', mountPoint: '/media/usb0' }],
        },
      ]);
      storageService.loadVaults.mockResolvedValue([
        vault({ id: 'local-1', name: 'Local One', source: 'local' }),
        vault({ id: 'untagged', name: 'Stale USB', source: undefined }),
      ]);

      await useVaultListStore.getState().loadVaults();

      const s = useVaultListStore.getState();
      // drive-1 (USB) + local-1 (tagged local); 'untagged' is excluded.
      expect(s.vaultIds).toContain('drive-1');
      expect(s.vaultIds).toContain('local-1');
      expect(s.vaultIds).not.toContain('untagged');
      expect(s.isLoading).toBe(false);
      expect(markVaultLoadTime).toHaveBeenCalled();
    });

    it('restores cached USB file metadata when the orchestrator is locked', async () => {
      usbService.discoverVaults.mockResolvedValue([
        {
          driveId: 'drive-9',
          driveName: 'Kingston',
          partitions: [{ hasVault: true, label: 'V', mountPoint: '/media/usb9' }],
        },
      ]);
      vaultOrchestrator.isUnlocked.mockReturnValue(false);
      localStorage.setItem(
        'usbvault:usb_file_cache',
        JSON.stringify([{ vaultId: 'drive-9', files: [file({ id: 'cached-1' })] }])
      );

      await useVaultListStore.getState().loadVaults();

      expect(useVaultListStore.getState().files.map(f => f.id)).toContain('cached-1');
    });

    it('falls back to stored local vaults when discovery throws', async () => {
      usbService.discoverVaults.mockRejectedValue(new Error('companion down'));
      usbService.listDrives.mockRejectedValue(new Error('companion down'));
      // loadVaults is called twice: once in the try, once in the catch fallback.
      storageService.loadVaults.mockResolvedValue([vault({ id: 'fallback-1', source: 'local' })]);

      await useVaultListStore.getState().loadVaults();

      // Even on the happy path discovery returning nothing, local-only vaults load.
      expect(useVaultListStore.getState().isLoading).toBe(false);
      expect(useVaultListStore.getState().vaultIds).toContain('fallback-1');
    });

    it('adds a drive-level vault when a discovered drive has no vault partitions', async () => {
      usbService.discoverVaults.mockResolvedValue([
        { driveId: 'drive-bare', driveName: 'Bare Drive', partitions: [] },
      ]);

      await useVaultListStore.getState().loadVaults();

      const v = useVaultListStore.getState().vaultsById['drive-bare'];
      expect(v).toBeDefined();
      expect(v.name).toBe('Bare Drive');
      expect(v.securityLevel).toBe('maximum');
    });

    it('adds a vault for a listDrives drive flagged hasVault that discovery missed', async () => {
      usbService.discoverVaults.mockResolvedValue([]);
      usbService.listDrives.mockResolvedValue([
        {
          id: 'phys-1',
          name: 'Lexar',
          hasVault: true,
          partitions: [{ mountpoint: '/media/lexar', fstype: 'exfat' }],
        },
      ]);

      await useVaultListStore.getState().loadVaults();

      const v = useVaultListStore.getState().vaultsById['usb-phys-1'];
      expect(v).toBeDefined();
      expect(v.mountPoint).toBe('/media/lexar');
      expect(v.fileSystem).toBe('exfat');
    });

    it('syncs decrypted index entries from the orchestrator when it is unlocked', async () => {
      usbService.discoverVaults.mockResolvedValue([
        {
          driveId: 'drive-u',
          driveName: 'Unlocked',
          partitions: [{ hasVault: true, label: 'UV', mountPoint: '/media/unlocked' }],
        },
      ]);
      vaultOrchestrator.isUnlocked.mockReturnValue(true);
      vaultOrchestrator.getActiveVault.mockReturnValue({ mountPoint: '/media/unlocked' });
      vaultOrchestrator.getIndex.mockReturnValue({
        files: {
          'file-xyz': { name: 'invoice.pdf', length: 4096 },
        },
      });

      await useVaultListStore.getState().loadVaults();

      const restored = useVaultListStore.getState().files;
      expect(restored).toHaveLength(1);
      expect(restored[0].id).toBe('file-xyz');
      expect(restored[0].name).toBe('invoice.pdf');
      expect(restored[0].vaultId).toBe('drive-u');
      expect(restored[0].type).toBe('pdf');
    });

    it('runs the one-time source migration on first load (purging untagged USB entries)', async () => {
      localStorage.removeItem('usbvault:vault_source_migration_v1');
      // First loadVaults() call inside migration, then again in the main body.
      storageService.loadVaults.mockResolvedValue([
        vault({ id: '1710000000000-abc123', source: undefined }), // local-pattern id → kept
        vault({ id: 'stale-usb-uuid', source: undefined }), // not local → purged
      ]);

      await useVaultListStore.getState().loadVaults();

      // Migration re-saved only the locally-created vault, tagged source:'local'.
      expect(storageService.saveVaults).toHaveBeenCalled();
      const saved = storageService.saveVaults.mock.calls[0][0] as VaultInfo[];
      expect(saved.map(v => v.id)).toEqual(['1710000000000-abc123']);
      expect(saved[0].source).toBe('local');
      expect(localStorage.getItem('usbvault:vault_source_migration_v1')).toBe('done');
    });

    it('recovers to an empty collection when every storage read fails', async () => {
      // discoverVaults throws → enters catch; the fallback loadVaults also throws
      // → inner catch sets the empty state.
      usbService.discoverVaults.mockRejectedValue(new Error('down'));
      storageService.loadVaults.mockRejectedValue(new Error('storage gone'));

      await useVaultListStore.getState().loadVaults();

      const s = useVaultListStore.getState();
      expect(s.vaultIds).toEqual([]);
      expect(s.isLoading).toBe(false);
      expect(s.error).toBeNull();
    });
  });

  // ── exportVault ─────────────────────────────────────────────────
  describe('exportVault', () => {
    let clickSpy: jest.SpyInstance;
    beforeEach(() => {
      clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });
    afterEach(() => clickSpy.mockRestore());

    it('builds a manifest with an integrity hash and triggers a download', async () => {
      seedVaults([vault({ id: 'vault-aaaa1111', name: 'Export Me' })]);
      storageService.loadFiles.mockResolvedValue([
        {
          id: 'file-0001',
          name: 'a.txt',
          size: 5,
          type: 'txt',
          modifiedAt: '2026-06-29T00:00:00Z',
          encryptedMetadata: '',
          isPQCProtected: false,
        } as StoredFileInfo,
      ]);

      await useVaultListStore.getState().exportVault('vault-aaaa1111');

      expect(clickSpy).toHaveBeenCalled();
      expect(auditLog).toHaveBeenCalledWith(
        'vault_export',
        'vault-aaaa1111',
        expect.objectContaining({ fileCount: 1 })
      );
      expect(useVaultListStore.getState().isLoading).toBe(false);
    });

    it('errors and rethrows when the vault does not exist', async () => {
      await expect(useVaultListStore.getState().exportVault('ghost')).rejects.toThrow(
        'Vault not found'
      );
      expect(useVaultListStore.getState().error).toBe('Vault not found');
    });
  });
});
