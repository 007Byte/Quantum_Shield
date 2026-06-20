/**
 * GhostModePanel — Ghost mode master toggle + sub-option toggles
 * @module features/zero-trace/components/GhostModePanel
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { ztColors } from '../domain/zero-trace.data';
import type { GhostModePanelProps } from '../domain/zero-trace.types';

// ── Toggle Row ────────────────────────────────────────────────────────

const ToggleRow = ({
  label,
  description,
  value,
  onToggle,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    accessibilityRole="button"
    style={[styles.toggleContainer, disabled && { opacity: 0.5 }]}
    onPress={disabled ? undefined : onToggle}
    disabled={disabled}
  >
    <View style={{ flex: 1 }}>
      <Text style={styles.toggleLabel}>{label}</Text>
      {description && <Text style={styles.toggleDesc}>{description}</Text>}
    </View>
    <View
      style={[
        styles.toggleBase,
        { backgroundColor: value ? ztColors.cyan : 'rgba(184, 179, 209, 0.2)' },
      ]}
    >
      <View style={[styles.toggleCircle, { alignSelf: value ? 'flex-end' : 'flex-start' }]} />
    </View>
  </Pressable>
);

// ── GhostModePanel ──────────────────────────────────────────────────

export const GhostModePanel = ({ settings, onToggle, onUpdateSetting, t }: GhostModePanelProps) => (
  <View>
    {/* Ghost mode master toggle */}
    <ToggleRow
      label={t('zeroTrace.ghostMode') || 'Ghost Mode'}
      description={t('zeroTrace.ghostModeDesc') || 'Automatically eliminate digital footprints'}
      value={settings.enabled}
      onToggle={onToggle}
    />

    {/* Sub-toggles when Ghost Mode is enabled */}
    {settings.enabled && (
      <View style={styles.subOptionsContainer}>
        <ToggleRow
          label={t('zeroTrace.clipboardAutoClean') || 'Clipboard Auto-Clean'}
          description={
            t('zeroTrace.clipboardAutoCleanDesc') ||
            `Clear clipboard ${settings.clipboardCleanDelaySec}s after copy`
          }
          value={settings.clipboardAutoClean}
          onToggle={() => onUpdateSetting('clipboardAutoClean', !settings.clipboardAutoClean)}
        />
        <ToggleRow
          label={t('zeroTrace.metadataSanitization') || 'Metadata Sanitization'}
          description={
            t('zeroTrace.metadataSanitizationDesc') ||
            'Strip EXIF, GPS, and embedded metadata from files'
          }
          value={settings.metadataSanitization}
          onToggle={() => onUpdateSetting('metadataSanitization', !settings.metadataSanitization)}
        />
        <ToggleRow
          label={t('zeroTrace.ramScrubOnLock') || 'Memory Scrub on Lock'}
          description={
            t('zeroTrace.ramScrubOnLockDesc') || 'Scrub sensitive data from RAM when vault locks'
          }
          value={settings.ramScrubOnLock}
          onToggle={() => onUpdateSetting('ramScrubOnLock', !settings.ramScrubOnLock)}
        />
        <ToggleRow
          label={t('zeroTrace.ramScrubOnLogout') || 'Memory Scrub on Logout'}
          description={
            t('zeroTrace.ramScrubOnLogoutDesc') || 'Scrub sensitive data from RAM on logout'
          }
          value={settings.ramScrubOnLogout}
          onToggle={() => onUpdateSetting('ramScrubOnLogout', !settings.ramScrubOnLogout)}
        />
        <ToggleRow
          label={t('zeroTrace.journalCleanup') || 'Journal Cleanup'}
          description={
            t('zeroTrace.journalCleanupDesc') ||
            'Clean OS-level journal entries (requires desktop companion)'
          }
          value={settings.journalCleanup}
          onToggle={() => onUpdateSetting('journalCleanup', !settings.journalCleanup)}
        />
      </View>
    )}
  </View>
);

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  toggleContainer: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184, 179, 209, 0.1)',
  },
  toggleLabel: {
    fontSize: 14,
    color: ztColors.textPrimary,
    fontWeight: '500',
  },
  toggleDesc: {
    fontSize: 11,
    color: ztColors.textSecondary,
    marginTop: 2,
  },
  toggleBase: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center' as const,
    paddingHorizontal: 2,
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0A0612',
  },
  subOptionsContainer: {
    marginTop: dashboardSpacing.md,
    marginLeft: dashboardSpacing.md,
    paddingLeft: dashboardSpacing.md,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(34, 211, 238, 0.3)',
  },
});
