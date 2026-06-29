/**
 * Unit tests for appPasswordService.
 *
 * Exercises real PBKDF2 hashing (via jsdom's crypto.subtle polyfill from
 * jest.setup.js), base64 round-tripping, constant-time verification, the
 * lockout state machine, and the set/verify/change/remove flows. Only the
 * audit boundary and logger are mocked; the crypto and localStorage paths
 * run for real against jsdom.
 */

// Audit boundary — assert it is invoked, but do not exercise its internals.
import { appPasswordService } from '../appPasswordService';
import { auditService } from '@/services/auditService';

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
  fireAndForget: jest.fn((p: Promise<unknown>) => {
    // Swallow rejections like the real helper, but still invoke the promise.
    void Promise.resolve(p).catch(() => {});
  }),
}));

const mockedAudit = auditService as unknown as { log: jest.Mock };

const VALID = 'correct-horse-battery'; // >= 12 chars
const STORAGE_KEY = 'usbvault:app_password';

/**
 * Reset the singleton's in-memory lockout/fail state between tests by reaching
 * through the public API. We clear localStorage and reset the private counters
 * via a fresh successful verify cycle is not always possible, so we poke the
 * private fields directly — this is test-only state cleanup, not behavior.
 */
function resetServiceState(): void {
  localStorage.clear();
  const svc = appPasswordService as unknown as { failCount: number; lockoutUntil: number };
  svc.failCount = 0;
  svc.lockoutUntil = 0;
}

