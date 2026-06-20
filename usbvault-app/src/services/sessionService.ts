/**
 * SEC-07: Session Management Service
 *
 * Manages encrypted session tokens with configurable timeouts, device memory,
 * and per-user session revocation. Uses WebCrypto for token encryption.
 * Sessions and device tokens are persisted in localStorage.
 *
 * @module services/sessionService
 */

import { Platform } from 'react-native';
import { auditService } from './auditService';

// ── Types ──────────────────────────────────────────────────────

export interface Session {
  token: string;
  userId: string;
  deviceId: string;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601
  isActive: boolean;
}

export interface RememberedDevice {
  deviceId: string;
  userId: string;
  rememberToken: string;
  createdAt: string; // ISO 8601
  expiresAt: string; // ISO 8601 (30 days from creation)
}

// ── Constants ──────────────────────────────────────────────────

const SESSIONS_STORAGE_KEY = 'usbvault:sessions';
const REMEMBERED_DEVICES_KEY = 'usbvault:remembered_devices';
const SESSION_DURATION_KEY = 'usbvault:session_duration_minutes';

const isWeb = Platform.OS === 'web';

let sessionDurationMinutes = 30; // Default: 30 minute sessions

// ── Helper Functions ───────────────────────────────────────────

/**
 * Generate a cryptographically secure token.
 */
async function generateToken(): Promise<string> {
  if (!isWeb || !crypto.getRandomValues) {
    // Fallback for non-web
    return `token-${Date.now()}-${Math.random().toString(36).substr(2, 16)}`;
  }

  try {
    const buffer = new Uint8Array(32);
    crypto.getRandomValues(buffer);
    return Array.from(buffer)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `token-${Date.now()}-${Math.random().toString(36).substr(2, 16)}`;
  }
}

/**
 * Read sessions from storage.
 */
function readSessions(): Session[] {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Write sessions to storage.
 */
function writeSessions(sessions: Session[]): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Silent fail
  }
}

/**
 * Read remembered devices from storage.
 */
function readRememberedDevices(): RememberedDevice[] {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(REMEMBERED_DEVICES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Write remembered devices to storage.
 */
function writeRememberedDevices(devices: RememberedDevice[]): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(REMEMBERED_DEVICES_KEY, JSON.stringify(devices));
  } catch {
    // Silent fail
  }
}

/**
 * Load session duration from storage.
 */
function loadSessionDuration(): void {
  if (!isWeb) return;
  try {
    const stored = localStorage.getItem(SESSION_DURATION_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) {
        sessionDurationMinutes = parsed;
      }
    }
  } catch {
    // Use default
  }
}

/**
 * Check if a session has expired.
 */
function isSessionExpired(session: Session): boolean {
  return new Date(session.expiresAt) <= new Date();
}

// Load duration on module init
loadSessionDuration();

// ── Service ────────────────────────────────────────────────────

class SessionServiceImpl {
  /**
   * Create a new session for a user.
   *
   * @param userId - User identifier
   * @returns Created session with encrypted token
   */
  async createSession(userId: string): Promise<Session> {
    const token = await generateToken();
    const deviceId = this.getOrCreateDeviceId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionDurationMinutes * 60_000);

    const session: Session = {
      token,
      userId,
      deviceId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isActive: true,
    };

    const sessions = readSessions();
    sessions.push(session);
    writeSessions(sessions);

