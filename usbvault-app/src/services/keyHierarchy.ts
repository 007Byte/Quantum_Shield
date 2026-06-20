/**
 * @deprecated This file is dead code. The real implementation lives at
 * src/services/crypto/keyHierarchy.ts which is properly wired to the Rust FFI
 * via @/crypto/bridge (generateMEK, deriveKEK, wrapMEK, unwrapMEK, deriveFileKey).
 *
 * All consumers should import from '@/services/crypto/keyHierarchy' directly.
 *
 * See CONSOLIDATION_MANIFEST.md: keyHierarchy.ts → crypto/keyHierarchy.ts
 *
 * This file re-exports from the real implementation for backward compatibility.
 */

export {
  createKeyHierarchy,
  unlockKeyHierarchy,
  rotatePassword,
  getFileEncryptionKey,
  migrateToKeyHierarchy,
} from './crypto/keyHierarchy';

export type {
  KeyHierarchyCreationResult,
  KeyHierarchyUnlockResult,
  KeyRotationResult,
} from './crypto/keyHierarchy';
