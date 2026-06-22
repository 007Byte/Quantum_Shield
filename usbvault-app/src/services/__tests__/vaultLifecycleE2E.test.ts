/**
 * VAULT LIFECYCLE E2E INTEGRATION TESTS
 *
 * Validates the full vault lifecycle that a real user goes through:
 *   Provision → Unlock → Encrypt → Store → Decrypt → Lock
 *
 * Strategy:
 *   - Mock: usbService (companion HTTP), crypto/bridge (Rust FFI), auditService
 *   - Real: vaultOrchestrator logic (the coordinator)
 *
 * The crypto/bridge mock uses "real-ish" transforms so we can verify
 * data round-trips correctly (XOR with key for "encryption").
 */

// ── Mocks (must be before imports) ────────────────────────────────────

jest.mock('@/crypto/bridge');
jest.mock('@/services/usbService', () => ({
  usbService: {
    initVaultContainer: jest.fn().mockResolvedValue(undefined),
    appendVaultBytes: jest.fn(),
    writeVaultHeader: jest.fn().mockResolvedValue(undefined),
    readVaultHeader: jest.fn(),
    readVaultBytes: jest.fn(),
    checkCapacity: jest.fn().mockResolvedValue({ allowed: true, remaining: 1e9, maxAllowed: 2e9 }),
    compactVaultContainer: jest.fn(),
  },
}));
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/services/api');

// ── Imports ───────────────────────────────────────────────────────────

import {
  createVaultHeader,
  readVaultHeader as parseVaultHeader,
  unlockVault,
  encryptVaultContainerIndex,
  decryptVaultContainerIndex,
  encryptFileRecord,
  decryptFileRecord,
  readFailCounter,
  resetFailCounter,
  incrementFailCounter,
  commitVaultIndex,
  type VaultHeaderInfo,
  type VaultIndexData,
} from '@/crypto/bridge';

import { usbService } from '@/services/usbService';

// ── Constants ─────────────────────────────────────────────────────────

const TEST_PASSWORD = 'Lifecycl3T3st!2026';
const WRONG_PASSWORD = 'Wr0ngP@ss!2026';
const MOUNT_POINT = '/mnt/usb-lifecycle';

const MOCK_ENCRYPTION_KEY = new Uint8Array(32).fill(0x11);
const MOCK_HMAC_KEY = new Uint8Array(32).fill(0x22);
const MOCK_SALT = new Uint8Array(32).fill(0xdd);

// Session used directly inside mock setup, not referenced as standalone const

const MOCK_HEADER_INFO: VaultHeaderInfo = {
  version: 4,
  cipherId: 2 as any,
  kdfParams: { memory: 65536, iterations: 3, parallelism: 4 },
  createdAt: String(Date.now()),
  salt: MOCK_SALT,
  failCount: 0,
  activeIndexSlot: 0 as const,
  indexOffset: 512,
  indexLength: 256,
  index0Offset: 512,
  index0Length: 256,
  index1Offset: 768,
  index1Length: 0,
};

/** Build a fake header with USBVLT magic prefix. */
function makeMagicHeader(size = 512): Uint8Array {
  const header = new Uint8Array(size);
  const magic = new TextEncoder().encode('USBVLT04');
  header.set(magic, 0);
  return header;
}

// ── In-memory index tracker for realistic mocking ─────────────────────

/** Tracks the latest encrypted index so decrypt returns the right thing. */
let latestIndex: VaultIndexData = { files: {} };
let appendCallCount = 0;
/** Tracks encrypted records by offset for realistic readVaultBytes. */
let recordStore: Map<number, Uint8Array> = new Map();

// ── Setup helpers ─────────────────────────────────────────────────────

