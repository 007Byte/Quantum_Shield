/**
 * Unit tests for useDecrypt.
 *
 * Boundaries mocked (genuine externals the hook orchestrates):
 *   - useVaultListStore / useActiveVaultStore (Zustand selector stores)
 *   - vaultOrchestrator   (isUnlocked / readFile — USB vault path)
 *   - cryptoManager       (decryptData / downloadDecryptedFile — Zustand path)
 *   - webStorage          (encrypted-blob retrieval)
 *   - auditService        (audit logging)
 *   - Platform.OS         (web vs native rendering branches)
 *
 * We drive the real derivation logic (file mapping, search filtering,
 * selection) and both decryption paths (USB-orchestrator + Zustand/memory),
 * including the error/auth-error branches.
 */
import { renderHook, act } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useDecrypt } from '../useDecrypt';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { decryptData, downloadDecryptedFile } from '@/utils/cryptoManager';
import { webStorage } from '@/services/webStorage';
import { auditService } from '@/services/auditService';

jest.mock('@/services/vaultOrchestrator', () => ({
  vaultOrchestrator: { isUnlocked: jest.fn(), readFile: jest.fn() },
}));

jest.mock('@/utils/cryptoManager', () => ({
  decryptData: jest.fn(),
  downloadDecryptedFile: jest.fn(),
}));

jest.mock('@/services/webStorage', () => ({
  webStorage: { getEncryptedBlob: jest.fn() },
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/crypto/bridge', () => ({
  CipherId: { Aes256GcmSiv: 'aes-256-gcm-siv' },
}));

let vaultListState: Record<string, any>;
let activeVaultState: Record<string, any>;

jest.mock('@/stores/vaultListStore', () => {
  const store: any = (selector: (s: any) => unknown) => selector(vaultListState);
  store.getState = () => vaultListState;
  return { useVaultListStore: store };
});

jest.mock('@/stores/activeVaultStore', () => {
  const store: any = (selector: (s: any) => unknown) => selector(activeVaultState);
  store.getState = () => activeVaultState;
  return { useActiveVaultStore: store };
});

const mockOrch = vaultOrchestrator as unknown as { isUnlocked: jest.Mock; readFile: jest.Mock };
const mockDecryptData = decryptData as jest.Mock;
const mockDownload = downloadDecryptedFile as jest.Mock;
const mockGetBlob = webStorage.getEncryptedBlob as jest.Mock;
const mockAuditLog = auditService.log as jest.Mock;

function setupStores(files: any[] = [], vault: any = { id: 'vault-1' }) {
  vaultListState = { vaultsById: { [vault.id]: vault }, files };
  activeVaultState = { activeVaultId: vault.id };
}

