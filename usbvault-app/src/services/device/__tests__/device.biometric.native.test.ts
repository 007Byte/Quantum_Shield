/**
 * Device Domain — Native Biometric Branch Tests (Platform.OS === 'ios')
 *
 * device.ts captures the native expo-local-authentication module at import
 * time:  `const LocalAuthentication = Platform.OS !== 'web' ? require(...) : null`
 *
 * To exercise that native code path we must load device.ts fresh under an
 * ios Platform mock. This file deliberately performs NO top-level import of
 * device.ts so that jest.isolateModules + jest.doMock('react-native') apply a
 * fresh react-native (and a fresh LocalAuthentication) to device.ts's imports.
 * Each test loads the module via loadNative() with the LocalAuthentication
 * behaviour it needs.
 *
 * Only genuine boundaries are mocked: react-native Platform, the native
 * expo-local-authentication module, audit, and logger.
 */

interface NativeBundle {
  service: any;
  la: Record<string, jest.Mock | unknown>;
  auditLog: jest.Mock;
}

function loadNative(laOverrides: Record<string, unknown> = {}): NativeBundle {
  let mod: any;
  const la: Record<string, unknown> = {
    hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
    isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
    supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([1, 2])),
    authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
    AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
    ...laOverrides,
  };
  const auditLog = jest.fn().mockResolvedValue(undefined);

  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    jest.doMock('@/services/auditService', () => ({ auditService: { log: auditLog } }));
    jest.doMock('@/utils/logger', () => ({
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    }));
    jest.doMock('expo-local-authentication', () => la);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../device');
  });

  return { service: mod.biometricService, la: la as NativeBundle['la'], auditLog };
}

describe('BiometricService (native / ios)', () => {
  describe('getBiometricStatus + availability', () => {
    it('reports available + face when facial recognition is supported and enrolled', async () => {
      const { service } = loadNative({
        supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([2])),
      });
      const status = await service.getBiometricStatus();
      expect(status.available).toBe(true);
      expect(status.enrolled).toBe(true);
      expect(status.type).toBe('face');
    });

    it('reports fingerprint when only fingerprint is supported', async () => {
      const { service } = loadNative({
        supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([1])),
      });
      const status = await service.getBiometricStatus();
      expect(status.type).toBe('fingerprint');
      expect(status.available).toBe(true);
    });

    it('reports iris when only iris is supported', async () => {
      const { service } = loadNative({
        supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([3])),
      });
      const status = await service.getBiometricStatus();
      expect(status.type).toBe('iris');
      expect(status.enrolled).toBe(true);
    });

    it('reports unavailable / none when hardware is missing', async () => {
      const { service } = loadNative({
        hasHardwareAsync: jest.fn(() => Promise.resolve(false)),
      });
      const status = await service.getBiometricStatus();
      expect(status.available).toBe(false);
      expect(status.type).toBe('none');
      expect(status.enrolled).toBe(false);
    });

    it('reports unavailable when hardware exists but is not enrolled', async () => {
      const { service } = loadNative({
        isEnrolledAsync: jest.fn(() => Promise.resolve(false)),
      });
      const status = await service.getBiometricStatus();
      expect(status.available).toBe(false);
    });

    it('returns a safe default status if the native layer throws', async () => {
      const { service } = loadNative({
        hasHardwareAsync: jest.fn(() => Promise.reject(new Error('sensor boom'))),
      });
      const status = await service.getBiometricStatus();
      expect(status).toEqual({
        available: false,
        enrolled: false,
        changed: false,
        type: 'none',
      });
    });
  });

  describe('authenticateWithRetry', () => {
    it('succeeds on the first attempt and audits success', async () => {
      const { service, la, auditLog } = loadNative();
      const ok = await service.authenticateWithRetry(3);
      expect(ok).toBe(true);
      expect(la.authenticateAsync).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'biometric_auth_success',
        { attempts: 1 },
        'success'
      );
    });

    it('passes hardened prompt options (no device fallback, password fallback label)', async () => {
      const { service, la } = loadNative();
      await service.authenticateWithRetry(1);
      expect(la.authenticateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          disableDeviceFallback: true,
          cancelLabel: 'Use Password',
        })
      );
    });

    it('retries up to maxRetries then returns false when auth is rejected', async () => {
      const authMock = jest.fn(() => Promise.resolve({ success: false, error: 'user_cancel' }));
      const { service, la } = loadNative({ authenticateAsync: authMock });
      const ok = await service.authenticateWithRetry(2);
      expect(ok).toBe(false);
      expect(la.authenticateAsync).toHaveBeenCalledTimes(2);
    });

    it('audits a user-cancel on a rejected attempt', async () => {
      const { service, auditLog } = loadNative({
        authenticateAsync: jest.fn(() => Promise.resolve({ success: false, error: 'user_cancel' })),
      });
      await service.authenticateWithRetry(1);
      expect(auditLog).toHaveBeenCalledWith('system', 'biometric_user_cancelled', {}, 'success');
    });

    it('audits a lockout when the native layer reports it', async () => {
      const { service, auditLog } = loadNative({
        authenticateAsync: jest.fn(() => Promise.resolve({ success: false, error: 'lockout' })),
      });
      await service.authenticateWithRetry(1);
      expect(auditLog).toHaveBeenCalledWith('system', 'biometric_lockout', {}, 'warning');
    });
  });

  describe('checkBiometricChange (native short-circuit)', () => {
    it('returns false on native (hash comparison is web-only)', async () => {
      const { service } = loadNative();
      const changed = await service.checkBiometricChange();
      expect(changed).toBe(false);
    });
  });

  describe('completeReEnrollment', () => {
    it('audits completion on native', async () => {
      const { service, auditLog } = loadNative();
      await service.completeReEnrollment();
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'biometric_reenrollment_complete',
        {},
        'success'
      );
    });
  });

  describe('error-code mapping (platform-independent)', () => {
    it('maps known codes and falls back for unknown ones', () => {
      const { service } = loadNative();
      expect(service.getBiometricErrorMessage(0)).toBe('Biometric authentication successful');
      expect(service.getBiometricErrorMessage(4)).toBe(
        'Biometric data is locked due to too many attempts'
      );
      expect(service.getBiometricErrorMessage(42)).toBe(
        'Biometric authentication error (code: 42)'
      );
    });
  });
});
