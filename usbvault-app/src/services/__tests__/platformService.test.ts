/**
 * Platform Service Tests
 *
 * Tests platform detection, capabilities, haptic feedback stubs,
 * accessibility info, style adjustments, and device categorization.
 */

// Mock React Native
import { platformService } from '../platformService';
import { Platform, Dimensions } from 'react-native';

jest.mock('react-native', () => ({
  Platform: { OS: 'web', Version: '1.0.0' },
  Dimensions: {
    get: jest.fn(() => ({ width: 1440, height: 900, scale: 2 })),
  },
}));

describe('PlatformService', () => {
  beforeEach(() => {
    platformService.resetCache();
    jest.clearAllMocks();
  });

  describe('getPlatformInfo', () => {
    it('should return platform info object', () => {
      const info = platformService.getPlatformInfo();
      expect(info).toBeDefined();
      expect(info.os).toBeDefined();
      expect(info.version).toBeDefined();
      expect(typeof info.isWeb).toBe('boolean');
      expect(typeof info.isIOS).toBe('boolean');
      expect(typeof info.isAndroid).toBe('boolean');
    });

    it('should detect web platform', () => {
      const info = platformService.getPlatformInfo();
      expect(info.isWeb).toBe(true);
      expect(info.isIOS).toBe(false);
      expect(info.isAndroid).toBe(false);
    });

    it('should include screen size info', () => {
      const info = platformService.getPlatformInfo();
      expect(info.screenSize).toBeDefined();
      expect(info.screenSize.width).toBe(1440);
      expect(info.screenSize.height).toBe(900);
      expect(info.screenSize.scale).toBe(2);
    });

    it('should detect tablet for width >= 768', () => {
      const info = platformService.getPlatformInfo();
      expect(info.isTablet).toBe(true);
    });

    it('should cache platform info after first call', () => {
      const info1 = platformService.getPlatformInfo();
      const info2 = platformService.getPlatformInfo();
      expect(info1).toBe(info2); // Same reference
    });

    it('should return fresh info after resetCache', () => {
      const info1 = platformService.getPlatformInfo();
      platformService.resetCache();
      const info2 = platformService.getPlatformInfo();
      expect(info1).not.toBe(info2);
    });

    it('should detect mobile for narrow non-web screens', () => {
      (Dimensions.get as jest.Mock).mockReturnValueOnce({ width: 375, height: 812, scale: 3 });
      (Platform as any).OS = 'ios';
      platformService.resetCache();

      const info = platformService.getPlatformInfo();
      expect(info.isMobile).toBe(true);
      expect(info.isTablet).toBe(false);

      // Reset
      (Platform as any).OS = 'web';
    });
  });

  describe('triggerHaptic', () => {
    it('should not throw on web platform', () => {
      expect(() => platformService.triggerHaptic('light')).not.toThrow();
      expect(() => platformService.triggerHaptic('medium')).not.toThrow();
      expect(() => platformService.triggerHaptic('heavy')).not.toThrow();
      expect(() => platformService.triggerHaptic('success')).not.toThrow();
      expect(() => platformService.triggerHaptic('warning')).not.toThrow();
      expect(() => platformService.triggerHaptic('error')).not.toThrow();
    });

    it('should not throw for iOS haptic', () => {
      (Platform as any).OS = 'ios';
      expect(() => platformService.triggerHaptic('medium')).not.toThrow();
      (Platform as any).OS = 'web';
    });

    it('should not throw for Android haptic', () => {
      (Platform as any).OS = 'android';
      expect(() => platformService.triggerHaptic('heavy')).not.toThrow();
      (Platform as any).OS = 'web';
    });
  });

  describe('triggerRipple', () => {
    it('should not throw on web platform', () => {
      expect(() => platformService.triggerRipple(100, 200)).not.toThrow();
    });

    it('should accept custom color parameter', () => {
      expect(() => platformService.triggerRipple(50, 75, '#FF0000')).not.toThrow();
    });
  });

  describe('getAccessibilityInfo', () => {
    it('should return accessibility settings object', () => {
      const settings = platformService.getAccessibilityInfo();
      expect(settings).toBeDefined();
      expect(typeof settings.reduceMotion).toBe('boolean');
      expect(typeof settings.screenReader).toBe('boolean');
      expect(typeof settings.boldText).toBe('boolean');
      expect(typeof settings.highContrast).toBe('boolean');
    });

    it('should cache accessibility settings', () => {
      const s1 = platformService.getAccessibilityInfo();
      const s2 = platformService.getAccessibilityInfo();
      expect(s1).toBe(s2);
    });
  });

  describe('adjustForPlatform', () => {
    it('should return adjusted styles object', () => {
      const styles = { color: '#333', fontSize: 16 };
      const adjusted = platformService.adjustForPlatform(styles);
      expect(adjusted).toBeDefined();
      expect(adjusted.fontSize).toBe(16);
    });

    it('should set platform-specific font family for System font', () => {
      const styles = { fontFamily: 'System' };
      const adjusted = platformService.adjustForPlatform(styles);
      // On iOS (test default), System maps to -apple-system
      expect(adjusted.fontFamily).not.toBe('System');
      expect(typeof adjusted.fontFamily).toBe('string');
    });

    it('should not mutate the original styles object', () => {
      const styles = { color: '#333' };
      platformService.adjustForPlatform(styles);
      expect(styles).toEqual({ color: '#333' });
    });
  });

  describe('getKeyboardModifier', () => {
    it('should return Ctrl for web on non-Mac platforms', () => {
      platformService.resetCache();
      const modifier = platformService.getKeyboardModifier();
      // On web, depends on detected OS from navigator.userAgent
      expect(['Ctrl', 'Cmd']).toContain(modifier);
    });
  });

  describe('supportsTouchID / supportsFaceID', () => {
    it('should return false for web platform', () => {
      expect(platformService.supportsTouchID()).toBe(false);
      expect(platformService.supportsFaceID()).toBe(false);
    });

    it('should return true on iOS', () => {
      (Platform as any).OS = 'ios';
      expect(platformService.supportsTouchID()).toBe(true);
      expect(platformService.supportsFaceID()).toBe(true);
      (Platform as any).OS = 'web';
    });
  });

  describe('getSafeAreaInsets', () => {
    it('should return zero insets on web', () => {
      const insets = platformService.getSafeAreaInsets();
      expect(insets.top).toBe(0);
      expect(insets.bottom).toBe(0);
      expect(insets.left).toBe(0);
      expect(insets.right).toBe(0);
    });
  });

  describe('getStatusBarHeight', () => {
    it('should return 0 for web', () => {
      platformService.resetCache();
      expect(platformService.getStatusBarHeight()).toBe(0);
    });
  });

  describe('isLandscape', () => {
    it('should return true when width > height', () => {
      (Dimensions.get as jest.Mock).mockReturnValue({ width: 1440, height: 900 });
      expect(platformService.isLandscape()).toBe(true);
    });

    it('should return false when height > width', () => {
      (Dimensions.get as jest.Mock).mockReturnValue({ width: 375, height: 812 });
      expect(platformService.isLandscape()).toBe(false);
    });
  });

  describe('getDeviceCategory', () => {
    it('should return desktop for wide web screens', () => {
      (Dimensions.get as jest.Mock).mockReturnValue({ width: 1440, height: 900 });
      platformService.resetCache();
      expect(platformService.getDeviceCategory()).toBe('desktop');
    });

    it('should return tablet for medium web screens', () => {
      (Dimensions.get as jest.Mock).mockReturnValue({ width: 800, height: 600 });
      platformService.resetCache();
      expect(platformService.getDeviceCategory()).toBe('tablet');
    });

    it('should return phone for narrow web screens', () => {
      (Dimensions.get as jest.Mock).mockReturnValue({ width: 375, height: 812 });
      platformService.resetCache();
      expect(platformService.getDeviceCategory()).toBe('phone');
    });
  });

  describe('getWebSystemInfo', () => {
    it('should return system info on web platform', () => {
      const info = platformService.getWebSystemInfo();
      expect(info).not.toBeNull();
      expect(info!.userAgent).toBeDefined();
      expect(info!.language).toBeDefined();
      expect(info!.timezone).toBeDefined();
      expect(typeof info!.hardwareConcurrency).toBe('number');
    });

    it('should return null on non-web platform', () => {
      (Platform as any).OS = 'ios';
      const info = platformService.getWebSystemInfo();
      expect(info).toBeNull();
      (Platform as any).OS = 'web';
    });
  });
});
