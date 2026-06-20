/**
 * VaultCard — Single vault card with actions (Open, Rename, Export, Delete).
 * Receives all data and callbacks via props. No direct store imports.
 */
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { memo } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle, theme as themeProxy } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import {
  dashboardSpacing,
  dashboardLayout,
  webOnlyTransition,
} from '@/components/dashboard2/styles';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import type { VaultCardData, VaultCardActions } from '../domain/vault-manager.types';
import { getSecurityLevelColors, formatDate } from '../domain/vault-manager.types';

interface VaultCardProps extends VaultCardActions {
  vault: VaultCardData;
  isActive: boolean;
}

export const VaultCard = memo(function VaultCard({
  vault,
  isActive,
  onOpen,
  onRename,
  onExport,
  onDelete,
}: VaultCardProps) {
  const { theme } = useTheme();
  const { t, language } = useLanguage();
  const securityColors = getSecurityLevelColors(vault.securityLevel);

  // Derive real file count: prefer orchestrator (ground truth) -> store -> discovery
  const orchestratorIndex = vaultOrchestrator.getIndex();
  const realFileCount = orchestratorIndex
    ? Object.keys(orchestratorIndex.files).length
    : vault.fileCount;

  return (
    <View style={styles.vaultCard}>
      <View style={[styles.vaultCardInner, resolveLayerStyle(theme.L2.base)]}>
        {/* Active indicator */}
        {isActive && (
          <View style={styles.activeIndicator}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>{t('vaultManager.active')}</Text>
          </View>
        )}

        <View style={styles.vaultCardHeader}>
          <View style={styles.vaultCardTitle}>
            <Text style={[styles.vaultName, { color: theme.L2.base.text.primary }]}>
              {vault.name}
            </Text>
            <Text style={[styles.vaultDescription, { color: theme.L2.base.text.secondary }]}>
              {realFileCount} {t('vaultManager.filesEncrypted')}
            </Text>
          </View>
          <View
            style={[
              styles.securityBadge,
              { backgroundColor: securityColors.bgLight, borderColor: securityColors.border },
            ]}
          >
            <Feather name="shield" size={14} color={securityColors.icon} />
            <Text style={[styles.securityBadgeText, { color: securityColors.text }]}>
              {vault.securityLevel === 'maximum' && t('vaultManager.max')}
              {vault.securityLevel === 'high' && t('vaultManager.high')}
              {vault.securityLevel === 'standard' && t('vaultManager.standard')}
            </Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.vaultInfoRow}>
          <View style={styles.vaultInfoItem}>
            <Text style={[styles.vaultInfoLabel, { color: theme.L2.base.text.secondary }]}>
              {t('vaultManager.files')}
            </Text>
            <Text style={[styles.vaultInfoValue, { color: theme.L2.base.text.primary }]}>
              {realFileCount}
            </Text>
          </View>
          <View style={styles.vaultInfoDivider} />
          <View style={styles.vaultInfoItem}>
            <Text style={[styles.vaultInfoLabel, { color: theme.L2.base.text.secondary }]}>
              {t('vaultManager.lastModified')}
            </Text>
            <Text style={[styles.vaultInfoValue, { color: theme.L2.base.text.primary }]}>
              {formatDate(vault.lastModified, t, language)}
            </Text>
          </View>
        </View>

        {/* Encryption type */}
        <View style={styles.encryptionContainer}>
          <Feather name="lock" size={14} color={theme.semantic.cyan} />
          <Text style={styles.encryptionText}>PQC-256</Text>
        </View>

        {/* Actions */}
        <View style={styles.vaultActions}>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              styles.vaultButton,
              styles.vaultButtonPrimary,
              webOnlyTransition,
              state.hovered && styles.vaultButtonPrimaryHover,
            ]}
            onPress={() => onOpen(vault.id)}
          >
            <Feather name="unlock" size={16} color="#FFFFFF" />
            <Text style={styles.vaultButtonText}>{t('vaultManager.open')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              styles.vaultButton,
              styles.vaultButtonSecondary,
              webOnlyTransition,
              state.hovered && styles.vaultButtonSecondaryHover,
            ]}
            onPress={() => onRename(vault.id, vault.name)}
          >
            <Feather name="edit-3" size={16} color={theme.semantic.purple} />
            <Text style={[styles.vaultButtonText, { color: theme.semantic.purple }]}>
              {t('vaultManager.rename')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              styles.vaultButton,
              styles.vaultButtonSecondary,
              webOnlyTransition,
              state.hovered && styles.vaultButtonSecondaryHover,
            ]}
            onPress={() => onExport(vault.id, vault.name)}
          >
            <Feather name="download" size={16} color={theme.semantic.cyan} />
            <Text
              style={[
                styles.vaultButtonText,
                styles.vaultButtonSecondaryText,
                { color: theme.semantic.cyan },
              ]}
            >
              {t('vaultManager.export')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              styles.vaultButton,
              styles.vaultButtonDelete,
              webOnlyTransition,
              state.hovered && styles.vaultButtonDeleteHover,
            ]}
            onPress={() => onDelete(vault.id, vault.name)}
          >
            <Feather name="trash-2" size={16} color={theme.semantic.danger} />
            <Text style={[styles.vaultButtonText, styles.vaultButtonDeleteText]}>
              {t('vaultManager.delete')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  vaultCard: {
    borderRadius: dashboardLayout.radiusXl,
    padding: 1,
    ...webOnly({
      background: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(6,182,212,0.1) 100%)',
    }),
  },
  vaultCardInner: {
    borderRadius: dashboardLayout.radiusXl,
    padding: dashboardSpacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    gap: dashboardSpacing.sm,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: themeProxy.semantic.success,
    marginRight: 6,
  },
  activeText: {
    fontSize: 12,
    color: themeProxy.semantic.success,
    fontWeight: '600',
  },
  vaultCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: dashboardSpacing.md,
  },
  vaultCardTitle: { flex: 1 },
  vaultName: {
    fontSize: 16,
    fontWeight: '600',
  },
  vaultDescription: {
    fontSize: 13,
    marginTop: 4,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  securityBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  vaultInfoRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  vaultInfoItem: { flex: 1 },
  vaultInfoLabel: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  vaultInfoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  vaultInfoDivider: {
    width: 1,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  encryptionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderRadius: 6,
    alignSelf: 'flex-start',
    gap: 6,
  },
  encryptionText: {
    fontSize: 12,
    color: themeProxy.semantic.cyan,
    fontWeight: '600',
  },
  vaultActions: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    flexWrap: 'wrap',
  },
  vaultButton: {
    flex: 1,
    minWidth: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
  },
  vaultButtonPrimary: {
    borderColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 20px rgba(139,92,246,0.3), 0 0 40px rgba(34,211,238,0.15)',
    }),
  },
  vaultButtonPrimaryHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  vaultButtonSecondary: {
    borderColor: 'rgba(139,92,246,0.25)',
  },
  vaultButtonSecondaryHover: {
    ...webOnly({ transform: 'translateY(-2px)', boxShadow: '0 0 20px rgba(139,92,246,0.3)' }),
  },
  vaultButtonSecondaryText: {},
  vaultButtonDelete: {
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderColor: 'rgba(255,107,107,0.3)',
  },
  vaultButtonDeleteHover: {
    ...webOnly({ transform: 'translateY(-2px)', boxShadow: '0 0 20px rgba(255,107,107,0.3)' }),
  },
  vaultButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  vaultButtonDeleteText: { color: themeProxy.semantic.danger },
});
