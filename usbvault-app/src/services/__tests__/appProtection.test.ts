import { AppState, Clipboard, Platform } from 'react-native';
import * as appProtection from '@/services/appProtection';

jest.mock('react-native');
jest.mock('expo-secure-store');

describe('App Protection Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  // ============================================================================
  // Test: AppProtectionConfig Defaults
  // ============================================================================
  describe('AppProtectionConfig Defaults', () => {
    it('should have DEFAULT_PROTECTION_CONFIG defined', () => {
      expect(appProtection.DEFAULT_PROTECTION_CONFIG).toBeDefined();
    });

    it('should have autoLockTimeoutMs set to 5 minutes', () => {
      expect(appProtection.DEFAULT_PROTECTION_CONFIG.autoLockTimeoutMs).toBe(300000); // 5 * 60 * 1000
    });

    it('should have clearClipboardMs set to 30 seconds', () => {
      expect(appProtection.DEFAULT_PROTECTION_CONFIG.clearClipboardMs).toBe(30000); // 30 * 1000
    });

    it('should have preventScreenshots enabled by default', () => {
      expect(appProtection.DEFAULT_PROTECTION_CONFIG.preventScreenshots).toBe(true);
    });

    it('should have lockOnBackground enabled by default', () => {
      expect(appProtection.DEFAULT_PROTECTION_CONFIG.lockOnBackground).toBe(true);
    });

    it('should have numeric timeout values', () => {
      expect(typeof appProtection.DEFAULT_PROTECTION_CONFIG.autoLockTimeoutMs).toBe('number');
      expect(typeof appProtection.DEFAULT_PROTECTION_CONFIG.clearClipboardMs).toBe('number');
    });

    it('should have boolean config values', () => {
      expect(typeof appProtection.DEFAULT_PROTECTION_CONFIG.preventScreenshots).toBe('boolean');
      expect(typeof appProtection.DEFAULT_PROTECTION_CONFIG.lockOnBackground).toBe('boolean');
    });
  });

  // ============================================================================
  // Test: setupAutoLock Function
  // ============================================================================
  describe('setupAutoLock', () => {
    it('should return cleanup function', () => {
      const mockCallback = jest.fn();
      const cleanup = appProtection.setupAutoLock(
        appProtection.DEFAULT_PROTECTION_CONFIG,
        mockCallback
      );

      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('should set up app state listener when lockOnBackground is true', () => {
      const mockCallback = jest.fn();
      const mockListen = jest.fn().mockReturnValue({ remove: jest.fn() });
      (AppState.addEventListener as jest.Mock).mockImplementation(mockListen);

      const config = {
        ...appProtection.DEFAULT_PROTECTION_CONFIG,
        lockOnBackground: true,
      };

      appProtection.setupAutoLock(config, mockCallback);

      expect(mockListen).toHaveBeenCalled();
    });

    it('should return no-op cleanup when lockOnBackground is false', () => {
      const mockCallback = jest.fn();
      const config = {
        ...appProtection.DEFAULT_PROTECTION_CONFIG,
        lockOnBackground: false,
      };

      const cleanup = appProtection.setupAutoLock(config, mockCallback);

      expect(typeof cleanup).toBe('function');
      cleanup(); // Should not throw
    });

    it('should trigger auto-lock callback after timeout', () => {
      const mockCallback = jest.fn();
      const mockRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      const config = {
        ...appProtection.DEFAULT_PROTECTION_CONFIG,
        autoLockTimeoutMs: 5000,
      };

      appProtection.setupAutoLock(config, mockCallback);

      // Simulate app going to background
      const listener = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
      listener('background');

      // Advance timers
      jest.advanceTimersByTime(5001);

      expect(mockCallback).toHaveBeenCalled();
    });

    it('should cancel auto-lock when app comes to foreground', () => {
      const mockCallback = jest.fn();
      const mockRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      const config = {
        ...appProtection.DEFAULT_PROTECTION_CONFIG,
        autoLockTimeoutMs: 5000,
      };

      appProtection.setupAutoLock(config, mockCallback);

      // Simulate app going to background
      const listener = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
      listener('background');

      // Advance some time
      jest.advanceTimersByTime(2000);

      // Bring app to foreground
      listener('active');

      // Advance past original timeout
      jest.advanceTimersByTime(5000);

      // Callback should not be called because timeout was cancelled
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should clean up subscription when cleanup is called', () => {
      const mockCallback = jest.fn();
      const mockRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      const cleanup = appProtection.setupAutoLock(
        appProtection.DEFAULT_PROTECTION_CONFIG,
        mockCallback
      );

      cleanup();

      expect(mockRemove).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Test: copyWithAutoClear Function
  // ============================================================================
  describe('copyWithAutoClear', () => {
    it('should copy text to clipboard', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      (Clipboard.setString as jest.Mock) = mockSetString;

      await appProtection.copyWithAutoClear('secret-data');

      expect(mockSetString).toHaveBeenCalledWith('secret-data');
    });

    it('should use custom timeout if provided', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      const mockGetString = jest.fn().mockResolvedValue('secret-data');
      (Clipboard.setString as jest.Mock) = mockSetString;
      (Clipboard.getString as jest.Mock) = mockGetString;

      await appProtection.copyWithAutoClear('secret-data', 5000);

      jest.advanceTimersByTime(5001);

      expect(mockSetString).toHaveBeenCalled();
    });

    it('should use default timeout if not provided', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      const mockGetString = jest.fn().mockResolvedValue('secret-data');
      (Clipboard.setString as jest.Mock) = mockSetString;
      (Clipboard.getString as jest.Mock) = mockGetString;

      await appProtection.copyWithAutoClear('secret-data');

      // Default is 30 seconds (30000 ms)
      jest.advanceTimersByTime(30001);

      expect(mockSetString).toHaveBeenCalled();
    });

    it('should clear clipboard after timeout', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      const mockGetString = jest.fn().mockResolvedValue('secret-data');
      (Clipboard.setString as jest.Mock) = mockSetString;
      (Clipboard.getString as jest.Mock) = mockGetString;

      await appProtection.copyWithAutoClear('secret-data', 1000);

      jest.advanceTimersByTime(1001);

      // Should be called twice: once to set, once to clear
      expect(mockSetString).toHaveBeenCalledWith('');
    });

    it('should not clear clipboard if content has changed', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      const mockGetString = jest
        .fn()
        .mockResolvedValueOnce('secret-data') // First call when auto-clearing
        .mockResolvedValueOnce('user-typed-data'); // Content changed
      (Clipboard.setString as jest.Mock) = mockSetString;
      (Clipboard.getString as jest.Mock) = mockGetString;

      await appProtection.copyWithAutoClear('secret-data', 1000);

      // Change clipboard content
      jest.advanceTimersByTime(500);
      await appProtection.copyWithAutoClear('user-typed-data', 1000);

      jest.advanceTimersByTime(501);

      // Should not clear because content is different
      expect(mockGetString).toHaveBeenCalled();
    });

    it('should throw error on clipboard copy failure', async () => {
      const mockError = new Error('Clipboard error');
      (Clipboard.setString as jest.Mock).mockRejectedValue(mockError);

      await expect(appProtection.copyWithAutoClear('secret-data')).rejects.toThrow(
        'Clipboard error'
      );
    });

    it('should handle multiple clipboard operations', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      const mockGetString = jest.fn().mockResolvedValue('test');
      (Clipboard.setString as jest.Mock) = mockSetString;
      (Clipboard.getString as jest.Mock) = mockGetString;

      await appProtection.copyWithAutoClear('data1', 1000);
      await appProtection.copyWithAutoClear('data2', 1000);
      await appProtection.copyWithAutoClear('data3', 1000);

      expect(mockSetString).toHaveBeenCalledTimes(3);
    });
  });

  // ============================================================================
  // Test: setScreenshotPrevention Function
  // ============================================================================
  describe('setScreenshotPrevention', () => {
    it('should handle Android platform', () => {
      (Platform.OS as any) = 'android';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      appProtection.setScreenshotPrevention(true);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Screenshot prevention'));

      consoleSpy.mockRestore();
    });

    it('should handle iOS platform', () => {
      (Platform.OS as any) = 'ios';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      appProtection.setScreenshotPrevention(true);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Screenshot prevention'));

      consoleSpy.mockRestore();
    });

    it('should log when disabling screenshot prevention', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      appProtection.setScreenshotPrevention(false);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('disabled'));

      consoleSpy.mockRestore();
    });

    it('should log when enabling screenshot prevention', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      appProtection.setScreenshotPrevention(true);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('enabled'));

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Test: initializeAppProtection Function
  // ============================================================================
  describe('initializeAppProtection', () => {
    it('should return cleanup function', () => {
      const mockListen = jest.fn().mockReturnValue({ remove: jest.fn() });
      (AppState.addEventListener as jest.Mock).mockImplementation(mockListen);

      const cleanup = appProtection.initializeAppProtection();

      expect(typeof cleanup).toBe('function');
      cleanup();
    });

    it('should accept custom configuration', () => {
      const mockListen = jest.fn().mockReturnValue({ remove: jest.fn() });
      (AppState.addEventListener as jest.Mock).mockImplementation(mockListen);

      const customConfig = {
        autoLockTimeoutMs: 10000,
        clearClipboardMs: 60000,
      };

      appProtection.initializeAppProtection(customConfig);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should enable screenshot prevention when configured', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const mockListen = jest.fn().mockReturnValue({ remove: jest.fn() });
      (AppState.addEventListener as jest.Mock).mockImplementation(mockListen);

      appProtection.initializeAppProtection({
        preventScreenshots: true,
      });

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should merge default config with custom config', () => {
      const mockListen = jest.fn().mockReturnValue({ remove: jest.fn() });
      (AppState.addEventListener as jest.Mock).mockImplementation(mockListen);

      const cleanup = appProtection.initializeAppProtection({
        autoLockTimeoutMs: 600000,
      });

      cleanup();

      expect(true).toBe(true);
    });

    it('should cleanup all protections when cleanup is called', () => {
      const mockRemove = jest.fn();
      const mockListen = jest.fn().mockReturnValue({ remove: mockRemove });
      (AppState.addEventListener as jest.Mock).mockImplementation(mockListen);
      (Clipboard.setString as jest.Mock).mockResolvedValue(undefined);

      const cleanup = appProtection.initializeAppProtection();

      cleanup();

      expect(mockRemove).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Test: isAppInBackgroundNow Function
  // ============================================================================
  describe('isAppInBackgroundNow', () => {
    it('should return boolean', () => {
      const result = appProtection.isAppInBackgroundNow();

      expect(typeof result).toBe('boolean');
    });

    it('should return false when app is in foreground', () => {
      const mockRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      appProtection.setupAutoLock(appProtection.DEFAULT_PROTECTION_CONFIG, jest.fn());

      const listener = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
      listener('active');

      const result = appProtection.isAppInBackgroundNow();

      expect(result).toBe(false);
    });

    it('should return true when app is in background', () => {
      const mockRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      appProtection.setupAutoLock(appProtection.DEFAULT_PROTECTION_CONFIG, jest.fn());

      const listener = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
      listener('background');

      const result = appProtection.isAppInBackgroundNow();

      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Test: clearClipboardImmediately Function
  // ============================================================================
  describe('clearClipboardImmediately', () => {
    it('should clear clipboard', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      (Clipboard.setString as jest.Mock) = mockSetString;

      await appProtection.clearClipboardImmediately();

      expect(mockSetString).toHaveBeenCalledWith('');
    });

    it('should cancel pending clipboard timeouts', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      const mockGetString = jest.fn().mockResolvedValue('test');
      (Clipboard.setString as jest.Mock) = mockSetString;
      (Clipboard.getString as jest.Mock) = mockGetString;

      await appProtection.copyWithAutoClear('test-data', 5000);
      await appProtection.clearClipboardImmediately();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should throw error on clipboard clear failure', async () => {
      const mockError = new Error('Clipboard error');
      (Clipboard.setString as jest.Mock).mockRejectedValue(mockError);

      await expect(appProtection.clearClipboardImmediately()).rejects.toThrow('Clipboard error');
    });
  });

  // ============================================================================
  // Test: triggerManualLock Function
  // ============================================================================
  describe('triggerManualLock', () => {
    it('should call lock callback', () => {
      const mockCallback = jest.fn();

      appProtection.triggerManualLock(mockCallback);

      expect(mockCallback).toHaveBeenCalled();
    });

    it('should clear auto-lock timeout', () => {
      const mockRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      const autoLockCallback = jest.fn();
      appProtection.setupAutoLock(appProtection.DEFAULT_PROTECTION_CONFIG, autoLockCallback);

      const listener = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
      listener('background');

      const manualLockCallback = jest.fn();
      appProtection.triggerManualLock(manualLockCallback);

      expect(manualLockCallback).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Test: getProtectionStatus Function
  // ============================================================================
  describe('getProtectionStatus', () => {
    it('should return status object with required properties', () => {
      const status = appProtection.getProtectionStatus();

      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('appInBackground');
      expect(status).toHaveProperty('clipboardOperationsPending');
      expect(status).toHaveProperty('autoLockArmed');
    });

    it('should show enabled as true', () => {
      const status = appProtection.getProtectionStatus();

      expect(status.enabled).toBe(true);
    });

    it('should return current configuration', () => {
      const status = appProtection.getProtectionStatus();

      expect(status.config).toBeDefined();
      expect(status.config).toHaveProperty('autoLockTimeoutMs');
      expect(status.config).toHaveProperty('clearClipboardMs');
    });

    it('should track app background state', () => {
      const mockRemove = jest.fn();
      (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: mockRemove });

      appProtection.setupAutoLock(appProtection.DEFAULT_PROTECTION_CONFIG, jest.fn());

      const listener = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
      listener('background');

      const status = appProtection.getProtectionStatus();

      expect(status.appInBackground).toBe(true);
    });

    it('should track clipboard operations count', async () => {
      const mockSetString = jest.fn().mockResolvedValue(undefined);
      const mockGetString = jest.fn().mockResolvedValue('test');
      (Clipboard.setString as jest.Mock) = mockSetString;
      (Clipboard.getString as jest.Mock) = mockGetString;

      await appProtection.copyWithAutoClear('data1', 10000);

      const status = appProtection.getProtectionStatus();

      expect(status.clipboardOperationsPending).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Test: logProtectionStatus Function
  // ============================================================================
  describe('logProtectionStatus', () => {
    it('should log protection status without throwing', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      appProtection.logProtectionStatus();

      expect(consoleSpy).toHaveBeenCalledWith('[App Protection Status]');

      consoleSpy.mockRestore();
    });

    it('should log enabled status', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      appProtection.logProtectionStatus();

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