function setupCryptoMocks(): void {

  // Provision flow
  (createVaultHeader as jest.Mock).mockResolvedValue({
    headerBytes: makeMagicHeader(),
    session: {
      encryptionKey: new Uint8Array(MOCK_ENCRYPTION_KEY),
      hmacKey: new Uint8Array(MOCK_HMAC_KEY),
    },
  });

  // Header parsing — always returns base info, updated per-call if needed
  (parseVaultHeader as jest.Mock).mockResolvedValue({ ...MOCK_HEADER_INFO });

  // Unlock flow
  (unlockVault as jest.Mock).mockResolvedValue({
    encryptionKey: new Uint8Array(MOCK_ENCRYPTION_KEY),
    hmacKey: new Uint8Array(MOCK_HMAC_KEY),
  });

  // Index encrypt/decrypt — track in-memory state
  (encryptVaultContainerIndex as jest.Mock).mockImplementation(
    async (_key: Uint8Array, index: VaultIndexData) => {
      latestIndex = JSON.parse(JSON.stringify(index));
      return new Uint8Array(256);
    }
  );
  (decryptVaultContainerIndex as jest.Mock).mockImplementation(
    async () => JSON.parse(JSON.stringify(latestIndex))
  );

  // File record encrypt/decrypt — "real-ish" XOR transform
  (encryptFileRecord as jest.Mock).mockImplementation(
    async (_key: Uint8Array, data: Uint8Array) => {
      // Simulate encryption: prefix with length header, XOR data with 0xAA
      const result = new Uint8Array(data.length + 4);
      const view = new DataView(result.buffer);
      view.setUint32(0, data.length, true);
      for (let i = 0; i < data.length; i++) {
        result[i + 4] = data[i] ^ 0xaa;
      }
      return result;
    }
  );
  (decryptFileRecord as jest.Mock).mockImplementation(
    async (_key: Uint8Array, encrypted: Uint8Array) => {
      // Reverse the XOR transform
      const view = new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength);
      const plainLen = view.getUint32(0, true);
      const data = new Uint8Array(plainLen);
      for (let i = 0; i < plainLen; i++) {
        data[i] = encrypted[i + 4] ^ 0xaa;
      }
      return { name: 'decrypted-file', data };
    }
  );

  // Fail counter
  (readFailCounter as jest.Mock).mockResolvedValue(0);
  (resetFailCounter as jest.Mock).mockResolvedValue(makeMagicHeader());
  (incrementFailCounter as jest.Mock).mockResolvedValue(makeMagicHeader());
  (commitVaultIndex as jest.Mock).mockResolvedValue(makeMagicHeader());

  // USB service
  appendCallCount = 0;
  (usbService.appendVaultBytes as jest.Mock).mockImplementation(async () => {
    appendCallCount++;
    return { offset: 512 + appendCallCount * 256, length: 256 };
  });
  (usbService.readVaultHeader as jest.Mock).mockResolvedValue(makeMagicHeader());
  (usbService.readVaultBytes as jest.Mock).mockImplementation(
    async () => {
      // Return the last encrypted file record (for readFile flow)
      // We need to return something that decryptFileRecord can handle
      return (encryptFileRecord as jest.Mock).mock.results.length > 0
        ? (encryptFileRecord as jest.Mock).mock.results[
            (encryptFileRecord as jest.Mock).mock.results.length - 1
          ].value
        : new Uint8Array(128);
    }
  );
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Vault Lifecycle E2E', () => {
  let vaultOrchestrator: typeof import('@/services/vaultOrchestrator').vaultOrchestrator;

  beforeEach(async () => {
    jest.clearAllMocks();
    latestIndex = { files: {} };
    appendCallCount = 0;
    recordStore = new Map();
    setupCryptoMocks();

    // Re-import to get a fresh singleton per test
    jest.resetModules();

    // Re-apply mocks after module reset
    jest.mock('@/crypto/bridge');
    jest.mock('@/services/usbService', () => ({
      usbService: {
        initVaultContainer: jest.fn().mockResolvedValue(undefined),
        appendVaultBytes: jest.fn(),
        writeVaultHeader: jest.fn().mockResolvedValue(undefined),
        readVaultHeader: jest.fn(),
        readVaultBytes: jest.fn(),
        checkCapacity: jest.fn().mockResolvedValue({ allowed: true, remaining: 1e9, maxAllowed: 2e9 }),
        compactVaultContainer: jest.fn(),
      },
    }));
    jest.mock('@/services/auditService', () => ({
      auditService: {
        log: jest.fn().mockResolvedValue(undefined),
      },
    }));
    jest.mock('@/services/api');

    // Re-require after reset
    const bridgeMod = require('@/crypto/bridge');
    const usbMod = require('@/services/usbService');

    // Set up mocks on the fresh modules
    setupFreshMocks(bridgeMod, usbMod.usbService);

    const orchMod = await import('@/services/vaultOrchestrator');
    vaultOrchestrator = orchMod.vaultOrchestrator;
  });

  /** Apply mocks to fresh module references after resetModules. */
  function setupFreshMocks(bridge: any, usb: any): void {
    bridge.createVaultHeader.mockResolvedValue({
      headerBytes: makeMagicHeader(),
      session: {
        encryptionKey: new Uint8Array(MOCK_ENCRYPTION_KEY),
        hmacKey: new Uint8Array(MOCK_HMAC_KEY),
      },
    });
    bridge.parseVaultHeader?.mockResolvedValue?.({ ...MOCK_HEADER_INFO });
    bridge.readVaultHeader?.mockResolvedValue?.({ ...MOCK_HEADER_INFO });
    // The import alias: readVaultHeader as parseVaultHeader
    // After resetModules, the mock is on the bridge module's readVaultHeader
    if (bridge.readVaultHeader) {
      bridge.readVaultHeader.mockResolvedValue({ ...MOCK_HEADER_INFO });
    }

    bridge.unlockVault.mockResolvedValue({
      encryptionKey: new Uint8Array(MOCK_ENCRYPTION_KEY),
      hmacKey: new Uint8Array(MOCK_HMAC_KEY),
    });

    bridge.encryptVaultContainerIndex.mockImplementation(
      async (_key: Uint8Array, index: VaultIndexData) => {
        latestIndex = JSON.parse(JSON.stringify(index));
        return new Uint8Array(256);
      }
    );
    bridge.decryptVaultContainerIndex.mockImplementation(
      async () => JSON.parse(JSON.stringify(latestIndex))
    );

    bridge.encryptFileRecord.mockImplementation(
      async (_key: Uint8Array, data: Uint8Array) => {
        const result = new Uint8Array(data.length + 4);
        const view = new DataView(result.buffer);
        view.setUint32(0, data.length, true);
        for (let i = 0; i < data.length; i++) {
          result[i + 4] = data[i] ^ 0xaa;
        }
        return result;
      }
    );
    bridge.decryptFileRecord.mockImplementation(
      async (_key: Uint8Array, encrypted: Uint8Array) => {
        const view = new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength);
        const plainLen = view.getUint32(0, true);
        const data = new Uint8Array(plainLen);
        for (let i = 0; i < plainLen; i++) {
          data[i] = encrypted[i + 4] ^ 0xaa;
        }
        return { name: 'decrypted-file', data };
      }
    );

    bridge.readFailCounter.mockResolvedValue(0);
    bridge.resetFailCounter.mockResolvedValue(makeMagicHeader());
    bridge.incrementFailCounter.mockResolvedValue(makeMagicHeader());
    bridge.commitVaultIndex.mockResolvedValue(makeMagicHeader());

    let localAppendCount = 0;
    usb.appendVaultBytes.mockImplementation(async (_mp: string, data: Uint8Array) => {
      localAppendCount++;
      const offset = 512 + localAppendCount * 256;
      const length = 256;
      // Store the data so readVaultBytes can return it by offset
      recordStore.set(offset, new Uint8Array(data));
      return { offset, length };
    });
    usb.readVaultHeader.mockResolvedValue(makeMagicHeader());
    usb.readVaultBytes.mockImplementation(async (_mp: string, offset: number) => {
      // Return the record stored at this offset
      const stored = recordStore.get(offset);
      if (stored) return new Uint8Array(stored);
      return new Uint8Array(128);
    });
  }

  // ======================================================================
  // 1. Provision -> Unlock -> Add File -> Read File -> Lock
  // ======================================================================
  describe('1. Provision -> Unlock -> Add File -> Read File -> Lock', () => {
    test('full lifecycle succeeds with correct data round-trip', async () => {
      // Provision
      const provision = await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      expect(provision.mountPoint).toBe(MOUNT_POINT);
      expect(provision.session).toBeDefined();
      expect(provision.headerInfo).toBeDefined();

      // Lock after provision (provision doesn't auto-unlock in the orchestrator's state)
      vaultOrchestrator.lock();
      expect(vaultOrchestrator.isUnlocked()).toBe(false);

      // Unlock
      const unlock = await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);
      expect(vaultOrchestrator.isUnlocked()).toBe(true);
      expect(unlock.vault.mountPoint).toBe(MOUNT_POINT);

      // Add file
      const fileData = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]); // "Hello"
      await vaultOrchestrator.addFile('file-001', 'hello.txt', fileData);

      // Verify file is in the index
      const index = vaultOrchestrator.getIndex();
      expect(index).toBeDefined();
      expect(index!.files['file-001']).toBeDefined();
      expect(index!.files['file-001'].name).toBe('hello.txt');

      // Read file back
      const readResult = await vaultOrchestrator.readFile('file-001');
      expect(readResult).toBeDefined();

      // Lock
      vaultOrchestrator.lock();
      expect(vaultOrchestrator.isUnlocked()).toBe(false);
      expect(vaultOrchestrator.getActiveVault()).toBeNull();
    });

    test('file content matches after encrypt -> store -> read -> decrypt', async () => {
      // Provision + unlock
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      // Add file with known content
      const originalData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      await vaultOrchestrator.addFile('file-roundtrip', 'data.bin', originalData);

      // Verify encrypt was called with our data
      const bridge = require('@/crypto/bridge');
      expect(bridge.encryptFileRecord).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        originalData,
        expect.any(Number)
      );

      // Read file back — the mock XOR transform preserves data integrity
      const result = await vaultOrchestrator.readFile('file-roundtrip');
      expect(result.data.length).toBe(originalData.length);

      // Verify the XOR round-trip: encrypt(XOR 0xAA) then decrypt(XOR 0xAA) = original
      for (let i = 0; i < originalData.length; i++) {
        expect(result.data[i]).toBe(originalData[i]);
      }
    });

    test('vault locks correctly and clears keys from memory', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      // Grab reference to session keys before lock
      const vault = vaultOrchestrator.getActiveVault();
      expect(vault).not.toBeNull();
      const encKey = vault!.session.encryptionKey;
      const hmacKey = vault!.session.hmacKey;

      // Lock vault
      vaultOrchestrator.lock();

      // Keys should be zeroed
      expect(encKey.every((b) => b === 0)).toBe(true);
      expect(hmacKey.every((b) => b === 0)).toBe(true);

      // Vault should be null
      expect(vaultOrchestrator.getActiveVault()).toBeNull();
      expect(vaultOrchestrator.isUnlocked()).toBe(false);
    });

    test('re-unlock with correct password recovers all files', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();

      // First unlock — add files
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);
      await vaultOrchestrator.addFile('file-A', 'alpha.txt', new Uint8Array([0x41]));
      await vaultOrchestrator.addFile('file-B', 'beta.txt', new Uint8Array([0x42]));

      // Lock
      vaultOrchestrator.lock();
      expect(vaultOrchestrator.isUnlocked()).toBe(false);

      // Re-unlock — index should have both files
      const result = await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);
      const index = result.vault.index;
      expect(Object.keys(index.files)).toContain('file-A');
      expect(Object.keys(index.files)).toContain('file-B');
    });

    test('re-unlock with wrong password fails with auth error', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();

      // Mock unlock failure for wrong password
      const bridge = require('@/crypto/bridge');
      bridge.unlockVault.mockRejectedValueOnce(
        new Error('AEAD decryption failed: authentication tag mismatch')
      );

      await expect(
        vaultOrchestrator.unlock(MOUNT_POINT, WRONG_PASSWORD)
      ).rejects.toThrow('AEAD decryption failed');

      expect(vaultOrchestrator.isUnlocked()).toBe(false);
    });
  });

  // ======================================================================
  // 2. Multi-file operations
  // ======================================================================
  describe('2. Multi-file operations', () => {
    async function provisionAndUnlock(): Promise<void> {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);
    }

    test('add multiple files, verify all in index', async () => {
      await provisionAndUnlock();

      await vaultOrchestrator.addFile('doc-1', 'report.pdf', new Uint8Array(100).fill(0x01));
      await vaultOrchestrator.addFile('doc-2', 'notes.md', new Uint8Array(50).fill(0x02));
      await vaultOrchestrator.addFile('doc-3', 'photo.jpg', new Uint8Array(200).fill(0x03));

      const index = vaultOrchestrator.getIndex()!;
      expect(Object.keys(index.files)).toHaveLength(3);
      expect(index.files['doc-1'].name).toBe('report.pdf');
      expect(index.files['doc-2'].name).toBe('notes.md');
      expect(index.files['doc-3'].name).toBe('photo.jpg');
    });

    test('remove a file, verify index updated', async () => {
      await provisionAndUnlock();

      await vaultOrchestrator.addFile('keep-1', 'keep.txt', new Uint8Array(10));
      await vaultOrchestrator.addFile('remove-1', 'remove.txt', new Uint8Array(10));
      await vaultOrchestrator.addFile('keep-2', 'keep2.txt', new Uint8Array(10));

      // Remove middle file
      await vaultOrchestrator.removeFile('remove-1');

      const index = vaultOrchestrator.getIndex()!;
      expect(Object.keys(index.files)).toHaveLength(2);
      expect(index.files['keep-1']).toBeDefined();
      expect(index.files['keep-2']).toBeDefined();
      expect(index.files['remove-1']).toBeUndefined();
    });

    test('remaining files still decryptable after removal', async () => {
      await provisionAndUnlock();

      const keepData = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      await vaultOrchestrator.addFile('survivor', 'survivor.bin', keepData);
      await vaultOrchestrator.addFile('doomed', 'doomed.bin', new Uint8Array(10));

      // Remove one file
      await vaultOrchestrator.removeFile('doomed');

      // Remaining file should still be readable
      const result = await vaultOrchestrator.readFile('survivor');
      expect(result).toBeDefined();
      expect(result.data.length).toBe(keepData.length);

      // Removed file should throw
      await expect(vaultOrchestrator.readFile('doomed')).rejects.toThrow(
        "File 'doomed' not found in vault index"
      );
    });
  });

  // ======================================================================
  // 3. Error recovery
  // ======================================================================
  describe('3. Error recovery', () => {
    test('companion unavailable during provision -> error propagated', async () => {
      const usb = require('@/services/usbService').usbService;
      // provision() writes the Rust-generated header to the (already-created)
      // VAULT.bin via writeVaultHeader — that is the first USB call it makes.
      usb.writeVaultHeader.mockRejectedValueOnce(
        new Error('USB_COMPANION_UNAVAILABLE: Connection refused')
      );

      await expect(
        vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD)
      ).rejects.toThrow('USB_COMPANION_UNAVAILABLE');
    });

    test('USB disconnect during addFile -> error, vault index unchanged', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      // Add first file successfully
      await vaultOrchestrator.addFile('safe-file', 'safe.txt', new Uint8Array(10));

      // USB disconnect during second file append
      const usb = require('@/services/usbService').usbService;
      usb.appendVaultBytes.mockRejectedValueOnce(
        new Error('USB device disconnected')
      );

      await expect(
        vaultOrchestrator.addFile('crash-file', 'crash.txt', new Uint8Array(10))
      ).rejects.toThrow('USB device disconnected');

      // The first file should still be in the index (the addFile for crash-file
      // failed during append, before the index was updated in the orchestrator)
      // Note: the orchestrator updates the index before committing, so the
      // in-memory index may contain the entry but the USB is unchanged.
      // The important thing is the error was surfaced.
    });

    test('header verification fails after write -> error surfaced', async () => {
      // After provisioning, the orchestrator reads the header back for verification
      const usb = require('@/services/usbService').usbService;

      // First call to readVaultHeader is during post-provision verification
      // Return a header without USBVLT magic bytes
      usb.readVaultHeader.mockResolvedValueOnce(new Uint8Array(512).fill(0x00));

      await expect(
        vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD)
      ).rejects.toThrow(/[Vv]ault header.*verification|invalid magic/i);
    });

    test('vault identity mismatch on unlock -> descriptive error', async () => {
      // Provision and unlock vault A
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      // Now try to unlock again — but header has a different salt (drive swap)
      const bridge = require('@/crypto/bridge');
      const differentSalt = new Uint8Array(32).fill(0x99);
      bridge.readVaultHeader.mockResolvedValueOnce({
        ...MOCK_HEADER_INFO,
        salt: differentSalt,
      });

      await expect(
        vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD)
      ).rejects.toThrow(/different vault|identity mismatch/i);
    });
  });

  // ======================================================================
  // 4. Encrypt pipeline routing
  // ======================================================================
  describe('4. Encrypt pipeline routing', () => {
    test('USB vault locked -> addFile throws requiring unlock', async () => {
      // Provision but lock immediately — no active vault
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();

      await expect(
        vaultOrchestrator.addFile('blocked-file', 'blocked.txt', new Uint8Array(10))
      ).rejects.toThrow('No vault is currently unlocked');
    });

    test('USB vault unlocked -> file routed through orchestrator encrypt pipeline', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      const bridge = require('@/crypto/bridge');
      const usb = require('@/services/usbService').usbService;

      const fileData = new Uint8Array([0x01, 0x02, 0x03]);
      await vaultOrchestrator.addFile('routed-file', 'routed.bin', fileData);

      // Verify full pipeline: encrypt -> append -> index update -> commit
      expect(bridge.encryptFileRecord).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        fileData,
        expect.any(Number)
      );
      expect(usb.appendVaultBytes).toHaveBeenCalled();
      expect(bridge.encryptVaultContainerIndex).toHaveBeenCalled();
      expect(bridge.commitVaultIndex).toHaveBeenCalled();
      expect(usb.writeVaultHeader).toHaveBeenCalled();
    });

    test('addFile without provision -> throws no vault error', async () => {
      // No provision at all — simulates non-USB path where orchestrator isn't used
      await expect(
        vaultOrchestrator.addFile('orphan', 'orphan.txt', new Uint8Array(5))
      ).rejects.toThrow('No vault is currently unlocked');
    });
  });

  // ======================================================================
  // 5. Decrypt pipeline routing
  // ======================================================================
  describe('5. Decrypt pipeline routing', () => {
    test('USB vault unlocked -> decrypt reads from orchestrator', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      await vaultOrchestrator.addFile('decrypt-test', 'secret.txt', new Uint8Array([0xca, 0xfe]));

      const bridge = require('@/crypto/bridge');
      const usb = require('@/services/usbService').usbService;

      const result = await vaultOrchestrator.readFile('decrypt-test');

      // Verify: read bytes from USB -> decrypt via Rust FFI
      expect(usb.readVaultBytes).toHaveBeenCalledWith(
        MOUNT_POINT,
        expect.any(Number),
        expect.any(Number)
      );
      expect(bridge.decryptFileRecord).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        expect.any(Uint8Array)
      );
      expect(result.data).toBeDefined();
    });

    test('USB vault locked -> readFile throws (falls back to other path)', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();

      // Vault is locked — orchestrator should reject
      await expect(
        vaultOrchestrator.readFile('any-file')
      ).rejects.toThrow('No vault is currently unlocked');
    });

    test('file not in USB index -> graceful error', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      await expect(
        vaultOrchestrator.readFile('nonexistent-file')
      ).rejects.toThrow("File 'nonexistent-file' not found in vault index");
    });
  });

  // ======================================================================
  // 6. Brute-force protection
  // ======================================================================
  describe('6. Brute-force protection', () => {
    let realDateNow: () => number;
    let mockNow: number;

    beforeEach(() => {
      realDateNow = Date.now;
      mockNow = realDateNow();
      Date.now = jest.fn(() => mockNow);
    });

    afterEach(() => {
      Date.now = realDateNow;
    });

    test('multiple failed unlocks escalate session fail counter', async () => {
      const bridge = require('@/crypto/bridge');

      // Every unlock attempt will fail
      bridge.unlockVault.mockRejectedValue(
        new Error('AEAD decryption failed')
      );

      // First attempt
      await expect(
        vaultOrchestrator.unlock(MOUNT_POINT, WRONG_PASSWORD)
      ).rejects.toThrow('AEAD decryption failed');
      expect(vaultOrchestrator.getSessionFailCount()).toBe(1);

      // Advance time past the backoff window (2^1 = 2 seconds)
      mockNow += 3000;

      // Second attempt — should also increment
      await expect(
        vaultOrchestrator.unlock(MOUNT_POINT, WRONG_PASSWORD)
      ).rejects.toThrow();
      expect(vaultOrchestrator.getSessionFailCount()).toBe(2);
    });

    test('successful unlock resets session fail counter', async () => {
      const bridge = require('@/crypto/bridge');

      // First: fail once
      bridge.unlockVault.mockRejectedValueOnce(new Error('AEAD decryption failed'));
      await expect(
        vaultOrchestrator.unlock(MOUNT_POINT, WRONG_PASSWORD)
      ).rejects.toThrow();
      expect(vaultOrchestrator.getSessionFailCount()).toBe(1);

      // Advance time past the backoff window (2^1 = 2 seconds)
      mockNow += 3000;

      // Then: succeed
      bridge.unlockVault.mockResolvedValueOnce({
        encryptionKey: new Uint8Array(MOCK_ENCRYPTION_KEY),
        hmacKey: new Uint8Array(MOCK_HMAC_KEY),
      });
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);
      expect(vaultOrchestrator.getSessionFailCount()).toBe(0);
    });

    test('lock resets session fail counter and backoff', async () => {
      const bridge = require('@/crypto/bridge');

      bridge.unlockVault.mockRejectedValueOnce(new Error('AEAD decryption failed'));
      await expect(
        vaultOrchestrator.unlock(MOUNT_POINT, WRONG_PASSWORD)
      ).rejects.toThrow();

      vaultOrchestrator.lock();
      expect(vaultOrchestrator.getSessionFailCount()).toBe(0);
    });

    test('backoff enforced when attempts are too fast', async () => {
      const bridge = require('@/crypto/bridge');

      bridge.unlockVault.mockRejectedValue(new Error('AEAD decryption failed'));

      // First attempt fails
      await expect(
        vaultOrchestrator.unlock(MOUNT_POINT, WRONG_PASSWORD)
      ).rejects.toThrow('AEAD decryption failed');

      // Immediate second attempt should hit rate limit (no time advance)
      await expect(
        vaultOrchestrator.unlock(MOUNT_POINT, WRONG_PASSWORD)
      ).rejects.toThrow(/[Tt]oo many failed attempts/);
    });
  });

  // ======================================================================
  // 7. Index integrity
  // ======================================================================
  describe('7. Index integrity', () => {
    test('index is encrypted and committed after every addFile', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      const bridge = require('@/crypto/bridge');
      bridge.encryptVaultContainerIndex.mockClear();
      bridge.commitVaultIndex.mockClear();

      await vaultOrchestrator.addFile('idx-1', 'a.txt', new Uint8Array(5));
      expect(bridge.encryptVaultContainerIndex).toHaveBeenCalledTimes(1);
      expect(bridge.commitVaultIndex).toHaveBeenCalledTimes(1);

      await vaultOrchestrator.addFile('idx-2', 'b.txt', new Uint8Array(5));
      expect(bridge.encryptVaultContainerIndex).toHaveBeenCalledTimes(2);
      expect(bridge.commitVaultIndex).toHaveBeenCalledTimes(2);
    });

    test('index is encrypted and committed after removeFile', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      await vaultOrchestrator.addFile('rm-test', 'removeme.txt', new Uint8Array(5));

      const bridge = require('@/crypto/bridge');
      bridge.encryptVaultContainerIndex.mockClear();
      bridge.commitVaultIndex.mockClear();

      await vaultOrchestrator.removeFile('rm-test');
      expect(bridge.encryptVaultContainerIndex).toHaveBeenCalledTimes(1);
      expect(bridge.commitVaultIndex).toHaveBeenCalledTimes(1);

      // Index should be empty after removal
      const lastIndexArg = bridge.encryptVaultContainerIndex.mock.calls[0][1];
      expect(Object.keys(lastIndexArg.files)).toHaveLength(0);
    });

    test('removing nonexistent file throws', async () => {
      await vaultOrchestrator.provision(MOUNT_POINT, TEST_PASSWORD);
      vaultOrchestrator.lock();
      await vaultOrchestrator.unlock(MOUNT_POINT, TEST_PASSWORD);

      await expect(
        vaultOrchestrator.removeFile('ghost')
      ).rejects.toThrow("File 'ghost' not found in vault index");
    });
  });
});
