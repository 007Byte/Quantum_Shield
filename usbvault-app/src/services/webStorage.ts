/**
 * USBVault Web Storage Service
 *
 * Persistent storage layer for the web platform.
 * - localStorage for vault metadata (small JSON)
 * - IndexedDB for encrypted file blobs (large binary data)
 *
 * This replaces the in-memory mock data on web, allowing vaults and
 * files to survive page refreshes.
 *
 * @module services/webStorage
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

// PL-005: Import canonical types from shared domain module (no more mirrored definitions)
import type { VaultInfo, StoredFileInfo } from '@/types/domain';

// PL-005: StoredVaultInfo is now just VaultInfo — same shape, no need for a separate type
type StoredVaultInfo = VaultInfo;

// ─── Constants ───────────────────────────────────────────────────────

const LS_VAULTS_KEY = 'usbvault:vaults';
const IDB_NAME = 'usbvault_db';
const IDB_VERSION = 2; // Bumped for SG-003 encrypted index store
const IDB_FILE_STORE = 'encrypted_files';
const IDB_META_STORE = 'file_metadata';
/** SG-003: Store for encrypted vault index blobs (one per vault) */
const IDB_INDEX_STORE = 'encrypted_indexes';

// ─── IndexedDB Helper ────────────────────────────────────────────────

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Store for encrypted file blobs
      if (!db.objectStoreNames.contains(IDB_FILE_STORE)) {
        db.createObjectStore(IDB_FILE_STORE);
      }

      // Store for file metadata (keyed by vaultId) — legacy plaintext, migrating to encrypted
      if (!db.objectStoreNames.contains(IDB_META_STORE)) {
        const metaStore = db.createObjectStore(IDB_META_STORE);
        metaStore.createIndex('vaultId', 'vaultId', { unique: false });
      }

      // SG-003: Store for encrypted vault index blobs (one opaque blob per vault)
      if (!db.objectStoreNames.contains(IDB_INDEX_STORE)) {
        db.createObjectStore(IDB_INDEX_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAllByIndex<T>(
  db: IDBDatabase,
  store: string,
  indexName: string,
  value: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const idx = tx.objectStore(store).index(indexName);
    const req = idx.getAll(value);
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function idbClearStore(db: IDBDatabase, store: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── localStorage Helpers ────────────────────────────────────────────

function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.error('[webStorage] localStorage write failed:', e);
  }
}

function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

// ─── Web Storage Service ─────────────────────────────────────────────

class WebStorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDatabase();
    }
    return this.dbPromise;
  }

  /**
   * Check if web storage is available (only on web platform).
   */
  isAvailable(): boolean {
    return Platform.OS === 'web' && typeof localStorage !== 'undefined';
  }

  // ── Vault Operations ──

  /**
   * Load all vaults from localStorage.
   */
  async loadVaults(): Promise<StoredVaultInfo[]> {
    if (!this.isAvailable()) return [];
    return lsGet<StoredVaultInfo[]>(LS_VAULTS_KEY) || [];
  }

  /**
   * Save all vaults to localStorage.
   */
  async saveVaults(vaults: StoredVaultInfo[]): Promise<void> {
    if (!this.isAvailable()) return;
    lsSet(LS_VAULTS_KEY, vaults);
  }

  /**
   * Delete a vault and all its files from both localStorage and IndexedDB.
   */
  async deleteVault(vaultId: string): Promise<void> {
    if (!this.isAvailable()) return;

    // Remove from vault list
    const vaults = await this.loadVaults();
    const filtered = vaults.filter(v => v.id !== vaultId);
    await this.saveVaults(filtered);

    // Remove all files for this vault from IndexedDB
    try {
      const db = await this.getDB();
      const files = await idbGetAllByIndex<StoredFileInfo>(db, IDB_META_STORE, 'vaultId', vaultId);
      for (const file of files) {
        const blobKey = `${vaultId}:${file.id}`;
        await idbDelete(db, IDB_FILE_STORE, blobKey);
        await idbDelete(db, IDB_META_STORE, blobKey);
      }
      // SG-003: Also remove the encrypted index blob
      await idbDelete(db, IDB_INDEX_STORE, vaultId);
    } catch (e) {
      logger.error('[webStorage] Failed to clean up vault files:', e);
    }
  }

  // ── File Operations ──

  /**
   * Load file metadata for a vault from IndexedDB.
   */
  async loadFiles(vaultId: string): Promise<StoredFileInfo[]> {
    if (!this.isAvailable()) return [];

    try {
      const db = await this.getDB();
      return await idbGetAllByIndex<StoredFileInfo>(db, IDB_META_STORE, 'vaultId', vaultId);
    } catch (e) {
      logger.error('[webStorage] Failed to load files:', e);
      return [];
    }
  }

  /**
   * Save a file's metadata and optionally its encrypted blob.
   */
  async saveFile(fileInfo: StoredFileInfo, encryptedBlob?: Uint8Array): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const db = await this.getDB();
      const key = `${fileInfo.vaultId}:${fileInfo.id}`;

      // Store metadata
      const meta: StoredFileInfo = {
        ...fileInfo,
        hasBlobStored: !!encryptedBlob,
      };
      await idbPut(db, IDB_META_STORE, key, meta);

      // Store encrypted blob separately (large binary data)
      if (encryptedBlob) {
        await idbPut(db, IDB_FILE_STORE, key, encryptedBlob);
      }

      // Update vault file count
      const vaults = await this.loadVaults();
      const vault = vaults.find(v => v.id === fileInfo.vaultId);
      if (vault) {
        const allFiles = await this.loadFiles(fileInfo.vaultId);
        vault.fileCount = allFiles.length;
        vault.lastModified = new Date().toISOString();
        await this.saveVaults(vaults);
      }
    } catch (e) {
      logger.error('[webStorage] Failed to save file:', e);
    }
  }

  /**
   * Get an encrypted blob for a file.
   */
  async getEncryptedBlob(vaultId: string, fileId: string): Promise<Uint8Array | null> {
    if (!this.isAvailable()) return null;

    try {
      const db = await this.getDB();
      const key = `${vaultId}:${fileId}`;
      const blob = await idbGet<Uint8Array>(db, IDB_FILE_STORE, key);
      return blob || null;
    } catch (e) {
      logger.error('[webStorage] Failed to get encrypted blob:', e);
      return null;
    }
  }

  /**
   * Delete a file's metadata and encrypted blob.
   */
  async deleteFile(vaultId: string, fileId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const db = await this.getDB();
      const key = `${vaultId}:${fileId}`;
      await idbDelete(db, IDB_META_STORE, key);
      await idbDelete(db, IDB_FILE_STORE, key);

      // Update vault file count
      const vaults = await this.loadVaults();
      const vault = vaults.find(v => v.id === vaultId);
      if (vault) {
        const remainingFiles = await this.loadFiles(vaultId);
        vault.fileCount = remainingFiles.length;
        await this.saveVaults(vaults);
      }
    } catch (e) {
      logger.error('[webStorage] Failed to delete file:', e);
    }
  }

  // ── Encrypted Index Operations (SG-003) ──

  /**
   * Save an encrypted vault index blob for a vault.
   * The blob is an opaque base64-encoded AEAD ciphertext containing all file metadata.
   * No plaintext file names, sizes, or types are stored.
   */
  async saveEncryptedIndex(vaultId: string, encryptedBase64: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const db = await this.getDB();
      await idbPut(db, IDB_INDEX_STORE, vaultId, encryptedBase64);
    } catch (e) {
      logger.error('[webStorage] Failed to save encrypted index:', e);
    }
  }

  /**
   * Load an encrypted vault index blob for a vault.
   * Returns null if no encrypted index exists (vault may use legacy plaintext storage).
   */
  async loadEncryptedIndex(vaultId: string): Promise<string | null> {
    if (!this.isAvailable()) return null;

    try {
      const db = await this.getDB();
      const blob = await idbGet<string>(db, IDB_INDEX_STORE, vaultId);
      return blob ?? null;
    } catch (e) {
      logger.error('[webStorage] Failed to load encrypted index:', e);
      return null;
    }
  }

  /**
   * Delete the encrypted index blob for a vault.
   */
  async deleteEncryptedIndex(vaultId: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const db = await this.getDB();
      await idbDelete(db, IDB_INDEX_STORE, vaultId);
    } catch (e) {
      logger.error('[webStorage] Failed to delete encrypted index:', e);
    }
  }

  /**
   * Check if a vault has an encrypted index (vs legacy plaintext metadata).
   * Used during the migration period to determine which load path to use.
   */
  async hasEncryptedIndex(vaultId: string): Promise<boolean> {
    if (!this.isAvailable()) return false;

    try {
      const db = await this.getDB();
      const blob = await idbGet<string>(db, IDB_INDEX_STORE, vaultId);
      return blob !== undefined && blob !== null;
    } catch {
      return false;
    }
  }

  // ── Clear All ──

  /**
   * Clear all stored data (for logout).
   */
  async clear(): Promise<void> {
    if (!this.isAvailable()) return;

    lsRemove(LS_VAULTS_KEY);

    try {
      const db = await this.getDB();
      await idbClearStore(db, IDB_FILE_STORE);
      await idbClearStore(db, IDB_META_STORE);
      await idbClearStore(db, IDB_INDEX_STORE);
    } catch (e) {
      logger.error('[webStorage] Failed to clear IndexedDB:', e);
    }
  }

  /**
   * Check if any vaults have been stored (vs first-time empty state).
   */
  async hasStoredData(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    const vaults = await this.loadVaults();
    return vaults.length > 0;
  }
}

// Singleton instance
export const webStorage = new WebStorageService();
