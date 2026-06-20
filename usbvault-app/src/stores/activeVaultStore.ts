/**
 * activeVaultStore — tracks which vault is currently selected.
 *
 * Owns only the selection ID. File data is loaded at the feature boundary,
 * not in a globally shared store.
 */

import { create } from 'zustand';

export interface ActiveVaultState {
  activeVaultId: string | null;
  selectVault: (vaultId: string | null) => void;
}

export const useActiveVaultStore = create<ActiveVaultState>(set => ({
  activeVaultId: null,

  selectVault: (vaultId: string | null) => {
    set({ activeVaultId: vaultId });
  },
}));
