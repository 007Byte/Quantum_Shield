/**
 * USB IPC Adapter
 *
 * Registers Electron IPC handlers that call USB companion service functions
 * directly, eliminating the HTTP round-trip for the Electron use case.
 *
 * The companion HTTP server is still spawned as a fallback and for standalone
 * USB mode, but Electron-native operations use this direct path.
 *
 * Security:
 *   - No network overhead — direct function calls within same process
 *   - IPC messages are serialized but not exposed to network
 *   - Error handling wraps service exceptions for safe serialization
 *   - All data flows through the same security boundary as HTTP endpoints
 */

import { ipcMain } from 'electron';

// H-8 FIX: Maximum IPC buffer size to prevent memory exhaustion attacks.
// 64 MB is sufficient for vault operations while preventing unbounded allocation.
const MAX_IPC_BUFFER_SIZE = 64 * 1024 * 1024;

/**
 * Import companion service modules directly.
 * These are Node.js modules that can be required in the main process.
 */
let usbDetector: any;
let vaultContainerService: any;
let vaultFileService: any;
let usbEjector: any;
let usbProvisioner: any;
let usbMounter: any;

/**
 * Lazy-load companion services.
 * We import these dynamically to avoid module resolution issues
 * during app packaging and to isolate the import to when IPC is registered.
 */
function loadCompanionServices() {
  if (!usbDetector) {
    // These paths are relative to the bundled companion app location
    try {
      usbDetector = require('../../../usb-companion/src/services/usbDetector.js');
      vaultContainerService = require('../../../usb-companion/src/services/vaultContainerService.js');
      vaultFileService = require('../../../usb-companion/src/services/vaultFileService.js');
      usbEjector = require('../../../usb-companion/src/services/usbEjector.js');
      usbProvisioner = require('../../../usb-companion/src/services/usbProvisioner.js');
      usbMounter = require('../../../usb-companion/src/services/usbMounter.js');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[usb-ipc-adapter] Failed to load companion services:', message);
      throw new Error('USB companion services not available');
    }
  }
}

/**
 * Serialize errors for IPC transmission.
 * Only safe properties are included to avoid exposing sensitive data.
 */
function serializeError(err: any): { error: string; message: string; code?: string } {
  const errorObj: any = {
    error: err?.name || 'UnknownError',
    message: err?.message || String(err),
  };

  // Include application error codes if present
  if (err?.code && typeof err.code === 'string') {
    errorObj.code = err.code;
  }

  return errorObj;
}

/**
 * H-8 FIX: Validate mount point paths to prevent path traversal attacks.
 * Only allows mount paths under safe OS-specific locations.
 * Returns true if valid, throws an error if invalid.
 */
function validateMountPoint(mountPoint: string): boolean {
  if (typeof mountPoint !== 'string' || mountPoint.length === 0) {
    throw new Error('Mount point must be a non-empty string');
  }

  // Reject path traversal attempts
  if (mountPoint.includes('..')) {
    throw new Error('Mount point contains invalid path traversal sequence');
  }

  // Whitelist safe mount point prefixes
  const safePatterns = [
    /^\/Volumes\// ,  // macOS
    /^\/media\//,     // Linux
    /^\/mnt\//,       // Linux alternative
    /^[A-Z]:\\$/,     // Windows drive letters
  ];

  const isValid = safePatterns.some((pattern) => pattern.test(mountPoint));
  if (!isValid) {
    throw new Error('Mount point is not in a recognized safe location');
  }

  return true;
}

/**
 * Wrap a service function call with error handling and serialization.
 */
