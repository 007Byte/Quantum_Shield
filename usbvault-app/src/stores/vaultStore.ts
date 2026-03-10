import { Platform } from 'react-native';
import { create } from 'zustand';
import * as api from '@/services/api';
import { webStorage } from '@/services/webStorage';
import { auditService } from '@/services/auditService';
import { encryptFileIndex, decryptFileIndex } from '@/services/indexCrypto';
import { createKeyHierarchy, unlockKeyHierarchy } from '@/services/keyHierarchy';
import { toStoredFileInfo, fromStoredFileInfo, type StoredFileInfo } from '@/types/domain';
import { logger } from '@/utils/logger';

// PL-001: Re-export canonical types from shared domain module
export type { FileInfo, VaultInfo } from '@/types/domain';
import type { FileInfo, VaultInfo } from '@/types/domain';

const isWeb = Platform.OS === 'web';

// Helper to generate unique IDs
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Mock data for web preview
const createMockFile = (id: string, vaultId: string, name: string, size: number, type: string): FileInfo => ({
  id,
  vaultId,
  name,
  size,
  type,
  modifiedAt: new Date().toISOString(),
  encryptedMetadata: '',
  isPQCProtected: false,
});

const WEB_MOCK_VAULTS: VaultInfo[] = [
  { id: 'v1', name: 'Personal Documents', encryptedMetadata: '', fileCount: 3, lastModified: new Date().toISOString(), securityLevel: 'maximum' },
  { id: 'v2', name: 'Work Files', encryptedMetadata: '', fileCount: 2, lastModified: new Date(Date.now() - 86400000).toISOString(), securityLevel: 'high' },
];

