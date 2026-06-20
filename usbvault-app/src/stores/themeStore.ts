import { create } from 'zustand';
import { Platform } from 'react-native';
import { setThemeAttribute, syncThemeCSS, initWebCSSSync } from '@/theme/webCSSSync';
import { refreshWebTabFixCSS } from '@/styles/webTabFixes';

export type ColorScheme = 'dark' | 'light';

const STORAGE_KEY = 'usbvault:theme';

/**
 * Schedule CSS sync after React has flushed its render.
 * Phase A (immediate): set data-theme attribute so CSS selectors activate instantly.
 * Phase B (deferred): scan RNW atomic classes after React paints the new theme.
 */
function scheduleCSSSync(scheme: ColorScheme): void {
  // Phase A — immediate: CSS attribute selectors activate now
  setThemeAttribute(scheme);

  // Phase B — deferred: scan after React's render + browser paint
  if (Platform.OS === 'web' && typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncThemeCSS(scheme);
        refreshWebTabFixCSS();
      });
    });
  } else {
    syncThemeCSS(scheme);
  }
}

function loadScheme(): ColorScheme {
  if (typeof localStorage === 'undefined') return 'dark';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // Trim whitespace and validate before returning
    if (raw) {
      const trimmed = raw.trim().toLowerCase();
      if (trimmed === 'light' || trimmed === 'dark') return trimmed as ColorScheme;
    }
  } catch {
    // localStorage not available
  }
  return 'dark';
}

function persistScheme(scheme: ColorScheme): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, scheme);
  } catch {
    // localStorage not available
  }
}

interface ThemeState {
  colorScheme: ColorScheme;
  toggleTheme: () => void;
  setColorScheme: (scheme: ColorScheme) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  colorScheme: loadScheme(),

  toggleTheme: () => {
    const next = get().colorScheme === 'dark' ? 'light' : 'dark';
    persistScheme(next);
    set({ colorScheme: next });
    scheduleCSSSync(next);
  },

  setColorScheme: (scheme: ColorScheme) => {
    persistScheme(scheme);
    set({ colorScheme: scheme });
    scheduleCSSSync(scheme);
  },
}));

// Run initial CSS sync after first render cycle
initWebCSSSync(() => useThemeStore.getState().colorScheme);
