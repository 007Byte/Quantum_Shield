/**
 * Vault Manager — Thin orchestrator route.
 *
 * All state and business logic lives in useVaultManager hook.
 * Components receive data via props — no direct store imports in components.
 */
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal } from '@/components/common';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import {
  dashboardSpacing,
  dashboardLayout,
  webOnlyTransition,
} from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';

import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { useVaultManager } from '@/features/vault-manager/hooks/useVaultManager';
import { VaultGrid } from '@/features/vault-manager/components/VaultGrid';
import { CreateVaultModal } from '@/features/vault-manager/components/CreateVaultModal';
import { RenameVaultModal } from '@/features/vault-manager/components/RenameVaultModal';
import { DiscoverVaults } from '@/features/vault-manager/components/DiscoverVaults';

function VaultManagerScreen() {
  const { theme } = useTheme();
  const vm = useVaultManager();

  return (
    <ShellLayout>
      <View style={[styles.contentArea, resolveLayerStyle(theme.L2.base)]}>
        {/* Header */}
        <View style={[styles.headerSection, resolveLayerStyle(theme.L2.base)]}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text
                style={[styles.pageTitle, { color: theme.L2.base.text.primary }]}
                accessibilityRole="header"
              >
                {vm.t('vaultManager.pageTitle')}
              </Text>
              <Text style={[styles.pageSubtitle, { color: theme.L2.base.text.secondary }]}>
                {vm.t('vaultManager.pageSubtitle')}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [
                styles.createButton,
                webOnlyTransition,
                state.hovered && styles.createButtonHover,
              ]}
              onPress={vm.openCreateModal}
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.createButtonText}>{vm.t('vaultManager.createNewVault')}</Text>
            </Pressable>
          </View>
        </View>

        {/* Your Vaults */}
        <VaultGrid
          vaults={vm.vaults}
          currentVaultId={vm.currentVault?.id ?? null}
          isLoading={vm.isLoading}
          onCreateVault={vm.openCreateModal}
          onOpen={vm.handleOpenVault}
          onRename={vm.handleRenameOpen}
          onExport={vm.handleExportVault}
          onDelete={vm.handleDeleteVault}
          t={vm.t}
        />

        {/* Discover Vaults */}
        <DiscoverVaults
          isScanning={vm.isScanning}
          detectedVaults={vm.detectedVaults}
          knownLocations={vm.knownLocations}
          lastScanTime={vm.lastScanTime}
          onScanAll={vm.handleScanAll}
          onOpenVault={vm.handleOpenVault}
          onEjectVault={vm.handleEjectVault}
          onRemoveLocation={vm.handleRemoveLocation}
          t={vm.t}
        />
      </View>

      {/* Create Vault Modal */}
      <CreateVaultModal
        state={vm.createModalState}
        onChangeState={vm.setCreateModalState}
        onClose={vm.closeCreateModal}
        onCreate={vm.handleCreateVault}
        t={vm.t}
      />

      {/* Rename Vault Modal */}
      <RenameVaultModal
        state={vm.renameModalState}
        onChangeState={vm.setRenameModalState}
        onClose={vm.closeRenameModal}
        onRename={vm.handleRenameSubmit}
        t={vm.t}
      />

      <InAppModal config={vm.modal} />
    </ShellLayout>
  );
}

// ─── Styles (header only; component styles live with their components) ──

const styles = StyleSheet.create({
  contentArea: {
    paddingRight: 10,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  headerSection: {
    marginBottom: dashboardSpacing.lg,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 200 },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 15,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 10,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 20px rgba(139,92,246,0.3)',
      cursor: 'pointer',
    }),
  },
  createButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default withErrorBoundary(VaultManagerScreen, 'VaultManager');
