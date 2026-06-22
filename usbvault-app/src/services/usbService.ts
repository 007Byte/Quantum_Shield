/**
 * usbService.ts — USB Drive Detection & Vault Provisioning
 *
 * Transport priority:
 *   1. Electron IPC bridge (window.electronBridge) — direct, no HTTP roundtrip
 *   2. HTTP to USB Companion service (localhost:3001) — fallback for non-Electron
 *
 * Architecture:
 *   Electron:     Renderer ──IPC──▶ Main Process ──direct──▶ companion services
 *   Web/Standalone: Browser ──HTTP──▶ USB Companion (localhost:3001) ──OS──▶ lsblk/diskutil/WMI
 *
 * The companion runs on the user's machine and bridges to the OS USB subsystem.
 * This is NOT the remote Go backend (api.usbvault.com) — USB is inherently local.
 */

import axios, { AxiosInstance } from 'axios';
import { auditService } from './auditService';
import { usbDebug } from '@/utils/usbDebugTracer';

// ── Electron IPC Bridge Detection ────────────────────────────────────
// When running inside Electron, the preload script exposes window.electronBridge
// with direct IPC methods. This is faster and more reliable than HTTP.

function getElectronBridge(): NonNullable<typeof window.electronBridge> | null {
  if (typeof window !== 'undefined' && window.electronBridge?.isElectron) {
    return window.electronBridge;
  }
  return null;
}

// ── Local Companion HTTP Client (fallback) ───────────────────────────

const USB_COMPANION_URL = process.env.EXPO_PUBLIC_USB_COMPANION_URL || 'http://localhost:3001';

let companionClient: AxiosInstance | null = null;

