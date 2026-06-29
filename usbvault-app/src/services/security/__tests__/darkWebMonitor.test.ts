/**
 * Dark Web Monitor Service Tests — PH4-FIX (security domain)
 *
 * Exercises the real logic of darkWebMonitor.ts:
 *  - k-anonymity email check: real SHA-1 hashing, prefix request, suffix matching,
 *    network/error fallbacks
 *  - config persistence + email add/remove normalization + dedupe
 *  - breach history storage + remediation marking
 *  - severity classification from data classes
 *  - monitoring status aggregation (unique breaches, next-check estimate)
 *  - scheduled check lifecycle (timer setup, immediate run, disabled/no-emails)
 *
 * react-native is mocked with Platform.OS='web' to enable the localStorage code
 * paths. `fetch` is stubbed (the only network boundary). auditService and logger
 * are stubbed. Node's real `crypto` performs SHA-1 so hash assertions are genuine.
 */

import crypto from 'crypto';
import { darkWebMonitorService } from '../darkWebMonitor';
import type { BreachRecord } from '../darkWebMonitor';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/auditService', () => ({
  auditService: { log: (...args: unknown[]) => auditLog(...args) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const STORAGE_KEY = 'usbvault:darkweb_monitor';
const BREACH_HISTORY_KEY = 'usbvault:darkweb_history';

function sha1Upper(email: string): string {
  return crypto.createHash('sha1').update(email.toLowerCase()).digest('hex').toUpperCase();
}

function mockFetchOnce(status: number, body: string) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

describe('DarkWebMonitorService', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = jest.fn();
    // Reset the singleton's in-memory config back to defaults each test.
    darkWebMonitorService.updateConfig({
      enabled: false,
      emails: [],
      checkIntervalHours: 24,
      lastCheckAt: null,
      notifications: true,
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    darkWebMonitorService.destroy();
  });

  describe('checkEmail (k-anonymity)', () => {
    it('requests the HIBP range using the first 5 hash chars and matches the suffix', async () => {
      const email = 'victim@example.com';
      const hash = sha1Upper(email);
      const prefix = hash.substring(0, 5);
      const suffix = hash.substring(5);
      // HIBP returns "SUFFIX:count" lines; include our matching suffix + a decoy.
      mockFetchOnce(200, `${suffix}:42\r\nDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEAD:1`);

      const breaches = await darkWebMonitorService.checkEmail(email);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.pwnedpasswords.com/range/${prefix}`,
        expect.objectContaining({ headers: expect.objectContaining({ 'Add-Padding': 'true' }) })
      );
      expect(breaches).toHaveLength(1);
      expect(breaches[0].severity).toBe('high');
      expect(breaches[0].remediated).toBe(false);
      expect(breaches[0].dataClasses).toEqual(['email-address']);
      expect(auditLog).toHaveBeenCalledWith('breach_check', `email:${email}`, {
        breachCount: 1,
        email,
      });
    });

    it('returns an empty array when no suffix matches', async () => {
      mockFetchOnce(200, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\r\nBBBBBB:2');
      const breaches = await darkWebMonitorService.checkEmail('clean@example.com');
      expect(breaches).toEqual([]);
    });

    it('returns an empty array (graceful) on a rate-limit (429) response', async () => {
      mockFetchOnce(429, '');
      const breaches = await darkWebMonitorService.checkEmail('x@example.com');
      expect(breaches).toEqual([]);
    });

    it('returns an empty array when fetch rejects (network failure)', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      const breaches = await darkWebMonitorService.checkEmail('x@example.com');
      expect(breaches).toEqual([]);
    });
  });

  describe('email list management', () => {
    it('normalizes case/whitespace and dedupes on add', () => {
      darkWebMonitorService.addEmail('  USER@Example.COM ');
      darkWebMonitorService.addEmail('user@example.com');
      const cfg = darkWebMonitorService.getConfig();
      expect(cfg.emails).toEqual(['user@example.com']);
      expect(auditLog).toHaveBeenCalledWith('monitor_email_added', 'email:user@example.com', {
        email: 'user@example.com',
      });
    });

    it('removes a normalized email and persists the change', () => {
      darkWebMonitorService.addEmail('a@b.com');
      darkWebMonitorService.removeEmail('  A@B.com ');
      expect(darkWebMonitorService.getConfig().emails).toEqual([]);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.emails).toEqual([]);
    });

    it('does nothing when removing an email that is not present', () => {
      darkWebMonitorService.addEmail('a@b.com');
      jest.clearAllMocks();
      darkWebMonitorService.removeEmail('not@there.com');
      expect(darkWebMonitorService.getConfig().emails).toEqual(['a@b.com']);
      expect(auditLog).not.toHaveBeenCalledWith(
        'monitor_email_removed',
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe('config persistence', () => {
    it('returns a fresh top-level object on each getConfig call', () => {
      const a = darkWebMonitorService.getConfig();
      const b = darkWebMonitorService.getConfig();
      // The service spreads into a new object, so the references differ even
      // though the contents are equal.
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('merges partial updates and audits the change', () => {
      darkWebMonitorService.updateConfig({ checkIntervalHours: 12, enabled: true });
      const cfg = darkWebMonitorService.getConfig();
      expect(cfg.checkIntervalHours).toBe(12);
      expect(cfg.enabled).toBe(true);
      expect(auditLog).toHaveBeenCalledWith(
        'monitor_config_updated',
        'monitor_config',
        expect.objectContaining({ updated: { checkIntervalHours: 12, enabled: true } })
      );
    });

    it('loads persisted config from localStorage on construction', () => {
      const persisted = {
        enabled: true,
        emails: ['persisted@example.com'],
        checkIntervalHours: 6,
        lastCheckAt: 123,
        notifications: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../darkWebMonitor');
        expect(mod.darkWebMonitorService.getConfig()).toEqual(persisted);
      });
    });
  });

  describe('checkAllEmails', () => {
    it('checks each configured email, stamps lastCheckAt, and stores history', async () => {
      const email = 'multi@example.com';
      darkWebMonitorService.addEmail(email);
      const hash = sha1Upper(email);
      mockFetchOnce(200, `${hash.substring(5)}:9`);

      const before = Date.now();
      const results = await darkWebMonitorService.checkAllEmails();

      expect(results.get(email)).toHaveLength(1);
      const cfg = darkWebMonitorService.getConfig();
      expect(cfg.lastCheckAt).toBeGreaterThanOrEqual(before);

      const history: BreachRecord[] = JSON.parse(localStorage.getItem(BREACH_HISTORY_KEY)!);
      expect(history).toHaveLength(1);
    });
  });

  describe('breach history + remediation', () => {
    it('returns an empty history when none stored', () => {
      expect(darkWebMonitorService.getBreachHistory()).toEqual([]);
    });

    it('marks a matching breach as remediated and persists it', () => {
      const history: BreachRecord[] = [
        {
          name: 'Adobe Incident',
          domain: 'adobe.com',
          breachDate: '2013-10-04',
          addedDate: '2013-12-04',
          dataClasses: ['email-addresses', 'passwords'],
          severity: 'critical',
          remediated: false,
        },
      ];
      localStorage.setItem(BREACH_HISTORY_KEY, JSON.stringify(history));

      darkWebMonitorService.markRemediated('Adobe Incident', 'me@example.com');

      const updated: BreachRecord[] = JSON.parse(localStorage.getItem(BREACH_HISTORY_KEY)!);
      expect(updated[0].remediated).toBe(true);
      expect(auditLog).toHaveBeenCalledWith(
        'breach_remediated',
        'breach:Adobe Incident',
        expect.objectContaining({ breach: 'Adobe Incident' })
      );
    });

    it('does nothing when the named breach is absent', () => {
      localStorage.setItem(BREACH_HISTORY_KEY, JSON.stringify([]));
      darkWebMonitorService.markRemediated('Ghost', 'me@example.com');
      expect(JSON.parse(localStorage.getItem(BREACH_HISTORY_KEY)!)).toEqual([]);
    });
  });

  describe('getBreachSeverity', () => {
    const base: Omit<BreachRecord, 'dataClasses'> = {
      name: 'b',
      domain: 'd',
      breachDate: '2020-01-01',
      addedDate: '2020-01-02',
      severity: 'low',
      remediated: false,
    };

    it('classifies password/payment exposure as critical', () => {
      expect(darkWebMonitorService.getBreachSeverity({ ...base, dataClasses: ['Passwords'] })).toBe(
        'critical'
      );
    });

    it('classifies email/username exposure as high', () => {
      expect(
        darkWebMonitorService.getBreachSeverity({ ...base, dataClasses: ['Email-Addresses'] })
      ).toBe('high');
    });

    it('classifies >2 non-critical classes as medium', () => {
      expect(
        darkWebMonitorService.getBreachSeverity({
          ...base,
          dataClasses: ['Geo', 'IP', 'Bio'],
        })
      ).toBe('medium');
    });

    it('classifies <=2 non-critical classes as low', () => {
      expect(darkWebMonitorService.getBreachSeverity({ ...base, dataClasses: ['Geo'] })).toBe(
        'low'
      );
    });
  });

  describe('getMonitoringStatus', () => {
    it('aggregates unique + unremediated counts and computes nextCheck', () => {
      const history: BreachRecord[] = [
        {
          name: 'A',
          domain: '',
          breachDate: '',
          addedDate: '',
          dataClasses: [],
          severity: 'low',
          remediated: false,
        },
        {
          name: 'A',
          domain: '',
          breachDate: '',
          addedDate: '',
          dataClasses: [],
          severity: 'low',
          remediated: true,
        },
        {
          name: 'B',
          domain: '',
          breachDate: '',
          addedDate: '',
          dataClasses: [],
          severity: 'low',
          remediated: false,
        },
      ];
      localStorage.setItem(BREACH_HISTORY_KEY, JSON.stringify(history));
      darkWebMonitorService.updateConfig({
        enabled: true,
        lastCheckAt: 1_000_000,
        checkIntervalHours: 24,
      });

      const status = darkWebMonitorService.getMonitoringStatus();
      expect(status.totalBreaches).toBe(2); // unique names A, B
      expect(status.unremediated).toBe(2); // A(false) + B(false)
      expect(status.lastCheck).toBe(1_000_000);
      expect(status.nextCheck).toBe(1_000_000 + 24 * 60 * 60 * 1000);
    });

    it('leaves nextCheck null when never checked', () => {
      darkWebMonitorService.updateConfig({ enabled: true, lastCheckAt: null });
      expect(darkWebMonitorService.getMonitoringStatus().nextCheck).toBeNull();
    });
  });

  describe('scheduleCheck', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      darkWebMonitorService.destroy();
      jest.useRealTimers();
    });

    it('does not schedule when disabled', () => {
      darkWebMonitorService.updateConfig({ enabled: false, emails: ['a@b.com'] });
      darkWebMonitorService.scheduleCheck();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('does not schedule when there are no emails', () => {
      darkWebMonitorService.updateConfig({ enabled: true, emails: [] });
      darkWebMonitorService.scheduleCheck();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('runs immediately and sets a repeating interval when enabled with emails', () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      });
      darkWebMonitorService.updateConfig({
        enabled: true,
        emails: ['a@b.com'],
        checkIntervalHours: 1,
      });

      darkWebMonitorService.scheduleCheck();

      // Immediate check kicked off + one interval registered.
      expect(global.fetch).toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(1);
      expect(auditLog).toHaveBeenCalledWith('monitor_schedule_set', 'monitor_schedule', {
        intervalHours: 1,
      });
    });

    it('destroy clears the scheduled interval', () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '',
      });
      darkWebMonitorService.updateConfig({
        enabled: true,
        emails: ['a@b.com'],
        checkIntervalHours: 1,
      });
      darkWebMonitorService.scheduleCheck();
      expect(jest.getTimerCount()).toBe(1);
      darkWebMonitorService.destroy();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
