/**
 * FileShredderTool -- Inline tool for secure file shredding (simulation).
 *
 * Picks a file via expo-document-picker, lets the user choose between a
 * quick delete (1 pass) or a 3-pass secure shred simulation, shows animated
 * multi-pass progress, and attempts overwrite + delete on native platforms.
 *
 * HONEST DISCLAIMER: Real secure shredding is limited by mobile sandboxing
 * and SSD wear-leveling. On web, only deletion is possible — no overwrite.
 * On native, we attempt a best-effort overwrite before deletion.
 *
 * @module components/tools/FileShredderTool
 */

import { useState, useCallback } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme } from '@/theme/engine';
import { formatFileSize } from '@/utils/fileHelpers';
import { useLanguage } from '@/hooks/useLanguage';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileShredderToolProps {
  t?: (key: string) => string;
}

type ShredMethod = 'quick' | 'secure';

// ─── Component ────────────────────────────────────────────────────────────────

export function FileShredderTool({ t: externalT }: FileShredderToolProps) {
  const { theme } = useTheme();
  const { t: internalT } = useLanguage();
  const t = externalT || internalT;
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [method, setMethod] = useState<ShredMethod>('quick');
  const [shredding, setShredding] = useState(false);
  const [currentPass, setCurrentPass] = useState(0);
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);

  // ── File picker ─────────────────────────────────────────────────────────

  const pickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!result.canceled && result.assets?.[0]) {
        setSelectedFile(result.assets[0]);
        setComplete(false);
        setError('');
        setConfirmVisible(false);
        setProgress(0);
        setCurrentPass(0);
      }
    } catch (_err) {
      setError(t('tools.fileSelectionFailed'));
    }
  }, []);

  // ── Shred simulation ───────────────────────────────────────────────────

  const shredFile = useCallback(async () => {
    if (!selectedFile) return;

    setShredding(true);
    setComplete(false);
    setError('');
    setConfirmVisible(false);

    const passes = method === 'secure' ? 3 : 1;

    try {
      for (let i = 0; i < passes; i++) {
        setCurrentPass(i + 1);
        setProgress((i / passes) * 100);

        if (Platform.OS !== 'web') {
          try {
            // On native: overwrite with random data (best effort)
            const FileSystem = await import('expo-file-system/legacy');
            const randomData = Array.from(crypto.getRandomValues(new Uint8Array(1024)))
              .map((b: number) => String.fromCharCode(b))
              .join('');
            await FileSystem.writeAsStringAsync(selectedFile.uri, randomData);
          } catch {
            // Best effort — may fail due to sandboxing
          }
        }

        // Simulate pass duration for visual feedback
        await new Promise(resolve => setTimeout(resolve, 800));
      }

      // Final deletion
      if (Platform.OS !== 'web') {
        try {
          const FileSystem = await import('expo-file-system/legacy');
          await FileSystem.deleteAsync(selectedFile.uri, { idempotent: true });
        } catch {
          // Best effort
        }
      }

      setProgress(100);
      setShredding(false);
      setComplete(true);
    } catch (_err) {
      setShredding(false);
      setError(t('tools.shredFailed'));
    }
  }, [selectedFile, method]);

  // ── Reset ──────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setSelectedFile(null);
    setComplete(false);
    setError('');
    setConfirmVisible(false);
    setProgress(0);
    setCurrentPass(0);
    setMethod('quick');
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────

  const totalPasses = method === 'secure' ? 3 : 1;
  const canShred = selectedFile != null && !shredding && !complete;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* File picker row */}
      <View style={styles.fileRow}>
        <Pressable
          onPress={pickFile}
          disabled={shredding}
          style={(state: any) => [
            styles.selectFileBtn,
            state.hovered && !shredding && styles.selectFileBtnHover,
            shredding && styles.selectFileBtnDisabled,
          ]}
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

      {/* Web limitation banner */}
      {Platform.OS === 'web' && (
        <View style={styles.webWarningBanner}>
          <Feather name="alert-triangle" size={14} color={theme.semantic.warning} />
          <Text style={[styles.webWarningText, { color: theme.semantic.warning }]}>
            {t('tools.webLimitationShred')}
          </Text>
        </View>
      )}

      {/* Shred method selector */}
      {!complete && (
        <View style={styles.methodSection}>
          <Text style={[styles.methodLabel, { color: theme.L2.base.text.secondary }]}>
            {t('tools.shredMethod') || 'Shred Method'}
          </Text>
          <View style={styles.methodRow}>
            {[
              {
                id: 'quick' as ShredMethod,
                label: t('tools.quickDelete') || 'Quick Delete (1 pass)',
                passes: 1,
              },
              {
                id: 'secure' as ShredMethod,
                label: t('tools.secureShred') || 'Secure Shred (3 passes)',
                passes: 3,
              },
            ].map(opt => {
              const isActive = method === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => !shredding && setMethod(opt.id)}
                  disabled={shredding}
                  style={(state: any) => [
                    styles.methodPill,
                    isActive && styles.methodPillActive,
                    state.hovered && !isActive && !shredding && styles.methodPillHover,
                    shredding && styles.methodPillDisabled,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: isActive }}
                >
                  <Feather
                    name={opt.id === 'quick' ? 'trash' : 'shield'}
                    size={13}
                    color={isActive ? theme.semantic.danger : theme.L2.base.text.secondary}
                  />
                  <Text
                    style={[
                      styles.methodPillText,
                      isActive && styles.methodPillTextActive,
                      isActive && { color: theme.semantic.danger },
                      !isActive && { color: theme.L2.base.text.secondary },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Shredding progress */}
      {shredding && (
        <View style={styles.progressSection}>
          <View style={styles.progressLabelRow}>
            <ActivityIndicator size="small" color={theme.semantic.danger} />
            <Text style={[styles.progressLabel, { color: theme.L2.base.text.primary }]}>
              {t('tools.processing')} — Pass {currentPass} of {totalPasses}
            </Text>
          </View>

          {/* Progress bar */}
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${progress}%` as any, backgroundColor: theme.semantic.danger },
              ]}
            />
          </View>

          <Text style={[styles.progressPercent, { color: theme.L2.base.text.secondary }]}>
            {Math.round(progress)}%
          </Text>
        </View>
      )}

      {/* Error display */}
      {error !== '' && !shredding && (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={14} color={theme.semantic.danger} />
          <Text style={[styles.errorText, { color: theme.semantic.danger }]}>{error}</Text>
        </View>
      )}

      {/* Inline confirmation dialog OR shred button */}
      {!shredding && !complete && (
        <>
          {confirmVisible ? (
            <View style={styles.confirmPanel}>
              <View style={styles.confirmHeader}>
                <Feather name="alert-triangle" size={18} color={theme.semantic.danger} />
                <Text style={[styles.confirmTitle, { color: theme.L2.base.text.primary }]}>
                  {t('tools.shredConfirmTitle')}
                </Text>
              </View>
              <Text style={[styles.confirmMsg, { color: theme.L2.base.text.secondary }]}>
                {t('tools.shredConfirmMsg')}
              </Text>
              <View style={styles.confirmBtnRow}>
                <Pressable
                  onPress={() => setConfirmVisible(false)}
                  style={(state: any) => [
                    styles.confirmCancelBtn,
                    state.hovered && styles.confirmCancelBtnHover,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('tools.cancel') || 'Cancel'}
                >
                  <Text style={[styles.confirmCancelText, { color: theme.L2.base.text.secondary }]}>
                    {t('tools.cancel') || 'Cancel'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={shredFile}
                  style={(state: any) => [
                    styles.confirmDestroyBtn,
                    state.hovered && styles.confirmDestroyBtnHover,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t('tools.shredConfirmTitle')}
                >
                  <Feather name="trash-2" size={14} color="#FFF" />
                  <Text style={styles.confirmDestroyText}>
                    {t('tools.shredFile') || 'Shred File'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => setConfirmVisible(true)}
              disabled={!canShred}
              style={(state: any) => [
                styles.shredBtn,
                !canShred && styles.shredBtnDisabled,
                state.hovered && canShred && styles.shredBtnHover,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('tools.shredFile') || 'Shred File'}
            >
              <Feather name="trash-2" size={16} color="#FFF" />
              <Text style={styles.shredBtnText}>{t('tools.shredFile') || 'Shred File'}</Text>
            </Pressable>
          )}
        </>
      )}

      {/* Completion state */}
      {complete && (
        <View style={styles.completeSection}>
          <View style={styles.completeBanner}>
            <Feather name="check-circle" size={18} color={theme.semantic.success} />
            <View style={styles.completeTextGroup}>
              <Text style={[styles.completeTitle, { color: theme.semantic.success }]}>
                {t('tools.shredComplete')}
              </Text>
              <Text style={[styles.completeMsg, { color: theme.L2.base.text.secondary }]}>
                {t('tools.shredCompleteMsg')}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={reset}
            style={(state: any) => [styles.resetBtn, state.hovered && styles.resetBtnHover]}
            accessibilityRole="button"
            accessibilityLabel={t('tools.shredAnother') || 'Shred Another File'}
          >
            <Feather name="plus" size={14} color={theme.L2.base.text.primary} />
            <Text style={[styles.resetBtnText, { color: theme.L2.base.text.primary }]}>
              {t('tools.shredAnother') || 'Shred Another File'}
            </Text>
          </Pressable>
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
  selectFileBtnDisabled: {
    opacity: 0.45,
    ...webOnly({
      cursor: 'not-allowed',
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

  // ── Web limitation banner ────────────────────────────────────
  webWarningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dashboardSpacing.sm,
    padding: dashboardSpacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.30)',
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  webWarningText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
    flex: 1,
  },

  // ── Method selector ──────────────────────────────────────────
  methodSection: {
    gap: dashboardSpacing.sm,
  },
  methodLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  methodRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    flexWrap: 'wrap',
  },
  methodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  methodPillActive: {
    borderColor: 'rgba(239,68,68,0.60)',
    backgroundColor: 'rgba(239,68,68,0.15)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(239,68,68,0.25)',
    }),
  },
  methodPillHover: {
    borderColor: 'rgba(139,92,246,0.45)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    ...webOnly({
      boxShadow: '0 0 8px rgba(139,92,246,0.15)',
    }),
  },
  methodPillDisabled: {
    opacity: 0.45,
    ...webOnly({
      cursor: 'not-allowed',
    }),
  },
  methodPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(245,243,255,0.7)',
  },
  methodPillTextActive: {
    fontWeight: '700',
  },

  // ── Progress ─────────────────────────────────────────────────
  progressSection: {
    gap: dashboardSpacing.sm,
  },
  progressLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    ...webOnly({
      transition: 'width 0.3s ease',
    }),
  } as any,
  progressPercent: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Shred button ─────────────────────────────────────────────
  shredBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.25)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 0 12px rgba(239,68,68,0.2)',
    }),
  },
  shredBtnDisabled: {
    opacity: 0.45,
    ...webOnly({
      cursor: 'not-allowed',
    }),
  },
  shredBtnHover: {
    backgroundColor: 'rgba(239,68,68,0.40)',
    borderColor: 'rgba(239,68,68,0.65)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 20px rgba(239,68,68,0.35), 0 0 18px rgba(239,68,68,0.25)',
    }),
  },
  shredBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },

  // ── Inline confirm dialog ────────────────────────────────────
  confirmPanel: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.30)',
    borderRadius: 12,
    padding: dashboardSpacing.md,
    gap: dashboardSpacing.sm,
    ...webOnly({
      backdropFilter: 'blur(12px)',
    }),
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  confirmTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  confirmMsg: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },
  confirmBtnRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    marginTop: dashboardSpacing.xs,
  },
  confirmCancelBtn: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.30)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    }),
  },
  confirmCancelBtnHover: {
    borderColor: 'rgba(139,92,246,0.50)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    ...webOnly({
      boxShadow: '0 0 8px rgba(139,92,246,0.15)',
    }),
  },
  confirmCancelText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmDestroyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.60)',
    backgroundColor: 'rgba(239,68,68,0.35)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
      boxShadow: '0 0 10px rgba(239,68,68,0.2)',
    }),
  },
  confirmDestroyBtnHover: {
    backgroundColor: 'rgba(239,68,68,0.50)',
    borderColor: 'rgba(239,68,68,0.75)',
    ...webOnly({
      boxShadow: '0 0 18px rgba(239,68,68,0.35)',
    }),
  },
  confirmDestroyText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
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

  // ── Completion ───────────────────────────────────────────────
  completeSection: {
    gap: dashboardSpacing.md,
  },
  completeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dashboardSpacing.sm,
    padding: dashboardSpacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.30)',
    backgroundColor: 'rgba(34,197,94,0.10)',
  },
  completeTextGroup: {
    flex: 1,
    gap: 2,
  },
  completeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  completeMsg: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 19,
  },

  // ── Reset button ─────────────────────────────────────────────
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.40)',
    backgroundColor: 'rgba(139,92,246,0.18)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
    }),
  },
  resetBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.32)',
    borderColor: 'rgba(139,92,246,0.55)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(139,92,246,0.25)',
    }),
  },
  resetBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
