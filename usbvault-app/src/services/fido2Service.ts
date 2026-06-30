/**
 * USBVault FIDO2 / WebAuthn Service
 *
 * Hardware security key registration and authentication using the
 * Web Authentication API (navigator.credentials). Devices are stored
 * in localStorage for persistence.
 *
 * @module services/fido2Service
 */

import { Platform } from 'react-native';
import { auditService } from './auditService';

// ── Types ──────────────────────────────────────────────────────

export interface Fido2Device {
  id: string;
  name: string;
  credentialIdBase64: string;
  publicKeyBase64: string;
  registeredAt: string;
  lastUsedAt?: string;
  transport?: string; // 'usb' | 'ble' | 'nfc' | 'internal'
  device?: string; // device transport identifier
  isPasskey?: boolean;
  prfSupported?: boolean;
  credentialType?: 'cross-platform' | 'platform';
}

// ── Constants ──────────────────────────────────────────────────

const DEVICES_KEY = 'usbvault:fido2_devices';
const RP_ID = 'usbvault.local';
const RP_NAME = 'USBVault';

// ── Helpers ────────────────────────────────────────────────────

function readDevices(): Fido2Device[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(DEVICES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeDevices(devices: Fido2Device[]): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
  } catch {
    // Silent fail
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function generateChallenge(): Uint8Array {
  const challenge = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(challenge);
  } else {
    for (let i = 0; i < 32; i++) {
      challenge[i] = Math.floor(Math.random() * 256);
    }
  }
  return challenge;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const hexByte = bytes[i].toString(16).padStart(2, '0');
    hex += hexByte;
  }
  return hex;
}

function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

// ── Service ────────────────────────────────────────────────────

