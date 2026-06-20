// PH4-FIX: PasswordSearch component - search/filter bar
import { StyleSheet, TextInput, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import {
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
} from '@/components/dashboard2/styles';
import { useLanguage } from '@/hooks/useLanguage';

interface PasswordSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function PasswordSearch({ searchQuery, onSearchChange }: PasswordSearchProps) {
  const { t } = useLanguage();

  return (
    <Pressable
      style={(state: any) => [
        styles.searchContainer,
        glassPanelBase,
        webOnlyGlass,
        state.hovered && styles.searchContainerHover,
      ]}
      accessibilityRole="button"
    >
      <Feather name="search" size={20} color={dashboardColors.textSecondary} />
      <TextInput
        accessibilityLabel={t('passwords.searchPlaceholder')}
        style={styles.searchInput}
        placeholder={t('passwords.searchPlaceholder')}
        placeholderTextColor={dashboardColors.textSecondary}
        value={searchQuery}
        onChangeText={onSearchChange}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.md,
    height: 48,
    gap: dashboardSpacing.sm,
    ...webOnly({ transition: 'all 0.15s ease', cursor: 'text' }),
  },
  searchContainerHover: {
    borderColor: 'rgba(34,211,238,0.45)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(34,211,238,0.2), 0 0 24px rgba(139,92,246,0.15)',
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: dashboardColors.textPrimary,
    backgroundColor: 'transparent',
    ...webOnly({ outline: 'none' }),
  },
});
