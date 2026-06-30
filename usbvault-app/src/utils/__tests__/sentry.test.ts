/**
 * Tests for the Sentry monitoring helpers.
 *
 * The @sentry/react-native SDK is a genuine external boundary and is mocked
 * (globally in jest.setup.js, re-asserted here). We exercise the real
 * init-gating logic, the beforeBreadcrumb / beforeSend PII redaction, and the
 * "no-op until initialized" guards. Because initSentry() flips a module-level
 * `initialized` flag and reads the DSN at import time, each scenario re-imports
 * the module under jest.isolateModules with the env configured up front.
 */

describe('utils/sentry', () => {
  const ORIGINAL_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

  afterEach(() => {
    if (ORIGINAL_DSN === undefined) {
      delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    } else {
      process.env.EXPO_PUBLIC_SENTRY_DSN = ORIGINAL_DSN;
    }
    jest.clearAllMocks();
  });

  /** Load a fresh copy of the module + its mocked Sentry SDK for one scenario. */
  function loadFresh(dsn?: string) {
    let mod!: typeof import('@/utils/sentry');
    let Sentry!: typeof import('@sentry/react-native');
    jest.isolateModules(() => {
      if (dsn === undefined) {
        delete process.env.EXPO_PUBLIC_SENTRY_DSN;
      } else {
        process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Sentry = require('@sentry/react-native');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mod = require('@/utils/sentry');
    });
    return { mod, Sentry };
  }

  describe('initSentry', () => {
    it('is a no-op when no DSN is configured', () => {
      const { mod, Sentry } = loadFresh(undefined);
      mod.initSentry();
      expect(Sentry.init).not.toHaveBeenCalled();
      expect(Sentry.setTag).not.toHaveBeenCalled();
    });

    it('initializes Sentry and tags the platform when a DSN is present', () => {
      const { mod, Sentry } = loadFresh('https://abc123@o1.ingest.sentry.io/42');
      mod.initSentry();
      expect(Sentry.init).toHaveBeenCalledTimes(1);
      expect(Sentry.setTag).toHaveBeenCalledWith('platform', 'ios');
    });

    it('only initializes once even if called repeatedly', () => {
      const { mod, Sentry } = loadFresh('https://abc123@o1.ingest.sentry.io/42');
      mod.initSentry();
      mod.initSentry();
      mod.initSentry();
      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });

    it('passes a config that disables sending in dev and enables stacktraces', () => {
      const { mod, Sentry } = loadFresh('https://abc123@o1.ingest.sentry.io/42');
      mod.initSentry();
      const config = (Sentry.init as jest.Mock).mock.calls[0][0];
      expect(config.dsn).toBe('https://abc123@o1.ingest.sentry.io/42');
      expect(config.attachStacktrace).toBe(true);
      // __DEV__ is true under jest.setup → sending disabled, dev environment.
      expect(config.enabled).toBe(false);
      expect(config.environment).toBe('development');
      expect(config.tracesSampleRate).toBeCloseTo(0.2);
    });
  });

  describe('beforeBreadcrumb redaction', () => {
    function getBeforeBreadcrumb() {
      const { mod, Sentry } = loadFresh('https://abc123@o1.ingest.sentry.io/42');
      mod.initSentry();
      return (Sentry.init as jest.Mock).mock.calls[0][0].beforeBreadcrumb as (
        bc: Record<string, unknown>
      ) => Record<string, unknown>;
    }

    it('strips request_body and redacts the Authorization header on http breadcrumbs', () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      const result = beforeBreadcrumb({
        category: 'http',
        data: {
          request_body: 'secret-payload',
          headers: { Authorization: 'Bearer token-9f3c', 'Content-Type': 'application/json' },
        },
      }) as { data: { request_body?: unknown; headers: Record<string, unknown> } };

      expect(result.data.request_body).toBeUndefined();
      expect(result.data.headers.Authorization).toBe('[REDACTED]');
      expect(result.data.headers['Content-Type']).toBe('application/json');
    });

    it('leaves non-http breadcrumbs untouched', () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      const navCrumb = { category: 'navigation', data: { from: '/a', to: '/b' } };
      expect(beforeBreadcrumb({ ...navCrumb })).toEqual(navCrumb);
    });

    it('handles http breadcrumbs that lack data', () => {
      const beforeBreadcrumb = getBeforeBreadcrumb();
      const crumb = { category: 'http' };
      expect(beforeBreadcrumb({ ...crumb })).toEqual(crumb);
    });
  });

  describe('beforeSend redaction', () => {
    function getBeforeSend() {
      const { mod, Sentry } = loadFresh('https://abc123@o1.ingest.sentry.io/42');
      mod.initSentry();
      return (Sentry.init as jest.Mock).mock.calls[0][0].beforeSend as (
        event: Record<string, unknown>
      ) => Record<string, unknown>;
    }

    it('strips ip_address from user context', () => {
      const beforeSend = getBeforeSend();
      const result = beforeSend({
        user: { id: 'user-1', email: 'a@b.io', ip_address: '203.0.113.5' },
      }) as { user: Record<string, unknown> };
      expect(result.user.ip_address).toBeUndefined();
      expect(result.user.id).toBe('user-1');
    });

    it('redacts Authorization headers nested in breadcrumbs', () => {
      const beforeSend = getBeforeSend();
      const result = beforeSend({
        breadcrumbs: [
          { data: { headers: { Authorization: 'Bearer abc-123' } } },
          { data: { headers: { 'Content-Type': 'text/plain' } } },
          { message: 'no data here' },
        ],
      }) as { breadcrumbs: { data?: { headers?: Record<string, unknown> } }[] };

      expect(result.breadcrumbs[0].data?.headers?.Authorization).toBe('[REDACTED]');
      expect(result.breadcrumbs[1].data?.headers?.['Content-Type']).toBe('text/plain');
    });

    it('returns the event unchanged when there is no user or breadcrumbs', () => {
      const beforeSend = getBeforeSend();
      const event = { message: 'plain event' };
      expect(beforeSend({ ...event })).toEqual(event);
    });
  });

  describe('helpers no-op before init', () => {
    it('does nothing when Sentry was never initialized (no DSN)', () => {
      const { mod, Sentry } = loadFresh(undefined);
      mod.setSentryUser('user-1', 'a@b.io');
      mod.clearSentryUser();
      mod.addBreadcrumb('nav', 'opened screen');
      mod.captureException(new Error('boom'));
      mod.captureMessage('hello');
      expect(Sentry.setUser).not.toHaveBeenCalled();
      expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });

  describe('helpers after init', () => {
    function loadInitialized() {
      const loaded = loadFresh('https://abc123@o1.ingest.sentry.io/42');
      loaded.mod.initSentry();
      return loaded;
    }

    it('setSentryUser forwards id and email', () => {
      const { mod, Sentry } = loadInitialized();
      mod.setSentryUser('user-7', 'me@example.io');
      expect(Sentry.setUser).toHaveBeenCalledWith({ id: 'user-7', email: 'me@example.io' });
    });

    it('clearSentryUser sets null', () => {
      const { mod, Sentry } = loadInitialized();
      mod.clearSentryUser();
      expect(Sentry.setUser).toHaveBeenCalledWith(null);
    });

    it('addBreadcrumb forwards category, message, data and default level', () => {
      const { mod, Sentry } = loadInitialized();
      mod.addBreadcrumb('nav', 'opened vault', { vaultId: 'v1' });
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'nav',
        message: 'opened vault',
        data: { vaultId: 'v1' },
        level: 'info',
      });
    });

    it('captureException without context calls captureException directly', () => {
      const { mod, Sentry } = loadInitialized();
      const err = new Error('direct');
      mod.captureException(err);
      expect(Sentry.captureException).toHaveBeenCalledWith(err);
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });

    it('captureException with context uses a scope and sets extras', () => {
      const { mod, Sentry } = loadInitialized();
      const setExtras = jest.fn();
      (Sentry.withScope as jest.Mock).mockImplementation((cb: (s: unknown) => void) =>
        cb({ setExtras })
      );
      const err = new Error('scoped');
      mod.captureException(err, { route: '/vault' });
      expect(setExtras).toHaveBeenCalledWith({ route: '/vault' });
      expect(Sentry.captureException).toHaveBeenCalledWith(err);
    });

    it('captureMessage forwards message and explicit level', () => {
      const { mod, Sentry } = loadInitialized();
      mod.captureMessage('something happened', 'warning');
      expect(Sentry.captureMessage).toHaveBeenCalledWith('something happened', 'warning');
    });

    it('re-exports the Sentry SDK with its capture/init surface', () => {
      const { mod, Sentry } = loadInitialized();
      // esModuleInterop wraps the namespace, so assert the surface is the same
      // SDK rather than strict object identity.
      expect(mod.Sentry.captureException).toBe(Sentry.captureException);
      expect(mod.Sentry.init).toBe(Sentry.init);
      expect(typeof mod.Sentry.withScope).toBe('function');
    });
  });
});
