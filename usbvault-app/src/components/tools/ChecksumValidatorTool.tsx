/**
 * ChecksumValidatorTool -- Inline tool for the Tools screen.
 *
 * Lets users pick a file, enter an expected hash, auto-detects the algorithm
 * from the hash length, computes the file hash via Web Crypto, and shows a
 * match / mismatch result with a visual diff.
 *
 * @module components/tools/ChecksumValidatorTool
 */

import React, { useState, useCallback } from 'react';
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
import * as DocumentPicker from 'expo-document-picker';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { formatFileSize } from '@/utils/fileHelpers';
import { useLanguage } from '@/hooks/useLanguage';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ChecksumValidatorToolProps {
  t?: (key: string) => string;
}

interface SelectedFile {
  name: string;
  size: number;
  uri: string;
}

type ValidationResult =
  | { status: 'match'; computed: string; expected: string }
  | { status: 'mismatch'; computed: string; expected: string }
  | { status: 'error'; message: string };

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Auto-detect hash algorithm from the length of a hex string. */
const detectAlgorithm = (hash: string): string | null => {
  const clean = hash.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(clean)) return null;
  switch (clean.length) {
    case 32:
      return 'MD5';
    case 40:
      return 'SHA-1';
    case 64:
      return 'SHA-256';
    case 128:
      return 'SHA-512';
    default:
      return null;
  }
};

/** Map our algorithm label to the Web Crypto digest name. */
const webCryptoName = (algo: string): string | null => {
  switch (algo) {
    case 'SHA-1':
      return 'SHA-1';
    case 'SHA-256':
      return 'SHA-256';
    case 'SHA-512':
      return 'SHA-512';
    default:
      return null; // MD5 not supported
  }
};

/** Convert an ArrayBuffer to a lowercase hex string. */
const bufferToHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

/** Read a file URI to an ArrayBuffer (cross-platform). */
const readFileAsArrayBuffer = async (uri: string): Promise<ArrayBuffer> => {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return response.arrayBuffer();
  }
  // Native: use expo-file-system to read as base64, then decode
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
};

// ─── Component ──────────────────────────────────────────────────────────────────

