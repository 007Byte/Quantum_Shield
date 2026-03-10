/**
 * PH4-FIX: Device Domain — Consolidated Service
 *
 * Merges deviceManagementService.ts and biometricService.ts
 * into a single domain-bounded module.
 *
 * Sub-systems:
 *  - Device Session Management (trust, revoke, fingerprint)   ← deviceManagementService
 *  - Biometric Authentication (Face ID, Touch ID, RM-001)     ← biometricService
 *
 * @module services/device
 */

// ─────────────────────────────────────────────────────────────
// Section 1: Device Management Service
// Sourced from: deviceManagementService.ts
// ─────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';

// ── Device Types ───────────────────────────────────────────────

export interface DeviceSession {
  id: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'browser';
  os: string;
  browser: string;
  ipAddress: string;
  location: string;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
  isTrusted: boolean;
}

export interface SecuritySummary {
  totalActive: number;
  trustedCount: number;
  suspiciousCount: number;
  lastNewDevice: string | null;
}

// ── Device Management Service ──────────────────────────────────

class DeviceManagementServiceImpl {
  private readonly SESSIONS_STORAGE_KEY = 'usbvault:device_sessions';
  private readonly TRUSTED_DEVICES_KEY = 'usbvault:trusted_devices';

  constructor() {
    this.initializeStorage();
  }

  private initializeStorage(): void {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const sessions = localStorage.getItem(this.SESSIONS_STORAGE_KEY);
        const trusted = localStorage.getItem(this.TRUSTED_DEVICES_KEY);
        if (!sessions) localStorage.setItem(this.SESSIONS_STORAGE_KEY, JSON.stringify([this.generateCurrentSession()]));
        if (!trusted) localStorage.setItem(this.TRUSTED_DEVICES_KEY, JSON.stringify([]));
      }
    } catch (error) {
      console.error('Failed to initialize device management storage:', error);
    }
  }

  private generateCurrentSession(): DeviceSession {
    const now = new Date();
    const fingerprint = this.getDeviceFingerprint();
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const { os, browser, deviceType } = this.parseUserAgent(ua);

    return {
      id: fingerprint,
      deviceName: this.generateDeviceName(deviceType, os),
      deviceType,
      os,
      browser,
      ipAddress: this.generateMockIP(),
      location: this.generateMockLocation(),
      lastActiveAt: now.toISOString(),
      createdAt: now.toISOString(),
      isCurrent: true,
      isTrusted: true,
    };
  }

  private parseUserAgent(ua: string): { os: string; browser: string; deviceType: 'desktop' | 'mobile' | 'tablet' | 'browser' } {
    let os = 'Unknown';
    let browser = 'Unknown';
    let deviceType: 'desktop' | 'mobile' | 'tablet' | 'browser' = 'browser';

    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('X11') || ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('iPhone') || ua.includes('iPod')) { os = 'iOS'; deviceType = 'mobile'; }
    else if (ua.includes('iPad')) { os = 'iPadOS'; deviceType = 'tablet'; }
    else if (ua.includes('Android')) { os = 'Android'; deviceType = ua.includes('Mobile') ? 'mobile' : 'tablet'; }

    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edge')) browser = 'Edge';

    return { os, browser, deviceType };
  }

  private generateDeviceName(deviceType: 'desktop' | 'mobile' | 'tablet' | 'browser', os: string): string {
    const typeNames: Record<string, string[]> = {
      desktop: ['Desktop', 'Workstation', 'PC'],
      mobile: ['Phone', 'Mobile Device', 'Smartphone'],
      tablet: ['Tablet', 'iPad'],
      browser: ['Browser', 'Web'],
    };
    const names = typeNames[deviceType] || ['Device'];
    return `${names[Math.floor(Math.random() * names.length)]} - ${os}`;
  }

  private generateMockIP(): string {
    return [0, 0, 0, 0].map(() => Math.floor(Math.random() * 256)).join('.');
  }

  private generateMockLocation(): string {
    const locations = ['New York, NY', 'San Francisco, CA', 'Seattle, WA', 'Austin, TX', 'Boston, MA', 'Denver, CO', 'Portland, OR'];
    return locations[Math.floor(Math.random() * locations.length)];
  }

  getActiveSessions(): DeviceSession[] {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(this.SESSIONS_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
      }
    } catch (error) {
      console.error('Failed to retrieve active sessions:', error);
    }
    return [];
  }

  getCurrentSession(): DeviceSession {
    const sessions = this.getActiveSessions();
    const current = sessions.find((s) => s.isCurrent);
    if (current) return current;
    const newSession = this.generateCurrentSession();
    this.saveSessions([...sessions.filter((s) => !s.isCurrent), newSession]);
    return newSession;
  }

  async revokeSession(id: string): Promise<void> {
    try {
      this.saveSessions(this.getActiveSessions().filter((s) => s.id !== id));
      auditService.log('REVOKE_SESSION', `session:${id}`, { sessionId: id });
    } catch (error) {
      console.error('Failed to revoke session:', error);
      throw error;
    }
  }

  async revokeAllOtherSessions(): Promise<void> {
    try {
      const current = this.getCurrentSession();
      this.saveSessions([current]);
      auditService.log('REVOKE_ALL_OTHER_SESSIONS', 'sessions', { keptSession: current.id });
    } catch (error) {
      console.error('Failed to revoke all other sessions:', error);
      throw error;
    }
  }

  trustDevice(id: string): void {
    try {
      this.saveSessions(this.getActiveSessions().map((s) => s.id === id ? { ...s, isTrusted: true } : s));
      auditService.log('TRUST_DEVICE', `device:${id}`, { deviceId: id });
    } catch (error) {
      console.error('Failed to trust device:', error);
      throw error;
    }
  }

  untrustDevice(id: string): void {
    try {
      this.saveSessions(this.getActiveSessions().map((s) => s.id === id ? { ...s, isTrusted: false } : s));
      auditService.log('UNTRUST_DEVICE', `device:${id}`, { deviceId: id });
    } catch (error) {
      console.error('Failed to untrust device:', error);
      throw error;
    }
  }

  getTrustedDevices(): DeviceSession[] { return this.getActiveSessions().filter((s) => s.isTrusted); }
  getSessionHistory(): DeviceSession[] { return this.getActiveSessions(); }

  getDeviceFingerprint(): string {
    try {
      if (typeof navigator === 'undefined') return 'unknown-device';
      const components = [
        navigator.userAgent,
        navigator.language,
        new Date().getTimezoneOffset(),
        typeof window !== 'undefined' ? window.innerWidth : 0,
        typeof window !== 'undefined' ? window.innerHeight : 0,
      ];
      const fingerprint = components.join('|').split('').reduce((hash, char) => {
        const shifted = (hash << 5) - hash + char.charCodeAt(0);
        return shifted & shifted;
      }, 0);
      return `device-${Math.abs(fingerprint).toString(16)}`;
    } catch {
      return `device-${Date.now()}`;
    }
  }

  isNewDevice(): boolean {
    const sessions = this.getActiveSessions();
    return !sessions.some((s) => s.id === this.getDeviceFingerprint());
  }

  getSecuritySummary(): SecuritySummary {
    const sessions = this.getActiveSessions();
    const sortedByDate = [...sessions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return {
      totalActive: sessions.length,
      trustedCount: sessions.filter((s) => s.isTrusted).length,
      suspiciousCount: sessions.filter((s) => !s.isTrusted).length,
      lastNewDevice: sortedByDate.find((s) => !s.isTrusted)?.createdAt || null,
    };
  }

  private saveSessions(sessions: DeviceSession[]): void {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem(this.SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
      }
    } catch (error) {
      console.error('Failed to save device sessions:', error);
    }
  }
}

