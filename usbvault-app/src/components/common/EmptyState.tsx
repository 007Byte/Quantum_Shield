import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme/engine';
interface EmptyStateProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/**
 * EmptyState - Reusable empty state for lists, tables, and content areas
 *
 * @param icon - Feather icon name to display
 * @param title - Main message
 * @param description - Optional secondary text
 * @param actionLabel - Optional CTA button label
 * @param onAction - Optional CTA callback
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  testID,
}) => {
  const { theme } = useTheme();
  return (
    <View
      style={styles.container}
      accessibilityRole="text"
      accessibilityLabel={`${title}${description ? `. ${description}` : ''}`}
      testID={testID}
    >
      <View style={styles.iconCircle}>
        <Feather name={icon} size={32} color="rgba(139, 92, 246, 0.6)" />
      </View>
      <Text
        style={[styles.title, { color: theme.L2.base.text.primary }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {description ? (
        <Text style={[styles.description, { color: theme.L2.base.text.muted }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.actionBtnText, { color: theme.semantic.accentPrimary }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  actionBtnPressed: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderColor: 'rgba(139, 92, 246, 0.5)',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
