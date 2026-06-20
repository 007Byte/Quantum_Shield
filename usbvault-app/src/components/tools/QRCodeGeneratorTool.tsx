/**
 * QRCodeGeneratorTool — Inline tool for generating real, scannable QR codes.
 *
 * Uses the `qrcode` npm package for ISO/IEC 18004 compliant QR encoding.
 * Renders the QR matrix as a grid of View cells, respecting the selected
 * size and error correction level.
 *
 * @module components/tools/QRCodeGeneratorTool
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'qrcode';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';

// ─── Props ───────────────────────────────────────────────────────────────────

interface QRCodeGeneratorToolProps {
  t?: (key: string) => string;
}

// ─── Size & Error Correction Options ─────────────────────────────────────────

const SIZE_OPTIONS = [128, 200, 256, 512] as const;
const EC_LEVELS = ['L', 'M', 'Q', 'H'] as const;
type ErrorCorrectionLevel = (typeof EC_LEVELS)[number];

// ─── Real QR Code Generator (ISO/IEC 18004) ─────────────────────────────────

const EC_MAP: Record<ErrorCorrectionLevel, 'L' | 'M' | 'Q' | 'H'> = {
  L: 'L',
  M: 'M',
  Q: 'Q',
  H: 'H',
};

/**
 * Generate a real, scannable QR code matrix using the `qrcode` library.
 * Returns a 2D boolean grid where `true` = dark module.
 */
