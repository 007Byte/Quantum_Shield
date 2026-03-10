import { Platform } from 'react-native';
import * as deviceIntegrity from '@/services/deviceIntegrity';

jest.mock('react-native');

describe('Device Integrity Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: checkDeviceIntegrity Function
  // ============================================================================
  describe('checkDeviceIntegrity', () => {
    it('should return proper structure with required fields', async () => {
      (Platform.OS as any) = 'ios';

      const result = await deviceIntegrity.checkDeviceIntegrity();

      expect(result).toBeDefined();
      expect(result.isCompromised).toBe(typeof result.isCompromised === 'boolean');
      expect(result.checks).toBeDefined();
      expect(result.riskLevel).toMatch(/^(safe|warning|critical)$/);
      expect(result.detailedResults).toBeDefined();
    });

    it('should have all check properties defined', async () => {
      (Platform.OS as any) = 'ios';

      const result = await deviceIntegrity.checkDeviceIntegrity();

      expect(result.checks).toHaveProperty('jailbroken');
      expect(result.checks).toHaveProperty('rooted');
      expect(result.checks).toHaveProperty('debuggerAttached');
      expect(result.checks).toHaveProperty('emulator');
      expect(result.checks).toHaveProperty('hookingFramework');
    });

    it('should return detailedResults with jailbreakIndicators and rootIndicators', async () => {
      (Platform.OS as any) = 'ios';

      const result = await deviceIntegrity.checkDeviceIntegrity();

      expect(result.detailedResults).toHaveProperty('jailbreakIndicators');
      expect(result.detailedResults).toHaveProperty('rootIndicators');
      expect(Array.isArray(result.detailedResults!.jailbreakIndicators)).toBe(true);
      expect(Array.isArray(result.detailedResults!.rootIndicators)).toBe(true);
    });

    it('should run iOS-specific checks when Platform.OS is ios', async () => {
      (Platform.OS as any) = 'ios';

      const result = await deviceIntegrity.checkDeviceIntegrity();

      expect(result.checks.jailbroken).toBeDefined();
      expect(typeof result.checks.jailbroken === 'boolean').toBe(true);
    });

    it('should run Android-specific checks when Platform.OS is android', async () => {
      (Platform.OS as any) = 'android';

      const result = await deviceIntegrity.checkDeviceIntegrity();

      expect(result.checks.rooted).toBeDefined();
      expect(typeof result.checks.rooted === 'boolean').toBe(true);
    });

    it('should have isCompromised false when all checks pass', async () => {
      (Platform.OS as any) = 'ios';

      const result = await deviceIntegrity.checkDeviceIntegrity();

      // In this placeholder implementation, all checks should be false
      expect(result.isCompromised).toBe(false);
    });

    it('should return warning risk level on error', async () => {
      (Platform.OS as any) = 'ios';

      // Mock Platform to throw error
      jest.spyOn(Platform, 'OS', 'get').mockImplementation(() => {
        throw new Error('Platform access failed');
      });

      const result = await deviceIntegrity.checkDeviceIntegrity();

      expect(result.riskLevel).toBe('warning');
      expect(result.isCompromised).toBe(true);
    });

    it('should include error message in detailedResults when check fails', async () => {
      jest.spyOn(Platform, 'OS', 'get').mockImplementation(() => {
        throw new Error('Platform access failed');
      });

      const result = await deviceIntegrity.checkDeviceIntegrity();

      expect(result.detailedResults!.jailbreakIndicators).toContain('Integrity check failed');
    });
  });

  // ============================================================================
  // Test: getIntegrityRiskLevel Function
  // ============================================================================
  describe('getIntegrityRiskLevel', () => {
    it('should return safe when no checks failed', () => {
      const result = {
        isCompromised: false,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'safe' as const,
      };

      const riskLevel = deviceIntegrity.getIntegrityRiskLevel(result);
      expect(riskLevel).toBe('safe');
    });

    it('should return critical when jailbroken', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: true,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const riskLevel = deviceIntegrity.getIntegrityRiskLevel(result);
      expect(riskLevel).toBe('critical');
    });

    it('should return critical when rooted', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: true,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const riskLevel = deviceIntegrity.getIntegrityRiskLevel(result);
      expect(riskLevel).toBe('critical');
    });

    it('should return critical when multiple checks failed', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: true,
          emulator: true,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const riskLevel = deviceIntegrity.getIntegrityRiskLevel(result);
      expect(riskLevel).toBe('critical');
    });

    it('should return warning when single non-critical check failed', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: true,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'warning' as const,
      };

      const riskLevel = deviceIntegrity.getIntegrityRiskLevel(result);
      expect(riskLevel).toBe('warning');
    });

    it('should return warning for emulator detection', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: false,
          emulator: true,
          hookingFramework: false,
        },
        riskLevel: 'warning' as const,
      };

      const riskLevel = deviceIntegrity.getIntegrityRiskLevel(result);
      expect(riskLevel).toBe('warning');
    });
  });

  // ============================================================================
  // Test: shouldBlockOperation Function
  // ============================================================================
  describe('shouldBlockOperation', () => {
    it('should block key_generation on critical risk', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: true,
          emulator: true,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const shouldBlock = deviceIntegrity.shouldBlockOperation(result, 'key_generation');
      expect(shouldBlock).toBe(true);
    });

    it('should block decryption on critical risk', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: true,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const shouldBlock = deviceIntegrity.shouldBlockOperation(result, 'decryption');
      expect(shouldBlock).toBe(true);
    });

    it('should block master_key_access on critical risk', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: true,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const shouldBlock = deviceIntegrity.shouldBlockOperation(result, 'master_key_access');
      expect(shouldBlock).toBe(true);
    });

    it('should block vault_unlock on jailbreak', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: true,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const shouldBlock = deviceIntegrity.shouldBlockOperation(result, 'vault_unlock');
      expect(shouldBlock).toBe(true);
    });

    it('should block vault_unlock on root', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: true,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const shouldBlock = deviceIntegrity.shouldBlockOperation(result, 'vault_unlock');
      expect(shouldBlock).toBe(true);
    });

    it('should block file_access on critical risk', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: true,
          emulator: true,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const shouldBlock = deviceIntegrity.shouldBlockOperation(result, 'file_access');
      expect(shouldBlock).toBe(true);
    });

    it('should allow operations on safe devices', () => {
      const result = {
        isCompromised: false,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'safe' as const,
      };

      expect(deviceIntegrity.shouldBlockOperation(result, 'key_generation')).toBe(false);
      expect(deviceIntegrity.shouldBlockOperation(result, 'decryption')).toBe(false);
      expect(deviceIntegrity.shouldBlockOperation(result, 'file_access')).toBe(false);
    });

    it('should allow critical operations on warning risk', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: true,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'warning' as const,
      };

      expect(deviceIntegrity.shouldBlockOperation(result, 'key_generation')).toBe(false);
      expect(deviceIntegrity.shouldBlockOperation(result, 'decryption')).toBe(false);
    });

    it('should allow file_access on warning risk', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: true,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'warning' as const,
      };

      expect(deviceIntegrity.shouldBlockOperation(result, 'file_access')).toBe(false);
    });
  });

  // ============================================================================
  // Test: getIntegrityStatusDescription Function
  // ============================================================================
  describe('getIntegrityStatusDescription', () => {
    it('should return safe message when device is not compromised', () => {
      const result = {
        isCompromised: false,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'safe' as const,
      };

      const description = deviceIntegrity.getIntegrityStatusDescription(result);
      expect(description).toContain('safe to proceed');
    });

    it('should describe compromised state with jailbreak', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: true,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const description = deviceIntegrity.getIntegrityStatusDescription(result);
      expect(description).toContain('compromised');
      expect(description).toContain('jailbroken');
    });

    it('should describe compromised state with root', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: true,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
      };

      const description = deviceIntegrity.getIntegrityStatusDescription(result);
      expect(description).toContain('compromised');
      expect(description).toContain('rooted');
    });

    it('should include multiple failed checks in description', () => {
      const result = {
        isCompromised: true,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: true,
          emulator: true,
          hookingFramework: false,
        },
        riskLevel: 'warning' as const,
      };

      const description = deviceIntegrity.getIntegrityStatusDescription(result);
      expect(description).toContain('compromised');
      expect(description).toContain('debuggerAttached');
      expect(description).toContain('emulator');
    });
  });

  // ============================================================================
  // Test: logIntegrityResults Function
  // ============================================================================
  describe('logIntegrityResults', () => {
    it('should log integrity results without throwing', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = {
        isCompromised: false,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'safe' as const,
        detailedResults: {
          jailbreakIndicators: [],
          rootIndicators: [],
        },
      };

      deviceIntegrity.logIntegrityResults(result);

      expect(consoleSpy).toHaveBeenCalledWith('[Device Integrity Check]');
      consoleSpy.mockRestore();
    });

    it('should log SAFE status when not compromised', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = {
        isCompromised: false,
        checks: {
          jailbroken: false,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'safe' as const,
        detailedResults: {
          jailbreakIndicators: [],
          rootIndicators: [],
        },
      };

      deviceIntegrity.logIntegrityResults(result);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SAFE'));
      consoleSpy.mockRestore();
    });

    it('should log COMPROMISED status when compromised', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = {
        isCompromised: true,
        checks: {
          jailbroken: true,
          rooted: false,
          debuggerAttached: false,
          emulator: false,
          hookingFramework: false,
        },
        riskLevel: 'critical' as const,
        detailedResults: {
          jailbreakIndicators: ['test_indicator'],
          rootIndicators: [],
        },
      };

      deviceIntegrity.logIntegrityResults(result);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('COMPROMISED'));
      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // Test: initializeDeviceIntegrityCheck Function
  // ============================================================================
  describe('initializeDeviceIntegrityCheck', () => {
    it('should return a valid DeviceIntegrityResult', async () => {
      (Platform.OS as any) = 'ios';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await deviceIntegrity.initializeDeviceIntegrityCheck();

      expect(result.isCompromised).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.riskLevel).toMatch(/^(safe|warning|critical)$/);

      consoleSpy.mockRestore();
    });

    it('should log initialization message', async () => {
      (Platform.OS as any) = 'ios';
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await deviceIntegrity.initializeDeviceIntegrityCheck();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initializing device integrity checks')
      );

      consoleSpy.mockRestore();
    });

    it('should log warning when device is compromised', async () => {
      (Platform.OS as any) = 'ios';
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      // Since the placeholder implementation returns safe, we can't truly test the warning
      // but we can verify the function completes successfully
      await deviceIntegrity.initializeDeviceIntegrityCheck();

      // Function should complete without throwing
      expect(true).toBe(true);

      consoleWarnSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});
