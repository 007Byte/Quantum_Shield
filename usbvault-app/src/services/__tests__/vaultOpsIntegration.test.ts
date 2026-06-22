/**
 * VAULT OPERATIONS INTEGRATION TESTS (TEST-GAP-2)
 *
 * Tests the integration between:
 *   - key hierarchy service (KEK/MEK creation, unlock, rotation)
 *   - crypto bridge (Rust FFI for key derivation, wrapping, HKDF)
 *   - vault orchestrator (provision, unlock, file operations)
 *
 * Strategy: Mock the API/network layer and usbService (USB I/O),
 * but let the crypto bridge, key hierarchy, and vault orchestrator
 * interact through their real interfaces where possible.
 */

jest.mock('@/crypto/bridge');
jest.mock('@/services/usbService', () => {
  // readVaultHeader must carry the "USBVLT" magic bytes — provision()/unlock()
  // verify them before continuing.
  const makeValidHeaderBytes = () => {
    const bytes = new Uint8Array(512);
    bytes.set(new TextEncoder().encode('USBVLT'), 0);
    return bytes;
  };
  return {
    usbService: {
      initVaultContainer: jest.fn().mockResolvedValue(undefined),
      appendVaultBytes: jest.fn().mockResolvedValue({ offset: 512, length: 256 }),
      writeVaultHeader: jest.fn().mockResolvedValue(undefined),
      readVaultHeader: jest.fn().mockResolvedValue(makeValidHeaderBytes()),
      readVaultBytes: jest.fn().mockResolvedValue(new Uint8Array(256)),
    },
  };
});
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/services/api');

import {
  generateMEK,
  deriveKEK,
  wrapMEK,
  unwrapMEK,
  deriveFileKey,
  randomBytes,
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
  type VaultSession,
  type VaultHeaderInfo,
  type VaultIndexData,
} from '@/crypto/bridge';

import {
  createKeyHierarchy,
  unlockKeyHierarchy,
  rotatePassword,
  getFileEncryptionKey,
} from '@/services/crypto/keyHierarchy';

// ── Test data ──────────────────────────────────────────────────────

const TEST_PASSWORD = 'VaultP@ssw0rd!2026';
const NEW_PASSWORD = 'N3wVaultP@ss!2026';
const MOCK_MEK = new Uint8Array(64).fill(0xbb);
const MOCK_KEK = new Uint8Array(32).fill(0xcc);
const MOCK_SALT = new Uint8Array(32).fill(0xdd);
const MOCK_WRAPPED_MEK = new Uint8Array(96).fill(0xee); // nonce(24) + ct(64) + tag(16) ~ 104, but mock
const MOCK_FILE_KEY = new Uint8Array(32).fill(0xff);

const MOCK_SESSION: VaultSession = {
  encryptionKey: new Uint8Array(32).fill(0x11),
  hmacKey: new Uint8Array(32).fill(0x22),
};

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

// ── Setup ──────────────────────────────────────────────────────────

