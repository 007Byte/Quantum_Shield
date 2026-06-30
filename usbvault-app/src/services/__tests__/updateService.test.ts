/**
 * Tests for updateService — expo-updates OTA update orchestration.
 *
 * Exercises the REAL behavior of UpdateServiceImpl:
 *  - dev-mode no-op path (expo-updates unavailable / web)
 *  - checkForUpdates: no update, update available + downloaded, error handling
 *  - applyUpdate gating on isReady
 *  - AppState listener wiring on init and teardown on destroy
 *  - getStatus returns a defensive copy
 *
 * Boundaries mocked: expo-updates (native OTA module), Platform + AppState (native),
 * logger. The status-state-machine logic is the real implementation under test.
 */

import { Platform, AppState } from 'react-native';

const checkForUpdateAsync = jest.fn();
const fetchUpdateAsync = jest.fn();
const reloadAsync = jest.fn();

jest.mock(
  'expo-updates',
  () => ({
    checkForUpdateAsync: (...a: unknown[]) => checkForUpdateAsync(...a),
    fetchUpdateAsync: (...a: unknown[]) => fetchUpdateAsync(...a),
    reloadAsync: (...a: unknown[]) => reloadAsync(...a),
  }),
  { virtual: true }
);

jest.mock('@/utils/logger', () => ({
  logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/** Fresh service instance per scenario (the singleton holds mutable status). */
function loadService(): typeof import('../updateService').updateService {
  let service!: typeof import('../updateService').updateService;
  jest.isolateModules(() => {
    service = require('../updateService').updateService;
  });
  return service;
}

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'ios';
  (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: jest.fn() });
});

describe('updateService — availability gating', () => {
  it('is a no-op on web (expo-updates considered unavailable)', async () => {
    (Platform as { OS: string }).OS = 'web';
    const service = loadService();
    await service.init();

    expect(checkForUpdateAsync).not.toHaveBeenCalled();
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    expect(service.getStatus().lastChecked).toBeNull();
  });

  it('checkForUpdates returns the untouched status when updates are unavailable (web)', async () => {
    (Platform as { OS: string }).OS = 'web';
    const service = loadService();
    const status = await service.checkForUpdates();
    expect(status.isAvailable).toBe(false);
    expect(status.lastChecked).toBeNull();
    expect(checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('applyUpdate is a no-op on web', async () => {
    (Platform as { OS: string }).OS = 'web';
    const service = loadService();
    await service.applyUpdate();
    expect(reloadAsync).not.toHaveBeenCalled();
  });
});

describe('updateService — checkForUpdates (native)', () => {
  it('records lastChecked and leaves status clean when no update is available', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const service = loadService();

    const status = await service.checkForUpdates();

    expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(fetchUpdateAsync).not.toHaveBeenCalled();
    expect(status.isAvailable).toBe(false);
    expect(status.isReady).toBe(false);
    expect(status.lastChecked).toBeInstanceOf(Date);
    expect(status.error).toBeNull();
  });

  it('downloads and stages an available update, marking it ready', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    const service = loadService();

    const status = await service.checkForUpdates();

    expect(fetchUpdateAsync).toHaveBeenCalledTimes(1);
    expect(status.isAvailable).toBe(true);
    expect(status.isDownloading).toBe(false);
    expect(status.isReady).toBe(true);
    expect(status.error).toBeNull();
  });

  it('does not mark ready when the fetched update is not new', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    fetchUpdateAsync.mockResolvedValue({ isNew: false });
    const service = loadService();

    const status = await service.checkForUpdates();

    expect(status.isReady).toBe(false);
    expect(status.isDownloading).toBe(false);
  });

  it('captures the error message and clears isDownloading when the check throws', async () => {
    checkForUpdateAsync.mockRejectedValue(new Error('network unreachable'));
    const service = loadService();

    const status = await service.checkForUpdates();

    expect(status.error).toBe('network unreachable');
    expect(status.isDownloading).toBe(false);
  });

  it('falls back to a generic error message when the thrown error has none', async () => {
    checkForUpdateAsync.mockRejectedValue({});
    const service = loadService();

    const status = await service.checkForUpdates();
    expect(status.error).toBe('Update check failed');
  });
});

describe('updateService — init & AppState lifecycle', () => {
  it('checks on launch and registers an AppState change listener', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const service = loadService();

    await service.init();

    expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('re-checks for updates when the app returns to the foreground', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    let changeHandler: (s: string) => void = () => {};
    (AppState.addEventListener as jest.Mock).mockImplementation((_evt, cb) => {
      changeHandler = cb;
      return { remove: jest.fn() };
    });
    const service = loadService();
    await service.init();
    checkForUpdateAsync.mockClear();

    changeHandler('active');
    expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);

    // Backgrounding must NOT trigger a re-check.
    changeHandler('background');
    expect(checkForUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('init() is idempotent — a second call does not re-register the listener', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const service = loadService();
    await service.init();
    await service.init();
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('destroy() removes the AppState subscription', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const remove = jest.fn();
    (AppState.addEventListener as jest.Mock).mockReturnValue({ remove });
    const service = loadService();
    await service.init();

    service.destroy();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('updateService — applyUpdate', () => {
  it('reloads the app once an update is staged and ready', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    reloadAsync.mockResolvedValue(undefined);
    const service = loadService();
    await service.checkForUpdates();

    await service.applyUpdate();
    expect(reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no update is ready', async () => {
    const service = loadService();
    await service.applyUpdate();
    expect(reloadAsync).not.toHaveBeenCalled();
  });

  it('swallows reload errors without throwing', async () => {
    checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    fetchUpdateAsync.mockResolvedValue({ isNew: true });
    reloadAsync.mockRejectedValue(new Error('reload failed'));
    const service = loadService();
    await service.checkForUpdates();

    await expect(service.applyUpdate()).resolves.toBeUndefined();
  });
});

describe('updateService — getStatus', () => {
  it('returns a defensive copy that cannot mutate internal state', async () => {
    const service = loadService();
    const a = service.getStatus();
    a.isAvailable = true;
    const b = service.getStatus();
    expect(b.isAvailable).toBe(false);
  });
});
