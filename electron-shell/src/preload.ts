/**
 * Preload script — exposes a secure IPC bridge to the renderer (web app).
 *
 * The web app can access these APIs via window.electronBridge.
 * This replaces direct HTTP calls to the companion for operations
 * where IPC is more efficient or secure.
 *
 * API surface:
 *   - getCompanionPort(): number | null
 *   - getCompanionStatus(): CompanionStatus
 *   - onCompanionStatusChanged(callback): unsubscribe
 *   - onUsbEjectRequested(callback): unsubscribe
 *   - isElectron: true
 */

import { contextBridge, ipcRenderer } from 'electron';

// ── electronAPI namespace ─────────────────────────────────────────────────
// Structured API surface for companion status queries.
contextBridge.exposeInMainWorld('electronAPI', {
  companion: {
    /** Get combined companion status (status, port, url) in one call. */
    getStatus: (): Promise<{ status: string; port: number | null; url: string | null }> =>
      ipcRenderer.invoke('companion:status'),

    /** Restart the companion service and return new status. */
    restart: (): Promise<{ status: string }> =>
      ipcRenderer.invoke('companion:restart'),
  },
});

// ── electronBridge namespace (existing API — do not remove) ───────────────
contextBridge.exposeInMainWorld('electronBridge', {
  /** Whether the app is running inside Electron. */
  isElectron: true,

  /** Get the companion service's assigned port (null if not started). */
  getCompanionPort: (): Promise<number | null> =>
    ipcRenderer.invoke('companion:get-port'),

  /** Get the current companion status. */
  getCompanionStatus: (): Promise<string> =>
    ipcRenderer.invoke('companion:get-status'),

  /** Subscribe to companion status changes. Returns unsubscribe function. */
  onCompanionStatusChanged: (callback: (status: string, detail?: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string, detail?: string) => {
      callback(status, detail);
    };
    ipcRenderer.on('companion:status-changed', handler);
    return () => ipcRenderer.removeListener('companion:status-changed', handler);
  },

  /** Subscribe to USB safe-eject requests from tray menu. */
  onUsbEjectRequested: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on('usb:request-eject', handler);
    return () => ipcRenderer.removeListener('usb:request-eject', handler);
  },

  /** Request the main process to restart the companion. */
  restartCompanion: (): Promise<void> =>
    ipcRenderer.invoke('companion:restart'),

  /** Get app version info. */
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:get-version'),

  // ── Direct USB Operations (IPC, bypass HTTP) ──────────────────────────

  /** List all connected USB drives. */
  listDrives: (): Promise<any[]> =>
    ipcRenderer.invoke('usb:list-drives'),

  /** Read VAULT.bin header (first 24 KiB). */
  readHeader: (mountPoint: string): Promise<Buffer> =>
    ipcRenderer.invoke('usb:read-header', mountPoint),

  /** Write a new VAULT.bin header. */
  writeHeader: (mountPoint: string, headerBytes: Buffer | Uint8Array): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('usb:write-header', mountPoint, headerBytes),

  /** Read bytes from VAULT.bin at specific offset. */
  readBytes: (mountPoint: string, offset: number, length: number): Promise<Buffer> =>
    ipcRenderer.invoke('usb:read-bytes', mountPoint, offset, length),

  /** Append data to end of VAULT.bin. Returns { offset, length } of written data. */
  appendBytes: (mountPoint: string, data: Buffer | Uint8Array): Promise<{ offset: number; length: number }> =>
    ipcRenderer.invoke('usb:append-bytes', mountPoint, data),

  /** Get current size of VAULT.bin. */
  getSize: (mountPoint: string): Promise<number> =>
    ipcRenderer.invoke('usb:get-size', mountPoint),

  /** Get available capacity on SECURE partition (50% rule check). */
  getCapacity: (mountPoint: string, additionalBytes?: number): Promise<{ allowed: boolean; vaultSize: number; partitionTotal: number; maxAllowed: number; remaining: number }> =>
    ipcRenderer.invoke('usb:get-capacity', mountPoint, additionalBytes || 0),

  /** Check if mount point has valid VAULT.bin. */
  hasVault: (mountPoint: string): Promise<boolean> =>
    ipcRenderer.invoke('usb:has-vault', mountPoint),

  /** Read vault metadata (version, created, etc.). */
  readVaultIdentity: (mountPoint: string): Promise<any> =>
    ipcRenderer.invoke('usb:read-vault-identity', mountPoint),

  /** Scan all USB drives for vaults. */
  discoverVaults: (): Promise<any[]> =>
    ipcRenderer.invoke('usb:discover-vaults'),

  /** List all files in a vault. */
  listVaultFiles: (vaultId: string): Promise<any[]> =>
    ipcRenderer.invoke('usb:list-vault-files', vaultId),

  /** Add a file to a vault. */
  addVaultFile: (vaultId: string, fileName: string, fileData: Buffer | Uint8Array): Promise<any> =>
    ipcRenderer.invoke('usb:add-vault-file', vaultId, fileName, fileData),

  /** Remove a file from a vault. */
  removeVaultFile: (vaultId: string, fileId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('usb:remove-vault-file', vaultId, fileId),

  /** Safely eject a USB drive. */
  eject: (driveId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('usb:eject', driveId),

  // ── Provisioning & Mount (previously HTTP-only) ──────────────────────

  /** Provision a new encrypted vault on a USB drive. */
  provisionVault: (params: any): Promise<any> =>
    ipcRenderer.invoke('usb:provision', params),

  /** Mount the SECURE partition of a USB drive. */
  mountSecure: (driveId: string): Promise<{ mountPoint: string }> =>
    ipcRenderer.invoke('usb:mount-secure', driveId),

  /** Unmount a securely mounted vault partition. */
  unmountSecure: (driveId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('usb:unmount-secure', driveId),

  /** Compact the vault container. */
  compactVault: (mountPoint: string, activeFiles: any): Promise<any> =>
    ipcRenderer.invoke('usb:compact', mountPoint, activeFiles),
});
