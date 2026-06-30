/**
 * Tests for analyticsService — PostHog analytics with local event buffering.
 *
 * Exercises the REAL behavior of AnalyticsServiceImpl:
 *  - buffer path when no PostHog key is configured (FIFO drop at MAX_BUFFER_SIZE)
 *  - client path when EXPO_PUBLIC_POSTHOG_KEY is set (capture/identify/screen/reset)
 *  - enable/disable gating (no-ops + optIn/optOut)
 *  - buffered events flushed to the client on init
 *  - screen() buffering as a $screen event when no client
 *  - shutdown() flushing + clearing the client
 *
 * Boundaries mocked: posthog-react-native (network SDK), Platform (native), logger.
 * The buffer logic, gating, and flush are the real implementation under test.
 */

import { Platform } from 'react-native';

// posthog-react-native is the genuine network/SDK boundary.
const captureMock = jest.fn();
const identifyMock = jest.fn();
const screenMock = jest.fn();
const resetMock = jest.fn();
const optInMock = jest.fn();
const optOutMock = jest.fn();
const shutdownMock = jest.fn().mockResolvedValue(undefined);

const PostHogCtor = jest.fn().mockImplementation(() => ({
  capture: captureMock,
  identify: identifyMock,
  screen: screenMock,
  reset: resetMock,
  optIn: optInMock,
  optOut: optOutMock,
  shutdown: shutdownMock,
}));

jest.mock('posthog-react-native', () => ({
  PostHog: PostHogCtor,
}));

jest.mock('@/utils/logger', () => ({
  logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;

/**
 * Load a FRESH analyticsService instance after setting the API key env var.
 * The key is read at module-load time, so we must reset modules per scenario.
 */
function loadService(
  apiKey: string | undefined
): typeof import('../analyticsService').analyticsService {
  if (apiKey === undefined) {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  } else {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = apiKey;
  }
  let service!: typeof import('../analyticsService').analyticsService;
  jest.isolateModules(() => {
    service = require('../analyticsService').analyticsService;
  });
  return service;
}

beforeEach(() => {
  jest.clearAllMocks();
  (Platform as { OS: string }).OS = 'ios';
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  } else {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = ORIGINAL_KEY;
  }
});

describe('analyticsService — buffering (no PostHog key)', () => {
  it('buffers tracked events in-memory when no client is configured', () => {
    const service = loadService(undefined);
    expect(service.getBufferSize()).toBe(0);

    service.track('file_encrypted', { count: 3 });
    service.track('vault_unlocked');

    expect(service.getBufferSize()).toBe(2);
    // Nothing should reach the (absent) network client.
    expect(captureMock).not.toHaveBeenCalled();
  });

  it('buffers a $screen event when screen() is called without a client', () => {
    const service = loadService(undefined);
    service.screen('SettingsScreen');
    expect(service.getBufferSize()).toBe(1);
  });

  it('drops oldest events FIFO once the 1000-event buffer is full', () => {
    const service = loadService(undefined);
    for (let i = 0; i < 1005; i++) {
      service.track(`event_${i}`);
    }
    // MAX_BUFFER_SIZE is 1000 — the buffer never grows past it.
    expect(service.getBufferSize()).toBe(1000);
  });

  it('init() with no key buffers the app_opened event and marks initialized', async () => {
    const service = loadService(undefined);
    await service.init();
    expect(service.getBufferSize()).toBe(1); // app_opened
    expect(PostHogCtor).not.toHaveBeenCalled();

    // Second init is a no-op (already initialized) — buffer size unchanged.
    await service.init();
    expect(service.getBufferSize()).toBe(1);
  });

  it('identify/reset/setEnabled are no-ops (no throw) without a client', () => {
    const service = loadService(undefined);
    expect(() => service.identify('user-42')).not.toThrow();
    expect(() => service.reset()).not.toThrow();
    expect(() => service.setEnabled(false)).not.toThrow();
    expect(identifyMock).not.toHaveBeenCalled();
    expect(optOutMock).not.toHaveBeenCalled();
  });
});

describe('analyticsService — gating (enabled flag)', () => {
  it('drops track/screen events while disabled', () => {
    const service = loadService(undefined);
    service.setEnabled(false);
    service.track('should_not_buffer');
    service.screen('AlsoIgnored');
    expect(service.getBufferSize()).toBe(0);
  });

  it('resumes buffering after re-enabling', () => {
    const service = loadService(undefined);
    service.setEnabled(false);
    service.track('ignored');
    service.setEnabled(true);
    service.track('counted');
    expect(service.getBufferSize()).toBe(1);
  });
});

describe('analyticsService — client path (PostHog key configured)', () => {
  it('init() constructs a PostHog client and forwards app_opened with platform', async () => {
    (Platform as { OS: string }).OS = 'android';
    const service = loadService('phc_test_key_value');
    await service.init();

    expect(PostHogCtor).toHaveBeenCalledTimes(1);
    expect(PostHogCtor).toHaveBeenCalledWith(
      'phc_test_key_value',
      expect.objectContaining({ flushAt: 20, captureNativeAppLifecycleEvents: false })
    );
    expect(captureMock).toHaveBeenCalledWith('app_opened', { platform: 'android' });
  });

  it('flushes events buffered BEFORE init once the client comes online', async () => {
    const service = loadService('phc_test_key_value');
    // Track before init — these go to the in-memory buffer.
    service.track('pre_init_one');
    service.track('pre_init_two');
    expect(service.getBufferSize()).toBe(2);

    await service.init();

    // Both buffered events plus app_opened are captured; buffer is drained.
    expect(service.getBufferSize()).toBe(0);
    expect(captureMock).toHaveBeenCalledWith('pre_init_one', undefined);
    expect(captureMock).toHaveBeenCalledWith('pre_init_two', undefined);
  });

  it('routes track/identify/screen/reset to the client after init', async () => {
    const service = loadService('phc_test_key_value');
    await service.init();
    captureMock.mockClear();

    service.track('file_shared', { recipients: 2 });
    expect(captureMock).toHaveBeenCalledWith('file_shared', { recipients: 2 });

    service.identify('user-abc');
    expect(identifyMock).toHaveBeenCalledWith('user-abc');

    service.screen('VaultScreen');
    expect(screenMock).toHaveBeenCalledWith('VaultScreen');

    service.reset();
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it('setEnabled toggles optIn/optOut on the client', async () => {
    const service = loadService('phc_test_key_value');
    await service.init();

    service.setEnabled(false);
    expect(optOutMock).toHaveBeenCalledTimes(1);

    service.setEnabled(true);
    expect(optInMock).toHaveBeenCalledTimes(1);
  });

  it('shutdown() flushes the client and tears it down so events buffer again', async () => {
    const service = loadService('phc_test_key_value');
    await service.init();

    await service.shutdown();
    expect(shutdownMock).toHaveBeenCalledTimes(1);

    // After shutdown the client is null — subsequent tracks buffer locally.
    service.track('post_shutdown');
    expect(service.getBufferSize()).toBe(1);
  });

  it('survives a PostHog constructor failure and falls back to buffering', async () => {
    PostHogCtor.mockImplementationOnce(() => {
      throw new Error('SDK init blew up');
    });
    const service = loadService('phc_test_key_value');
    await service.init();

    // Client creation failed; app_opened was buffered instead of captured.
    expect(service.getBufferSize()).toBe(1);
    expect(captureMock).not.toHaveBeenCalled();
  });
});