describe('appPasswordService', () => {
  beforeEach(() => {
    resetServiceState();
    mockedAudit.log.mockClear();
  });

  describe('isAppPasswordSet', () => {
    it('returns false when no password is stored', () => {
      expect(appPasswordService.isAppPasswordSet()).toBe(false);
    });

    it('returns true after a password is set', async () => {
      await appPasswordService.setAppPassword(VALID);
      expect(appPasswordService.isAppPasswordSet()).toBe(true);
    });
  });

  describe('setAppPassword', () => {
    it('rejects passwords shorter than the 12-char minimum', async () => {
      await expect(appPasswordService.setAppPassword('short')).rejects.toThrow(
        /at least 12 characters/
      );
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('accepts a password exactly at the minimum length boundary', async () => {
      await expect(appPasswordService.setAppPassword('x'.repeat(12))).resolves.toBeUndefined();
      expect(appPasswordService.isAppPasswordSet()).toBe(true);
    });

    it('persists a hash + salt + iterations, never the plaintext', async () => {
      await appPasswordService.setAppPassword(VALID);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      const stored = JSON.parse(raw as string);

      expect(stored).toMatchObject({ iterations: 150000 });
      expect(typeof stored.hash).toBe('string');
      expect(typeof stored.salt).toBe('string');
      expect(typeof stored.createdAt).toBe('string');
      // Plaintext must not appear anywhere in the serialized blob.
      expect(raw).not.toContain(VALID);
      // 32-byte salt -> base64 length is well-defined.
      expect(Buffer.from(stored.salt, 'base64')).toHaveLength(32);
      // 256-bit derived key -> 32 bytes.
      expect(Buffer.from(stored.hash, 'base64')).toHaveLength(32);
    });

    it('generates a unique salt per call (same password -> different hash)', async () => {
      await appPasswordService.setAppPassword(VALID);
      const first = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
      await appPasswordService.setAppPassword(VALID);
      const second = JSON.parse(localStorage.getItem(STORAGE_KEY) as string);

      expect(second.salt).not.toEqual(first.salt);
      expect(second.hash).not.toEqual(first.hash);
    });

    it('logs an audit event on success', async () => {
      await appPasswordService.setAppPassword(VALID);
      expect(mockedAudit.log).toHaveBeenCalledWith('system', 'app_password_set', {}, 'success');
    });
  });

  describe('verifyAppPassword', () => {
    it('throws when no password has been configured', async () => {
      await expect(appPasswordService.verifyAppPassword(VALID)).rejects.toThrow(
        /No app password configured/
      );
    });

    it('returns true for the correct password and resets fail state', async () => {
      await appPasswordService.setAppPassword(VALID);
      await expect(appPasswordService.verifyAppPassword(VALID)).resolves.toBe(true);
      expect(appPasswordService.getFailCount()).toBe(0);
      expect(mockedAudit.log).toHaveBeenCalledWith(
        'system',
        'app_password_verified',
        {},
        'success'
      );
    });

    it('returns false for a wrong password and increments the fail count', async () => {
      await appPasswordService.setAppPassword(VALID);
      await expect(appPasswordService.verifyAppPassword('wrong-password!!')).resolves.toBe(false);
      expect(appPasswordService.getFailCount()).toBe(1);
      expect(mockedAudit.log).toHaveBeenCalledWith(
        'system',
        'app_password_failed',
        { attempt: 1, maxAttempts: 3 },
        'warning'
      );
    });

    it('resets the fail counter after a successful verify following failures', async () => {
      await appPasswordService.setAppPassword(VALID);
      await appPasswordService.verifyAppPassword('wrong-password!!');
      expect(appPasswordService.getFailCount()).toBe(1);
      await appPasswordService.verifyAppPassword(VALID);
      expect(appPasswordService.getFailCount()).toBe(0);
    });
  });

  describe('lockout state machine', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('triggers a 30s lockout after 3 consecutive failures', async () => {
      await appPasswordService.setAppPassword(VALID);

      await appPasswordService.verifyAppPassword('nope-nope-nope-1');
      await appPasswordService.verifyAppPassword('nope-nope-nope-2');
      await appPasswordService.verifyAppPassword('nope-nope-nope-3');

      // After the 3rd failure, failCount is reset and lockout is armed.
      expect(appPasswordService.getFailCount()).toBe(0);
      expect(appPasswordService.getLockoutRemaining()).toBe(30);

      // Further attempts (even with the correct password) throw while locked.
      await expect(appPasswordService.verifyAppPassword(VALID)).rejects.toThrow(
        /Too many failed attempts.*30 seconds/
      );
    });

    it('reports a decreasing lockout remaining as time passes', async () => {
      await appPasswordService.setAppPassword(VALID);
      await appPasswordService.verifyAppPassword('nope-nope-nope-1');
      await appPasswordService.verifyAppPassword('nope-nope-nope-2');
      await appPasswordService.verifyAppPassword('nope-nope-nope-3');

      expect(appPasswordService.getLockoutRemaining()).toBe(30);
      jest.advanceTimersByTime(20_000);
      expect(appPasswordService.getLockoutRemaining()).toBe(10);
    });

    it('clears the lockout once the window elapses, allowing verify again', async () => {
      await appPasswordService.setAppPassword(VALID);
      await appPasswordService.verifyAppPassword('nope-nope-nope-1');
      await appPasswordService.verifyAppPassword('nope-nope-nope-2');
      await appPasswordService.verifyAppPassword('nope-nope-nope-3');

      jest.advanceTimersByTime(30_001);
      expect(appPasswordService.getLockoutRemaining()).toBe(0);
      await expect(appPasswordService.verifyAppPassword(VALID)).resolves.toBe(true);
    });

    it('getLockoutRemaining returns 0 when not locked out', () => {
      expect(appPasswordService.getLockoutRemaining()).toBe(0);
    });
  });

  describe('removeAppPassword', () => {
    it('removes the stored password when the current password is correct', async () => {
      await appPasswordService.setAppPassword(VALID);
      await appPasswordService.removeAppPassword(VALID);
      expect(appPasswordService.isAppPasswordSet()).toBe(false);
      expect(mockedAudit.log).toHaveBeenCalledWith('system', 'app_password_removed', {}, 'success');
    });

    it('throws and keeps the password when the current password is wrong', async () => {
      await appPasswordService.setAppPassword(VALID);
      await expect(appPasswordService.removeAppPassword('wrong-password!!')).rejects.toThrow(
        /Current password is incorrect/
      );
      expect(appPasswordService.isAppPasswordSet()).toBe(true);
    });
  });

  describe('changeAppPassword', () => {
    it('replaces the password when the current one verifies', async () => {
      await appPasswordService.setAppPassword(VALID);
      const newPass = 'brand-new-passphrase';
      await appPasswordService.changeAppPassword(VALID, newPass);

      // Old password no longer verifies; new one does.
      await expect(appPasswordService.verifyAppPassword(VALID)).resolves.toBe(false);
      await expect(appPasswordService.verifyAppPassword(newPass)).resolves.toBe(true);
      expect(mockedAudit.log).toHaveBeenCalledWith('system', 'app_password_changed', {}, 'success');
    });

    it('throws when the current password is wrong', async () => {
      await appPasswordService.setAppPassword(VALID);
      await expect(
        appPasswordService.changeAppPassword('wrong-password!!', 'another-long-pass')
      ).rejects.toThrow(/Current password is incorrect/);
    });

    it('propagates the min-length validation error for the new password', async () => {
      await appPasswordService.setAppPassword(VALID);
      await expect(appPasswordService.changeAppPassword(VALID, 'short')).rejects.toThrow(
        /at least 12 characters/
      );
    });
  });
});
