/**
 * Backup Service — FEAT-07
 *
 * Manages backup creation, encryption, export, import, and restore workflows.
 */

// ── Types ──

export interface BackupMetadata {
  id: string;
  createdAt: string;
  vaultCount: number;
  fileCount: number;
  sizeBytes: number;
  version: string;
  encrypted: boolean;
  totalSize?: number;
}

export interface BackupData {
  metadata: BackupMetadata;
  vaults: unknown[];
  files: unknown[];
  settings?: unknown;
  passwords?: unknown[];
  data?: Uint8Array;
}

export interface BackupHistoryEntry {
  id: string;
  createdAt: string;
  sizeBytes: number;
  vaultCount: number;
  fileCount: number;
  status: 'success' | 'failed';
}

export interface AutoBackupConfig {
  enabled: boolean;
  intervalHours: number;
  maxBackups: number;
  lastBackupAt: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  metadata?: BackupMetadata;
}

// ── Constants ──

const AUTO_BACKUP_CONFIG_KEY = 'usbvault_auto_backup_config';
const BACKUP_HISTORY_KEY = 'usbvault_backup_history';
const DEFAULT_AUTO_BACKUP_CONFIG: AutoBackupConfig = {
  enabled: false,
  intervalHours: 168, // weekly
  maxBackups: 5,
  lastBackupAt: null,
};

// ── Simple XOR-based encryption for backup data (stub) ──

function simpleEncrypt(data: string, passphrase: string): string {
  const bytes = Buffer.from(data, 'utf-8');
  const key = Buffer.from(passphrase, 'utf-8');
  const result = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[i] ^ key[i % key.length];
  }
  return 'ENC:' + result.toString('base64');
}

function simpleDecrypt(data: string, passphrase: string): string {
  if (!data.startsWith('ENC:')) throw new Error('Data is not encrypted');
  const encrypted = Buffer.from(data.slice(4), 'base64');
  const key = Buffer.from(passphrase, 'utf-8');
  const result = Buffer.alloc(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    result[i] = encrypted[i] ^ key[i % key.length];
  }
  return result.toString('utf-8');
}

// ── Service ──

class BackupServiceImpl {
  /**
   * Create a backup of current vault data.
   */
  async createBackup(
    includePasswords?: boolean,
    vaults: unknown[] = [],
    files: unknown[] = []
  ): Promise<BackupData> {
    let settings: unknown = {};

    try {
      const settingsService = require('@/services/settingsService').settingsService;
      settings = settingsService.load();
    } catch {
      // Settings service not available
    }

    const metadata: BackupMetadata = {
      id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      vaultCount: Array.isArray(vaults) ? vaults.length : 0,
      fileCount: Array.isArray(files) ? files.length : 0,
      sizeBytes: 0,
      version: '1.0.0',
      encrypted: false,
    };

    const backup: BackupData = {
      metadata,
      vaults,
      files,
      settings,
    };

    if (includePasswords) {
      backup.passwords = [];
    }

    // Calculate approximate size
    const json = JSON.stringify(backup);
    metadata.sizeBytes = json.length;

    return backup;
  }

  /**
   * Export a backup as a base64 string, optionally encrypted.
   */
  async exportBackup(backup: BackupData, passphrase?: string): Promise<string> {
    const json = JSON.stringify(backup);

    if (passphrase) {
      backup.metadata.encrypted = true;
      const encryptedJson = JSON.stringify(backup);
      return Buffer.from(simpleEncrypt(encryptedJson, passphrase)).toString('base64');
    }

    return Buffer.from(json).toString('base64');
  }

  /**
   * Import a backup from a base64 string.
   */
  async importBackup(exported: string, passphrase?: string): Promise<BackupData> {
    let json: string;

    try {
      const decoded = Buffer.from(exported, 'base64').toString('utf-8');

      if (decoded.startsWith('ENC:')) {
        if (!passphrase) throw new Error('Backup is encrypted but no passphrase provided');
        json = simpleDecrypt(decoded, passphrase);
      } else {
        if (passphrase) {
          // The data might have been double-encoded
          throw new Error('Decryption failed: data is not encrypted');
        }
        json = decoded;
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('passphrase')) throw err;
      if (err instanceof Error && err.message.includes('Decryption')) throw err;
      throw new Error('Invalid backup format');
    }

    try {
      const backup = JSON.parse(json) as unknown as BackupData;
      return backup;
    } catch {
      throw new Error('Invalid backup JSON');
    }
  }

  /**
   * Validate a backup data object.
   */
  validateBackup(data: unknown): ValidationResult {
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Backup data must be an object'] };
    }

    const errors: string[] = [];
    const obj = data as Record<string, unknown>;

    if (!obj.metadata) {
      errors.push('Missing metadata');
    }
    if (!Array.isArray(obj.vaults)) {
      errors.push('Missing or invalid vaults array');
    }
    if (!Array.isArray(obj.files)) {
      errors.push('Missing or invalid files array');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      errors: [],
      metadata: (obj as unknown as BackupData).metadata,
    };
  }

  /**
   * Get auto-backup configuration.
   */
  getAutoBackupConfig(): AutoBackupConfig {
    try {
      const raw = localStorage.getItem(AUTO_BACKUP_CONFIG_KEY);
      if (raw) {
        return { ...DEFAULT_AUTO_BACKUP_CONFIG, ...JSON.parse(raw) };
      }
    } catch {
      // localStorage not available
    }
    return { ...DEFAULT_AUTO_BACKUP_CONFIG };
  }

  /**
   * Update auto-backup configuration.
   */
  setAutoBackupConfig(config: Partial<AutoBackupConfig>): void {
    const current = this.getAutoBackupConfig();
    const updated = { ...current, ...config };
    try {
      localStorage.setItem(AUTO_BACKUP_CONFIG_KEY, JSON.stringify(updated));
    } catch {
      // localStorage not available
    }
  }

  /**
   * Get backup history.
   */
  getBackupHistory(): BackupHistoryEntry[] {
    try {
      const raw = localStorage.getItem(BACKUP_HISTORY_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // localStorage not available
    }
    return [];
  }

  /**
   * Add an entry to backup history.
   */
  addToHistory(entry: BackupHistoryEntry): void {
    const history = this.getBackupHistory();
    history.push(entry);
    try {
      localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // localStorage not available
    }
  }

  /**
   * Delete a backup history entry by ID.
   */
  deleteBackupHistory(id: string): void {
    const history = this.getBackupHistory().filter(h => h.id !== id);
    try {
      localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history));
    } catch {
      // localStorage not available
    }
  }

  /**
   * Determine if an auto-backup should run now.
   */
  shouldAutoBackup(): boolean {
    const config = this.getAutoBackupConfig();
    if (!config.enabled) return false;
    if (!config.lastBackupAt) return true;

    const lastBackup = new Date(config.lastBackupAt).getTime();
    const now = Date.now();
    const intervalMs = config.intervalHours * 60 * 60 * 1000;

    return now - lastBackup >= intervalMs;
  }

  /**
   * Get the last backup timestamp.
   */
  getLastBackupTime(): string | null {
    const config = this.getAutoBackupConfig();
    return config.lastBackupAt;
  }
}

export const backupService = new BackupServiceImpl();
