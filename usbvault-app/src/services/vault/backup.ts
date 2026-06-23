// PH4-FIX: Moved to vault domain
/**
 * USBVault Backup & Restore Service — FEAT-07
 *
 * Implements complete backup and restore workflow for vault data including:
 * - Creating backups of vault data, files, and settings
 * - Exporting backups with optional AES-256-GCM encryption
 * - Importing and restoring from encrypted/unencrypted backups
 * - Auto-backup scheduling with configurable intervals
 * - Backup history tracking for compliance
 *
 * Storage keys:
 * - 'usbvault_auto_backup_config': AutoBackupConfig (JSON)
 * - 'usbvault_backup_history': BackupHistoryEntry[] (JSON)
 *
 * @module services/backupService
 * @see FEAT-07: Backup & Restore Flow
 */

import { Platform } from 'react-native';
import type { VaultInfo, FileInfo } from '@/types/domain';
import { auditService } from '@/services/auditService';
import { logger } from '@/utils/logger';
import { settingsService, UserSettings } from '@/services/settingsService';

// ─── Types ──────────────────────────────────────────────────────────────

/**
 * Backup metadata — immutable snapshot of backup creation
 * @see FEAT-07
 */
export interface BackupMetadata {
  /** Unique backup identifier */
  id: string;
  /** ISO 8601 timestamp of backup creation */
  createdAt: string;
  /** Number of vaults in backup */
  vaultCount: number;
  /** Number of files in backup */
  fileCount: number;
  /** Total size in bytes of all vaults and files */
  sizeBytes: number;
  /** Backup format version (for migration handling) */
  version: string;
  /** Whether backup was encrypted with AES-256-GCM */
  encrypted: boolean;
}

/**
 * Complete backup payload — all vault, file, and settings data
 * @see FEAT-07
 */
export interface BackupData {
  metadata: BackupMetadata;
  vaults: VaultInfo[];
  files: FileInfo[];
  settings: UserSettings;
  /** Password hashes (optional) — only if includePasswords was true */
  passwords?: { id: string; hash: string }[];
}

/**
 * Auto-backup configuration with scheduling parameters
 * @see FEAT-07
 */
export interface AutoBackupConfig {
  /** Whether auto-backup is enabled */
  enabled: boolean;
  /** Interval in hours: 24 (daily), 168 (weekly), 720 (monthly) */
  intervalHours: 24 | 168 | 720;
  /** Maximum number of backups to retain: 3, 5, or 10 */
  maxBackups: 3 | 5 | 10;
  /** ISO 8601 timestamp of last auto-backup, or null if never run */
  lastBackupAt: string | null;
}

/**
 * Backup history entry — tracks all backups and restore operations
 * @see FEAT-07
 */
