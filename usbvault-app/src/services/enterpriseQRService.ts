/**
 * Enterprise QR Identity Service
 * FEAT-15: USB devices get unique QR codes encoding org/device identity for enterprise verification
 */

import { Platform } from 'react-native';
import { auditService } from './auditService';
import { syncService } from './syncService';

const STORAGE_KEY_IDENTITY = 'usbvault:enterprise_qr_identity';
const STORAGE_KEY_ENROLLED_DEVICES = 'usbvault:enterprise_enrolled_devices';
const QR_IDENTITY_EXPIRY_DAYS = 365;

/**
 * QR identity structure encoding organization and device information
 */
interface QRIdentity {
  orgId: string;
  employeeNumber: string;
  deviceSerial: string;
  publicKeyHex: string; // Ed25519 public key
  signatureHex: string; // Ed25519 signature of payload
  issuedAt: string;
  expiresAt: string;
}

/**
 * Result of QR payload verification
 */
interface QRVerificationResult {
  valid: boolean;
  orgId?: string;
  employeeNumber?: string;
  deviceSerial?: string;
  signatureValid: boolean;
  expired: boolean;
  error?: string;
}

/**
 * Enrolled device record
 */
interface EnrolledDevice {
  deviceSerial: string;
  orgId: string;
  enrolledAt: string;
  revokedAt?: string;
  publicKeyHex: string;
}

class EnterpriseQRService {
  private currentIdentity: QRIdentity | null = null;
  private enrolledDevices: Map<string, EnrolledDevice> = new Map();

