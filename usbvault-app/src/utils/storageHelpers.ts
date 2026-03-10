/**
 * PL-031: Shared Storage Helpers
 *
 * Thin wrappers around localStorage / sessionStorage that centralise the
 * repeated Platform check → try/catch → JSON.parse/stringify pattern found
 * in ~50 service files. All helpers are no-ops on native (Platform !== 'web').
 *
 * @module utils/storageHelpers
 */

import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

// ── localStorage helpers ─────────────────────────────────────

/**
 * Read a JSON value from localStorage.
 *
 * @param key       - Storage key
 * @param fallback  - Value returned when the key is missing or unparseable
 */
export function readLocal<T>(key: string, fallback: T): T {
  if (!isWeb) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON value to localStorage.
 *
 * @param key   - Storage key
 * @param value - Value to serialise and store
 */
export function writeLocal<T>(key: string, value: T): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable — silent fail
  }
}

/**
 * Remove a key from localStorage.
 */
export function removeLocal(key: string): void {
  if (!isWeb) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // silent fail
  }
}

// ── sessionStorage helpers ───────────────────────────────────

/**
 * Read a JSON value from sessionStorage.
 *
 * @param key       - Storage key
 * @param fallback  - Value returned when the key is missing or unparseable
 */
export function readSession<T>(key: string, fallback: T): T {
  if (!isWeb) return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a JSON value to sessionStorage.
 *
 * @param key   - Storage key
 * @param value - Value to serialise and store
 */
export function writeSession<T>(key: string, value: T): void {
  if (!isWeb) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silent fail
  }
}

/**
 * Read a raw string from localStorage (no JSON parsing).
 * Useful for simple string values where JSON wrapping is unnecessary.
 */
export function readLocalRaw(key: string, fallback: string | null = null): string | null {
  if (!isWeb) return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write a raw string to localStorage (no JSON serialisation).
 */
export function writeLocalRaw(key: string, value: string): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // silent fail
  }
}
