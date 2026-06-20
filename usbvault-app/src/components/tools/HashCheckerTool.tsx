/**
 * HashCheckerTool -- Inline tool for computing cryptographic file hashes.
 *
 * Lets the user pick a file via expo-document-picker, select an algorithm
 * (SHA-256, SHA-512, SHA-1), compute the hash, and copy the result to
 * clipboard. Renders inside the inline tool panel on the Tools screen.
 *
 * @module components/tools/HashCheckerTool
 */

import { useState, useCallback } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { formatFileSize } from '@/utils/fileHelpers';
import { useLanguage } from '@/hooks/useLanguage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HashCheckerToolProps {
  t?: (key: string) => string;
}

type Algorithm = 'SHA-256' | 'SHA-512' | 'SHA-1';

const ALGORITHMS: { id: Algorithm; deprecated?: boolean }[] = [
  { id: 'SHA-256' },
  { id: 'SHA-512' },
  { id: 'SHA-1', deprecated: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert an ArrayBuffer to a lowercase hex string. */
function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hex: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    hex[i] = bytes[i].toString(16).padStart(2, '0');
  }
  return hex.join('');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HashCheckerTool({ t: externalT }: HashCheckerToolProps) {
  const { theme } = useTheme();
  const { t: internalT } = useLanguage();
  const t = externalT || internalT;
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [algorithm, setAlgorithm] = useState<Algorithm>('SHA-256');
  const [hashResult, setHashResult] = useState<string>('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // ── Hash computation ────────────────────────────────────────────────────

  const computeHash = useCallback(async (fileUri: string, algo: Algorithm) => {
    setProcessing(true);
    setError('');
    setHashResult('');

    try {
      let arrayBuffer: ArrayBuffer;

      if (Platform.OS === 'web') {
        const response = await fetch(fileUri);
        arrayBuffer = await response.arrayBuffer();
      } else {
        // On native, read as base64 via expo-file-system, then convert
        const FileSystem = await import('expo-file-system/legacy');
        const base64 = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer as ArrayBuffer;
      }

      const hashBuffer = await crypto.subtle.digest(algo, arrayBuffer);
      setHashResult(bufferToHex(hashBuffer));
    } catch (_err) {
      setError(t('tools.hashComputeFailed'));
    } finally {
      setProcessing(false);
    }
  }, []);

  // ── File picker ─────────────────────────────────────────────────────────

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!result.canceled && result.assets?.[0]) {
        const file = result.assets[0];
        setSelectedFile(file);
        setHashResult('');
        setError('');
        setCopied(false);
        await computeHash(file.uri, algorithm);
      }
    } catch (_err) {
      setError(t('tools.fileSelectionFailed'));
    }
  }, [algorithm, computeHash]);

  // ── Algorithm change ────────────────────────────────────────────────────

  const changeAlgorithm = useCallback(
    async (algo: Algorithm) => {
      setAlgorithm(algo);
      setCopied(false);
      if (selectedFile) {
        await computeHash(selectedFile.uri, algo);
      }
    },
    [selectedFile, computeHash]
  );

  // ── Clipboard ───────────────────────────────────────────────────────────

  const copyHash = useCallback(async () => {
    if (!hashResult) return;
    try {
      await Clipboard.setStringAsync(hashResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      // Clipboard write failed silently
    }
  }, [hashResult]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* File picker row */}
      <View style={styles.fileRow}>
        <Pressable
          onPress={pickFile}
          style={(state: any) => [styles.selectFileBtn, state.hovered && styles.selectFileBtnHover]}
          accessibilityRole="button"
          accessibilityLabel={t('tools.selectFile')}
        >
          <Feather name="file-plus" size={16} color={theme.L2.base.text.primary} />
          <Text style={[styles.selectFileBtnText, { color: theme.L2.base.text.primary }]}>
            {t('tools.selectFile')}
          </Text>
        </Pressable>

        {selectedFile && (
          <View style={styles.fileInfo}>
            <Feather name="file" size={14} color={theme.semantic.cyan} />
            <Text
              style={[styles.fileName, { color: theme.L2.base.text.primary }]}
              numberOfLines={1}
            >
              {selectedFile.name}
            </Text>
            {selectedFile.size != null && (
              <Text style={[styles.fileSize, { color: theme.L2.base.text.secondary }]}>
                ({formatFileSize(selectedFile.size)})
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Algorithm selector */}
      <View style={styles.algoSection}>
        <Text style={[styles.algoLabel, { color: theme.L2.base.text.secondary }]}>
          {t('tools.algorithmSelect')}
        </Text>
        <View style={styles.algoRow}>
          {ALGORITHMS.map(algo => {
            const isActive = algorithm === algo.id;
            const isDeprecated = algo.deprecated === true;

            return (
              <Pressable
                key={algo.id}
                onPress={() => changeAlgorithm(algo.id)}
                style={(state: any) => [
                  styles.algoPill,
                  isActive && styles.algoPillActive,
                  isDeprecated && !isActive && styles.algoPillDeprecated,
                  state.hovered && !isActive && styles.algoPillHover,
                ]}
                accessibilityRole="button"
                accessibilityLabel={algo.id}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.algoPillText,
                    isActive && styles.algoPillTextActive,
                    isActive && { color: theme.semantic.cyan },
                    isDeprecated && !isActive && styles.algoPillTextDeprecated,
                    isDeprecated && !isActive && { color: theme.semantic.warning },
                    !isActive && !isDeprecated && { color: theme.L2.base.text.secondary },
                  ]}
                >
                  {algo.id}
                </Text>
                {isDeprecated && (
                  <Feather
                    name="alert-triangle"
                    size={12}
                    color={isActive ? theme.semantic.warning : theme.semantic.warning}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Processing indicator */}
      {processing && (
        <View style={styles.processingRow}>
          <ActivityIndicator size="small" color={theme.semantic.cyan} />
          <Text style={[styles.processingText, { color: theme.L2.base.text.secondary }]}>
            {t('tools.processing')}
          </Text>
        </View>
      )}

      {/* Error display */}
      {error !== '' && !processing && (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={14} color={theme.semantic.danger} />
          <Text style={[styles.errorText, { color: theme.semantic.danger }]}>{error}</Text>
        </View>
      )}

      {/* Hash result */}
      {hashResult !== '' && !processing && (
        <View style={styles.resultSection}>
          <Text style={[styles.resultLabel, { color: theme.L2.base.text.secondary }]}>
            {t('tools.hashResult')}
          </Text>
          <View style={[styles.resultBox, resolveLayerStyle(theme.L3.base)]}>
            <Text style={[styles.resultText, { color: theme.L2.base.text.primary }]} selectable>
              {hashResult}
            </Text>
            <Pressable
              onPress={copyHash}
              style={(state: any) => [
                styles.copyBtn,
                state.hovered && styles.copyBtnHover,
                copied && styles.copyBtnCopied,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('tools.copyHash')}
            >
              <Feather
                name={copied ? 'check' : 'copy'}
                size={14}
                color={copied ? theme.semantic.cyan : theme.L2.base.text.secondary}
              />
              <Text
                style={[
                  styles.copyBtnText,
                  copied && styles.copyBtnTextCopied,
                  copied && { color: theme.semantic.cyan },
                ]}
              >
                {copied ? t('tools.copied') : t('tools.copyHash')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: dashboardSpacing.md,
  },

  // ── File picker ──────────────────────────────────────────────
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    flexWrap: 'wrap',
  },
  selectFileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.50)',
    backgroundColor: 'rgba(139,92,246,0.30)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
      boxShadow: '0 0 10px rgba(139,92,246,0.2)',
    }),
  },
  selectFileBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.45)',
    borderColor: 'rgba(139,92,246,0.70)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 18px rgba(139,92,246,0.35)',
    }),
  },
  selectFileBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.xs + 2,
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1,
  },
  fileSize: {
    fontSize: 13,
    fontWeight: '400',
    flexShrink: 0,
  },

  // ── Algorithm selector ───────────────────────────────────────
  algoSection: {
    gap: dashboardSpacing.sm,
  },
  algoLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  algoRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    flexWrap: 'wrap',
  },
  algoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    }),
  },
  algoPillActive: {
    borderColor: 'rgba(34,211,238,0.60)',
    backgroundColor: 'rgba(34,211,238,0.15)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(34,211,238,0.25)',
    }),
  },
  algoPillDeprecated: {
    borderColor: 'rgba(245,158,11,0.30)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  algoPillHover: {
    borderColor: 'rgba(139,92,246,0.45)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    ...webOnly({
      boxShadow: '0 0 8px rgba(139,92,246,0.15)',
    }),
  },
  algoPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(245,243,255,0.7)',
  },
  algoPillTextActive: {
    fontWeight: '700',
  },
  algoPillTextDeprecated: {},

  // ── Processing ───────────────────────────────────────────────
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingVertical: dashboardSpacing.sm,
  },
  processingText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Error ────────────────────────────────────────────────────
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingVertical: dashboardSpacing.sm,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Result ───────────────────────────────────────────────────
  resultSection: {
    gap: dashboardSpacing.sm,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  resultBox: {
    borderRadius: 10,
    padding: dashboardSpacing.md,
    gap: dashboardSpacing.sm,
    ...webOnly({
      backdropFilter: 'blur(12px)',
    }),
  },
  resultText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'web' ? 'monospace' : Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 20,
    ...webOnly({
      wordBreak: 'break-all',
      userSelect: 'all',
    }),
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: dashboardSpacing.xs + 2,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.40)',
    backgroundColor: 'rgba(139,92,246,0.20)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    }),
  },
  copyBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.35)',
    borderColor: 'rgba(139,92,246,0.60)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(139,92,246,0.25)',
    }),
  },
  copyBtnCopied: {
    borderColor: 'rgba(34,211,238,0.50)',
    backgroundColor: 'rgba(34,211,238,0.12)',
  },
  copyBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(245,243,255,0.7)',
  },
  copyBtnTextCopied: {},
});
