import { StyleSheet, Text, View, Pressable, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardSpacing, webOnlyTransition } from '@/components/dashboard2/styles';
import { useTheme } from '@/theme/engine';
import type { FileItem } from '../domain/remove-file.types';

interface FileSelectionListProps {
  files: FileItem[];
  selectedFiles: Set<string>;
  allFilesSelected: boolean;
  onToggleFile: (fileId: string) => void;
  onSelectAll: () => void;
  panelStyle: any;
  labels: {
    selectFiles: string;
    selectAll: string;
    deselectAll: string;
  };
}

export function FileSelectionList({
  files,
  selectedFiles,
  allFilesSelected,
  onToggleFile,
  onSelectAll,
  panelStyle,
  labels,
}: FileSelectionListProps) {
  const { theme } = useTheme();
  const renderFileItem = ({ item }: { item: FileItem }) => {
    const isSelected = selectedFiles.has(item.id);
    return (
      <Pressable
        accessibilityRole="button"
        style={[styles.fileRow, isSelected && styles.fileRowSelected]}
        onPress={() => onToggleFile(item.id)}
      >
        <View style={styles.checkboxContainer}>
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Feather name="check" size={14} color="#fff" />}
          </View>
        </View>

        <View style={styles.fileIconContainer}>
          <View style={styles.fileIcon}>
            <Feather name={item.icon as any} size={20} color={theme.semantic.purple} />
          </View>
        </View>

        <View style={styles.fileInfo}>
          <Text style={[styles.fileName, { color: theme.L2.base.text.primary }]} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={[styles.fileDetails, { color: theme.L2.base.text.secondary }]}>
            {item.size} • {item.dateModified}
          </Text>
        </View>

        <View style={styles.fileActions}>
          <Pressable
            accessibilityRole="button"
            style={styles.fileActionBtn}
            onPress={() => onToggleFile(item.id)}
          >
            <Feather name="trash-2" size={18} color="#ef4444" />
          </Pressable>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.panelCard, panelStyle]}>
      <View style={styles.panelHeader}>
        <Text style={[styles.panelTitle, { color: theme.L2.base.text.primary }]}>
          {labels.selectFiles}
        </Text>
        <View style={styles.selectButtonsGroup}>
          <Pressable
            accessibilityRole="button"
            style={[styles.selectButton, allFilesSelected && styles.selectButtonActive]}
            onPress={onSelectAll}
          >
            <Text style={[styles.selectButtonText, { color: theme.semantic.purple }]}>
              {allFilesSelected ? labels.deselectAll : labels.selectAll}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={files}
        renderItem={renderFileItem}
        keyExtractor={item => item.id}
        scrollEnabled={false}
        style={styles.fileList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panelCard: {
    backgroundColor: 'transparent',
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
    color: '#a78bfa',
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
    color: '#a78bfa',
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
});