async function wrapServiceCall<T>(
  serviceName: string,
  functionName: string,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[usb-ipc-adapter] ${serviceName}.${functionName} failed:`, err);
    throw serializeError(err);
  }
}

/**
 * Register all USB IPC handlers.
 * Must be called after the companion services are available.
 */
export function registerUSBHandlers(): void {
  console.log('[usb-ipc-adapter] Registering USB IPC handlers');

  try {
    loadCompanionServices();
  } catch (err) {
    console.warn('[usb-ipc-adapter] Services not available, IPC handlers will not be registered');
    console.warn('Falling back to HTTP-only mode via companion server');
    return;
  }

  // ── Drive Detection ────────────────────────────────────────────────────

  /**
   * usb:list-drives
   * List all connected USB drives.
   * Returns: { id: string, name: string, size: number, ... }[]
   */
  ipcMain.handle('usb:list-drives', async () => {
    return wrapServiceCall('usbDetector', 'detectUsbDrives', () =>
      usbDetector.detectUsbDrives()
    );
  });

  // ── Vault Container I/O ────────────────────────────────────────────────

  /**
   * usb:read-header
   * Read the VAULT.bin header (first 24 KiB).
   * Args: mountPoint (string)
   * Returns: Buffer (header bytes)
   */
  ipcMain.handle('usb:read-header', async (_event, mountPoint: string) => {
    validateMountPoint(mountPoint); // H-8: Validate mount point
    return wrapServiceCall('vaultContainerService', 'readVaultHeader', () =>
      vaultContainerService.readVaultHeader(mountPoint)
    );
  });

  /**
   * usb:write-header
   * Write a new VAULT.bin header.
   * Args: mountPoint (string), headerBytes (Buffer or Uint8Array)
   * Returns: { success: true }
   */
  ipcMain.handle('usb:write-header', async (_event, mountPoint: string, headerBytes: any) => {
    validateMountPoint(mountPoint); // H-8: Validate mount point
    // H-8: Validate buffer size to prevent memory exhaustion
    if (headerBytes && (headerBytes.byteLength || headerBytes.length) > MAX_IPC_BUFFER_SIZE) {
      throw new Error(`Header exceeds maximum size of ${MAX_IPC_BUFFER_SIZE} bytes`);
    }
    return wrapServiceCall('vaultContainerService', 'writeVaultHeader', () =>
      vaultContainerService.writeVaultHeader(mountPoint, headerBytes)
    );
  });

  /**
   * usb:read-bytes
   * Read bytes from VAULT.bin at a specific offset.
   * Args: mountPoint (string), offset (number), length (number)
   * Returns: Buffer (data bytes)
   */
  ipcMain.handle('usb:read-bytes', async (_event, mountPoint: string, offset: number, length: number) => {
    validateMountPoint(mountPoint); // H-8: Validate mount point
    // H-8: Prevent excessive read requests
    if (length > MAX_IPC_BUFFER_SIZE) {
      throw new Error(`Read length exceeds maximum size of ${MAX_IPC_BUFFER_SIZE} bytes`);
    }
    return wrapServiceCall('vaultContainerService', 'readBytes', () =>
      vaultContainerService.readBytes(mountPoint, offset, length)
    );
  });

  /**
   * usb:append-bytes
   * Append data to the end of VAULT.bin.
   * Args: mountPoint (string), data (Buffer or Uint8Array)
   * Returns: { offset: number, length: number }
   */
  ipcMain.handle('usb:append-bytes', async (_event, mountPoint: string, data: any) => {
    validateMountPoint(mountPoint); // H-8: Validate mount point
    // H-8: Validate buffer size to prevent memory exhaustion
    if (data && (data.byteLength || data.length) > MAX_IPC_BUFFER_SIZE) {
      throw new Error(`Data exceeds maximum size of ${MAX_IPC_BUFFER_SIZE} bytes`);
    }
    return wrapServiceCall('vaultContainerService', 'appendBytes', () =>
      vaultContainerService.appendBytes(mountPoint, data)
    );
  });

  /**
   * usb:get-size
   * Get the current size of VAULT.bin.
   * Args: mountPoint (string)
   * Returns: number (size in bytes)
   */
  ipcMain.handle('usb:get-size', async (_event, mountPoint: string) => {
    validateMountPoint(mountPoint); // H-8: Validate mount point
    return wrapServiceCall('vaultContainerService', 'getVaultSize', () =>
      vaultContainerService.getVaultSize(mountPoint)
    );
  });

  /**
   * usb:get-capacity
   * Get available capacity on the SECURE partition (50% rule check).
   * Args: mountPoint (string), additionalBytes (number, optional)
   * Returns: { allowed: boolean, vaultSize: number, partitionTotal: number, maxAllowed: number, remaining: number }
   */
  ipcMain.handle('usb:get-capacity', async (_event, mountPoint: string, additionalBytes: number = 0) => {
    validateMountPoint(mountPoint); // H-8: Validate mount point
    return wrapServiceCall('vaultContainerService', 'checkCapacity', () =>
      vaultContainerService.checkCapacity(mountPoint, additionalBytes)
    );
  });

  /**
   * usb:has-vault
   * Check if a mount point has a valid VAULT.bin.
   * Args: mountPoint (string)
   * Returns: boolean
   */
  ipcMain.handle('usb:has-vault', async (_event, mountPoint: string) => {
    validateMountPoint(mountPoint); // H-8: Validate mount point
    return wrapServiceCall('vaultContainerService', 'hasVaultBin', () =>
      vaultContainerService.hasVaultBin(mountPoint)
    );
  });

  /**
   * usb:read-vault-identity
   * Read vault metadata (version, created, etc.).
   * Args: mountPoint (string)
   * Returns: { version: string, created: string, ... }
   */
  ipcMain.handle('usb:read-vault-identity', async (_event, mountPoint: string) => {
    validateMountPoint(mountPoint); // H-8: Validate mount point
    return wrapServiceCall('vaultContainerService', 'readVaultIdentity', () =>
      vaultContainerService.readVaultIdentity(mountPoint)
    );
  });

  // ── Vault File Operations ──────────────────────────────────────────────

  /**
   * usb:discover-vaults
   * Scan all USB drives for vaults and return vault metadata.
   * Args: none
   * Returns: { vaultId: string, driveId: string, ... }[]
   */
  ipcMain.handle('usb:discover-vaults', async () => {
    return wrapServiceCall('vaultFileService', 'discoverVaults', () =>
      vaultFileService.discoverVaults()
    );
  });

  /**
   * usb:list-vault-files
   * List all files in a vault.
   * Args: vaultId (string)
   * Returns: { fileId: string, name: string, size: number, ... }[]
   */
  ipcMain.handle('usb:list-vault-files', async (_event, vaultId: string) => {
    return wrapServiceCall('vaultFileService', 'listVaultFiles', () =>
      vaultFileService.listVaultFiles(vaultId)
    );
  });

  /**
   * usb:add-vault-file
   * Add a file to a vault.
   * Args: vaultId (string), fileName (string), fileData (Buffer)
   * Returns: { fileId: string, name: string, size: number, ... }
   */
  ipcMain.handle('usb:add-vault-file', async (_event, vaultId: string, fileName: string, fileData: any) => {
    // H-8: Validate buffer size to prevent memory exhaustion
    if (fileData && (fileData.byteLength || fileData.length) > MAX_IPC_BUFFER_SIZE) {
      throw new Error(`File data exceeds maximum size of ${MAX_IPC_BUFFER_SIZE} bytes`);
    }
    return wrapServiceCall('vaultFileService', 'addVaultFile', () =>
      vaultFileService.addVaultFile(vaultId, fileName, fileData)
    );
  });

  /**
   * usb:remove-vault-file
   * Remove a file from a vault.
   * Args: vaultId (string), fileId (string)
   * Returns: { success: true }
   */
  ipcMain.handle('usb:remove-vault-file', async (_event, vaultId: string, fileId: string) => {
    return wrapServiceCall('vaultFileService', 'removeVaultFile', () =>
      vaultFileService.removeVaultFile(vaultId, fileId)
    );
  });

  // ── Drive Management ───────────────────────────────────────────────────

  /**
   * usb:eject
   * Safely eject a USB drive.
   * Args: driveId (string)
   * Returns: { success: true }
   */
  ipcMain.handle('usb:eject', async (_event, driveId: string) => {
    return wrapServiceCall('usbEjector', 'ejectDrive', () =>
      usbEjector.ejectDrive(driveId)
    );
  });

  // ── Provisioning & Mount Operations ─────────────────────────────────────
  // These operations previously fell back to HTTP even in Electron.
  // Adding IPC handlers eliminates the HTTP dependency during provisioning.

  /**
   * usb:provision
   * Provision a new encrypted vault on a USB drive.
   * Args: params (object with driveId, formatType, fileSystem, masterPassword, etc.)
   * Returns: { vaultId, recoveryPhrase, secureMountPoint, ... }
   */
  ipcMain.handle('usb:provision', async (_event, params: any) => {
    return wrapServiceCall('usbProvisioner', 'provisionVault', () =>
      usbProvisioner.provisionVault(params)
    );
  });

  /**
   * usb:mount-secure
   * Mount the SECURE partition of a USB drive.
   * Args: driveId (string)
   * Returns: { mountPoint: string }
   */
  ipcMain.handle('usb:mount-secure', async (_event, driveId: string) => {
    return wrapServiceCall('usbMounter', 'mountSecure', () =>
      usbMounter.mountSecure(driveId)
    );
  });

  /**
   * usb:unmount-secure
   * Unmount a securely mounted vault partition.
   * Args: driveId (string)
   * Returns: { success: true }
   */
  ipcMain.handle('usb:unmount-secure', async (_event, driveId: string) => {
    return wrapServiceCall('usbMounter', 'unmountSecure', () =>
      usbMounter.unmountSecure(driveId)
    );
  });

  /**
   * usb:compact
   * Compact the vault container by removing deleted file gaps.
   * Args: mountPoint (string), activeFiles (object)
   * Returns: CompactResult
   */
  ipcMain.handle('usb:compact', async (_event, mountPoint: string, activeFiles: any) => {
    validateMountPoint(mountPoint);
    return wrapServiceCall('vaultContainerService', 'compactVault', () =>
      vaultContainerService.compactVault(mountPoint, activeFiles)
    );
  });

  console.log('[usb-ipc-adapter] USB IPC handlers registered successfully');
}
