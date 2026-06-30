/**
 * USB Service Tests — Extended Coverage
 *
 * Complements usbService.test.ts. Covers the paths the original suite does NOT:
 *   - Electron IPC bridge transport (window.electronBridge) for every method
 *     that prefers it over HTTP (listDrives, provisionVault, appendVaultBytes,
 *     writeVaultHeader, readVaultHeader, readVaultBytes, checkCapacity,
 *     isCompanionRunning, unmountSecure).
 *   - Companion bearer-token resolution via the request interceptor (F5/CRIT-1).
 *   - Connection-down detection -> USB_COMPANION_UNAVAILABLE for listDrives,
 *     provisionVault, resetDrive.
 *   - The HTTP-only helper methods not exercised elsewhere: compactVaultContainer,
 *     listVaultFiles, deleteFile, discoverVaults, getCompanionVersion,
 *     companionVersion, runZeroTraceElevated, provisionPreflight,
 *     safeEjectWithCleanup, and error propagation in container I/O.
 *
 * Like the original suite, usbService talks to its OWN axios instance created
 * via axios.create(); we mock axios so the instance's verbs are controllable.
 */

import { usbService } from '../usbService';

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();
// Capture the request interceptor registered in getCompanionClient so we can
// invoke it directly and assert the bearer-token header behaviour.
let capturedRequestInterceptor: ((config: any) => Promise<any>) | null = null;

jest.mock('axios', () => {
  const client = {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
    put: (...args: any[]) => mockPut(...args),
    delete: (...args: any[]) => mockDelete(...args),
    interceptors: {
      request: {
        use: (fn: any) => {
          capturedRequestInterceptor = fn;
        },
      },
    },
  };
  return {
    __esModule: true,
    default: { create: jest.fn(() => client) },
    create: jest.fn(() => client),
  };
});

