/**
 * PL-032: Centralized ID Generation Utility
 *
 * Provides two variants:
 *   - `generateId(prefix)` — fast, suitable for most use cases
 *   - `generateSecureId(prefix)` — uses crypto.getRandomValues() when available
 *
 * Both produce collision-resistant IDs. The secure variant is preferred
 * for audit trails, incident logs, and anything persisted long-term.
 *
 * @module utils/generateId
 */

import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

/**
 * Generate a simple prefixed ID using timestamp + random suffix.
 *
 * Format: `{prefix}-{Date.now()}-{random6}`
 *
 * @param prefix - Short identifier prefix (e.g. 'audit', 'msg', 'share')
 */
export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Generate a cryptographically secure prefixed ID.
 *
 * Uses `crypto.getRandomValues()` on web; falls back to `generateId()` on
 * native or when crypto is unavailable.
 *
 * Format: `{prefix}-{16 hex chars}`  (8 random bytes = 2^64 space)
 *
 * @param prefix - Short identifier prefix (e.g. 'alert', 'incident')
 */
export function generateSecureId(prefix: string): string {
  if (!isWeb || typeof crypto === 'undefined' || !crypto.getRandomValues) {
    return generateId(prefix);
  }
  try {
    const buffer = new Uint8Array(8);
    crypto.getRandomValues(buffer);
    const hex = Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `${prefix}-${hex}`;
  } catch {
    return generateId(prefix);
  }
}
