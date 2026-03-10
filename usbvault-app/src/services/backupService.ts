/**
 * PH4-FIX: Stub for backup service.
 * TODO: Implement backup/restore functionality.
 */

export interface BackupMetadata {
  id: string;
  createdAt: string;
  vaultCount: number;
  totalSize: number;
}

export interface BackupData {
  metadata: BackupMetadata;
  data: Uint8Array;
}

class BackupServiceStub {
  async createBackup(): Promise<BackupData> {
    return {
      metadata: { id: '', createdAt: new Date().toISOString(), vaultCount: 0, totalSize: 0 },
      data: new Uint8Array(0),
    };
  }

  async restoreBackup(_data: BackupData): Promise<void> {
    // Stub
  }

  async listBackups(): Promise<BackupMetadata[]> {
    return [];
  }
}

export const backupService = new BackupServiceStub();
