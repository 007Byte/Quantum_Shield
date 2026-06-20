/**
 * @deprecated This file is dead code. The real implementation lives at
 * src/services/crypto/index.ts which is properly wired to the Rust FFI
 * via @/crypto/bridge (encryptVaultIndex / decryptVaultIndex).
 *
 * All consumers (vaultStore, vaultIndexSync, vaultListStore) import from
 * '@/services/crypto' which resolves to the real implementation.
 *
 * See CONSOLIDATION_MANIFEST.md: indexCrypto.ts → crypto/index.ts
 *
 * This file is kept temporarily for backward compatibility but should be
 * deleted once confirmed no external tooling references it.
 */

// Re-export from the real implementation so any stale import still works
export { encryptFileIndex, decryptFileIndex, isEncryptedIndex } from './crypto/index';