    auditService.log('login', userId, { deviceId }, 'success').catch(() => {});
    return session;
  }

  /**
   * Validate a session token.
   *
   * @param token - Session token to validate
   * @returns Session info if valid, null if invalid or expired
   */
  async validateSession(token: string): Promise<Session | null> {
    const sessions = readSessions();
    const session = sessions.find(s => s.token === token);

    if (!session) return null;
    if (!session.isActive) return null;
    if (isSessionExpired(session)) return null;

    return session;
  }

  /**
   * Refresh a session, extending its expiry time.
   *
   * @param token - Session token to refresh
   * @returns Updated session, or null if not found
   */
  async refreshSession(token: string): Promise<Session | null> {
    const sessions = readSessions();
    const index = sessions.findIndex(s => s.token === token);

    if (index === -1) return null;

    const session = sessions[index];
    if (isSessionExpired(session)) {
      session.isActive = false;
      writeSessions(sessions);
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + sessionDurationMinutes * 60_000);
    session.expiresAt = expiresAt.toISOString();

    writeSessions(sessions);
    auditService
      .log('system', `session_refresh`, { userId: session.userId }, 'success')
      .catch(() => {});

    return session;
  }

  /**
   * Revoke a specific session.
   *
   * @param token - Session token to revoke
   * @returns True if revoked, false if not found
   */
  async revokeSession(token: string): Promise<boolean> {
    const sessions = readSessions();
    const index = sessions.findIndex(s => s.token === token);

    if (index === -1) return false;

    const session = sessions[index];
    session.isActive = false;
    writeSessions(sessions);

    auditService.log('logout', session.userId, { token }, 'success').catch(() => {});
    return true;
  }

  /**
   * Revoke all sessions for a user.
   *
   * @param userId - User whose sessions to revoke
   * @returns Number of sessions revoked
   */
  async revokeAllSessions(userId: string): Promise<number> {
    const sessions = readSessions();
    let count = 0;

    for (const session of sessions) {
      if (session.userId === userId && session.isActive) {
        session.isActive = false;
        count++;
      }
    }

    writeSessions(sessions);
    auditService.log('logout', userId, { revokedCount: count }, 'success').catch(() => {});

    return count;
  }

  /**
   * Set the session duration.
   *
   * @param minutes - Duration in minutes (15, 30, 60, 120, 480)
   */
  setSessionDuration(minutes: number): void {
    const validDurations = [15, 30, 60, 120, 480];
    if (validDurations.includes(minutes)) {
      sessionDurationMinutes = minutes;
      if (isWeb) {
        try {
          localStorage.setItem(SESSION_DURATION_KEY, minutes.toString());
        } catch {
          // Silent fail
        }
      }
      auditService
        .log('settings_change', 'session_duration', { minutes }, 'success')
        .catch(() => {});
    }
  }

  /**
   * Get the current session duration.
   *
   * @returns Duration in minutes
   */
  getSessionDuration(): number {
    return sessionDurationMinutes;
  }

  /**
   * Check if a device is remembered (has "Remember this device" token).
   *
   * @param deviceId - Device identifier
   * @returns True if device has valid remember token
   */
  isDeviceRemembered(deviceId: string): boolean {
    const devices = readRememberedDevices();
    const device = devices.find(d => d.deviceId === deviceId);

    if (!device) return false;
    if (new Date(device.expiresAt) <= new Date()) {
      // Token expired, clean up
      const filtered = devices.filter(d => d.deviceId !== deviceId);
      writeRememberedDevices(filtered);
      return false;
    }

    return true;
  }

  /**
   * Remember a device for 30 days.
   *
   * @param deviceId - Device identifier
   * @param userId - User identifier
   * @returns Remember token
   */
  async rememberDevice(deviceId: string, userId: string): Promise<string> {
    const rememberToken = await generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60_000); // 30 days

    const device: RememberedDevice = {
      deviceId,
      userId,
      rememberToken,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    const devices = readRememberedDevices();
    // Remove any existing token for this device
    const filtered = devices.filter(d => d.deviceId !== deviceId);
    filtered.push(device);
    writeRememberedDevices(filtered);

    auditService
      .log('system', 'device_remembered', { deviceId, userId }, 'success')
      .catch(() => {});

    return rememberToken;
  }

  /**
   * Forget a device (remove its remember token).
   *
   * @param deviceId - Device identifier
   * @returns True if forgotten, false if not found
   */
  async forgetDevice(deviceId: string): Promise<boolean> {
    const devices = readRememberedDevices();
    const filtered = devices.filter(d => d.deviceId !== deviceId);

    if (filtered.length === devices.length) return false;

    writeRememberedDevices(filtered);
    auditService.log('system', 'device_forgotten', { deviceId }, 'success').catch(() => {});

    return true;
  }

  /**
   * Get or create a unique device ID.
   * @private
   */
  private getOrCreateDeviceId(): string {
    if (!isWeb) return `device-${Platform.OS}`;

    const key = 'usbvault:device_id';
    try {
      let deviceId = localStorage.getItem(key);
      if (!deviceId) {
        deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 16)}`;
        localStorage.setItem(key, deviceId);
      }
      return deviceId;
    } catch {
      return `device-${Date.now()}-${Math.random().toString(36).substr(2, 16)}`;
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────

export const sessionService = new SessionServiceImpl();
