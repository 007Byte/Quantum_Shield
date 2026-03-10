import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { Badge } from '../common/Badge';
import {
  formatFileSize,
  formatDate,
  getFileTypeIcon,
} from '@/utils/formatters';

interface FileListItemProps {
  id: string;
  name: string;
  size: number;
  modifiedAt: string;
  isPQCProtected?: boolean;
  onPress?: () => void;
  onMorePress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },

  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgTertiary,
  },

  iconText: {
    fontSize: 24,
  },

  content: {
    flex: 1,
    justifyContent: 'space-between',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },

  fileName: {
    flex: 1,
    fontSize: typography.sizes.base,
    fontWeight: '600' as const,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },

  subtitle: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },

  badgeContainer: {
    flexDirection: 'row',
    gap: spacing.xs,
  },

  date: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
  },

  moreButton: {
    padding: spacing.sm,
    marginRight: -spacing.sm,
  },

  moreText: {
    fontSize: 18,
  },
});

// Available for future use
export const FileListItem: React.FC<FileListItemProps> = ({
  id: _id,
  name,
  size,
  modifiedAt,
  isPQCProtected = true,
  onPress,
  onMorePress,
  style,
  testID,
}) => {
  const { emoji, color } = getFileTypeIcon(name);
  const fileSize = formatFileSize(size);
  const date = formatDate(modifiedAt);

  const ext = name.split('.').pop()?.toUpperCase() || 'FILE';

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      activeOpacity={0.7}
      testID={testID}
    >
      {/* File Icon */}
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        <Text style={styles.iconText}>{emoji}</Text>
      </View>

      {/* File Details */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.fileName} numberOfLines={1}>
            {name}
          </Text>
        </View>

        <Text style={styles.subtitle}>
          {ext} • {fileSize}
        </Text>

        <View style={styles.footer}>
          <View style={styles.badgeContainer}>
            {isPQCProtected && (
              <Badge
                variant="pqc"
                label="PQC Protected"
                icon="🛡️"
              />
            )}
          </View>
          <Text style={styles.date}>{date}</Text>
        </View>
      </View>

      {/* More Menu */}
      {onMorePress && (
        <TouchableOpacity
          onPress={onMorePress}
          style={styles.moreButton}
          testID={`${testID}-more`}
        >
          <Text style={styles.moreText}>⋯</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};
