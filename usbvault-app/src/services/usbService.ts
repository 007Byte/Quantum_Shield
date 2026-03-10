/**
 * usbService.ts — USB Drive Detection & Vault Provisioning
 *
 * Calls the QAV backend API for all USB-related operations:
 *   - Listing connected USB drives
 *   - Provisioning an encrypted vault on a drive
 *   - Resetting (wiping) a vault drive
 *
 * On web the backend acts as the bridge to the host OS's USB subsystem.
 * On native (Electron/Tauri desktop) the same API is used so both
 * platforms share one code path.
 */

import { getApiClient } from './api';
import { auditService } from './auditService';

// ── Types ──────────────────────────────────────────────────────────────

export interface USBDrive {
  id: string;
  name: string;
  capacity: string;
  device: string;       // e.g. /dev/sdb, \\.\PhysicalDrive1
  available: boolean;   // false if currently mounted as a system disk
  hasVault: boolean;    // true if drive already contains a QAV vault
}

export interface ProvisionParams {
  driveId: string;
  formatType: 'quick' | 'full';
  fileSystem: 'exfat' | 'ntfs' | 'ext4';
  masterPassword: string;
}

export interface ProvisionResult {
  vaultId: string;
  recoveryPhrase: string[];   // 24-word BIP39 phrase shown once
}

export interface ResetParams {
  driveId: string;
  wipeMethod: 'quick' | 'secure';
  passes?: number;             // only for wipeMethod === 'secure'
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Narrow an API error down to a human-readable message. */
function extractMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    // Axios shape
    if (e.response && typeof e.response === 'object') {
      const r = e.response as Record<string, unknown>;
      if (r.data && typeof r.data === 'object') {
        const d = r.data as Record<string, unknown>;
        if (typeof d.message === 'string') return d.message;
        if (typeof d.error === 'string') return d.error;
      }
    }
    if (typeof e.message === 'string') return e.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

// ── Service ────────────────────────────────────────────────────────────

class UsbServiceImpl {
  /**
   * Return all currently-connected USB block devices.
   * The backend enumerates them via the OS (lsblk / diskutil / WMI).
   */
  async listDrives(): Promise<USBDrive[]> {
    try {
      const client = getApiClient();
      const { data } = await client.get<{ drives: USBDrive[] }>('/usb/drives');
      return data.drives ?? [];
    } catch (err) {
      auditService.log('system', 'usb_list_drives_failed', { error: extractMessage(err) }, 'error').catch(() => {});
      throw new Error(extractMessage(err));
    }
  }

  /**
   * Provision a new encrypted vault on the selected drive.
   * The backend formats the drive, applies encryption, and returns the
   * vault ID and one-time recovery phrase.
   */
  async provisionVault(params: ProvisionParams): Promise<ProvisionResult> {
    try {
      const client = getApiClient();
      const { data } = await client.post<ProvisionResult>('/usb/provision', {
        drive_id: params.driveId,
        format_type: params.formatType,
        file_system: params.fileSystem,
        master_password: params.masterPassword,
      });
      auditService.log('vault', 'usb_vault_provisioned', { driveId: params.driveId }, 'success').catch(() => {});
      return data;
    } catch (err) {
      auditService.log('vault', 'usb_provision_failed', { driveId: params.driveId, error: extractMessage(err) }, 'error').catch(() => {});
      throw new Error(extractMessage(err));
    }
  }

  /**
   * Wipe and reset a vault drive.
   * Quick erase removes keys/metadata; secure wipe overwrites with random data.
   */
  async resetDrive(params: ResetParams): Promise<void> {
    try {
      const client = getApiClient();
      await client.post('/usb/reset', {
        drive_id: params.driveId,
        wipe_method: params.wipeMethod,
        passes: params.passes ?? 1,
      });
      auditService.log('vault', 'usb_drive_reset', { driveId: params.driveId, method: params.wipeMethod }, 'success').catch(() => {});
    } catch (err) {
      auditService.log('vault', 'usb_reset_failed', { driveId: params.driveId, error: extractMessage(err) }, 'error').catch(() => {});
      throw new Error(extractMessage(err));
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

export const usbService = new UsbServiceImpl();
