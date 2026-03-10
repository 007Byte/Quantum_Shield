/**
 * QAV Shared Domain Types
 *
 * PL-001 / PL-005: Single source of truth for core data types used across
 * stores, services, and UI components. Eliminates parallel type definitions
 * (VaultInfo vs VaultItem, FileInfo vs StoredFileInfo).
 *
 * @module types/domain
 */

// ─── Vault Types ────────────────────────────────────────────────────

/** Core vault data — canonical type used by stores and services */
export interface VaultInfo {
  id: string;
  name: string;
  encryptedMetadata: string; // base64-encoded
  fileCount: number;
  lastModified: string;
  securityLevel: 'standard' | 'high' | 'maximum';
  /**
   * SG-004: Base64-encoded wrapped MEK blob (nonce || ciphertext || tag).
   * Present when vault uses the two-layer key hierarchy.
   * Absent for legacy vaults that use direct password-derived encryption.
   */
  wrappedMekB64?: string;
  /**
   * SG-004: Hex-encoded 32-byte salt used for KEK derivation.
   * Stored alongside wrappedMek; required to re-derive KEK from password.
   */
  kekSaltHex?: string;
  /**
   * SG-006: Whether recovery codes have been generated for this vault.
   * The codes themselves are NEVER stored — only shown once to the user.
   */
  hasRecoveryCodes?: boolean;
}

/** UI presentation fields derived from VaultInfo for dashboard rendering */
export interface VaultDisplayItem extends VaultInfo {
  /** Display-ready labels derived from VaultInfo data */
  sizeLabel: string;
  securityLabel: string;
  modifiedLabel: string;
  /** Icon rendering properties */
  iconSet: string;
  iconName: string;
  iconTint: string;
  iconBg: string;
  /** UI state */
  selected?: boolean;
}

// ─── File Types ─────────────────────────────────────────────────────

/** Core file data — canonical type used by stores and services */
export interface FileInfo {
  id: string;
  vaultId: string;
  name: string;
  size: number;
  type: string;
  modifiedAt: string;
  encryptedMetadata: string; // base64-encoded
  isPQCProtected: boolean;
  /** Original file URI — used for temp view / decryption preview */
  uri?: string;
  /** Encrypted file data (stored in IndexedDB on web) */
  encryptedBlob?: Uint8Array;
  /** Salt used for key derivation (hex string, needed for decryption) */
  saltHex?: string;
  /** Cipher algorithm ID used for encryption */
  cipherId?: number;
  /** Whether streaming mode was used during encryption */
  isStreamed?: boolean;
  /** Original file size before encryption */
  originalSize?: number;
  /**
   * SG-012: Monotonic version counter for rollback protection.
   * Starts at 1 on creation, incremented on every write.
   * Client MUST reject any file update where version ≤ current known version.
   * Defaults to 0 for legacy files (no rollback protection).
   */
  version?: number;
}

/**
 * PL-005: StoredFileInfo is now a subset of FileInfo for localStorage serialization.
 * The hasBlobStored flag indicates whether an IndexedDB blob entry exists.
 */
export interface StoredFileInfo extends Omit<FileInfo, 'encryptedBlob'> {
  /** Whether encrypted blob is stored in IndexedDB (not serialized in localStorage) */
  hasBlobStored: boolean;
}

// ─── Mapping Utilities ──────────────────────────────────────────────

/** PL-001: Map VaultInfo to VaultDisplayItem with derived UI fields */
export function toVaultDisplayItem(vault: VaultInfo): VaultDisplayItem {
  return {
    ...vault,
    sizeLabel: `${vault.fileCount} files`,
    securityLabel: vault.securityLevel.charAt(0).toUpperCase() + vault.securityLevel.slice(1),
    modifiedLabel: formatRelativeTime(vault.lastModified),
    iconSet: 'Feather',
    iconName: getVaultIcon(vault.securityLevel),
    iconTint: getSecurityTint(vault.securityLevel),
    iconBg: getSecurityBg(vault.securityLevel),
  };
}

/** Convert FileInfo to StoredFileInfo for localStorage serialization */
export function toStoredFileInfo(file: FileInfo, hasBlobStored: boolean): StoredFileInfo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { encryptedBlob, ...rest } = file;
  return { ...rest, hasBlobStored };
}

/** Convert StoredFileInfo back to FileInfo (without blob) */
export function fromStoredFileInfo(stored: StoredFileInfo): FileInfo {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hasBlobStored, ...rest } = stored;
  return rest;
}

// ─── Private Helpers ────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getVaultIcon(level: string): string {
  switch (level) {
    case 'maximum': return 'shield';
    case 'high': return 'lock';
    default: return 'folder';
  }
}

function getSecurityTint(level: string): string {
  switch (level) {
    case 'maximum': return '#10B981';
    case 'high': return '#8B5CF6';
    default: return '#F59E0B';
  }
}

function getSecurityBg(level: string): string {
  switch (level) {
    case 'maximum': return 'rgba(16,185,129,0.15)';
    case 'high': return 'rgba(139,92,246,0.15)';
    default: return 'rgba(245,158,11,0.15)';
  }
}