jest.mock('../auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

// ── Electron bridge helpers ────────────────────────────────────────────
// Building a fresh bridge per-test keeps mock call-counts isolated.

function installBridge(overrides: Partial<Record<string, any>> = {}) {
  const bridge = {
    isElectron: true,
    getCompanionPort: jest.fn(),
    getCompanionStatus: jest.fn(),
    getCompanionToken: jest.fn(),
    onCompanionStatusChanged: jest.fn(),
    onUsbEjectRequested: jest.fn(),
    restartCompanion: jest.fn(),
    getAppVersion: jest.fn(),
    listDrives: jest.fn(),
    readHeader: jest.fn(),
    writeHeader: jest.fn(),
    readBytes: jest.fn(),
    appendBytes: jest.fn(),
    getSize: jest.fn(),
    getCapacity: jest.fn(),
    hasVault: jest.fn(),
    readVaultIdentity: jest.fn(),
    discoverVaults: jest.fn(),
    listVaultFiles: jest.fn(),
    addVaultFile: jest.fn(),
    removeVaultFile: jest.fn(),
    eject: jest.fn(),
    provisionVault: jest.fn(),
    mountSecure: jest.fn(),
    unmountSecure: jest.fn(),
    ...overrides,
  };
  (window as any).electronBridge = bridge;
  return bridge;
}

function removeBridge() {
  delete (window as any).electronBridge;
}

describe('UsbService — extended coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    removeBridge();
  });

  afterEach(() => {
    removeBridge();
  });

  // ============================================================================
  // Electron IPC bridge transport
  // ============================================================================
  describe('Electron IPC bridge transport', () => {
    it('listDrives uses the bridge and bypasses HTTP', async () => {
      const bridge = installBridge({
        listDrives: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            name: 'Kingston',
            capacity: '32GB',
            device: '/dev/sdb',
            available: true,
            hasVault: false,
          },
        ]),
      });

      const drives = await usbService.listDrives();

      expect(bridge.listDrives).toHaveBeenCalledTimes(1);
      expect(mockGet).not.toHaveBeenCalled();
      expect(drives).toHaveLength(1);
      expect(drives[0].name).toBe('Kingston');
    });

    it('listDrives normalizes a null bridge result to an empty array', async () => {
      installBridge({ listDrives: jest.fn().mockResolvedValue(null) });

      const drives = await usbService.listDrives();

      expect(drives).toEqual([]);
    });

    it('listDrives surfaces a bridge failure as a readable error', async () => {
      installBridge({
        listDrives: jest.fn().mockRejectedValue({ message: 'IPC channel closed' }),
      });

      await expect(usbService.listDrives()).rejects.toThrow('IPC channel closed');
    });

    it('provisionVault routes through the bridge when available', async () => {
      const bridge = installBridge({
        provisionVault: jest.fn().mockResolvedValue({
          vaultId: 'vault-ipc-1',
          recoveryPhrase: ['orbit', 'lantern', 'cobalt'],
          secureMountPoint: '/mnt/secure',
        }),
      });

      const result = await usbService.provisionVault({
        driveId: 'd1',
        formatType: 'full',
        fileSystem: 'exfat',
        masterPassword: 'correct horse battery staple',
        vaultName: 'Work',
        cipherAlgorithm: 'xchacha20',
      });

      expect(bridge.provisionVault).toHaveBeenCalledWith(
        expect.objectContaining({
          driveId: 'd1',
          formatType: 'full',
          fileSystem: 'exfat',
          vaultName: 'Work',
          cipherAlgorithm: 'xchacha20',
        })
      );
      expect(mockPost).not.toHaveBeenCalled();
      expect(result.vaultId).toBe('vault-ipc-1');
      expect(result.secureMountPoint).toBe('/mnt/secure');
    });

    it('appendVaultBytes returns the bridge offset/length', async () => {
      const bridge = installBridge({
        appendBytes: jest.fn().mockResolvedValue({ offset: 4096, length: 512 }),
      });

      const result = await usbService.appendVaultBytes('/mnt/usb', new Uint8Array(512));

      expect(bridge.appendBytes).toHaveBeenCalledWith('/mnt/usb', expect.any(Uint8Array));
      expect(mockPost).not.toHaveBeenCalled();
      expect(result).toEqual({ offset: 4096, length: 512 });
    });

    it('writeVaultHeader delegates to the bridge', async () => {
      const bridge = installBridge({
        writeHeader: jest.fn().mockResolvedValue({ success: true }),
      });

      await usbService.writeVaultHeader('/mnt/usb', new Uint8Array([0x55, 0x42, 0x56, 0x31]));

      expect(bridge.writeHeader).toHaveBeenCalledWith('/mnt/usb', expect.any(Uint8Array));
      expect(mockPut).not.toHaveBeenCalled();
    });

    it('readVaultHeader converts the bridge Buffer to a Uint8Array', async () => {
      installBridge({
        readHeader: jest.fn().mockResolvedValue(new Uint8Array([0x10, 0x20, 0x30]).buffer),
      });

      const header = await usbService.readVaultHeader('/mnt/usb');

      expect(header).toBeInstanceOf(Uint8Array);
      expect(Array.from(header)).toEqual([0x10, 0x20, 0x30]);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('readVaultBytes returns a Uint8Array slice from the bridge', async () => {
      installBridge({
        readBytes: jest.fn().mockResolvedValue(new Uint8Array([0x01, 0x02, 0x03, 0x04]).buffer),
      });

      const bytes = await usbService.readVaultBytes('/mnt/usb', 64, 4);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(4);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('checkCapacity returns the bridge capacity result verbatim', async () => {
      const capacity = {
        allowed: false,
        vaultSize: 600 * 1024 * 1024,
        partitionTotal: 1024 * 1024 * 1024,
        maxAllowed: 512 * 1024 * 1024,
        remaining: 0,
      };
      const bridge = installBridge({
        getCapacity: jest.fn().mockResolvedValue(capacity),
      });

      const result = await usbService.checkCapacity('/mnt/usb', 1024);

      expect(bridge.getCapacity).toHaveBeenCalledWith('/mnt/usb', 1024);
      expect(result.allowed).toBe(false);
      expect(result.maxAllowed).toBe(512 * 1024 * 1024);
    });

    it('checkCapacity defaults requestedBytes to 0 over the bridge', async () => {
      const bridge = installBridge({
        getCapacity: jest.fn().mockResolvedValue({
          allowed: true,
          vaultSize: 0,
          partitionTotal: 1024,
          maxAllowed: 512,
          remaining: 512,
        }),
      });

      await usbService.checkCapacity('/mnt/usb');

      expect(bridge.getCapacity).toHaveBeenCalledWith('/mnt/usb', 0);
    });

    it('isCompanionRunning reports running when the bridge status is "running"', async () => {
      installBridge({ getCompanionStatus: jest.fn().mockResolvedValue('running') });

      await expect(usbService.isCompanionRunning()).resolves.toBe(true);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('isCompanionRunning reports not-running for a non-"running" bridge status', async () => {
      installBridge({ getCompanionStatus: jest.fn().mockResolvedValue('stopped') });

      await expect(usbService.isCompanionRunning()).resolves.toBe(false);
    });

    it('isCompanionRunning returns false when the bridge status call throws', async () => {
      installBridge({ getCompanionStatus: jest.fn().mockRejectedValue(new Error('no ipc')) });

      await expect(usbService.isCompanionRunning()).resolves.toBe(false);
    });

    it('unmountSecure prefers the bridge unmountSecure over HTTP', async () => {
      const bridge = installBridge({
        unmountSecure: jest.fn().mockResolvedValue({ success: true }),
      });

      await usbService.unmountSecure('d1');

      expect(bridge.unmountSecure).toHaveBeenCalledWith('d1');
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Companion bearer token (F5 / CRIT-1)
  //
  // NOTE: the companion token is memoized in a module-level promise
  // (companionTokenPromise), so the FIRST interceptor run in this process fixes
  // the cached token for the rest of the suite. We therefore exercise both the
  // "no token" and "token present" branches against FRESH module instances via
  // jest.isolateModules so neither depends on the other's cache state.
  // ============================================================================
  describe('companion bearer token interceptor', () => {
    it('registers a request interceptor on first companion call', async () => {
      // A bridge-free call forces getCompanionClient() to be constructed.
      mockGet.mockResolvedValue({ data: { drives: [] } });
      await usbService.listDrives();

      expect(capturedRequestInterceptor).toBeInstanceOf(Function);
    });

    it('attaches an Authorization header when the bridge supplies a token', async () => {
      installBridge({ getCompanionToken: jest.fn().mockResolvedValue('tok-deadbeef-01') });

      let interceptor: ((config: any) => Promise<any>) | null = null;
      await jest.isolateModulesAsync(async () => {
        capturedRequestInterceptor = null;
        const mod = require('../usbService');
        mockGet.mockResolvedValue({ data: { vaults: [] } });
        await mod.usbService.discoverVaults();
        interceptor = capturedRequestInterceptor;
      });

      expect(interceptor).toBeInstanceOf(Function);
      const config = await interceptor!({ headers: {} });
      expect(config.headers.Authorization).toBe('Bearer tok-deadbeef-01');
    });

    it('omits the Authorization header when no token source is available', async () => {
      // No bridge -> fetchCompanionToken resolves null -> header untouched.
      removeBridge();

      let interceptor: ((config: any) => Promise<any>) | null = null;
      await jest.isolateModulesAsync(async () => {
        capturedRequestInterceptor = null;
        const mod = require('../usbService');
        mockGet.mockResolvedValue({ data: { vaults: [] } });
        await mod.usbService.discoverVaults();
        interceptor = capturedRequestInterceptor;
      });

      expect(interceptor).toBeInstanceOf(Function);
      const config = await interceptor!({ headers: {} });
      expect(config.headers.Authorization).toBeUndefined();
    });

    it('omits the Authorization header when the bridge token call rejects', async () => {
      installBridge({ getCompanionToken: jest.fn().mockRejectedValue(new Error('locked')) });

      let interceptor: ((config: any) => Promise<any>) | null = null;
      await jest.isolateModulesAsync(async () => {
        capturedRequestInterceptor = null;
        const mod = require('../usbService');
        mockGet.mockResolvedValue({ data: { vaults: [] } });
        await mod.usbService.discoverVaults();
        interceptor = capturedRequestInterceptor;
      });

      expect(interceptor).toBeInstanceOf(Function);
      const config = await interceptor!({ headers: {} });
      expect(config.headers.Authorization).toBeUndefined();
    });
  });

  // ============================================================================
  // Connection-down detection -> USB_COMPANION_UNAVAILABLE
  // ============================================================================
  describe('companion-unavailable detection', () => {
    it('listDrives maps ECONNREFUSED to USB_COMPANION_UNAVAILABLE', async () => {
      mockGet.mockRejectedValue({ code: 'ECONNREFUSED' });

      await expect(usbService.listDrives()).rejects.toThrow('USB_COMPANION_UNAVAILABLE');
    });

    it('listDrives maps a "Network Error" message to USB_COMPANION_UNAVAILABLE', async () => {
      mockGet.mockRejectedValue({ message: 'Network Error' });

      await expect(usbService.listDrives()).rejects.toThrow('USB_COMPANION_UNAVAILABLE');
    });

    it('provisionVault maps ERR_NETWORK to USB_COMPANION_UNAVAILABLE', async () => {
      mockPost.mockRejectedValue({ code: 'ERR_NETWORK' });

      await expect(
        usbService.provisionVault({
          driveId: 'd1',
          formatType: 'quick',
          fileSystem: 'exfat',
          masterPassword: 'pw',
        })
      ).rejects.toThrow('USB_COMPANION_UNAVAILABLE');
    });

    it('resetDrive maps an ECONNREFUSED message to USB_COMPANION_UNAVAILABLE', async () => {
      mockPost.mockRejectedValue({ message: 'connect ECONNREFUSED 127.0.0.1:3001' });

      await expect(usbService.resetDrive({ driveId: 'd1', wipeMethod: 'quick' })).rejects.toThrow(
        'USB_COMPANION_UNAVAILABLE'
      );
    });

    it('listDrives logs non-connection failures to the audit service', async () => {
      const { auditService } = require('../auditService');
      mockGet.mockRejectedValue({ response: { data: { error: 'disk subsystem fault' } } });

      await expect(usbService.listDrives()).rejects.toThrow('disk subsystem fault');
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'usb_list_drives_failed',
        expect.objectContaining({ error: 'disk subsystem fault' }),
        'error'
      );
    });
  });

  // ============================================================================
  // HTTP-only helper methods
  // ============================================================================
  describe('HTTP container + discovery helpers', () => {
    it('initVaultContainer rethrows the raw error on failure', async () => {
      const failure = new Error('octet write rejected');
      mockPost.mockRejectedValue(failure);

      await expect(
        usbService.initVaultContainer('/mnt/usb', new Uint8Array([0xab, 0xcd]))
      ).rejects.toBe(failure);
    });

    it('appendVaultBytes posts octet-stream over HTTP when no bridge present', async () => {
      mockPost.mockResolvedValue({ data: { offset: 128, length: 64 } });

      const result = await usbService.appendVaultBytes('/mnt/usb', new Uint8Array(64));

      expect(mockPost).toHaveBeenCalledWith(
        '/usb/vault/container/append',
        expect.any(Uint8Array),
        expect.objectContaining({
          params: { mountPoint: '/mnt/usb' },
          headers: { 'Content-Type': 'application/octet-stream' },
        })
      );
      expect(result).toEqual({ offset: 128, length: 64 });
    });

    it('writeVaultHeader puts header bytes over HTTP when no bridge present', async () => {
      mockPut.mockResolvedValue({});

      await usbService.writeVaultHeader('/mnt/usb', new Uint8Array([0x55, 0x42]));

      expect(mockPut).toHaveBeenCalledWith(
        '/usb/vault/container/header',
        expect.any(Uint8Array),
        expect.objectContaining({ params: { mountPoint: '/mnt/usb' } })
      );
    });

    it('readVaultBytes requests the byte range over HTTP and returns a Uint8Array', async () => {
      mockGet.mockResolvedValue({ data: new Uint8Array([7, 8, 9]).buffer });

      const bytes = await usbService.readVaultBytes('/mnt/usb', 200, 3);

      expect(mockGet).toHaveBeenCalledWith(
        '/usb/vault/container/bytes',
        expect.objectContaining({
          params: { mountPoint: '/mnt/usb', offset: 200, length: 3 },
          responseType: 'arraybuffer',
        })
      );
      expect(Array.from(bytes)).toEqual([7, 8, 9]);
    });

    it('readVaultHeader rethrows the raw error on failure', async () => {
      const failure = new Error('header read EIO');
      mockGet.mockRejectedValue(failure);

      await expect(usbService.readVaultHeader('/mnt/usb')).rejects.toBe(failure);
    });

    it('compactVaultContainer posts active file offsets and returns the compaction result', async () => {
      const compactResult = {
        entries: [{ id: 'f1', offset: 0, length: 100 }],
        newOffsets: { f1: { offset: 0, length: 100 } },
        oldSize: 500,
        newSize: 100,
        spaceSaved: 400,
      };
      mockPost.mockResolvedValue({ data: compactResult });

      const result = await usbService.compactVaultContainer('/mnt/usb', {
        f1: { offset: 250, length: 100 },
      });

      expect(mockPost).toHaveBeenCalledWith(
        '/usb/vault/container/compact',
        expect.objectContaining({ mountPoint: '/mnt/usb' })
      );
      expect(result.spaceSaved).toBe(400);
    });

    it('listVaultFiles URL-encodes the vault id and returns the file list', async () => {
      mockGet.mockResolvedValue({
        data: {
          files: [
            {
              id: 'file1',
              name: 'a.txt',
              size: 10,
              encryptedSize: 20,
              createdAt: 'x',
              modifiedAt: 'y',
            },
          ],
        },
      });

      const files = await usbService.listVaultFiles('vault id/with space');

      expect(mockGet).toHaveBeenCalledWith('/usb/vault/vault%20id%2Fwith%20space/files');
      expect(files).toHaveLength(1);
      expect(files[0].name).toBe('a.txt');
    });

    it('listVaultFiles tolerates a missing files array', async () => {
      mockGet.mockResolvedValue({ data: {} });

      await expect(usbService.listVaultFiles('vault-1')).resolves.toEqual([]);
    });

    it('listVaultFiles rethrows on failure', async () => {
      mockGet.mockRejectedValue(new Error('vault not found'));

      await expect(usbService.listVaultFiles('vault-1')).rejects.toThrow('vault not found');
    });

    it('deleteFile issues a DELETE with a confirm body and encoded ids', async () => {
      mockDelete.mockResolvedValue({});

      await usbService.deleteFile('vault-1', 'file-1');

      expect(mockDelete).toHaveBeenCalledWith(
        '/usb/vault/vault-1/files/file-1',
        expect.objectContaining({ data: { confirm: true } })
      );
    });

    it('discoverVaults returns the vaults array', async () => {
      mockGet.mockResolvedValue({
        data: {
          vaults: [
            {
              driveId: 'd1',
              driveName: 'Kingston',
              device: '/dev/sdb',
              capacity: '32GB',
              partitions: [],
            },
          ],
        },
      });

      const vaults = await usbService.discoverVaults();

      expect(vaults).toHaveLength(1);
      expect(vaults[0].driveName).toBe('Kingston');
    });

    it('discoverVaults tolerates a missing vaults array', async () => {
      mockGet.mockResolvedValue({ data: {} });

      await expect(usbService.discoverVaults()).resolves.toEqual([]);
    });

    it('discoverVaults rethrows on failure', async () => {
      mockGet.mockRejectedValue(new Error('discovery failed'));

      await expect(usbService.discoverVaults()).rejects.toThrow('discovery failed');
    });
  });

  // ============================================================================
  // Companion version + zero-trace + lifecycle (HTTP)
  // ============================================================================
  describe('version, zero-trace and lifecycle helpers', () => {
    it('getCompanionVersion returns the version payload', async () => {
      mockGet.mockResolvedValue({ data: { version: '1.4.2', platform: 'darwin' } });

      const info = await usbService.getCompanionVersion();

      expect(info).toEqual({ version: '1.4.2', platform: 'darwin' });
    });

    it('getCompanionVersion returns null when unreachable', async () => {
      mockGet.mockRejectedValue(new Error('timeout'));

      await expect(usbService.getCompanionVersion()).resolves.toBeNull();
    });

    it('companionVersion returns the bare version string', async () => {
      mockGet.mockResolvedValue({ data: { version: '2.0.0' } });

      await expect(usbService.companionVersion()).resolves.toBe('2.0.0');
    });

    it('isApiVersionMismatch returns true when apiVersion is not 1', async () => {
      mockGet.mockResolvedValue({ data: { apiVersion: 2 } });

      await expect(usbService.isApiVersionMismatch()).resolves.toBe(true);
    });

    it('runZeroTraceElevated forwards admin password and returns results', async () => {
      mockPost.mockResolvedValue({ data: { cleaned: 3, failed: 1 } });

      const result = await usbService.runZeroTraceElevated(['/mnt/usb'], 'E:', 'admin-secret');

      expect(mockPost).toHaveBeenCalledWith(
        '/usb/zero-trace/elevate',
        expect.objectContaining({
          volume_paths: ['/mnt/usb'],
          drive_letter: 'E:',
          admin_password: 'admin-secret',
        })
      );
      expect(result).toEqual({ cleaned: 3, failed: 1 });
    });

    it('provisionPreflight reports admin requirement and platform', async () => {
      mockGet.mockResolvedValue({ data: { needsAdmin: true, platform: 'win32' } });

      const result = await usbService.provisionPreflight('d1');

      expect(mockGet).toHaveBeenCalledWith(
        '/usb/provision/preflight',
        expect.objectContaining({ params: { drive_id: 'd1' } })
      );
      expect(result.needsAdmin).toBe(true);
      expect(result.platform).toBe('win32');
    });

    it('provisionPreflight omits params when no drive id is given', async () => {
      mockGet.mockResolvedValue({ data: { needsAdmin: false, platform: 'linux' } });

      await usbService.provisionPreflight();

      expect(mockGet).toHaveBeenCalledWith(
        '/usb/provision/preflight',
        expect.objectContaining({ params: undefined })
      );
    });

    it('safeEjectWithCleanup posts the drive id and returns the result', async () => {
      mockPost.mockResolvedValue({ data: { success: true, message: 'Ejected safely' } });

      const result = await usbService.safeEjectWithCleanup('d1');

      expect(mockPost).toHaveBeenCalledWith('/usb/eject', { drive_id: 'd1' });
      expect(result.success).toBe(true);
      expect(result.message).toBe('Ejected safely');
    });

    it('unmountSecure falls back to HTTP when the bridge lacks unmountSecure', async () => {
      // Bridge present but without unmountSecure -> HTTP path is taken.
      installBridge({ unmountSecure: undefined });
      mockPost.mockResolvedValue({});

      await usbService.unmountSecure('d1');

      expect(mockPost).toHaveBeenCalledWith('/usb/unmount-secure', { drive_id: 'd1' });
    });
  });
});
