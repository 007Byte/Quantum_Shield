/**
 * FileDropZone — drag-drop file selection + rename section.
 */

import { StyleSheet, Text, TextInput, View, Pressable, type PressableProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { dashboardLayout, dashboardSpacing } from '@/components/dashboard2/styles';
import { formatFileSize } from '@/utils/fileHelpers';
import { SUPPORTED_FORMATS, sanitizeFileName } from '../domain/encrypt.data';
import type { SelectedFile } from '../domain/encrypt.types';

type PressableWithWebHandlers = PressableProps & {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

interface Props {
  selectedFile: SelectedFile | null;
  customName: string;
  effectiveFileName: string;
  isDragHover: boolean;
  onDragHover: (hover: boolean) => void;
  onSelectFile: () => void;
  onCustomNameChange: (text: string) => void;
  onCustomNameBlur: () => void;
  onEditingNameStart: () => void;
  onResetName: () => void;
}

export function FileDropZone({
  selectedFile,
  customName,
  effectiveFileName,
  isDragHover,
  onDragHover,
  onSelectFile,
  onCustomNameChange,
  onCustomNameBlur,
  onEditingNameStart,
  onResetName,
}: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <View style={styles.dropZoneContainer}>
      <Pressable
        accessibilityRole="button"
        onPress={onSelectFile}
        onMouseEnter={() => onDragHover(true)}
        onMouseLeave={() => onDragHover(false)}
        style={[styles.dropZone, isDragHover && styles.dropZoneActive]}
        {...({} as PressableWithWebHandlers)}
      >
        <Feather
          name="upload-cloud"
          size={56}
          color={isDragHover ? theme.semantic.cyan : 'rgba(139,92,246,0.5)'}
        />
        <Text style={[styles.dropZoneTitle, { color: theme.L2.base.text.primary }]}>
          {t('addFile.dropTitle')}
        </Text>
        <Text style={[styles.dropZoneSubtitle, { color: theme.L2.base.text.secondary }]}>
          {t('addFile.dropSubtitle')}
        </Text>

        {selectedFile && (
          <View style={styles.selectedFileInfo}>
            <Feather name="check-circle" size={16} color={theme.semantic.green} />
            <View style={styles.selectedFileDetails}>
              <Text style={[styles.selectedFileName, { color: theme.semantic.green }]}>
                {selectedFile.name}
              </Text>
              <Text style={[styles.selectedFileSize, { color: theme.L2.base.text.secondary }]}>
                {formatFileSize(selectedFile.size)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.supportedFormatsContainer}>
          <Text style={[styles.supportedFormatsLabel, { color: theme.L2.base.text.secondary }]}>
            {t('addFile.supportedFormats')}
          </Text>
          <Text style={[styles.supportedFormats, { color: theme.L2.base.text.secondary }]}>
            {SUPPORTED_FORMATS.join(', ')}
          </Text>
        </View>
      </Pressable>

      {selectedFile && (
        <View style={[styles.renameSection, resolveLayerStyle(theme.L2.base)]}>
          <View style={styles.renameLabelRow}>
            <Feather name="edit-3" size={14} color={theme.semantic.cyan} />
            <Text style={[styles.renameLabel, { color: theme.semantic.cyan }]}>
              Vault File Name
            </Text>
            {effectiveFileName !== sanitizeFileName(selectedFile.name) && (
              <View style={styles.renameModifiedBadge}>
                <Text style={styles.renameModifiedText}>Modified</Text>
              </View>
            )}
          </View>
          <View style={styles.renameInputRow}>
            <TextInput
              accessibilityLabel="Text input"
              style={[
                styles.renameInput,
                resolveLayerStyle(theme.L3.base),
                { color: theme.L2.base.text.primary },
              ]}
              value={customName}
              onChangeText={onCustomNameChange}
              onBlur={onCustomNameBlur}
              onFocus={onEditingNameStart}
              placeholder={sanitizeFileName(selectedFile.name)}
              placeholderTextColor={theme.L2.base.text.secondary}
              selectTextOnFocus
            />
            {effectiveFileName !== sanitizeFileName(selectedFile.name) && (
              <Pressable
                accessibilityRole="button"
                onPress={onResetName}
                style={(state: any) => [
                  styles.renameResetBtn,
                  state.hovered && styles.renameResetBtnHover,
                ]}
              >
                <Feather name="rotate-ccw" size={13} color={theme.L2.base.text.secondary} />
              </Pressable>
            )}
          </View>
          <Text style={[styles.renameHint, { color: theme.L2.base.text.secondary }]}>
            Rename the file before encrypting. Only letters, numbers, dashes, underscores, and dots
            are allowed.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dropZoneContainer: { marginBottom: dashboardSpacing.lg },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: dashboardLayout.radiusXl,
    paddingVertical: dashboardSpacing.xl,
    paddingHorizontal: dashboardSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 240,
    ...webOnly({
      transition: 'all 0.3s ease',
      cursor: 'pointer',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }),
  },
  dropZoneActive: {
    backgroundColor: 'rgba(34,211,238,0.08)',
    ...webOnly({ boxShadow: '0 0 30px rgba(34,211,238,0.3)' }),
  },
  dropZoneTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: dashboardSpacing.md,
  },
  dropZoneSubtitle: {
    fontSize: 14,
    marginTop: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.sm,
  },
  selectedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    marginTop: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  selectedFileDetails: { flex: 1 },
  selectedFileName: { fontSize: 13, fontWeight: '500' },
  selectedFileSize: { fontSize: 11, marginTop: 2 },
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
    marginBottom: dashboardSpacing.sm,
  },
  supportedFormats: { fontSize: 13, lineHeight: 18 },
  renameSection: {
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.25)',
    ...webOnly({
      background: 'linear-gradient(145deg, rgba(6,182,212,0.08), rgba(139,92,246,0.06))',
    }),
  },
  renameLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  renameLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  renameModifiedBadge: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 'auto',
  },
  renameModifiedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  renameInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  renameInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
    ...webOnly({ outline: 'none' }),
  },
  renameResetBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  renameResetBtnHover: {
    borderColor: 'rgba(34,211,238,0.4)',
    ...webOnly({ boxShadow: '0 0 12px rgba(34,211,238,0.2)' }),
  },
  renameHint: {
    fontSize: 11,
    marginTop: 6,
    lineHeight: 15,
  },
});
