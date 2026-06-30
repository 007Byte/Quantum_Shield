/**
 * Unit tests for useVaultUnlock.
 *
 * Boundaries mocked (genuine externals the hook orchestrates):
 *   - vaultOrchestrator   (isUnlocked / unlock / readFile)
 *   - useVaultListStore   (Zustand store: selector form + getState/setState)
 *   - useActiveVaultStore (Zustand store: selector form)
 *   - localStorage        (jsdom real; used for the USB file metadata cache)
 *   - logger              (silenced)
 *
 * We exercise the real unlock orchestration: auto-prompt detection for USB
 * vaults, the success path (index → store sync, fail-counter warning), and the
 * error path (fail-count-driven messaging).
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useVaultUnlock } from '../useVaultUnlock';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';

jest.mock('@/services/vaultOrchestrator', () => ({
  vaultOrchestrator: {
    isUnlocked: jest.fn(),
    unlock: jest.fn(),
    readFile: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

// ── Zustand store mocks ─────────────────────────────────────────────────────
// Each store is a function usable as useStore(selector) plus getState/setState
// statics, mirroring how the hook consumes them.
let vaultListState: Record<string, any>;
let activeVaultState: Record<string, any>;

jest.mock('@/stores/vaultListStore', () => {
  const store: any = (selector: (s: any) => unknown) => selector(vaultListState);
  store.getState = () => vaultListState;
  store.setState = (patch: Record<string, unknown>) => {
    vaultListState = { ...vaultListState, ...patch };
  };
  return { useVaultListStore: store };
});

jest.mock('@/stores/activeVaultStore', () => {
  const store: any = (selector: (s: any) => unknown) => selector(activeVaultState);
  store.getState = () => activeVaultState;
  return { useActiveVaultStore: store };
});

const mockOrch = vaultOrchestrator as unknown as {
  isUnlocked: jest.Mock;
  unlock: jest.Mock;
  readFile: jest.Mock;
};

const USB_VAULT = {
  id: 'vault-usb',
  name: 'USB Vault',
  mountPoint: '/Volumes/USB',
};

function setupStores(opts: { activeVaultId?: string; vault?: any; files?: any[] } = {}) {
  const updateVault = jest.fn();
  vaultListState = {
    vaultsById: opts.vault ? { [opts.vault.id]: opts.vault } : {},
    files: opts.files ?? [],
    _updateVault: updateVault,
  };
  activeVaultState = { activeVaultId: opts.activeVaultId ?? null };
  return { updateVault };
}

describe('useVaultUnlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockOrch.isUnlocked.mockReturnValue(false);
    // Re-mount the store function references after clearAllMocks (which only
    // clears call data) — the selector functions themselves are untouched.
    void useVaultListStore;
    void useActiveVaultStore;
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('reports a non-USB / no-active vault as not requiring unlock', () => {
    setupStores();
    const { result } = renderHook(() => useVaultUnlock());
    expect(result.current.isUsbVault).toBe(false);
    expect(result.current.showUnlockModal).toBe(false);
  });

  it('detects a USB vault and auto-prompts the unlock modal', async () => {
    setupStores({ activeVaultId: USB_VAULT.id, vault: USB_VAULT });
    const { result } = renderHook(() => useVaultUnlock());

    expect(result.current.isUsbVault).toBe(true);
    await waitFor(() => expect(result.current.showUnlockModal).toBe(true));
    expect(result.current.unlockError).toBeNull();
  });

  it('does not auto-prompt when the orchestrator is already unlocked', async () => {
    mockOrch.isUnlocked.mockReturnValue(true);
    setupStores({ activeVaultId: USB_VAULT.id, vault: USB_VAULT });
    const { result } = renderHook(() => useVaultUnlock());

    // Give effects a chance to run.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.vaultUnlocked).toBe(true);
    expect(result.current.showUnlockModal).toBe(false);
  });

  describe('handleVaultUnlock', () => {
    it('errors out when no password is provided', async () => {
      setupStores({ activeVaultId: USB_VAULT.id, vault: USB_VAULT });
      const { result } = renderHook(() => useVaultUnlock());

      await act(async () => {
        await result.current.handleVaultUnlock();
      });
      expect(result.current.unlockError).toBe('Please enter your vault password');
      expect(mockOrch.unlock).not.toHaveBeenCalled();
    });

    it('unlocks, syncs index files into the store, and reports success', async () => {
      const { updateVault } = setupStores({
        activeVaultId: USB_VAULT.id,
        vault: USB_VAULT,
      });
      mockOrch.unlock.mockResolvedValue({
        vault: { index: { files: { 'file-1': { name: 'report.pdf', length: 1234 } } } },
        failCounterWasNonZero: false,
        previousFailCount: 0,
      });
      mockOrch.readFile.mockResolvedValue({
        metadata: { filename: '' },
        data: new Uint8Array(1234),
      });

      const showSuccess = jest.fn();
      const showError = jest.fn();
      const { result } = renderHook(() => useVaultUnlock({ showSuccess, showError }));

      act(() => result.current.setUnlockPassword('correct-horse'));
      await act(async () => {
        await result.current.handleVaultUnlock();
      });

      expect(mockOrch.unlock).toHaveBeenCalledWith('/Volumes/USB', 'correct-horse');
      expect(result.current.vaultUnlocked).toBe(true);
      expect(result.current.showUnlockModal).toBe(false);
      // Index entry name wins over the empty record filename.
      const synced = vaultListState.files.find((f: any) => f.id === 'file-1');
      expect(synced).toMatchObject({ id: 'file-1', name: 'report.pdf', vaultId: USB_VAULT.id });
      expect(updateVault).toHaveBeenCalledWith(
        USB_VAULT.id,
        expect.objectContaining({ fileCount: 1 })
      );
      expect(showSuccess).toHaveBeenCalled();
      expect(showError).not.toHaveBeenCalled();
      // Metadata cache persisted for reload resilience.
      expect(localStorage.getItem('usbvault:usb_file_cache')).toContain('file-1');
    });

    it('surfaces a security warning when a non-zero fail counter is detected', async () => {
      setupStores({ activeVaultId: USB_VAULT.id, vault: USB_VAULT });
      mockOrch.unlock.mockResolvedValue({
        vault: { index: { files: {} } },
        failCounterWasNonZero: true,
        previousFailCount: 3,
      });

      const showSuccess = jest.fn();
      const showError = jest.fn();
      const { result } = renderHook(() => useVaultUnlock({ showSuccess, showError }));

      act(() => result.current.setUnlockPassword('pw'));
      await act(async () => {
        await result.current.handleVaultUnlock();
      });

      expect(showError).toHaveBeenCalledWith(
        'Security Warning',
        expect.stringContaining('3 failed unlock attempt')
      );
      expect(showSuccess).not.toHaveBeenCalled();
    });

    it('escalates the error message as the fail count grows', async () => {
      setupStores({ activeVaultId: USB_VAULT.id, vault: USB_VAULT });
      const err: any = new Error('bad password');
      err.failCount = 7;
      err.maxAttempts = 10;
      mockOrch.unlock.mockRejectedValue(err);

      const { result } = renderHook(() => useVaultUnlock());
      act(() => result.current.setUnlockPassword('wrong'));
      await act(async () => {
        await result.current.handleVaultUnlock();
      });

      expect(result.current.unlockError).toContain('7/10 attempts used');
      expect(result.current.unlockError).toContain('self-destruct');
      expect(result.current.isUnlocking).toBe(false);
    });

    it('shows the generic incorrect-password message for a low fail count', async () => {
      setupStores({ activeVaultId: USB_VAULT.id, vault: USB_VAULT });
      mockOrch.unlock.mockRejectedValue(new Error('nope'));

      const { result } = renderHook(() => useVaultUnlock());
      act(() => result.current.setUnlockPassword('wrong'));
      await act(async () => {
        await result.current.handleVaultUnlock();
      });

      expect(result.current.unlockError).toBe('Incorrect password. Please try again.');
    });
  });

  describe('modal controls', () => {
    it('requestUnlock opens the modal and clears prior state', () => {
      setupStores({ activeVaultId: USB_VAULT.id, vault: USB_VAULT });
      const { result } = renderHook(() => useVaultUnlock());

      act(() => result.current.setUnlockPassword('typed'));
      act(() => result.current.requestUnlock());
      expect(result.current.showUnlockModal).toBe(true);
      expect(result.current.unlockPassword).toBe('');
      expect(result.current.unlockError).toBeNull();
    });

    it('dismissUnlockModal closes the modal and clears the password', async () => {
      setupStores({ activeVaultId: USB_VAULT.id, vault: USB_VAULT });
      const { result } = renderHook(() => useVaultUnlock());

      await waitFor(() => expect(result.current.showUnlockModal).toBe(true));
      act(() => result.current.setUnlockPassword('typed'));
      act(() => result.current.dismissUnlockModal());

      expect(result.current.showUnlockModal).toBe(false);
      expect(result.current.unlockPassword).toBe('');
      expect(result.current.unlockError).toBeNull();
    });
  });
});
