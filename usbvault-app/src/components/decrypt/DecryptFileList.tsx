// PH4-FIX: DecryptFileList component - file listing/selection UI
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing, dashboardColors } from '@/components/dashboard2/styles';
import { useLanguage } from '@/hooks/useLanguage';
import type { DisplayFile } from '@/hooks/useDecrypt';

type FileIconInfo = { icon: string; bg: string; tint: string };

const FILE_ICON_MAP: Record<string, FileIconInfo> = {
  pdf: { icon: 'file-text', bg: '#E11D48', tint: '#FFFFFF' },
  docx: { icon: 'file-text', bg: '#7E22CE', tint: '#E9D5FF' },
  doc: { icon: 'file-text', bg: '#7E22CE', tint: '#E9D5FF' },
  xlsx: { icon: 'grid', bg: '#0F766E', tint: '#6EE7B7' },
  xls: { icon: 'grid', bg: '#0F766E', tint: '#6EE7B7' },
  csv: { icon: 'grid', bg: '#0F766E', tint: '#6EE7B7' },
  zip: { icon: 'archive', bg: '#7C3AED', tint: '#F8E16C' },
  rar: { icon: 'archive', bg: '#7C3AED', tint: '#F8E16C' },
  '7z': { icon: 'archive', bg: '#7C3AED', tint: '#F8E16C' },
  jpg: { icon: 'image', bg: '#2563EB', tint: '#7DD3FC' },
  jpeg: { icon: 'image', bg: '#2563EB', tint: '#7DD3FC' },
  png: { icon: 'image', bg: '#2563EB', tint: '#7DD3FC' },
  gif: { icon: 'image', bg: '#2563EB', tint: '#7DD3FC' },
};
const DEFAULT_FILE_ICON: FileIconInfo = { icon: 'file', bg: '#1E40AF', tint: '#93C5FD' };

const getFileIcon = (name: string): FileIconInfo => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICON_MAP[ext] || DEFAULT_FILE_ICON;
};

interface DecryptFileListProps {
  files: DisplayFile[];
  selectedFiles: Set<string>;
  onToggleSelection: (fileId: string) => void;
  onQuickView: (fileId: string) => void;
  onQuickSave: (fileId: string) => void;
}

export function DecryptFileList({
  files,
  selectedFiles,
  onToggleSelection,
  onQuickView,
  onQuickSave,
}: DecryptFileListProps) {
  const { t } = useLanguage();

  if (files.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Feather name="unlock" size={48} color={dashboardColors.textSecondary} />
        <Text style={styles.emptyStateText}>{t('decrypt.noFilesToDecrypt')}</Text>
        <Text style={styles.emptyStateHint}>{t('decrypt.addFilesHint')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.fileList}>
      {files.map(file => {
        const isSelected = selectedFiles.has(file.id);
        const { icon, bg, tint } = getFileIcon(file.name);

        return (
          <Pressable
            accessibilityRole="button"
            key={file.id}
            onPress={() => onToggleSelection(file.id)}
            style={(state: any) => [
              styles.fileRow,
              isSelected && styles.fileRowSelected,
              state.hovered && styles.fileRowHover,
            ]}
          >
            {/* Checkbox */}
            <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
              {isSelected && <Feather name="check" size={14} color="#FFFFFF" />}
            </View>

            {/* File icon */}
            <View style={[styles.fileIcon, { backgroundColor: bg }]}>
              <Feather name={icon as any} size={18} color={tint} />
            </View>

            {/* File info */}
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>
                {file.name}
              </Text>
              <Text style={styles.fileMeta}>
                {file.size} · {file.modified}
              </Text>
            </View>

            {/* PQC badge */}
            {file.isPQC && (
              <View style={styles.pqcBadge}>
                <Text style={styles.pqcBadgeText}>PQC</Text>
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.quickActions}>
              <Pressable
                accessibilityRole="button"
                onPress={e => {
                  e.stopPropagation?.();
                  onQuickView(file.id);
                }}
                style={(state: any) => [
                  styles.quickActionButton,
                  state.hovered && styles.quickActionButtonHover,
                ]}
              >
                <Feather name="eye" size={14} color={dashboardColors.textSecondary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={e => {
                  e.stopPropagation?.();
                  onQuickSave(file.id);
                }}
                style={(state: any) => [
                  styles.quickActionButton,
                  state.hovered && styles.quickActionButtonHover,
                ]}
              >
                <Feather name="download" size={14} color={dashboardColors.textSecondary} />
              </Pressable>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fileList: {
    gap: 2,
    marginBottom: dashboardSpacing.md,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg * 3,
    gap: dashboardSpacing.sm,
  },
  emptyStateText: {
    fontSize: 15,
    color: dashboardColors.textPrimary,
    fontWeight: '500',
  },
  emptyStateHint: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(18,12,40,0.6)',
    borderWidth: 1,
    borderColor: 'transparent',
    gap: dashboardSpacing.sm,
    ...webOnly({ transition: 'all 0.15s ease', cursor: 'pointer' }),
  },
  fileRowSelected: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: 'rgba(139,92,246,0.35)',
    ...webOnly({ boxShadow: '0 0 12px rgba(139,92,246,0.2)' }),
  },
  fileRowHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: dashboardColors.borderPurple,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,12,40,0.6)',
  },
  checkboxChecked: {
    backgroundColor: dashboardColors.purple,
    borderColor: dashboardColors.purple,
  },
  fileIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: dashboardColors.textPrimary,
  },
  fileMeta: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    marginTop: 2,
  },
  pqcBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(34,211,238,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
  },
  pqcBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: dashboardColors.cyan,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 4,
  },
  quickActionButton: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.25)',
    ...webOnly({ transition: 'background-color 0.15s ease' }),
  },
  quickActionButtonHover: {
    backgroundColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(139,92,246,0.35)',
    }),
  },
});
