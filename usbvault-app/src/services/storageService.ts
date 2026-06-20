/**
 * USBVault Unified Storage Service
 *
 * Cross-platform facade that delegates to webStorage (web) or
 * nativeStorage (iOS/Android). Consumers import this instead of
 * importing platform-specific modules directly.
 *
 * @module services/storageService
 */

import { Platform } from 'react-native';
import type { VaultInfo, StoredFileInfo } from '@/types/domain';

// ─── Storage Interface ───────────────────────────────────────────────

export interface StorageBackend {
  loadVaults(): Promise<VaultInfo[]>;
  saveVaults(vaults: VaultInfo[]): Promise<void>;
  deleteVault(vaultId: string): Promise<void>;
  loadFiles(vaultId: string): Promise<StoredFileInfo[]>;
  saveFile(fileInfo: StoredFileInfo, encryptedBlob?: Uint8Array): Promise<void>;
  getEncryptedBlob(vaultId: string, fileId: string): Promise<Uint8Array | null>;
  deleteFile(vaultId: string, fileId: string): Promise<void>;
  saveEncryptedIndex(vaultId: string, encryptedBase64: string): Promise<void>;
  loadEncryptedIndex(vaultId: string): Promise<string | null>;
  deleteEncryptedIndex(vaultId: string): Promise<void>;
  hasEncryptedIndex(vaultId: string): Promise<boolean>;
  clear(): Promise<void>;
  hasStoredData(): Promise<boolean>;
}

// ─── Platform-delegating Singleton ───────────────────────────────────

let _backend: StorageBackend | null = null;

function getBackend(): StorageBackend {
  if (!_backend) {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { webStorage } = require('@/services/webStorage');
      _backend = webStorage;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { nativeStorage } = require('@/services/nativeStorage');
      _backend = nativeStorage;
    }
  }
  return _backend!;
}

// ─── Exported Facade ─────────────────────────────────────────────────

export const storageService: StorageBackend = {
  loadVaults: () => getBackend().loadVaults(),
  saveVaults: vaults => getBackend().saveVaults(vaults),
  deleteVault: vaultId => getBackend().deleteVault(vaultId),
  loadFiles: vaultId => getBackend().loadFiles(vaultId),
  saveFile: (fileInfo, encryptedBlob) => getBackend().saveFile(fileInfo, encryptedBlob),
  getEncryptedBlob: (vaultId, fileId) => getBackend().getEncryptedBlob(vaultId, fileId),
  deleteFile: (vaultId, fileId) => getBackend().deleteFile(vaultId, fileId),
  saveEncryptedIndex: (vaultId, encryptedBase64) =>
    getBackend().saveEncryptedIndex(vaultId, encryptedBase64),
  loadEncryptedIndex: vaultId => getBackend().loadEncryptedIndex(vaultId),
  deleteEncryptedIndex: vaultId => getBackend().deleteEncryptedIndex(vaultId),
  hasEncryptedIndex: vaultId => getBackend().hasEncryptedIndex(vaultId),
  clear: () => getBackend().clear(),
  hasStoredData: () => getBackend().hasStoredData(),
};
