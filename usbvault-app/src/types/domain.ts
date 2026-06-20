/**
 * USBVault Shared Domain Types
 *
 * PL-001 / PL-005: Single source of truth for core data types used across
 * stores, services, and UI components. Eliminates parallel type definitions
 * (VaultInfo vs VaultItem, FileInfo vs StoredFileInfo).
 *
 * @module types/domain
 */

import { formatRelativeTime as formatRelative } from '@/utils/formatters';

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
  /** USB mount point path (e.g. /media/usb0, E:\) — present for USB-backed vaults */
  mountPoint?: string;
  /** Display name of the USB drive (e.g. "SanDisk Ultra 64GB") */
  driveName?: string;
  /** File system on the vault partition (e.g. exfat, ntfs, ext4, apfs) */
  fileSystem?: string;
  /** Encryption algorithm identifier (e.g. "xchacha20-poly1305") */
  algorithm?: string;
  /** Origin of the vault: 'usb' for local USB, 'cloud' for synced vaults, 'local' for device-local */
  source?: 'usb' | 'cloud' | 'local';
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

/** Delegate to shared i18n-aware formatter (English fallback when no t() available) */
function formatRelativeTime(isoString: string): string {
  return formatRelative(isoString);
}

function getVaultIcon(level: string): string {
  switch (level) {
    case 'maximum':
      return 'shield';
    case 'high':
      return 'lock';
    default:
      return 'folder';
  }
}

function getSecurityTint(level: string): string {
  switch (level) {
    case 'maximum':
      return '#10B981';
    case 'high':
      return '#8B5CF6';
    default:
      return '#F59E0B';
  }
}

function getSecurityBg(level: string): string {
  switch (level) {
    case 'maximum':
      return 'rgba(16,185,129,0.15)';
    case 'high':
      return 'rgba(139,92,246,0.15)';
    default:
      return 'rgba(245,158,11,0.15)';
  }
}
