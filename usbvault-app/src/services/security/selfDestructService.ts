// PH4-FIX: Consolidated into security domain
/**
 * RM-02: Self-Destruct Configuration Service
 *
 * Manages vault self-destruct policies with configurable failure thresholds,
 * email alerts, and full data wipe capabilities. Tracks failed authentication
 * attempts and triggers irreversible vault destruction when thresholds are exceeded.
 *
 * @module services/selfDestructService
 */

import { Platform } from 'react-native';
import { auditService } from './auditService';
import { generateSecureId } from '@/utils/generateId';

// PH4-FIX: Type definitions for RTCPeerConnection web API
interface RTCPeerConnectionOptions {
  iceServers?: Array<{ urls: string[] }>;
}

interface RTCPeerConnection {
  new(options?: RTCPeerConnectionOptions): RTCPeerConnection;
}

// PH4-FIX: Extended window interface for web APIs
interface ExtendedWindow extends Window {
  RTCPeerConnection?: RTCPeerConnection;
  webkitRTCPeerConnection?: RTCPeerConnection;
}

// ── Types ──────────────────────────────────────────────────────

export interface SelfDestructConfig {
  failThreshold: number; // 3-10
  emailAlertEnabled: boolean;
  alertEmail: string;
  currentFailCount: number;
  isArmed: boolean;
  lastTriggeredAt?: string; // ISO 8601
}

export interface FailedAttempt {
  id: string;
  timestamp: string; // ISO 8601
  ipAddress?: string;
  userAgent?: string;
}

export interface PendingAlert {
  id: string;
  reason: string;
  timestamp: string; // ISO 8601
  sent: boolean;
}

// ── Constants ──────────────────────────────────────────────────

const CONFIG_STORAGE_KEY = 'qav:self_destruct_config';
const FAIL_ATTEMPTS_STORAGE_KEY = 'qav:fail_attempts';
const PENDING_ALERTS_STORAGE_KEY = 'qav:self_destruct_pending_alerts';

const DEFAULT_CONFIG: SelfDestructConfig = {
  failThreshold: 5,
  emailAlertEnabled: false,
  alertEmail: '',
  currentFailCount: 0,
  isArmed: false,
};

const MAX_FAIL_HISTORY = 20;
const isWeb = Platform.OS === 'web';

// ── Helpers ────────────────────────────────────────────────────

// PL-032: generateSecureId moved to @/utils/generateId

/**
 * Read config from storage.
 */
