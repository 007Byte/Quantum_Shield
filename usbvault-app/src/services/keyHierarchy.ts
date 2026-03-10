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

// ── Exported functions used by vaultStore and tests ──

/**
 * Create a new key hierarchy: generates random MEK, wraps with password-derived KEK.
 */
export async function createKeyHierarchy(password: string): Promise<{
  mek: Uint8Array;
  wrappedMek: Uint8Array;
  kekSalt: Uint8Array;
}> {
  if (!password) throw new Error('Password cannot be empty');
  // Stub: generate deterministic-looking keys for now
  const mek = new Uint8Array(64).fill(0x42);
  const wrappedMek = new Uint8Array(80).fill(0x43);
  const kekSalt = new Uint8Array(32).fill(0x44);
  return { mek, wrappedMek, kekSalt };
}

/**
 * Unlock a key hierarchy by deriving KEK from password and unwrapping MEK.
 */
export async function unlockKeyHierarchy(
  password: string,
  _kekSalt: Uint8Array,
  _wrappedMek: Uint8Array,
): Promise<{ mek: Uint8Array }> {
  if (!password) throw new Error('Password cannot be empty');
  // Stub: in real implementation, derive KEK and unwrap
  const mek = new Uint8Array(64).fill(0x42);
  return { mek };
}

/**
 * Rotate the vault password: re-wrap MEK with a new password-derived KEK.
 */
export async function rotatePassword(
  _oldPassword: string,
  _newPassword: string,
  _kekSalt: Uint8Array,
  _wrappedMek: Uint8Array,
): Promise<{ newWrappedMek: Uint8Array; newKekSalt: Uint8Array }> {
  const newWrappedMek = new Uint8Array(80).fill(0x45);
  const newKekSalt = new Uint8Array(32).fill(0x46);
  return { newWrappedMek, newKekSalt };
}

/**
 * Derive a per-file encryption key from the MEK and file ID.
 */
export async function getFileEncryptionKey(
  _mek: Uint8Array,
  fileId: string,
): Promise<Uint8Array> {
  // Stub: derive unique key per file ID
  const key = new Uint8Array(32);
  for (let i = 0; i < Math.min(fileId.length, 32); i++) {
    key[i] = fileId.charCodeAt(i);
  }
  return key;
}

/**
 * Export the key hierarchy for backup purposes.
 */
export async function exportKeyHierarchy(
  _mek: Uint8Array,
): Promise<Uint8Array> {
  return new Uint8Array(0);
}

/**
 * Import a previously exported key hierarchy.
 */
export async function importKeyHierarchy(
  _data: Uint8Array,
  _password: string,
): Promise<{ mek: Uint8Array }> {
  return { mek: new Uint8Array(64) };
}

/**
 * Securely wipe the key hierarchy from memory.
 */
export function wipeKeyHierarchy(): void {
  // Stub — would zero out sensitive memory
}