export function ChecksumValidatorTool({ t: externalT }: ChecksumValidatorToolProps) {
  const { theme } = useTheme();
  const { t: internalT } = useLanguage();
  const t = externalT || internalT;
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [expectedHash, setExpectedHash] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [selectHovered, setSelectHovered] = useState(false);
  const [validateHovered, setValidateHovered] = useState(false);

  const detectedAlgorithm = expectedHash.trim().length > 0 ? detectAlgorithm(expectedHash) : null;

  // ── File selection ──────────────────────────────────────────────────

  const handleSelectFile = useCallback(async () => {
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!pickerResult.canceled && pickerResult.assets.length > 0) {
        const asset = pickerResult.assets[0];
        setSelectedFile({
          name: asset.name,
          size: asset.size ?? 0,
          uri: asset.uri,
        });
        setResult(null);
      }
    } catch {
      // User cancelled or error -- silently ignore
    }
  }, []);

  // ── Validation ──────────────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    if (!selectedFile || !expectedHash.trim()) return;

    const algo = detectAlgorithm(expectedHash);
    if (!algo) {
      setResult({
        status: 'error',
        message: t('tools.invalidHashFormat'),
      });
      return;
    }

    if (algo === 'MD5') {
      setResult({
        status: 'error',
        message: t('tools.md5Unsupported'),
      });
      return;
    }

    const digestName = webCryptoName(algo);
    if (!digestName) {
      setResult({ status: 'error', message: t('tools.algorithmUnsupported').replace('{{algorithm}}', algo) });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const buffer = await readFileAsArrayBuffer(selectedFile.uri);
      const hashBuffer = await crypto.subtle.digest(digestName, buffer);
      const computed = bufferToHex(hashBuffer);
      const expected = expectedHash.trim().toLowerCase();

      if (computed === expected) {
        setResult({ status: 'match', computed, expected });
      } else {
        setResult({ status: 'mismatch', computed, expected });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('tools.hashComputeFailed');
      setResult({ status: 'error', message });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, expectedHash]);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, resolveLayerStyle(theme.L2.base)]}>
      {/* ── File Picker Row ─────────────────────────────────────── */}
      <View style={styles.fileRow}>
        <Pressable
          onPress={handleSelectFile}
          onHoverIn={() => setSelectHovered(true)}
          onHoverOut={() => setSelectHovered(false)}
          style={[
            styles.selectBtn,
            resolveLayerStyle(theme.L3.base),
            selectHovered && styles.selectBtnHovered,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('tools.selectFile')}
        >
          <Feather name="file-plus" size={16} color={theme.semantic.cyan} />
          <Text style={[styles.selectBtnText, { color: theme.L2.base.text.primary }]}>
            {t('tools.selectFile')}
          </Text>
        </Pressable>

        {selectedFile && (
          <View style={styles.fileInfo}>
            <Feather name="file" size={14} color={theme.L2.base.text.secondary} />
            <Text
              style={[styles.fileName, { color: theme.L2.base.text.primary }]}
              numberOfLines={1}
            >
              {selectedFile.name}
            </Text>
            <Text style={[styles.fileSize, { color: theme.L2.base.text.secondary }]}>
              ({formatFileSize(selectedFile.size)})
            </Text>
          </View>
        )}
      </View>

      {/* ── Expected Hash Input ─────────────────────────────────── */}
      <View style={styles.inputSection}>
        <Text style={[styles.label, { color: theme.L2.base.text.secondary }]}>
          {t('tools.expectedHash')}
        </Text>
        <TextInput
          value={expectedHash}
          onChangeText={text => {
            setExpectedHash(text);
            setResult(null);
          }}
          placeholder="e3b0c44298fc1c149afbf4c8996fb924..."
          placeholderTextColor={theme.L2.base.text.secondary}
          style={[styles.hashInput, resolveLayerStyle(theme.L3.base)]}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('tools.expectedHash')}
        />

        {/* Detected algorithm label */}
        {detectedAlgorithm && (
          <View style={styles.detectedRow}>
            <Feather name="cpu" size={13} color={theme.semantic.cyan} />
            <Text style={[styles.detectedLabel, { color: theme.L2.base.text.secondary }]}>
              {t('tools.algorithmSelect')}:{' '}
              <Text style={[styles.detectedValue, { color: theme.semantic.cyan }]}>
                {detectedAlgorithm}
              </Text>
            </Text>
            {detectedAlgorithm === 'MD5' && (
              <Text style={[styles.unsupportedLabel, { color: theme.semantic.danger }]}>
                (unsupported)
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ── Result Display ──────────────────────────────────────── */}
      {result && (
        <View
          style={[
            styles.resultBox,
            result.status === 'match' && styles.resultMatch,
            result.status === 'mismatch' && styles.resultMismatch,
            result.status === 'error' && styles.resultError,
          ]}
        >
          {result.status === 'match' && (
            <>
              <View style={styles.resultHeader}>
                <Feather name="check-circle" size={20} color={theme.semantic.success} />
                <Text style={[styles.resultMatchText, { color: theme.semantic.success }]}>
                  {t('tools.checksumMatch')}
                </Text>
              </View>
              <View style={styles.hashCompare}>
                <Text style={[styles.hashLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('tools.computedHash')}:
                </Text>
                <Text
                  style={[styles.hashValue, styles.hashValueMatch, { color: '#86EFAC' }]}
                  numberOfLines={2}
                >
                  {result.computed}
                </Text>
              </View>
              <View style={styles.hashCompare}>
                <Text style={[styles.hashLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('tools.expectedHashLabel')}:
                </Text>
                <Text
                  style={[styles.hashValue, styles.hashValueMatch, { color: '#86EFAC' }]}
                  numberOfLines={2}
                >
                  {result.expected}
                </Text>
              </View>
            </>
          )}

          {result.status === 'mismatch' && (
            <>
              <View style={styles.resultHeader}>
                <Feather name="x-circle" size={20} color={theme.semantic.danger} />
                <Text style={[styles.resultMismatchText, { color: theme.semantic.danger }]}>
                  {t('tools.checksumMismatch')}
                </Text>
              </View>
              <View style={styles.hashCompare}>
                <Text style={[styles.hashLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('tools.computedHash')}:
                </Text>
                <Text
                  style={[styles.hashValue, styles.hashValueMismatch, { color: '#FCA5A5' }]}
                  numberOfLines={2}
                >
                  {result.computed}
                </Text>
              </View>
              <View style={styles.hashCompare}>
                <Text style={[styles.hashLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('tools.expectedHashLabel')}:
                </Text>
                <Text
                  style={[styles.hashValue, styles.hashValueMismatch, { color: '#FCA5A5' }]}
                  numberOfLines={2}
                >
                  {result.expected}
                </Text>
              </View>
            </>
          )}

          {result.status === 'error' && (
            <View style={styles.resultHeader}>
              <Feather name="alert-triangle" size={20} color={theme.semantic.warning} />
              <Text style={[styles.resultErrorText, { color: theme.semantic.warning }]}>
                {result.message}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ── Validate Button ─────────────────────────────────────── */}
      <Pressable
        onPress={handleValidate}
        onHoverIn={() => setValidateHovered(true)}
        onHoverOut={() => setValidateHovered(false)}
        disabled={isProcessing || !selectedFile || !expectedHash.trim()}
        style={[
          styles.validateBtn,
          validateHovered && styles.validateBtnHovered,
          (!selectedFile || !expectedHash.trim()) && styles.validateBtnDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={isProcessing ? t('tools.processing') : t('tools.validate')}
      >
        {isProcessing ? (
          <ActivityIndicator size="small" color={theme.L2.base.text.primary} />
        ) : (
          <Feather name="check-square" size={16} color={theme.L2.base.text.primary} />
        )}
        <Text style={[styles.validateBtnText, { color: theme.L2.base.text.primary }]}>
          {isProcessing ? t('tools.processing') : t('tools.validate')}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: dashboardSpacing.md,
    padding: dashboardSpacing.lg,
    borderRadius: 14,
    gap: dashboardSpacing.md,
    ...webOnly({
      backdropFilter: 'blur(18px)',
    }),
  },

  // ── File Picker ──────────────────────────────────────────────
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    flexWrap: 'wrap',
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    }),
  },
  selectBtnHovered: {
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 16px rgba(139,92,246,0.30)',
    }),
  },
  selectBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  fileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  fileSize: {
    fontSize: 12,
    flexShrink: 0,
  },

  // ── Hash Input ───────────────────────────────────────────────
  inputSection: {
    gap: dashboardSpacing.xs + 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  hashInput: {
    borderRadius: 8,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'monospace' as any,
    ...webOnly({
      outlineWidth: 0,
      transition: 'border-color 0.18s ease',
    }),
  } as any,
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detectedLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  detectedValue: {
    fontWeight: '700',
  },
  unsupportedLabel: {
    fontSize: 11,
    fontWeight: '500',
  },

  // ── Result Box ───────────────────────────────────────────────
  resultBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: dashboardSpacing.md,
    gap: dashboardSpacing.sm,
  },
  resultMatch: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.40)',
  },
  resultMismatch: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.40)',
  },
  resultError: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.35)',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  resultMatchText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultMismatchText: {
    fontSize: 14,
    fontWeight: '700',
  },
  resultErrorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  hashCompare: {
    gap: 2,
  },
  hashLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hashValue: {
    fontSize: 12,
    fontFamily: 'monospace' as any,
    ...webOnly({ wordBreak: 'break-all' }),
  } as any,
  hashValueMatch: {
    color: '#86EFAC',
  },
  hashValueMismatch: {
    color: '#FCA5A5',
  },

  // ── Validate Button ──────────────────────────────────────────
  validateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: 10,
    backgroundColor: 'rgba(139,92,246,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.50)',
    borderRadius: 8,
    alignSelf: 'flex-start',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
      boxShadow: '0 0 12px rgba(139,92,246,0.20)',
    }),
  },
  validateBtnHovered: {
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 22px rgba(139,92,246,0.40)',
    }),
  },
  validateBtnDisabled: {
    opacity: 0.45,
    ...webOnly({ cursor: 'not-allowed' }),
  },
  validateBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
