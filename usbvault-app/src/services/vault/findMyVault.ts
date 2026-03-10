// PH4-FIX: Moved to vault domain
import { auditService } from '@/services/auditService';
import { logger } from '@/utils/logger';

export interface ScanResult {
  id: string;
  path: string;
  vaultName: string;
  size: number;
  lastModified: number;
  isEncrypted: boolean;
  isCorrupted: boolean;
  integrityHash: string;
}

export interface ScanProgress {
  status: 'idle' | 'scanning' | 'complete' | 'error';
  scannedPaths: number;
  totalFound: number;
  currentPath: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
}

export interface ScanHistoryEntry {
  date: number;
  found: number;
  duration: number;
}

class FindMyVaultService {
  private scanProgress: ScanProgress = {
    status: 'idle',
    scannedPaths: 0,
    totalFound: 0,
    currentPath: '',
  };
  private lastScanResults: ScanResult[] = [];
  private knownVaultLocations: string[] = [];
  private scanAborted = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const results = localStorage.getItem('usbvault:vault_scan_results');
      const locations = localStorage.getItem('usbvault:known_vault_locations');

      if (results) {
        this.lastScanResults = JSON.parse(results);
      }
      if (locations) {
        this.knownVaultLocations = JSON.parse(locations);
      }
    } catch (error) {
      console.error('Failed to load vault scan data from storage:', error);
      this.lastScanResults = [];
      this.knownVaultLocations = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('usbvault:vault_scan_results', JSON.stringify(this.lastScanResults));
      localStorage.setItem(
        'usbvault:known_vault_locations',
        JSON.stringify(this.knownVaultLocations)
      );
    } catch (error) {
      console.error('Failed to save vault scan data to storage:', error);
    }
  }

  async startScan(rootPaths?: string[]): Promise<ScanResult[]> {
    this.scanAborted = false;
    const pathsToScan = rootPaths || this.getDefaultScanPaths();

    this.scanProgress = {
      status: 'scanning',
      scannedPaths: 0,
      totalFound: 0,
      currentPath: '',
      startedAt: Date.now(),
    };

    try {
      const results: ScanResult[] = [];

      for (const rootPath of pathsToScan) {
        if (this.scanAborted) break;

        this.scanProgress.currentPath = rootPath;
        const vaults = await this.scanDirectory(rootPath);
        results.push(...vaults);
        this.scanProgress.totalFound = results.length;
        this.scanProgress.scannedPaths++;
      }

      this.scanProgress.status = 'complete';
      this.scanProgress.completedAt = Date.now();
      this.scanProgress.duration = (this.scanProgress.completedAt - (this.scanProgress.startedAt || 0)) / 1000;

      this.lastScanResults = results;
      this.saveToStorage();

      await auditService.log('VAULT_SCAN_COMPLETED' as any, 'vault_scanner', {
        totalFound: results.length,
        duration: this.scanProgress.duration,
      });

      return results;
    } catch (error) {
      this.scanProgress.status = 'error';
      this.scanProgress.completedAt = Date.now();
      this.scanProgress.duration = (this.scanProgress.completedAt - (this.scanProgress.startedAt || 0)) / 1000;

      await auditService.log('VAULT_SCAN_FAILED' as any, 'vault_scanner', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  private async scanDirectory(dirPath: string): Promise<ScanResult[]> {
    // Simulated scan - in real implementation would scan filesystem
    const results: ScanResult[] = [];

    // Simulate finding a vault in known locations
    if (this.knownVaultLocations.includes(dirPath)) {
      const mockVault: ScanResult = {
        id: `vault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        path: dirPath,
        vaultName: dirPath.split('/').pop() || 'vault',
        size: Math.floor(Math.random() * 1000000000), // Random size up to 1GB
        lastModified: Date.now() - Math.random() * 86400000, // Random time in last 24h
        isEncrypted: true,
        isCorrupted: false,
        integrityHash: Math.random().toString(36).substr(2),
      };
      results.push(mockVault);
    }

    return results;
  }

  private getDefaultScanPaths(): string[] {
    return ['/home', '/Users', '/Documents'];
  }

  getScanProgress(): ScanProgress {
    return { ...this.scanProgress };
  }

  cancelScan(): void {
    this.scanAborted = true;
    if (this.scanProgress.status === 'scanning') {
      this.scanProgress.status = 'complete';
      this.scanProgress.completedAt = Date.now();
    }
  }

  getLastScanResults(): ScanResult[] {
    return [...this.lastScanResults];
  }

  async verifyVaultIntegrity(path: string): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const vault = this.lastScanResults.find((v) => v.path === path);
      if (!vault) {
        return { valid: false, errors: ['Vault not found in scan results'] };
      }

      // Simulate integrity verification
      const errors: string[] = [];
      if (vault.isCorrupted) {
        errors.push('Vault files appear corrupted');
      }

      const valid = !vault.isCorrupted && vault.integrityHash.length > 0;

      await auditService.log('VAULT_INTEGRITY_CHECK' as any, `vault:${path}`, {
        valid,
        errors: errors.length > 0 ? errors : undefined,
      });

      return { valid, errors: errors.length > 0 ? errors : undefined };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Verification failed'],
      };
    }
  }

  openVaultLocation(path: string): void {
    // Stub implementation - would open file explorer in real app
    logger.debug(`Opening vault location: ${path}`);
  }

  getScanHistory(): Array<{ date: number; found: number; duration: number }> {
    // Simulated history - in real app would track multiple scans
    if (this.scanProgress.completedAt && this.scanProgress.duration) {
      return [
        {
          date: this.scanProgress.completedAt,
          found: this.scanProgress.totalFound,
          duration: this.scanProgress.duration,
        },
      ];
    }
    return [];
  }

  getKnownVaultLocations(): string[] {
    return [...this.knownVaultLocations];
  }

  addKnownLocation(path: string): void {
    if (!this.knownVaultLocations.includes(path)) {
      this.knownVaultLocations.push(path);
      this.saveToStorage();

      auditService.log('VAULT_LOCATION_ADDED' as any, `vault_path:${path}`, {
        path,
      });
    }
  }

  removeKnownLocation(path: string): void {
    const index = this.knownVaultLocations.indexOf(path);
    if (index !== -1) {
      this.knownVaultLocations.splice(index, 1);
      this.saveToStorage();

      auditService.log('VAULT_LOCATION_REMOVED' as any, `vault_path:${path}`, {
        path,
      });
    }
  }
}

export const findMyVaultService = new FindMyVaultService();
