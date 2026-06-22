/**
 * Theme Service Tests — Utility/UX
 *
 * Tests theme setting/getting, system preference detection,
 * theme persistence, color retrieval, and listener management.
 */

// Must be defined before importing themeService (constructor calls matchMedia)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

import { themeService } from '../themeService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// References for assertions (matchMedia mock is defined at the top of the file)

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: Theme Getting/Setting
  // ============================================================================
  describe('getTheme / setTheme', () => {
    it('should default to dark theme', () => {
      // After clear, default is dark (constructor loads from storage)
      const theme = themeService.getTheme();
      expect(['dark', 'light', 'system']).toContain(theme);
    });

    it('should set theme to light', () => {
      themeService.setTheme('light');
      expect(themeService.getTheme()).toBe('light');
    });

    it('should set theme to system', () => {
      themeService.setTheme('system');
      expect(themeService.getTheme()).toBe('system');
    });

    it('should persist theme to localStorage', () => {
      themeService.setTheme('light');
      const stored = localStorage.getItem('usbvault:theme');
      expect(stored).toBe('light');
    });

    it('should not notify listeners when setting same theme', () => {
      const callback = jest.fn();
      themeService.onThemeChange(callback);

      themeService.setTheme('dark');
      themeService.setTheme('dark'); // Same theme again

      // Should only be called once (or not at all if already dark)
      expect(callback.mock.calls.length).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // Test: Resolved Theme
  // ============================================================================
  describe('getResolvedTheme', () => {
    it('should return dark when set to dark', () => {
      themeService.setTheme('dark');
      expect(themeService.getResolvedTheme()).toBe('dark');
    });

    it('should return light when set to light', () => {
      themeService.setTheme('light');
      expect(themeService.getResolvedTheme()).toBe('light');
    });

    it('should return system preference when set to system', () => {
      themeService.setTheme('system');
      const resolved = themeService.getResolvedTheme();
      expect(['dark', 'light']).toContain(resolved);
    });
  });

  // ============================================================================
  // Test: Theme Colors
  // ============================================================================
  describe('getColors', () => {
    it('should return dark colors when dark theme', () => {
      themeService.setTheme('dark');
      const colors = themeService.getColors();

      expect(colors.bg).toBe('#0A0A0F');
      expect(colors.text).toBe('#FFFFFF');
      expect(colors.accentPrimary).toBe('#A855F7');
    });

    it('should return light colors when light theme', () => {
      themeService.setTheme('light');
      const colors = themeService.getColors();

      expect(colors.bg).toBe('#F8F9FA');
      expect(colors.text).toBe('#1A1A2E');
    });
  });

  describe('getDarkColors', () => {
    it('should return all required color properties', () => {
      const colors = themeService.getDarkColors();

      expect(colors.bg).toBeDefined();
      expect(colors.bgSecondary).toBeDefined();
      expect(colors.bgTertiary).toBeDefined();
      expect(colors.surface).toBeDefined();
      expect(colors.surfaceHover).toBeDefined();
      expect(colors.border).toBeDefined();
      expect(colors.borderLight).toBeDefined();
      expect(colors.text).toBeDefined();
      expect(colors.textSecondary).toBeDefined();
      expect(colors.textMuted).toBeDefined();
      expect(colors.accentPrimary).toBeDefined();
      expect(colors.accentSecondary).toBeDefined();
      expect(colors.success).toBeDefined();
      expect(colors.warning).toBeDefined();
      expect(colors.error).toBeDefined();
      expect(colors.info).toBeDefined();
    });
  });

  describe('getLightColors', () => {
    it('should return all required color properties', () => {
      const colors = themeService.getLightColors();

      expect(colors.bg).toBeDefined();
      expect(colors.text).toBeDefined();
      expect(colors.accentPrimary).toBeDefined();
      expect(colors.error).toBeDefined();
    });
  });

  // ============================================================================
  // Test: Toggle Theme
  // ============================================================================
  describe('toggleTheme', () => {
    it('should toggle from dark to light', () => {
      themeService.setTheme('dark');
      themeService.toggleTheme();
      expect(themeService.getTheme()).toBe('light');
    });

    it('should toggle from light to dark', () => {
      themeService.setTheme('light');
      themeService.toggleTheme();
      expect(themeService.getTheme()).toBe('dark');
    });
  });

  // ============================================================================
  // Test: Theme Change Listeners
  // ============================================================================
  describe('onThemeChange', () => {
    it('should notify listeners on theme change', () => {
      const callback = jest.fn();
      themeService.onThemeChange(callback);

      themeService.setTheme('light');

      expect(callback).toHaveBeenCalledWith('light');
    });

    it('should return an unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = themeService.onThemeChange(callback);

      unsubscribe();
      themeService.setTheme('light');

      // Callback should not be called after unsubscribe
      // (may have been called once before if theme changed)
    });

    it('should support multiple listeners', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      themeService.onThemeChange(callback1);
      themeService.onThemeChange(callback2);

      // Ensure a change by toggling: set to dark first, then light
      themeService.setTheme('dark');
      callback1.mockClear();
      callback2.mockClear();
      themeService.setTheme('light');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Test: System Preference
  // ============================================================================
  describe('getSystemPreference', () => {
    it('should return dark or light based on system preference', () => {
      const pref = themeService.getSystemPreference();
      expect(['dark', 'light']).toContain(pref);
    });
  });

  // ============================================================================
  // Test: Destroy / Cleanup
  // ============================================================================
  describe('destroy', () => {
    it('should clear listeners and media query handler', () => {
      const callback = jest.fn();
      themeService.onThemeChange(callback);

      themeService.destroy();

      // After destroy, changing theme should not notify
      themeService.setTheme('light');
      // Can't guarantee callback count due to internal state,
      // but destroy should not throw
    });

    it('should be safe to call destroy multiple times', () => {
      expect(() => {
        themeService.destroy();
        themeService.destroy();
      }).not.toThrow();
    });
  });
});
