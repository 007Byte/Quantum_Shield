/**
 * Web Storage Service Tests — Utility/UX
 *
 * Tests localStorage vault operations, IndexedDB file operations,
 * encrypted index operations, and clear/availability checks.
 */

import { webStorage } from '../webStorage';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock IndexedDB
const mockIDBStore: Record<string, Record<string, any>> = {
  encrypted_files: {},
  file_metadata: {},
  encrypted_indexes: {},
};

const mockTransaction = {
  objectStore: jest.fn((storeName: string) => ({
    get: jest.fn((key: string) => {
      const req = {
        result: mockIDBStore[storeName]?.[key],
        onsuccess: null as any,
        onerror: null as any,
      };
      setTimeout(() => req.onsuccess?.(), 0);
      return req;
    }),
    put: jest.fn((value: any, key: string) => {
      if (!mockIDBStore[storeName]) mockIDBStore[storeName] = {};
      mockIDBStore[storeName][key] = value;
      return {};
    }),
    delete: jest.fn((key: string) => {
      if (mockIDBStore[storeName]) {
        delete mockIDBStore[storeName][key];
      }
      return {};
    }),
    clear: jest.fn(() => {
      mockIDBStore[storeName] = {};
      return {};
    }),
    index: jest.fn(() => ({
      getAll: jest.fn((value: string) => {
        const req = {
          result: Object.values(mockIDBStore['file_metadata'] || {}).filter(
            (item: any) => item.vaultId === value
          ),
          onsuccess: null as any,
          onerror: null as any,
        };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
    })),
  })),
  oncomplete: null as any,
  onerror: null as any,
};

// Set oncomplete after creation
setTimeout(() => {
  if (mockTransaction.oncomplete) mockTransaction.oncomplete();
}, 0);

const mockDB = {
  transaction: jest.fn(() => {
    const tx = { ...mockTransaction };
    setTimeout(() => {
      if (tx.oncomplete) tx.oncomplete();
    }, 0);
    return tx;
  }),
  objectStoreNames: {
    contains: jest.fn().mockReturnValue(true),
  },
  createObjectStore: jest.fn(),
};

// Mock indexedDB.open
Object.defineProperty(window, 'indexedDB', {
  value: {
    open: jest.fn(() => {
      const request = {
        result: mockDB,
        onsuccess: null as any,
        onerror: null as any,
        onupgradeneeded: null as any,
      };
      setTimeout(() => {
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }),
  },
  configurable: true,
});

describe('WebStorageService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // Clear mock IDB stores
    Object.keys(mockIDBStore).forEach(key => {
      mockIDBStore[key] = {};
    });
  });

  // ============================================================================
  // Test: Availability
  // ============================================================================
  describe('isAvailable', () => {
    it('should return true on web platform with localStorage', () => {
      expect(webStorage.isAvailable()).toBe(true);
    });
  });

  // ============================================================================
  // Test: Vault Operations (localStorage)
  // ============================================================================
  describe('loadVaults', () => {
    it('should return empty array when no vaults stored', async () => {
      const vaults = await webStorage.loadVaults();
      expect(vaults).toEqual([]);
    });

    it('should return stored vaults', async () => {
      const testVaults = [
        { id: 'vault-1', name: 'Test Vault', fileCount: 5, lastModified: new Date().toISOString() },
      ];
      localStorage.setItem('usbvault:vaults', JSON.stringify(testVaults));

      const vaults = await webStorage.loadVaults();
      expect(vaults).toHaveLength(1);
      expect(vaults[0].id).toBe('vault-1');
    });
  });

  describe('saveVaults', () => {
    it('should persist vaults to localStorage', async () => {
      const vaults = [
        { id: 'vault-1', name: 'Test', fileCount: 0, lastModified: new Date().toISOString() },
      ] as any;

      await webStorage.saveVaults(vaults);

      const stored = localStorage.getItem('usbvault:vaults');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed[0].id).toBe('vault-1');
    });
  });

  describe('deleteVault', () => {
    it('should remove vault from list', async () => {
      const vaults = [
        { id: 'vault-1', name: 'Keep' },
        { id: 'vault-2', name: 'Delete' },
      ];
      localStorage.setItem('usbvault:vaults', JSON.stringify(vaults));

      await webStorage.deleteVault('vault-2');

      const remaining = await webStorage.loadVaults();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('vault-1');
    });
  });

  // ============================================================================
  // Test: hasStoredData
  // ============================================================================
  describe('hasStoredData', () => {
    it('should return false when no vaults stored', async () => {
      const hasData = await webStorage.hasStoredData();
      expect(hasData).toBe(false);
    });

    it('should return true when vaults exist', async () => {
      localStorage.setItem('usbvault:vaults', JSON.stringify([{ id: 'vault-1', name: 'Test' }]));

      const hasData = await webStorage.hasStoredData();
      expect(hasData).toBe(true);
    });
  });

  // ============================================================================
  // Test: Clear
  // ============================================================================
  describe('clear', () => {
    it('should remove vault data from localStorage', async () => {
      localStorage.setItem('usbvault:vaults', JSON.stringify([{ id: 'vault-1' }]));

      await webStorage.clear();

      expect(localStorage.getItem('usbvault:vaults')).toBeNull();
    });
  });

  // ============================================================================
  // Test: Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('should handle malformed JSON in localStorage gracefully', async () => {
      localStorage.setItem('usbvault:vaults', '{invalid json}');

      const vaults = await webStorage.loadVaults();
      // Should return null/empty rather than throwing
      expect(vaults).toEqual([]);
    });

    it('should handle empty string in localStorage', async () => {
      localStorage.setItem('usbvault:vaults', '');

      const vaults = await webStorage.loadVaults();
      expect(vaults).toEqual([]);
    });
  });

  // ============================================================================
  // Test: Encrypted Index Operations
  // ============================================================================
  describe('encrypted index operations', () => {
    it('saveEncryptedIndex should not throw', async () => {
      await expect(
        webStorage.saveEncryptedIndex('vault-1', 'base64encrypteddata')
      ).resolves.not.toThrow();
    });

    it('loadEncryptedIndex should return null when no index exists', async () => {
      const index = await webStorage.loadEncryptedIndex('nonexistent');
      expect(index).toBeNull();
    });

    it('deleteEncryptedIndex should not throw', async () => {
      await expect(webStorage.deleteEncryptedIndex('vault-1')).resolves.not.toThrow();
    });

    it('hasEncryptedIndex should return false for nonexistent vault', async () => {
      const has = await webStorage.hasEncryptedIndex('nonexistent');
      expect(has).toBe(false);
    });
  });

  // ============================================================================
  // Test: File Operations
  // ============================================================================
  describe('file operations', () => {
    it('loadFiles should return empty array when no files exist', async () => {
      const files = await webStorage.loadFiles('vault-1');
      expect(Array.isArray(files)).toBe(true);
    });

    it('getEncryptedBlob should return null when no blob exists', async () => {
      const blob = await webStorage.getEncryptedBlob('vault-1', 'file-1');
      expect(blob).toBeNull();
    });
  });
});
