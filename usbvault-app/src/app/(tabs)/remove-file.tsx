import { ScrollView, StyleSheet, Text, View, Pressable, FlatList } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardLayout, dashboardSpacing, webOnlyTransition } from '@/components/dashboard2/styles';

interface FileItem {
  id: string;
  name: string;
  size: string;
  dateModified: string;
  icon: string;
}

interface DeleteHistory {
  id: string;
  filename: string;
  date: string;
  method: 'quick' | 'secure';
}

const mockFiles: FileItem[] = [
  { id: '1', name: 'project-backup.zip', size: '245 MB', dateModified: 'Mar 7, 2026', icon: 'archive' },
  { id: '2', name: 'confidential-report.pdf', size: '3.2 MB', dateModified: 'Mar 5, 2026', icon: 'file-text' },
  { id: '3', name: 'database-export.sql', size: '156 MB', dateModified: 'Mar 3, 2026', icon: 'database' },
  { id: '4', name: 'presentation-v4.pptx', size: '18.5 MB', dateModified: 'Feb 28, 2026', icon: 'file' },
  { id: '5', name: 'financial-data.xlsx', size: '5.7 MB', dateModified: 'Feb 25, 2026', icon: 'bar-chart-2' },
  { id: '6', name: 'encrypted-notes.txt', size: '842 KB', dateModified: 'Feb 20, 2026', icon: 'edit-3' },
];

const mockDeleteHistory: DeleteHistory[] = [
  { id: 'h1', filename: 'old-cache.tmp', date: 'Mar 8, 2026 14:32', method: 'quick' },
  { id: 'h2', filename: 'temp-upload.bin', date: 'Mar 6, 2026 09:15', method: 'secure' },
  { id: 'h3', filename: 'session-log.txt', date: 'Mar 1, 2026 16:47', method: 'quick' },
];

