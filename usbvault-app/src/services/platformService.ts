import { Platform, Dimensions } from 'react-native';
import { logger } from '@/utils/logger';

export interface PlatformInfo {
  os: 'ios' | 'android' | 'web' | 'windows' | 'macos' | 'linux';
  version: string;
  isWeb: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isTablet: boolean;
  screenSize: {
    width: number;
    height: number;
    scale: number;
  };
}

export interface AccessibilitySettings {
  reduceMotion: boolean;
  screenReader: boolean;
  boldText: boolean;
  highContrast: boolean;
}

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

class PlatformService {
  private platformInfo: PlatformInfo | null = null;
  private accessibilitySettings: AccessibilitySettings | null = null;

  triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'): void {
    try {
      if (Platform.OS === 'ios') {
        // iOS haptic feedback stub
        // In a real implementation, this would use expo-haptics
        // import { Haptics } from 'expo';
        // const hapticMap = {
        //   'light': Haptics.ImpactFeedbackStyle.Light,
        //   'medium': Haptics.ImpactFeedbackStyle.Medium,
        //   'heavy': Haptics.ImpactFeedbackStyle.Heavy,
        // };
        logger.debug(`[Haptic] iOS ${type} feedback`);
      } else if (Platform.OS === 'android') {
        // Android haptic feedback stub
        // In a real implementation, this would use react-native's
        // Vibration API with appropriate durations
        // Vibration.vibrate(duration);
        const durationMap: Record<string, number> = {
          light: 10,
          medium: 30,
          heavy: 50,
          success: 100,
          warning: 80,
          error: 150,
        };
        logger.debug(`[Haptic] Android ${type} feedback (${durationMap[type]}ms)`);
      } else {
        // Web platform - no native haptics
        logger.debug(`[Haptic] Web platform does not support haptics`);
      }
    } catch (error) {
      logger.error('Haptic feedback failed:', error);
    }
  }

  triggerRipple(x: number, y: number, color: string = '#A855F7'): void {
    try {
      if (Platform.OS === 'android') {
        // Android material ripple feedback stub
        // In a real implementation, this would trigger a visual ripple
        // using Platform.select() with native Android RippleDrawable
        logger.debug(`[Ripple] Android material ripple at (${x}, ${y}) with color ${color}`);
      } else {
        // iOS and web - simulate with opacity animation or native feedback
        logger.debug(`[Ripple] Platform ${Platform.OS} ripple at (${x}, ${y})`);
      }
    } catch (error) {
      logger.error('Ripple feedback failed:', error);
    }
  }

  getPlatformInfo(): PlatformInfo {
    if (this.platformInfo) {
      return this.platformInfo;
    }

    const isWeb = Platform.OS === 'web';
    const isIOS = Platform.OS === 'ios';
    const isAndroid = Platform.OS === 'android';
    const { width, height, scale } = Dimensions.get('window');

    // Determine if device is mobile or tablet based on screen size
    const isMobile = width < 768 && Platform.OS !== 'web';
    const isTablet = width >= 768;

    // Get OS version
    let os: PlatformInfo['os'] = 'web';
    let version = '0.0.0';

    if (isIOS) {
      os = 'ios';
      // In real implementation: get from Platform.Version
      version = `${Platform.Version || '14.0'}`;
    } else if (isAndroid) {
      os = 'android';
      // In real implementation: get from Platform.Version
      version = `${Platform.Version || '11'}`;
    } else if (isWeb) {
      // Detect web OS from user agent
      if (typeof navigator !== 'undefined') {
        const ua = navigator.userAgent;
        if (ua.includes('Windows')) os = 'windows';
        else if (ua.includes('Mac')) os = 'macos';
        else if (ua.includes('Linux')) os = 'linux';
        // Get browser version or use generic web version
        const versionMatch = ua.match(/Version\/(\d+\.\d+)/);
        version = versionMatch ? versionMatch[1] : '1.0.0';
      }
    }

    this.platformInfo = {
      os,
      version,
      isWeb,
      isIOS,
      isAndroid,
      isMobile,
      isTablet,
      screenSize: {
        width,
        height,
        scale,
      },
    };

    return this.platformInfo;
  }

  getAccessibilityInfo(): AccessibilitySettings {
    if (this.accessibilitySettings) {
      return this.accessibilitySettings;
    }

    // Initialize with defaults
    this.accessibilitySettings = {
      reduceMotion: false,
      screenReader: false,
      boldText: false,
      highContrast: false,
    };

    // Check for accessibility settings on web
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        // Check prefers-reduced-motion
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        this.accessibilitySettings.reduceMotion = prefersReducedMotion.matches;

        // Check prefers-color-scheme for potential high contrast
        const prefersHighContrast = window.matchMedia('(prefers-contrast: more)');
        this.accessibilitySettings.highContrast = prefersHighContrast.matches;

        // Check if screen reader is likely active
        // This is a heuristic - accurate detection is difficult
        const hasAriaLive = document.querySelector('[aria-live]') !== null;
        if (hasAriaLive) {
          this.accessibilitySettings.screenReader = true;
        }
      } catch (error) {
        logger.error('Error detecting accessibility settings:', error);
      }
    }

    return this.accessibilitySettings;
  }

  adjustForPlatform(styles: Record<string, any>): Record<string, any> {
    const adjusted = { ...styles };
    const platform = this.getPlatformInfo();
    const accessibility = this.getAccessibilityInfo();

    // Adjust for reduced motion preference
    if (accessibility.reduceMotion) {
      if (adjusted.animation) {
        adjusted.animation = null;
      }
      if (adjusted.transition) {
        adjusted.transition = null;
      }
    }

    // Adjust for platform-specific rendering
    if (platform.isIOS) {
      // iOS specific adjustments
      if (adjusted.fontFamily === 'System') {
        adjusted.fontFamily = '-apple-system';
      }
      // iOS uses different shadow model
      if (adjusted.shadowColor) {
        adjusted.shadowOpacity = 0.3;
        adjusted.shadowRadius = 3;
        adjusted.shadowOffset = { width: 0, height: 2 };
      }
    } else if (platform.isAndroid) {
      // Android specific adjustments
      if (adjusted.fontFamily === 'System') {
        adjusted.fontFamily = 'Roboto';
      }
      // Android uses elevation for shadows
      if (adjusted.shadowColor) {
        adjusted.elevation = 4;
      }
    } else if (platform.isWeb) {
      // Web specific adjustments
      if (adjusted.fontFamily === 'System') {
        adjusted.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
      }
    }

    // Adjust font sizes for accessibility
    if (accessibility.boldText) {
      adjusted.fontWeight = 'bold';
    }

    // Adjust colors for high contrast
    if (accessibility.highContrast) {
      // Increase contrast of text
      if (adjusted.color === '#B0B0B0') {
        adjusted.color = '#E0E0E0';
      }
    }

    return adjusted;
  }

  getKeyboardModifier(): 'Ctrl' | 'Cmd' {
    const platform = this.getPlatformInfo();

    if (platform.os === 'macos' || platform.isIOS) {
      return 'Cmd';
    }

    return 'Ctrl';
  }

  supportsTouchID(): boolean {
    // TouchID is available on iOS devices
    if (Platform.OS === 'ios') {
      // In real implementation, check device capability
      // using native modules or Expo APIs
      return true;
    }
    return false;
  }

  supportsFaceID(): boolean {
    // FaceID is available on newer iOS devices
    if (Platform.OS === 'ios') {
      // In real implementation, check device model and iOS version
      // FaceID requires iPhone X or later with iOS 11+
      return true;
    }
    return false;
  }

  getStatusBarHeight(): number {
    const platform = this.getPlatformInfo();

    if (platform.isIOS) {
      // Check if notched device (iPhone X+)
      if (typeof window !== 'undefined') {
        const bottomInset = this.getSafeAreaInsets().top;
        // Notched devices have status bar height of 44+
        return bottomInset > 20 ? 44 : 20;
      }
      return 20;
    } else if (platform.isAndroid) {
      // Standard Android status bar height is 24-25dp (typically)
      return 24;
    }

    return 0;
  }

  getSafeAreaInsets(): SafeAreaInsets {
    // Default safe area (no notch)
    let insets: SafeAreaInsets = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    };

    if (Platform.OS === 'ios') {
      // iOS notched devices have larger top insets
      // This is typically provided by react-native-safe-area-context
      // For now, return estimated values
      insets.top = this.getStatusBarHeight();
      insets.bottom = 24; // Home indicator on notched devices
    } else if (Platform.OS === 'android') {
      // Android status bar
      insets.top = this.getStatusBarHeight();
      // Navigation bar (only if not gesture navigation)
      insets.bottom = 48;
    } else if (Platform.OS === 'web') {
      // Web typically doesn't need safe area adjustments
      insets = { top: 0, bottom: 0, left: 0, right: 0 };
    }

    return insets;
  }

  isLandscape(): boolean {
    const { width, height } = Dimensions.get('window');
    return width > height;
  }

  getDeviceCategory(): 'phone' | 'tablet' | 'desktop' {
    const platform = this.getPlatformInfo();
    const { width } = Dimensions.get('window');

    // For Android and iOS
    if (platform.isAndroid || platform.isIOS) {
      if (width >= 768) {
        return 'tablet';
      }
      return 'phone';
    }

    // For web - use screen width
    if (width >= 1024) {
      return 'desktop';
    } else if (width >= 768) {
      return 'tablet';
    }

    return 'phone';
  }

  /**
   * Reset cached platform info (useful for testing or when device state changes)
   */
  resetCache(): void {
    this.platformInfo = null;
    this.accessibilitySettings = null;
  }

  /**
   * Get detailed system information (web only)
   */
  getWebSystemInfo(): {
    userAgent: string;
    language: string;
    timezone: string;
    hardwareConcurrency: number;
    deviceMemory?: number;
  } | null {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
      return null;
    }

    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hardwareConcurrency: navigator.hardwareConcurrency || 1,
      deviceMemory: (navigator as any).deviceMemory,
    };
  }
}

export const platformService = new PlatformService();
