/**
 * storeCleanup — Backwards-compatible re-export of the cleanup registry.
 *
 * The actual implementation now lives in the L0 utils layer
 * (`@/utils/cleanupRegistry`) so that services (L1) can register cleanup
 * callbacks without importing the stores layer (L2), which the architectural
 * layering rules (import/no-restricted-paths) forbid.
 *
 * Existing store-layer imports continue to work via this re-export.
 */

export { registerCleanup, cleanupStoreSubscriptions } from '@/utils/cleanupRegistry';
