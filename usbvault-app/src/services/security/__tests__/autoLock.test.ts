/**
 * Unit tests for the auto-lock service.
 *
 * Drives the inactivity lock state machine deterministically with fake timers:
 * background -> timer fires -> lock; foreground-within-window -> no lock;
 * foreground-after-window -> lock. The native AppState handler is captured from
 * the (mocked) AppState.addEventListener registration so we can invoke real
 * state transitions; settingsStorage (the persistence boundary) is mocked.
 */

import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { autoLockService } from '../autoLock';
import { securitySettings } from '@/services/settingsStorage';

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
  fireAndForget: jest.fn(),
}));

// Persistence boundary — return defaults, record saves.
const savedConfigs: { autoLockEnabled: boolean; autoLockTimeoutMs: number }[] = [];
jest.mock('@/services/settingsStorage', () => ({
  securitySettings: {
    load: jest.fn(() => ({ autoLockEnabled: true, autoLockTimeoutMs: 5 * 60 * 1000 })),
    save: jest.fn((cfg: { autoLockEnabled: boolean; autoLockTimeoutMs: number }) => {
      savedConfigs.push(cfg);
    }),
  },
}));

const mockedAppState = AppState as unknown as { addEventListener: jest.Mock };
const mockedSettings = securitySettings as unknown as { load: jest.Mock; save: jest.Mock };

/**
 * Start the service and return the captured native AppState change handler so a
 * test can drive 'background' / 'active' / 'inactive' transitions directly.
 */
function startAndCaptureHandler(onLock: () => void): (s: AppStateStatus) => void {
  let handler: ((s: AppStateStatus) => void) | undefined;
  mockedAppState.addEventListener.mockImplementation(
    (_event: string, cb: (s: AppStateStatus) => void) => {
      handler = cb;
      return { remove: jest.fn() };
    }
  );
  autoLockService.start(onLock);
  if (!handler) throw new Error('AppState handler was not registered');
  return handler;
}

describe('autoLockService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    savedConfigs.length = 0;
    mockedAppState.addEventListener.mockReset();
    mockedSettings.save.mockClear();
    // Restore a known config (5 minutes, enabled) before each test.
    autoLockService.setConfig({ enabled: true, timeoutMinutes: 5 });
    mockedSettings.save.mockClear();
    autoLockService.recordActivity();
  });

  afterEach(() => {
    autoLockService.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('config', () => {
    it('loads a persisted config translated from ms to minutes on construction', () => {
      // The singleton was constructed with the mocked load() -> 5 minutes.
      expect(autoLockService.getConfig()).toEqual({ enabled: true, timeoutMinutes: 5 });
    });

    it('merges partial updates and persists ms back to settings storage', () => {
      autoLockService.setConfig({ timeoutMinutes: 15 });
      expect(autoLockService.getConfig()).toEqual({ enabled: true, timeoutMinutes: 15 });
      expect(mockedSettings.save).toHaveBeenCalledWith({
        autoLockEnabled: true,
        autoLockTimeoutMs: 15 * 60 * 1000,
      });
    });

    it('returns a copy of the config (mutating the result does not affect state)', () => {
      const cfg = autoLockService.getConfig();
      cfg.timeoutMinutes = 999;
      expect(autoLockService.getConfig().timeoutMinutes).not.toBe(999);
    });
  });

  describe('start/stop lifecycle', () => {
    it('registers a single AppState listener on native and ignores double-start', () => {
      startAndCaptureHandler(jest.fn());
      autoLockService.start(jest.fn()); // second call is a no-op
      expect(mockedAppState.addEventListener).toHaveBeenCalledTimes(1);
    });

    it('removes the AppState subscription on stop', () => {
      const remove = jest.fn();
      mockedAppState.addEventListener.mockReturnValue({ remove });
      autoLockService.start(jest.fn());
      autoLockService.stop();
      expect(remove).toHaveBeenCalled();
    });
  });

  describe('inactivity timer', () => {
    it('locks after the timeout elapses in the background', () => {
      const onLock = jest.fn();
      const handler = startAndCaptureHandler(onLock);

      handler('background');
      // Just before the 5-minute window: no lock yet.
      jest.advanceTimersByTime(5 * 60 * 1000 - 1);
      expect(onLock).not.toHaveBeenCalled();

      // Crossing the threshold fires the timer.
      jest.advanceTimersByTime(1);
      expect(onLock).toHaveBeenCalledTimes(1);
    });

    it('does NOT lock when returning to foreground within the timeout window', () => {
      const onLock = jest.fn();
      const handler = startAndCaptureHandler(onLock);

      handler('background');
      jest.advanceTimersByTime(60 * 1000); // 1 minute < 5 minute timeout
      handler('active');

      expect(onLock).not.toHaveBeenCalled();
      // Returning early clears the pending timer; advancing further must not lock.
      jest.advanceTimersByTime(10 * 60 * 1000);
      expect(onLock).not.toHaveBeenCalled();
    });

    it('locks on foreground if the timeout was exceeded while backgrounded', () => {
      const onLock = jest.fn();
      const handler = startAndCaptureHandler(onLock);

      handler('background');
      // Simulate wall-clock passing beyond the window without the timer firing
      // (e.g. JS suspended in background) by advancing the system clock.
      jest.setSystemTime(new Date('2026-01-01T00:06:00Z')); // +6 minutes
      handler('active');

      expect(onLock).toHaveBeenCalledTimes(1);
    });

    it('treats the "inactive" state like "background" (arms the timer)', () => {
      const onLock = jest.fn();
      const handler = startAndCaptureHandler(onLock);

      handler('inactive');
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(onLock).toHaveBeenCalledTimes(1);
    });

    it('does nothing on state changes when auto-lock is disabled', () => {
      autoLockService.setConfig({ enabled: false });
      const onLock = jest.fn();
      const handler = startAndCaptureHandler(onLock);

      handler('background');
      jest.advanceTimersByTime(60 * 60 * 1000);
      expect(onLock).not.toHaveBeenCalled();
    });

    it('clears any pending timer when the config is switched to disabled', () => {
      const onLock = jest.fn();
      const handler = startAndCaptureHandler(onLock);

      handler('background');
      autoLockService.setConfig({ enabled: false }); // should clear the armed timer
      jest.advanceTimersByTime(60 * 60 * 1000);
      expect(onLock).not.toHaveBeenCalled();
    });
  });

  describe('checkLock', () => {
    it('returns false when there is no background timestamp', () => {
      autoLockService.recordActivity(); // clears backgroundTimestamp
      expect(autoLockService.checkLock()).toBe(false);
    });

    it('returns true once the elapsed background time exceeds the timeout', () => {
      const handler = startAndCaptureHandler(jest.fn());
      handler('background');
      jest.setSystemTime(new Date('2026-01-01T00:05:00Z')); // exactly 5 minutes
      expect(autoLockService.checkLock()).toBe(true);
    });

    it('returns false while still inside the timeout window', () => {
      const handler = startAndCaptureHandler(jest.fn());
      handler('background');
      jest.setSystemTime(new Date('2026-01-01T00:02:00Z'));
      expect(autoLockService.checkLock()).toBe(false);
    });
  });

  describe('recordActivity', () => {
    it('clears the background timestamp so a later checkLock is false', () => {
      const handler = startAndCaptureHandler(jest.fn());
      handler('background');
      autoLockService.recordActivity();
      jest.setSystemTime(new Date('2026-01-01T00:10:00Z'));
      expect(autoLockService.checkLock()).toBe(false);
    });
  });
});

