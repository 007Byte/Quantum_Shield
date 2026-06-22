/**
 * SecureNotepadTool — Inline encrypted scratchpad for sensitive notes.
 *
 * Locks/unlocks notes with a passphrase using AES-256-GCM (PBKDF2 key
 * derivation) via the Web Crypto API. Auto-locks when the app goes to
 * background or the tab becomes hidden. Persists encrypted data to
 * expo-secure-store (native) or localStorage (web).
 *
 * @module components/tools/SecureNotepadTool
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';

// ─── Props ───────────────────────────────────────────────────────────────────

interface SecureNotepadToolProps {
  t?: (key: string) => string;
}

// ─── Storage Helpers ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'usbvault:secure_notepad';

const saveEncrypted = async (ciphertext: string): Promise<void> => {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY, ciphertext);
    return;
  }
  // expo-secure-store has ~2KB limit — chunk if needed
  const SecureStore = await import('expo-secure-store');
  if (ciphertext.length <= 2048) {
    await SecureStore.setItemAsync(STORAGE_KEY, ciphertext);
  } else {
    const chunks = Math.ceil(ciphertext.length / 2048);
    await SecureStore.setItemAsync(`${STORAGE_KEY}_chunks`, String(chunks));
    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(
        `${STORAGE_KEY}_${i}`,
        ciphertext.slice(i * 2048, (i + 1) * 2048)
      );
    }
  }
};

const loadEncrypted = async (): Promise<string | null> => {
  if (Platform.OS === 'web') {
    return localStorage.getItem(STORAGE_KEY);
  }
  const SecureStore = await import('expo-secure-store');
  const direct = await SecureStore.getItemAsync(STORAGE_KEY);
  if (direct) return direct;
  // Check for chunked storage
  const chunksStr = await SecureStore.getItemAsync(`${STORAGE_KEY}_chunks`);
  if (!chunksStr) return null;
  const chunks = parseInt(chunksStr, 10);
  let result = '';
  for (let i = 0; i < chunks; i++) {
    result += (await SecureStore.getItemAsync(`${STORAGE_KEY}_${i}`)) || '';
  }
  return result || null;
};

// ─── Crypto Helpers ──────────────────────────────────────────────────────────

const deriveKey = async (pass: string, salt: Uint8Array): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

// ─── Component ───────────────────────────────────────────────────────────────

export function SecureNotepadTool({ t: externalT }: SecureNotepadToolProps) {
  const { theme } = useTheme();
  const { t: internalT } = useLanguage();
  const t = externalT || internalT;
  const [noteText, setNoteText] = useState('');
  const [isLocked, setIsLocked] = useState(true);
  const [passphrase, setPassphrase] = useState('');
  const [hasStoredNote, setHasStoredNote] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Check for existing note on mount ─────────────────────────
  useEffect(() => {
    const check = async () => {
      const stored = await loadEncrypted();
      setHasStoredNote(!!stored);
    };
    check();
  }, []);

  // ── Auto-lock on background / tab hidden ─────────────────────
  useEffect(() => {
    if (Platform.OS === 'web') {
      const handler = () => {
        if (document.visibilityState === 'hidden' && !isLocked && noteText) {
          setNoteText('');
          setIsLocked(true);
          setPassphrase('');
        }
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    }
    const sub = AppState.addEventListener('change', state => {
      if (state === 'background' && !isLocked && noteText) {
        setNoteText('');
        setIsLocked(true);
        setPassphrase('');
      }
    });
    return () => sub.remove();
  }, [isLocked, noteText]);

  // ── Lock: encrypt note + persist ─────────────────────────────
  const lockNote = useCallback(async () => {
    if (!passphrase || !noteText) return;
    setProcessing(true);
    setError(null);
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await deriveKey(passphrase, salt);
      const enc = new TextEncoder();
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(noteText));
      const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(ct).length);
      combined.set(salt);
      combined.set(iv, salt.length);
      combined.set(new Uint8Array(ct), salt.length + iv.length);
      const b64 = btoa(String.fromCharCode(...combined));
      await saveEncrypted(b64);
      setNoteText('');
      setPassphrase('');
      setIsLocked(true);
      setHasStoredNote(true);
    } catch {
      setError(t('tools.noteLockFailed'));
    } finally {
      setProcessing(false);
    }
  }, [passphrase, noteText]);

  // ── Unlock: load + decrypt ───────────────────────────────────
  const unlockNote = useCallback(async () => {
    if (!passphrase) return;
    setProcessing(true);
    setError(null);
    try {
      const stored = await loadEncrypted();
      if (!stored) {
        setError('No stored note found');
        setProcessing(false);
        return;
      }
      const data = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      const salt = data.slice(0, 16);
      const iv = data.slice(16, 28);
      const ct = data.slice(28);
      const key = await deriveKey(passphrase, salt);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      setNoteText(new TextDecoder().decode(plain));
      setIsLocked(false);
      setError(null);
    } catch {
      setError(t('tools.noteUnlockFailed'));
    } finally {
      setProcessing(false);
    }
  }, [passphrase]);

  // ── Create new (first-time unlock) ───────────────────────────
  const createNote = useCallback(() => {
    if (!passphrase) return;
    setIsLocked(false);
    setError(null);
  }, [passphrase]);

  // ── Clear note text ──────────────────────────────────────────
  const clearNote = useCallback(() => {
    setNoteText('');
  }, []);

  // ── Render ───────────────────────────────────────────────────

  if (isLocked) {
    return (
      <View style={styles.container}>
        {/* Status Icon */}
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, styles.statusIconLocked]}>
            <Feather name="lock" size={18} color={theme.semantic.purple} />
          </View>
          <View style={styles.statusTextGroup}>
            <Text style={[styles.statusTitle, { color: theme.L2.base.text.primary }]}>
              {hasStoredNote
                ? t('tools.notepadLocked')
                : t('tools.notepadPlaceholder').split('...')[0]}
            </Text>
            <Text style={[styles.statusSubtitle, { color: theme.L2.base.text.secondary }]}>
              {hasStoredNote ? t('tools.notepadLockedMsg') : t('tools.notepadPlaceholder')}
            </Text>
          </View>
        </View>

        {/* Passphrase Input */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.L2.base.text.primary }]}>
            {t('tools.notepadPassphrase')}
          </Text>
          <TextInput
            accessibilityLabel={t('tools.notepadPassphrase')}
            style={[styles.inputField, resolveLayerStyle(theme.L3.base)]}
            value={passphrase}
            onChangeText={txt => {
              setPassphrase(txt);
              setError(null);
            }}
            placeholder={t('tools.notepadPassphrase')}
            placeholderTextColor={theme.L2.base.text.secondary}
            secureTextEntry
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>

        {/* Unlock / Create Button */}
        <Pressable
          onPress={hasStoredNote ? unlockNote : createNote}
          disabled={!passphrase || processing}
          style={(state: any) => [
            styles.actionBtn,
            (!passphrase || processing) && styles.actionBtnDisabled,
            state.hovered && passphrase && !processing && styles.actionBtnHover,
          ]}
          accessibilityRole="button"
          accessibilityLabel={
            hasStoredNote ? t('tools.notepadUnlock') : t('tools.notepadPlaceholder')
          }
        >
          {processing ? (
            <ActivityIndicator size="small" color={theme.L2.base.text.primary} />
          ) : (
            <>
              <Feather
                name={hasStoredNote ? 'unlock' : 'plus'}
                size={16}
                color={theme.L2.base.text.primary}
              />
              <Text style={[styles.actionBtnText, { color: theme.L2.base.text.primary }]}>
                {processing
                  ? t('tools.processing')
                  : hasStoredNote
                    ? t('tools.notepadUnlock')
                    : t('tools.notepadPlaceholder').split('...')[0]}
              </Text>
            </>
          )}
        </Pressable>

        {/* Error */}
        {error != null && (
          <View style={styles.errorRow}>
            <Feather name="alert-circle" size={14} color={theme.semantic.danger} />
            <Text style={[styles.errorText, { color: theme.semantic.danger }]}>{error}</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Unlocked State ───────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Status */}
      <View style={styles.statusRow}>
        <View style={[styles.statusIcon, styles.statusIconUnlocked]}>
          <Feather name="unlock" size={18} color={theme.semantic.success} />
        </View>
        <View style={styles.statusTextGroup}>
          <Text style={[styles.statusTitle, { color: theme.L2.base.text.primary }]}>
            {t('tools.notepadUnlock')}
          </Text>
          <View style={styles.autoLockRow}>
            <Feather name="clock" size={12} color={theme.semantic.cyan} />
            <Text style={[styles.autoLockText, { color: theme.semantic.cyan }]}>
              {t('tools.autoLocked')}
            </Text>
          </View>
        </View>
      </View>

      {/* Textarea */}
      <View style={styles.fieldGroup}>
        <TextInput
          accessibilityLabel={t('tools.notepadPlaceholder')}
          style={[styles.inputField, styles.textArea, resolveLayerStyle(theme.L3.base)]}
          value={noteText}
          onChangeText={setNoteText}
          placeholder={t('tools.notepadPlaceholder')}
          placeholderTextColor={theme.L2.base.text.secondary}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Text style={[styles.charCount, { color: theme.L2.base.text.secondary }]}>
          {t('tools.charCount').replace('{{count}}', String(noteText.length))}
        </Text>
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        {/* Lock Note Button */}
        <Pressable
          onPress={lockNote}
          disabled={!noteText || processing}
          style={(state: any) => [
            styles.actionBtn,
            (!noteText || processing) && styles.actionBtnDisabled,
            state.hovered && noteText && !processing && styles.actionBtnHover,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('tools.notepadLock')}
        >
          {processing ? (
            <ActivityIndicator size="small" color={theme.L2.base.text.primary} />
          ) : (
            <>
              <Feather name="lock" size={16} color={theme.L2.base.text.primary} />
              <Text style={[styles.actionBtnText, { color: theme.L2.base.text.primary }]}>
                {t('tools.notepadLock')}
              </Text>
            </>
          )}
        </Pressable>

        {/* Clear Button */}
        <Pressable
          onPress={clearNote}
          disabled={!noteText || processing}
          style={(state: any) => [
            styles.clearBtn,
            { backgroundColor: theme.L3.base.native.backgroundColor },
            (!noteText || processing) && styles.clearBtnDisabled,
            state.hovered && noteText && !processing && styles.clearBtnHover,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('tools.clear')}
        >
          <Feather name="trash-2" size={14} color={theme.L2.base.text.secondary} />
          <Text style={[styles.clearBtnText, { color: theme.L2.base.text.secondary }]}>
            {t('tools.clear')}
          </Text>
        </Pressable>
      </View>

      {/* Error */}
      {error != null && (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={14} color={theme.semantic.danger} />
          <Text style={[styles.errorText, { color: theme.semantic.danger }]}>{error}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: dashboardSpacing.md,
  },

  // ── Status Row ─────────────────────────────────────────────
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
  },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusIconLocked: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: 'rgba(139,92,246,0.35)',
    ...webOnly({
      boxShadow: '0 0 14px rgba(139,92,246,0.25)',
    }),
  },
  statusIconUnlocked: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    borderColor: 'rgba(34,197,94,0.35)',
    ...webOnly({
      boxShadow: '0 0 14px rgba(34,197,94,0.25)',
    }),
  },
  statusTextGroup: {
    flex: 1,
    gap: 2,
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  statusSubtitle: {
    fontSize: 13,
    fontWeight: '400',
  },

  // ── Auto-Lock Message ──────────────────────────────────────
  autoLockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  autoLockText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Field Groups ───────────────────────────────────────────
  fieldGroup: {
    gap: dashboardSpacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Inputs ─────────────────────────────────────────────────
  inputField: {
    borderRadius: 10,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
    fontSize: 14,
    ...webOnly({
      outlineWidth: 0,
      transition: 'border-color 0.2s ease',
    }),
  },
  textArea: {
    minHeight: 160,
    textAlignVertical: 'top',
    ...webOnly({
      resize: 'vertical',
    }),
  },

  // ── Character Count ────────────────────────────────────────
  charCount: {
    fontSize: 12,
    fontWeight: '400',
    alignSelf: 'flex-end',
  },

  // ── Action Buttons ─────────────────────────────────────────
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.50)',
    backgroundColor: 'rgba(139,92,246,0.30)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 0 12px rgba(139,92,246,0.2)',
    }),
  },
  actionBtnDisabled: {
    opacity: 0.45,
    ...webOnly({
      cursor: 'not-allowed',
    }),
  },
  actionBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.42)',
    borderColor: 'rgba(139,92,246,0.65)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 20px rgba(139,92,246,0.35), 0 0 18px rgba(139,92,246,0.25)',
    }),
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Clear Button ───────────────────────────────────────────
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.20)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  clearBtnDisabled: {
    opacity: 0.35,
    ...webOnly({
      cursor: 'not-allowed',
    }),
  },
  clearBtnHover: {
    borderColor: 'rgba(239,68,68,0.40)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    ...webOnly({
      boxShadow: '0 0 10px rgba(239,68,68,0.12)',
    }),
  },
  clearBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Error State ────────────────────────────────────────────
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
