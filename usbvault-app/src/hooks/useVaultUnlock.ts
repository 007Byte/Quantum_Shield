/**
 * useVaultUnlock – Global vault unlock hook.
 *
 * This hook provides vault unlock state and actions that can be used from ANY
 * screen (dashboard, encrypt-store, etc.). It extracts the unlock logic that
 * was previously embedded in useEncryptFlow so the unlock modal can be
 * triggered at the Tabs layout level.
 *
 * Key behaviors:
 *   - Auto-detects when the active vault is a USB vault that needs unlocking
 *   - Prompts the user for their password
 *   - Calls vaultOrchestrator.unlock() and syncs decrypted index → Zustand
 *   - Caches file metadata to localStorage so files survive page reloads
 *   - Provides isVaultLocked / isVaultUnlocked for UI gating
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { logger } from '@/utils/logger';
import type { FileInfo } from '@/types/domain';

/**
 * Notification callbacks injected by the consumer (a screen/feature at L3+
 * that owns the modal UI). The hook layer (L2) must not import the modal
 * component directly — see import/no-restricted-paths layering rules.
 */
export interface VaultUnlockNotifier {
  showError: (title: string, message?: string) => void;
  showSuccess: (title: string, message?: string) => void;
}

const NOOP_NOTIFIER: VaultUnlockNotifier = {
  showError: () => {},
  showSuccess: () => {},
};

// ── Cached USB file metadata (survives page reload) ────────────────────────
const USB_FILE_CACHE_KEY = 'usbvault:usb_file_cache';

interface CachedVaultFiles {
  vaultId: string;
  files: FileInfo[];
  cachedAt: string;
}

function getCachedFiles(vaultId: string): FileInfo[] {
  try {
    const raw = localStorage.getItem(USB_FILE_CACHE_KEY);
    if (!raw) return [];
    const entries: CachedVaultFiles[] = JSON.parse(raw);
    const match = entries.find(e => e.vaultId === vaultId);
    return match?.files ?? [];
  } catch {
    return [];
  }
}