/**
 * Web platform: the visibilitychange path. Loaded via isolateModules with
 * Platform.OS forced to 'web' so the module-under-test takes the web branch in
 * start()/stop() and uses the visibilitychange handler.
 */
describe('autoLockService (web visibility path)', () => {
  let setVisibility: (state: 'visible' | 'hidden') => void;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    // jsdom's document.visibilityState is a read-only getter; back it with a
    // mutable variable so a test can drive hidden/visible transitions.
    let current: 'visible' | 'hidden' = 'visible';
    setVisibility = state => {
      current = state;
    };
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => current,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  /**
   * Load a fresh copy of the service under Platform.OS='web' and return it
   * alongside a helper to dispatch a real visibilitychange event.
   */
  function loadWebService(): {
    service: typeof import('../autoLock').autoLockService;
    fireVisibility: () => void;
  } {
    let mod!: typeof import('../autoLock');
    jest.isolateModules(() => {
      // Clear the cached react-native (Platform.OS='ios' from jest.setup) so the
      // doMock below actually applies and the module takes its web branch.
      jest.resetModules();
      jest.doMock('react-native', () => ({
        Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
        AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
      }));
      jest.doMock('@/utils/logger', () => ({
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
        fireAndForget: jest.fn(),
      }));
      jest.doMock('@/services/settingsStorage', () => ({
        securitySettings: {
          load: jest.fn(() => ({ autoLockEnabled: true, autoLockTimeoutMs: 5 * 60 * 1000 })),
          save: jest.fn(),
        },
      }));
      mod = require('../autoLock');
    });
    return {
      service: mod.autoLockService,
      fireVisibility: () => document.dispatchEvent(new Event('visibilitychange')),
    };
  }

  it('locks after the timeout when the tab is hidden (web timer path)', () => {
    const { service, fireVisibility } = loadWebService();
    const onLock = jest.fn();
    service.start(onLock);

    setVisibility('hidden');
    fireVisibility();
    jest.advanceTimersByTime(5 * 60 * 1000);
    expect(onLock).toHaveBeenCalledTimes(1);

    service.stop();
  });

  it('does not lock when the tab becomes visible within the window', () => {
    const { service, fireVisibility } = loadWebService();
    const onLock = jest.fn();
    service.start(onLock);

    setVisibility('hidden');
    fireVisibility();
    jest.advanceTimersByTime(60 * 1000);
    setVisibility('visible');
    fireVisibility();
    jest.advanceTimersByTime(10 * 60 * 1000);

    expect(onLock).not.toHaveBeenCalled();
    service.stop();
  });

  it('locks on becoming visible if the timeout was exceeded while hidden', () => {
    const { service, fireVisibility } = loadWebService();
    const onLock = jest.fn();
    service.start(onLock);

    setVisibility('hidden');
    fireVisibility();
    jest.setSystemTime(new Date('2026-01-01T00:06:00Z')); // +6m, beyond 5m window
    setVisibility('visible');
    fireVisibility();

    expect(onLock).toHaveBeenCalledTimes(1);
    service.stop();
  });

  it('removes the visibilitychange listener on stop', () => {
    const { service, fireVisibility } = loadWebService();
    const onLock = jest.fn();
    service.start(onLock);
    service.stop();

    // After stop the handler is detached: a hidden event must not arm a timer.
    setVisibility('hidden');
    fireVisibility();
    jest.advanceTimersByTime(10 * 60 * 1000);
    expect(onLock).not.toHaveBeenCalled();
  });
});
