import { StyleSheet, Text, View, Pressable, TextInput, Modal, Dimensions } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Feather } from '@expo/vector-icons';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { useVaultStore } from '@/stores/vaultStore';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { webOnly } from '@/utils/webStyle';

/** PL-002: Display-ready vault item derived from VaultInfo store data */
interface VaultDisplayRow {
  id: string;
  name: string;
  fileCount: number;
  totalSize: string;
  lastAccessed: string;
  securityLevel: 'Standard' | 'High' | 'Maximum';
  isActive: boolean;
}

interface CreateVaultModalState {
  visible: boolean;
  vaultName: string;
  securityLevel: 'Standard' | 'High' | 'Maximum';
}

interface RenameModalState {
  visible: boolean;
  vaultId: string | null;
  currentName: string;
  newName: string;
}

export default function ManageVaultsScreen() {
  const screenWidth = Dimensions.get('window').width;
  const isMobile = screenWidth < 768;

  // PL-002: Connect to vaultStore instead of hardcoded local state
  const storeVaults = useVaultStore((s) => s.vaults);
  const currentVault = useVaultStore((s) => s.currentVault);
  const loadVaults = useVaultStore((s) => s.loadVaults);
  const createVault = useVaultStore((s) => s.createVault);
  const renameVault = useVaultStore((s) => s.renameVault);
  const deleteVault = useVaultStore((s) => s.deleteVault);

  useEffect(() => {
    if (storeVaults.length === 0) {
      loadVaults();
    }
  }, []);

  // PL-002: Derive display rows from store data
  const vaults = useMemo((): VaultDisplayRow[] =>
    storeVaults.map((v) => {
      const diffMs = Date.now() - new Date(v.lastModified).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      let lastAccessed = 'Just now';
      if (diffMins >= 1 && diffMins < 60) lastAccessed = `${diffMins} min ago`;
      else if (diffMins >= 60 && diffMins < 1440) lastAccessed = `${Math.floor(diffMins / 60)} hours ago`;
      else if (diffMins >= 1440) lastAccessed = `${Math.floor(diffMins / 1440)} days ago`;

      return {
        id: v.id,
        name: v.name,
        fileCount: v.fileCount,
        totalSize: `${v.fileCount} files`, // size not tracked yet — show file count
        lastAccessed,
        securityLevel: (v.securityLevel.charAt(0).toUpperCase() + v.securityLevel.slice(1)) as VaultDisplayRow['securityLevel'],
        isActive: currentVault?.id === v.id,
      };
    }),
    [storeVaults, currentVault]
  );

  const [createModalState, setCreateModalState] = useState<CreateVaultModalState>({
    visible: false,
    vaultName: '',
    securityLevel: 'High',
  });

  const [renameModalState, setRenameModalState] = useState<RenameModalState>({
    visible: false,
    vaultId: null,
    currentName: '',
    newName: '',
  });

  const handleCreateVault = useCallback(async () => {
    if (createModalState.vaultName.trim() === '') {
      return;
    }
    try {
      await createVault(createModalState.vaultName, new Uint8Array(0));
    } catch { /* store sets error */ }
    setCreateModalState({
      visible: false,
      vaultName: '',
      securityLevel: 'High',
    });
  }, [createModalState.vaultName, createVault]);

  const handleRenameVault = useCallback(async () => {
    if (renameModalState.newName.trim() === '' || !renameModalState.vaultId) {
      return;
    }
    try {
      await renameVault(renameModalState.vaultId, renameModalState.newName);
    } catch { /* store sets error */ }
    setRenameModalState({
      visible: false,
      vaultId: null,
      currentName: '',
      newName: '',
    });
  }, [renameModalState.newName, renameModalState.vaultId, renameVault]);

  const handleDeleteVault = useCallback(async (vaultId: string) => {
    try {
      await deleteVault(vaultId);
    } catch { /* store sets error */ }
  }, [deleteVault]);

  const openRenameModal = useCallback((vault: VaultDisplayRow) => {
    setRenameModalState({
      visible: true,
      vaultId: vault.id,
      currentName: vault.name,
      newName: vault.name,
    });
  }, []);

  const getSecurityLevelColor = (level: 'Standard' | 'High' | 'Maximum'): string => {
    switch (level) {
      case 'Maximum':
        return '#8B5CF6';
      case 'High':
        return '#22D3EE';
      case 'Standard':
        return '#B8B3D1';
      default:
        return '#B8B3D1';
    }
  };

  const getSecurityLevelBgColor = (level: 'Standard' | 'High' | 'Maximum'): string => {
    switch (level) {
      case 'Maximum':
        return 'rgba(139, 92, 246, 0.15)';
      case 'High':
        return 'rgba(34, 211, 238, 0.15)';
      case 'Standard':
        return 'rgba(184, 179, 209, 0.15)';
      default:
        return 'rgba(184, 179, 209, 0.15)';
    }
  };

  const colsPerRow = isMobile ? 1 : screenWidth > 1200 ? 3 : 2;
  const cardWidth = (screenWidth - (dashboardSpacing.lg * 2) - ((colsPerRow - 1) * 16)) / colsPerRow;

  return (
    <ShellLayout>
            <View style={styles.contentArea}>
              {/* Header Section */}
              <View style={styles.headerSection}>
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>Manage Vaults</Text>
                <Text style={styles.headerSubtitle}>
                  Create, organize, and manage your encrypted vaults
                </Text>
              </View>
              <Pressable
                style={styles.createButton}
                onPress={() => setCreateModalState({ ...createModalState, visible: true })}
              >
                <Feather name="plus" size={18} color="#000" />
                <Text style={styles.createButtonText}>Create New Vault</Text>
              </Pressable>
            </View>

            {/* Vaults Grid */}
            {vaults.length > 0 ? (
              <View style={styles.vaultsGrid}>
                  {vaults.map((vault) => (
                    <View
                      key={vault.id}
                      style={[styles.vaultCard, { width: isMobile ? '100%' : cardWidth }]}
                    >
                      {/* Active Vault Indicator */}
                      {vault.isActive && (
                        <View style={styles.activeIndicator}>
                          <View style={styles.activeDot} />
                          <Text style={styles.activeText}>Active</Text>
                        </View>
                      )}

                      {/* Card Header */}
                      <View style={styles.cardHeader}>
                        <View style={styles.vaultNameContainer}>
                          <Text style={styles.vaultName}>{vault.name}</Text>
                        </View>
                        <Pressable
                          style={styles.renameIconButton}
                          onPress={() => openRenameModal(vault)}
                        >
                          <Feather name="edit-2" size={16} color="#22D3EE" />
                        </Pressable>
                      </View>

                      {/* Vault Stats */}
                      <View style={styles.statsContainer}>
                        <View style={styles.statItem}>
                          <Feather name="file" size={14} color="#B8B3D1" />
                          <Text style={styles.statLabel}>Files</Text>
                          <Text style={styles.statValue}>{vault.fileCount}</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                          <Feather name="hard-drive" size={14} color="#B8B3D1" />
                          <Text style={styles.statLabel}>Size</Text>
                          <Text style={styles.statValue}>{vault.totalSize}</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                          <Feather name="clock" size={14} color="#B8B3D1" />
                          <Text style={styles.statLabel}>Accessed</Text>
                          <Text style={styles.statValue}>{vault.lastAccessed}</Text>
                        </View>
                      </View>

                      {/* Security Level Badge */}
                      <View
                        style={[
                          styles.securityBadge,
                          { backgroundColor: getSecurityLevelBgColor(vault.securityLevel) },
                        ]}
                      >
                        <Feather
                          name="shield"
                          size={14}
                          color={getSecurityLevelColor(vault.securityLevel)}
                        />
                        <Text
                          style={[
                            styles.securityBadgeText,
                            { color: getSecurityLevelColor(vault.securityLevel) },
                          ]}
                        >
                          {vault.securityLevel}
                        </Text>
                      </View>

                      {/* Encryption Type Display */}
                      <View style={styles.encryptionContainer}>
                        <Feather name="lock" size={14} color="#22D3EE" />
                        <Text style={styles.encryptionText}>PQC-256</Text>
                      </View>

                      {/* Action Buttons */}
                      <View style={styles.actionsContainer}>
                        <Pressable style={styles.actionButton}>
                          <Feather name="folder" size={16} color="#22D3EE" />
                          <Text style={styles.actionButtonText}>Open</Text>
                        </Pressable>
                        <Pressable
                          style={styles.actionButton}
                          onPress={() => openRenameModal(vault)}
                        >
                          <Feather name="edit-3" size={16} color="#8B5CF6" />
                          <Text style={styles.actionButtonText}>Rename</Text>
                        </Pressable>
                        <Pressable style={styles.actionButton}>
                          <Feather name="download" size={16} color="#10B981" />
                          <Text style={styles.actionButtonText}>Export</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.actionButton, styles.deleteActionButton]}
                          onPress={() => handleDeleteVault(vault.id)}
                        >
                          <Feather name="trash-2" size={16} color="#EF4444" />
                          <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>
                            Delete
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
              </View>
            ) : (
              /* Empty State */
              <View style={styles.emptyStateContainer}>
                  <Feather name="lock" size={56} color="rgba(139, 92, 246, 0.5)" />
                  <Text style={styles.emptyStateTitle}>No vaults created yet</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    Create your first vault to start securing your files
                  </Text>
                <Pressable
                  style={styles.emptyStateButton}
                  onPress={() => setCreateModalState({ ...createModalState, visible: true })}
                >
                  <Feather name="plus" size={16} color="#000" />
                  <Text style={styles.emptyStateButtonText}>Create Vault</Text>
                </Pressable>
              </View>
            )}
            </View>

      {/* Create Vault Modal */}
      <Modal
        visible={createModalState.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() =>
          setCreateModalState({
            visible: false,
            vaultName: '',
            securityLevel: 'High',
          })
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Vault</Text>
              <Pressable
                onPress={() =>
                  setCreateModalState({
                    visible: false,
                    vaultName: '',
                    securityLevel: 'High',
                  })
                }
              >
                <Feather name="x" size={24} color="#F5F3FF" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              {/* Vault Name Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Vault Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter vault name"
                  placeholderTextColor="#6B7280"
                  value={createModalState.vaultName}
                  onChangeText={(text) =>
                    setCreateModalState({ ...createModalState, vaultName: text })
                  }
                />
              </View>

              {/* Security Level Selector */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Security Level</Text>
                <View style={styles.securityLevelSelector}>
                  {(['Standard', 'High', 'Maximum'] as const).map((level) => (
                    <Pressable
                      key={level}
                      style={[
                        styles.securityLevelOption,
                        createModalState.securityLevel === level &&
                          styles.securityLevelOptionActive,
                      ]}
                      onPress={() =>
                        setCreateModalState({ ...createModalState, securityLevel: level })
                      }
                    >
                      <Text
                        style={[
                          styles.securityLevelOptionText,
                          createModalState.securityLevel === level &&
                            styles.securityLevelOptionTextActive,
                        ]}
                      >
                        {level}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Encryption Type Display */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Encryption Type</Text>
                <View style={styles.encryptionDisplayContainer}>
                  <Feather name="lock" size={16} color="#22D3EE" />
                  <Text style={styles.encryptionDisplayText}>Post-Quantum Cryptography (PQC-256)</Text>
                </View>
              </View>
            </View>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelButton}
                onPress={() =>
                  setCreateModalState({
                    visible: false,
                    vaultName: '',
                    securityLevel: 'High',
                  })
                }
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.createSubmitButton,
                  createModalState.vaultName.trim() === '' && styles.createSubmitButtonDisabled,
                ]}
                onPress={handleCreateVault}
                disabled={createModalState.vaultName.trim() === ''}
              >
                <Text style={styles.createSubmitButtonText}>Create Vault</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Vault Modal */}
      <Modal
        visible={renameModalState.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() =>
          setRenameModalState({
            visible: false,
            vaultId: null,
            currentName: '',
            newName: '',
          })
        }
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Rename Vault</Text>
              <Pressable
                onPress={() =>
                  setRenameModalState({
                    visible: false,
                    vaultId: null,
                    currentName: '',
                    newName: '',
                  })
                }
              >
                <Feather name="x" size={24} color="#F5F3FF" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Current Name</Text>
                <View style={[styles.textInput, styles.disabledInput]}>
                  <Text style={styles.disabledInputText}>{renameModalState.currentName}</Text>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Name</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter new vault name"
                  placeholderTextColor="#6B7280"
                  value={renameModalState.newName}
                  onChangeText={(text) =>
                    setRenameModalState({ ...renameModalState, newName: text })
                  }
                />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                style={styles.cancelButton}
                onPress={() =>
                  setRenameModalState({
                    visible: false,
                    vaultId: null,
                    currentName: '',
                    newName: '',
                  })
                }
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.createSubmitButton,
                  renameModalState.newName.trim() === '' && styles.createSubmitButtonDisabled,
                ]}
                onPress={handleRenameVault}
                disabled={renameModalState.newName.trim() === ''}
              >
                <Text style={styles.createSubmitButtonText}>Rename</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ShellLayout>
  );
}

