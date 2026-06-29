/**
 * Email Alert Service Tests — MONO-1 / RM-06
 *
 * Covers config validation/normalization, connection-test gating, alert
 * queueing (enabled gate), retry/backoff, sent/failed transitions, and
 * history capping. Runs as Platform.OS === 'web' so the localStorage-backed
 * persistence paths execute for real.
 */

import { emailAlertService } from '../emailAlert';
import type { EmailAlertConfig } from '../types';

import { auditService } from '@/services/auditService';

// localStorage mock (jsdom's is overridden so we can fully reset between tests).
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Force the web persistence path (module reads Platform.OS at import time).
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock audit service (genuine cross-service boundary).
jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

const CONFIG_KEY = 'usbvault:email_alert_config';
const HISTORY_KEY = 'usbvault:email_alert_history';
const PENDING_KEY = 'usbvault:email_alert_pending';

function seedConfig(partial: Partial<EmailAlertConfig>): void {
  const base: EmailAlertConfig = {
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpUser: 'user@example.com',
    smtpPasswordSet: true,
    useTLS: true,
    fromAddress: 'security-alerts@usbvault.local',
    alertRecipients: ['recipient@example.com'],
    enabled: true,
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...base, ...partial }));
}

describe('EmailAlertService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('getEmailConfig', () => {
    it('returns defaults when nothing is stored', () => {
      const config = emailAlertService.getEmailConfig();
      expect(config.smtpPort).toBe(587);
      expect(config.enabled).toBe(false);
      expect(config.useTLS).toBe(true);
      expect(config.fromAddress).toBe('security-alerts@usbvault.local');
      expect(config.alertRecipients).toEqual([]);
    });

    it('merges stored values over defaults', () => {
      seedConfig({ smtpHost: 'mail.corp.io', enabled: true });
      const config = emailAlertService.getEmailConfig();
      expect(config.smtpHost).toBe('mail.corp.io');
      expect(config.enabled).toBe(true);
      // Untouched fields fall back to defaults/seed.
      expect(config.smtpPort).toBe(587);
    });

    it('falls back to defaults when stored JSON is corrupt', () => {
      localStorage.setItem(CONFIG_KEY, '{not valid json');
      const config = emailAlertService.getEmailConfig();
      expect(config.smtpPort).toBe(587);
      expect(config.enabled).toBe(false);
    });
  });

  describe('updateEmailConfig', () => {
    it('persists merged config and logs a policy_update audit event', () => {
      emailAlertService.updateEmailConfig({ smtpHost: 'mail.corp.io', enabled: true });
      const stored = JSON.parse(localStorage.getItem(CONFIG_KEY)!);
      expect(stored.smtpHost).toBe('mail.corp.io');
      expect(stored.enabled).toBe(true);
      expect(auditService.log).toHaveBeenCalledWith(
        'policy_update',
        'email_alert_config',
        expect.objectContaining({ smtpHost: 'mail.corp.io', enabled: true }),
        'success'
      );
    });

    it('sets smtpPasswordSet=true when a password is supplied (without storing the password)', () => {
      emailAlertService.updateEmailConfig({ smtpPassword: 'hunter2' } as any);
      const stored = JSON.parse(localStorage.getItem(CONFIG_KEY)!);
      expect(stored.smtpPasswordSet).toBe(true);
      expect('smtpPassword' in stored).toBe(false);
    });

    it('does not flip smtpPasswordSet when password is empty string', () => {
      emailAlertService.updateEmailConfig({ smtpPassword: '' } as any);
      const stored = JSON.parse(localStorage.getItem(CONFIG_KEY)!);
      expect(stored.smtpPasswordSet).toBe(false);
    });

    it('clamps an out-of-range smtpPort back to 587', () => {
      emailAlertService.updateEmailConfig({ smtpPort: 70000 });
      expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!).smtpPort).toBe(587);

      emailAlertService.updateEmailConfig({ smtpPort: 0 });
      expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!).smtpPort).toBe(587);
    });

    it('keeps a valid smtpPort untouched', () => {
      emailAlertService.updateEmailConfig({ smtpPort: 2525 });
      expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!).smtpPort).toBe(2525);
    });

    it('filters out malformed recipient addresses', () => {
      emailAlertService.updateEmailConfig({
        alertRecipients: ['good@example.com', 'no-at-sign', 'also@valid.io', 'bad@'],
      });
      const stored = JSON.parse(localStorage.getItem(CONFIG_KEY)!);
      expect(stored.alertRecipients).toEqual(['good@example.com', 'also@valid.io']);
    });
  });

  describe('testEmailConnection', () => {
    it('fails when SMTP host/user/password are missing', () => {
      seedConfig({ smtpHost: '', smtpUser: '', smtpPasswordSet: false });
      const result = emailAlertService.testEmailConnection();
      expect(result.success).toBe(false);
      expect(result.message).toBe('Missing SMTP configuration');
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('fails when no recipients are configured', () => {
      seedConfig({ alertRecipients: [] });
      const result = emailAlertService.testEmailConnection();
      expect(result.success).toBe(false);
      expect(result.message).toBe('No alert recipients configured');
    });

    it('succeeds with a complete config, persists the test result, and audits', () => {
      seedConfig({ smtpHost: 'smtp.corp.io', smtpPort: 465 });
      const result = emailAlertService.testEmailConnection();
      expect(result.success).toBe(true);
      expect(result.message).toBe('Connected to smtp.corp.io:465');
      const persisted = JSON.parse(localStorage.getItem('usbvault:email_alert_test_result')!);
      expect(persisted.success).toBe(true);
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'email_alert',
        { action: 'connection_test', success: true },
        'success'
      );
    });
  });

  describe('sendAlert', () => {
    it('does nothing when alerting is disabled', () => {
      seedConfig({ enabled: false });
      emailAlertService.sendAlert('brute_force', { ip: '10.0.0.1' });
      expect(emailAlertService.getPendingAlerts()).toEqual([]);
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('queues a pending alert with the expected shape when enabled', () => {
      seedConfig({ enabled: true });
      emailAlertService.sendAlert('self_destruct', { reason: 'wrong-pin' });
      const pending = emailAlertService.getPendingAlerts();
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        type: 'self_destruct',
        status: 'pending',
        attempts: 0,
        details: { reason: 'wrong-pin' },
      });
      expect(pending[0].id).toMatch(/^alert-/);
      expect(typeof pending[0].timestamp).toBe('string');
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'email_alert',
        expect.objectContaining({ type: 'self_destruct', status: 'queued' }),
        'success'
      );
    });

    it('appends additional alerts to the existing pending queue', () => {
      seedConfig({ enabled: true });
      emailAlertService.sendAlert('brute_force', {});
      emailAlertService.sendAlert('device_change', {});
      const pending = emailAlertService.getPendingAlerts();
      expect(pending).toHaveLength(2);
      expect(pending.map(a => a.type)).toEqual(['brute_force', 'device_change']);
    });
  });

  describe('markAlertSent', () => {
    it('moves the alert from pending to history and marks it sent', () => {
      seedConfig({ enabled: true });
      emailAlertService.sendAlert('key_rotation', {});
      const id = emailAlertService.getPendingAlerts()[0].id;

      emailAlertService.markAlertSent(id);

      expect(emailAlertService.getPendingAlerts()).toHaveLength(0);
      const history = emailAlertService.getAlertHistory();
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('sent');
      expect(history[0].attempts).toBe(1);
      expect(history[0].lastAttemptAt).toBeDefined();
    });

    it('is a no-op for an unknown alert id', () => {
      seedConfig({ enabled: true });
      emailAlertService.sendAlert('key_rotation', {});
      emailAlertService.markAlertSent('alert-does-not-exist');
      expect(emailAlertService.getPendingAlerts()).toHaveLength(1);
      expect(emailAlertService.getAlertHistory()).toHaveLength(0);
    });
  });

  describe('markAlertFailed', () => {
    it('marks the alert failed, keeps it pending, and schedules a backoff retry', () => {
      seedConfig({ enabled: true });
      emailAlertService.sendAlert('emergency_access', {});
      const id = emailAlertService.getPendingAlerts()[0].id;

      emailAlertService.markAlertFailed(id);

      const pending = emailAlertService.getPendingAlerts();
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('failed');
      expect(pending[0].attempts).toBe(1);
      expect(pending[0].nextRetryAt).toBeDefined();
      // nextRetryAt must be in the future relative to lastAttemptAt.
      expect(new Date(pending[0].nextRetryAt!).getTime()).toBeGreaterThan(
        new Date(pending[0].lastAttemptAt!).getTime()
      );
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'email_alert',
        expect.objectContaining({ alertId: id, status: 'failed', attempt: 1 }),
        'error'
      );
    });

    it('applies exponential backoff so later attempts schedule farther out', () => {
      seedConfig({ enabled: true });
      emailAlertService.sendAlert('emergency_access', {});
      const id = emailAlertService.getPendingAlerts()[0].id;

      emailAlertService.markAlertFailed(id);
      const firstPending = emailAlertService.getPendingAlerts()[0];
      const firstGap =
        new Date(firstPending.nextRetryAt!).getTime() -
        new Date(firstPending.lastAttemptAt!).getTime();

      emailAlertService.markAlertFailed(id);
      const secondPending = emailAlertService.getPendingAlerts()[0];
      const secondGap =
        new Date(secondPending.nextRetryAt!).getTime() -
        new Date(secondPending.lastAttemptAt!).getTime();

      expect(secondPending.attempts).toBe(2);
      expect(secondGap).toBeGreaterThan(firstGap);
    });

    it('is a no-op for an unknown alert id', () => {
      seedConfig({ enabled: true });
      emailAlertService.sendAlert('emergency_access', {});
      emailAlertService.markAlertFailed('nope');
      expect(emailAlertService.getPendingAlerts()[0].status).toBe('pending');
    });
  });

  describe('retryFailedAlerts', () => {
    it('does nothing when alerting is disabled', () => {
      seedConfig({ enabled: false });
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([{ id: 'a1', type: 'brute_force', status: 'failed', attempts: 3 }])
      );
      emailAlertService.retryFailedAlerts();
      expect(emailAlertService.getPendingAlerts()).toEqual([]);
    });

    it('re-queues failed history entries as fresh pending alerts', () => {
      seedConfig({ enabled: true });
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([
          { id: 'a1', type: 'brute_force', status: 'failed', attempts: 3, nextRetryAt: 'x' },
          { id: 'a2', type: 'device_change', status: 'sent', attempts: 1 },
          { id: 'a3', type: 'self_destruct', status: 'failed', attempts: 2 },
        ])
      );

      emailAlertService.retryFailedAlerts();

      const pending = emailAlertService.getPendingAlerts();
      // Only the two 'failed' entries get re-queued.
      expect(pending).toHaveLength(2);
      pending.forEach(a => {
        expect(a.status).toBe('pending');
        expect(a.nextRetryAt).toBeUndefined();
        // New ids generated, not the original a1/a3.
        expect(a.id).toMatch(/^alert-/);
      });
      expect(pending.map(a => a.type).sort()).toEqual(['brute_force', 'self_destruct']);
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'email_alert',
        { action: 'retry_failed', count: 2 },
        'success'
      );
    });
  });

  describe('history persistence + capping', () => {
    it('caps stored history at the most recent 50 entries', () => {
      seedConfig({ enabled: true });
      // Push 55 already-pending alerts through markAlertSent to fill history.
      for (let i = 0; i < 55; i++) {
        emailAlertService.sendAlert('brute_force', { n: i });
        const pending = emailAlertService.getPendingAlerts();
        emailAlertService.markAlertSent(pending[pending.length - 1].id);
      }
      const history = emailAlertService.getAlertHistory();
      expect(history.length).toBe(50);
      // Oldest entries dropped: first retained should be n=5.
      expect(history[0].details).toEqual({ n: 5 });
      expect(history[history.length - 1].details).toEqual({ n: 54 });
    });

    it('returns [] when history JSON is corrupt', () => {
      localStorage.setItem(HISTORY_KEY, 'garbage');
      expect(emailAlertService.getAlertHistory()).toEqual([]);
    });
  });

  describe('clear operations', () => {
    it('clearEmailHistory removes the history key and audits', () => {
      localStorage.setItem(HISTORY_KEY, JSON.stringify([{ id: 'x' }]));
      emailAlertService.clearEmailHistory();
      expect(localStorage.getItem(HISTORY_KEY)).toBeNull();
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'email_alert',
        { action: 'history_cleared' },
        'success'
      );
    });

    it('clearPendingAlerts removes the pending key and audits', () => {
      localStorage.setItem(PENDING_KEY, JSON.stringify([{ id: 'x' }]));
      emailAlertService.clearPendingAlerts();
      expect(localStorage.getItem(PENDING_KEY)).toBeNull();
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'email_alert',
        { action: 'pending_cleared' },
        'success'
      );
    });
  });
});
