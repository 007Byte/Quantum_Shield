/**
 * vaultIndexSync — 300ms debounced index re-encryption side-effect module.
 *
 * Not a store. Coalesces rapid file add/delete bursts into a single
 * encryption cycle. Without this, adding 10 files = 10 full encryptions.
 */

import { encryptFileIndex } from '@/services/crypto';
import { storageService } from '@/services/storageService';
import { toStoredFileInfo } from '@/types/domain';
import { fireAndForget } from '@/utils/logger';
import type { FileInfo } from '@/types/domain';

const INDEX_DEBOUNCE_MS = 300;
const _indexTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a debounced index re-encryption for the given vault.
 * @param vaultId — vault to re-encrypt index for
 * @param getState — callback to read current files and vaultKey
 */
export function scheduleIndexReEncrypt(
  vaultId: string,
  getState: () => { files: FileInfo[]; vaultKey: Uint8Array | null }
): void {
  const existing = _indexTimers.get(vaultId);
  if (existing) clearTimeout(existing);
  _indexTimers.set(
    vaultId,
    setTimeout(async () => {
      _indexTimers.delete(vaultId);
      const { files, vaultKey } = getState();
      if (!vaultKey) return;
      const stored = files
        .filter(f => f.vaultId === vaultId)
        .map(f => toStoredFileInfo(f, !!f.encryptedBlob));
      const encrypted = await encryptFileIndex(vaultKey, stored);
      if (encrypted !== null) {
        fireAndForget(storageService.saveEncryptedIndex(vaultId, encrypted));
      }
    }, INDEX_DEBOUNCE_MS)
  );
}

/** Cancel all pending re-encryption timers (called on logout/lock) */
export function cancelAllIndexTimers(): void {
  _indexTimers.forEach(timer => clearTimeout(timer));
  _indexTimers.clear();
}
