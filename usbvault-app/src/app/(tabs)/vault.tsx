import { ScrollView, StyleSheet, Text, View, Pressable, TextInput, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useState, useEffect, useCallback, memo } from 'react';
import { useRouter } from 'expo-router';
import { webOnly } from '@/utils/webStyle';
import { useVaultStore } from '@/stores/vaultStore';
import { InAppModal, useInAppModal } from '@/components/common';

import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
  webOnlyTransition,
} from '@/components/dashboard2/styles';

const getSecurityLevelColors = (level: string) => {
  switch (level) {
    case 'maximum':
      return {
        bgLight: 'rgba(16,185,129,0.15)',
        border: 'rgba(16,185,129,0.4)',
        text: '#10B981',
        icon: '#10B981',
      };
    case 'high':
      return {
        bgLight: 'rgba(139,92,246,0.15)',
        border: 'rgba(139,92,246,0.4)',
        text: '#8B5CF6',
        icon: '#8B5CF6',
      };
    case 'standard':
      return {
        bgLight: 'rgba(245,158,11,0.15)',
        border: 'rgba(245,158,11,0.4)',
        text: '#F59E0B',
        icon: '#F59E0B',
      };
    default:
      return {
        bgLight: 'rgba(139,92,246,0.1)',
        border: 'rgba(139,92,246,0.2)',
        text: dashboardColors.textSecondary,
        icon: dashboardColors.textSecondary,
      };
  }
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
};