class Fido2ServiceImpl {
  /**
   * Check if WebAuthn is supported in the current environment.
   */
  isWebAuthnSupported(): boolean {
    if (Platform.OS !== 'web') return false;
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.credentials !== 'undefined'
    );
  }

  /**
   * Register a new FIDO2 security key / platform authenticator.
   */
  async registerDevice(deviceName: string, userId?: string): Promise<Fido2Device> {
    if (!this.isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    const challenge = generateChallenge();
    const userIdBytes = new TextEncoder().encode(userId || 'usbvault-user');

    // Exclude already registered credentials
    const existingDevices = readDevices();
    const excludeCredentials: PublicKeyCredentialDescriptor[] = existingDevices.map(d => ({
      type: 'public-key',
      id: base64ToArrayBuffer(d.credentialIdBase64),
    }));

    const createOptions: CredentialCreationOptions = {
      publicKey: {
        rp: {
          name: RP_NAME,
          id: window.location.hostname || RP_ID,
        },
        user: {
          id: userIdBytes.buffer as ArrayBuffer,
          name: userId || 'usbvault-user',
          displayName: deviceName,
        },
        challenge: challenge.buffer as ArrayBuffer,
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform',
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'direct',
        excludeCredentials,
      },
    };

    const credential = (await navigator.credentials.create(createOptions)) as PublicKeyCredential;
    if (!credential) {
      throw new Error('No credential returned from authenticator');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const transport = response.getTransports?.()[0] || 'unknown';

    const device: Fido2Device = {
      id: `fido2-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: deviceName,
      credentialIdBase64: arrayBufferToBase64(credential.rawId),
      publicKeyBase64: arrayBufferToBase64(response.getPublicKey?.() || response.attestationObject),
      registeredAt: new Date().toISOString(),
      transport,
    };

    const devices = readDevices();
    devices.push(device);
    writeDevices(devices);

    await auditService.log('fido2_register', deviceName, {
      deviceId: device.id,
      transport,
    });

    return device;
  }

  /**
   * Authenticate using a registered FIDO2 device.
   *
   * @param options.userVerification - WebAuthn UV requirement. Defaults to
   *   'preferred' (the 2FA path, already gated by a password). Passwordless
   *   single-factor login passes 'required' so the ceremony fails CLOSED when
   *   the authenticator cannot perform user verification (PIN/biometric),
   *   preventing a possession-only sign-in.
   */
  async authenticate(options?: {
    userVerification?: UserVerificationRequirement;
  }): Promise<Fido2Device | null> {
    if (!this.isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    const devices = readDevices();
    if (devices.length === 0) {
      throw new Error('No FIDO2 devices registered');
    }

    const challenge = generateChallenge();
    const allowCredentials: PublicKeyCredentialDescriptor[] = devices.map(d => ({
      type: 'public-key',
      id: base64ToArrayBuffer(d.credentialIdBase64),
    }));

    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge: challenge.buffer as ArrayBuffer,
        allowCredentials,
        userVerification: options?.userVerification ?? 'preferred',
        timeout: 60000,
        rpId: window.location.hostname || RP_ID,
      },
    };

    const assertion = (await navigator.credentials.get(getOptions)) as PublicKeyCredential;
    if (!assertion) {
      throw new Error('Authentication failed — no assertion returned');
    }

    // Find which device was used
    const usedCredentialBase64 = arrayBufferToBase64(assertion.rawId);
    const usedDevice = devices.find(d => d.credentialIdBase64 === usedCredentialBase64);

    if (usedDevice) {
      // Update lastUsedAt
      usedDevice.lastUsedAt = new Date().toISOString();
      writeDevices(devices);
    }

    return usedDevice || null;
  }

  /**
   * List all registered FIDO2 devices.
   */
  listDevices(): Fido2Device[] {
    return readDevices();
  }

  /**
   * Remove a registered FIDO2 device.
   */
  async removeDevice(deviceId: string): Promise<void> {
    const devices = readDevices();
    const device = devices.find(d => d.id === deviceId);
    if (!device) throw new Error('Device not found');

    const updated = devices.filter(d => d.id !== deviceId);
    writeDevices(updated);

    await auditService.log('fido2_revoke', device.name, { deviceId });
  }

  /**
   * Get the count of registered devices.
   */
  getDeviceCount(): number {
    return readDevices().length;
  }

  /**
   * Check if any passkeys are registered.
   */
  hasPasskeys(): boolean {
    const devices = readDevices();
    return devices.some(d => d.isPasskey === true);
  }

  /**
   * Check if platform authenticator is available (fingerprint, face, etc).
   */
  async isPasskeySupported(): Promise<boolean> {
    if (Platform.OS !== 'web') return false;
    if (!this.isWebAuthnSupported()) return false;

    try {
      const isAvailable =
        await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.();
      return isAvailable || false;
    } catch {
      return false;
    }
  }

  /**
   * Derive a 256-bit key from PRF extension output using HKDF-SHA256.
   *
   * @param prfOutput - PRF extension output (first/second buffer)
   * @returns Hex-encoded 256-bit derived key
   */
  async derivePrfKey(prfOutput: ArrayBuffer): Promise<string> {
    if (!prfOutput || prfOutput.byteLength === 0) {
      throw new Error('Invalid PRF output');
    }

    const salt = stringToArrayBuffer('USBVault-PRF-KeyDerivation');
    const info = stringToArrayBuffer('vault-master-key');

    // Use SubtleCrypto HKDF to derive the key
    try {
      const keyMaterial = await crypto.subtle.importKey('raw', prfOutput, { name: 'HKDF' }, false, [
        'deriveBits',
      ]);

      const derivedBits = await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt,
          info,
        },
        keyMaterial,
        256 // 256-bit key
      );

      return arrayBufferToHex(derivedBits);
    } catch (err) {
      await auditService.log('prf_key_derivation_error', 'PRF derivation failed', {
        error: String(err),
      });
      throw new Error(`PRF key derivation failed: ${err}`);
    }
  }

  /**
   * Register a new passkey (discoverable credential) on a platform authenticator.
   *
   * @param userId - User identifier
   * @param displayName - Display name for the passkey
   * @returns Device object and optional PRF-derived key material
   */
  async registerPasskey(
    userId: string,
    displayName: string
  ): Promise<{ device: Fido2Device; prfKey?: string }> {
    if (!this.isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    const isSupported = await this.isPasskeySupported();
    if (!isSupported) {
      throw new Error('Platform authenticator (passkey) is not supported on this device');
    }

    const challenge = generateChallenge();
    const userIdBytes = new TextEncoder().encode(userId);

    // Exclude already registered credentials
    const existingDevices = readDevices();
    const excludeCredentials: PublicKeyCredentialDescriptor[] = existingDevices.map(d => ({
      type: 'public-key',
      id: base64ToArrayBuffer(d.credentialIdBase64),
    }));

    // Generate salt for PRF extension
    const prfSalt = new Uint8Array(32);
    crypto.getRandomValues(prfSalt);

    const createOptions: CredentialCreationOptions = {
      publicKey: {
        rp: {
          name: RP_NAME,
          id: window.location.hostname || RP_ID,
        },
        user: {
          id: userIdBytes.buffer as ArrayBuffer,
          name: userId,
          displayName: displayName || userId,
        },
        challenge: challenge.buffer as ArrayBuffer,
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'preferred',
          residentKey: 'required',
          requireResidentKey: true,
        },
        timeout: 60000,
        attestation: 'direct',
        excludeCredentials,
        extensions: {
          prf: {
            eval: {
              first: prfSalt.buffer as ArrayBuffer,
            },
          },
        },
      },
    };

    const credential = (await navigator.credentials.create(createOptions)) as PublicKeyCredential;
    if (!credential) {
      throw new Error('No credential returned from authenticator');
    }

    const response = credential.response as AuthenticatorAttestationResponse;
    const transport = response.getTransports?.()[0] || 'internal';

    // Extract PRF result if available
    let prfKey: string | undefined;
    try {
      const prfResult = (credential.getClientExtensionResults?.() as any)?.prf?.results?.first;
      if (prfResult) {
        prfKey = await this.derivePrfKey(prfResult);
      }
    } catch (err) {
      await auditService.log('passkey_prf_extraction_warning', 'PRF not available', {
        error: String(err),
      });
    }

    const device: Fido2Device = {
      id: `passkey-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: displayName || userId,
      credentialIdBase64: arrayBufferToBase64(credential.rawId),
      publicKeyBase64: arrayBufferToBase64(response.getPublicKey?.() || response.attestationObject),
      registeredAt: new Date().toISOString(),
      transport,
      isPasskey: true,
      prfSupported: !!prfKey,
      credentialType: 'platform',
    };

    const devices = readDevices();
    devices.push(device);
    writeDevices(devices);

    await auditService.log('passkey_register', displayName, {
      deviceId: device.id,
      userId,
      prfSupported: !!prfKey,
    });

    return { device, prfKey };
  }

  /**
   * Authenticate using a registered passkey (discoverable credential).
   * Uses empty allowCredentials to trigger passkey picker.
   *
   * @returns Device object and optional PRF-derived key material
   */
  async authenticateWithPasskey(): Promise<{ device: Fido2Device; prfKey?: string } | null> {
    if (!this.isWebAuthnSupported()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    const devices = readDevices();
    const passkeys = devices.filter(d => d.isPasskey === true);
    if (passkeys.length === 0) {
      throw new Error('No passkeys registered');
    }

    const challenge = generateChallenge();

    // Empty allowCredentials triggers passkey picker in browser
    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge: challenge.buffer as ArrayBuffer,
        allowCredentials: [],
        userVerification: 'preferred',
        timeout: 60000,
        rpId: window.location.hostname || RP_ID,
        extensions: {
          prf: {
            eval: {
              first: new Uint8Array(32).buffer as ArrayBuffer,
            },
          },
        },
      },
    };

    const assertion = (await navigator.credentials.get(getOptions)) as PublicKeyCredential;
    if (!assertion) {
      throw new Error('Passkey authentication failed — no assertion returned');
    }

    // Find which device was used
    const usedCredentialBase64 = arrayBufferToBase64(assertion.rawId);
    const usedDevice = devices.find(d => d.credentialIdBase64 === usedCredentialBase64);

    if (!usedDevice) {
      throw new Error('Authenticating credential not found in registered devices');
    }

    // Extract PRF result if available
    let prfKey: string | undefined;
    try {
      const prfResult = (assertion.getClientExtensionResults?.() as any)?.prf?.results?.first;
      if (prfResult) {
        prfKey = await this.derivePrfKey(prfResult);
      }
    } catch (err) {
      await auditService.log(
        'passkey_auth_prf_extraction_warning',
        'PRF not available during auth',
        { error: String(err) }
      );
    }

    // Update lastUsedAt
    usedDevice.lastUsedAt = new Date().toISOString();
    writeDevices(devices);

    await auditService.log('passkey_authenticate', usedDevice.name, {
      deviceId: usedDevice.id,
      prfAvailable: !!prfKey,
    });

    return { device: usedDevice, prfKey };
  }
}

export const fido2Service = new Fido2ServiceImpl();