const styles = StyleSheet.create({
  contentArea: {
    paddingRight: 10,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: dashboardSpacing.xl,
    paddingBottom: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.1)',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F5F3FF',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#B8B3D1',
    fontWeight: '400',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
    marginLeft: dashboardSpacing.md,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
  },
  vaultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  vaultCard: {
    backgroundColor: 'rgba(31, 24, 59, 0.6)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    marginBottom: 8,
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  activeText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  vaultNameContainer: {
    flex: 1,
  },
  vaultName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F5F3FF',
  },
  renameIconButton: {
    padding: 8,
    marginLeft: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#B8B3D1',
    marginTop: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5F3FF',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    marginHorizontal: 8,
  },
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  securityBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  encryptionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderRadius: 6,
    marginBottom: 12,
  },
  encryptionText: {
    fontSize: 12,
    color: '#22D3EE',
    fontWeight: '600',
    marginLeft: 6,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    flex: 1,
    minWidth: '48%',
    justifyContent: 'center',
  },
  deleteActionButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22D3EE',
    marginLeft: 6,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#F5F3FF',
    marginTop: 24,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#B8B3D1',
    marginBottom: 24,
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(8, 5, 20, 0.95)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    width: '90%',
    maxWidth: 500,
    ...webOnly({
      backdropFilter: 'blur(20px)',
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F5F3FF',
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5F3FF',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#F5F3FF',
  },
  disabledInput: {
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    borderColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
  },
  disabledInputText: {
    fontSize: 14,
    color: '#B8B3D1',
  },
  securityLevelSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  securityLevelOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityLevelOptionActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  securityLevelOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B8B3D1',
  },
  securityLevelOptionTextActive: {
    color: '#000',
  },
  encryptionDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.2)',
  },
  encryptionDisplayText: {
    fontSize: 14,
    color: '#22D3EE',
    fontWeight: '500',
    marginLeft: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139, 92, 246, 0.1)',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B8B3D1',
  },
  createSubmitButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  createSubmitButtonDisabled: {
    backgroundColor: 'rgba(139, 92, 246, 0.5)',
    opacity: 0.6,
  },
  createSubmitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
});