// Mock files for each vault
const WEB_MOCK_FILES: Record<string, FileInfo[]> = {
  'v1': [
    createMockFile('f1-1', 'v1', 'passport_scan.pdf', 2048000, 'application/pdf'),
    createMockFile('f1-2', 'v1', 'tax_return_2025.pdf', 1536000, 'application/pdf'),
    createMockFile('f1-3', 'v1', 'insurance_card.jpg', 512000, 'image/jpeg'),
  ],
  'v2': [
    createMockFile('f2-1', 'v2', 'project_proposal.docx', 3072000, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    createMockFile('f2-2', 'v2', 'budget_2026.xlsx', 1024000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  ],
};

// PL-001: FileInfo and VaultInfo are now defined in @/types/domain
// and re-exported above — single source of truth for all consumers.

export interface VaultState {
  // State
  vaults: VaultInfo[];
  currentVault: VaultInfo | null;
  files: FileInfo[];
  isLoading: boolean;
  error: string | null;
  /**
   * SG-003/SG-004: Encryption key for the current session.
   * - Legacy vaults: 32-byte password-derived key (set via setVaultKey)
   * - New vaults (SG-004): first 32 bytes of the 64-byte MEK
   * Used to encrypt/decrypt the vault file index client-side.
   * Cleared on logout. Never persisted to storage.
   */
  vaultKey: Uint8Array | null;
  /**
   * SG-004: Full 64-byte Master Encryption Key for the current session.
   * Present only when the vault uses the two-layer key hierarchy.
   * Used for per-file key derivation (SG-005) and index encryption.
   * Cleared on logout. Never persisted to storage.
   */
  mek: Uint8Array | null;

  // Actions
  loadVaults: () => Promise<void>;
  selectVault: (vaultId: string) => Promise<void>;
  createVault: (name: string, metadata: Uint8Array) => Promise<string>;
  deleteVault: (vaultId: string) => Promise<void>;
  loadFiles: (vaultId: string) => Promise<void>;
  addFile: (file: FileInfo) => void;
  deleteFile: (vaultId: string, fileId: string) => Promise<void>;
  renameVault: (vaultId: string, newName: string) => Promise<void>;
  exportVault: (vaultId: string) => Promise<void>;
  clearError: () => void;
  /** SG-003: Set the session vault key after password-based unlock */
  setVaultKey: (key: Uint8Array | null) => void;
  /**
   * SG-004: Create a vault with the two-layer key hierarchy.
   * Generates random MEK, wraps with password-derived KEK, persists wrappedMek.
   */
  createVaultWithKeyHierarchy: (
    name: string,
    metadata: Uint8Array,
    password: string,
  ) => Promise<{ vaultId: string; mek: Uint8Array }>;
  /**
   * SG-004: Unlock a vault's key hierarchy.
   * Derives KEK from password, unwraps MEK, sets session keys.
   */
  unlockVault: (vaultId: string, password: string) => Promise<void>;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  // Initial state
  vaults: [],
  currentVault: null,
  files: [],
  isLoading: false,
  error: null,
  vaultKey: null,
  mek: null,

  // Load all vaults
  loadVaults: async () => {
    if (isWeb) {
      try {
        const stored = await webStorage.loadVaults();
        if (stored.length > 0) {
          // Load from persistent storage
          set({ vaults: stored as VaultInfo[], isLoading: false, error: null });
        } else {
          // First-time — seed with mock data and persist
          set({ vaults: WEB_MOCK_VAULTS, isLoading: false, error: null });
          await webStorage.saveVaults(WEB_MOCK_VAULTS.map((v) => ({
            id: v.id,
            name: v.name,
            encryptedMetadata: v.encryptedMetadata,
            fileCount: v.fileCount,
            lastModified: v.lastModified,
            securityLevel: v.securityLevel,
          })));
        }
      } catch {
        set({ vaults: WEB_MOCK_VAULTS, isLoading: false, error: null });
      }
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const vaults = await api.listVaults();
      set({ vaults, isLoading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load vaults';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Select a vault and load its files
  selectVault: async (vaultId: string) => {
    const { vaults } = get();
    const vault = vaults.find((v) => v.id === vaultId);

    if (!vault) {
      set({ error: 'Vault not found', currentVault: null });
      return;
    }

    set({ currentVault: vault, isLoading: true, error: null });

    try {
      // Load files for this vault
      await get().loadFiles(vaultId);
      set({ isLoading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load vault files';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Create new vault
  createVault: async (name: string, metadata: Uint8Array) => {
    if (isWeb) {
      // On web, create vault in local state + persist to webStorage
      set({ isLoading: true, error: null });
      try {
        const newVaultId = generateId();
        const newVault: VaultInfo = {
          id: newVaultId,
          name,
          encryptedMetadata: '',
          fileCount: 0,
          lastModified: new Date().toISOString(),
          securityLevel: 'standard',
        };

        set((state) => {
          const updatedVaults = [...state.vaults, newVault];
          // Persist asynchronously
          webStorage.saveVaults(updatedVaults.map((v) => ({
            id: v.id, name: v.name, encryptedMetadata: v.encryptedMetadata,
            fileCount: v.fileCount, lastModified: v.lastModified, securityLevel: v.securityLevel,
            wrappedMekB64: v.wrappedMekB64, kekSaltHex: v.kekSaltHex,
            hasRecoveryCodes: v.hasRecoveryCodes,
          }))).catch(() => {});
          return { vaults: updatedVaults, isLoading: false };
        });

        auditService.log('vault_create', name, { vaultId: newVaultId }).catch(() => {});
        return newVaultId;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create vault';
        set({ error: message, isLoading: false });
        throw error;
      }
    }

    set({ isLoading: true, error: null });
    try {
      const metadataBase64 = Buffer.from(metadata).toString('base64');
      const vaultId = await api.createVault({
        name,
        encryptedMetadata: metadataBase64,
      });

      // Reload vaults
      await get().loadVaults();

      set({ isLoading: false });
      return vaultId;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create vault';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Delete vault
  deleteVault: async (vaultId: string) => {
    if (isWeb) {
      // On web, delete from local state + webStorage
      set({ isLoading: true, error: null });
      try {
        set((state) => {
          const updatedVaults = state.vaults.filter((v) => v.id !== vaultId);
          const newCurrentVault =
            state.currentVault?.id === vaultId ? null : state.currentVault;
          const updatedFiles = state.files.filter((f) => f.vaultId !== vaultId);

          // Persist deletion
          webStorage.deleteVault(vaultId).catch(() => {});
          auditService.log('vault_delete', vaultId).catch(() => {});

          return {
            vaults: updatedVaults,
            currentVault: newCurrentVault,
            files: updatedFiles,
            isLoading: false,
          };
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete vault';
        set({ error: message, isLoading: false });
        throw error;
      }
      return;
    }

    set({ isLoading: true, error: null });
    try {
      await api.deleteVault(vaultId);

      // Update local state
      const { vaults, currentVault } = get();
      const updatedVaults = vaults.filter((v) => v.id !== vaultId);
      const newCurrentVault =
        currentVault?.id === vaultId ? null : currentVault;

      set({
        vaults: updatedVaults,
        currentVault: newCurrentVault,
        isLoading: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete vault';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Load files for a vault
  loadFiles: async (vaultId: string) => {
    if (isWeb) {
      try {
        const { vaultKey } = get();

        // SG-003: Try encrypted index first (preferred path)
        if (vaultKey) {
          const encryptedBlob = await webStorage.loadEncryptedIndex(vaultId);
          if (encryptedBlob !== null) {
            const decrypted = await decryptFileIndex(vaultKey, encryptedBlob);
            if (decrypted !== null) {
              const restored: FileInfo[] = (decrypted as StoredFileInfo[]).map(fromStoredFileInfo);
              set({ files: restored, isLoading: false, error: null });
              return;
            }
            // Decryption failed — fall through to legacy path
            logger.warn('[vaultStore] Encrypted index decryption failed, trying legacy path');
          }
        }

        // Legacy plaintext path (backward compatibility during migration)
        const storedFiles = await webStorage.loadFiles(vaultId);
        if (storedFiles.length > 0) {
          // PL-005: Use fromStoredFileInfo utility — blob fetched on-demand via webStorage.getEncryptedBlob()
          const restored: FileInfo[] = storedFiles.map(fromStoredFileInfo);
          set({ files: restored, isLoading: false, error: null });

          // SG-003: Migrate legacy plaintext index to encrypted storage
          if (vaultKey) {
            const encrypted = await encryptFileIndex(vaultKey, storedFiles);
            if (encrypted !== null) {
              await webStorage.saveEncryptedIndex(vaultId, encrypted);
              logger.info(`[vaultStore] Migrated vault ${vaultId} index to encrypted storage`);
            }
          }
        } else {
          // Fall back to mock data for this vault
          const mockFiles = WEB_MOCK_FILES[vaultId] || [];
          set({ files: mockFiles, isLoading: false, error: null });
        }
      } catch {
        const mockFiles = WEB_MOCK_FILES[vaultId] || [];
        set({ files: mockFiles, isLoading: false, error: null });
      }
      return;
    }

    set({ isLoading: true, error: null });
    try {
      // In production, call API to get files
      // const files = await api.getVaultFiles(vaultId);
      set({ files: [], isLoading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load files';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Add file to current vault
  addFile: (file: FileInfo) => {
    // PL-005: Persist to webStorage on web using toStoredFileInfo utility
    if (isWeb) {
      const blob = file.encryptedBlob;
      webStorage.saveFile(toStoredFileInfo(file, !!blob), blob).catch(() => {});
    }

    set((state) => {
      const updatedFiles = [...state.files, file];
      const updatedVaults = state.vaults.map((vault) =>
        vault.id === file.vaultId
          ? { ...vault, fileCount: vault.fileCount + 1, lastModified: new Date().toISOString() }
          : vault
      );
      const updatedCurrentVault =
        state.currentVault?.id === file.vaultId
          ? { ...state.currentVault, fileCount: state.currentVault.fileCount + 1, lastModified: new Date().toISOString() }
          : state.currentVault;

      // Persist updated vault list
      if (isWeb) {
        webStorage.saveVaults(updatedVaults.map((v) => ({
          id: v.id, name: v.name, encryptedMetadata: v.encryptedMetadata,
          fileCount: v.fileCount, lastModified: v.lastModified, securityLevel: v.securityLevel,
        }))).catch(() => {});

        // SG-003: Re-encrypt the full file index after adding the new file
        if (state.vaultKey) {
          const allStored = updatedFiles
            .filter((f) => f.vaultId === file.vaultId)
            .map((f) => toStoredFileInfo(f, !!f.encryptedBlob));
          encryptFileIndex(state.vaultKey, allStored).then((encrypted) => {
            if (encrypted !== null) {
              webStorage.saveEncryptedIndex(file.vaultId, encrypted).catch(() => {});
            }
          }).catch(() => {});
        }
      }

      return {
        files: updatedFiles,
        vaults: updatedVaults,
        currentVault: updatedCurrentVault,
      };
    });
  },

  // Delete file
  deleteFile: async (vaultId: string, fileId: string) => {
    if (isWeb) {
      // On web, delete from local state + webStorage
      set({ isLoading: true, error: null });
      try {
        // Delete from IndexedDB
        await webStorage.deleteFile(vaultId, fileId);

        set((state) => {
          const updatedFiles = state.files.filter((f) => f.id !== fileId);
          const updatedVaults = state.vaults.map((vault) =>
            vault.id === vaultId
              ? { ...vault, fileCount: Math.max(0, vault.fileCount - 1), lastModified: new Date().toISOString() }
              : vault
          );
          const updatedCurrentVault =
            state.currentVault?.id === vaultId
              ? { ...state.currentVault, fileCount: Math.max(0, state.currentVault.fileCount - 1), lastModified: new Date().toISOString() }
              : state.currentVault;

          // Persist vault list update
          webStorage.saveVaults(updatedVaults.map((v) => ({
            id: v.id, name: v.name, encryptedMetadata: v.encryptedMetadata,
            fileCount: v.fileCount, lastModified: v.lastModified, securityLevel: v.securityLevel,
            wrappedMekB64: v.wrappedMekB64, kekSaltHex: v.kekSaltHex,
            hasRecoveryCodes: v.hasRecoveryCodes,
          }))).catch(() => {});

          // SG-003: Re-encrypt the file index after deletion
          if (state.vaultKey) {
            const remainingStored = updatedFiles
              .filter((f) => f.vaultId === vaultId)
              .map((f) => toStoredFileInfo(f, !!f.encryptedBlob));
            encryptFileIndex(state.vaultKey, remainingStored).then((encrypted) => {
              if (encrypted !== null) {
                webStorage.saveEncryptedIndex(vaultId, encrypted).catch(() => {});
              }
            }).catch(() => {});
          }

          return {
            files: updatedFiles,
            vaults: updatedVaults,
            currentVault: updatedCurrentVault,
            isLoading: false,
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete file';
        set({ error: message, isLoading: false });
        throw error;
      }
      return;
    }

    set({ isLoading: true, error: null });
    try {
      // In production, call API to delete file
      // await api.deleteFile(vaultId, fileId);

      set((state) => {
        const updatedFiles = state.files.filter((f) => f.id !== fileId);
        const updatedVaults = state.vaults.map((vault) =>
          vault.id === vaultId
            ? { ...vault, fileCount: Math.max(0, vault.fileCount - 1) }
            : vault
        );

        return {
          files: updatedFiles,
          vaults: updatedVaults,
          isLoading: false,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete file';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Rename vault
  renameVault: async (vaultId: string, newName: string) => {
    if (isWeb) {
      // On web, update local state + persist
      set({ isLoading: true, error: null });
      try {
        set((state) => {
          const updatedVaults = state.vaults.map((vault) =>
            vault.id === vaultId
              ? { ...vault, name: newName, lastModified: new Date().toISOString() }
              : vault
          );
          const updatedCurrentVault =
            state.currentVault?.id === vaultId
              ? { ...state.currentVault, name: newName, lastModified: new Date().toISOString() }
              : state.currentVault;

          // Persist
          webStorage.saveVaults(updatedVaults.map((v) => ({
            id: v.id, name: v.name, encryptedMetadata: v.encryptedMetadata,
            fileCount: v.fileCount, lastModified: v.lastModified, securityLevel: v.securityLevel,
            wrappedMekB64: v.wrappedMekB64, kekSaltHex: v.kekSaltHex,
            hasRecoveryCodes: v.hasRecoveryCodes,
          }))).catch(() => {});

          return {
            vaults: updatedVaults,
            currentVault: updatedCurrentVault,
            isLoading: false,
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to rename vault';
        set({ error: message, isLoading: false });
        throw error;
      }
      return;
    }

    set({ isLoading: true, error: null });
    try {
      // In production, call API to rename vault
      // await api.renameVault(vaultId, newName);

      set((state) => {
        const updatedVaults = state.vaults.map((vault) =>
          vault.id === vaultId
            ? { ...vault, name: newName, lastModified: new Date().toISOString() }
            : vault
        );

        return {
          vaults: updatedVaults,
          isLoading: false,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to rename vault';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Export vault
  exportVault: async (_vaultId: string) => {
    if (isWeb) {
      // On web, just set a flag
      set({ isLoading: true, error: null });
      try {
        // Simulate export completion
        await new Promise((resolve) => setTimeout(resolve, 500));
        set({ isLoading: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to export vault';
        set({ error: message, isLoading: false });
        throw error;
      }
      return;
    }

    set({ isLoading: true, error: null });
    try {
      // In production, call API to export vault
      // await api.exportVault(vaultId);

      set({ isLoading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to export vault';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // SG-003: Set/clear the session vault key (called after password-based unlock)
  setVaultKey: (key: Uint8Array | null) => {
    set({ vaultKey: key, mek: key ? get().mek : null });
    if (!key) {
      logger.info('[vaultStore] Vault key and MEK cleared (logout)');
    }
  },

  // SG-004: Create a vault with the two-layer key hierarchy
  createVaultWithKeyHierarchy: async (
    name: string,
    metadata: Uint8Array,
    password: string,
  ) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        // 1. Create key hierarchy: random MEK, password-derived KEK, wrapped MEK
        const { mek, wrappedMek, kekSalt } = await createKeyHierarchy(password);

        const newVaultId = generateId();
        const newVault: VaultInfo = {
          id: newVaultId,
          name,
          encryptedMetadata: '',
          fileCount: 0,
          lastModified: new Date().toISOString(),
          securityLevel: 'maximum', // Key hierarchy vaults get maximum security
          wrappedMekB64: Buffer.from(wrappedMek).toString('base64'),
          kekSaltHex: Buffer.from(kekSalt).toString('hex'),
          hasRecoveryCodes: false,
        };

        // 2. Set session keys (first 32 bytes of MEK = encryption key)
        const vaultKey = mek.slice(0, 32);

        set((state) => {
          const updatedVaults = [...state.vaults, newVault];
          webStorage.saveVaults(updatedVaults.map((v) => ({
            id: v.id, name: v.name, encryptedMetadata: v.encryptedMetadata,
            fileCount: v.fileCount, lastModified: v.lastModified, securityLevel: v.securityLevel,
            wrappedMekB64: v.wrappedMekB64, kekSaltHex: v.kekSaltHex,
            hasRecoveryCodes: v.hasRecoveryCodes,
          }))).catch(() => {});
          return { vaults: updatedVaults, isLoading: false, vaultKey, mek };
        });

        auditService.log('vault_create', name, {
          vaultId: newVaultId,
          keyHierarchy: 'v2-kek-mek',
        }).catch(() => {});

        logger.info(`[vaultStore] Created vault ${newVaultId} with SG-004 key hierarchy`);

        return { vaultId: newVaultId, mek };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create vault';
        set({ error: message, isLoading: false });
        throw error;
      }
    }

    // Native: delegate to API (would include wrappedMek in request)
    set({ isLoading: true, error: null });
    try {
      const hierarchy = await createKeyHierarchy(password);
      const metadataBase64 = Buffer.from(metadata).toString('base64');
      // TODO: Send hierarchy.wrappedMek and hierarchy.kekSalt to server with createVault
      const vaultId = await api.createVault({
        name,
        encryptedMetadata: metadataBase64,
      });

      await get().loadVaults();

      const vaultKey = hierarchy.mek.slice(0, 32);
      set({ isLoading: false, vaultKey, mek: hierarchy.mek });

      return { vaultId, mek: hierarchy.mek };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create vault';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // SG-004: Unlock a vault's key hierarchy
  unlockVault: async (vaultId: string, password: string) => {
    const { vaults } = get();
    const vault = vaults.find((v) => v.id === vaultId);

    if (!vault) {
      throw new Error('Vault not found');
    }

    try {
      if (vault.wrappedMekB64 && vault.kekSaltHex) {
        // SG-004 path: two-layer key hierarchy
        const wrappedMek = Buffer.from(vault.wrappedMekB64, 'base64');
        const kekSalt = Buffer.from(vault.kekSaltHex, 'hex');

        const { mek } = await unlockKeyHierarchy(password, kekSalt, wrappedMek);
        const vaultKey = mek.slice(0, 32);

        set({ vaultKey, mek });
        logger.info(`[vaultStore] Unlocked vault ${vaultId} via SG-004 key hierarchy`);
      } else {
        // Legacy path: direct password-derived key (no key hierarchy)
        // The caller (authStore) should set vaultKey via setVaultKey()
        logger.info(`[vaultStore] Vault ${vaultId} uses legacy key derivation`);
      }
    } catch (error) {
      logger.error(`[vaultStore] Failed to unlock vault ${vaultId}:`, error);
      throw error;
    }
  },
}));