function readConfig(): SelfDestructConfig {
  if (!isWeb) return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Write config to storage.
 */
function writeConfig(config: SelfDestructConfig): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Read failed attempts from storage.
 */
function readFailAttempts(): FailedAttempt[] {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(FAIL_ATTEMPTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Write failed attempts to storage (keep only recent).
 */
function writeFailAttempts(attempts: FailedAttempt[]): void {
  if (!isWeb) return;
  try {
    const trimmed = attempts.slice(-MAX_FAIL_HISTORY);
    localStorage.setItem(FAIL_ATTEMPTS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Read pending alerts from storage.
 */
function readPendingAlerts(): PendingAlert[] {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(PENDING_ALERTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Write pending alerts to storage.
 */
function writePendingAlerts(alerts: PendingAlert[]): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(PENDING_ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Get client IP address (from navigator if available).
 * PH4-FIX: Properly typed RTCPeerConnection access with ExtendedWindow
 */
function getClientIP(): string | undefined {
  if (!isWeb) return undefined;
  try {
    const extWindow = window as ExtendedWindow;
    const RTCConstructor = extWindow.RTCPeerConnection || extWindow.webkitRTCPeerConnection;
    if (!RTCConstructor) return undefined;
    const rtc = new RTCConstructor({ iceServers: [] });
    return undefined; // Simplified: would require async callback
  } catch {
    return undefined;
  }
}

// ── Service ────────────────────────────────────────────────────

class SelfDestructServiceImpl {
  /**
   * Get current self-destruct configuration.
   */
  getConfig(): SelfDestructConfig {
    return readConfig();
  }

  /**
   * Update self-destruct configuration.
   *
   * @param config - Partial config to merge
   */
  updateConfig(config: Partial<SelfDestructConfig>): void {
    const current = readConfig();
    const updated: SelfDestructConfig = { ...current, ...config };

    // Validate threshold range
    if (updated.failThreshold < 3) updated.failThreshold = 3;
    if (updated.failThreshold > 10) updated.failThreshold = 10;

    writeConfig(updated);
    auditService.log('policy_update', 'self_destruct_config', { changes: config }, 'success');
  }

  /**
   * Record a failed authentication attempt.
   * Returns true if the threshold has been reached.
   */
  recordFailedAttempt(): boolean {
    const config = readConfig();
    const attempts = readFailAttempts();

    const newAttempt: FailedAttempt = {
      id: generateSecureId('attempt'),
      timestamp: new Date().toISOString(),
      ipAddress: getClientIP(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    attempts.push(newAttempt);
    writeFailAttempts(attempts);

    config.currentFailCount = attempts.length;
    writeConfig(config);

    auditService.log('failed_login', 'vault', { attemptCount: config.currentFailCount }, 'warning');

    const thresholdReached = config.currentFailCount >= config.failThreshold && config.isArmed;
    if (thresholdReached) {
      this.triggerSelfDestruct();
    }

    return thresholdReached;
  }

  /**
   * Reset fail count after successful authentication.
   */
  resetFailCount(): void {
    const config = readConfig();
    config.currentFailCount = 0;
    writeConfig(config);

    // Clear stored attempts
    writeFailAttempts([]);

    auditService.log('system', 'self_destruct', { action: 'fail_count_reset' }, 'success');
  }

  /**
   * Trigger vault self-destruct: wipe all vault data.
   */
  triggerSelfDestruct(): void {
    if (!isWeb) return;

    try {
      // Enumerate all keys and remove vault-related data
      const keys = Object.keys(localStorage);
      const vaultKeys = keys.filter((k) => k.startsWith('qav:'));

      for (const key of vaultKeys) {
        localStorage.removeItem(key);
      }

      const config = readConfig();
      config.lastTriggeredAt = new Date().toISOString();
      writeConfig(config);

      auditService.log('system', 'vault', { action: 'self_destruct_triggered' }, 'success');

      if (config.emailAlertEnabled && config.alertEmail) {
        this.sendAlert('self_destruct_triggered');
      }
    } catch (err) {
      auditService.log('system', 'vault', { action: 'self_destruct_failed', error: String(err) }, 'error');
    }
  }

  /**
   * Get last 20 failed attempts.
   */
  getFailHistory(): FailedAttempt[] {
    return readFailAttempts();
  }

  /**
   * Arm self-destruct feature.
   */
  armSelfDestruct(): void {
    const config = readConfig();
    config.isArmed = true;
    writeConfig(config);
    auditService.log('policy_update', 'self_destruct', { action: 'armed' }, 'success');
  }

  /**
   * Disarm self-destruct feature.
   */
  disarmSelfDestruct(): void {
    const config = readConfig();
    config.isArmed = false;
    writeConfig(config);
    auditService.log('policy_update', 'self_destruct', { action: 'disarmed' }, 'success');
  }

  /**
   * Queue an email alert.
   *
   * @param reason - Alert reason (e.g., 'self_destruct_triggered', 'brute_force_detected')
   */
  sendAlert(reason: string): void {
    const alerts = readPendingAlerts();
    const newAlert: PendingAlert = {
      id: generateSecureId('attempt'),
      reason,
      timestamp: new Date().toISOString(),
      sent: false,
    };

    alerts.push(newAlert);
    writePendingAlerts(alerts);

    auditService.log('system', 'email_alert', { reason, queued: true }, 'success');
  }

  /**
   * Get pending alerts waiting to be sent.
   */
  getPendingAlerts(): PendingAlert[] {
    return readPendingAlerts();
  }

  /**
   * Mark an alert as sent.
   *
   * @param alertId - Alert ID
   */
  markAlertSent(alertId: string): void {
    const alerts = readPendingAlerts();
    const alert = alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.sent = true;
      writePendingAlerts(alerts);
    }
  }
}

// ── Singleton Export ───────────────────────────────────────────

export const selfDestructService = new SelfDestructServiceImpl();
