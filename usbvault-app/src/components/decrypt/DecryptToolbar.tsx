// PH4-FIX: DecryptToolbar component - search and select all bar
import { StyleSheet, Text, View, Pressable, type TextProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing, dashboardColors, dashboardLayout } from '@/components/dashboard2/styles';

// PH4-FIX: Web-only contentEditable support for text input
interface ContentEditableTextProps extends TextProps {
  contentEditable?: boolean;
  suppressContentEditableWarning?: boolean;
  onInput?: (e: React.FormEvent<HTMLDivElement>) => void;
}

// PH4-FIX: Pressable state type with hovered property
type PressableState = { hovered: boolean; pressed: boolean };

interface DecryptToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filteredCount: number;
  totalCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
}

export function DecryptToolbar({
  searchQuery,
  onSearchChange,
  filteredCount,
  totalCount,
  allSelected,
  onSelectAll,
}: DecryptToolbarProps) {
  return (
    <View style={styles.toolbar}>
      <Pressable style={(state: PressableState) => [styles.searchBox, state.hovered && styles.searchBoxHover]}>
        <Feather name="search" size={16} color={dashboardColors.textSecondary} />
        <View style={styles.searchInputWrap}>
          {/* PH4-FIX: Replaced @ts-ignore with proper ContentEditable type */}
          <Text
            style={styles.searchInput}
            contentEditable
            suppressContentEditableWarning
            onInput={(e: React.FormEvent<HTMLDivElement>) => onSearchChange((e.target as HTMLDivElement)?.innerText || '')}
            {...({} as ContentEditableTextProps)}
          >
            {searchQuery || ''}
          </Text>
        </View>
        {!searchQuery && <Text style={styles.searchPlaceholder}>Search files...</Text>}
      </Pressable>
      <Pressable onPress={onSelectAll} style={(state: any) => [styles.selectAllButton, state.hovered && styles.selectAllButtonHover]}>
        <Feather
          name={allSelected && totalCount > 0 ? 'check-square' : 'square'}
          size={16}
          color={dashboardColors.cyan}
        />
        <Text style={styles.selectAllText}>{allSelected && totalCount > 0 ? 'Deselect All' : 'Select All'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: dashboardSpacing.md,
    gap: dashboardSpacing.md,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: dashboardColors.borderPurple,
    backgroundColor: 'rgba(18,12,40,0.6)',
    position: 'relative',
    ...webOnly({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', transition: 'all 0.15s ease', cursor: 'text' }),
  },
  searchInputWrap: {
    flex: 1,
    minHeight: 24,
  },
  searchInput: {
    fontSize: 13,
    color: dashboardColors.textPrimary,
    minHeight: 20,
    ...webOnly({ outlineWidth: 0 }),
  },
  searchPlaceholder: {
    position: 'absolute',
    left: 36,
    fontSize: 13,
    color: dashboardColors.textSecondary,
    ...webOnly({ pointerEvents: 'none' }),
  },
  searchBoxHover: {
    borderColor: 'rgba(34,211,238,0.45)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(34,211,238,0.2), 0 0 24px rgba(139,92,246,0.15)',
    }),
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: 8,
  },
  selectAllText: {
    fontSize: 12,
    color: dashboardColors.cyan,
    fontWeight: '500',
  },
  selectAllButtonHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
});
