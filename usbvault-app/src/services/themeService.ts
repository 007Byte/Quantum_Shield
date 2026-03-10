import { Platform } from 'react-native';

export type Theme = 'dark' | 'light' | 'system';

export interface ThemeColors {
  bg: string;
  bgSecondary: string;
  bgTertiary: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderLight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accentPrimary: string;
  accentSecondary: string;
  success: string;
  warning: string;
  error: string;
  info: string;
}

type ThemeChangeCallback = (theme: 'dark' | 'light') => void;

class ThemeService {
  private currentTheme: Theme = 'dark';
  private listeners: Set<ThemeChangeCallback> = new Set();
  private systemPreference: 'dark' | 'light' = 'dark';
  // PL-026: Store references for proper cleanup
  private _mediaQuery: MediaQueryList | null = null;
  private _mediaQueryHandler: ((e: MediaQueryListEvent) => void) | null = null;

  constructor() {
    this.loadFromStorage();
    this.detectSystemPreference();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('usbvault:theme');
      if (stored && ['dark', 'light', 'system'].includes(stored)) {
        this.currentTheme = stored as Theme;
      }
    } catch (error) {
      console.error('Failed to load theme from storage:', error);
      this.currentTheme = 'dark';
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('usbvault:theme', this.currentTheme);
    } catch (error) {
      console.error('Failed to save theme to storage:', error);
    }
  }

  private detectSystemPreference(): void {
    // On web platform, check for system preference
    if (Platform.OS === 'web') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        this.systemPreference = 'dark';
      } else {
        this.systemPreference = 'light';
      }

      // PL-026: Remove previous listener before adding new one to prevent accumulation
      if (this._mediaQuery && this._mediaQueryHandler) {
        this._mediaQuery.removeEventListener('change', this._mediaQueryHandler);
      }

      // Listen for system preference changes
      this._mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this._mediaQueryHandler = (e: MediaQueryListEvent) => {
        this.systemPreference = e.matches ? 'dark' : 'light';
        this.notifyListeners();
      };

      if (this._mediaQuery.addEventListener) {
        this._mediaQuery.addEventListener('change', this._mediaQueryHandler);
      }
    }
  }

  /**
   * PL-026: Clean up mediaQuery listener to prevent memory leaks.
   * Call during app unmount or logout.
   */
  destroy(): void {
    if (this._mediaQuery && this._mediaQueryHandler) {
      this._mediaQuery.removeEventListener('change', this._mediaQueryHandler);
      this._mediaQuery = null;
      this._mediaQueryHandler = null;
    }
    this.listeners.clear();
  }

  private notifyListeners(): void {
    const resolved = this.getResolvedTheme();
    this.listeners.forEach((callback) => callback(resolved));
  }

  getTheme(): Theme {
    return this.currentTheme;
  }

  setTheme(theme: Theme): void {
    if (this.currentTheme !== theme) {
      this.currentTheme = theme;
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  getResolvedTheme(): 'dark' | 'light' {
    if (this.currentTheme === 'system') {
      return this.systemPreference;
    }
    return this.currentTheme as 'dark' | 'light';
  }

  getColors(): ThemeColors {
    const resolved = this.getResolvedTheme();
    return resolved === 'dark' ? this.getDarkColors() : this.getLightColors();
  }

  getDarkColors(): ThemeColors {
    return {
      bg: '#0A0A0F',
      bgSecondary: '#1A1A2E',
      bgTertiary: '#2A2A3E',
      surface: 'rgba(255, 255, 255, 0.05)',
      surfaceHover: 'rgba(255, 255, 255, 0.08)',
      border: 'rgba(255, 255, 255, 0.10)',
      borderLight: 'rgba(255, 255, 255, 0.05)',
      text: '#FFFFFF',
      textSecondary: '#D0D0D0',
      textMuted: '#B0B0B0',
      accentPrimary: '#A855F7',
      accentSecondary: '#06B6D4',
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
      info: '#3B82F6',
    };
  }

  getLightColors(): ThemeColors {
    return {
      bg: '#F8F9FA',
      bgSecondary: '#FFFFFF',
      bgTertiary: '#F3F4F6',
      surface: 'rgba(0, 0, 0, 0.02)',
      surfaceHover: 'rgba(0, 0, 0, 0.04)',
      border: 'rgba(0, 0, 0, 0.10)',
      borderLight: 'rgba(0, 0, 0, 0.05)',
      text: '#1A1A2E',
      textSecondary: '#4B5563',
      textMuted: '#6B7280',
      accentPrimary: '#7C3AED',
      accentSecondary: '#0891B2',
      success: '#059669',
      warning: '#D97706',
      error: '#DC2626',
      info: '#2563EB',
    };
  }

  toggleTheme(): void {
    const current = this.getResolvedTheme();
    this.setTheme(current === 'dark' ? 'light' : 'dark');
  }

  onThemeChange(callback: ThemeChangeCallback): () => void {
    this.listeners.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  getSystemPreference(): 'dark' | 'light' {
    return this.systemPreference;
  }
}

export const themeService = new ThemeService();