function setCachedFiles(vaultId: string, files: FileInfo[]): void {
  try {
    const raw = localStorage.getItem(USB_FILE_CACHE_KEY);
    const entries: CachedVaultFiles[] = raw ? JSON.parse(raw) : [];
    const filtered = entries.filter(e => e.vaultId !== vaultId);
    filtered.push({ vaultId, files, cachedAt: new Date().toISOString() });
    // Keep at most 10 cached vaults
    while (filtered.length > 10) filtered.shift();
    localStorage.setItem(USB_FILE_CACHE_KEY, JSON.stringify(filtered));
  } catch {
    // Non-fatal
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useVaultUnlock(notifier: VaultUnlockNotifier = NOOP_NOTIFIER) {
  const { showError, showSuccess } = notifier;

  // Store selectors
  const vaultsById = useVaultListStore(s => s.vaultsById);
  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const activeVault = activeVaultId ? vaultsById[activeVaultId] : undefined;

  // Detect USB vault
  const isUsbVault = !!(activeVault && (activeVault as any).mountPoint);

  // Unlock state
  const [vaultUnlocked, setVaultUnlocked] = useState(() => vaultOrchestrator.isUnlocked());
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Only auto-prompt once per mount cycle
  const hasPromptedRef = useRef(false);

  // ── Sync orchestrator state on mount / vault change ─────────────────────
  useEffect(() => {
    const unlocked = vaultOrchestrator.isUnlocked();
    setVaultUnlocked(unlocked);
    // FIX: If orchestrator is already unlocked (e.g. user unlocked on another tab/route),
    // mark as prompted so we don't show the modal again.
    if (unlocked) {
      hasPromptedRef.current = true;
    }
  }, [activeVaultId]);

  // ── Auto-prompt unlock for USB vaults ──────────────────────────────────
  useEffect(() => {
    // FIX: Double-check orchestrator state to avoid stale vaultUnlocked
    const orchestratorUnlocked = vaultOrchestrator.isUnlocked();
    if (orchestratorUnlocked) {
      setVaultUnlocked(true);
      hasPromptedRef.current = true;
      return;
    }
    if (isUsbVault && !orchestratorUnlocked && !vaultUnlocked && !hasPromptedRef.current) {
      hasPromptedRef.current = true;

      // Before prompting, try to restore cached file list so dashboard isn't empty
      if (activeVault) {
        const cached = getCachedFiles(activeVault.id);
        if (cached.length > 0) {
          const currentFiles = useVaultListStore.getState().files;
          const hasFilesForVault = currentFiles.some(f => f.vaultId === activeVault.id);
          if (!hasFilesForVault) {
            logger.info('[useVaultUnlock] Restoring cached file metadata for vault', {
              vaultId: activeVault.id,
              cachedCount: cached.length,
            });
            useVaultListStore.setState({ files: [...currentFiles, ...cached] });
          }
        }
      }

      setShowUnlockModal(true);
      setUnlockError(null);
      setUnlockPassword('');
    }
  }, [isUsbVault, vaultUnlocked, activeVault]);

  // Reset prompt flag when vault changes
  useEffect(() => {
    hasPromptedRef.current = false;
  }, [activeVaultId]);

  // ── Unlock handler ─────────────────────────────────────────────────────
  const handleVaultUnlock = useCallback(async () => {
    const mountPoint = (activeVault as any)?.mountPoint;
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
      logger.info('[useVaultUnlock] Vault unlocked successfully', {
        mountPoint,
        fileCount: actualFileCount,
        previousFailCount: result.previousFailCount,
      });

      // Sync orchestrator's decrypted index → Zustand store
      const store = useVaultListStore.getState();
      const syncedFiles: FileInfo[] = [];
      for (const [fileId, entry] of Object.entries(indexFiles)) {
        const existing = store.files.find(f => f.id === fileId);
        if (existing) {
          syncedFiles.push(existing);
          continue;
        }
        try {
          const record = await vaultOrchestrator.readFile(fileId);
          // FIX: The V2RC record does NOT store the filename (metadata.filename is always '').
          // The vault index entry (entry.name) has the correct user-defined filename.
          const indexName = (entry as any).name || '';
          const resolvedName = indexName || record.metadata.filename || fileId;
          syncedFiles.push({
            id: fileId,
            vaultId: activeVault!.id,
            name: resolvedName,
            size: record.data.length,
            type: resolvedName.split('.').pop() || 'unknown',
            modifiedAt: new Date().toISOString(),
            encryptedMetadata: '',
            isPQCProtected: false,
            originalSize: (entry as any).length,
          });
        } catch {
          // FIX: Use index entry name instead of falling back to random fileId
          const indexName = (entry as any).name || '';
          syncedFiles.push({
            id: fileId,
            vaultId: activeVault!.id,
            name: indexName || fileId,
            size: (entry as any).length || 0,
            type: (indexName || fileId).split('.').pop() || 'unknown',
            modifiedAt: new Date().toISOString(),
            encryptedMetadata: '',
            isPQCProtected: false,
          });
        }
      }

      // Merge: keep files from OTHER vaults, replace this vault's files
      const otherFiles = store.files.filter(f => f.vaultId !== activeVault!.id);
      const mergedFiles = [...otherFiles, ...syncedFiles];
      useVaultListStore.setState({ files: mergedFiles });
      useVaultListStore.getState()._updateVault(activeVault!.id, {
        fileCount: actualFileCount,
        lastModified: new Date().toISOString(),
      });

      // Cache file metadata for reload resilience
      setCachedFiles(activeVault!.id, syncedFiles);

      setVaultUnlocked(true);
      setShowUnlockModal(false);
      setUnlockPassword('');

      if (result.failCounterWasNonZero) {
        showError(
          'Security Warning',
          `${result.previousFailCount} failed unlock attempt(s) detected since last successful unlock. If you did not make these attempts, your vault may have been accessed by an unauthorized party.`
        );
      } else {
        showSuccess('Vault Unlocked', 'Your vault is now unlocked and ready for file operations.');
      }
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

      logger.warn('[useVaultUnlock] Vault unlock failed', { mountPoint, failCount, error: errMsg });
      setUnlockError(displayMsg);
    } finally {
      setIsUnlocking(false);
    }
  }, [activeVault, unlockPassword, showError, showSuccess]);

  // ── Dismiss handler ────────────────────────────────────────────────────
  const dismissUnlockModal = useCallback(() => {
    setShowUnlockModal(false);
    setUnlockPassword('');
    setUnlockError(null);
  }, []);

  // ── Manual trigger ─────────────────────────────────────────────────────
  const requestUnlock = useCallback(() => {
    setShowUnlockModal(true);
    setUnlockError(null);
    setUnlockPassword('');
  }, []);

  return {
    // State
    isUsbVault,
    vaultUnlocked,
    showUnlockModal,
    unlockPassword,
    unlockError,
    isUnlocking,

    // Actions
    setUnlockPassword,
    handleVaultUnlock,
    dismissUnlockModal,
    requestUnlock,
  };
}
