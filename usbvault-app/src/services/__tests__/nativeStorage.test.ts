/**
 * Native Storage Service Tests
 *
 * Verifies the AsyncStorage + expo-file-system-backed persistence layer:
 * vault CRUD, file metadata upsert + dedupe, blob write/read round-trips via a
 * stateful FileSystem mock, file-count bookkeeping on the parent vault, encrypted
 * index ops, and clear(). AsyncStorage and expo-file-system/legacy are replaced
 * with stateful in-memory fakes so we assert REAL stored data, not mock calls.
 */

import { nativeStorage } from '../nativeStorage';

// ── Stateful AsyncStorage fake (the storage boundary) ──
const asyncStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(asyncStore[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      asyncStore[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete asyncStore[key];
      return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(asyncStore))),
    multiRemove: jest.fn((keys: string[]) => {
      keys.forEach(k => delete asyncStore[k]);
      return Promise.resolve();
    }),
  },
}));

// ── Stateful expo-file-system/legacy fake (the blob filesystem boundary) ──
const fsFiles: Record<string, string> = {}; // path → base64 contents
const fsDirs = new Set<string>();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock/documents/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: jest.fn((path: string) => {
    // A path "exists" if it is a known file, a known directory, or any stored
    // file/dir lives beneath it (so a directory with seeded blobs reports true).
    const exists =
      Object.prototype.hasOwnProperty.call(fsFiles, path) ||
      fsDirs.has(path) ||
      Object.keys(fsFiles).some(p => p.startsWith(path)) ||
      [...fsDirs].some(d => d.startsWith(path));
    return Promise.resolve({ exists, uri: path });
  }),
  makeDirectoryAsync: jest.fn((dir: string) => {
    fsDirs.add(dir);
    return Promise.resolve();
  }),
  writeAsStringAsync: jest.fn((path: string, contents: string) => {
    fsFiles[path] = contents;
    return Promise.resolve();
  }),
  readAsStringAsync: jest.fn((path: string) => {
    if (!Object.prototype.hasOwnProperty.call(fsFiles, path)) {
      return Promise.reject(new Error('ENOENT'));
    }
    return Promise.resolve(fsFiles[path]);
  }),
  deleteAsync: jest.fn((path: string) => {
    delete fsFiles[path];
    fsDirs.delete(path);
    // Delete anything under a directory path.
    Object.keys(fsFiles).forEach(p => {
      if (p.startsWith(path)) delete fsFiles[p];
    });
    return Promise.resolve();
  }),
}));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn(), log: jest.fn(), warn: jest.fn() },
}));

function makeVault(id: string, extra: Record<string, unknown> = {}): any {
  return {
    id,
    name: `Vault ${id}`,
    encryptedMetadata: 'bWV0YQ==',
    fileCount: 0,
    lastModified: '2026-01-01T00:00:00.000Z',
    securityLevel: 'standard',
    ...extra,
  };
}

function makeFile(vaultId: string, id: string, extra: Record<string, unknown> = {}): any {
  return {
    id,
    vaultId,
    name: `${id}.txt`,
    size: 10,
    hasBlobStored: false,
    ...extra,
  };
}

