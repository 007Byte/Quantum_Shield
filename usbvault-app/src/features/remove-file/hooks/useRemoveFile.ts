import { useState, useEffect, useCallback, useRef } from 'react';
import { useInAppModal } from '@/components/common';
import { useLanguage } from '@/hooks/useLanguage';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { usbService } from '@/services/usbService';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { logger } from '@/utils/logger';
import { formatFileSize, getFileIcon } from '@/utils/fileHelpers';
import type { FileItem, DeleteHistoryEntry, UnlockState } from '../domain/remove-file.types';

export function useRemoveFile() {
  const { t } = useLanguage();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [secureWipeEnabled, setSecureWipeEnabled] = useState(false);
  const [deleteHistory, setDeleteHistory] = useState<DeleteHistoryEntry[]>([]);
  const [realFiles, setRealFiles] = useState<FileItem[]>([]);
  const { modal, showSuccess, showError, showConfirm } = useInAppModal();

  // ── Vault unlock state ──────────────────────────────────────────────
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(() => vaultOrchestrator.isUnlocked());

  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = useVaultListStore(s => (activeVaultId ? s.vaultsById[activeVaultId] : null));
  const vaults = useVaultListStore(s => s.vaults);
  const storeFiles = useVaultListStore(s => s.files);
  const activeVault = currentVault || vaults[0];

  // ── Auto-prompt vault unlock for USB vaults (once only) ─────────────
  const hasPromptedRef = useRef(false);
  const isUsbVault = !!(activeVault && activeVault.mountPoint);

  useEffect(() => {
    if (
      isUsbVault &&
      !vaultOrchestrator.isUnlocked() &&
      !vaultUnlocked &&
      !hasPromptedRef.current
    ) {
      hasPromptedRef.current = true;
      logger.debug('[remove-file] vault detected but not unlocked, showing unlock modal (once)');
      setShowUnlockModal(true);
      setUnlockError(null);
      setUnlockPassword('');
    }
  }, [isUsbVault, vaultUnlocked]);

  // ── Load files from orchestrator index + store ──────────────────────
  const loadFiles = useCallback(async () => {
    if (!activeVault) return;

    // Strategy 1: Use orchestrator's decrypted index
    const index = vaultOrchestrator.getIndex();
    if (index && Object.keys(index.files).length > 0) {
      const fileEntries = Object.entries(index.files);
      const items: FileItem[] = await Promise.all(
        fileEntries.map(async ([fileId, entry]) => {
          const storeFile = storeFiles.find(f => f.id === fileId);
          let fileName = storeFile?.name;
          let fileSize = storeFile?.size;

          // FIX: The V2RC record does NOT store the filename (metadata.filename is always '').
          // The vault index entry (entry.name) has the correct user-defined filename.
          if (!fileName) {
            // First try the vault index entry name (most reliable source)
            const indexName = (entry as any).name;
            if (indexName) {
              fileName = indexName;
              logger.debug(
                `[remove-file] [${Date.now()}] remove-file: resolved filename="${fileName}" from vault index entry`
              );
            } else {
              // Fallback: read V2RC record (filename will likely be '' but try anyway)
              try {
                logger.debug(
                  `[remove-file] [${Date.now()}] remove-file: reading V2RC record for fileId=${fileId} to extract filename`
                );
                const record = await vaultOrchestrator.readFile(fileId);
                fileName = record.metadata.filename || fileId;
                fileSize = record.data.length;
                logger.debug(
                  `[remove-file] [${Date.now()}] remove-file: extracted filename="${fileName}" (${fileSize} bytes) from V2RC record`
                );
              } catch (readErr) {
                logger.warn(
                  `[remove-file] [${Date.now()}] remove-file: failed to read V2RC record for ${fileId}:`,
                  readErr
                );
                fileName = fileId;
              }
            }
          }

          const displayName = fileName || fileId;
          return {
            id: fileId,
            name: displayName,
            size: fileSize
              ? formatFileSize(fileSize)
              : entry.length
                ? formatFileSize(entry.length)
                : 'Unknown',
            dateModified: storeFile?.modifiedAt
              ? new Date(storeFile.modifiedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Unknown',
            icon: getFileIcon(displayName),
          };
        })
      );
      logger.debug(
        `[remove-file] [${Date.now()}] remove-file loadFiles: loaded ${items.length} files from orchestrator index`
      );
      setRealFiles(items);
      return;
    }

    // Strategy 2: Use vaultStore files
    if (storeFiles.length > 0) {
      const vaultFiles = storeFiles.filter(f => f.vaultId === activeVault.id);
      if (vaultFiles.length > 0) {
        const items: FileItem[] = vaultFiles.map(f => ({
          id: f.id,
          name: f.name,
          size: f.size
            ? formatFileSize(f.size)
            : f.originalSize
              ? formatFileSize(f.originalSize)
              : 'Unknown',
          dateModified: f.modifiedAt
            ? new Date(f.modifiedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : 'Unknown',
          icon: getFileIcon(f.name),
        }));
        logger.debug(
          `[remove-file] [${Date.now()}] remove-file loadFiles: loaded ${items.length} files from vaultStore`
        );
        setRealFiles(items);
        return;
      }
    }

    // Strategy 3: Try backend API (legacy vaults only)
    try {
      const files = await usbService.listVaultFiles(activeVault.id);
      setRealFiles(
        files.map(f => ({
          id: f.id,
          name: f.name,
          size: formatFileSize(f.size),
          dateModified: new Date(f.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
          icon: getFileIcon(f.name),
        }))
      );
    } catch {
      setRealFiles([]);
    }
  }, [activeVault, storeFiles]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ── Vault unlock handler ────────────────────────────────────────────
  const handleVaultUnlock = useCallback(async () => {
    const mountPoint = activeVault?.mountPoint;
    if (!mountPoint || !unlockPassword) {
      setUnlockError('Please enter your vault password');
      return;
    }

    setIsUnlocking(true);
    setUnlockError(null);

    try {
      const result = await vaultOrchestrator.unlock(mountPoint, unlockPassword);
      const indexFiles = result.vault.index.files;
      const actualFileCount = Object.keys(indexFiles).length;
      logger.info('[RemoveFile] Vault unlocked successfully', {
        mountPoint,
        fileCount: actualFileCount,
      });

      // Sync orchestrator's decrypted index to Zustand store
      const store = useVaultListStore.getState();
      const syncedFiles: any[] = [];
      for (const [fileId, entry] of Object.entries(indexFiles)) {
        const existing = store.files.find(f => f.id === fileId);
        if (existing) {
          syncedFiles.push(existing);
          continue;
        }
        try {
          const record = await vaultOrchestrator.readFile(fileId);
          // FIX: V2RC record does NOT store filename. Use vault index entry name.
          const indexName = (entry as any).name || '';
          const resolvedName = indexName || record.metadata.filename || fileId;
          syncedFiles.push({
            id: fileId,
            vaultId: activeVault.id,
            name: resolvedName,
            size: record.data.length,
            type: resolvedName.split('.').pop() || 'unknown',
            modifiedAt: new Date().toISOString(),
            encryptedMetadata: '',
            isPQCProtected: false,
            originalSize: entry.length,
          });
          logger.debug(
            `[remove-file] [${Date.now()}] remove-file: synced file "${resolvedName}" (${fileId})`
          );
        } catch (readErr) {
          logger.warn(
            `[remove-file] [${Date.now()}] remove-file: V2RC read failed for ${fileId}:`,
            readErr
          );
          // FIX: Use index entry name instead of random fileId
          const indexName = (entry as any).name || '';
          syncedFiles.push({
            id: fileId,
            vaultId: activeVault.id,
            name: indexName || fileId,
            size: entry.length || 0,
            type: (indexName || fileId).split('.').pop() || 'unknown',
            modifiedAt: new Date().toISOString(),
            encryptedMetadata: '',
            isPQCProtected: false,
          });
        }
      }
      useVaultListStore.setState({ files: syncedFiles });
      useVaultListStore.getState()._updateVault(activeVault.id, {
        fileCount: actualFileCount,
        lastModified: new Date().toISOString(),
      });
      logger.debug(
        `[remove-file] [${Date.now()}] remove-file: synced ${syncedFiles.length} files to store after unlock`
      );

      setVaultUnlocked(true);
      setShowUnlockModal(false);
      setUnlockPassword('');
      loadFiles();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unlock failed';
      const failCount = (error as any)?.failCount;
      const maxAttempts = (error as any)?.maxAttempts || 10;

      let displayMsg = 'Incorrect password. Please try again.';
      if (failCount && failCount >= 6) {
        displayMsg = `Incorrect password. WARNING: ${failCount}/${maxAttempts} attempts used. Vault will self-destruct after ${maxAttempts} failed attempts.`;
      } else if (failCount && failCount >= 4) {
        displayMsg = `Incorrect password. ${failCount}/${maxAttempts} attempts used.`;
      }
      logger.warn('[RemoveFile] Vault unlock failed', { mountPoint, failCount, error: errMsg });
      setUnlockError(displayMsg);
    } finally {
      setIsUnlocking(false);
    }
  }, [activeVault, unlockPassword, loadFiles]);

  const dismissUnlockModal = useCallback(() => {
    setShowUnlockModal(false);
    setUnlockPassword('');
    setUnlockError(null);
  }, []);

  // ── Selection helpers ───────────────────────────────────────────────
  const allFilesSelected = selectedFiles.size === realFiles.length && realFiles.length > 0;

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

  const selectAllFiles = useCallback(() => {
    if (allFilesSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(realFiles.map(f => f.id)));
    }
  }, [allFilesSelected, realFiles]);

  // ── Delete logic ────────────────────────────────────────────────────
  const handleDeleteClick = useCallback(() => {
    showConfirm(
      t('removeFile.confirmDeletion'),
      t('removeFile.confirmMsg', {
        count: selectedFiles.size,
        method: secureWipeEnabled
          ? t('removeFile.secureWipeMethod')
          : t('removeFile.quickDeleteMethod'),
      }),
      handleConfirmDelete
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles, secureWipeEnabled, t]);

  const handleConfirmDelete = useCallback(async () => {
    if (!activeVault) return;
    let deletedCount = 0;
    const filesToDelete = Array.from(selectedFiles);

    for (const fileId of filesToDelete) {
      try {
        if (vaultOrchestrator.isUnlocked()) {
          await vaultOrchestrator.removeFile(fileId);
          logger.debug(
            `[remove-file] [${Date.now()}] remove-file: orchestrator.removeFile(${fileId}) succeeded`
          );
        } else {
          await usbService.deleteFile(activeVault.id, fileId);
        }

        try {
          await useVaultListStore.getState().deleteFile(activeVault.id, fileId);
          logger.debug(
            `[remove-file] [${Date.now()}] remove-file: vaultStore.deleteFile(${activeVault.id}, ${fileId}) synced`
          );
        } catch (storeErr) {
          logger.warn(
            `[remove-file] [${Date.now()}] remove-file: store sync for ${fileId} failed (non-fatal):`,
            storeErr
          );
        }

        const file = realFiles.find(f => f.id === fileId);
        if (file) {
          setDeleteHistory(prev => [
            {
              id: `h-${Date.now()}-${fileId}`,
              filename: file.name,
              date: new Date().toLocaleString(),
              method: secureWipeEnabled ? 'secure' : 'quick',
            },
            ...prev,
          ]);
        }
        deletedCount++;
      } catch (err: any) {
        showError('Delete Failed', err.message || `Failed to delete file ${fileId}`);
      }
    }

    if (deletedCount > 0) {
      const index = vaultOrchestrator.getIndex();
      if (index) {
        const realCount = Object.keys(index.files).length;
        useVaultListStore.getState()._updateVault(activeVault.id, { fileCount: realCount });
        logger.debug(
          `[remove-file] [${Date.now()}] remove-file: synced vault fileCount to ${realCount} after deleting ${deletedCount} file(s)`
        );
      }

      showSuccess(
        t('removeFile.filesDeleted'),
        t('removeFile.deletedMsg', {
          count: deletedCount,
          method: secureWipeEnabled
            ? t('removeFile.secureWipe3Pass')
            : t('removeFile.quickDeleteMethod'),
        })
      );
      setSelectedFiles(new Set());
      setSecureWipeEnabled(false);
      loadFiles();
    }
  }, [
    activeVault,
    selectedFiles,
    secureWipeEnabled,
    realFiles,
    loadFiles,
    showSuccess,
    showError,
    t,
  ]);

  // ── Unlock state bundle ─────────────────────────────────────────────
  const unlock: UnlockState = {
    showUnlockModal,
    unlockPassword,
    isUnlocking,
    unlockError,
    setUnlockPassword: (text: string) => {
      setUnlockPassword(text);
      if (unlockError) setUnlockError(null);
    },
    handleVaultUnlock,
    dismissUnlockModal,
  };

  return {
    // data
    realFiles,
    selectedFiles,
    allFilesSelected,
    secureWipeEnabled,
    deleteHistory,
    activeVault,
    modal,
    unlock,
    // actions
    toggleFileSelection,
    selectAllFiles,
    setSecureWipeEnabled,
    handleDeleteClick,
  };
}
