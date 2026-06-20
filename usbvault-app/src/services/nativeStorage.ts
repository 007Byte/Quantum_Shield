/**
 * USBVault Native Storage Service
 *
 * Persistent storage layer for iOS/Android platforms.
 * - AsyncStorage for vault metadata (small JSON)
 * - expo-file-system for encrypted file blobs (large binary data)
 *
 * Mirrors the webStorage.ts interface so storageService.ts can delegate
 * transparently based on Platform.OS.
 *
 * @module services/nativeStorage
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import type { VaultInfo, StoredFileInfo } from '@/types/domain';
import { logger } from '@/utils/logger';

// ─── Constants ───────────────────────────────────────────────────────

const AS_VAULTS_KEY = 'usbvault:vaults';
const AS_FILES_PREFIX = 'usbvault:files:'; // per-vault file metadata
const AS_INDEX_PREFIX = 'usbvault:index:'; // encrypted index blobs

/** Root directory for encrypted blobs on the device */
function blobDir(): string {
  return `${FileSystem.documentDirectory}usbvault/blobs/`;
}

function blobPath(vaultId: string, fileId: string): string {
  return `${blobDir()}${vaultId}/${fileId}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function asGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function asSet<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.error('[nativeStorage] AsyncStorage write failed:', e);
  }
}

async function asRemove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

// ─── Native Storage Service ──────────────────────────────────────────

class NativeStorageService {
  // ── Vault Operations ──

  async loadVaults(): Promise<VaultInfo[]> {
    return (await asGet<VaultInfo[]>(AS_VAULTS_KEY)) || [];
  }

  async saveVaults(vaults: VaultInfo[]): Promise<void> {
    await asSet(AS_VAULTS_KEY, vaults);
  }

  async deleteVault(vaultId: string): Promise<void> {
    // Remove from vault list
    const vaults = await this.loadVaults();
    const filtered = vaults.filter(v => v.id !== vaultId);
    await this.saveVaults(filtered);

    // Remove file metadata
    await asRemove(`${AS_FILES_PREFIX}${vaultId}`);

    // Remove encrypted index
    await asRemove(`${AS_INDEX_PREFIX}${vaultId}`);

    // Remove blob directory for this vault
    try {
      const dir = `${blobDir()}${vaultId}/`;
      const info = await FileSystem.getInfoAsync(dir);
      if (info.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
      }
    } catch (e) {
      logger.error('[nativeStorage] Failed to clean up vault blobs:', e);
    }
  }

  // ── File Operations ──

  async loadFiles(vaultId: string): Promise<StoredFileInfo[]> {
    return (await asGet<StoredFileInfo[]>(`${AS_FILES_PREFIX}${vaultId}`)) || [];
  }

  async saveFile(fileInfo: StoredFileInfo, encryptedBlob?: Uint8Array): Promise<void> {
    // Store metadata in AsyncStorage
    const files = await this.loadFiles(fileInfo.vaultId);
    const key = `${fileInfo.vaultId}:${fileInfo.id}`;
    const existing = files.findIndex(f => `${f.vaultId}:${f.id}` === key);

    const meta: StoredFileInfo = {
      ...fileInfo,
      hasBlobStored: !!encryptedBlob || fileInfo.hasBlobStored,
    };

    if (existing >= 0) {
      files[existing] = meta;
    } else {
      files.push(meta);
    }
    await asSet(`${AS_FILES_PREFIX}${fileInfo.vaultId}`, files);

    // Store encrypted blob as base64 file
    if (encryptedBlob) {
      const path = blobPath(fileInfo.vaultId, fileInfo.id);
      await ensureDir(`${blobDir()}${fileInfo.vaultId}/`);
      const base64 = Buffer.from(encryptedBlob).toString('base64');
      await FileSystem.writeAsStringAsync(path, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    // Update vault file count
    const vaults = await this.loadVaults();
    const vault = vaults.find(v => v.id === fileInfo.vaultId);
    if (vault) {
      vault.fileCount = files.length;
      vault.lastModified = new Date().toISOString();
      await this.saveVaults(vaults);
    }
  }

  async getEncryptedBlob(vaultId: string, fileId: string): Promise<Uint8Array | null> {
    try {
      const path = blobPath(vaultId, fileId);
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists) return null;

      const base64 = await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return new Uint8Array(Buffer.from(base64, 'base64'));
    } catch (e) {
      logger.error('[nativeStorage] Failed to get encrypted blob:', e);
      return null;
    }
  }

  async deleteFile(vaultId: string, fileId: string): Promise<void> {
    // Remove from metadata list
    const files = await this.loadFiles(vaultId);
    const filtered = files.filter(f => f.id !== fileId);
    await asSet(`${AS_FILES_PREFIX}${vaultId}`, filtered);

    // Remove blob file
    try {
      const path = blobPath(vaultId, fileId);
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        await FileSystem.deleteAsync(path, { idempotent: true });
      }
    } catch {
      // Silent fail
    }

    // Update vault file count
    const vaults = await this.loadVaults();
    const vault = vaults.find(v => v.id === vaultId);
    if (vault) {
      vault.fileCount = filtered.length;
      await this.saveVaults(vaults);
    }
  }

  // ── Encrypted Index Operations ──

  async saveEncryptedIndex(vaultId: string, encryptedBase64: string): Promise<void> {
    await asSet(`${AS_INDEX_PREFIX}${vaultId}`, encryptedBase64);
  }

  async loadEncryptedIndex(vaultId: string): Promise<string | null> {
    return await asGet<string>(`${AS_INDEX_PREFIX}${vaultId}`);
  }

  async deleteEncryptedIndex(vaultId: string): Promise<void> {
    await asRemove(`${AS_INDEX_PREFIX}${vaultId}`);
  }

  async hasEncryptedIndex(vaultId: string): Promise<boolean> {
    const blob = await asGet<string>(`${AS_INDEX_PREFIX}${vaultId}`);
    return blob !== null;
  }

  // ── Clear All ──

  async clear(): Promise<void> {
    await asRemove(AS_VAULTS_KEY);

    // Remove all keys with our prefixes
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const ourKeys = allKeys.filter(
        k => k.startsWith(AS_FILES_PREFIX) || k.startsWith(AS_INDEX_PREFIX)
      );
      if (ourKeys.length > 0) {
        await AsyncStorage.multiRemove(ourKeys);
      }
    } catch {
      // Silent fail
    }

    // Remove blob directory
    try {
      const dir = blobDir();
      const info = await FileSystem.getInfoAsync(dir);
      if (info.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
      }
    } catch {
      // Silent fail
    }
  }

  async hasStoredData(): Promise<boolean> {
    const vaults = await this.loadVaults();
    return vaults.length > 0;
  }
}

export const nativeStorage = new NativeStorageService();
