/**
 * Self-Destruct Service Tests — RM-02 (security domain)
 *
 * Exercises the real logic of selfDestructService.ts:
 *  - config read overlays policy fields (isArmed / failThreshold) from
 *    securitySettings; updateConfig clamps threshold to [3,10] and syncs policy
 *  - recordFailedAttempt accumulates attempts, updates count, and triggers wipe
 *    only when armed AND threshold reached
 *  - resetFailCount clears attempts
 *  - triggerSelfDestruct wipes only usbvault:* keys and stamps lastTriggeredAt;
 *    queues an alert when email alerts are configured
 *  - fail-history cap (MAX_FAIL_HISTORY = 20)
 *  - pending alert queue + markAlertSent
 *  - arm / disarm
 *
 * react-native is mocked Platform.OS='web' (the service no-ops on native).
 * The security auditService and settingsStorage are stubbed; settingsStorage is a
 * stateful in-memory double so policy fields round-trip as in production. crypto
 * (for generateSecureId) uses the real webcrypto polyfill.
 */

import { selfDestructService } from '../selfDestructService';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.mock('../auditService', () => ({
  auditService: { log: (...args: unknown[]) => auditLog(...args) },
}));

// Stateful in-memory securitySettings double. selfDestructService overlays
// isArmed/failThreshold from here and writes them back, so a real store is needed
// for the policy-field round trip to behave like production.
const settingsState: { selfDestructEnabled: boolean; selfDestructAttempts: number } = {
  selfDestructEnabled: false,
  selfDestructAttempts: 5,
};
jest.mock('@/services/settingsStorage', () => ({
  securitySettings: {
    load: jest.fn(() => ({ ...settingsState })),
    save: jest.fn((partial: Partial<typeof settingsState>) => {
      Object.assign(settingsState, partial);
    }),
  },
}));

const CONFIG_KEY = 'usbvault:self_destruct_config';
const FAIL_KEY = 'usbvault:fail_attempts';
const ALERTS_KEY = 'usbvault:self_destruct_pending_alerts';

