import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
} from '@/components/dashboard2/styles';

const SUPPORTED_FORMATS = [
  'PDF',
  'DOCX',
  'XLSX',
  'PPTX',
  'ZIP',
  'RAR',
  'Images',
  'Videos',
  'Audio',
];

const MOCK_RECENT_IMPORTS = [
  {
    id: '1',
    name: 'Financial_Report_Q4_2025.xlsx',
    size: '2.4 MB',
    dateAdded: '2 hours ago',
    status: 'encrypted',
    icon: 'file-text',
  },
  {
    id: '2',
    name: 'Presentation_Final.pptx',
    size: '8.7 MB',
    dateAdded: '5 hours ago',
    status: 'encrypted',
    icon: 'layers',
  },
  {
    id: '3',
    name: 'Contract_Legal_Review.pdf',
    size: '1.2 MB',
    dateAdded: '1 day ago',
    status: 'encrypted',
    icon: 'file-text',
  },
  {
    id: '4',
    name: 'Archive_Backup_2025.zip',
    size: '512.6 MB',
    dateAdded: '3 days ago',
    status: 'encrypted',
    icon: 'archive',
  },
  {
    id: '5',
    name: 'Design_Assets_v2.zip',
    size: '145.3 MB',
    dateAdded: '1 week ago',
    status: 'encrypted',
    icon: 'image',
  },
  {
    id: '6',
    name: 'Database_Backup_March.sql',
    size: '67.8 MB',
    dateAdded: '2 weeks ago',
    status: 'pending',
    icon: 'database',
  },
];

