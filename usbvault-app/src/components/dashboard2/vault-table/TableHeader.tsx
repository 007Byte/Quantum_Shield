import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { dashboardColors, dashboardSpacing, webOnlyEdgeLit, webOnlyTransition } from '../styles';
import { webOnly } from '@/utils/webStyle';
import { useLanguage } from '@/hooks/useLanguage';

interface TableHeaderProps {
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelectAll: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filterType: string;
  onFilterChange: (type: string) => void;
}

export function TableHeader({
  allSelected,
  someSelected,
  onToggleSelectAll,
  searchQuery,
  onSearchChange,
  filterType,
  onFilterChange,
}: TableHeaderProps) {
  const { t } = useLanguage();
  const [searchFocused, setSearchFocused] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Map internal type values to translation keys
  const typeToKeyMap: Record<string, string> = {
    'All Types': 'vault.allTypes',
    'PDF Document': 'vault.fileTypes.pdfDocument',
    Document: 'vault.fileTypes.document',
    Spreadsheet: 'vault.fileTypes.spreadsheet',
    Archive: 'vault.fileTypes.archive',
    'Secure Folder': 'vault.fileTypes.secureFolder',
    'Password Database': 'vault.fileTypes.passwordDatabase',
    Image: 'vault.fileTypes.image',
    'Encrypted File': 'vault.fileTypes.encryptedFile',
  };

  const FILTER_OPTIONS = [
    'All Types',
    'PDF Document',
    'Document',
    'Spreadsheet',
    'Archive',
    'Secure Folder',
    'Password Database',
    'Image',
    'Encrypted File',
  ];

  // Get translated label for current filter type
  const getFilterLabel = (type: string) => {
    const key = typeToKeyMap[type];
    return key ? t(key) : type;
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.sectionTop}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('vault.yourVault')}
        </Text>

        <View style={styles.controlsRow}>
          <Pressable
            style={(state: any) => [
              styles.searchWrap,
              (state.hovered || searchFocused) && styles.inputHovered,
            ]}
            accessibilityRole="button"
          >
            <Feather
              name="search"
              size={18}
              color={searchFocused ? dashboardColors.cyan : dashboardColors.textSecondary}
            />
            <TextInput
              accessibilityLabel={t('vault.searchVault')}
              placeholder={t('vault.searchVault')}
              placeholderTextColor={dashboardColors.textSecondary}
              value={searchQuery}
              onChangeText={onSearchChange}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              style={styles.searchInput}
            />
          </Pressable>

          <View style={styles.filterContainer}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFilterOpen(!filterOpen)}
              style={(state: any) => [
                styles.filterPill,
                (state.hovered || filterOpen) && styles.inputHovered,
              ]}
            >
              <Text
                style={[styles.filterLabel, filterType !== 'All Types' && styles.filterLabelActive]}
              >
                {getFilterLabel(filterType)}
              </Text>
              <Feather
                name={filterOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={filterOpen ? dashboardColors.cyan : dashboardColors.textSecondary}
              />
            </Pressable>

            {filterOpen && (
              <>
                <Pressable style={styles.filterBackdrop} onPress={() => setFilterOpen(false)} />
                <View style={styles.filterDropdown}>
                  {FILTER_OPTIONS.map(option => (
                    <Pressable
                      accessibilityRole="button"
                      key={option}
                      onPress={() => {
                        onFilterChange(option);
                        setFilterOpen(false);
                      }}
                      style={(state: any) => [
                        styles.filterOption,
                        filterType === option && styles.filterOptionActive,
                        state.hovered && styles.filterOptionHover,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          filterType === option && styles.filterOptionTextActive,
                        ]}
                      >
                        {getFilterLabel(option)}
                      </Text>
                      {filterType === option && (
                        <Feather name="check" size={14} color={dashboardColors.cyan} />
                      )}
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
      </View>

      <View style={styles.headerRow}>
        <View style={styles.nameColHeader}>
          <Pressable
            accessibilityRole="button"
            onPress={onToggleSelectAll}
            style={(state: any) => [
              styles.checkbox,
              allSelected && styles.checkboxChecked,
              !allSelected && someSelected && styles.checkboxIndeterminate,
              state.hovered && styles.checkboxHover,
            ]}
          >
            {allSelected && <Feather name="check" size={14} color="#fff" />}
            {!allSelected && someSelected && <Feather name="minus" size={14} color="#fff" />}
          </Pressable>
          <Text style={styles.headerText}>{t('vault.name')}</Text>
        </View>
        <Text style={[styles.headerText, styles.securityCol]}>{t('vault.security')}</Text>
        <Text style={[styles.headerText, styles.modifiedCol]}>{t('vault.modified')}</Text>
        <View style={styles.actionsColHeader} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: dashboardSpacing.xs,
    zIndex: 10,
    ...webOnly({
      overflow: 'visible',
    }),
  },
  sectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.sm + 2,
    gap: dashboardSpacing.sm + 4,
    zIndex: 20,
    ...webOnly({
      overflow: 'visible',
    }),
  },
  sectionTitle: {
    color: dashboardColors.textPrimary,
    fontSize: 56,
    fontWeight: '800',
    width: 300,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm + 2,
    zIndex: 20,
    ...webOnly({
      overflow: 'visible',
    }),
  },
  searchWrap: {
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    minHeight: 48,
    width: 266,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(18,12,40,0.72)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...webOnly({
      boxShadow: '0 0 12px rgba(139,92,246,0.25), inset 0 0 18px rgba(139,92,246,0.16)',
      background: 'linear-gradient(180deg, rgba(124,58,237,0.2), rgba(17,24,39,0.58))',
    }),
  },
  searchInput: {
    flex: 1,
    color: dashboardColors.textPrimary,
    fontSize: 17,
  },
  filterPill: {
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(18,12,40,0.72)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    ...webOnly({
      boxShadow: '0 0 12px rgba(139,92,246,0.25), inset 0 0 18px rgba(139,92,246,0.16)',
      background: 'linear-gradient(180deg, rgba(124,58,237,0.2), rgba(17,24,39,0.58))',
    }),
  },
  inputHovered: {
    borderColor: 'rgba(34,211,238,0.52)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(34,211,238,0.2), inset 0 0 16px rgba(139,92,246,0.2)',
    }),
  },
  filterContainer: {
    position: 'relative',
    zIndex: 100,
  },
  filterBackdrop: {
    ...webOnly({
      position: 'fixed',
    }),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99,
  },
  filterDropdown: {
    position: 'absolute',
    top: 54,
    right: 0,
    minWidth: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(18,12,40,0.95)',
    paddingVertical: 6,
    zIndex: 100,
    ...webOnly({
      backdropFilter: 'blur(24px)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 20px rgba(139,92,246,0.25)',
    }),
  },
  filterOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.12s ease',
    }),
  },
  filterOptionActive: {
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  filterOptionHover: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    ...webOnly({
      boxShadow: 'inset 0 0 12px rgba(139,92,246,0.1)',
    }),
  },
  filterOptionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '500',
  },
  filterOptionTextActive: {
    color: dashboardColors.cyan,
    fontWeight: '600',
  },
  filterLabel: {
    color: dashboardColors.textPrimary,
    fontSize: 17,
    fontWeight: '500',
  },
  filterLabelActive: {
    color: dashboardColors.cyan,
  },
  headerRow: {
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,85,247,0.3)',
    backgroundColor: 'rgba(34,23,62,0.7)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(124,58,237,0.24), rgba(20,15,45,0.45))',
    }),
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    color: dashboardColors.textSecondary,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  nameColHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 14,
  },
  securityCol: {
    width: 100,
  },
  modifiedCol: {
    width: 104,
  },
  actionsColHeader: {
    width: 32,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(184,179,209,0.38)',
    backgroundColor: 'rgba(8,7,16,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      cursor: 'pointer',
    }),
  },
  checkboxHover: {
    borderColor: 'rgba(139,92,246,0.6)',
    ...webOnly({
      boxShadow: '0 0 8px rgba(139,92,246,0.3)',
    }),
  },
  checkboxChecked: {
    backgroundColor: 'rgba(139,92,246,0.7)',
    borderColor: 'rgba(139,92,246,0.9)',
  },
  checkboxIndeterminate: {
    backgroundColor: 'rgba(139,92,246,0.45)',
    borderColor: 'rgba(139,92,246,0.7)',
  },
});