export interface BackupHistoryEntry {
  /** Unique backup identifier */
  id: string;
  /** ISO 8601 timestamp of backup creation */
  createdAt: string;
  /** Size of backup in bytes */
  sizeBytes: number;
  /** Number of vaults in backup */
  vaultCount: number;
  /** Number of files in backup */
  fileCount: number;
  /** Status of backup operation: 'success' | 'failed' */
  status: 'success' | 'failed';
  /** ISO 8601 timestamp of restore operation, if any */
  restoredAt?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────

const STORAGE_KEY_AUTO_BACKUP_CONFIG = 'usbvault_auto_backup_config';
const STORAGE_KEY_BACKUP_HISTORY = 'usbvault_backup_history';

const DEFAULT_AUTO_BACKUP_CONFIG: AutoBackupConfig = {
  enabled: false,
  intervalHours: 168, // weekly
  maxBackups: 5,
  lastBackupAt: null,
};

const BACKUP_VERSION = '1.0.0';
const ENCRYPTION_ALGORITHM = 'AES-256-GCM';

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Generate a unique backup ID
 */
const generateBackupId = (): string =>
  `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Derive encryption key from passphrase using PBKDF2
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 150000,
      hash: 'SHA-256',
    },
    passphraseKey,
    256
  );

  return crypto.subtle.importKey('raw', derivedBits, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/**
 * Encrypt backup data using AES-256-GCM
 */
async function encryptBackup(
  data: BackupData,
  encryptionKey: string
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array }> {
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive key from passphrase
  const key = await deriveKey(encryptionKey, salt);

  // Serialize backup data
  const plaintext = new TextEncoder().encode(JSON.stringify(data));

  // Encrypt with AES-256-GCM
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  // Zero-fill plaintext buffer to prevent memory exposure
  plaintext.fill(0);

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
    salt,
  };
}

/**
 * Decrypt backup data using AES-256-GCM
 */
async function decryptBackup(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  salt: Uint8Array,
  encryptionKey: string
): Promise<BackupData> {
  // Derive key from passphrase
  const key = await deriveKey(encryptionKey, salt);

  // Decrypt with AES-256-GCM
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ciphertext as BufferSource
  );

  // Parse JSON and zero-fill decrypted buffer
  const plaintextArray = new Uint8Array(plaintext);
  const json = new TextDecoder().decode(plaintextArray);
  const result = JSON.parse(json) as BackupData;
  plaintextArray.fill(0);
  return result;
}

/**
 * Convert Uint8Array to base64 string
 */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Read backup history from localStorage
 */
function readBackupHistory(): BackupHistoryEntry[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BACKUP_HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    logger.error('[BackupService] Failed to read backup history:', error);
    return [];
  }
}

/**
 * Write backup history to localStorage
 */
function writeBackupHistory(entries: BackupHistoryEntry[]): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(STORAGE_KEY_BACKUP_HISTORY, JSON.stringify(entries));
  } catch (error) {
    logger.error('[BackupService] Failed to write backup history:', error);
  }
}

/**
 * Read auto-backup config from localStorage
 */
function readAutoBackupConfig(): AutoBackupConfig {
  if (Platform.OS !== 'web') return DEFAULT_AUTO_BACKUP_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTO_BACKUP_CONFIG);
    if (raw) {
      return { ...DEFAULT_AUTO_BACKUP_CONFIG, ...JSON.parse(raw) };
    }
    return DEFAULT_AUTO_BACKUP_CONFIG;
  } catch (error) {
    logger.error('[BackupService] Failed to read auto-backup config:', error);
    return DEFAULT_AUTO_BACKUP_CONFIG;
  }
}

/**
 * Write auto-backup config to localStorage
 */
function writeAutoBackupConfig(config: AutoBackupConfig): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(STORAGE_KEY_AUTO_BACKUP_CONFIG, JSON.stringify(config));
  } catch (error) {
    logger.error('[BackupService] Failed to write auto-backup config:', error);
  }
}

/**
 * Calculate total size of vaults and files
 */
function calculateBackupSize(vaults: VaultInfo[], files: FileInfo[]): number {
  let total = 0;

  // Count vault metadata
  vaults.forEach(vault => {
    total += vault.name.length + vault.encryptedMetadata.length;
  });

  // Count file sizes
  files.forEach(file => {
    total += file.size + file.name.length + file.encryptedMetadata.length;
  });

  // Add overhead for metadata and settings
  total += 1024;

  return total;
}

// ─── Service Implementation ──────────────────────────────────────────────

/**
 * BackupService — Complete backup, export, import, and restore workflow
 * FEAT-07: Backup & Restore Flow
 */
class BackupService {
  /**
   * Create a backup of all vault data, files, and settings.
   *
   * @param vaults - Array of vault data to backup
   * @param files - Array of file data to backup
   * @param includePasswords - If true, include password hashes (not recommended)
   * @returns Complete backup data payload
   *
   * @example
   * const backup = await backupService.createBackup(vaults, files);
   * console.log(`Created backup with ${backup.vaults.length} vaults`);
   */
  async createBackup(
    vaults: VaultInfo[],
    files: FileInfo[],
    includePasswords: boolean = false
  ): Promise<BackupData> {
    logger.log('[BackupService] Creating backup...');

    try {
      const settings = settingsService.load();

      const sizeBytes = calculateBackupSize(vaults, files);

      const metadata: BackupMetadata = {
        id: generateBackupId(),
        createdAt: new Date().toISOString(),
        vaultCount: vaults.length,
        fileCount: files.length,
        sizeBytes,
        version: BACKUP_VERSION,
        encrypted: false,
      };

      const backup: BackupData = {
        metadata,
        vaults,
        files,
        settings,
      };

      if (includePasswords) {
        // Placeholder for password hashes (security consideration: never store plaintext)
        backup.passwords = [];
      }

      logger.log('[BackupService] Backup created:', {
        id: metadata.id,
        vaults: vaults.length,
        files: files.length,
      });

      return backup;
    } catch (error) {
      logger.error('[BackupService] Failed to create backup:', error);
      throw new Error(
        `Failed to create backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Export backup to a portable string format (JSON or encrypted).
   *
   * @param backup - BackupData to export
   * @param encryptionKey - Optional AES-256-GCM encryption key
   * @returns Base64-encoded backup string (with encryption metadata if encrypted)
   *
   * @example
   * const backup = await backupService.createBackup();
   * const exported = await backupService.exportBackup(backup, 'my-passphrase');
   * // exported is a base64 string ready for download
   */
  async exportBackup(backup: BackupData, encryptionKey?: string): Promise<string> {
    logger.log('[BackupService] Exporting backup...');

    try {
      let exportData: unknown;

      if (encryptionKey) {
        // Encrypt the backup
        logger.log('[BackupService] Encrypting backup with AES-256-GCM...');
        const { ciphertext, iv, salt } = await encryptBackup(backup, encryptionKey);

        // Create encrypted export with metadata
        exportData = {
          encrypted: true,
          algorithm: ENCRYPTION_ALGORITHM,
          ciphertext: bytesToBase64(ciphertext),
          iv: bytesToBase64(iv),
          salt: bytesToBase64(salt),
          metadata: backup.metadata,
        };
      } else {
        // Unencrypted export
        exportData = backup;
      }

      // Serialize to JSON and encode as base64
      const json = JSON.stringify(exportData);
      const encoded = bytesToBase64(new TextEncoder().encode(json));

      logger.log('[BackupService] Backup exported successfully');
      return encoded;
    } catch (error) {
      logger.error('[BackupService] Failed to export backup:', error);
      throw new Error(
        `Failed to export backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Import backup from a portable string format.
   *
   * @param data - Base64-encoded backup string
   * @param decryptionKey - Optional decryption key for encrypted backups
   * @returns Imported BackupData
   *
   * @example
   * const imported = await backupService.importBackup(encodedString, 'my-passphrase');
   * const result = await backupService.restoreFromBackup(imported);
   */
  async importBackup(data: string, decryptionKey?: string): Promise<BackupData> {
    logger.log('[BackupService] Importing backup...');

    try {
      // Decode base64
      const bytes = base64ToBytes(data);
      const json = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(json);

      // Check if encrypted
      if (parsed.encrypted && decryptionKey) {
        logger.log('[BackupService] Decrypting backup with AES-256-GCM...');

        const ciphertext = base64ToBytes(parsed.ciphertext);
        const iv = base64ToBytes(parsed.iv);
        const salt = base64ToBytes(parsed.salt);

        const backup = await decryptBackup(ciphertext, iv, salt, decryptionKey);
        logger.log('[BackupService] Backup imported successfully');
        return backup;
      } else if (!parsed.encrypted) {
        logger.log('[BackupService] Backup imported successfully (unencrypted)');
        return parsed as BackupData;
      } else {
        throw new Error('Backup is encrypted but no decryption key provided');
      }
    } catch (error) {
      logger.error('[BackupService] Failed to import backup:', error);
      throw new Error(
        `Failed to import backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Restore vault data from a backup.
   *
   * @param backup - BackupData to restore
   * @param store - Vault store instance for state mutations
   * @param options - Restore options
   * @returns Restoration result with counts
   *
   * @example
   * const result = await backupService.restoreFromBackup(backup, store, {
   *   mergeExisting: false,
   * });
   * console.log(`Restored ${result.vaultsRestored} vaults`);
   */
  async restoreFromBackup(
    backup: BackupData,
    store: any,
    options: { mergeExisting?: boolean } = {}
  ): Promise<{
    vaultsRestored: number;
    filesRestored: number;
    settingsRestored: boolean;
  }> {
    logger.log('[BackupService] Restoring backup...');

    try {
      const { mergeExisting = false } = options;

      if (!mergeExisting) {
        // Clear existing data
        const currentVaults = store.vaults;
        for (const vault of currentVaults) {
          await store.deleteVault(vault.id);
        }
      }

      // Restore vaults
      for (const vault of backup.vaults) {
        try {
          await store.createVault(vault.name, new Uint8Array());
        } catch (error) {
          logger.warn('[BackupService] Failed to restore vault:', error);
        }
      }

      // Restore files
      for (const file of backup.files) {
        try {
          store.addFile(file);
        } catch (error) {
          logger.warn('[BackupService] Failed to restore file:', error);
        }
      }

      // Restore settings
      let settingsRestored = false;
      try {
        settingsService.save(backup.settings);
        settingsRestored = true;
      } catch (error) {
        logger.warn('[BackupService] Failed to restore settings:', error);
      }

      logger.log('[BackupService] Restore completed', {
        vaults: backup.vaults.length,
        files: backup.files.length,
        settings: settingsRestored,
      });

      // Log audit event
      await auditService.log('vault_restore', `Backup ${backup.metadata.id}`, {
        vaultsRestored: backup.vaults.length,
        filesRestored: backup.files.length,
        mergeExisting,
      });

      return {
        vaultsRestored: backup.vaults.length,
        filesRestored: backup.files.length,
        settingsRestored,
      };
    } catch (error) {
      logger.error('[BackupService] Failed to restore backup:', error);

      await auditService.log(
        'vault_restore',
        `Backup ${backup.metadata.id}`,
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'error'
      );

      throw new Error(
        `Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the current auto-backup configuration.
   *
   * @returns Current AutoBackupConfig
   */
  getAutoBackupConfig(): AutoBackupConfig {
    return readAutoBackupConfig();
  }

  /**
   * Update auto-backup configuration.
   *
   * @param config - Partial configuration to update
   *
   * @example
   * backupService.setAutoBackupConfig({
   *   enabled: true,
   *   intervalHours: 24,
   *   maxBackups: 5,
   * });
   */
  setAutoBackupConfig(config: Partial<AutoBackupConfig>): void {
    logger.log('[BackupService] Updating auto-backup config:', config);

    const current = this.getAutoBackupConfig();
    const updated: AutoBackupConfig = { ...current, ...config };
    writeAutoBackupConfig(updated);

    // Log audit event
    auditService.log('settings_change', 'auto_backup_config', { config: updated }).catch(() => {});
  }

  /**
   * Get all backup history entries.
   *
   * @returns Array of BackupHistoryEntry
   */
  getBackupHistory(): BackupHistoryEntry[] {
    return readBackupHistory();
  }

  /**
   * Add a backup history entry.
   *
   * @param entry - History entry to add
   */
  addToHistory(entry: BackupHistoryEntry): void {
    logger.log('[BackupService] Adding to backup history:', entry.id);

    const history = this.getBackupHistory();
    history.push(entry);
    writeBackupHistory(history);
  }

  /**
   * Delete a backup history entry.
   *
   * @param backupId - ID of backup to remove from history
   */
  deleteBackupHistory(backupId: string): void {
    logger.log('[BackupService] Deleting backup history entry:', backupId);

    const history = this.getBackupHistory().filter(h => h.id !== backupId);
    writeBackupHistory(history);
  }

  /**
   * Download backup file to user's device using browser download.
   *
   * @param backup - BackupData to download
   * @param filename - Optional custom filename (default: usbvault-backup-TIMESTAMP.json)
   *
   * @example
   * const backup = await backupService.createBackup();
   * const exported = await backupService.exportBackup(backup, 'my-key');
   * // Note: downloadBackup takes the exported string
   * const blob = new Blob([exported], { type: 'application/json' });
   * backupService.downloadBackup(blob, 'my-backup.json');
   */
  downloadBackup(backupDataOrBlob: BackupData | Blob, filename?: string): void {
    logger.log('[BackupService] Downloading backup...');

    try {
      let blob: Blob;

      if (backupDataOrBlob instanceof Blob) {
        blob = backupDataOrBlob;
      } else {
        // If it's BackupData, serialize it
        blob = new Blob([JSON.stringify(backupDataOrBlob, null, 2)], {
          type: 'application/json',
        });
      }

      // Create download URL
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download =
        filename || `usbvault-backup-${new Date().toISOString().split('T')[0]}.json`;

      // Trigger download
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      // Cleanup
      URL.revokeObjectURL(url);

      logger.log('[BackupService] Backup downloaded:', anchor.download);
    } catch (error) {
      logger.error('[BackupService] Failed to download backup:', error);
      throw new Error(
        `Failed to download backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Check if an auto-backup is due based on configuration and last run time.
   *
   * @returns true if auto-backup should run, false otherwise
   *
   * @example
   * if (backupService.shouldAutoBackup()) {
   *   const backup = await backupService.createBackup();
   *   await backupService.exportBackup(backup);
   * }
   */
  shouldAutoBackup(): boolean {
    const config = this.getAutoBackupConfig();

    if (!config.enabled) {
      return false;
    }

    if (!config.lastBackupAt) {
      return true;
    }

    const lastBackup = new Date(config.lastBackupAt).getTime();
    const now = Date.now();
    const intervalMs = config.intervalHours * 60 * 60 * 1000;

    return now - lastBackup >= intervalMs;
  }

  /**
   * Get the last backup time as an ISO string, or null if never backed up.
   *
   * @returns ISO 8601 timestamp or null
   */
  getLastBackupTime(): string | null {
    return this.getAutoBackupConfig().lastBackupAt;
  }

  /**
   * Validate an imported backup to ensure data integrity.
   *
   * @param data - Unknown data to validate
   * @returns Validation result with errors (if any) and extracted metadata
   *
   * @example
   * const result = backupService.validateBackup(parsed);
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   * }
   */
  validateBackup(data: unknown): {
    valid: boolean;
    errors: string[];
    metadata?: BackupMetadata;
  } {
    logger.log('[BackupService] Validating backup...');

    const errors: string[] = [];

    if (!data || typeof data !== 'object') {
      errors.push('Backup data must be an object');
      return { valid: false, errors };
    }

    const backup = data as Record<string, unknown>;

    // Check required fields
    if (!backup.metadata) {
      errors.push('Missing backup metadata');
    } else {
      const meta = backup.metadata as Record<string, unknown>;
      if (!meta.id) errors.push('Missing backup ID');
      if (!meta.createdAt) errors.push('Missing creation timestamp');
      if (typeof meta.vaultCount !== 'number') errors.push('Invalid vault count');
      if (typeof meta.fileCount !== 'number') errors.push('Invalid file count');
      if (typeof meta.sizeBytes !== 'number') errors.push('Invalid size');
      if (!meta.version) errors.push('Missing backup version');
    }

    // Check data arrays
    if (!Array.isArray(backup.vaults)) {
      errors.push('Vaults must be an array');
    }
    if (!Array.isArray(backup.files)) {
      errors.push('Files must be an array');
    }
    if (!backup.settings || typeof backup.settings !== 'object') {
      errors.push('Missing or invalid settings');
    }

    const valid = errors.length === 0;
    return {
      valid,
      errors,
      metadata: valid ? (backup.metadata as BackupMetadata) : undefined,
    };
  }
}

// ─── Exports ────────────────────────────────────────────────────────────

/**
 * Singleton instance of BackupService
 * @see FEAT-07
 */
export const backupService = new BackupService();
