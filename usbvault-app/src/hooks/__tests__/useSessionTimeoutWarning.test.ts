/**
 * Unit tests for useSessionTimeoutWarning.
 *
 * Boundaries mocked:
 *   - useAuthStore   (Zustand selector store — provides isAuthenticated/lockVault)
 *   - auditService   (audit logging — assert the right events fire)
 *   - Platform.OS    (the hook is web-only)
 *   - sessionStorage (jsdom provides a real one; we seed expiresAt directly)
 *   - timers         (jest fake timers drive the check + countdown intervals)
 *
 * We assert the real state machine: the warning becomes visible only inside the
 * 5-minute window, the countdown ticks every second, extend resets the timer +
 * audits, and logout audits + locks the vault.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useSessionTimeoutWarning } from '../useSessionTimeoutWarning';
import { useAuthStore } from '@/stores/authStore';
import { auditService } from '@/services/auditService';

// The hook captures `const isWeb = Platform.OS === 'web'` at module-load time,
// so Platform.OS must already be 'web' when ../useSessionTimeoutWarning is
// imported. Re-mock react-native here (overriding the global jest.setup mock)
// with OS='web' before that import is evaluated.
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

// Mutable backing state the mocked selector store reads from.
let authState: { isAuthenticated: boolean; lockVault: jest.Mock };

jest.mock('@/stores/authStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockAuditLog = auditService.log as jest.Mock;

const SESSION_KEY = 'usbvault:session';
const TIMEOUT_MS = 30 * 60 * 1000;

function seedSession(expiresAt: number) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ expiresAt }));
}

describe('useSessionTimeoutWarning', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-29T12:00:00Z'));
    sessionStorage.clear();

    authState = { isAuthenticated: true, lockVault: jest.fn() };
    // Mock store behaves like a real Zustand selector store.
    mockUseAuthStore.mockImplementation((selector: (s: typeof authState) => unknown) =>
      selector(authState)
    );
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    sessionStorage.clear();
  });

  it('starts hidden with no countdown', () => {
    const { result } = renderHook(() => useSessionTimeoutWarning());
    expect(result.current.visible).toBe(false);
    expect(result.current.secondsLeft).toBe(0);
  });

  it('stays hidden while the session is comfortably above the warning window', () => {
    // 20 minutes left — well outside the 5-minute warning window.
    seedSession(Date.now() + 20 * 60 * 1000);
    const { result } = renderHook(() => useSessionTimeoutWarning());

    act(() => {
      jest.advanceTimersByTime(10_000); // one check tick
    });
    expect(result.current.visible).toBe(false);
  });

  it('shows the warning once the session enters the 5-minute window', () => {
    // 4 minutes left — inside the warning window.
    seedSession(Date.now() + 4 * 60 * 1000);
    const { result } = renderHook(() => useSessionTimeoutWarning());

    act(() => {
      jest.advanceTimersByTime(10_000); // check interval fires at t=10s
    });

    expect(result.current.visible).toBe(true);
    // The check fires 10s after mount, so the snapshot is 240s - 10s = 230s.
    expect(result.current.secondsLeft).toBe(230);
  });

  it('counts down once per second while visible', () => {
    seedSession(Date.now() + 4 * 60 * 1000);
    const { result } = renderHook(() => useSessionTimeoutWarning());

    act(() => {
      jest.advanceTimersByTime(10_000); // becomes visible at t=10s -> 230s left
    });
    expect(result.current.secondsLeft).toBe(230);

    act(() => {
      jest.advanceTimersByTime(3_000); // 3 countdown ticks (t=13s -> 227s left)
    });
    expect(result.current.secondsLeft).toBe(227);
  });

  it('does nothing when not authenticated', () => {
    authState.isAuthenticated = false;
    seedSession(Date.now() + 1 * 60 * 1000);
    const { result } = renderHook(() => useSessionTimeoutWarning());

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current.visible).toBe(false);
  });

  describe('extendSession', () => {
    it('resets the stored expiry, hides the warning, and audits the extension', () => {
      const initialExpiry = Date.now() + 2 * 60 * 1000;
      seedSession(initialExpiry);
      const { result } = renderHook(() => useSessionTimeoutWarning());

      act(() => {
        jest.advanceTimersByTime(10_000); // make it visible
      });
      expect(result.current.visible).toBe(true);

      act(() => {
        result.current.extendSession();
      });

      expect(result.current.visible).toBe(false);
      const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY)!);
      expect(stored.expiresAt).toBe(Date.now() + TIMEOUT_MS);
      expect(mockAuditLog).toHaveBeenCalledWith('system', 'session_extended', {});
    });

    it('is a no-op when there is no stored session', () => {
      const { result } = renderHook(() => useSessionTimeoutWarning());
      act(() => {
        result.current.extendSession();
      });
      expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });

  describe('logoutNow', () => {
    it('hides the warning, audits the logout, and locks the vault', () => {
      seedSession(Date.now() + 2 * 60 * 1000);
      const { result } = renderHook(() => useSessionTimeoutWarning());

      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      act(() => {
        result.current.logoutNow();
      });

      expect(result.current.visible).toBe(false);
      expect(mockAuditLog).toHaveBeenCalledWith(
        'logout',
        'user_initiated_from_timeout_warning',
        {}
      );
      expect(authState.lockVault).toHaveBeenCalledTimes(1);
    });
  });

  it('hides itself if the session disappears while the countdown is running', () => {
    seedSession(Date.now() + 4 * 60 * 1000);
    const { result } = renderHook(() => useSessionTimeoutWarning());

    act(() => {
      jest.advanceTimersByTime(10_000); // visible
    });
    expect(result.current.visible).toBe(true);

    sessionStorage.removeItem(SESSION_KEY);
    act(() => {
      jest.advanceTimersByTime(1_000); // next countdown tick sees no session
    });
    expect(result.current.visible).toBe(false);
  });
});
