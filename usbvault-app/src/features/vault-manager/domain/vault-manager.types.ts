/**
 * Vault Manager — Shared domain types and configuration.
 */

// ─── Core Types ──────────────────────────────────────────────────────

export type VaultStatus = 'healthy' | 'corrupted' | 'locked';

export type SecurityLevel = 'Standard' | 'High' | 'Maximum';

export interface DetectedVault {
  id: string;
  name: string;
  path: string;
  size: string;
  status: VaultStatus;
  fileCount: number;
}

export interface KnownLocation {
  id: string;
  path: string;
}

export interface CreateVaultModalState {
  visible: boolean;
  vaultName: string;
  securityLevel: SecurityLevel;
}

export interface RenameModalState {
  visible: boolean;
  vaultId: string | null;
  currentName: string;
  newName: string;
}

// ─── Vault Card Props ────────────────────────────────────────────────

export interface VaultCardData {
  id: string;
  name: string;
  fileCount: number;
  lastModified: string;
  securityLevel: string;
}

export interface VaultCardActions {
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onExport: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}

// ─── Configuration ───────────────────────────────────────────────────

export const SECURITY_LEVELS: readonly SecurityLevel[] = ['Standard', 'High', 'Maximum'] as const;

export const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

// ─── Helpers ─────────────────────────────────────────────────────────

export const getSecurityLevelColors = (level: string) => {
  // Security level colors — semantic (green/amber/red/gray), not theme-dependent
  switch (level.toLowerCase()) {
    case 'maximum':
      return {
        bgLight: 'rgba(16,185,129,0.15)',
        border: 'rgba(16,185,129,0.4)',
        text: '#10B981',
        icon: '#10B981',
      };
    case 'high':
      return {
        bgLight: 'rgba(139,92,246,0.15)',
        border: 'rgba(139,92,246,0.4)',
        text: '#8B5CF6',
        icon: '#8B5CF6',
      };
    case 'standard':
      return {
        bgLight: 'rgba(245,158,11,0.15)',
        border: 'rgba(245,158,11,0.4)',
        text: '#F59E0B',
        icon: '#F59E0B',
      };
    default:
      return {
        bgLight: 'rgba(139,92,246,0.1)',
        border: 'rgba(139,92,246,0.2)',
        text: '#94a3b8',
        icon: '#94a3b8',
      };
  }
};

export const getStatusColor = (status: VaultStatus): string => {
  switch (status) {
    case 'healthy':
      return '#10b981';
    case 'corrupted':
      return '#ef4444';
    case 'locked':
      return '#f59e0b';
    default:
      return '#6b7280';
  }
};

export const getStatusLabel = (status: VaultStatus): string => {
  switch (status) {
    case 'healthy':
      return 'Healthy';
    case 'corrupted':
      return 'Corrupted';
    case 'locked':
      return 'Locked';
    default:
      return 'Unknown';
  }
};

export const formatDate = (
  isoString: string,
  t: (key: string, params?: Record<string, unknown>) => string,
  language: string
): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return t('vaultManager.mAgo', { count: diffMins });
  if (diffHours < 24) return t('vaultManager.hAgo', { count: diffHours });
  if (diffDays < 7) return t('vaultManager.dAgo', { count: diffDays });

  return date.toLocaleDateString(LOCALE_MAP[language] || language, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

// ─── Default modal states ────────────────────────────────────────────

export const DEFAULT_CREATE_MODAL: CreateVaultModalState = {
  visible: false,
  vaultName: '',
  securityLevel: 'High',
};

export const DEFAULT_RENAME_MODAL: RenameModalState = {
  visible: false,
  vaultId: null,
  currentName: '',
  newName: '',
};
