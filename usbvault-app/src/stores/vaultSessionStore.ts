/**
 * vaultSessionStore — session-level vault encryption keys.
 *
 * Owns: vaultKey, mek, unlockVault(), lockVault()
 * Zero-fills keys on lock/logout. Never persists keys to storage.
 */

import { create } from 'zustand';
import { auditService } from '@/services/auditService';
import { unlockKeyHierarchy } from '@/services/crypto/keyHierarchy';
import { logger, fireAndForget } from '@/utils/logger';
import { cancelAllIndexTimers } from './vaultIndexSync';
import { resetIdleTimer, stopIdleTimer, setIdleLockCallback } from './vaultIdleTimer';
import type { VaultInfo } from '@/types/domain';

export interface VaultSessionState {
  vaultKey: Uint8Array | null;
  mek: Uint8Array | null;

  setVaultKey: (key: Uint8Array | null) => void;
  setSessionKeys: (vaultKey: Uint8Array, mek: Uint8Array) => void;
  unlockVault: (vault: VaultInfo, password: string) => Promise<void>;
  lockVault: () => void;
}

export const useVaultSessionStore = create<VaultSessionState>((set, get) => ({
  vaultKey: null,
  mek: null,

  setVaultKey: (key: Uint8Array | null) => {
    if (!key) {
      get().lockVault();
      return;
    }
    resetIdleTimer();
    set({ vaultKey: key });
  },

  setSessionKeys: (vaultKey: Uint8Array, mek: Uint8Array) => {
    resetIdleTimer();
    set({ vaultKey, mek });
  },

  unlockVault: async (vault: VaultInfo, password: string) => {
    if (vault.wrappedMekB64 && vault.kekSaltHex) {
      // SG-004 path: two-layer key hierarchy
      const wrappedMek = Buffer.from(vault.wrappedMekB64, 'base64');
      const kekSalt = Buffer.from(vault.kekSaltHex, 'hex');
      const { mek } = await unlockKeyHierarchy(password, kekSalt, wrappedMek);
      const vaultKey = mek.slice(0, 32);
      set({ vaultKey, mek });
      resetIdleTimer();
      logger.info(`[vaultSessionStore] Unlocked vault ${vault.id} via SG-004 key hierarchy`);
      fireAndForget(
        auditService.log('vault_unlock', `vault:${vault.id}`, { method: 'key_hierarchy' }),
        { context: 'vaultSession.unlock', severity: 'error' }
      );
    } else {
      // Legacy path: caller sets vaultKey via setVaultKey
      logger.info(`[vaultSessionStore] Vault ${vault.id} uses legacy key derivation`);
      fireAndForget(auditService.log('vault_unlock', `vault:${vault.id}`, { method: 'legacy' }), {
        context: 'vaultSession.unlock',
        severity: 'error',
      });
    }
  },

  lockVault: () => {
    const prev = get();
    if (prev.vaultKey) prev.vaultKey.fill(0);
    if (prev.mek) prev.mek.fill(0);
    cancelAllIndexTimers();
    stopIdleTimer();
    set({ vaultKey: null, mek: null });
    logger.info('[vaultSessionStore] Vault key and MEK zeroed and cleared');
  },
}));

// Register idle lock callback
setIdleLockCallback(() => useVaultSessionStore.getState().lockVault());
