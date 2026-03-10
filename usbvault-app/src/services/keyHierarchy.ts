/**
 * PH4-FIX: Stub for key hierarchy service.
 * TODO: Wire to server-side key hierarchy on vault creation (Task #3).
 */

export interface KeyHierarchyNode {
  id: string;
  parentId: string | null;
  keyType: 'master' | 'vault' | 'file';
  createdAt: string;
}

class KeyHierarchyServiceStub {
  async deriveVaultKey(_masterKey: Uint8Array, _vaultId: string): Promise<Uint8Array> {
    return new Uint8Array(32);
  }

  async deriveFileKey(_vaultKey: Uint8Array, _fileId: string): Promise<Uint8Array> {
    return new Uint8Array(32);
  }

  async uploadHierarchy(_hierarchy: KeyHierarchyNode[]): Promise<void> {
    // Stub — not yet connected to server
  }
}

export const keyHierarchyService = new KeyHierarchyServiceStub();
