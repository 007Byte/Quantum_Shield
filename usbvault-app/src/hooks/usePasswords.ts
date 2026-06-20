// PH4-FIX: usePasswords hook - extracted logic layer for password management
import { useState, useCallback, useEffect } from 'react';
import * as Clipboard from 'expo-clipboard';
import { validatePassword, levelToLabel } from '@/utils/passwordPolicy';
import { passwordService } from '@/services/passwordService';
import {
  importPasswords,
  validateImportFile,
  formatLabel,
  ImportResult,
  ImportProgress,
  type ImportFormat,
} from '@/services/importService';
import { auditService } from '@/services/auditService';
import { formatRelativeTime } from '@/utils/formatters';
import { useLanguage } from '@/hooks/useLanguage';

export interface PasswordEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  url: string;
  category: string;
  strength: 'Strong' | 'Medium' | 'Weak';
  lastModified: string;
}

export interface PasswordFormData {
  title: string;
  username: string;
  password: string;
  url: string;
  category: string;
}

const INITIAL_FORM_DATA: PasswordFormData = {
  title: '',
  username: '',
  password: '',
  url: '',
  category: '',
};

export function usePasswords() {
  const [passwords, setPasswords] = useState<PasswordEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<PasswordFormData>(INITIAL_FORM_DATA);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { t } = useLanguage();

  const loadPasswords = useCallback(async () => {
    try {
      const entries = await passwordService.loadEntries();
      setPasswords(
        entries.map(e => ({
          id: e.id,
          title: e.title,
          username: e.username,
          password: e.password,
          url: e.url,
          category: e.category,
          strength: e.strength,
          lastModified: formatRelativeTime(e.lastModified, t),
        }))
      );
    } catch {
      /* ignore */
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadPasswords();
  }, [loadPasswords]);

  const filteredEntries = passwords.filter(
    entry =>
      entry.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'Strong':
        return '#10B981';
      case 'Medium':
        return '#FBBF24';
      case 'Weak':
        return '#EF4444';
      default:
        return '#9CA3AF';
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM_DATA);
  };

  const openEditModal = (password: PasswordEntry) => {
    setEditingId(password.id);
    setFormData({
      title: password.title,
      username: password.username,
      password: password.password,
      url: password.url,
      category: password.category,
    });
  };

  const calculatePasswordStrength = (pwd: string): PasswordEntry['strength'] => {
    const result = validatePassword(pwd);
    const label = levelToLabel(result.level);
    if (label === 'Excellent' || label === 'Strong') return 'Strong';
    if (label === 'Moderate' || label === 'Fair') return 'Medium';
    return 'Weak';
  };

  const generatePassword = () => {
    const generated = passwordService.generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      digits: true,
      symbols: true,
    });
    setFormData(prev => ({ ...prev, password: generated }));
  };

  const savePassword = async (): Promise<{ success: boolean; error?: string }> => {
    if (!formData.title.trim() || !formData.username.trim() || !formData.password.trim()) {
      return { success: false, error: 'Please fill in all required fields' };
    }

    const strength = calculatePasswordStrength(formData.password);

    try {
      if (editingId) {
        await passwordService.updateEntry(editingId, {
          title: formData.title,
          username: formData.username,
          password: formData.password,
          url: formData.url,
          category: formData.category,
          strength,
        });
      } else {
        await passwordService.addEntry({
          title: formData.title,
          username: formData.username,
          password: formData.password,
          url: formData.url,
          category: formData.category,
          strength,
        });
      }

      setFormData(INITIAL_FORM_DATA);
      setEditingId(null);
      await loadPasswords();
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const copyPassword = async (passwordText: string, entryId: string) => {
    try {
      await Clipboard.setStringAsync(passwordText);
      setCopyFeedback(entryId);
      setTimeout(() => setCopyFeedback(null), 2000);
      return true;
    } catch {
      return false;
    }
  };

  const deletePassword = async (entryId: string): Promise<{ success: boolean }> => {
    try {
      await passwordService.deleteEntry(entryId);
      await loadPasswords();
      return { success: true };
    } catch {
      return { success: false };
    }
  };

  const validateAndPrepareImport = (content: string) => {
    const validation = validateImportFile(content);
    if (!validation.valid) {
      return {
        valid: false,
        error:
          'File format not recognized. Supported: Bitwarden, 1Password, LastPass, Chrome (CSV), KeePass (JSON).',
      };
    }
    return {
      valid: true,
      format: validation.format,
      formatName: formatLabel(validation.format ?? 'auto'),
      estimatedCount: validation.estimatedCount,
    };
  };

  const performImport = async (content: string, format: ImportFormat, fileName: string) => {
    try {
      const existingEntries = await passwordService.loadEntries();
      const result = await importPasswords(content, format || 'auto', existingEntries, progress =>
        setImportProgress(progress)
      );

      setImportResult(result);

      if (result.entries.length > 0) {
        for (const entry of result.entries) {
          await passwordService.addEntry({
            title: entry.title,
            username: entry.username,
            password: entry.password,
            url: entry.url,
            category: entry.category,
            strength: entry.strength,
          });
        }
        await loadPasswords();
        await auditService
          .log('settings_change', 'password_import', {
            source: formatLabel(format),
            imported: result.imported,
            duplicates: result.duplicates,
            fileName,
          })
          .catch(() => {});
      }

      return { success: true, result };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      setImportProgress(null);
    }
  };

  return {
    // State
    passwords,
    isLoading,
    searchQuery,
    setSearchQuery,
    editingId,
    setEditingId,
    formData,
    setFormData,
    copyFeedback,
    importProgress,
    setImportProgress,
    importResult,
    setImportResult,
    // Derived
    filteredEntries,
    // Actions
    loadPasswords,
    openAddModal,
    openEditModal,
    calculatePasswordStrength,
    generatePassword,
    savePassword,
    copyPassword,
    deletePassword,
    validateAndPrepareImport,
    performImport,
    getStrengthColor,
  };
}
