/**
 * Unit tests for usePasswords.
 *
 * Boundaries mocked (everything the hook orchestrates that lives outside it):
 *   - passwordService     (CRUD + generation)
 *   - importService       (validate / import / format helpers)
 *   - auditService        (audit logging)
 *   - copyWithAutoClear   (clipboard with auto-wipe)
 *   - passwordPolicy      (validatePassword / levelToLabel — strength mapping)
 *   - formatRelativeTime  (timestamp formatting)
 *   - useLanguage         (translation hook)
 *
 * We assert the real orchestration: entries load + map on mount, search
 * filtering, strength-label mapping, CRUD wiring + reload, and the import flow.
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { usePasswords } from '../usePasswords';
import { passwordService } from '@/services/passwordService';
import { copyWithAutoClear } from '@/services/security/appProtection';
import { validatePassword, levelToLabel } from '@/utils/passwordPolicy';
import { importPasswords, validateImportFile } from '@/services/importService';
import { auditService } from '@/services/auditService';

jest.mock('@/services/passwordService', () => ({
  passwordService: {
    loadEntries: jest.fn(),
    addEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
    generatePassword: jest.fn(),
  },
}));

jest.mock('@/services/security/appProtection', () => ({
  copyWithAutoClear: jest.fn(),
}));

jest.mock('@/utils/passwordPolicy', () => ({
  validatePassword: jest.fn(),
  levelToLabel: jest.fn(),
}));

jest.mock('@/services/importService', () => ({
  importPasswords: jest.fn(),
  validateImportFile: jest.fn(),
  formatLabel: jest.fn((f: string) => `label:${f}`),
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/utils/formatters', () => ({
  formatRelativeTime: jest.fn(() => 'just now'),
}));

jest.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'en', setLanguage: jest.fn() }),
}));

const mockLoad = passwordService.loadEntries as jest.Mock;
const mockAdd = passwordService.addEntry as jest.Mock;
const mockUpdate = passwordService.updateEntry as jest.Mock;
const mockDelete = passwordService.deleteEntry as jest.Mock;
const mockGenerate = passwordService.generatePassword as jest.Mock;
const mockCopy = copyWithAutoClear as jest.Mock;
const mockValidate = validatePassword as jest.Mock;
const mockLevelToLabel = levelToLabel as jest.Mock;
const mockImport = importPasswords as jest.Mock;
const mockValidateFile = validateImportFile as jest.Mock;
const mockAuditLog = auditService.log as jest.Mock;

function makeEntry(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'id-1',
    title: 'GitHub',
    username: 'octocat',
    password: 'pw',
    url: 'github.com',
    category: 'dev',
    strength: 'Strong',
    lastModified: 1700000000000,
    ...over,
  };
}

describe('usePasswords', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // clearAllMocks wipes call history but NOT implementations, so re-establish
    // a clean default impl for every service mock to prevent a rejected/resolved
    // value set in one test from leaking into the next.
    mockLoad.mockReset().mockResolvedValue([]);
    mockAdd.mockReset().mockResolvedValue(undefined);
    mockUpdate.mockReset().mockResolvedValue(undefined);
    mockDelete.mockReset().mockResolvedValue(true);
    mockGenerate.mockReset().mockReturnValue('generated');
    mockCopy.mockReset().mockResolvedValue(undefined);
    mockImport.mockReset();
    mockValidateFile.mockReset();
    mockAuditLog.mockReset().mockResolvedValue(undefined);
    mockValidate.mockReturnValue({ level: 3 });
    mockLevelToLabel.mockReturnValue('Strong');
  });

  it('loads and maps entries on mount, then clears loading', async () => {
    mockLoad.mockResolvedValue([makeEntry(), makeEntry({ id: 'id-2', title: 'GitLab' })]);
    const { result } = renderHook(() => usePasswords());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.passwords).toHaveLength(2);
    expect(result.current.passwords[0]).toMatchObject({
      id: 'id-1',
      title: 'GitHub',
      lastModified: 'just now',
    });
  });

  it('swallows a load failure but still clears loading', async () => {
    mockLoad.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => usePasswords());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.passwords).toEqual([]);
  });

  it('filters entries by title, username, or url (case-insensitive)', async () => {
    mockLoad.mockResolvedValue([
      makeEntry({ id: 'a', title: 'GitHub', username: 'octocat', url: 'github.com' }),
      makeEntry({ id: 'b', title: 'Bank', username: 'me', url: 'bank.example' }),
    ]);
    const { result } = renderHook(() => usePasswords());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setSearchQuery('OCTO'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['a']);

    act(() => result.current.setSearchQuery('bank'));
    expect(result.current.filteredEntries.map(e => e.id)).toEqual(['b']);
  });

  describe('calculatePasswordStrength', () => {
    it.each([
      ['Excellent', 'Strong'],
      ['Strong', 'Strong'],
      ['Moderate', 'Medium'],
      ['Fair', 'Medium'],
      ['Weak', 'Weak'],
    ])('maps policy label %s -> %s', async (label, expected) => {
      mockLevelToLabel.mockReturnValue(label);
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.calculatePasswordStrength('whatever')).toBe(expected);
    });
  });

  it('returns colors for each strength bucket', async () => {
    const { result } = renderHook(() => usePasswords());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.getStrengthColor('Strong')).toBe('#10B981');
    expect(result.current.getStrengthColor('Medium')).toBe('#FBBF24');
    expect(result.current.getStrengthColor('Weak')).toBe('#EF4444');
    expect(result.current.getStrengthColor('Other')).toBe('#9CA3AF');
  });

  it('populates the form on openEditModal and resets it on openAddModal', async () => {
    const { result } = renderHook(() => usePasswords());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const entry = {
      id: 'id-9',
      title: 'T',
      username: 'U',
      password: 'P',
      url: 'example.com',
      category: 'cat',
      strength: 'Strong' as const,
      lastModified: 'now',
    };
    act(() => result.current.openEditModal(entry));
    expect(result.current.editingId).toBe('id-9');
    expect(result.current.formData).toMatchObject({
      title: 'T',
      username: 'U',
      url: 'example.com',
    });

    act(() => result.current.openAddModal());
    expect(result.current.editingId).toBeNull();
    expect(result.current.formData.title).toBe('');
  });

  it('generates a password and writes it into the form', async () => {
    mockGenerate.mockReturnValue('Gen-Pass-Value');
    const { result } = renderHook(() => usePasswords());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.generatePassword());
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ length: 20, symbols: true })
    );
    expect(result.current.formData.password).toBe('Gen-Pass-Value');
  });

  describe('savePassword', () => {
    it('rejects when required fields are missing', async () => {
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let res!: { success: boolean; error?: string };
      await act(async () => {
        res = await result.current.savePassword();
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/required fields/);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('adds a new entry, resets form, and reloads', async () => {
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() =>
        result.current.setFormData({
          title: 'New',
          username: 'user',
          password: 'secret',
          url: 'site.com',
          category: 'misc',
        })
      );

      let res!: { success: boolean };
      await act(async () => {
        res = await result.current.savePassword();
      });

      expect(res.success).toBe(true);
      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'New', username: 'user', strength: 'Strong' })
      );
      expect(mockUpdate).not.toHaveBeenCalled();
      // loadEntries: once on mount + once after save
      expect(mockLoad).toHaveBeenCalledTimes(2);
      expect(result.current.formData.title).toBe('');
    });

    it('updates an existing entry when editingId is set', async () => {
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setEditingId('edit-1');
        result.current.setFormData({
          title: 'T',
          username: 'U',
          password: 'P',
          url: '',
          category: '',
        });
      });

      let res!: { success: boolean };
      await act(async () => {
        res = await result.current.savePassword();
      });

      expect(res.success).toBe(true);
      expect(mockUpdate).toHaveBeenCalledWith('edit-1', expect.objectContaining({ title: 'T' }));
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('returns the service error message on failure', async () => {
      mockAdd.mockRejectedValue(new Error('storage full'));
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() =>
        result.current.setFormData({
          title: 'T',
          username: 'U',
          password: 'P',
          url: '',
          category: '',
        })
      );
      let res!: { success: boolean; error?: string };
      await act(async () => {
        res = await result.current.savePassword();
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('storage full');
    });
  });

  describe('copyPassword', () => {
    it('routes through copyWithAutoClear, sets feedback, then clears it', async () => {
      mockCopy.mockResolvedValue(undefined);
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      // Switch to fake timers only after the async mount effect has settled, so
      // waitFor's real-timer polling isn't frozen.
      jest.useFakeTimers();
      try {
        let ok: boolean | undefined;
        await act(async () => {
          ok = await result.current.copyPassword('the-secret', 'entry-42');
        });
        expect(ok).toBe(true);
        expect(mockCopy).toHaveBeenCalledWith('the-secret');
        expect(result.current.copyFeedback).toBe('entry-42');

        act(() => {
          jest.advanceTimersByTime(2000);
        });
        expect(result.current.copyFeedback).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('returns false if the clipboard copy throws', async () => {
      mockCopy.mockRejectedValue(new Error('denied'));
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.copyPassword('x', 'e');
      });
      expect(ok).toBe(false);
      expect(result.current.copyFeedback).toBeNull();
    });
  });

  describe('deletePassword', () => {
    it('deletes then reloads', async () => {
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let res!: { success: boolean };
      await act(async () => {
        res = await result.current.deletePassword('id-1');
      });
      expect(res.success).toBe(true);
      expect(mockDelete).toHaveBeenCalledWith('id-1');
      expect(mockLoad).toHaveBeenCalledTimes(2);
    });

    it('returns failure when the service throws', async () => {
      mockDelete.mockRejectedValue(new Error('nope'));
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let res!: { success: boolean };
      await act(async () => {
        res = await result.current.deletePassword('id-1');
      });
      expect(res.success).toBe(false);
    });
  });

  describe('validateAndPrepareImport', () => {
    it('reports an unrecognized file format', async () => {
      mockValidateFile.mockReturnValue({ valid: false });
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const out = result.current.validateAndPrepareImport('garbage');
      expect(out.valid).toBe(false);
      expect(out.error).toMatch(/format not recognized/i);
    });

    it('returns format metadata for a recognized file', async () => {
      mockValidateFile.mockReturnValue({
        valid: true,
        format: 'bitwarden',
        estimatedCount: 7,
      });
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const out = result.current.validateAndPrepareImport('content');
      expect(out).toMatchObject({
        valid: true,
        format: 'bitwarden',
        formatName: 'label:bitwarden',
        estimatedCount: 7,
      });
    });
  });

  describe('performImport', () => {
    it('imports entries, persists each, reloads, and audits', async () => {
      mockLoad.mockResolvedValue([]);
      const imported = {
        imported: 2,
        duplicates: 1,
        entries: [
          {
            title: 'A',
            username: 'a',
            password: 'p',
            url: '',
            category: '',
            strength: 'Strong',
          },
          {
            title: 'B',
            username: 'b',
            password: 'p',
            url: '',
            category: '',
            strength: 'Weak',
          },
        ],
      };
      mockImport.mockResolvedValue(imported);

      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let res!: { success: boolean; result?: unknown };
      await act(async () => {
        res = await result.current.performImport('csv-content', 'bitwarden', 'export.csv');
      });

      expect(res.success).toBe(true);
      expect(mockImport).toHaveBeenCalled();
      expect(mockAdd).toHaveBeenCalledTimes(2);
      expect(mockAuditLog).toHaveBeenCalledWith(
        'settings_change',
        'password_import',
        expect.objectContaining({ imported: 2, duplicates: 1, fileName: 'export.csv' })
      );
      expect(result.current.importResult).toEqual(imported);
      // importProgress is reset to null in finally
      expect(result.current.importProgress).toBeNull();
    });

    it('does not persist or audit when no entries are imported', async () => {
      mockImport.mockResolvedValue({ imported: 0, duplicates: 0, entries: [] });
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      await act(async () => {
        await result.current.performImport('c', 'auto', 'f.csv');
      });
      expect(mockAdd).not.toHaveBeenCalled();
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    it('returns the error message when import throws', async () => {
      mockImport.mockRejectedValue(new Error('parse error'));
      const { result } = renderHook(() => usePasswords());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      let res!: { success: boolean; error?: string };
      await act(async () => {
        res = await result.current.performImport('c', 'auto', 'f.csv');
      });
      expect(res.success).toBe(false);
      expect(res.error).toBe('parse error');
      expect(result.current.importProgress).toBeNull();
    });
  });
});