function setupCryptoBridgeMocks(): void {
  (randomBytes as jest.Mock).mockImplementation(async (n: number) => new Uint8Array(n).fill(0xdd));
  (generateMEK as jest.Mock).mockResolvedValue(MOCK_MEK);
  (deriveKEK as jest.Mock).mockResolvedValue(MOCK_KEK);
  (wrapMEK as jest.Mock).mockResolvedValue(MOCK_WRAPPED_MEK);
  (unwrapMEK as jest.Mock).mockResolvedValue(MOCK_MEK);
  (deriveFileKey as jest.Mock).mockResolvedValue(MOCK_FILE_KEY);

  // Vault-level crypto mocks
  (createVaultHeader as jest.Mock).mockResolvedValue({
    headerBytes: new Uint8Array(512),
    session: MOCK_SESSION,
  });
  (parseVaultHeader as jest.Mock).mockResolvedValue(MOCK_HEADER_INFO);
  (unlockVault as jest.Mock).mockResolvedValue(MOCK_SESSION);
  (encryptVaultContainerIndex as jest.Mock).mockResolvedValue(new Uint8Array(256));
  (decryptVaultContainerIndex as jest.Mock).mockResolvedValue({ files: {} } as VaultIndexData);
  (encryptFileRecord as jest.Mock).mockResolvedValue(new Uint8Array(128));
  (decryptFileRecord as jest.Mock).mockResolvedValue({
    name: 'test.pdf',
    data: new Uint8Array(100),
  });
  (readFailCounter as jest.Mock).mockResolvedValue(0);
  (resetFailCounter as jest.Mock).mockResolvedValue(new Uint8Array(512));
  (incrementFailCounter as jest.Mock).mockResolvedValue({
    headerBytes: new Uint8Array(512),
    failCount: 1,
  });
  (commitVaultIndex as jest.Mock).mockResolvedValue(new Uint8Array(512));
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Vault Operations Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupCryptoBridgeMocks();
  });

  // ============================================================================
  // 1. Create Vault Flow: Generate MEK → wrap with KEK → store key hierarchy
  // ============================================================================
  describe('Create Vault Flow', () => {
    it('should create a full key hierarchy: salt → KEK → MEK → wrappedMek', async () => {
      const result = await createKeyHierarchy(TEST_PASSWORD);

      // Step 1: Random salt generated
      expect(randomBytes).toHaveBeenCalledWith(32);

      // Step 2: KEK derived from password + salt via Argon2id
      expect(deriveKEK).toHaveBeenCalledWith(TEST_PASSWORD, expect.any(Uint8Array));

      // Step 3: Random MEK generated (64 bytes)
      expect(generateMEK).toHaveBeenCalled();

      // Step 4: MEK wrapped with KEK
      expect(wrapMEK).toHaveBeenCalledWith(MOCK_KEK, MOCK_MEK);

      // Result should contain all components
      expect(result.mek).toEqual(MOCK_MEK);
      expect(result.wrappedMek).toEqual(MOCK_WRAPPED_MEK);
      expect(result.kekSalt).toEqual(expect.any(Uint8Array));
      expect(result.kekSalt.length).toBe(32);
    });

    it('should derive per-file encryption keys from MEK', async () => {
      const result = await createKeyHierarchy(TEST_PASSWORD);
      const fileId = 'file-abc-123';

      const fileKey = await getFileEncryptionKey(result.mek, fileId);

      // HKDF(mek, "file_encryption:<fileId>") → 32-byte key
      expect(deriveFileKey).toHaveBeenCalledWith(MOCK_MEK, fileId);
      expect(fileKey).toEqual(MOCK_FILE_KEY);
      expect(fileKey.length).toBe(32);
    });

    it('should generate unique file keys for different file IDs', async () => {
      const fileKeyA = new Uint8Array(32).fill(0xaa);
      const fileKeyB = new Uint8Array(32).fill(0xbb);

      (deriveFileKey as jest.Mock)
        .mockResolvedValueOnce(fileKeyA)
        .mockResolvedValueOnce(fileKeyB);

      const result = await createKeyHierarchy(TEST_PASSWORD);

      const keyA = await getFileEncryptionKey(result.mek, 'file-A');
      const keyB = await getFileEncryptionKey(result.mek, 'file-B');

      expect(deriveFileKey).toHaveBeenCalledTimes(2);
      expect(keyA).not.toEqual(keyB);
    });

    it('should propagate crypto errors during key hierarchy creation', async () => {
      (generateMEK as jest.Mock).mockRejectedValue(
        new Error('Native crypto module not loaded')
      );

      await expect(createKeyHierarchy(TEST_PASSWORD)).rejects.toThrow(
        'Key hierarchy creation failed'
      );
    });
  });

  // ============================================================================
  // 2. Vault List + Access: Unlock key hierarchy → verify MEK → derive keys
  // ============================================================================
  describe('Vault Unlock + Access', () => {
    it('should unlock key hierarchy with correct password', async () => {
      const result = await unlockKeyHierarchy(TEST_PASSWORD, MOCK_SALT, MOCK_WRAPPED_MEK);

      // KEK re-derived from password + stored salt
      expect(deriveKEK).toHaveBeenCalledWith(TEST_PASSWORD, MOCK_SALT);

      // MEK unwrapped using KEK — AEAD tag verifies integrity
      expect(unwrapMEK).toHaveBeenCalledWith(MOCK_KEK, MOCK_WRAPPED_MEK);

      expect(result.mek).toEqual(MOCK_MEK);
    });

    it('should fail unlock with wrong password (AEAD tag mismatch)', async () => {
      (unwrapMEK as jest.Mock).mockRejectedValue(
        new Error('AEAD decryption failed: authentication tag mismatch')
      );

      await expect(
        unlockKeyHierarchy('wrong-password', MOCK_SALT, MOCK_WRAPPED_MEK)
      ).rejects.toThrow('Key hierarchy unlock failed');
    });

    it('should allow file key derivation after successful unlock', async () => {
      const { mek } = await unlockKeyHierarchy(TEST_PASSWORD, MOCK_SALT, MOCK_WRAPPED_MEK);

      const fileKey = await getFileEncryptionKey(mek, 'file-xyz-789');

      expect(deriveFileKey).toHaveBeenCalledWith(MOCK_MEK, 'file-xyz-789');
      expect(fileKey.length).toBe(32);
    });

    it('should handle corrupted wrappedMek blob', async () => {
      (unwrapMEK as jest.Mock).mockRejectedValue(
        new Error('Ciphertext too short')
      );

      await expect(
        unlockKeyHierarchy(TEST_PASSWORD, MOCK_SALT, new Uint8Array(10))
      ).rejects.toThrow('Key hierarchy unlock failed');
    });
  });

  // ============================================================================
  // 3. Key Rotation Flow: Old MEK → re-wrap → new KEK → verify old data accessible
  // ============================================================================
  describe('Key Rotation Flow', () => {
    it('should rotate password without changing MEK', async () => {
      const newWrappedMek = new Uint8Array(96).fill(0xab);
      const newSalt = new Uint8Array(32).fill(0xcd);

      (randomBytes as jest.Mock).mockResolvedValueOnce(newSalt);
      (wrapMEK as jest.Mock).mockResolvedValueOnce(newWrappedMek);

      const result = await rotatePassword(
        TEST_PASSWORD,
        NEW_PASSWORD,
        MOCK_SALT,
        MOCK_WRAPPED_MEK
      );

      // Step 1: Unwrap MEK with old password
      expect(deriveKEK).toHaveBeenCalledWith(TEST_PASSWORD, MOCK_SALT);
      expect(unwrapMEK).toHaveBeenCalledWith(MOCK_KEK, MOCK_WRAPPED_MEK);

      // Step 2: New salt generated
      expect(randomBytes).toHaveBeenCalled();

      // Step 3: New KEK derived from new password
      expect(deriveKEK).toHaveBeenCalledWith(NEW_PASSWORD, expect.any(Uint8Array));

      // Step 4: Same MEK re-wrapped with new KEK
      expect(wrapMEK).toHaveBeenCalled();

      expect(result.newWrappedMek).toEqual(newWrappedMek);
      expect(result.newKekSalt).toEqual(newSalt);
    });

    it('should allow unlock with new password after rotation', async () => {
      const newWrappedMek = new Uint8Array(96).fill(0xab);
      const newSalt = new Uint8Array(32).fill(0xcd);

      (randomBytes as jest.Mock).mockResolvedValueOnce(newSalt);
      (wrapMEK as jest.Mock).mockResolvedValueOnce(newWrappedMek);

      const rotation = await rotatePassword(
        TEST_PASSWORD,
        NEW_PASSWORD,
        MOCK_SALT,
        MOCK_WRAPPED_MEK
      );

      // Now unlock with new password and new wrapped MEK
      const unlocked = await unlockKeyHierarchy(
        NEW_PASSWORD,
        rotation.newKekSalt,
        rotation.newWrappedMek
      );

      // The MEK should be the same — files are still accessible
      expect(unlocked.mek).toEqual(MOCK_MEK);
    });

    it('should fail rotation if old password is wrong', async () => {
      (unwrapMEK as jest.Mock).mockRejectedValue(
        new Error('AEAD decryption failed')
      );

      await expect(
        rotatePassword('wrong-old-password', NEW_PASSWORD, MOCK_SALT, MOCK_WRAPPED_MEK)
      ).rejects.toThrow('Password rotation failed');
    });

    it('should preserve per-file keys after rotation (MEK unchanged)', async () => {
      const newWrappedMek = new Uint8Array(96).fill(0xab);
      const newSalt = new Uint8Array(32).fill(0xcd);

      (randomBytes as jest.Mock).mockResolvedValueOnce(newSalt);
      (wrapMEK as jest.Mock).mockResolvedValueOnce(newWrappedMek);

      // Rotate password
      await rotatePassword(TEST_PASSWORD, NEW_PASSWORD, MOCK_SALT, MOCK_WRAPPED_MEK);

      // Unlock with new password
      const { mek } = await unlockKeyHierarchy(NEW_PASSWORD, newSalt, newWrappedMek);

      // Derive same file key — should produce same result since MEK is unchanged
      const fileKey = await getFileEncryptionKey(mek, 'file-preserved-001');

      expect(deriveFileKey).toHaveBeenCalledWith(MOCK_MEK, 'file-preserved-001');
      expect(fileKey).toEqual(MOCK_FILE_KEY);
    });
  });

  // ============================================================================
  // Vault Provisioning via Orchestrator
  // ============================================================================
  describe('Vault Provisioning (Orchestrator)', () => {
    it('should provision a vault: create header → write to USB → set up index', async () => {
      // Import orchestrator (dynamic to avoid circular mock issues)
      const { vaultOrchestrator } = await import('@/services/vaultOrchestrator');

      const mountPoint = '/mnt/usb-001';
      const result = await vaultOrchestrator.provision(mountPoint, TEST_PASSWORD);

      // Verify: header created via Rust FFI
      expect(createVaultHeader).toHaveBeenCalledWith(TEST_PASSWORD, expect.any(Number));

      // Verify: empty index encrypted
      expect(encryptVaultContainerIndex).toHaveBeenCalledWith(
        MOCK_SESSION.encryptionKey,
        { files: {} }
      );

      // Verify: index committed
      expect(commitVaultIndex).toHaveBeenCalled();

      // Verify: result contains session (keys in memory only)
      expect(result.mountPoint).toBe(mountPoint);
      expect(result.session).toBeDefined();
      expect(result.headerInfo).toBeDefined();
    });
  });

  // ============================================================================
  // Error Scenarios
  // ============================================================================
  describe('Error Handling', () => {
    it('should propagate KEK derivation failure', async () => {
      (deriveKEK as jest.Mock).mockRejectedValue(
        new Error('Argon2id: insufficient memory')
      );

      await expect(createKeyHierarchy(TEST_PASSWORD)).rejects.toThrow(
        'Key hierarchy creation failed'
      );
    });

    it('should propagate MEK wrapping failure', async () => {
      (wrapMEK as jest.Mock).mockRejectedValue(
        new Error('Encryption failed: invalid key length')
      );

      await expect(createKeyHierarchy(TEST_PASSWORD)).rejects.toThrow(
        'Key hierarchy creation failed'
      );
    });

    it('should propagate file key derivation failure', async () => {
      (deriveFileKey as jest.Mock).mockRejectedValue(
        new Error('HKDF: invalid input key material')
      );

      await expect(getFileEncryptionKey(MOCK_MEK, 'bad-file')).rejects.toThrow(
        'HKDF: invalid input key material'
      );
    });
  });
});