describe('useDecrypt', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'web';
    mockOrch.isUnlocked.mockReturnValue(false);
    mockGetBlob.mockReset().mockResolvedValue(null);
    mockDecryptData.mockReset();
    mockDownload.mockReset();
    mockAuditLog.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    (Platform as any).OS = originalOS;
  });

  it('maps store files into display files with formatted size and date', () => {
    setupStores([
      {
        id: 'f1',
        name: 'a.txt',
        size: 2048,
        type: 'txt',
        modifiedAt: '2026-01-01T00:00:00Z',
        isPQCProtected: false,
      },
    ]);
    const { result } = renderHook(() => useDecrypt());
    expect(result.current.vaultFiles).toHaveLength(1);
    expect(result.current.vaultFiles[0]).toMatchObject({
      id: 'f1',
      name: 'a.txt',
      size: '2.0 KB',
      sizeBytes: 2048,
    });
  });

  it('filters files by search query (case-insensitive substring)', () => {
    setupStores([
      { id: 'f1', name: 'Resume.pdf', size: 10, type: 'pdf', isPQCProtected: false },
      { id: 'f2', name: 'photo.png', size: 10, type: 'png', isPQCProtected: false },
    ]);
    const { result } = renderHook(() => useDecrypt());

    act(() => result.current.setSearchQuery('RESUME'));
    expect(result.current.filteredFiles.map(f => f.id)).toEqual(['f1']);
  });

  describe('selection', () => {
    it('toggles a single file in and out of the selection set', () => {
      setupStores([{ id: 'f1', name: 'a', size: 1, type: 'txt', isPQCProtected: false }]);
      const { result } = renderHook(() => useDecrypt());

      act(() => result.current.toggleFileSelection('f1'));
      expect(result.current.selectedFiles.has('f1')).toBe(true);
      act(() => result.current.toggleFileSelection('f1'));
      expect(result.current.selectedFiles.has('f1')).toBe(false);
    });

    it('selectAll selects every filtered file, then clears on the second call', () => {
      setupStores([
        { id: 'f1', name: 'a', size: 1, type: 'txt', isPQCProtected: false },
        { id: 'f2', name: 'b', size: 1, type: 'txt', isPQCProtected: false },
      ]);
      const { result } = renderHook(() => useDecrypt());

      act(() => result.current.selectAll());
      expect(result.current.selectedFiles.size).toBe(2);
      act(() => result.current.selectAll());
      expect(result.current.selectedFiles.size).toBe(0);
    });
  });

  it('closeTempView clears the temp view file', () => {
    setupStores();
    const { result } = renderHook(() => useDecrypt());
    act(() => result.current.setTempViewFile({ id: 'x' } as any));
    expect(result.current.tempViewFile).not.toBeNull();
    act(() => result.current.closeTempView());
    expect(result.current.tempViewFile).toBeNull();
  });

  describe('performDecryption', () => {
    it('treats demo/mock files (no encrypted data, vault locked) as a no-op success', async () => {
      setupStores([{ id: 'f1', name: 'demo.txt', size: 10, type: 'txt', isPQCProtected: false }]);
      const { result } = renderHook(() => useDecrypt());

      act(() => result.current.toggleFileSelection('f1'));
      let res!: { success: boolean; fileNames?: string[] };
      await act(async () => {
        res = await result.current.performDecryption('pw');
      });

      expect(res.success).toBe(true);
      expect(res.fileNames).toEqual(['demo.txt']);
      expect(mockDecryptData).not.toHaveBeenCalled();
      expect(mockOrch.readFile).not.toHaveBeenCalled();
    });

    it('decrypts via the USB orchestrator path and downloads on save mode', async () => {
      mockOrch.isUnlocked.mockReturnValue(true);
      mockOrch.readFile.mockResolvedValue({ data: new Uint8Array([1, 2, 3]) });
      setupStores([{ id: 'f1', name: 'secret.bin', size: 3, type: 'bin', isPQCProtected: false }]);
      const { result } = renderHook(() => useDecrypt());

      act(() => result.current.toggleFileSelection('f1'));
      let res!: { success: boolean };
      await act(async () => {
        res = await result.current.performDecryption('pw');
      });

      expect(res.success).toBe(true);
      expect(mockOrch.readFile).toHaveBeenCalledWith('f1');
      expect(mockDownload).toHaveBeenCalledWith(expect.any(Uint8Array), 'secret.bin', 'bin');
      expect(result.current.decryptionProgress).toBe(100);
      expect(mockAuditLog).toHaveBeenCalledWith(
        'decrypt',
        'secret.bin',
        expect.objectContaining({ source: 'usb_vault' })
      );
    });

    it('sets a temp-view blob URL on view mode via the orchestrator path', async () => {
      mockOrch.isUnlocked.mockReturnValue(true);
      mockOrch.readFile.mockResolvedValue({ data: new Uint8Array([9, 9]) });
      setupStores([{ id: 'f1', name: 'img.png', size: 2, type: 'png', isPQCProtected: false }]);
      const { result } = renderHook(() => useDecrypt());

      act(() => {
        result.current.setDecryptMode('view');
        result.current.toggleFileSelection('f1');
      });
      await act(async () => {
        await result.current.performDecryption('pw');
      });

      expect(result.current.tempViewFile).toMatchObject({
        id: 'f1',
        type: 'image/png', // resolved from extension-only type
      });
      expect(result.current.tempViewFile?.uri).toContain('blob:');
    });

    it('decrypts via the Zustand/memory path using decryptData', async () => {
      mockDecryptData.mockResolvedValue({ data: new Uint8Array([7]) });
      setupStores([
        {
          id: 'f1',
          name: 'note.txt',
          size: 1,
          type: 'txt',
          isPQCProtected: false,
          saltHex: 'aabbcc',
          encryptedBlob: 'blob-data',
        },
      ]);
      const { result } = renderHook(() => useDecrypt());

      act(() => result.current.toggleFileSelection('f1'));
      let res!: { success: boolean };
      await act(async () => {
        res = await result.current.performDecryption('the-password');
      });

      expect(res.success).toBe(true);
      expect(mockDecryptData).toHaveBeenCalledWith(
        'blob-data',
        'the-password',
        expect.any(Uint8Array),
        expect.anything(),
        false,
        undefined,
        expect.any(Function)
      );
      expect(mockDownload).toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        'decrypt',
        'note.txt',
        expect.objectContaining({ mode: 'save' })
      );
    });

    it('fetches the encrypted blob from webStorage when not in memory', async () => {
      mockGetBlob.mockResolvedValue('fetched-blob');
      mockDecryptData.mockResolvedValue({ data: new Uint8Array([1]) });
      setupStores([
        {
          id: 'f1',
          vaultId: 'vault-1',
          name: 'doc.txt',
          size: 1,
          type: 'txt',
          isPQCProtected: false,
          saltHex: 'ab',
        },
      ]);
      const { result } = renderHook(() => useDecrypt());

      act(() => result.current.toggleFileSelection('f1'));
      await act(async () => {
        await result.current.performDecryption('pw');
      });

      expect(mockGetBlob).toHaveBeenCalledWith('vault-1', 'f1');
      expect(mockDecryptData).toHaveBeenCalled();
    });

    it('returns a "no encrypted data found" error when the blob cannot be located', async () => {
      mockGetBlob.mockResolvedValue(null);
      setupStores([
        {
          id: 'f1',
          vaultId: 'vault-1',
          name: 'lost.txt',
          size: 1,
          type: 'txt',
          isPQCProtected: false,
          saltHex: 'ab',
        },
      ]);
      const { result } = renderHook(() => useDecrypt());

      act(() => result.current.toggleFileSelection('f1'));
      let res!: { success: boolean; error?: string };
      await act(async () => {
        res = await result.current.performDecryption('pw');
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('No encrypted data found');
    });

    it('maps an auth/tag error to a friendly incorrect-password message and audits the failure', async () => {
      mockDecryptData.mockRejectedValue(new Error('auth tag mismatch'));
      setupStores([
        {
          id: 'f1',
          name: 'enc.txt',
          size: 1,
          type: 'txt',
          isPQCProtected: false,
          saltHex: 'ab',
          encryptedBlob: 'blob',
        },
      ]);
      const { result } = renderHook(() => useDecrypt());

      act(() => result.current.toggleFileSelection('f1'));
      let res!: { success: boolean; error?: string };
      await act(async () => {
        res = await result.current.performDecryption('wrong');
      });

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Incorrect password or corrupted data/);
      expect(mockAuditLog).toHaveBeenCalledWith(
        'decrypt',
        'enc.txt',
        expect.objectContaining({ isAuthError: true }),
        'error'
      );
    });
  });
});
