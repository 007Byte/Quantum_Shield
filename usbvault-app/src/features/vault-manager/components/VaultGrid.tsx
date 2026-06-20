/**
 * VaultGrid — Responsive vault card grid with loading / empty states.
 * Pure presentational component: receives all data and callbacks via props.
 */
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { SkeletonCard } from '@/components/common';
import {
  dashboardSpacing,
  dashboardLayout,
  webOnlyTransition,
} from '@/components/dashboard2/styles';
import { VaultCard } from './VaultCard';
import type { VaultCardData, VaultCardActions } from '../domain/vault-manager.types';

interface VaultGridProps extends VaultCardActions {
  vaults: VaultCardData[];
  currentVaultId: string | null;
  isLoading: boolean;
  onCreateVault: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function VaultGrid({
  vaults,
  currentVaultId,
  isLoading,
  onCreateVault,
  onOpen,
  onRename,
  onExport,
  onDelete,
  t,
}: VaultGridProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.sectionContainer, resolveLayerStyle(theme.L2.base)]}>
      <View style={styles.sectionHeaderRow}>
        <Feather name="lock" size={18} color={theme.semantic.purple} />
        <Text
          style={[styles.sectionTitle, { color: theme.L2.base.text.primary }]}
          accessibilityRole="header"
        >
          {t('vaultManager.yourVaults')}
        </Text>
        <Text style={[styles.countBadge, { color: theme.L2.base.text.secondary }]}>
          {vaults.length}
        </Text>
      </View>

      {/* Loading skeleton */}
      {isLoading && vaults.length === 0 && (
        <View style={{ gap: 12 }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      )}

      {/* Empty state */}
      {vaults.length === 0 && !isLoading && (
        <View style={styles.emptyStateContainer}>
          <Feather name="lock" size={48} color="rgba(139,92,246,0.4)" />
          <Text style={[styles.emptyStateTitle, { color: theme.L2.base.text.primary }]}>
            {t('vaultManager.noVaults')}
          </Text>
          <Text style={[styles.emptyStateSubtitle, { color: theme.L2.base.text.secondary }]}>
            {t('vaultManager.createFirst')}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              styles.emptyStateCta,
              webOnlyTransition,
              state.hovered && styles.emptyStateCtaHover,
            ]}
            onPress={onCreateVault}
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.emptyStateCtaText}>{t('vaultManager.createVault')}</Text>
          </Pressable>
        </View>
      )}

      {/* Vault cards */}
      <View style={styles.vaultsGrid}>
        {vaults.map(vault => (
          <VaultCard
            key={vault.id}
            vault={vault}
            isActive={currentVaultId === vault.id}
            onOpen={onOpen}
            onRename={onRename}
            onExport={onExport}
            onDelete={onDelete}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: dashboardSpacing.lg,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: dashboardSpacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(139,92,246,0.1)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  vaultsGrid: {
    gap: dashboardSpacing.md,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg * 3,
    gap: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  emptyStateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 20px rgba(139,92,246,0.3)',
      cursor: 'pointer',
    }),
  },
  emptyStateCtaHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  emptyStateCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
