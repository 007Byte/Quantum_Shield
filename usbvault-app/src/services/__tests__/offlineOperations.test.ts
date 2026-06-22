/**
 * Offline-First Vault Operations Integration Tests
 *
 * Tests that vault operations (load, create, delete) degrade gracefully
 * when offline, use local cache appropriately, and sync correctly
 * when connectivity is restored.
 */

import { useVaultListStore } from '@/stores/vaultListStore';
import type { VaultInfo } from '@/types/domain';

// ── Mock dependencies ─────────────────────────────────────────────────

const mockListVaults = jest.fn();
const mockCreateVault = jest.fn();
const mockDeleteVault = jest.fn();

jest.mock('@/services/api', () => ({
  __esModule: true,
  listVaults: (...args: unknown[]) => mockListVaults(...args),
  createVault: (...args: unknown[]) => mockCreateVault(...args),
  deleteVault: (...args: unknown[]) => mockDeleteVault(...args),
  srpInit: jest.fn(),
  srpVerify: jest.fn(),
  storeTokens: jest.fn(),
  getApiClient: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  })),
}));

const mockLoadVaults = jest.fn();
const mockSaveVaults = jest.fn();
const mockDeleteVaultStorage = jest.fn();

jest.mock('@/services/storageService', () => ({
  storageService: {
    loadVaults: (...args: unknown[]) => mockLoadVaults(...args),
    saveVaults: (...args: unknown[]) => mockSaveVaults(...args),
    deleteVault: (...args: unknown[]) => mockDeleteVaultStorage(...args),
    loadFiles: jest.fn().mockResolvedValue([]),
    saveFile: jest.fn().mockResolvedValue(undefined),
    deleteFile: jest.fn().mockResolvedValue(undefined),
    saveEncryptedIndex: jest.fn().mockResolvedValue(undefined),
    loadEncryptedIndex: jest.fn().mockResolvedValue(null),
    deleteEncryptedIndex: jest.fn().mockResolvedValue(undefined),
    hasEncryptedIndex: jest.fn().mockResolvedValue(false),
    clear: jest.fn().mockResolvedValue(undefined),
    hasStoredData: jest.fn().mockResolvedValue(false),
    getEncryptedBlob: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../usbService', () => ({
  usbService: {
    listDrives: jest.fn().mockRejectedValue(new Error('No companion')),
    discoverVaults: jest.fn().mockRejectedValue(new Error('No companion')),
  },
}));

jest.mock('@/services/crypto/keyHierarchy', () => ({
  createKeyHierarchy: jest.fn().mockResolvedValue({
    mek: new Uint8Array(32),
    wrappedMekB64: 'mock-wrapped-mek',
    kekSaltHex: 'mock-kek-salt',
  }),
}));

jest.mock('@/services/crypto', () => ({
  encryptFileIndex: jest.fn().mockResolvedValue('encrypted-index'),
  decryptFileIndex: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
  fireAndForget: jest.fn((promise: unknown) => {
    // Swallow async fire-and-forget calls in tests
    if (promise && typeof (promise as Promise<unknown>).catch === 'function') {
      (promise as Promise<unknown>).catch(() => {});
    }
  }),
}));

jest.mock('@/utils/generateId', () => ({
  generateId: jest.fn(() => `vault-${Date.now()}-test`),
}));

jest.mock('@/stores/vaultPolling', () => ({
  markVaultLoadTime: jest.fn(),
  setPollingCallbacks: jest.fn(),
}));

jest.mock('@/stores/activeVaultStore', () => ({
  useActiveVaultStore: { getState: jest.fn(() => ({ clearActiveVault: jest.fn() })) },
}));

jest.mock('@/stores/vaultSessionStore', () => ({
  useVaultSessionStore: { getState: jest.fn(() => ({ clearSession: jest.fn() })) },
}));

jest.mock('@/stores/vaultIndexSync', () => ({
  scheduleIndexReEncrypt: jest.fn(),
}));

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

// ── Test data ─────────────────────────────────────────────────────────

const CACHED_VAULTS: VaultInfo[] = [
  {
    id: 'vault-local-001',
    name: 'Personal Vault',
    encryptedMetadata: 'enc-meta-001',
    fileCount: 5,
    lastModified: '2026-03-20T10:00:00.000Z',
    securityLevel: 'standard',
    source: 'local' as const,
  },
  {
    id: 'vault-local-002',
    name: 'Work Vault',
    encryptedMetadata: 'enc-meta-002',
    fileCount: 12,
    lastModified: '2026-03-21T14:30:00.000Z',
    securityLevel: 'maximum',
    source: 'local' as const,
  },
];

// ── Helper: simulate navigator.onLine ─────────────────────────────────

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value,
    writable: true,
    configurable: true,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('Offline-First Vault Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the store to initial state
    useVaultListStore.setState({
      vaultIds: [],
      vaultsById: {},
      vaults: [],
      files: [],
      isLoading: false,
      error: null,
    });
    // Default to online
    setOnline(true);
    // Default: no cached vaults, no migration key
    mockLoadVaults.mockResolvedValue([]);
    mockSaveVaults.mockResolvedValue(undefined);
    mockDeleteVaultStorage.mockResolvedValue(undefined);
    // Clear localStorage migration flag so each test starts fresh
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('usbvault:vault_source_migration_v1');
    }
  });

  // ============================================================================
  // loadVaults with local cache
  // ============================================================================
  describe('loadVaults with local cache', () => {
    it('returns cached vaults immediately when local cache exists', async () => {
      mockLoadVaults.mockResolvedValue(CACHED_VAULTS);

      await useVaultListStore.getState().loadVaults();

      const state = useVaultListStore.getState();
      expect(state.vaults.length).toBeGreaterThanOrEqual(2);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('cached vaults contain correct metadata', async () => {
      mockLoadVaults.mockResolvedValue(CACHED_VAULTS);

      await useVaultListStore.getState().loadVaults();

      const state = useVaultListStore.getState();
      const personalVault = state.vaults.find(v => v.id === 'vault-local-001');
      expect(personalVault).toBeDefined();
      expect(personalVault!.name).toBe('Personal Vault');
      expect(personalVault!.fileCount).toBe(5);
    });
  });

  // ============================================================================
  // loadVaults with empty cache + online
  // ============================================================================
  describe('loadVaults with empty cache + online', () => {
    it('loads vaults from local storage when cache is empty', async () => {
      mockLoadVaults.mockResolvedValue([]);

      await useVaultListStore.getState().loadVaults();

      const state = useVaultListStore.getState();
      expect(state.vaults).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(mockLoadVaults).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // loadVaults with empty cache + offline
  // ============================================================================
  describe('loadVaults with empty cache + offline', () => {
    it('returns empty array gracefully when offline with no cache', async () => {
      setOnline(false);
      mockLoadVaults.mockResolvedValue([]);

      await useVaultListStore.getState().loadVaults();

      const state = useVaultListStore.getState();
      expect(state.vaults).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('does not throw when offline', async () => {
      setOnline(false);
      mockLoadVaults.mockResolvedValue([]);

      await expect(useVaultListStore.getState().loadVaults()).resolves.not.toThrow();
    });
  });

  // ============================================================================
  // createVault offline
  // ============================================================================
  describe('createVault offline', () => {
    it('creates vault locally without throwing when offline', async () => {
      setOnline(false);

      const vaultId = await useVaultListStore
        .getState()
        .createVault('Offline Vault', new Uint8Array(16));

      expect(vaultId).toBeTruthy();
      expect(typeof vaultId).toBe('string');
    });

    it('adds the new vault to the store immediately', async () => {
      setOnline(false);

      const vaultId = await useVaultListStore
        .getState()
        .createVault('Offline Vault', new Uint8Array(16));

      const state = useVaultListStore.getState();
      expect(state.vaultIds).toContain(vaultId);
      expect(state.vaultsById[vaultId]).toBeDefined();
      expect(state.vaultsById[vaultId].name).toBe('Offline Vault');
    });
  });

  // ============================================================================
  // deleteVault offline
  // ============================================================================
  describe('deleteVault offline', () => {
    it('deletes vault locally without throwing when offline', async () => {
      // First create a vault
      const vaultId = await useVaultListStore
        .getState()
        .createVault('To Delete', new Uint8Array(16));

      setOnline(false);

      // Delete should not throw
      await expect(useVaultListStore.getState().deleteVault(vaultId)).resolves.not.toThrow();
    });

    it('removes the vault from store after deletion', async () => {
      const vaultId = await useVaultListStore
        .getState()
        .createVault('To Delete', new Uint8Array(16));

      // Verify it exists
      expect(useVaultListStore.getState().vaultIds).toContain(vaultId);

      setOnline(false);
      await useVaultListStore.getState().deleteVault(vaultId);

      const state = useVaultListStore.getState();
      expect(state.vaultIds).not.toContain(vaultId);
      expect(state.vaultsById[vaultId]).toBeUndefined();
    });
  });

  // ============================================================================
  // Background sync
  // ============================================================================
  describe('Background sync', () => {
    it('local state is preserved when sync fails', async () => {
      // Seed local cache
      mockLoadVaults.mockResolvedValue(CACHED_VAULTS);
      mockListVaults.mockRejectedValue(new Error('Network Error'));
      setOnline(false);

      await useVaultListStore.getState().loadVaults();

      const state = useVaultListStore.getState();
      // Local vaults should still be present
      expect(state.vaults.length).toBeGreaterThanOrEqual(2);
      expect(state.error).toBeNull();
    });

    it('store is not in error state after failed sync', async () => {
      mockLoadVaults.mockResolvedValue(CACHED_VAULTS);
      mockListVaults.mockRejectedValue(new Error('timeout'));
      setOnline(false);

      await useVaultListStore.getState().loadVaults();

      const state = useVaultListStore.getState();
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });
});