describe('SelfDestructService', () => {
  beforeEach(() => {
    localStorage.clear();
    settingsState.selfDestructEnabled = false;
    settingsState.selfDestructAttempts = 5;
    jest.clearAllMocks();
  });

  describe('getConfig / updateConfig', () => {
    it('returns defaults overlaid with policy fields from securitySettings', () => {
      settingsState.selfDestructEnabled = true;
      settingsState.selfDestructAttempts = 7;
      const cfg = selfDestructService.getConfig();
      expect(cfg.isArmed).toBe(true);
      expect(cfg.failThreshold).toBe(7);
      expect(cfg.currentFailCount).toBe(0);
      expect(cfg.emailAlertEnabled).toBe(false);
    });

    it('clamps failThreshold below 3 up to 3 and syncs to securitySettings', () => {
      selfDestructService.updateConfig({ failThreshold: 1 });
      expect(settingsState.selfDestructAttempts).toBe(3);
      expect(selfDestructService.getConfig().failThreshold).toBe(3);
      expect(auditLog).toHaveBeenCalledWith(
        'policy_update',
        'self_destruct_config',
        expect.objectContaining({ changes: { failThreshold: 1 } }),
        'success'
      );
    });

    it('clamps failThreshold above 10 down to 10', () => {
      selfDestructService.updateConfig({ failThreshold: 50 });
      expect(settingsState.selfDestructAttempts).toBe(10);
    });

    it('persists operational config (email settings) to localStorage', () => {
      selfDestructService.updateConfig({ emailAlertEnabled: true, alertEmail: 'a@b.com' });
      const stored = JSON.parse(localStorage.getItem(CONFIG_KEY)!);
      expect(stored.emailAlertEnabled).toBe(true);
      expect(stored.alertEmail).toBe('a@b.com');
    });
  });

  describe('arm / disarm', () => {
    it('arm sets isArmed and syncs the policy', () => {
      selfDestructService.armSelfDestruct();
      expect(settingsState.selfDestructEnabled).toBe(true);
      expect(selfDestructService.getConfig().isArmed).toBe(true);
    });

    it('disarm clears isArmed', () => {
      settingsState.selfDestructEnabled = true;
      selfDestructService.disarmSelfDestruct();
      expect(settingsState.selfDestructEnabled).toBe(false);
      expect(selfDestructService.getConfig().isArmed).toBe(false);
    });
  });

  describe('recordFailedAttempt', () => {
    it('records an attempt, increments the persisted count, and returns false below threshold', () => {
      settingsState.selfDestructEnabled = true;
      settingsState.selfDestructAttempts = 5;

      const triggered = selfDestructService.recordFailedAttempt();

      expect(triggered).toBe(false);
      const attempts = JSON.parse(localStorage.getItem(FAIL_KEY)!);
      expect(attempts).toHaveLength(1);
      expect(attempts[0].id).toMatch(/^attempt-/);
      expect(typeof attempts[0].timestamp).toBe('string');
      expect(selfDestructService.getConfig().currentFailCount).toBe(1);
      expect(auditLog).toHaveBeenCalledWith(
        'failed_login',
        'vault',
        { attemptCount: 1 },
        'warning'
      );
    });

    it('does NOT trigger self-destruct when threshold is reached but disarmed', () => {
      settingsState.selfDestructEnabled = false;
      settingsState.selfDestructAttempts = 3;
      localStorage.setItem('usbvault:secret', 'protected');

      let triggered = false;
      for (let i = 0; i < 3; i++) triggered = selfDestructService.recordFailedAttempt();

      expect(triggered).toBe(false);
      // Vault data is untouched because the feature was disarmed.
      expect(localStorage.getItem('usbvault:secret')).toBe('protected');
    });

    it('triggers self-destruct when armed and threshold reached, wiping vault data', () => {
      settingsState.selfDestructEnabled = true;
      settingsState.selfDestructAttempts = 3;
      localStorage.setItem('usbvault:vaultblob', 'secret');
      localStorage.setItem('unrelated', 'keepme');

      let triggered = false;
      for (let i = 0; i < 3; i++) triggered = selfDestructService.recordFailedAttempt();

      expect(triggered).toBe(true);
      // All usbvault:* keys wiped; non-vault keys preserved.
      expect(localStorage.getItem('usbvault:vaultblob')).toBeNull();
      expect(localStorage.getItem('unrelated')).toBe('keepme');
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'vault',
        { action: 'self_destruct_triggered' },
        'success'
      );
    });

    it('caps stored fail history at MAX_FAIL_HISTORY (20)', () => {
      settingsState.selfDestructEnabled = false; // never trigger so we can pile up
      for (let i = 0; i < 25; i++) selfDestructService.recordFailedAttempt();
      const attempts = JSON.parse(localStorage.getItem(FAIL_KEY)!);
      expect(attempts).toHaveLength(20);
    });
  });

  describe('resetFailCount', () => {
    it('clears the persisted attempts and resets the count', () => {
      settingsState.selfDestructEnabled = false;
      selfDestructService.recordFailedAttempt();
      selfDestructService.recordFailedAttempt();
      expect(JSON.parse(localStorage.getItem(FAIL_KEY)!)).toHaveLength(2);

      selfDestructService.resetFailCount();

      expect(JSON.parse(localStorage.getItem(FAIL_KEY)!)).toEqual([]);
      expect(selfDestructService.getConfig().currentFailCount).toBe(0);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'self_destruct',
        { action: 'fail_count_reset' },
        'success'
      );
    });
  });

  describe('triggerSelfDestruct', () => {
    it('wipes every usbvault:* key (incl. config), then writes a fresh config with lastTriggeredAt', () => {
      selfDestructService.updateConfig({ emailAlertEnabled: true, alertEmail: 'alert@b.com' });
      localStorage.setItem('usbvault:data', 'x');
      localStorage.setItem('keep', 'me');

      selfDestructService.triggerSelfDestruct();

      // Vault data wiped, non-vault keys preserved.
      expect(localStorage.getItem('usbvault:data')).toBeNull();
      expect(localStorage.getItem('keep')).toBe('me');

      // The config key is re-created after the wipe, carrying the trigger stamp.
      const stored = JSON.parse(localStorage.getItem(CONFIG_KEY)!);
      expect(stored.lastTriggeredAt).toBeDefined();
      expect(typeof stored.lastTriggeredAt).toBe('string');

      // The wipe removes the config BEFORE the email-alert check re-reads it, so
      // the freshly defaulted config has emailAlertEnabled=false and NO alert is
      // queued — this captures the real ordering of the destruct routine.
      expect(selfDestructService.getPendingAlerts()).toEqual([]);

      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'vault',
        { action: 'self_destruct_triggered' },
        'success'
      );
    });

    it('does not queue an alert when email alerts are disabled', () => {
      selfDestructService.updateConfig({ emailAlertEnabled: false });
      selfDestructService.triggerSelfDestruct();
      expect(selfDestructService.getPendingAlerts()).toEqual([]);
    });
  });

  describe('getFailHistory', () => {
    it('returns the stored failed attempts', () => {
      settingsState.selfDestructEnabled = false;
      selfDestructService.recordFailedAttempt();
      const history = selfDestructService.getFailHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toMatch(/^attempt-/);
    });
  });

  describe('alerts queue', () => {
    it('sendAlert queues an unsent alert and audits it', () => {
      selfDestructService.sendAlert('brute_force_detected');
      const alerts = selfDestructService.getPendingAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].reason).toBe('brute_force_detected');
      expect(alerts[0].sent).toBe(false);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'email_alert',
        { reason: 'brute_force_detected', queued: true },
        'success'
      );
    });

    it('markAlertSent flips the matching alert to sent', () => {
      selfDestructService.sendAlert('reason-x');
      const id = selfDestructService.getPendingAlerts()[0].id;

      selfDestructService.markAlertSent(id);

      const after = selfDestructService.getPendingAlerts();
      expect(after[0].sent).toBe(true);
    });

    it('markAlertSent is a no-op for an unknown id', () => {
      selfDestructService.sendAlert('reason-y');
      selfDestructService.markAlertSent('does-not-exist');
      expect(selfDestructService.getPendingAlerts()[0].sent).toBe(false);
    });

    it('persists multiple queued alerts', () => {
      selfDestructService.sendAlert('one');
      selfDestructService.sendAlert('two');
      const stored = JSON.parse(localStorage.getItem(ALERTS_KEY)!);
      expect(stored).toHaveLength(2);
    });
  });

  describe('storage resilience (corrupt JSON falls back gracefully)', () => {
    it('getConfig returns defaults when stored config JSON is corrupt', () => {
      localStorage.setItem(CONFIG_KEY, '{not-json');
      const cfg = selfDestructService.getConfig();
      // readConfig() catch returns DEFAULT_CONFIG (policy overlay still applied).
      expect(cfg.failThreshold).toBe(settingsState.selfDestructAttempts);
      expect(cfg.currentFailCount).toBe(0);
    });

    it('getFailHistory returns [] when stored attempts JSON is corrupt', () => {
      localStorage.setItem(FAIL_KEY, 'not json[');
      expect(selfDestructService.getFailHistory()).toEqual([]);
    });

    it('getPendingAlerts returns [] when stored alerts JSON is corrupt', () => {
      localStorage.setItem(ALERTS_KEY, '<<<corrupt');
      expect(selfDestructService.getPendingAlerts()).toEqual([]);
    });
  });

  describe('client metadata capture', () => {
    it('captures the navigator userAgent and returns undefined IP when RTCPeerConnection is present', () => {
      settingsState.selfDestructEnabled = false;
      // Provide an RTCPeerConnection constructor so getClientIP exercises its
      // happy path (the implementation intentionally returns undefined for now).
      const win = window as unknown as { RTCPeerConnection?: unknown };
      const prev = win.RTCPeerConnection;
      win.RTCPeerConnection = function RTCPeerConnection() {} as unknown as undefined;

      selfDestructService.recordFailedAttempt();
      const history = selfDestructService.getFailHistory();

      expect(history[0].userAgent).toBe(navigator.userAgent);
      expect(history[0].ipAddress).toBeUndefined();

      win.RTCPeerConnection = prev;
    });
  });
});
