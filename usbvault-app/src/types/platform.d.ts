/**
 * Platform-specific type extensions for USBVault.
 *
 * Extends standard TypeScript DOM types to cover browser APIs
 * that exist at runtime but aren't in lib.dom.d.ts.
 */

// ── Navigator Extensions ─────────────────────────────────────────────
// Chrome-specific Device Memory API and other navigator properties
// that TypeScript's standard lib doesn't declare.

declare global {
  interface Navigator {
    /** Device Memory API (Chrome/Edge only) — RAM in GiB */
    deviceMemory?: number;
  }

  // ── Axios Retry Config ───────────────────────────────────────────
  // Extended config for retry interceptors.
  interface RetryableAxiosConfig {
    _retryCount?: number;
    _retry?: boolean;
    headers?: Record<string, string>;
    [key: string]: unknown;
  }

  // ── Electron Companion API ───────────────────────────────────────
  // Exposed by electron-shell/src/preload.ts via contextBridge.
  interface ElectronCompanionAPI {
    getStatus: () => Promise<{ status: string; port: number | null; url: string | null }>;
    restart: () => Promise<{ status: string }>;
  }

  interface ElectronAPI {
    companion: ElectronCompanionAPI;
  }

  interface Window {
    electronAPI?: ElectronAPI;
    electronBridge?: {
      isElectron: true;
      getCompanionPort: () => Promise<number | null>;
      getCompanionStatus: () => Promise<string>;
      onCompanionStatusChanged: (callback: (status: string, detail?: string) => void) => () => void;
      onUsbEjectRequested: (callback: () => void) => () => void;
      restartCompanion: () => Promise<void>;
      getAppVersion: () => Promise<string>;
      listDrives: () => Promise<any[]>;
      readHeader: (mountPoint: string) => Promise<Buffer>;
      writeHeader: (mountPoint: string, headerBytes: Buffer | Uint8Array) => Promise<{ success: boolean }>;
      readBytes: (mountPoint: string, offset: number, length: number) => Promise<Buffer>;
      appendBytes: (mountPoint: string, data: Buffer | Uint8Array) => Promise<{ offset: number; length: number }>;
      getSize: (mountPoint: string) => Promise<number>;
      getCapacity: (
        mountPoint: string,
        additionalBytes?: number
      ) => Promise<{
        allowed: boolean;
        vaultSize: number;
        partitionTotal: number;
        maxAllowed: number;
        remaining: number;
      }>;
      hasVault: (mountPoint: string) => Promise<boolean>;
      readVaultIdentity: (mountPoint: string) => Promise<any>;
      discoverVaults: () => Promise<any[]>;
      listVaultFiles: (vaultId: string) => Promise<any[]>;
      addVaultFile: (vaultId: string, fileName: string, fileData: Buffer | Uint8Array) => Promise<any>;
      removeVaultFile: (vaultId: string, fileId: string) => Promise<{ success: boolean }>;
      eject: (driveId: string) => Promise<{ success: boolean }>;
      /** Provision a new encrypted vault on a USB drive. */
      provisionVault: (params: {
        driveId: string;
        formatType: 'quick' | 'full';
        fileSystem: string;
        masterPassword: string;
        vaultName?: string;
        partitionName?: string;
        cipherAlgorithm?: string;
        adminPassword?: string;
      }) => Promise<{
        vaultId: string;
        recoveryPhrase: string[];
        secureMountPoint?: string;
      }>;
      /** Mount the SECURE partition of a USB drive. */
      mountSecure: (driveId: string) => Promise<{ mountPoint: string }>;
      /** Unmount a securely mounted vault partition. */
      unmountSecure: (driveId: string) => Promise<{ success: boolean }>;
    };
  }

  // ── Extended Blob Property Bag ─────────────────────────────────
  interface ExtendedBlobPropertyBag extends BlobPropertyBag {
    lastModified?: number;
  }

  // ── WebAuthn PRF Extension ─────────────────────────────────────
  interface WebAuthnPrfResults {
    first: ArrayBuffer;
    second?: ArrayBuffer;
  }

  interface WebAuthnPrfOutput {
    results?: WebAuthnPrfResults;
  }

  interface WebAuthnExtensionResults {
    prf?: WebAuthnPrfOutput;
  }
}

// ── React Native Web: Pressable State ────────────────────────────────
// react-native-web adds `hovered` to PressableStateCallbackType but
// the upstream RN types don't include it.

declare module 'react-native' {
  interface PressableStateCallbackType {
    hovered?: boolean;
  }
}

export {};