function getCompanionClient(): AxiosInstance {
  if (!companionClient) {
    companionClient = axios.create({
      baseURL: USB_COMPANION_URL,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return companionClient;
}

// ── Types ──────────────────────────────────────────────────────────────

export interface CompactResult {
  entries: Array<{ id: string; offset: number; length: number }>;
  newOffsets: Record<string, { offset: number; length: number }>;
  oldSize: number;
  newSize: number;
  spaceSaved: number;
}

export interface USBDrive {
  id: string;
  name: string;
  capacity: string;
  device: string; // e.g. /dev/sdb, \\.\PhysicalDrive1
  available: boolean; // false if currently mounted as a system disk
  hasVault: boolean; // true if drive already contains a USBVault vault
  /** Partitions detected on this drive */
  partitions?: USBPartition[];
}

export interface ProvisionParams {
  driveId: string;
  formatType: 'quick' | 'full';
  fileSystem: FileSystemId | 'exfat' | 'ntfs' | 'ext4';
  masterPassword: string;
  /** Optional vault display name */
  vaultName?: string;
  /** Optional partition label */
  partitionName?: string;
  /** Selected cipher algorithm identifier */
  cipherAlgorithm?: string;
  /** Admin/sudo password for elevated provisioning */
  adminPassword?: string;
}

export interface ProvisionResult {
  vaultId: string;
  recoveryPhrase: string[]; // 24-word BIP39 phrase shown once
  /** Secure mount point path set during provisioning */
  secureMountPoint?: string;
}

/** Identifies a file system type supported for vault provisioning */
export type FileSystemId = 'exfat' | 'ntfs' | 'ext4' | 'apfs' | 'hfs+';

/** A partition on a USB drive */
export interface USBPartition {
  id: string;
  label: string;
  fileSystem: string;
  size: string;
  mountPoint?: string;
  mountpoint?: string; // lowercase alias for Go backend compatibility
  fstype?: string; // filesystem type from OS-level detection
  hasVault: boolean;
}

/** A file stored in the vault container */
export interface VaultFile {
  id: string;
  name: string;
  size: number;
  encryptedSize: number;
  createdAt: string;
  modifiedAt: string;
  contentHash?: string;
}

/** Result from an append operation — includes the written offset and length */
export interface AppendResult {
  offset: number;
  length: number;
}

export interface ResetParams {
  driveId: string;
  wipeMethod: 'quick' | 'secure';
  passes?: number; // only for wipeMethod === 'secure'
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
  async listDrives(options?: { signal?: AbortSignal }): Promise<USBDrive[]> {
    usbDebug.traceEntry('listDrives', { hasAbortSignal: !!options?.signal });
    try {
      // Prefer Electron IPC when available (no HTTP roundtrip)
      const bridge = getElectronBridge();
      if (bridge) {
        try {
          const drives = await bridge.listDrives();
          const result = (drives ?? []) as USBDrive[];
          usbDebug.traceExit('listDrives', { driveCount: result.length });
          return result;
        } catch (err) {
          throw new Error(extractMessage(err));
        }
      }

      const client = getCompanionClient();
      const { data } = await client.get<{ drives: USBDrive[] }>('/usb/drives', {
        signal: options?.signal,
      });
      const result = data.drives ?? [];
      usbDebug.traceExit('listDrives', { driveCount: result.length });
      return result;
    } catch (err) {
      // Detect companion-down specifically
      const isConnectionError =
        (err as any)?.code === 'ECONNREFUSED' ||
        (err as any)?.code === 'ERR_NETWORK' ||
        (err as any)?.message?.includes('Network Error') ||
        (err as any)?.message?.includes('ECONNREFUSED');

      if (isConnectionError) {
        const error = new Error('USB_COMPANION_UNAVAILABLE');
        usbDebug.traceError('listDrives', error);
        throw error;
      }

      auditService
        .log('system', 'usb_list_drives_failed', { error: extractMessage(err) }, 'error')
        .catch(() => {});
      usbDebug.traceError('listDrives', err);
      throw new Error(extractMessage(err));
    }
  }

  /**
   * Provision a new encrypted vault on the selected drive.
   * The backend formats the drive, applies encryption, and returns the
   * vault ID and one-time recovery phrase.
   */
  async provisionVault(params: ProvisionParams): Promise<ProvisionResult> {
    usbDebug.traceEntry('provisionVault', {
      driveId: params.driveId,
      formatType: params.formatType,
      fileSystem: params.fileSystem,
      vaultName: params.vaultName,
      cipherAlgorithm: params.cipherAlgorithm,
    });
    try {
      // Prefer Electron IPC when available (bypass HTTP for provisioning)
      const bridge = getElectronBridge();
      let data: ProvisionResult;

      if (bridge && typeof bridge.provisionVault === 'function') {
        data = await bridge.provisionVault({
          driveId: params.driveId,
          formatType: params.formatType,
          fileSystem: params.fileSystem,
          masterPassword: params.masterPassword,
          vaultName: params.vaultName,
          partitionName: params.partitionName,
          cipherAlgorithm: params.cipherAlgorithm,
          adminPassword: params.adminPassword,
        });
      } else {
        const client = getCompanionClient();
        const response = await client.post<ProvisionResult>('/usb/provision', {
          drive_id: params.driveId,
          format_type: params.formatType,
          file_system: params.fileSystem,
          master_password: params.masterPassword,
          vault_name: params.vaultName,
          partition_name: params.partitionName,
          cipher_algorithm: params.cipherAlgorithm,
          confirm: true,
        });
        data = response.data;
      }
      auditService
        .log('vault', 'usb_vault_provisioned', { driveId: params.driveId }, 'success')
        .catch(() => {});
      usbDebug.traceExit('provisionVault', { vaultId: data.vaultId });
      return data;
    } catch (err) {
      const isConnectionError =
        (err as any)?.code === 'ECONNREFUSED' ||
        (err as any)?.code === 'ERR_NETWORK' ||
        (err as any)?.message?.includes('Network Error') ||
        (err as any)?.message?.includes('ECONNREFUSED');

      if (isConnectionError) {
        const error = new Error('USB_COMPANION_UNAVAILABLE');
        usbDebug.traceError('provisionVault', error);
        throw error;
      }

      auditService
        .log(
          'vault',
          'usb_provision_failed',
          { driveId: params.driveId, error: extractMessage(err) },
          'error'
        )
        .catch(() => {});
      usbDebug.traceError('provisionVault', err);
      throw new Error(extractMessage(err));
    }
  }

  /**
   * Wipe and reset a vault drive.
   * Quick erase removes keys/metadata; secure wipe overwrites with random data.
   */
  async resetDrive(params: ResetParams): Promise<void> {
    try {
      const client = getCompanionClient();
      await client.post('/usb/reset', {
        drive_id: params.driveId,
        wipe_method: params.wipeMethod,
        passes: params.passes ?? 1,
        confirm: true,
      });
      auditService
        .log(
          'vault',
          'usb_drive_reset',
          { driveId: params.driveId, method: params.wipeMethod },
          'success'
        )
        .catch(() => {});
    } catch (err) {
      const isConnectionError =
        (err as any)?.code === 'ECONNREFUSED' ||
        (err as any)?.code === 'ERR_NETWORK' ||
        (err as any)?.message?.includes('Network Error') ||
        (err as any)?.message?.includes('ECONNREFUSED');

      if (isConnectionError) {
        throw new Error('USB_COMPANION_UNAVAILABLE');
      }

      auditService
        .log(
          'vault',
          'usb_reset_failed',
          { driveId: params.driveId, error: extractMessage(err) },
          'error'
        )
        .catch(() => {});
      throw new Error(extractMessage(err));
    }
  }

  // ── Vault Container I/O (calls USB Companion API) ──────────────────
  // The companion uses raw binary (application/octet-stream) for all
  // container I/O, with mountPoint as a query parameter.
  // Routes are under /usb/vault/container/* (mounted at /usb in server.js).

  /** Initialize a new VAULT.bin container file on the USB drive. */
  async initVaultContainer(mountPoint: string, headerBytes: Uint8Array): Promise<void> {
    usbDebug.traceEntry('initVaultContainer', {
      mountPoint,
      headerSize: headerBytes.length,
    });
    try {
      const client = getCompanionClient();
      await client.post('/usb/vault/init', headerBytes, {
        params: { mountPoint },
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      usbDebug.traceExit('initVaultContainer', { success: true });
    } catch (err) {
      usbDebug.traceError('initVaultContainer', err);
      throw err;
    }
  }

  /** Append encrypted bytes to the vault container. Returns offset and length. */
  async appendVaultBytes(mountPoint: string, data: Uint8Array): Promise<AppendResult> {
    usbDebug.traceEntry('appendVaultBytes', {
      mountPoint,
      dataSize: data.length,
    });
    try {
      const bridge = getElectronBridge();
      if (bridge) {
        const result = await bridge.appendBytes(mountPoint, data);
        // IPC passes through vaultContainerService.appendBytes() which returns { offset, length }
        const appendResult = { offset: result.offset, length: result.length };
        usbDebug.traceExit('appendVaultBytes', appendResult);
        return appendResult;
      }

      const client = getCompanionClient();
      const { data: result } = await client.post<AppendResult>(
        '/usb/vault/container/append',
        data,
        {
          params: { mountPoint },
          headers: { 'Content-Type': 'application/octet-stream' },
        }
      );
      usbDebug.traceExit('appendVaultBytes', result);
      return result;
    } catch (err) {
      usbDebug.traceError('appendVaultBytes', err);
      throw err;
    }
  }

  /** Write (overwrite) the vault header at the start of the container. */
  async writeVaultHeader(mountPoint: string, headerBytes: Uint8Array): Promise<void> {
    usbDebug.traceEntry('writeVaultHeader', {
      mountPoint,
      headerSize: headerBytes.length,
    });
    try {
      const bridge = getElectronBridge();
      if (bridge) {
        await bridge.writeHeader(mountPoint, headerBytes);
        usbDebug.traceExit('writeVaultHeader', { success: true });
        return;
      }

      const client = getCompanionClient();
      await client.put('/usb/vault/container/header', headerBytes, {
        params: { mountPoint },
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      usbDebug.traceExit('writeVaultHeader', { success: true });
    } catch (err) {
      usbDebug.traceError('writeVaultHeader', err);
      throw err;
    }
  }

  /** Read the vault header from the container. */
  async readVaultHeader(mountPoint: string): Promise<Uint8Array> {
    usbDebug.traceEntry('readVaultHeader', { mountPoint });
    try {
      const bridge = getElectronBridge();
      if (bridge) {
        const buf = await bridge.readHeader(mountPoint);
        const result = new Uint8Array(buf);
        usbDebug.traceExit('readVaultHeader', { headerSize: result.length });
        return result;
      }

      const client = getCompanionClient();
      const { data } = await client.get('/usb/vault/container/header', {
        params: { mountPoint },
        responseType: 'arraybuffer',
      });
      const result = new Uint8Array(data);
      usbDebug.traceExit('readVaultHeader', { headerSize: result.length });
      return result;
    } catch (err) {
      usbDebug.traceError('readVaultHeader', err);
      throw err;
    }
  }

  /** Read a range of encrypted bytes from the vault container. */
  async readVaultBytes(mountPoint: string, offset: number, length: number): Promise<Uint8Array> {
    usbDebug.traceEntry('readVaultBytes', { mountPoint, offset, length });
    try {
      const bridge = getElectronBridge();
      if (bridge) {
        const buf = await bridge.readBytes(mountPoint, offset, length);
        const result = new Uint8Array(buf);
        usbDebug.traceExit('readVaultBytes', { bytesRead: result.length });
        return result;
      }

      const client = getCompanionClient();
      const { data } = await client.get('/usb/vault/container/bytes', {
        params: { mountPoint, offset, length },
        responseType: 'arraybuffer',
      });
      const result = new Uint8Array(data);
      usbDebug.traceExit('readVaultBytes', { bytesRead: result.length });
      return result;
    } catch (err) {
      usbDebug.traceError('readVaultBytes', err);
      throw err;
    }
  }

  /** Check remaining capacity on the USB drive (50% rule enforcement). */
  async checkCapacity(
    mountPoint: string,
    requestedBytes?: number
  ): Promise<{
    allowed: boolean;
    vaultSize: number;
    partitionTotal: number;
    maxAllowed: number;
    remaining: number;
  }> {
    usbDebug.traceEntry('checkCapacity', { mountPoint, requestedBytes });
    try {
      const bridge = getElectronBridge();
      if (bridge) {
        // IPC returns vaultContainerService.checkCapacity() format directly
        const capacity = await bridge.getCapacity(mountPoint, requestedBytes ?? 0);
        usbDebug.traceExit('checkCapacity', {
          allowed: capacity.allowed,
          remaining: capacity.remaining,
          maxAllowed: capacity.maxAllowed,
        });
        return capacity;
      }

      const client = getCompanionClient();
      const { data } = await client.get('/usb/vault/container/capacity', {
        params: {
          mountPoint,
          bytes: requestedBytes,
        },
      });
      usbDebug.traceExit('checkCapacity', {
        allowed: data.allowed,
        remaining: data.remaining,
        maxAllowed: data.maxAllowed,
      });
      return data;
    } catch (err) {
      usbDebug.traceError('checkCapacity', err);
      throw err;
    }
  }

  /** Compact the vault container by removing deleted file gaps. */
  async compactVaultContainer(mountPoint: string, activeFiles: Record<string, { offset: number; length: number }>): Promise<CompactResult> {
    const client = getCompanionClient();
    const { data } = await client.post<CompactResult>('/usb/vault/container/compact', {
      mountPoint,
      activeFiles,
    });
    return data;
  }

  /** List all encrypted files stored in a vault by vault ID. */
  async listVaultFiles(vaultId: string): Promise<VaultFile[]> {
    usbDebug.traceEntry('listVaultFiles', { vaultId });
    try {
      const client = getCompanionClient();
      const { data } = await client.get<{ files: VaultFile[] }>(
        '/usb/vault/' + encodeURIComponent(vaultId) + '/files'
      );
      const result = data.files ?? [];
      usbDebug.traceExit('listVaultFiles', { fileCount: result.length });
      return result;
    } catch (err) {
      usbDebug.traceError('listVaultFiles', err);
      throw err;
    }
  }

  /** Delete an encrypted file from the vault container by ID. */
  async deleteFile(vaultId: string, fileId: string): Promise<void> {
    const client = getCompanionClient();
    await client.delete(
      '/usb/vault/' + encodeURIComponent(vaultId) + '/files/' + encodeURIComponent(fileId),
      { data: { confirm: true } }
    );
  }

  // ── Companion Health ─────────────────────────────────────────────────

  /**
   * Check if the USB companion service is reachable.
   * Prefers Electron IPC (instant, no HTTP) then falls back to HTTP health check.
   */
  async isCompanionRunning(): Promise<boolean> {
    usbDebug.traceEntry('isCompanionRunning', {});
    try {
      // In Electron, the companion is managed by the main process — always available
      const bridge = getElectronBridge();
      if (bridge) {
        try {
          const status = await bridge.getCompanionStatus();
          const isRunning = status === 'running';
          usbDebug.traceExit('isCompanionRunning', { running: isRunning });
          return isRunning;
        } catch {
          usbDebug.traceExit('isCompanionRunning', { running: false });
          return false;
        }
      }

      const client = getCompanionClient();
      const { data } = await client.get('/companion/health', { timeout: 3000 });
      const isRunning = data?.status === 'ok';
      usbDebug.traceExit('isCompanionRunning', { running: isRunning });
      return isRunning;
    } catch (err) {
      usbDebug.traceExit('isCompanionRunning', { running: false });
      return false;
    }
  }

  /**
   * Alias for isCompanionRunning() — consolidated to avoid duplicate methods.
   * Both check the same thing: whether the companion is reachable.
   */
  async isCompanionAvailable(): Promise<boolean> {
    usbDebug.traceEntry('isCompanionAvailable', {});
    try {
      const result = await this.isCompanionRunning();
      usbDebug.traceExit('isCompanionAvailable', { available: result });
      return result;
    } catch (err) {
      usbDebug.traceError('isCompanionAvailable', err);
      return false;
    }
  }

  /** Get companion version info. Returns null if unreachable. */
  async getCompanionVersion(): Promise<{ version: string; platform: string } | null> {
    try {
      const client = getCompanionClient();
      const { data } = await client.get('/companion/version', { timeout: 3000 });
      return data;
    } catch {
      return null;
    }
  }

  // ── Drive Discovery & Companion ──────────────────────────────────────

  /** Discover vaults across all connected USB drives. */
  async discoverVaults(): Promise<Array<{ driveId: string; driveName: string; device: string; capacity: string; partitions: USBPartition[] }>> {
    usbDebug.traceEntry('discoverVaults', {});
    try {
      const client = getCompanionClient();
      const { data } = await client.get<{ vaults: Array<{ driveId: string; driveName: string; device: string; capacity: string; partitions: USBPartition[] }> }>('/usb/discover');
      const result = data.vaults ?? [];
      usbDebug.traceExit('discoverVaults', { vaultCount: result.length });
      return result;
    } catch (err) {
      usbDebug.traceError('discoverVaults', err);
      throw err;
    }
  }

  /** Check if the companion API version is compatible with this client. */
  async isApiVersionMismatch(): Promise<boolean> {
    try {
      const client = getCompanionClient();
      const { data } = await client.get<{ apiVersion: number }>('/companion/version', { timeout: 3000 });
      // API version 1 is the only supported version currently
      return typeof data.apiVersion === 'number' && data.apiVersion !== 1;
    } catch {
      return true; // Assume mismatch if unreachable
    }
  }

  /** Get the companion process version string. */
  async companionVersion(): Promise<string> {
    const client = getCompanionClient();
    const { data } = await client.get<{ version: string }>('/companion/version', { timeout: 3000 });
    return data.version;
  }

  // ── Zero-Trace & Forensics ────────────────────────────────────────────

  /** Scan for forensic artifacts on the host system. */
  async scanArtifacts(
    volumePaths: string[]
  ): Promise<Array<{ id: string; severity: string; description: string; canRemediate: boolean }>> {
    const client = getCompanionClient();
    const { data } = await client.post<{
      artifacts: Array<{
        id: string;
        severity: string;
        description: string;
        canRemediate: boolean;
      }>;
    }>('/usb/zero-trace/scan', { volume_paths: volumePaths });
    return data.artifacts ?? [];
  }

  /** Run zero-trace cleanup (standard privileges). */
  async runZeroTrace(
    volumePaths?: string[],
    driveLetter?: string
  ): Promise<{ cleaned: number; failed: number }> {
    const client = getCompanionClient();
    const { data } = await client.post<{ cleaned: number; failed: number }>('/usb/zero-trace', {
      volume_paths: volumePaths ?? [],
      drive_letter: driveLetter,
      include_admin: false,
    });
    return data;
  }

  /** Run zero-trace cleanup with elevated privileges. */
  async runZeroTraceElevated(
    volumePaths?: string[],
    driveLetter?: string,
    adminPassword?: string
  ): Promise<{ cleaned: number; failed: number }> {
    const client = getCompanionClient();
    const { data } = await client.post<{ cleaned: number; failed: number }>(
      '/usb/zero-trace/elevate',
      {
        volume_paths: volumePaths ?? [],
        drive_letter: driveLetter,
        admin_password: adminPassword,
      }
    );
    return data;
  }

  // ── Drive Lifecycle ───────────────────────────────────────────────────

  /** Run provisioning preflight checks — determines if admin elevation is needed. */
  async provisionPreflight(driveId?: string): Promise<{ needsAdmin: boolean; platform: string }> {
    const client = getCompanionClient();
    const { data } = await client.get<{ needsAdmin: boolean; platform: string }>(
      '/usb/provision/preflight',
      { params: driveId ? { drive_id: driveId } : undefined }
    );
    return data;
  }

  /** Safely eject a USB drive (unmount all partitions + power off). */
  async safeEjectWithCleanup(
    driveId: string
  ): Promise<{ success: boolean; message: string }> {
    const client = getCompanionClient();
    const { data } = await client.post<{
      success: boolean;
      message: string;
    }>('/usb/eject', {
      drive_id: driveId,
    });
    return data;
  }

  /** Unmount a securely mounted vault partition. */
  async unmountSecure(driveId: string): Promise<void> {
    const bridge = getElectronBridge();
    if (bridge && typeof bridge.unmountSecure === 'function') {
      await bridge.unmountSecure(driveId);
      return;
    }

    const client = getCompanionClient();
    await client.post('/usb/unmount-secure', { drive_id: driveId });
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

export const usbService = new UsbServiceImpl();
