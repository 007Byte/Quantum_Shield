import { ScrollView, StyleSheet, Text, View, Pressable, FlatList } from 'react-native';
import { useState, useCallback } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardLayout, dashboardSpacing } from '@/components/dashboard2/styles';

// Mock data types
interface VaultFile {
  id: string;
  filename: string;
  size: string;
  fileType: 'document' | 'image' | 'video' | 'audio' | 'archive' | 'code';
  selected: boolean;
  encryption: 'PQC' | 'AES256';
}

interface ExportHistory {
  id: string;
  filename: string;
  date: string;
  size: string;
  format: string;
}

const getFileIcon = (fileType: string): string => {
  switch (fileType) {
    case 'document':
      return 'file-text';
    case 'image':
      return 'image';
    case 'video':
      return 'film';
    case 'audio':
      return 'music';
    case 'archive':
      return 'package';
    case 'code':
      return 'code';
    default:
      return 'file';
  }
};

export default function ExportFileScreen() {
  const { modal, showSuccess } = useInAppModal();
  const [formatSelection, setFormatSelection] = useState<'original' | 'zip'>('original');

  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([
    { id: '1', filename: 'Q4_Financial_Report.pdf', size: '2.4 MB', fileType: 'document', selected: false, encryption: 'PQC' },
    { id: '2', filename: 'Product_Mockup_v3.png', size: '5.1 MB', fileType: 'image', selected: false, encryption: 'PQC' },
    { id: '3', filename: 'Meeting_Recording_Mar2026.mp4', size: '145 MB', fileType: 'video', selected: false, encryption: 'AES256' },
    { id: '4', filename: 'Client_Negotiations_Audio.m4a', size: '8.7 MB', fileType: 'audio', selected: false, encryption: 'PQC' },
    { id: '5', filename: 'backup_2026_Q1.zip', size: '89 MB', fileType: 'archive', selected: false, encryption: 'PQC' },
    { id: '6', filename: 'api_config_prod.js', size: '12 KB', fileType: 'code', selected: false, encryption: 'AES256' },
  ]);

  const [exportHistory] = useState<ExportHistory[]>([
    { id: '1', filename: 'Financial_Documents_Export.zip', date: 'Mar 8, 2:15 PM', size: '98.2 MB', format: 'ZIP Bundle' },
    { id: '2', filename: 'Project_Files_Export.zip', date: 'Mar 6, 11:42 AM', size: '234.5 MB', format: 'ZIP Bundle' },
    { id: '3', filename: 'Presentation_Deck.pdf', date: 'Mar 4, 3:30 PM', size: '12.8 MB', format: 'Original' },
  ]);

  const selectedCount = vaultFiles.filter(f => f.selected).length;
  const allSelected = vaultFiles.length > 0 && vaultFiles.every(f => f.selected);

  const toggleFileSelection = useCallback((fileId: string) => {
    setVaultFiles(prev =>
      prev.map(f => f.id === fileId ? { ...f, selected: !f.selected } : f)
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    setVaultFiles(prev =>
      prev.map(f => ({ ...f, selected: !allSelected }))
    );
  }, [allSelected]);

  const handleExport = useCallback(() => {
    if (selectedCount === 0) return;

    showSuccess(
      'Export Started',
      `${selectedCount} file${selectedCount > 1 ? 's' : ''} will be exported as ${formatSelection === 'zip' ? 'ZIP bundle' : 'original format'}.`
    );
  }, [selectedCount, formatSelection, showSuccess]);

  const FileListItem = ({ item }: { item: VaultFile }) => (
    <Pressable
      style={[styles.fileItem, { backgroundColor: item.selected ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.05)' }]}
      onPress={() => toggleFileSelection(item.id)}
    >
      <View style={styles.fileCheckbox}>
        <Pressable
          style={[styles.checkbox, item.selected && styles.checkboxSelected]}
          onPress={() => toggleFileSelection(item.id)}
        >
          {item.selected && (
            <Feather name="check" size={14} color="#8B5CF6" />
          )}
        </Pressable>
      </View>

      <View style={styles.fileIconContainer}>
        <View style={styles.fileIconBg}>
          <Feather name={getFileIcon(item.fileType) as any} size={20} color="#22D3EE" />
        </View>
      </View>

      <View style={styles.fileDetailsContainer}>
        <Text style={styles.filename}>{item.filename}</Text>
        <View style={styles.fileMetaRow}>
          <Text style={styles.fileSize}>{item.size}</Text>
          <View style={styles.encryptionBadge}>
            <Feather name="lock" size={10} color="#10B981" />
            <Text style={styles.encryptionText}>{item.encryption}</Text>
          </View>
        </View>
      </View>

      <View style={styles.fileArrowContainer}>
        <Feather name="chevron-right" size={18} color="rgba(184,179,209,0.6)" />
      </View>
    </Pressable>
  );

  const HistoryItem = ({ item }: { item: ExportHistory }) => (
    <View style={styles.historyItem}>
      <View style={styles.historyIconContainer}>
        <Feather name="download" size={18} color="#22D3EE" />
      </View>
      <View style={styles.historyDetailsContainer}>
        <Text style={styles.historyFilename}>{item.filename}</Text>
        <View style={styles.historyMetaRow}>
          <Text style={styles.historyDate}>{item.date}</Text>
          <Text style={styles.historyDot}>•</Text>
          <Text style={styles.historySize}>{item.size}</Text>
          <Text style={styles.historyDot}>•</Text>
          <Text style={styles.historyFormat}>{item.format}</Text>
        </View>
      </View>
      <Pressable style={styles.historyActionButton}>
        <Feather name="download-cloud" size={16} color="#8B5CF6" />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />
          <Sidebar />
          <View style={styles.mainCol}>
            <TopBar />
            <View style={styles.contentArea}>
              {/* Header Section */}
              <View style={styles.headerSection}>
                <View style={styles.headerTop}>
                  <Feather name="download" size={28} color="#8B5CF6" />
                  <View style={styles.headerText}>
                    <Text style={styles.pageTitle}>Export File</Text>
                    <Text style={styles.pageSubtitle}>Download decrypted files to your device</Text>
                  </View>
                </View>
              </View>

              {/* File Selection Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Select Files</Text>
                  <View style={styles.selectionControls}>
                    <Pressable
                      style={[styles.controlButton, selectedCount === vaultFiles.length && styles.controlButtonActive]}
                      onPress={toggleSelectAll}
                    >
                      <Text style={[styles.controlButtonText, selectedCount === vaultFiles.length && styles.controlButtonTextActive]}>
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <Text style={styles.selectionInfo}>
                  {selectedCount} of {vaultFiles.length} file{vaultFiles.length > 1 ? 's' : ''} selected
                </Text>

                <View style={styles.fileList}>
                  <FlatList
                    data={vaultFiles}
                    renderItem={({ item }) => <FileListItem item={item} />}
                    keyExtractor={item => item.id}
                    scrollEnabled={false}
                  />
                </View>
              </View>

              {/* Export Options Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Export Options</Text>

                <View style={styles.optionGroup}>
                  <Text style={styles.optionLabel}>Format</Text>
                  <View style={styles.formatToggle}>
                    <Pressable
                      style={[styles.formatButton, formatSelection === 'original' && styles.formatButtonActive]}
                      onPress={() => setFormatSelection('original')}
                    >
                      <Text style={[styles.formatButtonText, formatSelection === 'original' && styles.formatButtonTextActive]}>
                        Original Format
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.formatButton, formatSelection === 'zip' && styles.formatButtonActive]}
                      onPress={() => setFormatSelection('zip')}
                    >
                      <Text style={[styles.formatButtonText, formatSelection === 'zip' && styles.formatButtonTextActive]}>
                        ZIP Bundle
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.optionGroup}>
                  <Text style={styles.optionLabel}>Destination</Text>
                  <View style={styles.destinationInfo}>
                    <Feather name="hard-drive" size={18} color="#22D3EE" />
                    <View style={styles.destinationDetails}>
                      <Text style={styles.destinationPath}>Local Device Storage</Text>
                      <Text style={styles.destinationDesc}>Files will be saved to your device downloads folder</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Export Button */}
              <View style={styles.actionSection}>
                <Pressable
                  style={[
                    styles.exportButton,
                    selectedCount === 0 && styles.exportButtonDisabled,
                  ]}
                  onPress={handleExport}
                  disabled={selectedCount === 0}
                >
                  <Feather
                    name="download"
                    size={18}
                    color={selectedCount === 0 ? 'rgba(139,92,246,0.4)' : '#F5F3FF'}
                  />
                  <Text style={[
                    styles.exportButtonText,
                    selectedCount === 0 && styles.exportButtonTextDisabled,
                  ]}>
                    Export Selected {selectedCount > 0 && `(${selectedCount})`}
                  </Text>
                </Pressable>
              </View>

              {/* Export History Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Feather name="clock" size={20} color="#8B5CF6" />
                  <Text style={styles.sectionTitle}>Export History</Text>
                </View>

                <View style={styles.historyList}>
                  <FlatList
                    data={exportHistory}
                    renderItem={({ item }) => <HistoryItem item={item} />}
                    keyExtractor={item => item.id}
                    scrollEnabled={false}
                  />
                </View>
              </View>

              {/* Footer Spacer */}
              <View style={styles.footerSpacer} />
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
    marginBottom: 32,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerText: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F5F3FF',
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#B8B3D1',
  },

  // Section Styles
  section: {
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F5F3FF',
    flex: 1,
  },

  // File List Section
  selectionControls: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: 'rgba(139,92,246,0.5)',
  },
  controlButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#B8B3D1',
  },
  controlButtonTextActive: {
    color: '#8B5CF6',
  },
  selectionInfo: {
    fontSize: 12,
    color: '#B8B3D1',
    marginBottom: 14,
  },
  fileList: {
    gap: 10,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    marginBottom: 8,
    ...webOnly({ transition: 'all 0.2s ease' }),
  },
  fileCheckbox: {
    marginRight: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,5,20,0.4)',
  },
  checkboxSelected: {
    backgroundColor: 'rgba(139,92,246,0.3)',
    borderColor: '#8B5CF6',
  },
  fileIconContainer: {
    marginRight: 12,
  },
  fileIconBg: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
  },
  fileDetailsContainer: {
    flex: 1,
  },
  filename: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F5F3FF',
    marginBottom: 4,
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileSize: {
    fontSize: 12,
    color: '#B8B3D1',
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  encryptionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10B981',
  },
  fileArrowContainer: {
    marginLeft: 12,
  },

  // Export Options Section
  optionGroup: {
    marginBottom: 18,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B8B3D1',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formatToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  formatButton: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    alignItems: 'center',
    ...webOnly({ cursor: 'pointer' }),
  },
  formatButtonActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: '#8B5CF6',
  },
  formatButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#B8B3D1',
  },
  formatButtonTextActive: {
    color: '#F5F3FF',
  },
  destinationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
  },
  destinationDetails: {
    flex: 1,
  },
  destinationPath: {
    fontSize: 13,
    fontWeight: '500',
    color: '#22D3EE',
    marginBottom: 2,
  },
  destinationDesc: {
    fontSize: 11,
    color: '#B8B3D1',
  },

  // Action Section
  actionSection: {
    marginBottom: 24,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, rgba(139,92,246,0.85) 0%, rgba(34,211,238,0.3) 100%)',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
    }),
  },
  exportButtonDisabled: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: 'rgba(139,92,246,0.15)',
    ...webOnly({
      background: 'rgba(139,92,246,0.15)',
      cursor: 'not-allowed',
    }),
  },
  exportButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5F3FF',
  },
  exportButtonTextDisabled: {
    color: 'rgba(139,92,246,0.4)',
  },

  // History Section
  historyList: {
    gap: 10,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    marginBottom: 8,
  },
  historyIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
  },
  historyDetailsContainer: {
    flex: 1,
  },
  historyFilename: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F5F3FF',
    marginBottom: 4,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyDate: {
    fontSize: 11,
    color: '#B8B3D1',
  },
  historyDot: {
    fontSize: 11,
    color: 'rgba(184,179,209,0.4)',
  },
  historySize: {
    fontSize: 11,
    color: '#B8B3D1',
  },
  historyFormat: {
    fontSize: 11,
    color: '#B8B3D1',
  },
  historyActionButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    marginLeft: 12,
    ...webOnly({ cursor: 'pointer' }),
  },

  // Footer
  footerSpacer: {
    height: 40,
  },
});