export const deviceManagementService = new DeviceManagementServiceImpl();

// ─────────────────────────────────────────────────────────────
// Section 2: Biometric Authentication Service
// Sourced from: biometricService.ts (SEC-08 / RM-001)
// ─────────────────────────────────────────────────────────────

// RM-001: Import expo-local-authentication for native biometric APIs
const LocalAuthentication = Platform.OS !== 'web'
  ? require('expo-local-authentication')
  : null;

// ── Biometric Types ────────────────────────────────────────────

export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'none';

export interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
  changed: boolean;
  type: BiometricType;
}

export interface BiometricConfig {
  type: BiometricType;
  enrolledCount: number;
  lastEnrolled: string;
  hardwareSupport: boolean;
}

const BIOMETRIC_CONFIG_HASH_KEY = 'usbvault:biometric_config_hash';
const isBiometricWeb = Platform.OS === 'web';

const BIOMETRIC_ERRORS: Record<number, string> = {
  0: 'Biometric authentication successful',
  1: 'User cancelled authentication',
  2: 'Biometric sensor is not available',
  3: 'User must enroll biometric data first',
  4: 'Biometric data is locked due to too many attempts',
  5: 'Biometric sensor detected spoofing or fake data',
  6: 'Biometric data has changed and requires re-enrollment',
  7: 'Network error during biometric authentication',
  8: 'Internal system error',
  9: 'Authentication timeout',
  10: 'Biometric data is outdated or corrupted',
};

async function hashBiometricConfig(config: BiometricConfig): Promise<string> {
  const json = JSON.stringify(config);
  if (!isBiometricWeb || !crypto.subtle) {
    return json.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0).toString(16);
  }
  try {
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return json.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0).toString(16);
  }
}

async function getNativeBiometricConfig(): Promise<BiometricConfig> {
  if (isBiometricWeb || !LocalAuthentication) {
    return { type: 'none', enrolledCount: 0, lastEnrolled: '', hardwareSupport: false };
  }
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let type: BiometricType = 'none';
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) type = 'face';
    else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) type = 'fingerprint';
    else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) type = 'iris';
    return { type, enrolledCount: isEnrolled ? supportedTypes.length : 0, lastEnrolled: isEnrolled ? new Date().toISOString() : '', hardwareSupport: hasHardware };
  } catch {
    return { type: 'fingerprint', enrolledCount: 1, lastEnrolled: new Date().toISOString(), hardwareSupport: true };
  }
}