/** PL-021: Memoized VaultCard — prevents re-render when sibling vault state changes */
const VaultCard = memo(function VaultCard({
  vault,
  onOpen,
  onExport,
  onDelete,
}: {
  vault: { id: string; name: string; fileCount: number; lastModified: string; securityLevel: string };
  onOpen: (id: string) => void;
  onExport: (id: string, name: string) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const securityColors = getSecurityLevelColors(vault.securityLevel);
  return (
    <View style={styles.vaultCard}>
      <View style={styles.vaultCardInner}>
        <View style={styles.vaultCardHeader}>
          <View style={styles.vaultCardTitle}>
            <Text style={styles.vaultName}>{vault.name}</Text>
            <Text style={styles.vaultDescription}>{vault.fileCount} files encrypted</Text>
          </View>
          <View
            style={[
              styles.securityBadge,
              { backgroundColor: securityColors.bgLight, borderColor: securityColors.border },
            ]}
          >
            <Feather name="shield" size={14} color={securityColors.icon} style={styles.securityIcon} />
            <Text style={[styles.securityBadgeText, { color: securityColors.text }]}>
              {vault.securityLevel === 'maximum' && 'Max'}
              {vault.securityLevel === 'high' && 'High'}
              {vault.securityLevel === 'standard' && 'Standard'}
            </Text>
          </View>
        </View>
        <View style={styles.vaultInfoRow}>
          <View style={styles.vaultInfoItem}>
            <Text style={styles.vaultInfoLabel}>Files</Text>
            <Text style={styles.vaultInfoValue}>{vault.fileCount}</Text>
          </View>
          <View style={styles.vaultInfoDivider} />
          <View style={styles.vaultInfoItem}>
            <Text style={styles.vaultInfoLabel}>Last Modified</Text>
            <Text style={styles.vaultInfoValue}>{formatDate(vault.lastModified)}</Text>
          </View>
        </View>
        <View style={styles.vaultActions}>
          <Pressable
            style={(state: any) => [styles.vaultButton, styles.vaultButtonPrimary, webOnlyTransition, state.hovered && styles.vaultButtonPrimaryHover]}
            onPress={() => onOpen(vault.id)}
          >
            <Feather name="unlock" size={16} color="#FFFFFF" />
            <Text style={styles.vaultButtonText}>Open</Text>
          </Pressable>
          <Pressable
            style={(state: any) => [styles.vaultButton, styles.vaultButtonSecondary, webOnlyTransition, state.hovered && styles.vaultButtonSecondaryHover]}
            onPress={() => onExport(vault.id, vault.name)}
          >
            <Feather name="download" size={16} color={dashboardColors.cyan} />
            <Text style={[styles.vaultButtonText, styles.vaultButtonSecondaryText]}>Export</Text>
          </Pressable>
          <Pressable
            style={(state: any) => [styles.vaultButton, styles.vaultButtonDelete, webOnlyTransition, state.hovered && styles.vaultButtonDeleteHover]}
            onPress={() => onDelete(vault.id, vault.name)}
          >
            <Feather name="trash-2" size={16} color="#FF6B6B" />
            <Text style={[styles.vaultButtonText, styles.vaultButtonDeleteText]}>Delete</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

export default function VaultScreen() {
  const router = useRouter();
  // PL-011: Use individual selectors to prevent re-renders on unrelated vault state changes
  const vaults = useVaultStore((s) => s.vaults);
  const isLoading = useVaultStore((s) => s.isLoading);
  const selectVault = useVaultStore((s) => s.selectVault);
  const createVault = useVaultStore((s) => s.createVault);
  const deleteVault = useVaultStore((s) => s.deleteVault);
  const exportVault = useVaultStore((s) => s.exportVault);
  const loadVaults = useVaultStore((s) => s.loadVaults);
  const { modal, showSuccess, showError, showConfirm } = useInAppModal();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVaultName, setNewVaultName] = useState('');

  useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  // PL-018: Wrap event handlers in useCallback to prevent re-allocation on render
  const handleOpenVault = useCallback(async (vaultId: string) => {
    try {
      await selectVault(vaultId);
      router.push('/(tabs)/encrypt' as any);
    } catch (error) {
      showError('Error', 'Failed to open vault');
    }
  }, [selectVault, router, showError]);

  const handleExportVault = useCallback(async (vaultId: string, vaultName: string) => {
    showConfirm(
      'Confirm Export',
      `Export "${vaultName}"?`,
      async () => {
        try {
          await exportVault(vaultId);
          showSuccess('Success', 'Vault export started');
        } catch (error) {
          showError('Error', 'Failed to export vault');
        }
      },
      'Export'
    );
  }, [exportVault, showConfirm, showSuccess, showError]);

  const handleDeleteVault = useCallback(async (vaultId: string, vaultName: string) => {
    showConfirm(
      'Delete Vault',
      `Are you sure you want to delete "${vaultName}"? This action cannot be undone.`,
      async () => {
        try {
          await deleteVault(vaultId);
          showSuccess('Success', 'Vault deleted');
        } catch (error) {
          showError('Error', 'Failed to delete vault');
        }
      },
      'Delete',
      'destructive'
    );
  }, [deleteVault, showConfirm, showSuccess, showError]);

  const handleCreateVault = useCallback(async () => {
    if (!newVaultName.trim()) {
      showError('Error', 'Please enter a vault name');
      return;
    }

    try {
      const metadata = new Uint8Array();
      await createVault(newVaultName, metadata);
      setNewVaultName('');
      setShowCreateModal(false);
      showSuccess('Success', 'Vault created');
    } catch (error) {
      showError('Error', 'Failed to create vault');
    }
  }, [newVaultName, createVault, showSuccess, showError]);

  const displayVaults = vaults;

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentArea}>
              <View style={styles.headerSection}>
                <Text style={styles.pageTitle}>Vault Manager</Text>
                <Text style={styles.pageSubtitle}>Manage your encrypted vaults</Text>
              </View>

              <View style={styles.vaultsContainer}>
                {displayVaults.length === 0 && !isLoading && (
                  <View style={styles.emptyVaultState}>
                    <Feather name="lock" size={48} color="rgba(139,92,246,0.4)" />
                    <Text style={styles.emptyVaultTitle}>No Vaults Yet</Text>
                    <Text style={styles.emptyVaultSub}>Create your first encrypted vault to get started</Text>
                    <Pressable
                      style={(state: any) => [styles.emptyVaultCta, webOnlyTransition, state.hovered && styles.emptyVaultCtaHover]}
                      onPress={() => setShowCreateModal(true)}
                    >
                      <Feather name="plus" size={16} color="#FFFFFF" />
                      <Text style={styles.emptyVaultCtaText}>Create Vault</Text>
                    </Pressable>
                  </View>
                )}
                {displayVaults.map((vault) => (
                  <VaultCard
                    key={vault.id}
                    vault={vault}
                    onOpen={handleOpenVault}
                    onExport={handleExportVault}
                    onDelete={handleDeleteVault}
                  />
                ))}
              </View>

              {/* Create New Vault Button */}
              <Pressable
                style={(state: any) => [styles.createVaultButton, webOnlyTransition, state.hovered && styles.createVaultButtonHover]}
                onPress={() => setShowCreateModal(true)}
              >
                <Feather name="plus" size={18} color="#FFFFFF" />
                <Text style={styles.createVaultButtonText}>Create New Vault</Text>
              </Pressable>

              {/* Create Vault Modal */}
              <Modal
                visible={showCreateModal}
                transparent={true}
                animationType="fade"
              >
                <Pressable
                  style={styles.modalOverlay}
                  onPress={() => setShowCreateModal(false)}
                >
                  <Pressable
                    style={styles.modalContent}
                    onPress={(e) => e.stopPropagation()}
                  >
                    <Text style={styles.modalTitle}>Create New Vault</Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Enter vault name"
                      placeholderTextColor={dashboardColors.textSecondary}
                      value={newVaultName}
                      onChangeText={setNewVaultName}
                    />
                    <View style={styles.modalButtonsRow}>
                      <Pressable
                        style={(state: any) => [styles.modalButton, styles.modalButtonCancel, state.hovered && styles.modalButtonCancelHover]}
                        onPress={() => setShowCreateModal(false)}
                      >
                        <Text style={styles.modalButtonTextCancel}>Cancel</Text>
                      </Pressable>
                      <Pressable
                        style={(state: any) => [styles.modalButton, styles.modalButtonCreate, state.hovered && styles.modalButtonCreateHover]}
                        onPress={handleCreateVault}
                      >
                        <Text style={styles.modalButtonText}>Create</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </Pressable>
              </Modal>

              {isLoading && (
                <View style={styles.loadingOverlay}>
                  <Text style={styles.loadingText}>Loading...</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      <InAppModal config={modal} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
  pageScroll: {
    flex: 1,
    width: '100%',
    ...webOnly({ overflowY: 'auto' }),
  },
  pageContent: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    alignItems: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center',
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(217,70,239,0.55)',
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  contentArea: {
    paddingRight: 10,
  },
  headerSection: {
    marginBottom: dashboardSpacing.lg,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 15,
    color: dashboardColors.textSecondary,
  },
  vaultsContainer: {
    gap: dashboardSpacing.md,
    marginBottom: dashboardSpacing.lg,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  vaultCard: {
    borderRadius: dashboardLayout.radiusXl,
    padding: 1,
    ...webOnly({ background: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(6,182,212,0.1) 100%)' }),
  },
  vaultCardInner: {
    borderRadius: dashboardLayout.radiusXl,
    padding: dashboardSpacing.md,
    backgroundColor: 'rgba(18,12,40,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    gap: dashboardSpacing.md,
  },
  vaultCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: dashboardSpacing.md,
  },
  vaultCardTitle: {
    flex: 1,
  },
  vaultName: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  vaultDescription: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
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
  securityIcon: {
    marginRight: 0,
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
  vaultInfoItem: {
    flex: 1,
  },
  vaultInfoLabel: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  vaultInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  vaultInfoDivider: {
    width: 1,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  vaultActions: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
  },
  vaultButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    backgroundColor: 'rgba(18,12,40,0.6)',
    borderColor: 'rgba(6,182,212,0.3)',
  },
  vaultButtonSecondaryHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  vaultButtonDelete: {
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderColor: 'rgba(255,107,107,0.3)',
  },
  vaultButtonDeleteHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  vaultButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  vaultButtonSecondaryText: {
    color: dashboardColors.cyan,
  },
  vaultButtonDeleteText: {
    color: '#FF6B6B',
  },
  createVaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 30px rgba(139,92,246,0.5), 0 0 60px rgba(34,211,238,0.3)',
    }),
  },
  createVaultButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  createVaultButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(18,12,40,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: dashboardLayout.radiusXl,
    padding: dashboardSpacing.lg,
    width: '80%',
    maxWidth: 400,
    gap: dashboardSpacing.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: dashboardLayout.radiusXl,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    fontSize: 14,
    color: dashboardColors.textPrimary,
    backgroundColor: 'rgba(18,12,40,0.6)',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    marginTop: dashboardSpacing.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalButtonCancel: {
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(18,12,40,0.6)',
  },
  modalButtonCancelHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  modalButtonCreate: {
    borderColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 20px rgba(139,92,246,0.3)',
    }),
  },
  modalButtonCreateHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalButtonTextCancel: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyVaultState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 12,
  },
  emptyVaultTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  emptyVaultSub: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
  },
  emptyVaultCta: {
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
      boxShadow: '0 0 20px rgba(139,92,246,0.3), 0 0 40px rgba(34,211,238,0.15)',
      cursor: 'pointer',
    }),
  },
  emptyVaultCtaHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  emptyVaultCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
