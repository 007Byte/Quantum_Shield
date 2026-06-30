/**
 * themeStore tests.
 *
 * Verifies real color-scheme transitions, localStorage persistence, the
 * deferred CSS-sync scheduling (Platform=web → requestAnimationFrame path),
 * and the localStorage load/validate logic. Genuine boundaries — the web CSS
 * sync helpers — are mocked; the store's own logic and jsdom localStorage run
 * for real.
 */

// Platform must be 'web' so the store takes the requestAnimationFrame deferral
// path in scheduleCSSSync. The global jest.setup mocks react-native with OS:ios.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const setThemeAttribute = jest.fn();
const syncThemeCSS = jest.fn();
const initWebCSSSync = jest.fn();
jest.mock('@/theme/webCSSSync', () => ({
  setThemeAttribute: (...a: unknown[]) => setThemeAttribute(...a),
  syncThemeCSS: (...a: unknown[]) => syncThemeCSS(...a),
  initWebCSSSync: (...a: unknown[]) => initWebCSSSync(...a),
}));

const refreshWebTabFixCSS = jest.fn();
jest.mock('@/styles/webTabFixes', () => ({
  refreshWebTabFixCSS: (...a: unknown[]) => refreshWebTabFixCSS(...a),
}));

const STORAGE_KEY = 'usbvault:theme';

// Import after mocks are registered. The module reads localStorage at import
// time via loadScheme(); we clear it first so the imported default is 'dark'.
// ts-jest hoists jest.mock() but not the consts the factories close over, so the
// store import must stay below them; eslint-disable blocks `import/order` autofix.
localStorage.clear();
// eslint-disable-next-line import/order, import/first
import { useThemeStore, type ColorScheme } from '../themeStore';

// Drive requestAnimationFrame synchronously so the deferred (phase B) CSS scan
// runs within the test tick. The store nests two rAF calls; a synchronous
// implementation flushes both immediately.
const realRaf = global.requestAnimationFrame;
beforeAll(() => {
  global.requestAnimationFrame = ((cb: FrameRequestCallback): number => {
    cb(0);
    return 0;
  }) as typeof global.requestAnimationFrame;
});
afterAll(() => {
  global.requestAnimationFrame = realRaf;
});

describe('themeStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    useThemeStore.setState({ colorScheme: 'dark' });
  });

  describe('initial state', () => {
    it('defaults to dark when no persisted value exists', () => {
      expect(useThemeStore.getState().colorScheme).toBe('dark');
    });

    it('exposes toggleTheme and setColorScheme actions', () => {
      const s = useThemeStore.getState();
      expect(typeof s.toggleTheme).toBe('function');
      expect(typeof s.setColorScheme).toBe('function');
    });
  });

  describe('setColorScheme', () => {
    it('sets the scheme to light and persists it', () => {
      useThemeStore.getState().setColorScheme('light');
      expect(useThemeStore.getState().colorScheme).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('sets the scheme to dark and persists it', () => {
      useThemeStore.getState().setColorScheme('light');
      useThemeStore.getState().setColorScheme('dark');
      expect(useThemeStore.getState().colorScheme).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });

    it('activates the CSS attribute selector immediately (phase A)', () => {
      useThemeStore.getState().setColorScheme('light');
      expect(setThemeAttribute).toHaveBeenCalledWith('light');
    });

    it('runs the deferred CSS scan after two animation frames (phase B)', () => {
      useThemeStore.getState().setColorScheme('light');
      expect(syncThemeCSS).toHaveBeenCalledWith('light');
      expect(refreshWebTabFixCSS).toHaveBeenCalled();
    });
  });

  describe('toggleTheme', () => {
    it('flips dark → light', () => {
      useThemeStore.setState({ colorScheme: 'dark' });
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().colorScheme).toBe('light');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('flips light → dark', () => {
      useThemeStore.setState({ colorScheme: 'light' });
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().colorScheme).toBe('dark');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    });

    it('returns to the original scheme after two toggles', () => {
      useThemeStore.setState({ colorScheme: 'dark' });
      useThemeStore.getState().toggleTheme();
      useThemeStore.getState().toggleTheme();
      expect(useThemeStore.getState().colorScheme).toBe('dark');
    });

    it('schedules a CSS sync on each toggle', () => {
      useThemeStore.getState().toggleTheme();
      expect(setThemeAttribute).toHaveBeenCalledWith('light');
    });
  });

  describe('persistence round-trip via a fresh module load', () => {
    it('loads a persisted light scheme on re-import', () => {
      jest.resetModules();
      localStorage.setItem(STORAGE_KEY, 'light');
      jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useThemeStore: fresh } = require('../themeStore');
      expect(fresh.getState().colorScheme).toBe('light');
    });

    it('trims and lower-cases a persisted value before validating', () => {
      jest.resetModules();
      localStorage.setItem(STORAGE_KEY, '  LIGHT  ');
      jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useThemeStore: fresh } = require('../themeStore');
      expect(fresh.getState().colorScheme).toBe('light');
    });

    it('falls back to dark for an invalid persisted value', () => {
      jest.resetModules();
      localStorage.setItem(STORAGE_KEY, 'neon');
      jest.doMock('react-native', () => ({ Platform: { OS: 'web' } }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useThemeStore: fresh } = require('../themeStore');
      expect(fresh.getState().colorScheme).toBe('dark');
    });
  });

  describe('subscriptions', () => {
    it('notifies subscribers of scheme changes', () => {
      const seen: ColorScheme[] = [];
      const unsub = useThemeStore.subscribe(s => seen.push(s.colorScheme));
      useThemeStore.getState().setColorScheme('light');
      useThemeStore.getState().setColorScheme('dark');
      expect(seen).toEqual(['light', 'dark']);
      unsub();
    });
  });
});