export default function RemoveFileScreen() {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [secureWipeEnabled, setSecureWipeEnabled] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const { modal, showSuccess, showError, showConfirm } = useInAppModal();

  const allFilesSelected = selectedFiles.size === mockFiles.length;

  const toggleFileSelection = (fileId: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileId)) {
      newSelected.delete(fileId);
    } else {
      newSelected.add(fileId);
    }
    setSelectedFiles(newSelected);
  };

  const selectAllFiles = () => {
    if (allFilesSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(mockFiles.map(f => f.id)));
    }
  };

  const handleDeleteClick = () => {
    setConfirmationText('');
    showConfirm(
      'Confirm Deletion',
      `You are about to permanently delete ${selectedFiles.size} file(s) using ${secureWipeEnabled ? 'secure wipe' : 'quick delete'}.`,
      handleConfirmDelete
    );
  };

  const handleConfirmDelete = () => {
    if (confirmationText.toLowerCase() === 'qav') {
      showSuccess(
        'Files Deleted',
        `${selectedFiles.size} file(s) deleted using ${secureWipeEnabled ? 'secure wipe (3-pass DOD)' : 'quick delete'}.`
      );
      setSelectedFiles(new Set());
      setSecureWipeEnabled(false);
    } else {
      showError(
        'Incorrect Confirmation',
        'Please type "qav" to confirm deletion.'
      );
    }
  };

  const renderFileItem = ({ item }: { item: FileItem }) => {
    const isSelected = selectedFiles.has(item.id);
    return (
      <Pressable
        style={[styles.fileRow, isSelected && styles.fileRowSelected]}
        onPress={() => toggleFileSelection(item.id)}
      >
        <View style={styles.checkboxContainer}>
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Feather name="check" size={14} color="#fff" />}
          </View>
        </View>

        <View style={styles.fileIconContainer}>
          <View style={styles.fileIcon}>
            <Feather name={item.icon as any} size={20} color="#a78bfa" />
          </View>
        </View>

        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileDetails}>{item.size} • {item.dateModified}</Text>
        </View>

        <View style={styles.fileActions}>
          <Pressable
            style={styles.fileActionBtn}
            onPress={() => toggleFileSelection(item.id)}
          >
            <Feather name="trash-2" size={18} color="#ef4444" />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  const renderHistoryItem = ({ item }: { item: DeleteHistory }) => (
    <View style={styles.historyItem}>
      <View style={styles.historyIconContainer}>
        <Feather name={item.method === 'secure' ? 'lock' : 'trash-2'} size={16} color="#a78bfa" />
      </View>
      <View style={styles.historyInfo}>
        <Text style={styles.historyFilename}>{item.filename}</Text>
        <Text style={styles.historyDetails}>
          {item.date} • {item.method === 'secure' ? 'Secure Wipe (3-pass)' : 'Quick Delete'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentArea}>
              {/* Header Section */}
              <View style={styles.headerSection}>
                  <Text style={styles.screenTitle}>Remove File</Text>
                  <Text style={styles.screenSubtitle}>Securely delete files from your vault</Text>
                </View>

                {/* File Selection Section */}
                <View style={styles.panelCard}>
                  <View style={styles.panelHeader}>
                    <Text style={styles.panelTitle}>Select Files to Delete</Text>
                    <View style={styles.selectButtonsGroup}>
                      <Pressable
                        style={[styles.selectButton, allFilesSelected && styles.selectButtonActive]}
                        onPress={selectAllFiles}
                      >
                        <Text style={styles.selectButtonText}>
                          {allFilesSelected ? 'Deselect All' : 'Select All'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  <FlatList
                    data={mockFiles}
                    renderItem={renderFileItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                    style={styles.fileList}
                  />
                </View>

                {/* Deletion Options */}
                {selectedFiles.size > 0 && (
                  <View style={styles.panelCard}>
                    <Text style={styles.panelTitle}>Deletion Options</Text>

                    <View style={styles.optionGroup}>
                      <View style={styles.optionRow}>
                        <View style={styles.optionLeft}>
                          <Feather name="zap" size={20} color="#a78bfa" />
                          <View style={styles.optionText}>
                            <Text style={styles.optionName}>Quick Delete</Text>
                            <Text style={styles.optionDescription}>Remove from vault immediately</Text>
                          </View>
                        </View>
                        <View style={[styles.radioButton, !secureWipeEnabled && styles.radioButtonSelected]}>
                          {!secureWipeEnabled && <View style={styles.radioButtonDot} />}
                        </View>
                      </View>

                      <Pressable
                        style={styles.optionRow}
                        onPress={() => setSecureWipeEnabled(!secureWipeEnabled)}
                      >
                        <View style={styles.optionLeft}>
                          <Feather name="shield" size={20} color="#a78bfa" />
                          <View style={styles.optionText}>
                            <Text style={styles.optionName}>Secure Wipe</Text>
                            <Text style={styles.optionDescription}>Overwrite data with 3-pass DOD standard</Text>
                          </View>
                        </View>
                        <View style={[styles.radioButton, secureWipeEnabled && styles.radioButtonSelected]}>
                          {secureWipeEnabled && <View style={styles.radioButtonDot} />}
                        </View>
                      </Pressable>
                    </View>

                    {/* Warning Banner */}
                    <View style={styles.warningBanner}>
                      <Feather name="alert-circle" size={18} color="#d97706" />
                      <Text style={styles.warningText}>
                        This action is irreversible. Deleted files cannot be recovered.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Delete Button */}
                <View style={styles.buttonGroup}>
                  <Pressable
                    style={[
                      styles.deleteButton,
                      selectedFiles.size === 0 && styles.deleteButtonDisabled
                    ]}
                    onPress={handleDeleteClick}
                    disabled={selectedFiles.size === 0}
                  >
                    <Feather name="trash-2" size={20} color="#fff" />
                    <Text style={styles.deleteButtonText}>
                      Delete Selected ({selectedFiles.size})
                    </Text>
                  </Pressable>
                </View>

              {/* Deletion History */}
              <View style={styles.panelCard}>
                <Text style={styles.panelTitle}>Deletion History</Text>

                {mockDeleteHistory.length > 0 ? (
                  <FlatList
                    data={mockDeleteHistory}
                    renderItem={renderHistoryItem}
                    keyExtractor={(item) => item.id}
                    scrollEnabled={false}
                  />
                ) : (
                  <View style={styles.emptyState}>
                    <Feather name="inbox" size={40} color="#6b7280" />
                    <Text style={styles.emptyStateText}>No deletion history</Text>
                  </View>
                )}
              </View>
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
      boxShadow: '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
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

  // Header Section
  headerSection: {
    marginBottom: dashboardSpacing.lg,
  },

  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },

  screenSubtitle: {
    fontSize: 14,
    color: '#a0aec0',
  },

  // Panel Card
  panelCard: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: dashboardSpacing.md,
    marginBottom: dashboardSpacing.md,
    ...webOnlyTransition,
  },

  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.md,
  },

  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  selectButtonsGroup: {
    flexDirection: 'row',
    gap: 8,
  },

  selectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderColor: '#7c3aed',
    borderWidth: 1,
    backgroundColor: 'transparent',
  },

  selectButtonActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
  },

  selectButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a78bfa',
  },

  // File List
  fileList: {
    gap: 8,
  },

  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(124, 58, 237, 0.05)',
    borderColor: 'rgba(124, 58, 237, 0.1)',
    borderWidth: 1,
  },

  fileRowSelected: {
    backgroundColor: 'rgba(124, 58, 237, 0.15)',
    borderColor: 'rgba(124, 58, 237, 0.3)',
  },

  checkboxContainer: {
    marginRight: 12,
  },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderColor: '#7c3aed',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  checkboxChecked: {
    backgroundColor: '#7c3aed',
    borderColor: '#7c3aed',
  },

  fileIconContainer: {
    marginRight: 12,
  },

  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  fileInfo: {
    flex: 1,
  },

  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },

  fileDetails: {
    fontSize: 12,
    color: '#6b7280',
  },

  fileActions: {
    marginLeft: 12,
  },

  fileActionBtn: {
    padding: 8,
  },

  // Option Group
  optionGroup: {
    gap: 12,
    marginBottom: dashboardSpacing.md,
  },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(124, 58, 237, 0.05)',
    borderColor: 'rgba(124, 58, 237, 0.1)',
    borderWidth: 1,
  },

  optionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  optionText: {
    flex: 1,
  },

  optionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },

  optionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },

  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderColor: '#7c3aed',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    backgroundColor: 'transparent',
  },

  radioButtonSelected: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderColor: '#7c3aed',
  },

  radioButtonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7c3aed',
  },

  // Warning Banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderColor: 'rgba(217, 119, 6, 0.2)',
    borderWidth: 1,
    gap: 10,
  },

  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#f59e0b',
    fontWeight: '500',
  },

  // Button Group
  buttonGroup: {
    marginBottom: dashboardSpacing.md,
  },

  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    gap: 10,
    ...webOnlyTransition,
  },

  deleteButtonDisabled: {
    opacity: 0.5,
  },

  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // History
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomColor: 'rgba(124, 58, 237, 0.1)',
    borderBottomWidth: 1,
    gap: 12,
  },

  historyIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  historyInfo: {
    flex: 1,
  },

  historyFilename: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },

  historyDetails: {
    fontSize: 12,
    color: '#6b7280',
  },

  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },

  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
  },

  // Modal
  modalContent: {
    backgroundColor: 'rgba(8, 5, 20, 0.95)',
    borderColor: 'rgba(124, 58, 237, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    padding: dashboardSpacing.md,
    minWidth: 360,
    maxWidth: 500,
  },

  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.md,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  modalDescription: {
    fontSize: 14,
    color: '#d1d5db',
    marginBottom: dashboardSpacing.md,
    lineHeight: 20,
  },

  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a0aec0',
    marginBottom: 8,
  },

  confirmInput: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    borderColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: dashboardSpacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },

  confirmInputPlaceholder: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },

  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },

  modalButtonCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderColor: '#7c3aed',
    borderWidth: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalButtonCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a78bfa',
  },

  modalButtonConfirm: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  modalButtonConfirmDisabled: {
    opacity: 0.5,
  },

  modalButtonConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
