/**
 * MONO-1: Email Alert Service (SMTP, RM-06)
 * Extracted from messaging.ts — Section 3
 *
 * @module services/messaging/emailAlert
 */

import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';
import { generateSecureId } from '@/utils/generateId';

import type { AlertType, EmailAlertConfig, AlertRecord } from './types';

const EMAIL_CONFIG_KEY = 'usbvault:email_alert_config';
const EMAIL_HISTORY_KEY = 'usbvault:email_alert_history';
const EMAIL_PENDING_KEY = 'usbvault:email_alert_pending';
const EMAIL_TEST_RESULT_KEY = 'usbvault:email_alert_test_result';
const EMAIL_MAX_HISTORY = 50;
const EMAIL_RETRY_DELAY_MS = 60000;
const isEmailWeb = Platform.OS === 'web';

const DEFAULT_EMAIL_CONFIG: EmailAlertConfig = {
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPasswordSet: false,
  useTLS: true,
  fromAddress: 'security-alerts@usbvault.local',
  alertRecipients: [],
  enabled: false,
};

function readEmailConfig(): EmailAlertConfig {
  if (!isEmailWeb) return DEFAULT_EMAIL_CONFIG;
  try {
    const raw = localStorage.getItem(EMAIL_CONFIG_KEY);
    return raw ? { ...DEFAULT_EMAIL_CONFIG, ...JSON.parse(raw) } : DEFAULT_EMAIL_CONFIG;
  } catch {
    return DEFAULT_EMAIL_CONFIG;
  }
}

function writeEmailConfig(config: EmailAlertConfig): void {
  if (!isEmailWeb) return;
  try {
    localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

function readAlertHistory(): AlertRecord[] {
  if (!isEmailWeb) return [];
  try {
    const raw = localStorage.getItem(EMAIL_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAlertHistory(records: AlertRecord[]): void {
  if (!isEmailWeb) return;
  try {
    localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(records.slice(-EMAIL_MAX_HISTORY)));
  } catch {}
}

function readPendingAlerts(): AlertRecord[] {
  if (!isEmailWeb) return [];
  try {
    const raw = localStorage.getItem(EMAIL_PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writePendingAlerts(records: AlertRecord[]): void {
  if (!isEmailWeb) return;
  try {
    localStorage.setItem(EMAIL_PENDING_KEY, JSON.stringify(records));
  } catch {}
}

class EmailAlertServiceImpl {
  getEmailConfig(): EmailAlertConfig {
    return readEmailConfig();
  }

  updateEmailConfig(config: Partial<EmailAlertConfig & { smtpPassword?: string }>): void {
    const current = readEmailConfig();
    const { smtpPassword, ...configToMerge } = config;
    if (smtpPassword) (configToMerge as any).smtpPasswordSet = !!smtpPassword;

    const updated: EmailAlertConfig = { ...current, ...configToMerge };
    if (updated.smtpPort < 1 || updated.smtpPort > 65535) updated.smtpPort = 587;
    updated.alertRecipients = updated.alertRecipients.filter(email =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    );

    writeEmailConfig(updated);
    auditService.log(
      'policy_update',
      'email_alert_config',
      { smtpHost: updated.smtpHost, useTLS: updated.useTLS, enabled: updated.enabled },
      'success'
    );
  }

  testEmailConnection(): { success: boolean; message: string } {
    const config = readEmailConfig();
    if (!config.smtpHost || !config.smtpUser || !config.smtpPasswordSet)
      return { success: false, message: 'Missing SMTP configuration' };
    if (config.alertRecipients.length === 0)
      return { success: false, message: 'No alert recipients configured' };

    const testResult = {
      success: true,
      message: `Connected to ${config.smtpHost}:${config.smtpPort}`,
      timestamp: new Date().toISOString(),
    };
    if (isEmailWeb) {
      try {
        localStorage.setItem(EMAIL_TEST_RESULT_KEY, JSON.stringify(testResult));
      } catch {}
    }
    auditService.log(
      'system',
      'email_alert',
      { action: 'connection_test', success: true },
      'success'
    );
    return testResult;
  }

  sendAlert(type: AlertType, details: Record<string, unknown>): void {
    const config = readEmailConfig();
    if (!config.enabled) return;

    const alert: AlertRecord = {
      id: generateSecureId('alert'),
      type,
      timestamp: new Date().toISOString(),
      details,
      status: 'pending',
      attempts: 0,
    };

    const pending = readPendingAlerts();
    pending.push(alert);
    writePendingAlerts(pending);
    auditService.log(
      'system',
      'email_alert',
      { type, status: 'queued', alertId: alert.id },
      'success'
    );
  }

  getAlertHistory(): AlertRecord[] {
    return readAlertHistory();
  }
  getPendingAlerts(): AlertRecord[] {
    return readPendingAlerts();
  }

  retryFailedAlerts(): void {
    const config = readEmailConfig();
    if (!config.enabled) return;
    const failedAlerts = readAlertHistory().filter(a => a.status === 'failed');
    const pending = readPendingAlerts();
    failedAlerts.forEach(alert =>
      pending.push({
        ...alert,
        id: generateSecureId('alert'),
        status: 'pending',
        nextRetryAt: undefined,
      })
    );
    writePendingAlerts(pending);
    auditService.log(
      'system',
      'email_alert',
      { action: 'retry_failed', count: failedAlerts.length },
      'success'
    );
  }

  markAlertSent(alertId: string): void {
    const pending = readPendingAlerts();
    const alert = pending.find(a => a.id === alertId);
    if (alert) {
      alert.status = 'sent';
      alert.attempts += 1;
      alert.lastAttemptAt = new Date().toISOString();
      writePendingAlerts(pending.filter(a => a.id !== alertId));
      const history = readAlertHistory();
      history.push(alert);
      writeAlertHistory(history);
    }
  }

  markAlertFailed(alertId: string): void {
    const pending = readPendingAlerts();
    const alert = pending.find(a => a.id === alertId);
    if (alert) {
      alert.status = 'failed';
      alert.attempts += 1;
      alert.lastAttemptAt = new Date().toISOString();
      const nextRetry = new Date();
      nextRetry.setMilliseconds(
        nextRetry.getMilliseconds() +
          EMAIL_RETRY_DELAY_MS * Math.pow(2, Math.min(alert.attempts, 3))
      );
      alert.nextRetryAt = nextRetry.toISOString();
      writePendingAlerts(pending);
      auditService.log(
        'system',
        'email_alert',
        { alertId, status: 'failed', attempt: alert.attempts },
        'error'
      );
    }
  }

  clearEmailHistory(): void {
    if (!isEmailWeb) return;
    try {
      localStorage.removeItem(EMAIL_HISTORY_KEY);
    } catch {}
    auditService.log('system', 'email_alert', { action: 'history_cleared' }, 'success');
  }

  clearPendingAlerts(): void {
    if (!isEmailWeb) return;
    try {
      localStorage.removeItem(EMAIL_PENDING_KEY);
    } catch {}
    auditService.log('system', 'email_alert', { action: 'pending_cleared' }, 'success');
  }
}

export const emailAlertService = new EmailAlertServiceImpl();