async function checkNativeBiometricAvailability(): Promise<{ available: boolean; type: BiometricType }> {
  if (isBiometricWeb || !LocalAuthentication) return { available: false, type: 'none' };
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { available: false, type: 'none' };
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return { available: false, type: 'none' };

    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let type: BiometricType = 'fingerprint';
    if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) type = 'face';
    else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) type = 'fingerprint';
    else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) type = 'iris';
    return { available: true, type };
  } catch (err) {
    console.error('[Biometric] Error checking availability:', err);
    return { available: false, type: 'none' };
  }
}

// ── Biometric Service ──────────────────────────────────────────

class BiometricServiceImpl {
  private retryCount = 0;
  private maxRetries = 3;

  async authenticateWithRetry(maxRetries: number = 3): Promise<boolean> {
    this.maxRetries = maxRetries;
    this.retryCount = 0;

    while (this.retryCount < this.maxRetries) {
      try {
        const result = await this.attemptBiometricAuth();
        if (result) {
          auditService.log('system', 'biometric_auth_success', { attempts: this.retryCount + 1 }, 'success').catch(() => {});
          return true;
        }
        this.retryCount++;
        if (this.retryCount < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, this.retryCount - 1) * 1000));
        }
      } catch (err) {
        this.retryCount++;
        if (this.retryCount >= this.maxRetries) {
          auditService.log('system', 'biometric_auth_failed', { error: String(err), attempts: this.retryCount }, 'error').catch(() => {});
          return false;
        }
      }
    }
    return false;
  }

  async checkBiometricChange(): Promise<boolean> {
    try {
      const currentConfig = await getNativeBiometricConfig();
      const currentHash = await hashBiometricConfig(currentConfig);
      if (!isBiometricWeb) return false;

      try {
        const storedHash = localStorage.getItem(BIOMETRIC_CONFIG_HASH_KEY);
        if (!storedHash) { localStorage.setItem(BIOMETRIC_CONFIG_HASH_KEY, currentHash); return false; }
        const changed = storedHash !== currentHash;
        if (changed) auditService.log('system', 'biometric_change_detected', { oldHash: storedHash, newHash: currentHash }, 'warning').catch(() => {});
        return changed;
      } catch { return false; }
    } catch (err) {
      console.error('[Biometric] Error checking for changes:', err);
      return false;
    }
  }

  promptReEnrollment(): string {
    return `Your biometric data has changed and requires re-enrollment for security.
Please follow these steps:
1. Go to Settings > Security > Biometric
2. Select "Re-enroll" to update your biometric data
3. Follow the on-screen prompts to scan your fingerprint or face
4. Your new biometric data will be securely stored

Note: Re-enrollment is required before you can use biometric authentication again.`;
  }

  getBiometricErrorMessage(errorCode: number): string {
    return BIOMETRIC_ERRORS[errorCode] || `Biometric authentication error (code: ${errorCode})`;
  }

  async getBiometricStatus(): Promise<BiometricStatus> {
    try {
      const { available, type } = await checkNativeBiometricAvailability();
      const changed = await this.checkBiometricChange();
      return { available, enrolled: available && type !== 'none', changed, type };
    } catch (err) {
      console.error('[Biometric] Error getting status:', err);
      return { available: false, enrolled: false, changed: false, type: 'none' };
    }
  }

  async completeReEnrollment(): Promise<void> {
    try {
      const config = await getNativeBiometricConfig();
      const newHash = await hashBiometricConfig(config);
      if (isBiometricWeb) localStorage.setItem(BIOMETRIC_CONFIG_HASH_KEY, newHash);
      auditService.log('system', 'biometric_reenrollment_complete', {}, 'success').catch(() => {});
    } catch (err) {
      console.error('[Biometric] Error completing re-enrollment:', err);
    }
  }

  private async attemptBiometricAuth(): Promise<boolean> {
    if (isBiometricWeb || !LocalAuthentication) return false;
    try {
      const changed = await this.checkBiometricChange();
      if (changed) auditService.log('system', 'biometric_change_before_auth', {}, 'warning').catch(() => {});

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to unlock USBVault',
        cancelLabel: 'Use Password',
        disableDeviceFallback: true,
        fallbackLabel: '',
      });

      if (result.success) return true;

      if (result.error === 'user_cancel') auditService.log('system', 'biometric_user_cancelled', {}, 'success').catch(() => {});
      else if (result.error === 'lockout') auditService.log('system', 'biometric_lockout', {}, 'warning').catch(() => {});

      return false;
    } catch (err) {
      console.error('[Biometric] Authentication attempt failed:', err);
      return false;
    }
  }
}

export const biometricService = new BiometricServiceImpl();