describe('NativeStorageService', () => {
  beforeEach(() => {
    Object.keys(asyncStore).forEach(k => delete asyncStore[k]);
    Object.keys(fsFiles).forEach(k => delete fsFiles[k]);
    fsDirs.clear();
    jest.clearAllMocks();
  });

  describe('vault operations', () => {
    it('loadVaults returns [] when nothing is stored', async () => {
      await expect(nativeStorage.loadVaults()).resolves.toEqual([]);
    });

    it('saveVaults persists and loadVaults round-trips', async () => {
      const vaults = [makeVault('v1'), makeVault('v2')];
      await nativeStorage.saveVaults(vaults);

      expect(JSON.parse(asyncStore['usbvault:vaults'])).toHaveLength(2);
      const loaded = await nativeStorage.loadVaults();
      expect(loaded.map(v => v.id)).toEqual(['v1', 'v2']);
    });

    it('loadVaults returns [] when stored JSON is malformed', async () => {
      asyncStore['usbvault:vaults'] = '{not-valid';
      await expect(nativeStorage.loadVaults()).resolves.toEqual([]);
    });

    it('deleteVault removes the vault and its file/index keys and blob dir', async () => {
      await nativeStorage.saveVaults([makeVault('v1'), makeVault('v2')]);
      asyncStore['usbvault:files:v1'] = JSON.stringify([makeFile('v1', 'f1')]);
      asyncStore['usbvault:index:v1'] = JSON.stringify('idxblob');
      // Seed a blob so the directory "exists" and gets deleted.
      fsFiles['/mock/documents/usbvault/blobs/v1/f1'] = 'YmxvYg==';

      await nativeStorage.deleteVault('v1');

      const remaining = await nativeStorage.loadVaults();
      expect(remaining.map(v => v.id)).toEqual(['v2']);
      expect(asyncStore['usbvault:files:v1']).toBeUndefined();
      expect(asyncStore['usbvault:index:v1']).toBeUndefined();
      expect(fsFiles['/mock/documents/usbvault/blobs/v1/f1']).toBeUndefined();
    });

    it('hasStoredData reflects whether vaults exist', async () => {
      await expect(nativeStorage.hasStoredData()).resolves.toBe(false);
      await nativeStorage.saveVaults([makeVault('v1')]);
      await expect(nativeStorage.hasStoredData()).resolves.toBe(true);
    });
  });

  describe('file operations', () => {
    it('loadFiles returns [] for an unknown vault', async () => {
      await expect(nativeStorage.loadFiles('nope')).resolves.toEqual([]);
    });

    it('saveFile appends new metadata and updates parent vault fileCount', async () => {
      await nativeStorage.saveVaults([makeVault('v1')]);
      await nativeStorage.saveFile(makeFile('v1', 'f1'));

      const files = await nativeStorage.loadFiles('v1');
      expect(files).toHaveLength(1);
      expect(files[0].id).toBe('f1');

      const vault = (await nativeStorage.loadVaults())[0];
      expect(vault.fileCount).toBe(1);
      expect(vault.lastModified).not.toBe('2026-01-01T00:00:00.000Z'); // bumped
    });

    it('saveFile upserts in place rather than duplicating an existing file id', async () => {
      await nativeStorage.saveVaults([makeVault('v1')]);
      await nativeStorage.saveFile(makeFile('v1', 'f1', { name: 'first.txt' }));
      await nativeStorage.saveFile(makeFile('v1', 'f1', { name: 'renamed.txt' }));

      const files = await nativeStorage.loadFiles('v1');
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('renamed.txt');
      expect((await nativeStorage.loadVaults())[0].fileCount).toBe(1);
    });

    it('saveFile writes the encrypted blob and marks hasBlobStored', async () => {
      await nativeStorage.saveVaults([makeVault('v1')]);
      const blob = new Uint8Array([1, 2, 3, 4, 250, 251]);
      await nativeStorage.saveFile(makeFile('v1', 'f1'), blob);

      const files = await nativeStorage.loadFiles('v1');
      expect(files[0].hasBlobStored).toBe(true);
      const path = '/mock/documents/usbvault/blobs/v1/f1';
      expect(fsFiles[path]).toBe(Buffer.from(blob).toString('base64'));
    });

    it('getEncryptedBlob round-trips the exact bytes written by saveFile', async () => {
      await nativeStorage.saveVaults([makeVault('v1')]);
      const blob = new Uint8Array([9, 8, 7, 0, 255, 128]);
      await nativeStorage.saveFile(makeFile('v1', 'f1'), blob);

      const read = await nativeStorage.getEncryptedBlob('v1', 'f1');
      expect(read).not.toBeNull();
      expect(Array.from(read!)).toEqual(Array.from(blob));
    });

    it('getEncryptedBlob returns null when no blob exists', async () => {
      await expect(nativeStorage.getEncryptedBlob('v1', 'missing')).resolves.toBeNull();
    });

    it('deleteFile removes metadata, its blob, and decrements fileCount', async () => {
      await nativeStorage.saveVaults([makeVault('v1')]);
      await nativeStorage.saveFile(makeFile('v1', 'f1'), new Uint8Array([1, 2, 3]));
      await nativeStorage.saveFile(makeFile('v1', 'f2'), new Uint8Array([4, 5, 6]));
      expect((await nativeStorage.loadVaults())[0].fileCount).toBe(2);

      await nativeStorage.deleteFile('v1', 'f1');

      const files = await nativeStorage.loadFiles('v1');
      expect(files.map(f => f.id)).toEqual(['f2']);
      expect(fsFiles['/mock/documents/usbvault/blobs/v1/f1']).toBeUndefined();
      expect(fsFiles['/mock/documents/usbvault/blobs/v1/f2']).toBeDefined();
      expect((await nativeStorage.loadVaults())[0].fileCount).toBe(1);
    });
  });

  describe('encrypted index operations', () => {
    it('save / load / has / delete round-trip an index blob', async () => {
      expect(await nativeStorage.hasEncryptedIndex('v1')).toBe(false);
      expect(await nativeStorage.loadEncryptedIndex('v1')).toBeNull();

      await nativeStorage.saveEncryptedIndex('v1', 'ZW5jcnlwdGVkLWluZGV4');
      expect(await nativeStorage.hasEncryptedIndex('v1')).toBe(true);
      expect(await nativeStorage.loadEncryptedIndex('v1')).toBe('ZW5jcnlwdGVkLWluZGV4');

      await nativeStorage.deleteEncryptedIndex('v1');
      expect(await nativeStorage.hasEncryptedIndex('v1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes vault list, prefixed file/index keys, and the blob directory', async () => {
      await nativeStorage.saveVaults([makeVault('v1')]);
      asyncStore['usbvault:files:v1'] = JSON.stringify([makeFile('v1', 'f1')]);
      asyncStore['usbvault:index:v1'] = JSON.stringify('idx');
      asyncStore['unrelated:key'] = 'keep-me';
      fsFiles['/mock/documents/usbvault/blobs/v1/f1'] = 'YmxvYg==';

      await nativeStorage.clear();

      expect(asyncStore['usbvault:vaults']).toBeUndefined();
      expect(asyncStore['usbvault:files:v1']).toBeUndefined();
      expect(asyncStore['usbvault:index:v1']).toBeUndefined();
      expect(asyncStore['unrelated:key']).toBe('keep-me'); // non-prefixed keys untouched
      expect(fsFiles['/mock/documents/usbvault/blobs/v1/f1']).toBeUndefined();
    });
  });
});
