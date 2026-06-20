// ── Remove-File Feature Types ────────────────────────────────────────────────

export interface FileItem {
  id: string;
  name: string;
  size: string;
  dateModified: string;
  icon: string;
}

export interface DeleteHistoryEntry {
  id: string;
  filename: string;
  date: string;
  method: 'quick' | 'secure';
}

export type WipeMethod = 'quick' | 'secure';

/** Vault-unlock state exposed by the hook to the unlock modal */
export interface UnlockState {
  showUnlockModal: boolean;
  unlockPassword: string;
  isUnlocking: boolean;
  unlockError: string | null;
  setUnlockPassword: (text: string) => void;
  handleVaultUnlock: () => Promise<void>;
  dismissUnlockModal: () => void;
}
