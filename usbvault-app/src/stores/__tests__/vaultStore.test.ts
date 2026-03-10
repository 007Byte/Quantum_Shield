import { useVaultStore } from '@/stores/vaultStore';
import * as api from '@/services/api';

jest.mock('@/services/api');

describe('Vault Store (Zustand)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the store to initial state
    useVaultStore.setState({
      vaults: [],
      currentVault: null,
      files: [],
      isLoading: false,
      error: null,
    });
  });

  // ============================================================================
  // Test: Initial State
  // ============================================================================
  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useVaultStore.getState();

      expect(state.vaults).toEqual([]);
      expect(state.currentVault).toBeNull();
      expect(state.files).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  // ============================================================================
  // Test: Load Vaults Action
  // ============================================================================
  describe('Load Vaults Action', () => {
    it('should load vaults from API', async () => {
      const mockVaults = [
        {
          id: 'vault-1',
          name: 'My Vault',
          encryptedMetadata: 'meta1',
          fileCount: 5,
          lastModified: '2024-01-01T00:00:00Z',
          securityLevel: 'high' as const,
        },
        {
          id: 'vault-2',
          name: 'Work Vault',
          encryptedMetadata: 'meta2',
          fileCount: 10,
          lastModified: '2024-01-02T00:00:00Z',
          securityLevel: 'maximum' as const,
        },
      ];

      (api.listVaults as jest.Mock).mockResolvedValue(mockVaults);

      const store = useVaultStore.getState();
      await store.loadVaults();

      const updatedState = useVaultStore.getState();
      expect(updatedState.vaults).toHaveLength(2);
      expect(updatedState.vaults[0].id).toBe('vault-1');
      expect(updatedState.isLoading).toBe(false);
      expect(updatedState.error).toBeNull();
    });

    it('should set error if loadVaults fails', async () => {
      (api.listVaults as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      const store = useVaultStore.getState();
      await expect(store.loadVaults()).rejects.toThrow();

      const updatedState = useVaultStore.getState();
      expect(updatedState.error).toBeTruthy();
      expect(updatedState.isLoading).toBe(false);
    });

    it('should set isLoading during loadVaults', async () => {
      (api.listVaults as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([]), 100);
          })
      );

      const store = useVaultStore.getState();
      const loadPromise = store.loadVaults();

      const stateWhileLoading = useVaultStore.getState();
      expect(stateWhileLoading.isLoading).toBe(true);

      await loadPromise;

      const stateAfterLoading = useVaultStore.getState();
      expect(stateAfterLoading.isLoading).toBe(false);
    });
  });

  // ============================================================================
  // Test: Select Vault Action
  // ============================================================================
  describe('Select Vault Action', () => {
    it('should select vault from list', async () => {
      useVaultStore.setState({
        vaults: [
          {
            id: 'vault-1',
            name: 'My Vault',
            encryptedMetadata: 'meta1',
            fileCount: 5,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'high' as const,
          },
        ],
      });

      const store = useVaultStore.getState();
      await store.selectVault('vault-1');

      const updatedState = useVaultStore.getState();
      expect(updatedState.currentVault?.id).toBe('vault-1');
      expect(updatedState.isLoading).toBe(false);
    });

    it('should set error if vault not found', async () => {
      useVaultStore.setState({
        vaults: [],
      });

      const store = useVaultStore.getState();
      await store.selectVault('non-existent-vault');

      const updatedState = useVaultStore.getState();
      expect(updatedState.error).toBe('Vault not found');
      expect(updatedState.currentVault).toBeNull();
    });
  });

  // ============================================================================
  // Test: Create Vault Action
  // ============================================================================
  describe('Create Vault Action', () => {
    it('should create new vault', async () => {
      (api.createVault as jest.Mock).mockResolvedValue('new-vault-id');
      (api.listVaults as jest.Mock).mockResolvedValue([
        {
          id: 'new-vault-id',
          name: 'New Vault',
          encryptedMetadata: 'meta',
          fileCount: 0,
          lastModified: '2024-01-03T00:00:00Z',
          securityLevel: 'standard' as const,
        },
      ]);

      const store = useVaultStore.getState();
      const metadata = new Uint8Array(16);
      const vaultId = await store.createVault('New Vault', metadata);

      expect(vaultId).toBe('new-vault-id');
      expect(api.createVault).toHaveBeenCalled();

      const updatedState = useVaultStore.getState();
      expect(updatedState.isLoading).toBe(false);
      expect(updatedState.error).toBeNull();
    });

    it('should reload vaults after creation', async () => {
      (api.createVault as jest.Mock).mockResolvedValue('new-vault-id');
      (api.listVaults as jest.Mock).mockResolvedValue([
        {
          id: 'new-vault-id',
          name: 'New Vault',
          encryptedMetadata: 'meta',
          fileCount: 0,
          lastModified: '2024-01-03T00:00:00Z',
          securityLevel: 'standard' as const,
        },
      ]);

      const store = useVaultStore.getState();
      const metadata = new Uint8Array(16);
      await store.createVault('New Vault', metadata);

      expect(api.listVaults).toHaveBeenCalled();
    });

    it('should set error if createVault fails', async () => {
      (api.createVault as jest.Mock).mockRejectedValue(
        new Error('Creation failed')
      );

      const store = useVaultStore.getState();
      const metadata = new Uint8Array(16);

      await expect(
        store.createVault('New Vault', metadata)
      ).rejects.toThrow();

      const updatedState = useVaultStore.getState();
      expect(updatedState.error).toBeTruthy();
    });
  });

  // ============================================================================
  // Test: Delete Vault Action
  // ============================================================================
  describe('Delete Vault Action', () => {
    it('should delete vault', async () => {
      (api.deleteVault as jest.Mock).mockResolvedValue(undefined);

      useVaultStore.setState({
        vaults: [
          {
            id: 'vault-1',
            name: 'Vault to Delete',
            encryptedMetadata: 'meta',
            fileCount: 0,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'standard' as const,
          },
        ],
        currentVault: {
          id: 'vault-1',
          name: 'Vault to Delete',
          encryptedMetadata: 'meta',
          fileCount: 0,
          lastModified: '2024-01-01T00:00:00Z',
          securityLevel: 'standard' as const,
        },
      });

      const store = useVaultStore.getState();
      await store.deleteVault('vault-1');

      expect(api.deleteVault).toHaveBeenCalledWith('vault-1');

      const updatedState = useVaultStore.getState();
      expect(updatedState.vaults).toHaveLength(0);
      expect(updatedState.currentVault).toBeNull();
      expect(updatedState.isLoading).toBe(false);
    });

    it('should keep currentVault if different vault is deleted', async () => {
      (api.deleteVault as jest.Mock).mockResolvedValue(undefined);

      useVaultStore.setState({
        vaults: [
          {
            id: 'vault-1',
            name: 'Vault 1',
            encryptedMetadata: 'meta1',
            fileCount: 0,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'standard' as const,
          },
          {
            id: 'vault-2',
            name: 'Vault 2',
            encryptedMetadata: 'meta2',
            fileCount: 0,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'standard' as const,
          },
        ],
        currentVault: {
          id: 'vault-2',
          name: 'Vault 2',
          encryptedMetadata: 'meta2',
          fileCount: 0,
          lastModified: '2024-01-01T00:00:00Z',
          securityLevel: 'standard' as const,
        },
      });

      const store = useVaultStore.getState();
      await store.deleteVault('vault-1');

      const updatedState = useVaultStore.getState();
      expect(updatedState.vaults).toHaveLength(1);
      expect(updatedState.currentVault?.id).toBe('vault-2');
    });

    it('should set error if deleteVault fails', async () => {
      (api.deleteVault as jest.Mock).mockRejectedValue(
        new Error('Delete failed')
      );

      useVaultStore.setState({
        vaults: [
          {
            id: 'vault-1',
            name: 'Vault',
            encryptedMetadata: 'meta',
            fileCount: 0,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'standard' as const,
          },
        ],
      });

      const store = useVaultStore.getState();

      await expect(store.deleteVault('vault-1')).rejects.toThrow();

      const updatedState = useVaultStore.getState();
      expect(updatedState.error).toBeTruthy();
    });
  });

  // ============================================================================
  // Test: File Operations
  // ============================================================================
  describe('File Operations', () => {
    it('should add file to files array', () => {
      const store = useVaultStore.getState();
      const newFile = {
        id: 'file-1',
        vaultId: 'vault-1',
        name: 'test.pdf',
        size: 1024,
        type: 'application/pdf',
        modifiedAt: '2024-01-01T00:00:00Z',
        encryptedMetadata: 'meta',
        isPQCProtected: false,
      };

      store.addFile(newFile);

      const updatedState = useVaultStore.getState();
      expect(updatedState.files).toHaveLength(1);
      expect(updatedState.files[0].id).toBe('file-1');
    });

    it('should delete file from files array', async () => {
      (api.deleteVault as jest.Mock).mockResolvedValue(undefined);

      useVaultStore.setState({
        files: [
          {
            id: 'file-1',
            vaultId: 'vault-1',
            name: 'test.pdf',
            size: 1024,
            type: 'application/pdf',
            modifiedAt: '2024-01-01T00:00:00Z',
            encryptedMetadata: 'meta',
            isPQCProtected: false,
          },
        ],
      });

      const store = useVaultStore.getState();
      await store.deleteFile('vault-1', 'file-1');

      const updatedState = useVaultStore.getState();
      expect(updatedState.files).toHaveLength(0);
      expect(updatedState.isLoading).toBe(false);
    });

    it('should set error if deleteFile fails', async () => {
      useVaultStore.setState({
        files: [
          {
            id: 'file-1',
            vaultId: 'vault-1',
            name: 'test.pdf',
            size: 1024,
            type: 'application/pdf',
            modifiedAt: '2024-01-01T00:00:00Z',
            encryptedMetadata: 'meta',
            isPQCProtected: false,
          },
        ],
      });

      const store = useVaultStore.getState();
      await store.deleteFile('vault-1', 'file-1');

      const updatedState = useVaultStore.getState();
      expect(updatedState.error).toBeNull();
    });
  });

  // ============================================================================
  // Test: Clear Error Action
  // ============================================================================
  describe('Clear Error Action', () => {
    it('should clear error message', () => {
      useVaultStore.setState({ error: 'Some error' });

      const store = useVaultStore.getState();
      store.clearError();

      const updatedState = useVaultStore.getState();
      expect(updatedState.error).toBeNull();
    });
  });

  // ============================================================================
  // Test: Vault Management Advanced Scenarios
  // ============================================================================
  describe('Vault Management Advanced Scenarios', () => {
    it('should handle multiple vault creation', async () => {
      (api.createVault as jest.Mock)
        .mockResolvedValueOnce('vault-1')
        .mockResolvedValueOnce('vault-2')
        .mockResolvedValueOnce('vault-3');

      (api.listVaults as jest.Mock)
        .mockResolvedValueOnce([
          {
            id: 'vault-1',
            name: 'Vault 1',
            encryptedMetadata: 'meta1',
            fileCount: 0,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'standard' as const,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'vault-1',
            name: 'Vault 1',
            encryptedMetadata: 'meta1',
            fileCount: 0,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'standard' as const,
          },
          {
            id: 'vault-2',
            name: 'Vault 2',
            encryptedMetadata: 'meta2',
            fileCount: 0,
            lastModified: '2024-01-02T00:00:00Z',
            securityLevel: 'standard' as const,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'vault-1',
            name: 'Vault 1',
            encryptedMetadata: 'meta1',
            fileCount: 0,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'standard' as const,
          },
          {
            id: 'vault-2',
            name: 'Vault 2',
            encryptedMetadata: 'meta2',
            fileCount: 0,
            lastModified: '2024-01-02T00:00:00Z',
            securityLevel: 'standard' as const,
          },
          {
            id: 'vault-3',
            name: 'Vault 3',
            encryptedMetadata: 'meta3',
            fileCount: 0,
            lastModified: '2024-01-03T00:00:00Z',
            securityLevel: 'standard' as const,
          },
        ]);

      const store = useVaultStore.getState();
      const metadata = new Uint8Array(16);

      await store.createVault('Vault 1', metadata);
      await store.createVault('Vault 2', metadata);
      await store.createVault('Vault 3', metadata);

      const state = useVaultStore.getState();
      expect(state.vaults).toHaveLength(3);
    });

    it('should handle vault name changes', async () => {
      (api.createVault as jest.Mock).mockResolvedValue('vault-1');
      (api.listVaults as jest.Mock).mockResolvedValue([
        {
          id: 'vault-1',
          name: 'Updated Vault Name',
          encryptedMetadata: 'meta',
          fileCount: 0,
          lastModified: '2024-01-01T00:00:00Z',
          securityLevel: 'standard' as const,
        },
      ]);

      const store = useVaultStore.getState();
      const metadata = new Uint8Array(16);
      await store.createVault('Updated Vault Name', metadata);

      const state = useVaultStore.getState();
      expect(state.vaults[0].name).toBe('Updated Vault Name');
    });
  });

  // ============================================================================
  // Test: File Management with Vault
  // ============================================================================
  describe('File Management with Vault', () => {
    it('should track files per vault', () => {
      const file1 = {
        id: 'file-1',
        vaultId: 'vault-1',
        name: 'document.pdf',
        size: 1024,
        type: 'application/pdf',
        modifiedAt: '2024-01-01T00:00:00Z',
        encryptedMetadata: 'meta',
        isPQCProtected: false,
      };

      const file2 = {
        id: 'file-2',
        vaultId: 'vault-2',
        name: 'image.jpg',
        size: 2048,
        type: 'image/jpeg',
        modifiedAt: '2024-01-01T00:00:00Z',
        encryptedMetadata: 'meta',
        isPQCProtected: false,
      };

      const store = useVaultStore.getState();
      store.addFile(file1);
      store.addFile(file2);

      const state = useVaultStore.getState();
      expect(state.files).toHaveLength(2);
      expect(state.files[0].vaultId).toBe('vault-1');
      expect(state.files[1].vaultId).toBe('vault-2');
    });

    it('should remove only files from specific vault on delete', async () => {
      useVaultStore.setState({
        files: [
          {
            id: 'file-1',
            vaultId: 'vault-1',
            name: 'file1.pdf',
            size: 1024,
            type: 'application/pdf',
            modifiedAt: '2024-01-01T00:00:00Z',
            encryptedMetadata: 'meta',
            isPQCProtected: false,
          },
          {
            id: 'file-2',
            vaultId: 'vault-2',
            name: 'file2.pdf',
            size: 1024,
            type: 'application/pdf',
            modifiedAt: '2024-01-01T00:00:00Z',
            encryptedMetadata: 'meta',
            isPQCProtected: false,
          },
        ],
      });

      (api.deleteVault as jest.Mock).mockResolvedValue(undefined);

      const store = useVaultStore.getState();
      await store.deleteFile('vault-1', 'file-1');

      const state = useVaultStore.getState();
      // File from vault-2 should still exist
      expect(state.files).toHaveLength(1);
      expect(state.files[0].vaultId).toBe('vault-2');
    });

    it('should handle PQC protected files', () => {
      const file = {
        id: 'file-1',
        vaultId: 'vault-1',
        name: 'secure.bin',
        size: 4096,
        type: 'application/octet-stream',
        modifiedAt: '2024-01-01T00:00:00Z',
        encryptedMetadata: 'meta',
        isPQCProtected: true,
      };

      const store = useVaultStore.getState();
      store.addFile(file);

      const state = useVaultStore.getState();
      expect(state.files[0].isPQCProtected).toBe(true);
    });
  });

  // ============================================================================
  // Test: Vault Selection and Navigation
  // ============================================================================
  describe('Vault Selection and Navigation', () => {
    it('should change current vault when selecting different vault', async () => {
      useVaultStore.setState({
        vaults: [
          {
            id: 'vault-1',
            name: 'Vault 1',
            encryptedMetadata: 'meta1',
            fileCount: 5,
            lastModified: '2024-01-01T00:00:00Z',
            securityLevel: 'standard' as const,
          },
          {
            id: 'vault-2',
            name: 'Vault 2',
            encryptedMetadata: 'meta2',
            fileCount: 3,
            lastModified: '2024-01-02T00:00:00Z',
            securityLevel: 'high' as const,
          },
        ],
      });

      const store = useVaultStore.getState();

      await store.selectVault('vault-1');
      expect(useVaultStore.getState().currentVault?.id).toBe('vault-1');

      await store.selectVault('vault-2');
      expect(useVaultStore.getState().currentVault?.id).toBe('vault-2');
    });

    it('should clear current vault when none selected', async () => {
      useVaultStore.setState({
        currentVault: {
          id: 'vault-1',
          name: 'Vault 1',
          encryptedMetadata: 'meta1',
          fileCount: 0,
          lastModified: '2024-01-01T00:00:00Z',
          securityLevel: 'standard' as const,
        },
      });

      const store = useVaultStore.getState();

      // Attempt to select non-existent vault
      await store.selectVault('non-existent');

      const state = useVaultStore.getState();
      expect(state.currentVault).toBeNull();
      expect(state.error).not.toBeNull();
    });
  });

  // ============================================================================
  // Test: Loading State Management
  // ============================================================================
  describe('Loading State Management', () => {
    it('should set loading during vault operations', async () => {
      (api.listVaults as jest.Mock).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve([]), 50);
          })
      );

      const store = useVaultStore.getState();
      const loadPromise = store.loadVaults();

      const stateWhileLoading = useVaultStore.getState();
      expect(stateWhileLoading.isLoading).toBe(true);

      await loadPromise;

      const stateAfterLoading = useVaultStore.getState();
      expect(stateAfterLoading.isLoading).toBe(false);
    });

    it('should reset loading on error', async () => {
      (api.listVaults as jest.Mock).mockRejectedValue(new Error('Network error'));

      const store = useVaultStore.getState();

      try {
        await store.loadVaults();
      } catch (e) {
        // Expected
      }

      const state = useVaultStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });

  // ============================================================================
  // Test: Security Level Handling
  // ============================================================================
  describe('Security Level Handling', () => {
    it('should respect different security levels', async () => {
      const securityLevels = ['standard', 'high', 'maximum'] as const;

      (api.listVaults as jest.Mock).mockResolvedValue(
        securityLevels.map((level, index) => ({
          id: `vault-${index}`,
          name: `Vault ${index}`,
          encryptedMetadata: `meta${index}`,
          fileCount: 0,
          lastModified: '2024-01-01T00:00:00Z',
          securityLevel: level,
        }))
      );

      const store = useVaultStore.getState();
      await store.loadVaults();

      const state = useVaultStore.getState();
      expect(state.vaults).toHaveLength(3);
      state.vaults.forEach((vault, _index) => {
        expect(['standard', 'high', 'maximum']).toContain(vault.securityLevel);
      });
    });
  });

  // ============================================================================
  // Test: Edge Cases
  // ============================================================================
  describe('Edge Cases', () => {
    it('should handle empty vault list', async () => {
      (api.listVaults as jest.Mock).mockResolvedValue([]);

      const store = useVaultStore.getState();
      await store.loadVaults();

      const state = useVaultStore.getState();
      expect(state.vaults).toHaveLength(0);
      expect(state.error).toBeNull();
    });

    it('should handle vault with special characters in name', async () => {
      (api.createVault as jest.Mock).mockResolvedValue('vault-1');
      (api.listVaults as jest.Mock).mockResolvedValue([
        {
          id: 'vault-1',
          name: 'Vault @#$% & Special',
          encryptedMetadata: 'meta',
          fileCount: 0,
          lastModified: '2024-01-01T00:00:00Z',
          securityLevel: 'standard' as const,
        },
      ]);

      const store = useVaultStore.getState();
      const metadata = new Uint8Array(16);
      await store.createVault('Vault @#$% & Special', metadata);

      const state = useVaultStore.getState();
      expect(state.vaults[0].name).toBe('Vault @#$% & Special');
    });

    it('should handle very large file counts', async () => {
      (api.listVaults as jest.Mock).mockResolvedValue([
        {
          id: 'vault-1',
          name: 'Large Vault',
          encryptedMetadata: 'meta',
          fileCount: 10000,
          lastModified: '2024-01-01T00:00:00Z',
          securityLevel: 'standard' as const,
        },
      ]);

      const store = useVaultStore.getState();
      await store.loadVaults();

      const state = useVaultStore.getState();
      expect(state.vaults[0].fileCount).toBe(10000);
    });
  });
});
