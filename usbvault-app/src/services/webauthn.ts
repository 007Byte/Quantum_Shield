/**
 * WebAuthn / FIDO2 helpers — thin wrapper around fido2Service for login & settings screens.
 *
 * Provides simplified functions that the login and settings UI can call
 * without needing to know about the full fido2Service internals.
 */

import { Platform } from 'react-native';
import { fido2Service } from './fido2Service';
import { logger } from '@/utils/logger';

// ── Types ──────────────────────────────────────────────────────

export interface Fido2CredentialInfo {
  id: string;
  name: string;
  registeredAt: string;
  lastUsedAt?: string;
  // Snake-case aliases for JSX compatibility
  created_at?: string;
  last_used_at?: string;
}

export interface Fido2RegisterResult extends Fido2CredentialInfo {
  success: boolean;
  credentialId: string;
}

export interface Fido2AuthResult {
  accessToken: string;
  refreshToken?: string;
  deviceId?: string;
}

// ── Availability ───────────────────────────────────────────────

/** Check if FIDO2/WebAuthn is available in the current environment */
export function isFido2Available(): boolean {
  if (Platform.OS !== 'web') return false;
  return fido2Service.isWebAuthnSupported();
}

// ── Authentication ─────────────────────────────────────────────

/** Authenticate using a registered security key / passkey */
export async function authenticateWithSecurityKey(_email: string): Promise<Fido2AuthResult> {
  const result = await fido2Service.authenticate();
  if (!result) {
    throw new Error('FIDO2 authentication was cancelled or failed');
  }
  logger.log('[WebAuthn] Authenticated with device:', result.name);
  return {
    accessToken: 'fido2-session',
    deviceId: result.id,
  };
}

// ── Registration ───────────────────────────────────────────────

/** Register a new security key / passkey */
export async function registerSecurityKey(name: string): Promise<Fido2RegisterResult> {
  const device = await fido2Service.registerDevice(name);
  return {
    success: true,
    credentialId: device.id,
    id: device.id,
    name: device.name,
    registeredAt: device.registeredAt,
    lastUsedAt: device.lastUsedAt,
    created_at: device.registeredAt,
    last_used_at: device.lastUsedAt,
  };
}

/** List all registered security keys */
export function listSecurityKeys(): Fido2CredentialInfo[] {
  return fido2Service.listDevices().map(d => ({
    id: d.id,
    name: d.name,
    registeredAt: d.registeredAt,
    lastUsedAt: d.lastUsedAt,
    created_at: d.registeredAt,
    last_used_at: d.lastUsedAt,
  }));
}

/** Remove a registered security key by ID */
export async function removeSecurityKey(deviceId: string): Promise<void> {
  await fido2Service.removeDevice(deviceId);
}

// ── Error helpers ──────────────────────────────────────────────

/** Extract a user-friendly error message from a FIDO2 error */
export function getFido2ErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === 'NotAllowedError') {
      return 'Security key authentication was cancelled.';
    }
    if (err.name === 'SecurityError') {
      return 'Security key could not be used on this origin.';
    }
    return err.message;
  }
  return 'An unknown FIDO2 error occurred.';
}
