// PH4-FIX: PasswordImport component - password import modal
import { StyleSheet, Text, View, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRef } from 'react';
import { webOnly } from '@/utils/webStyle';
import {
  dashboardSpacing,
  dashboardColors,
  dashboardLayout,
  glassPanelBase,
  webOnlyGlass,
  webOnlyTransition,
} from '@/components/dashboard2/styles';
import { useLanguage } from '@/hooks/useLanguage';
import type { ImportProgress, ImportResult } from '@/services/importService';

// Re-export React for the component
import React from 'react';

const SUPPORTED_IMPORT_FORMATS = [
  'Bitwarden (CSV)',
  '1Password (CSV)',
  'LastPass (CSV)',
  'Chrome (CSV)',
  'KeePass (JSON)',
] as const;

interface PasswordImportProps {
  visible: boolean;
  importProgress: ImportProgress | null;
  importResult: ImportResult | null;
  onClose: () => void;
  onFileSelect: (content: string, fileName: string) => void;
}

export function PasswordImport({
  visible,
  importProgress,
  importResult,
  onClose,
  onFileSelect,
}: PasswordImportProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importDragOver, setImportDragOver] = React.useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      onFileSelect(content, file.name);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      onFileSelect(content, file.name);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setImportDragOver(true);
  };

  const handleDragLeave = () => {
    setImportDragOver(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, glassPanelBase, webOnlyGlass]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} accessibilityRole="header">
              {t('passwords.importTitle')}
            </Text>
            <Pressable
              style={(state: any) => [state.hovered && styles.modalCloseHover]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Feather name="x" size={24} color={dashboardColors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.importSubtitle}>{t('passwords.supportedFormats')}</Text>
            <View style={styles.importFormatList}>
              {SUPPORTED_IMPORT_FORMATS.map(fmt => (
                <View key={fmt} style={styles.importFormatItem}>
                  <Feather name="check-circle" size={14} color="#34D399" />
                  <Text style={styles.importFormatText}>{fmt}</Text>
                </View>
              ))}
            </View>

            {/* Drop zone / File picker */}
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [
                styles.importDropZone,
                importDragOver && styles.importDropZoneActive,
                state.hovered && styles.importDropZoneHover,
              ]}
              onPress={() => fileInputRef.current?.click()}
              {...({
                onDrop: handleDrop,
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
              } as any)}
            >
              <Feather
                name="upload-cloud"
                size={32}
                color={importDragOver ? '#22D3EE' : 'rgba(139,92,246,0.5)'}
              />
              <Text style={styles.importDropText}>
                {importDragOver ? t('passwords.dropFileHere') : t('passwords.clickToSelect')}
              </Text>
              <Text style={styles.importDropHint}>{t('passwords.csvOrJson')}</Text>
            </Pressable>

            {/* Hidden file input (web only) */}
            {typeof document !== 'undefined' && (
              <input
                ref={el => {
                  fileInputRef.current = el;
                }}
                type="file"
                accept=".csv,.json,.txt"
                style={{ display: 'none' }}
                onChange={handleFileSelect as any}
              />
            )}

            {/* Progress bar */}
            {importProgress && (
              <View style={styles.importProgressContainer}>
                <View style={styles.importProgressBarBg}>
                  <View
                    style={[
                      styles.importProgressBarFill,
                      { width: `${importProgress.percentage}%` } as any,
                    ]}
                  />
                </View>
                <Text style={styles.importProgressText}>
                  {importProgress.current} / {importProgress.total} ({importProgress.percentage}%)
                </Text>
              </View>
            )}

            {/* Result summary */}
            {importResult && !importProgress && (
              <View style={styles.importResultCard}>
                <View style={styles.importResultRow}>
                  <Feather name="check-circle" size={16} color="#34D399" />
                  <Text style={styles.importResultText}>
                    {t('passwords.imported', { count: importResult.imported })}
                  </Text>
                </View>
                {importResult.duplicates > 0 && (
                  <View style={styles.importResultRow}>
                    <Feather name="copy" size={16} color="#FBBF24" />
                    <Text style={styles.importResultText}>
                      {t('passwords.duplicatesSkipped', { count: importResult.duplicates })}
                    </Text>
                  </View>
                )}
                {importResult.skipped > importResult.duplicates && (
                  <View style={styles.importResultRow}>
                    <Feather name="skip-forward" size={16} color={dashboardColors.textSecondary} />
                    <Text style={styles.importResultText}>
                      {t('passwords.emptySkipped', {
                        count: importResult.skipped - importResult.duplicates,
                      })}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>

          <View style={styles.modalFooter}>
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [
                styles.modalCancelButton,
                webOnlyTransition,
                state.hovered && styles.modalCancelButtonHover,
              ]}
              onPress={onClose}
            >
              <Text style={styles.modalCancelButtonText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: dashboardSpacing.md,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    borderRadius: dashboardLayout.radiusXl,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  modalBody: {
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.lg,
    gap: dashboardSpacing.md,
  },
  importSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 8,
  },
  importFormatList: {
    gap: 6,
    marginBottom: 16,
  },
  importFormatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  importFormatText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  importDropZone: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(8,5,20,0.5)',
    gap: 8,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.2s ease' }),
  },
  importDropZoneActive: {
    borderColor: '#22D3EE',
    backgroundColor: 'rgba(34,211,238,0.08)',
  },
  importDropZoneHover: {
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  importDropText: {
    fontSize: 14,
    fontWeight: '500',
    color: dashboardColors.textPrimary,
  },
  importDropHint: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  importProgressContainer: {
    marginTop: 16,
    gap: 6,
  },
  importProgressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(139,92,246,0.15)',
    overflow: 'hidden',
  },
  importProgressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#22D3EE',
    ...webOnly({ transition: 'width 0.2s ease' }),
  },
  importProgressText: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
  },
  importResultCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    gap: 8,
  },
  importResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  importResultText: {
    fontSize: 13,
    color: dashboardColors.textPrimary,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.2)',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    ...webOnly({ cursor: 'pointer' }),
  },
  modalCancelButtonHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
  },
  modalCloseHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
});