const generatePattern = (
  text: string,
  _size: number,
  ecLevel: ErrorCorrectionLevel
): boolean[][] => {
  try {
    const qr = QRCode.create(text, {
      errorCorrectionLevel: EC_MAP[ecLevel],
    });
    const { size, data } = qr.modules;
    const grid: boolean[][] = [];
    for (let row = 0; row < size; row++) {
      grid[row] = [];
      for (let col = 0; col < size; col++) {
        grid[row][col] = data[row * size + col] === 1;
      }
    }
    return grid;
  } catch {
    // Input too long or encoding error — return empty
    return [];
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

export function QRCodeGeneratorTool({ t: externalT }: QRCodeGeneratorToolProps) {
  const { theme } = useTheme();
  const { t: internalT } = useLanguage();
  const t = externalT || internalT;
  const [inputText, setInputText] = useState('');
  const [qrSize, setQrSize] = useState<number>(200);
  const [errorCorrection, setErrorCorrection] = useState<ErrorCorrectionLevel>('M');
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Memoise the grid so it only recalculates when input, size, or EC level changes
  const pattern = useMemo(
    () => (inputText.length > 0 ? generatePattern(inputText, qrSize, errorCorrection) : null),
    [inputText, qrSize, errorCorrection]
  );

  const gridSize = pattern?.length ?? 0;
  const cellPx = gridSize > 0 ? Math.floor(qrSize / gridSize) : 0;
  const displayPx = cellPx * gridSize; // actual rendered width/height

  // ── Clipboard ──────────────────────────────────────────────────────────

  const copyText = useCallback(async () => {
    if (!inputText) return;
    await Clipboard.setStringAsync(inputText);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [inputText]);

  // ── Share (Web Share API on web, clipboard fallback) ──────────────────

  const shareText = useCallback(async () => {
    if (!inputText) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: inputText });
        return;
      } catch {
        // User cancelled or share not supported — fall through to copy
      }
    }
    // Fallback: copy to clipboard
    await Clipboard.setStringAsync(inputText);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [inputText]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* ── Text Input ────────────────────────────────────────── */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.L2.base.text.primary }]}>
          {t('tools.qrPlaceholder')
            .replace('...', '')
            .replace(/\.\.\.$/, '')
            .trim() || 'Text or URL'}
        </Text>
        <TextInput
          style={[styles.inputField, resolveLayerStyle(theme.L3.base)]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('tools.qrPlaceholder')}
          placeholderTextColor={theme.L2.base.text.secondary}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t('tools.qrPlaceholder')}
        />
      </View>

      {/* ── Size Selector ──────────────────────────────────────── */}
      <View style={styles.optionSection}>
        <Text style={[styles.optionLabel, { color: theme.L2.base.text.secondary }]}>{t('tools.qrSize')}</Text>
        <View style={styles.pillRow}>
          {SIZE_OPTIONS.map(sz => {
            const active = qrSize === sz;
            return (
              <Pressable
                key={sz}
                onPress={() => setQrSize(sz)}
                style={(state: any) => [
                  styles.pill,
                  active && styles.pillActiveGreen,
                  state.hovered && !active && styles.pillHover,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: active ? theme.semantic.success : theme.L2.base.text.secondary },
                    active && styles.pillTextActiveGreen,
                  ]}
                >
                  {sz}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── Error Correction Level ─────────────────────────────── */}
      <View style={styles.optionSection}>
        <Text style={[styles.optionLabel, { color: theme.L2.base.text.secondary }]}>
          {t('tools.qrErrorCorrection')}
        </Text>
        <View style={styles.pillRow}>
          {EC_LEVELS.map(level => {
            const active = errorCorrection === level;
            return (
              <Pressable
                key={level}
                onPress={() => setErrorCorrection(level)}
                style={(state: any) => [
                  styles.pill,
                  active && styles.pillActiveCyan,
                  state.hovered && !active && styles.pillHover,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: active ? theme.semantic.cyan : theme.L2.base.text.secondary },
                    active && styles.pillTextActiveCyan,
                  ]}
                >
                  {level}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ── QR Display Area ────────────────────────────────────── */}
      <View style={styles.qrDisplayContainer}>
        {pattern && displayPx > 0 ? (
          <View
            style={[
              styles.qrFrame,
              {
                width: displayPx + 24,
                height: displayPx + 24,
                backgroundColor: theme.L3.base.native.backgroundColor,
              },
            ]}
          >
            <View
              style={{
                width: displayPx,
                height: displayPx,
                flexDirection: 'row',
                flexWrap: 'wrap',
              }}
            >
              {pattern.map((row, rIdx) =>
                row.map((filled, cIdx) => (
                  <View
                    key={`${rIdx}-${cIdx}`}
                    style={{
                      width: cellPx,
                      height: cellPx,
                      backgroundColor: filled ? theme.L2.base.text.primary : 'transparent',
                    }}
                  />
                ))
              )}
            </View>
          </View>
        ) : (
          <View
            style={[styles.emptyState, { backgroundColor: theme.L3.base.native.backgroundColor }]}
          >
            <Feather name="grid" size={36} color={theme.L2.base.text.muted} />
            <Text style={[styles.emptyStateText, { color: theme.L2.base.text.secondary }]}>
              {t('tools.qrPlaceholder')}
            </Text>
          </View>
        )}
      </View>

      {/* ── Action Buttons ─────────────────────────────────────── */}
      <View style={styles.actionRow}>
        <Pressable
          onPress={copyText}
          disabled={inputText.length === 0}
          style={(state: any) => [
            styles.copyBtn,
            inputText.length === 0 && styles.btnDisabled,
            state.hovered && inputText.length > 0 && styles.copyBtnHover,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('tools.copyHash')}
        >
          <Feather
            name={copied ? 'check' : 'copy'}
            size={14}
            color={copied ? theme.semantic.success : theme.L2.base.text.primary}
          />
          <Text style={[styles.copyBtnText, { color: theme.L2.base.text.primary }]}>
            {copied ? t('tools.copied') : t('tools.copyHash')}
          </Text>
        </Pressable>

        <Pressable
          onPress={shareText}
          disabled={inputText.length === 0}
          style={(state: any) => [
            styles.shareBtn,
            inputText.length === 0 && styles.btnDisabled,
            state.hovered && inputText.length > 0 && styles.shareBtnHover,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('tools.qrShare')}
        >
          <Feather name="share-2" size={14} color={theme.L2.base.text.primary} />
          <Text style={[styles.shareBtnText, { color: theme.L2.base.text.primary }]}>
            {t('tools.qrShare')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: dashboardSpacing.md,
  },

  // ── Field Group ──────────────────────────────────────────
  fieldGroup: {
    gap: dashboardSpacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Text Input ───────────────────────────────────────────
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

  // ── Option Sections (Size, EC Level) ─────────────────────
  optionSection: {
    gap: dashboardSpacing.sm,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pillRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    flexWrap: 'wrap',
  },

  // ── Generic Pill ─────────────────────────────────────────
  pill: {
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
  pillHover: {
    borderColor: 'rgba(139,92,246,0.45)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    ...webOnly({
      boxShadow: '0 0 8px rgba(139,92,246,0.15)',
    }),
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Active Pill — Green (for Size) ───────────────────────
  pillActiveGreen: {
    borderColor: 'rgba(34,197,94,0.60)',
    backgroundColor: 'rgba(34,197,94,0.15)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(34,197,94,0.25)',
    }),
  },
  pillTextActiveGreen: {
    fontWeight: '700',
  },

  // ── Active Pill — Cyan (for Error Correction) ────────────
  pillActiveCyan: {
    borderColor: 'rgba(34,211,238,0.60)',
    backgroundColor: 'rgba(34,211,238,0.15)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(34,211,238,0.25)',
    }),
  },
  pillTextActiveCyan: {
    fontWeight: '700',
  },

  // ── QR Display ───────────────────────────────────────────
  qrDisplayContainer: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.md,
  },
  qrFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.35)',
    borderRadius: 10,
    padding: 12,
    ...webOnly({
      boxShadow: '0 4px 24px rgba(139,92,246,0.15), 0 0 12px rgba(139,92,246,0.10)',
    }),
  },

  // ── Empty State ──────────────────────────────────────────
  emptyState: {
    width: 224,
    height: 224,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,92,246,0.25)',
    borderRadius: 10,
    gap: dashboardSpacing.sm,
  },
  emptyStateText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: dashboardSpacing.lg,
  },

  // ── Action Buttons ───────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    flexWrap: 'wrap',
  },
  btnDisabled: {
    opacity: 0.45,
    ...webOnly({
      cursor: 'not-allowed',
    }),
  },

  // Copy button — purple glass
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
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
  copyBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.42)',
    borderColor: 'rgba(139,92,246,0.65)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 20px rgba(139,92,246,0.35), 0 0 18px rgba(139,92,246,0.25)',
    }),
  },
  copyBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Share button — cyan
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.50)',
    backgroundColor: 'rgba(34,211,238,0.18)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 0 12px rgba(34,211,238,0.15)',
    }),
  },
  shareBtnHover: {
    backgroundColor: 'rgba(34,211,238,0.30)',
    borderColor: 'rgba(34,211,238,0.65)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 20px rgba(34,211,238,0.30), 0 0 18px rgba(34,211,238,0.20)',
    }),
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