export default function AddFileScreen() {
  const { modal, showSuccess } = useInAppModal();
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleBrowseFiles = () => {
    showSuccess('Success', 'File browser would open here');
  };

  const handleDragOver = () => {
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator
      >
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />
          <Sidebar />
          <View style={styles.mainCol}>
            <TopBar />
            <View style={styles.contentArea}>
              {/* Header Section */}
              <View style={styles.headerSection}>
                <Text style={styles.pageTitle}>Add File</Text>
                <Text style={styles.pageSubtitle}>Import files to your encrypted vault</Text>
              </View>

              {/* Drag & Drop Zone */}
              <View
                style={[
                  styles.dropZoneContainer,
                  isDraggingOver && styles.dropZoneContainerActive,
                ]}
                {...{
                  onMouseEnter: handleDragOver,
                  onMouseLeave: handleDragLeave,
                } as any}
              >
                <View style={styles.dropZoneInner}>
                  <Feather
                    name="upload-cloud"
                    size={56}
                    color={isDraggingOver ? dashboardColors.cyan : 'rgba(139,92,246,0.5)'}
                  />
                  <Text style={styles.dropZoneTitle}>Drag & drop files here</Text>
                  <Text style={styles.dropZoneSubtitle}>
                    or click the button below to browse
                  </Text>
                  <View style={styles.supportedFormatsContainer}>
                    <Text style={styles.supportedFormatsLabel}>Supported formats:</Text>
                    <Text style={styles.supportedFormats}>
                      {SUPPORTED_FORMATS.join(', ')}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Browse Files Button */}
              <Pressable
                style={(state: any) => [
                  styles.browseButton,
                  state.hovered && styles.browseButtonHover,
                ]}
                onPress={handleBrowseFiles}
              >
                <Feather name="folder" size={18} color="#FFFFFF" />
                <Text style={styles.browseButtonText}>Browse Files</Text>
              </Pressable>

              {/* Recent Imports Section */}
              <View style={styles.recentImportsSection}>
                <View style={styles.recentImportsHeader}>
                  <Text style={styles.recentImportsTitle}>Recent Imports</Text>
                  <Text style={styles.recentImportsCount}>
                    {MOCK_RECENT_IMPORTS.length} files
                  </Text>
                </View>

                <View style={styles.filesList}>
                  {MOCK_RECENT_IMPORTS.map((file) => (
                    <View key={file.id} style={styles.fileItem}>
                      <View style={styles.fileItemContent}>
                        <View style={styles.fileIconContainer}>
                          <Feather
                            name={file.icon as any}
                            size={20}
                            color={dashboardColors.cyan}
                          />
                        </View>

                        <View style={styles.fileInfo}>
                          <Text style={styles.fileName}>{file.name}</Text>
                          <View style={styles.fileMetaRow}>
                            <Text style={styles.fileSize}>{file.size}</Text>
                            <View style={styles.fileSeparator} />
                            <Text style={styles.fileDate}>{file.dateAdded}</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.fileStatusContainer}>
                        <View
                          style={[
                            styles.statusBadge,
                            file.status === 'encrypted'
                              ? styles.statusBadgeEncrypted
                              : styles.statusBadgePending,
                          ]}
                        >
                          <Feather
                            name={file.status === 'encrypted' ? 'lock' : 'clock'}
                            size={12}
                            color={
                              file.status === 'encrypted'
                                ? dashboardColors.green
                                : '#F59E0B'
                            }
                          />
                          <Text
                            style={[
                              styles.statusBadgeText,
                              file.status === 'encrypted'
                                ? styles.statusBadgeTextEncrypted
                                : styles.statusBadgeTextPending,
                            ]}
                          >
                            {file.status === 'encrypted' ? 'Encrypted' : 'Pending'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Info Box */}
              <View style={styles.infoBox}>
                <View style={styles.infoIconContainer}>
                  <Feather name="info" size={18} color={dashboardColors.cyan} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoTitle}>Post-Quantum Encryption</Text>
                  <Text style={styles.infoText}>
                    All files are encrypted using NIST-approved post-quantum cryptography
                    algorithms. Your data is protected against future quantum computing threats.
                  </Text>
                </View>
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
  // Standard Shell Styles
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

  // Header Section
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

  // Drag & Drop Zone
  dropZoneContainer: {
    marginBottom: dashboardSpacing.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: dashboardLayout.radiusXl,
    backgroundColor: 'rgba(18,12,40,0.4)',
    paddingVertical: dashboardSpacing.xl,
    paddingHorizontal: dashboardSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 240,
    ...webOnly({
      transition: 'all 0.3s ease',
      cursor: 'pointer',
    }),
  },
  dropZoneContainerActive: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(34,211,238,0.08)',
    ...webOnly({
      boxShadow: '0 0 20px rgba(34,211,238,0.2)',
    }),
  },
  dropZoneInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.md,
  },
  dropZoneTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  dropZoneSubtitle: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    marginBottom: dashboardSpacing.sm,
  },
  supportedFormatsContainer: {
    marginTop: dashboardSpacing.md,
    paddingTop: dashboardSpacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.2)',
    width: '100%',
  },
  supportedFormatsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
    marginBottom: dashboardSpacing.sm,
  },
  supportedFormats: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    lineHeight: 18,
  },

  // Browse Button
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    marginBottom: dashboardSpacing.lg,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: '#8B5CF6',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 30px rgba(139,92,246,0.5), 0 0 60px rgba(34,211,238,0.3)',
      cursor: 'pointer',
    }),
  },
  browseButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  browseButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Recent Imports Section
  recentImportsSection: {
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: dashboardSpacing.lg,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  recentImportsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: dashboardSpacing.lg,
    paddingBottom: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  recentImportsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  recentImportsCount: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 8,
  },

  // Files List
  filesList: {
    gap: dashboardSpacing.md,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'rgba(18,12,40,0.6)',
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    ...webOnly({
      transition: 'all 0.2s ease',
    }),
  },
  fileItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    minWidth: 0,
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 4,
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  fileSize: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  fileSeparator: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(139,92,246,0.2)',
  },
  fileDate: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },

  // File Status
  fileStatusContainer: {
    flexShrink: 0,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeEncrypted: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  statusBadgePending: {
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderColor: 'rgba(245,158,11,0.3)',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeTextEncrypted: {
    color: dashboardColors.green,
  },
  statusBadgeTextPending: {
    color: '#F59E0B',
  },

  // Info Box
  infoBox: {
    flexDirection: 'row',
    gap: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
    marginBottom: dashboardSpacing.md,
    ...webOnly({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }),
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.cyan,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    lineHeight: 16,
  },
});