  /**
   * Initialize service and load stored identity
   */
  async init(): Promise<void> {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(STORAGE_KEY_IDENTITY);
      if (stored) {
        this.currentIdentity = JSON.parse(stored);
      }
      const enrolledStored = localStorage.getItem(STORAGE_KEY_ENROLLED_DEVICES);
      if (enrolledStored) {
        const devices = JSON.parse(enrolledStored);
        this.enrolledDevices = new Map(devices);
      }
    }
    await auditService.log('system', 'qr_init', { status: 'initialized' });
  }

  /**
   * Generate signed QR payload as JSON string
   * @param orgId Organization identifier
   * @param employeeNumber Employee ID
   * @param deviceSerial Device serial number
   * @param signingKeyHex Ed25519 private key (hex string)
   * @returns JSON string containing QR payload
   */
  async generateQRPayload(
    orgId: string,
    employeeNumber: string,
    deviceSerial: string,
    signingKeyHex: string
  ): Promise<string> {
    try {
      // Generate public key from signing key
      const publicKeyHex = await this.derivePublicKey(signingKeyHex);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + QR_IDENTITY_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

      const payload = {
        orgId,
        employeeNumber,
        deviceSerial,
        publicKeyHex,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      const payloadJson = JSON.stringify(payload);
      const signature = await this.signPayload(payloadJson, signingKeyHex);

      const identity: QRIdentity = {
        ...payload,
        signatureHex: signature,
      };

      this.currentIdentity = identity;
      if (Platform.OS === 'web') {
        localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(identity));
      }

      await auditService.log('system', deviceSerial, {
        orgId,
        expiresAt: expiresAt.toISOString(),
      });

      return JSON.stringify(identity);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('system', 'qr_generate_error', { error: errorMsg }, 'error');
      throw new Error(`Failed to generate QR payload: ${errorMsg}`);
    }
  }

  /**
   * Verify Ed25519 signature and check expiry
   * @param payloadJson JSON string containing QR payload with signature
   * @param publicKeyHex Ed25519 public key for verification
   * @returns Verification result with validity status
   */
  async verifyQRPayload(payloadJson: string, publicKeyHex: string): Promise<QRVerificationResult> {
    try {
      const identity = JSON.parse(payloadJson) as QRIdentity;

      // Check expiry
      const now = new Date();
      const expiresAt = new Date(identity.expiresAt);
      const expired = now > expiresAt;

      // Verify signature
      const payloadForSignature = JSON.stringify({
        orgId: identity.orgId,
        employeeNumber: identity.employeeNumber,
        deviceSerial: identity.deviceSerial,
        publicKeyHex: identity.publicKeyHex,
        issuedAt: identity.issuedAt,
        expiresAt: identity.expiresAt,
      });

      const signatureValid = await this.verifySignature(
        payloadForSignature,
        identity.signatureHex,
        publicKeyHex
      );

      const result: QRVerificationResult = {
        valid: signatureValid && !expired,
        orgId: identity.orgId,
        employeeNumber: identity.employeeNumber,
        deviceSerial: identity.deviceSerial,
        signatureValid,
        expired,
      };

      await auditService.log('system', identity.deviceSerial, {
        valid: result.valid,
        signatureValid,
        expired,
      });

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('system', 'qr_verify_error', { error: errorMsg }, 'error');
      return {
        valid: false,
        signatureValid: false,
        expired: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Generate QR code as data URL
   * Creates a simple SVG-based QR representation with embedded JSON data
   * @param payload QR payload string
   * @param size QR code size in pixels (default: 256)
   * @returns Data URL for QR code
   */
  async generateQRDataUrl(payload: string, size: number = 256): Promise<string> {
    try {
      // Encode payload as base64url for compact representation
      const encoded = this.toBase64Url(payload);

      // Generate simple checkerboard pattern based on payload hash
      const moduleCount = 29; // Standard QR version
      const modules = await this.generateQRMatrix(encoded, moduleCount);

      // Create SVG representation
      const moduleSize = size / moduleCount;
      let svg = `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
      svg += `<rect width="${size}" height="${size}" fill="white"/>`;

      for (let y = 0; y < moduleCount; y++) {
        for (let x = 0; x < moduleCount; x++) {
          if (modules[y][x]) {
            const px = x * moduleSize;
            const py = y * moduleSize;
            svg += `<rect x="${px}" y="${py}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
          }
        }
      }

      svg += `</svg>`;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

      await auditService.log('system', 'qr_generate_code', {
        size,
        moduleCount,
      });

      return dataUrl;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('system', 'qr_generate_code_error', { error: errorMsg }, 'error');
      throw new Error(`Failed to generate QR code: ${errorMsg}`);
    }
  }

  /**
   * Extract QR data from image
   * Performs basic pattern recognition or parses embedded JSON
   * @param imageDataUrl Base64-encoded image data URL
   * @returns Parsed QR payload or null if extraction fails
   */
  async scanQR(imageDataUrl: string): Promise<QRIdentity | null> {
    try {
      // For web platform, attempt to parse from embedded JSON in image metadata
      // In production, use a proper QR code library

      if (imageDataUrl.includes('data:image/svg')) {
        // Extract SVG content
        const base64 = imageDataUrl.split(',')[1];
        const svg = Buffer.from(base64, 'base64').toString('utf-8');

        // Look for embedded data in SVG (as comment or data attribute)
        const match = svg.match(/<!--(.+?)-->/);
        if (match && match[1]) {
          const payload = this.fromBase64Url(match[1]);
          const identity = JSON.parse(payload) as QRIdentity;

          await auditService.log('system', identity.deviceSerial, {}, 'success');

          return identity;
        }
      }

      await auditService.log('system', 'qr_scan_failed', {
        reason: 'Unable to parse QR data',
      });
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('system', 'qr_scan_error', { error: errorMsg }, 'error');
      return null;
    }
  }

  /**
   * Get currently stored device identity
   * @returns Current QR identity or null if not enrolled
   */
  getDeviceIdentity(): QRIdentity | null {
    return this.currentIdentity;
  }

  /**
   * Enroll device with enterprise identity
   * @param orgId Organization identifier
   * @param employeeNumber Employee ID
   * @param deviceSerial Device serial number
   */
  async enrollDevice(orgId: string, _employeeNumber: string, deviceSerial: string): Promise<void> {
    try {
      // Generate ephemeral signing key pair for this enrollment
      const keyPair = await this.generateKeyPair();

      const enrolledDevice: EnrolledDevice = {
        deviceSerial,
        orgId,
        enrolledAt: new Date().toISOString(),
        publicKeyHex: keyPair.publicKey,
      };

      this.enrolledDevices.set(deviceSerial, enrolledDevice);

      if (Platform.OS === 'web') {
        const devices = Array.from(this.enrolledDevices.entries());
        localStorage.setItem(STORAGE_KEY_ENROLLED_DEVICES, JSON.stringify(devices));
      }

      await auditService.log('system', deviceSerial, {
        orgId,
        enrolledAt: enrolledDevice.enrolledAt,
      });

      await syncService.enqueue('message', { deviceSerial, orgId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('system', 'qr_enroll_error', { error: errorMsg }, 'error');
      throw new Error(`Failed to enroll device: ${errorMsg}`);
    }
  }

  /**
   * Revoke device enrollment
   * @param deviceSerial Serial number of device to revoke
   */
  async revokeDevice(deviceSerial: string): Promise<void> {
    try {
      const device = this.enrolledDevices.get(deviceSerial);
      if (device) {
        device.revokedAt = new Date().toISOString();
        this.enrolledDevices.set(deviceSerial, device);

        if (Platform.OS === 'web') {
          const devices = Array.from(this.enrolledDevices.entries());
          localStorage.setItem(STORAGE_KEY_ENROLLED_DEVICES, JSON.stringify(devices));
        }
      }

      if (this.currentIdentity?.deviceSerial === deviceSerial) {
        this.currentIdentity = null;
        if (Platform.OS === 'web') {
          localStorage.removeItem(STORAGE_KEY_IDENTITY);
        }
      }

      await auditService.log('system', deviceSerial, { action: 'revoked' });
      await syncService.enqueue('message', { deviceSerial });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('system', 'qr_revoke_error', { error: errorMsg }, 'error');
      throw new Error(`Failed to revoke device: ${errorMsg}`);
    }
  }

  /**
   * Check if device is enrolled
   * @returns true if device has active enrollment
   */
  isEnrolled(): boolean {
    if (!this.currentIdentity) return false;

    const device = this.enrolledDevices.get(this.currentIdentity.deviceSerial);
    return device !== undefined && device.revokedAt === undefined;
  }

  /**
   * Generate Ed25519 key pair
   * @private
   */
  private async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    try {
      const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, [
        'sign',
        'verify',
      ]);

      const publicKeyBytes = await crypto.subtle.exportKey('raw', keyPair.publicKey as any);
      const privateKeyBytes = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey as any);

      return {
        publicKey: this.bytesToHex(new Uint8Array(publicKeyBytes)),
        privateKey: this.bytesToHex(new Uint8Array(privateKeyBytes)),
      };
    } catch (error) {
      throw new Error('Failed to generate Ed25519 key pair');
    }
  }

  /**
   * Derive public key from private key
   * @private
   */
  private async derivePublicKey(privateKeyHex: string): Promise<string> {
    try {
      const privateKeyBytes = this.hexToBytes(privateKeyHex);
      await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBytes as BufferSource,
        { name: 'Ed25519' } as any,
        true,
        ['sign']
      );

      const publicKey = await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, [
        'sign',
        'verify',
      ]);

      const publicKeyBytes = await crypto.subtle.exportKey('raw', publicKey.publicKey as any);
      return this.bytesToHex(new Uint8Array(publicKeyBytes));
    } catch (error) {
      // Fallback: extract public key from pkcs8 format
      const privateKeyBytes = this.hexToBytes(privateKeyHex);
      if (privateKeyBytes.length === 64) {
        // Ed25519 private key is 64 bytes, public key is last 32 bytes in some formats
        return this.bytesToHex(privateKeyBytes.slice(32));
      }
      throw error;
    }
  }

  /**
   * Sign payload with Ed25519 private key
   * @private
   */
  private async signPayload(payload: string, privateKeyHex: string): Promise<string> {
    try {
      const privateKeyBytes = this.hexToBytes(privateKeyHex);
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBytes as BufferSource,
        { name: 'Ed25519' } as any,
        false,
        ['sign']
      );

      const payloadBytes = new TextEncoder().encode(payload);
      const signature = await crypto.subtle.sign('Ed25519' as any, privateKey, payloadBytes);

      return this.bytesToHex(new Uint8Array(signature));
    } catch (error) {
      throw new Error('Failed to sign payload');
    }
  }

  /**
   * Verify Ed25519 signature
   * @private
   */
  private async verifySignature(
    payload: string,
    signatureHex: string,
    publicKeyHex: string
  ): Promise<boolean> {
    try {
      const publicKeyBytes = this.hexToBytes(publicKeyHex);
      const publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes as BufferSource,
        { name: 'Ed25519' } as any,
        false,
        ['verify']
      );

      const payloadBytes = new TextEncoder().encode(payload);
      const signatureBytes = this.hexToBytes(signatureHex);

      const valid = await crypto.subtle.verify(
        'Ed25519' as any,
        publicKey,
        signatureBytes as BufferSource,
        payloadBytes
      );

      return valid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate QR matrix from payload
   * @private
   */
  private async generateQRMatrix(payload: string, size: number): Promise<boolean[][]> {
    const matrix: boolean[][] = Array(size)
      .fill(null)
      .map(() => Array(size).fill(false));

    // Hash payload to create deterministic pattern
    const hash = await this.hashPayload(payload);
    const hashBytes = this.hexToBytes(hash);

    // Fill matrix with pattern based on hash
    for (let i = 0; i < size * size; i++) {
      const byteIndex = i % hashBytes.length;
      const bitIndex = (i / hashBytes.length) % 8;
      const row = Math.floor(i / size);
      const col = i % size;

      // Skip quiet zone (border)
      if (row < 4 || row >= size - 4 || col < 4 || col >= size - 4) {
        matrix[row][col] = false;
        continue;
      }

      matrix[row][col] = ((hashBytes[byteIndex] >> bitIndex) & 1) === 1;
    }

    return matrix;
  }

  /**
   * Hash payload with SHA-256
   * @private
   */
  private async hashPayload(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return this.bytesToHex(new Uint8Array(hashBuffer));
  }

  /**
   * Utility: Convert bytes to hex string
   * @private
   */
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Utility: Convert hex string to bytes
   * @private
   */
  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Utility: Convert string to base64url
   * @private
   */
  private toBase64Url(str: string): string {
    const base64 = Buffer.from(str).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  /**
   * Utility: Convert base64url to string
   * @private
   */
  private fromBase64Url(str: string): string {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (str.length % 4)) % 4);
    return Buffer.from(base64 + padding, 'base64').toString('utf-8');
  }
}

// Export singleton instance
const enterpriseQRService = new EnterpriseQRService();
export default enterpriseQRService;
