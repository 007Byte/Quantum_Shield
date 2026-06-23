/**
 * TextEncryptorTool — Inline tool for encrypting / decrypting text snippets.
 *
 * Uses the Web Crypto API (AES-256-GCM + PBKDF2) for a self-contained approach
 * that works on all platforms. The app polyfills crypto.subtle via platformSetup.ts.
 *
 * @module components/tools/TextEncryptorTool
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';

// ─── Props ───────────────────────────────────────────────────────────────────

interface TextEncryptorToolProps {
  t?: (key: string) => string;
}

// ─── Crypto Helpers ──────────────────────────────────────────────────────────

const deriveKey = async (passphrase: string, salt: Uint8Array): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptText = async (plaintext: string, passphrase: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  // Combine salt + iv + ciphertext and base64 encode
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
};

const decryptText = async (encoded: string, passphrase: string): Promise<string> => {
  const data = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const salt = data.slice(0, 16);
  const iv = data.slice(16, 28);
  const ciphertext = data.slice(28);
  const key = await deriveKey(passphrase, salt);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuffer);
};

// ─── Passphrase Strength ─────────────────────────────────────────────────────

type StrengthLevel = 'weak' | 'fair' | 'strong' | 'excellent';

// Note: Color values are applied at render time via theme to support dynamic theme switching
const getStrength = (pass: string): { level: StrengthLevel; segments: number } => {
  let score = 0;
  if (pass.length >= 8) score++;
  if (pass.length >= 12) score++;
  if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
  if (/\d/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  if (score <= 1) return { level: 'weak', segments: 1 };
  if (score <= 2) return { level: 'fair', segments: 2 };
  if (score <= 3) return { level: 'strong', segments: 3 };
  return { level: 'excellent', segments: 4 };
};

// ─── Component ───────────────────────────────────────────────────────────────

export function TextEncryptorTool({ t: externalT }: TextEncryptorToolProps) {
  const { theme } = useTheme();
  const { t: internalT } = useLanguage();
  const t = externalT || internalT;
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [passphrase, setPassphrase] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const strength = passphrase.length > 0 ? getStrength(passphrase) : null;
  const canSubmit = passphrase.length > 0 && input.length > 0 && !loading;

  const handleModeSwitch = useCallback(
    (next: 'encrypt' | 'decrypt') => {
      if (next === mode) return;
      setMode(next);
      setOutput('');
      setError('');
    },
    [mode]
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    setOutput('');
    try {
      if (mode === 'encrypt') {
        const result = await encryptText(input, passphrase);
        setOutput(result);
      } else {
        const result = await decryptText(input, passphrase);
        setOutput(result);
      }
    } catch {
      setError(mode === 'decrypt' ? t('tools.decryptFailed') : t('tools.encryptFailed'));
    } finally {
      setLoading(false);
    }
  }, [canSubmit, mode, input, passphrase]);

  const handleCopy = useCallback(async () => {
    if (!output) return;
    await Clipboard.setStringAsync(output);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [output]);

  // ── Render ───────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* ── Mode Toggle ──────────────────────────────────────── */}
      <View style={styles.modeRow}>
        {(['encrypt', 'decrypt'] as const).map(m => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => handleModeSwitch(m)}
              style={(state: any) => [
                styles.modePill,
                { backgroundColor: active ? undefined : theme.L3.base.native.backgroundColor },
                active && styles.modePillActive,
                !active && resolveLayerStyle(theme.L3.base),
                state.hovered && !active && styles.modePillHover,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Feather
                name={m === 'encrypt' ? 'lock' : 'unlock'}
                size={14}
                color={active ? theme.semantic.cyan : theme.L2.base.text.secondary}
              />
              <Text
                style={[
                  styles.modePillText,
                  { color: active ? theme.semantic.cyan : theme.L2.base.text.secondary },
                  active && styles.modePillTextActive,
                ]}
              >
                {t(m === 'encrypt' ? 'tools.encryptText' : 'tools.decryptText')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Passphrase Input ─────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.L2.base.text.primary }]}>
          {t('tools.passphrasePlaceholder').replace('...', '')}
        </Text>
        <TextInput
          style={[styles.inputField, resolveLayerStyle(theme.L3.base)]}
          value={passphrase}
          onChangeText={setPassphrase}
          placeholder={t('tools.passphrasePlaceholder')}
          placeholderTextColor={theme.L2.base.text.secondary}
          secureTextEntry
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t('tools.passphrasePlaceholder')}
        />

        {/* Strength Indicator */}
        {strength &&
          (() => {
            const strengthColors = {
              weak: theme.semantic.danger,
              fair: theme.semantic.warning,
              strong: theme.semantic.success,
              excellent: theme.semantic.cyan,
            };
            const color = strengthColors[strength.level];
            return (
              <View style={styles.strengthRow}>
                <Text style={[styles.strengthLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('tools.passphraseStrength')}:
                </Text>
                <View style={styles.strengthBar}>
                  {[1, 2, 3, 4].map(seg => (
                    <View
                      key={seg}
                      style={[
                        styles.strengthSegment,
                        {
                          backgroundColor:
                            seg <= strength.segments ? color : 'rgba(183,178,217,0.12)',
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLevel, { color }]}>
                  {strength.level.charAt(0).toUpperCase() + strength.level.slice(1)}
                </Text>
              </View>
            );
          })()}
      </View>

      {/* ── Input Text Area ──────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.L2.base.text.primary }]}>
          {t(mode === 'encrypt' ? 'tools.inputText' : 'tools.ciphertextLabel')}
        </Text>
        <TextInput
          accessibilityLabel={t('tools.textInput')}
          style={[
            styles.inputField,
            styles.textArea,
            mode === 'decrypt' && styles.monoText,
            resolveLayerStyle(theme.L3.base),
          ]}
          value={input}
          onChangeText={setInput}
          placeholder={t(
            mode === 'encrypt' ? 'tools.textPlaceholder' : 'tools.ciphertextPlaceholder'
          )}
          placeholderTextColor={theme.L2.base.text.secondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {/* ── Submit Button ────────────────────────────────────── */}
      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={(state: any) => [
          styles.submitBtn,
          !canSubmit && styles.submitBtnDisabled,
          state.hovered && canSubmit && styles.submitBtnHover,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t(mode === 'encrypt' ? 'tools.encryptText' : 'tools.decryptText')}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme.L2.base.text.primary} />
        ) : (
          <>
            <Feather
              name={mode === 'encrypt' ? 'lock' : 'unlock'}
              size={16}
              color={theme.L2.base.text.primary}
            />
            <Text style={[styles.submitBtnText, { color: theme.L2.base.text.primary }]}>
              {loading
                ? t('tools.processing')
                : t(mode === 'encrypt' ? 'tools.encryptText' : 'tools.decryptText')}
            </Text>
          </>
        )}
      </Pressable>

      {/* ── Output Area ──────────────────────────────────────── */}
      {(output.length > 0 || error.length > 0) && (
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: theme.L2.base.text.primary }]}>
            {t(mode === 'encrypt' ? 'tools.encryptedOutput' : 'tools.decryptedOutput')}
          </Text>

          {error.length > 0 ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color={theme.semantic.danger} />
              <Text style={[styles.errorText, { color: theme.semantic.danger }]}>{error}</Text>
            </View>
          ) : (
            <View style={[styles.outputWrapper, resolveLayerStyle(theme.L3.base)]}>
              <TextInput
                style={[
                  styles.outputField,
                  mode === 'encrypt' && styles.monoText,
                  { color: theme.L2.base.text.primary },
                ]}
                value={output}
                multiline
                editable={false}
                selectTextOnFocus
                accessibilityLabel={t('tools.textInput')}
              />
              <Pressable
                onPress={handleCopy}
                style={(state: any) => [styles.copyBtn, state.hovered && styles.copyBtnHover]}
                accessibilityRole="button"
                accessibilityLabel={t('tools.copied')}
              >
                <Feather
                  name={copied ? 'check' : 'copy'}
                  size={14}
                  color={copied ? theme.semantic.success : theme.semantic.cyan}
                />
                {copied && (
                  <Text style={[styles.copiedText, { color: theme.semantic.success }]}>
                    {t('tools.copied')}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
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

  // ── Mode Toggle ──────────────────────────────────────────
  modeRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.xs,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  modePillActive: {
    borderColor: 'rgba(34,211,238,0.6)',
    backgroundColor: 'rgba(34,211,238,0.12)',
    ...webOnly({
      boxShadow: '0 0 14px rgba(34,211,238,0.25), 0 0 4px rgba(34,211,238,0.15)',
    }),
  },
  modePillHover: {
    borderColor: 'rgba(139,92,246,0.45)',
    backgroundColor: 'rgba(139,92,246,0.10)',
    ...webOnly({
      boxShadow: '0 0 8px rgba(139,92,246,0.15)',
    }),
  },
  modePillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modePillTextActive: {
    fontWeight: '700',
  },

  // ── Field Groups ─────────────────────────────────────────
  fieldGroup: {
    gap: dashboardSpacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Inputs ───────────────────────────────────────────────
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
    minHeight: 100,
    textAlignVertical: 'top',
    ...webOnly({
      resize: 'vertical',
    }),
  },
  monoText: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    fontSize: 13,
  },

  // ── Strength Indicator ───────────────────────────────────
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  strengthBar: {
    flexDirection: 'row',
    gap: 3,
    flex: 1,
    maxWidth: 120,
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLevel: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Submit Button ────────────────────────────────────────
  submitBtn: {
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
  submitBtnDisabled: {
    opacity: 0.45,
    ...webOnly({
      cursor: 'not-allowed',
    }),
  },
  submitBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.42)',
    borderColor: 'rgba(139,92,246,0.65)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 20px rgba(139,92,246,0.35), 0 0 18px rgba(139,92,246,0.25)',
    }),
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Output Area ──────────────────────────────────────────
  outputWrapper: {
    borderRadius: 10,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dashboardSpacing.sm,
  },
  outputField: {
    flex: 1,
    fontSize: 14,
    minHeight: 60,
    ...webOnly({
      outlineWidth: 0,
    }),
  },

  // ── Copy Button ──────────────────────────────────────────
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.25)',
    flexShrink: 0,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    }),
  },
  copyBtnHover: {
    backgroundColor: 'rgba(34,211,238,0.20)',
    borderColor: 'rgba(34,211,238,0.45)',
    ...webOnly({
      boxShadow: '0 0 10px rgba(34,211,238,0.2)',
    }),
  },
  copiedText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Error State ──────────────────────────────────────────
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
