/**
 * useVaultManager — All state and business logic for the Vault Manager feature.
 *
 * Components receive data via props from this hook; no direct store imports
 * in presentational components.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { useInAppModal } from '@/components/common';
import { useLanguage } from '@/hooks/useLanguage';
import { usbService } from '@/services/usbService';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { logger } from '@/utils/logger';
import type {
  DetectedVault,
  KnownLocation,
  CreateVaultModalState,
  RenameModalState,
  VaultStatus,
} from '../domain/vault-manager.types';
import { DEFAULT_CREATE_MODAL, DEFAULT_RENAME_MODAL } from '../domain/vault-manager.types';

export function useVaultManager() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const { modal, showSuccess, showError, showConfirm } = useInAppModal();

  // ── Vault stores ──
  const vaults = useVaultListStore(s => s.vaults);
  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = useVaultListStore(s => (activeVaultId ? s.vaultsById[activeVaultId] : null));
  const isLoading = useVaultListStore(s => s.isLoading);
  const selectVault = useActiveVaultStore(s => s.selectVault);
  const createVault = useVaultListStore(s => s.createVault);
  const renameVault = useVaultListStore(s => s.renameVault);
  const deleteVault = useVaultListStore(s => s.deleteVault);
  const exportVault = useVaultListStore(s => s.exportVault);
  const loadVaults = useVaultListStore(s => s.loadVaults);

  // ── Discovery state ──
  const [isScanning, setIsScanning] = useState(false);
  const [detectedVaults, setDetectedVaults] = useState<DetectedVault[]>([]);
  const [knownLocations, setKnownLocations] = useState<KnownLocation[]>([]);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);

  // ── Modal state ──
  const [createModalState, setCreateModalState] =
    useState<CreateVaultModalState>(DEFAULT_CREATE_MODAL);
  const [renameModalState, setRenameModalState] = useState<RenameModalState>(DEFAULT_RENAME_MODAL);

  // ── Boot ──
  useEffect(() => {
    logger.debug(
      `[vault-manager] MOUNT: calling loadVaults(), current vaults count=${vaults.length}`,
      vaults.map(v => v.id)
    );
    loadVaults();
  }, [loadVaults]);

  // ── CRUD handlers ──

  const handleOpenVault = useCallback(
    async (vaultId: string) => {
      try {
        await selectVault(vaultId);
        router.navigate('/(tabs)/encrypt-store' as never);
      } catch {
        showError(t('vaultManager.error'), t('vaultManager.failedToOpen'));
      }
    },
    [selectVault, router, showError, t]
  );

  const handleExportVault = useCallback(
    async (vaultId: string, vaultName: string) => {
      showConfirm(
        t('vaultManager.confirmExport'),
        t('vault.exportConfirm', { name: vaultName }),
        async () => {
          try {
            await exportVault(vaultId);
            showSuccess(t('vaultManager.success'), t('vaultManager.exportStarted'));
          } catch {
            showError(t('vaultManager.error'), t('vaultManager.failedToExport'));
          }
        },
        t('vaultManager.exportBtn')
      );
    },
    [exportVault, showConfirm, showSuccess, showError, t]
  );

  const handleDeleteVault = useCallback(
    async (vaultId: string, vaultName: string) => {
      showConfirm(
        t('vaultManager.deleteVault'),
        `${t('vaultManager.deleteConfirm')} "${vaultName}"? ${t('vaultManager.cannotUndo')}`,
        async () => {
          try {
            await deleteVault(vaultId);
            showSuccess(t('vaultManager.success'), t('vaultManager.deleted'));
          } catch {
            showError(t('vaultManager.error'), t('vaultManager.failedToDelete'));
          }
        },
        t('common.delete'),
        'destructive'
      );
    },
    [deleteVault, showConfirm, showSuccess, showError, t]
  );

  const handleRenameOpen = useCallback((vaultId: string, name: string) => {
    setRenameModalState({ visible: true, vaultId, currentName: name, newName: name });
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (renameModalState.newName.trim() === '' || !renameModalState.vaultId) return;
    try {
      await renameVault(renameModalState.vaultId, renameModalState.newName);
      showSuccess(t('vaultManager.success'), t('vaultManager.renamed'));
    } catch {
      showError(t('vaultManager.error'), t('vaultManager.failedToRename'));
    }
    setRenameModalState(DEFAULT_RENAME_MODAL);
  }, [renameModalState, renameVault, showSuccess, showError, t]);

  const handleCreateVault = useCallback(async () => {
    if (!createModalState.vaultName.trim()) {
      showError(t('vaultManager.error'), t('vaultManager.enterVaultName'));
      return;
    }
    try {
      await createVault(createModalState.vaultName, new Uint8Array(0));
      setCreateModalState(DEFAULT_CREATE_MODAL);
      showSuccess(t('vaultManager.success'), t('vaultManager.vaultCreated'));
    } catch {
      showError(t('vaultManager.error'), t('vaultManager.failedToCreate'));
    }
  }, [createModalState, createVault, showSuccess, showError, t]);

  const openCreateModal = useCallback(() => {
    setCreateModalState({ ...createModalState, visible: true });
  }, [createModalState]);

  const closeCreateModal = useCallback(() => {
    setCreateModalState(DEFAULT_CREATE_MODAL);
  }, []);

  const closeRenameModal = useCallback(() => {
    setRenameModalState(DEFAULT_RENAME_MODAL);
  }, []);

  // ── Discovery handlers ──

  const handleScanAll = useCallback(async () => {
    logger.debug('[vault-manager] handleScanAll() called');
    setIsScanning(true);
    try {
      logger.debug('[vault-manager] handleScanAll() refreshing global vaultStore...');
      await loadVaults();
      logger.debug('[vault-manager] handleScanAll() global vaultStore refreshed');

      const discovered = await usbService.discoverVaults();
      logger.debug(`[vault-manager] handleScanAll() discovered ${discovered.length} vaults`);
      setDetectedVaults(
        discovered.map(v => ({
          id: v.driveId,
          name: v.driveName,
          path: v.device,
          size: vaultOrchestrator.isUnlocked()
            ? `${Object.keys(vaultOrchestrator.getIndex()?.files || {}).length} file(s)`
            : 'Locked',
          status: 'healthy' as VaultStatus,
          fileCount: vaultOrchestrator.isUnlocked()
            ? Object.keys(vaultOrchestrator.getIndex()?.files || {}).length
            : 0,
        }))
      );
      setKnownLocations(
        discovered.map((v, i: number) => ({
          id: String(i + 1),
          path: v.device,
        }))
      );
      setLastScanTime(new Date().toLocaleString());
    } catch {
      try {
        await loadVaults();
        const storeVaults = useVaultListStore.getState().vaults;
        if (storeVaults.length > 0) {
          setDetectedVaults(
            storeVaults.map(v => ({
              id: v.id,
              name: v.name,
              path: v.mountPoint ?? '',
              size: `${v.fileCount ?? 0} file(s)`,
              status: 'healthy' as VaultStatus,
              fileCount: v.fileCount ?? 0,
            }))
          );
        } else {
          setDetectedVaults([]);
        }
      } catch {
        setDetectedVaults([]);
      }
    }
    setIsScanning(false);
  }, [loadVaults]);

  const handleEjectVault = useCallback(
    async (vaultId: string) => {
      try {
        const result = await usbService.safeEjectWithCleanup(vaultId);
        showSuccess(
          result.success ? 'USB Ejected Safely' : 'USB Eject Issue',
          `${result.message}\n\nRESTART YOUR COMPUTER to clear RAM and swap. This ensures no decrypted data remains in memory.`
        );
        handleScanAll();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showError(t('vaultManager.ejectFailed'), message);
      }
    },
    [showSuccess, showError, t, handleScanAll]
  );

  const handleRemoveLocation = useCallback((id: string) => {
    setKnownLocations(prev => prev.filter(loc => loc.id !== id));
  }, []);

  // Auto-scan on mount
  useEffect(() => {
    handleScanAll();
  }, []);

  return {
    // Data
    vaults,
    currentVault,
    isLoading,
    isScanning,
    detectedVaults,
    knownLocations,
    lastScanTime,
    t,
    language,
    modal,

    // Create modal
    createModalState,
    setCreateModalState,
    openCreateModal,
    closeCreateModal,
    handleCreateVault,

    // Rename modal
    renameModalState,
    setRenameModalState,
    closeRenameModal,
    handleRenameSubmit,

    // Vault actions
    handleOpenVault,
    handleRenameOpen,
    handleExportVault,
    handleDeleteVault,

    // Discovery actions
    handleScanAll,
    handleEjectVault,
    handleRemoveLocation,
  };
}
