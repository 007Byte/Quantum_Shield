// PH4-FIX: useDecrypt hook - extracted logic layer for file decryption
import { useState, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { CipherId } from '@/crypto/bridge';
import { decryptData, downloadDecryptedFile } from '@/utils/cryptoManager';
import { webStorage } from '@/services/webStorage';
import { auditService } from '@/services/auditService';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import type { FileInfo } from '@/types/domain';

type DecryptMode = 'save' | 'view';

// FIX: USB vault files synced after unlock have type set to just the file
// extension (e.g., 'jpg') instead of a proper MIME type (e.g., 'image/jpeg').
// Blob URLs need valid MIME types for correct browser rendering.
const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  zip: 'application/zip',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function resolveMimeType(fileType: string, fileName: string): string {
  // Already a valid MIME type (contains '/')
  if (fileType && fileType.includes('/')) return fileType;
  // Try mapping from extension-only type
  if (fileType && MIME_MAP[fileType.toLowerCase()]) return MIME_MAP[fileType.toLowerCase()];
  // Derive from filename extension
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return MIME_MAP[ext] || 'application/octet-stream';
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

export interface DisplayFile {
  id: string;
  name: string;
  size: string;
  sizeBytes: number;
  type: string;
  modified: string;
  isPQC: boolean;
}

export interface DecryptHookState {
  selectedFiles: Set<string>;
  decryptMode: DecryptMode;
  isDecrypting: boolean;
  decryptionProgress: number;
  tempViewFile: FileInfo | null;
  searchQuery: string;
}

export function useDecrypt() {
  const vaultsById = useVaultListStore(s => s.vaultsById);
  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = activeVaultId ? vaultsById[activeVaultId] : undefined;
  const files = useVaultListStore(s => s.files);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [decryptMode, setDecryptMode] = useState<DecryptMode>('save');
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [tempViewFile, setTempViewFile] = useState<FileInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [decryptionProgress, setDecryptionProgress] = useState(0);

  // PL-003/PL-019: Derive file list from store data only
  const vaultFiles = useMemo(
    () =>
      files.map(f => ({
        id: f.id,
        name: f.name,
        size: formatFileSize(f.size),
        sizeBytes: f.size,
        type: f.type,
        modified: f.modifiedAt ? new Date(f.modifiedAt).toLocaleDateString() : 'Unknown',
        isPQC: f.isPQCProtected,
      })),
    [files]
  );

  // PL-019: Memoize filtered results
  const filteredFiles = useMemo(
    () =>
      searchQuery.trim()
        ? vaultFiles.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
        : vaultFiles,
    [vaultFiles, searchQuery]
  );

  // PL-018: Wrap handlers in useCallback
  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedFiles.size === filteredFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(filteredFiles.map(f => f.id)));
    }
  }, [selectedFiles.size, filteredFiles]);

  const closeTempView = useCallback(() => {
    setTempViewFile(null);
  }, []);

  const performDecryption = useCallback(
    async (
      password: string
    ): Promise<{ success: boolean; error?: string; fileNames?: string[] }> => {
      const fileNames = filteredFiles.filter(f => selectedFiles.has(f.id)).map(f => f.name);
      const selectedStoreFiles = files.filter(f => selectedFiles.has(f.id));
      const hasEncryptedData = selectedStoreFiles.some(f => f.encryptedBlob || f.saltHex);
      const isUsbVaultUnlocked = vaultOrchestrator.isUnlocked();

      // Demo/mock files — no real encrypted data AND vault not unlocked.
      // FIX: USB vault files don't have encryptedBlob or saltHex (their data
      // lives in VAULT.bin on the USB drive). Previously this early return
      // blocked all USB vault files from reaching the orchestrator path below,
      // completely breaking the temp viewer for USB vault files.
      if (selectedStoreFiles.length === 0 || (!hasEncryptedData && !isUsbVaultUnlocked)) {
        return { success: true, fileNames };
      }

      // ── USB Vault Path (orchestrator) ──
      // If vault is unlocked, files are stored in VAULT.bin on USB.
      // Read + decrypt via orchestrator (uses Rust FFI, not password-based).
      if (vaultOrchestrator.isUnlocked()) {
        try {
          for (const storeFile of selectedStoreFiles) {
            setDecryptionProgress(0);

            // Try reading from USB vault via orchestrator
            let decryptedData: Uint8Array;
            try {
              const record = await vaultOrchestrator.readFile(storeFile.id);
              decryptedData = record.data;
            } catch (_orchErr) {
              // File not in USB vault — fall through to Zustand path below
              continue;
            }

            if (decryptMode === 'save') {
              if (Platform.OS === 'web') {
                downloadDecryptedFile(decryptedData, storeFile.name, storeFile.type);
              }
            } else {
              if (Platform.OS === 'web') {
                const mimeType = resolveMimeType(storeFile.type, storeFile.name);
                const blob = new Blob([decryptedData.buffer as ArrayBuffer], {
                  type: mimeType,
                });
                const blobUrl = URL.createObjectURL(blob);
                setTempViewFile({ ...storeFile, uri: blobUrl, type: mimeType });
              } else {
                setTempViewFile(storeFile);
              }
            }
            setDecryptionProgress(100);
          }

          for (const name of fileNames) {
            await auditService.log('decrypt', name, {
              mode: decryptMode,
              source: 'usb_vault',
              vaultId: currentVault?.id,
            });
          }

          return { success: true, fileNames };
        } catch (_err) {
          // Fall through to Zustand-based decryption
        }
      }

      // ── Zustand/Memory Path (existing) ──
      // Falls through here when vault is NOT unlocked or file not in USB vault
      try {
        for (const storeFile of selectedStoreFiles) {
          if (!storeFile.saltHex) {
            continue; // Skip files without encryption metadata
          }

          // Get encrypted blob from memory or IndexedDB
          let encryptedBlob = storeFile.encryptedBlob;
          if (!encryptedBlob && Platform.OS === 'web') {
            encryptedBlob =
              (await webStorage.getEncryptedBlob(storeFile.vaultId, storeFile.id)) || undefined;
          }

          if (!encryptedBlob) {
            return {
              success: false,
              error: `No encrypted data found for "${storeFile.name}". The file may need to be re-encrypted.`,
            };
          }

          // Convert salt from hex string to Uint8Array
          const saltBytes = new Uint8Array(
            storeFile.saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
          );

          const result = await decryptData(
            encryptedBlob,
            password,
            saltBytes,
            storeFile.cipherId ?? CipherId.Aes256GcmSiv,
            storeFile.isStreamed ?? false,
            storeFile.originalSize,
            progress => setDecryptionProgress(progress)
          );

          if (decryptMode === 'save') {
            // Download decrypted file to device
            if (Platform.OS === 'web') {
              downloadDecryptedFile(result.data, storeFile.name, storeFile.type);
            }
          } else {
            // View temporarily — create blob URL for preview
            if (Platform.OS === 'web') {
              const mimeType = resolveMimeType(storeFile.type, storeFile.name);
              const blob = new Blob([result.data.buffer as ArrayBuffer], {
                type: mimeType,
              });
              const blobUrl = URL.createObjectURL(blob);
              setTempViewFile({ ...storeFile, uri: blobUrl, type: mimeType });
            } else {
              setTempViewFile(storeFile);
            }
          }
        }

        // Log successful decryption for each file
        for (const name of fileNames) {
          await auditService.log('decrypt', name, { mode: decryptMode, vaultId: currentVault?.id });
        }

        return { success: true, fileNames };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Decryption failed';
        const isAuthError = msg.includes('tag') || msg.includes('auth') || msg.includes('decrypt');
        await auditService.log(
          'decrypt',
          fileNames.join(', '),
          { error: msg, isAuthError },
          'error'
        );

        return {
          success: false,
          error: isAuthError
            ? 'Incorrect password or corrupted data. Please verify your vault password.'
            : msg,
        };
      }
    },
    [selectedFiles, filteredFiles, files, decryptMode, currentVault]
  );

  return {
    // State
    selectedFiles,
    setSelectedFiles,
    decryptMode,
    setDecryptMode,
    isDecrypting,
    setIsDecrypting,
    tempViewFile,
    setTempViewFile,
    searchQuery,
    setSearchQuery,
    decryptionProgress,
    setDecryptionProgress,
    // Derived data
    vaultFiles,
    filteredFiles,
    // Actions
    toggleFileSelection,
    selectAll,
    closeTempView,
    performDecryption,
  };
}
