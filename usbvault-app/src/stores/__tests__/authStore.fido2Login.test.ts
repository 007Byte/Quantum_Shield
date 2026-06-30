/**
 * Passwordless FIDO2 (security-key) login — authStore.loginWithFido2 (SG-011).
 *
 * Web path (isWeb=true): a WebAuthn assertion against a registered authenticator
 * establishes the session for the locally-stored account. Only genuine boundaries
 * are mocked (fido2Service, auditService); the store logic + localStorage/
 * sessionStorage run for real.
 */
import { useAuthStore } from '@/stores/authStore';
import { fido2Service } from '@/services/fido2Service';
import { auditService } from '@/services/auditService';

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('@/services/auth', () => ({}));
jest.mock('@/services/api', () => ({}));
jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/services/fido2Service', () => ({
  fido2Service: {
    isWebAuthnSupported: jest.fn(() => true),
    getDeviceCount: jest.fn(() => 1),
    authenticate: jest.fn(),
  },
}));

const fido2 = fido2Service as jest.Mocked<typeof fido2Service>;

const STORED = {
  email: 'alice@example.com',
  srpSaltHex: '00'.repeat(32),
  srpVerifierHex: 'deadbeef',
  userId: 'user-1',
  subscriptionTier: 'pro' as const,
  createdAt: '2026-01-01T00:00:00Z',
};

function setStoredAccount(acct: typeof STORED | null) {
  if (acct) localStorage.setItem('usbvault:auth', JSON.stringify(acct));
  else localStorage.removeItem('usbvault:auth');
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    userId: null,
    email: null,
    subscriptionTier: null,
    error: null,
    fido2Verified: false,
  });
  fido2.isWebAuthnSupported.mockReturnValue(true);
  fido2.getDeviceCount.mockReturnValue(1);
});

describe('loginWithFido2 — passwordless security-key login', () => {
  it('establishes a session for the stored account on a successful assertion', async () => {
    setStoredAccount(STORED);
    fido2.authenticate.mockResolvedValue({ id: 'dev-1', name: 'YubiKey' } as any);

    await useAuthStore.getState().loginWithFido2();

    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.userId).toBe('user-1');
    expect(s.email).toBe('alice@example.com');
    expect(s.subscriptionTier).toBe('pro');
    expect(s.fido2Verified).toBe(true);
    expect(s.error).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('usbvault:session')!)).toMatchObject({
      email: 'alice@example.com',
      userId: 'user-1',
    });
    expect(auditService.log).toHaveBeenCalledWith(
      'login',
      'alice@example.com',
      expect.objectContaining({ method: 'security_key', deviceId: 'dev-1' })
    );
    // Hardening: passwordless single-factor must require user verification.
    expect(fido2.authenticate).toHaveBeenCalledWith({ userVerification: 'required' });
  });

  it('rejects (no assertion call) when no account exists on the device', async () => {
    setStoredAccount(null);
    await expect(useAuthStore.getState().loginWithFido2()).rejects.toThrow('No account found');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(fido2.authenticate).not.toHaveBeenCalled();
  });

  it('rejects (no assertion call) when no security key is registered', async () => {
    setStoredAccount(STORED);
    fido2.getDeviceCount.mockReturnValue(0);
    await expect(useAuthStore.getState().loginWithFido2()).rejects.toThrow(
      'No security key registered'
    );
    expect(fido2.authenticate).not.toHaveBeenCalled();
  });

  it('rejects when WebAuthn is unsupported', async () => {
    setStoredAccount(STORED);
    fido2.isWebAuthnSupported.mockReturnValue(false);
    await expect(useAuthStore.getState().loginWithFido2()).rejects.toThrow('not supported');
    expect(fido2.authenticate).not.toHaveBeenCalled();
  });

  it('does NOT establish a session when the assertion returns null', async () => {
    setStoredAccount(STORED);
    fido2.authenticate.mockResolvedValue(null);
    await expect(useAuthStore.getState().loginWithFido2()).rejects.toThrow('not completed');
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(sessionStorage.getItem('usbvault:session')).toBeNull();
    expect(auditService.log).toHaveBeenCalledWith(
      'failed_login',
      'alice@example.com',
      expect.objectContaining({ reason: 'security_key' }),
      'error'
    );
  });

  it('propagates a thrown assertion error (e.g. user cancel) and stays logged out', async () => {
    setStoredAccount(STORED);
    fido2.authenticate.mockRejectedValue(new Error('The operation was aborted'));
    await expect(useAuthStore.getState().loginWithFido2()).rejects.toThrow('aborted');
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.error).toContain('aborted');
    expect(sessionStorage.getItem('usbvault:session')).toBeNull();
  });

  it('clears isLoading after both success and failure', async () => {
    setStoredAccount(STORED);
    fido2.authenticate.mockResolvedValue({ id: 'd', name: 'k' } as any);
    await useAuthStore.getState().loginWithFido2();
    expect(useAuthStore.getState().isLoading).toBe(false);

    useAuthStore.setState({ isAuthenticated: false });
    fido2.authenticate.mockRejectedValue(new Error('nope'));
    await expect(useAuthStore.getState().loginWithFido2()).rejects.toThrow();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});

describe('loginWithFido2 — native platform', () => {
  it('is unavailable on native (clear message, no session)', async () => {
    jest.resetModules();
    jest.doMock('react-native', () => ({ Platform: { OS: 'ios' } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useAuthStore: nativeStore } = require('@/stores/authStore');
    await expect(nativeStore.getState().loginWithFido2()).rejects.toThrow('web app only');
    expect(nativeStore.getState().isAuthenticated).toBe(false);
    jest.dontMock('react-native');
  });
});
