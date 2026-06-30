/**
 * Unit tests for useAdminElevation.
 *
 * Boundary mocked: usbService.provisionPreflight (the only external dependency).
 * Everything else is the hook's own state machine, which we drive via the
 * returned actions and assert on the returned `state` object.
 */
import { renderHook, act } from '@testing-library/react-native';
import { useAdminElevation } from '../useAdminElevation';
import { usbService } from '@/services/usbService';

jest.mock('@/services/usbService', () => ({
  usbService: {
    provisionPreflight: jest.fn(),
  },
}));

const mockPreflight = usbService.provisionPreflight as jest.Mock;

describe('useAdminElevation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with a clean, non-elevated state', () => {
    const { result } = renderHook(() => useAdminElevation());
    expect(result.current.state).toEqual({
      needed: false,
      password: '',
      error: null,
      elevating: false,
      platform: 'unknown',
      attemptsRemaining: 5,
    });
  });

  describe('requestElevation', () => {
    it('returns false and stays hidden when preflight says no admin needed', async () => {
      mockPreflight.mockResolvedValue({ needsAdmin: false, platform: 'linux' });
      const { result } = renderHook(() => useAdminElevation());

      let returned: boolean | undefined;
      await act(async () => {
        returned = await result.current.requestElevation('drive-1');
      });

      expect(returned).toBe(false);
      expect(mockPreflight).toHaveBeenCalledWith('drive-1');
      // platform is still recorded even when no elevation is needed
      expect(result.current.state.platform).toBe('linux');
      expect(result.current.state.needed).toBe(false);
    });

    it('shows the modal and records platform when admin is required', async () => {
      mockPreflight.mockResolvedValue({ needsAdmin: true, platform: 'macos' });
      const { result } = renderHook(() => useAdminElevation());

      let returned: boolean | undefined;
      await act(async () => {
        returned = await result.current.requestElevation();
      });

      expect(returned).toBe(true);
      expect(result.current.state.needed).toBe(true);
      expect(result.current.state.platform).toBe('macos');
      expect(result.current.state.attemptsRemaining).toBe(5);
      expect(result.current.state.error).toBeNull();
    });

    it('fails safe (assumes admin needed) when preflight throws', async () => {
      mockPreflight.mockRejectedValue(new Error('network down'));
      const { result } = renderHook(() => useAdminElevation());

      let returned: boolean | undefined;
      await act(async () => {
        returned = await result.current.requestElevation();
      });

      expect(returned).toBe(true);
      expect(result.current.state.needed).toBe(true);
      expect(result.current.state.platform).toBe('unknown');
    });
  });

  describe('setPassword', () => {
    it('updates the password value', () => {
      const { result } = renderHook(() => useAdminElevation());
      act(() => result.current.setPassword('hunter2'));
      expect(result.current.state.password).toBe('hunter2');
    });

    it('clears a pre-existing error when the user types again', async () => {
      mockPreflight.mockResolvedValue({ needsAdmin: true, platform: 'macos' });
      const { result } = renderHook(() => useAdminElevation());

      // Drive an ADMIN_AUTH_FAILED error to set state.error.
      act(() => {
        result.current.handleError({ code: 'ADMIN_AUTH_FAILED' });
      });
      expect(result.current.state.error).not.toBeNull();

      act(() => result.current.setPassword('x'));
      expect(result.current.state.error).toBeNull();
    });
  });

  describe('submit', () => {
    it('rejects an empty/whitespace password without invoking the callback', async () => {
      const { result } = renderHook(() => useAdminElevation());
      const callback = jest.fn().mockResolvedValue(undefined);

      act(() => result.current.setPassword('   '));
      await act(async () => {
        await result.current.submit(callback);
      });

      expect(callback).not.toHaveBeenCalled();
      expect(result.current.state.error).toBe('Password is required');
    });

    it('runs the callback with the trimmed password and clears state on success', async () => {
      const { result } = renderHook(() => useAdminElevation());
      const callback = jest.fn().mockResolvedValue(undefined);

      act(() => result.current.setPassword('  s3cret  '));
      await act(async () => {
        await result.current.submit(callback);
      });

      expect(callback).toHaveBeenCalledWith('s3cret');
      expect(result.current.state.needed).toBe(false);
      expect(result.current.state.password).toBe('');
      expect(result.current.state.error).toBeNull();
      expect(result.current.state.attemptsRemaining).toBe(5);
      expect(result.current.state.elevating).toBe(false);
    });

    it('decrements attempts and keeps the modal open on ADMIN_AUTH_FAILED', async () => {
      const { result } = renderHook(() => useAdminElevation());
      const callback = jest.fn().mockRejectedValue({ code: 'ADMIN_AUTH_FAILED' });

      act(() => result.current.setPassword('wrong'));
      await act(async () => {
        await result.current.submit(callback);
      });

      expect(callback).toHaveBeenCalled();
      expect(result.current.state.attemptsRemaining).toBe(4);
      expect(result.current.state.error).toBe('Incorrect password. Please try again.');
      expect(result.current.state.password).toBe('');
      expect(result.current.state.elevating).toBe(false);
    });

    it('re-throws unrecognized errors but still clears the password', async () => {
      const { result } = renderHook(() => useAdminElevation());
      const callback = jest.fn().mockRejectedValue(new Error('disk full'));

      act(() => result.current.setPassword('secret'));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.submit(callback);
        } catch (e) {
          thrown = e;
        }
      });

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe('disk full');
      expect(result.current.state.password).toBe('');
      // Unrecognized error: modal stays open (needed unchanged from default false here)
      expect(result.current.state.elevating).toBe(false);
    });
  });

  describe('cancel', () => {
    it('hides the modal and clears the password', async () => {
      mockPreflight.mockResolvedValue({ needsAdmin: true, platform: 'macos' });
      const { result } = renderHook(() => useAdminElevation());

      await act(async () => {
        await result.current.requestElevation();
      });
      act(() => result.current.setPassword('temp'));
      expect(result.current.state.needed).toBe(true);

      act(() => result.current.cancel());
      expect(result.current.state.needed).toBe(false);
      expect(result.current.state.password).toBe('');
      expect(result.current.state.error).toBeNull();
    });
  });

  describe('handleError', () => {
    it('returns false for non-object / unrecognized errors', () => {
      const { result } = renderHook(() => useAdminElevation());
      let handled = true;
      act(() => {
        handled = result.current.handleError('plain string');
      });
      expect(handled).toBe(false);
    });

    it('opens the modal on a normalized ADMIN_REQUIRED code', () => {
      const { result } = renderHook(() => useAdminElevation());
      let handled = false;
      act(() => {
        handled = result.current.handleError({ code: 'ADMIN_REQUIRED' });
      });
      expect(handled).toBe(true);
      expect(result.current.state.needed).toBe(true);
    });

    it('handles a raw Axios 409 ADMIN_REQUIRED response', () => {
      const { result } = renderHook(() => useAdminElevation());
      let handled = false;
      act(() => {
        handled = result.current.handleError({
          response: { status: 409, data: { code: 'ADMIN_REQUIRED' } },
        });
      });
      expect(handled).toBe(true);
      expect(result.current.state.needed).toBe(true);
    });

    it('handles a raw Axios 401 ADMIN_AUTH_FAILED with custom message and decrements attempts', () => {
      const { result } = renderHook(() => useAdminElevation());
      let handled = false;
      act(() => {
        handled = result.current.handleError({
          response: {
            status: 401,
            data: { code: 'ADMIN_AUTH_FAILED', message: 'bad creds' },
          },
        });
      });
      expect(handled).toBe(true);
      expect(result.current.state.attemptsRemaining).toBe(4);
      expect(result.current.state.error).toBe('bad creds');
    });

    it('shows the lockout message when attempts reach zero', () => {
      const { result } = renderHook(() => useAdminElevation());
      // Five consecutive auth failures drive attemptsRemaining 5 -> 0.
      for (let i = 0; i < 5; i++) {
        act(() => {
          result.current.handleError({ code: 'ADMIN_AUTH_FAILED' });
        });
      }
      expect(result.current.state.attemptsRemaining).toBe(0);
      expect(result.current.state.error).toBe('Too many failed attempts. Please try again later.');
    });
  });

  describe('platform helpers', () => {
    it('returns macOS-specific copy after a macos preflight', async () => {
      mockPreflight.mockResolvedValue({ needsAdmin: true, platform: 'macos' });
      const { result } = renderHook(() => useAdminElevation());
      await act(async () => {
        await result.current.requestElevation();
      });
      expect(result.current.getPlatformDescription()).toContain('Mac login password');
      expect(result.current.getPlaceholder()).toBe('Mac login password');
    });

    it('falls back to default copy for an unknown platform', () => {
      const { result } = renderHook(() => useAdminElevation());
      expect(result.current.getPlatformDescription()).toContain('Administrator privileges');
      expect(result.current.getPlaceholder()).toBe('Password');
    });

    it('maps linux and windows placeholders', async () => {
      mockPreflight.mockResolvedValueOnce({ needsAdmin: true, platform: 'linux' });
      const { result, rerender } = renderHook(() => useAdminElevation());
      await act(async () => {
        await result.current.requestElevation();
      });
      expect(result.current.getPlaceholder()).toBe('Password');
      expect(result.current.getPlatformDescription()).toContain('Enter your password');

      mockPreflight.mockResolvedValueOnce({ needsAdmin: true, platform: 'windows' });
      await act(async () => {
        await result.current.requestElevation();
      });
      rerender({});
      expect(result.current.getPlaceholder()).toBe('Administrator password');
      expect(result.current.getPlatformDescription()).toContain('UAC prompt');
    });
  });
});
