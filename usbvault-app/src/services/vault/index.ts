/**
 * PH4-FIX: Vault domain barrel exports
 * Re-exports all vault-related services for centralized access
 *
 * @module services/vault
 */

// Backup and recovery
export * from './backup';
export * from './recovery';
export * from './recoveryPhrase';

// Vault management
export * from './compaction';
export * from './import';
export * from './findMyVault';
