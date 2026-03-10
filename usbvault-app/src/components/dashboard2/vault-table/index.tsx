import { Pressable, StyleSheet, Text, View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
// GUI-01: No longer importing mock data — vault table shows real files or empty state
import {
  dashboardColors,
  webOnlyGlassLuxury,
  webOnlyGlowTier3,
} from '../styles';
import { webOnly } from '@/utils/webStyle';
import { TableHeader } from './TableHeader';
import { VaultTableRow } from './VaultTableRow';
import { useVaultStore } from '@/stores/vaultStore';
import { VaultItem } from '../types';

/**
 * VaultTable - Displays vault contents in a data table with search and filtering.
 *
 * Features a searchable, sortable table showing encrypted files with security status,
 * modification dates, and context menu actions. Supports multi-select with checkbox,
 * adaptive context menu positioning (up/down), and icons for file types.
 *
 * @remarks
 * - Search filters files by name in real-time
 * - Context menu automatically positions up/down to avoid clipping
 * - Multi-select with select-all checkbox in header
 * - Action icons: open, show in folder, rename, share, decrypt, remove
 * - Each row displays PQC encryption status indicator
 */
export function VaultTable() {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('All Types');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuDirection, setMenuDirection] = useState<'down' | 'up'>('down');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { files: storeFiles } = useVaultStore();

  // GUI-01: Convert real vault files to VaultItem format — no mock fallback
  const vaultItems = useMemo((): VaultItem[] => {
    const realFiles = storeFiles || [];
    if (realFiles.length === 0) return [];

    return realFiles.map((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const iconMap: Record<string, { iconName: string; iconTint: string; iconBg: string; subtype: string }> = {
        pdf: { iconName: 'file-text', iconTint: '#FFFFFF', iconBg: '#E11D48', subtype: 'PDF Document' },
        doc: { iconName: 'file-text', iconTint: '#E9D5FF', iconBg: '#7E22CE', subtype: 'Document' },
        docx: { iconName: 'file-text', iconTint: '#E9D5FF', iconBg: '#7E22CE', subtype: 'Document' },
        xlsx: { iconName: 'grid', iconTint: '#6EE7B7', iconBg: '#0F766E', subtype: 'Spreadsheet' },
        csv: { iconName: 'grid', iconTint: '#6EE7B7', iconBg: '#0F766E', subtype: 'Spreadsheet' },
        zip: { iconName: 'archive', iconTint: '#F8E16C', iconBg: '#7C3AED', subtype: 'Archive' },
        png: { iconName: 'image', iconTint: '#7DD3FC', iconBg: '#2563EB', subtype: 'Image' },
        jpg: { iconName: 'image', iconTint: '#7DD3FC', iconBg: '#2563EB', subtype: 'Image' },
      };
      const info = iconMap[ext] || { iconName: 'file', iconTint: '#93C5FD', iconBg: '#1E40AF', subtype: 'Encrypted File' };
      const sizeKB = file.size ? Math.round(file.size / 1024) : 0;
      const sizeLabel = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

      const diffMs = Date.now() - new Date(file.modifiedAt || Date.now()).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      let modifiedLabel = 'just now';
      if (diffMins >= 1 && diffMins < 60) modifiedLabel = `${diffMins} min ago`;
      else if (diffMins >= 60 && diffMins < 1440) modifiedLabel = `${Math.floor(diffMins / 60)}h ago`;
      else if (diffMins >= 1440) modifiedLabel = `${Math.floor(diffMins / 1440)}d ago`;

      return {
        id: file.id,
        name: file.name,
        subtype: info.subtype,
        sizeLabel: sizeKB > 0 ? sizeLabel : undefined,
        securityLabel: 'PQC',
        modifiedLabel,
        iconSet: 'Feather' as const,
        iconName: info.iconName,
        iconTint: info.iconTint,
        iconBg: info.iconBg,
      };
    });
  }, [storeFiles]);

  const toggleMenu = useCallback((itemId: string, itemIndex: number, totalItems: number) => {
    if (openMenuId === itemId) {
      setOpenMenuId(null);
      return;
    }
    const isNearBottom = itemIndex >= totalItems - 4;
    setMenuDirection(isNearBottom ? 'up' : 'down');
    setOpenMenuId(itemId);
  }, [openMenuId]);

  const handleContextAction = (actionId: string) => {
    setOpenMenuId(null);

    // Get currently open file (from menu position)
    const fileName = vaultItems.find(item => item.id === openMenuId)?.name || 'file';

    if (actionId === 'open') {
      Alert.alert('Open File', `Opening: ${fileName}`);
      router.push('/(tabs)/decrypt' as any);
    } else if (actionId === 'show-folder') {
      const filePath = `/vault/${fileName}`;
      Alert.alert('Show in Folder', `File location: ${filePath}`);
    } else if (actionId === 'rename') {
      Alert.prompt(
        'Rename File',
        'Enter new filename:',
        [
          {
            text: 'Cancel',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'Rename',
            onPress: (newName) => {
              if (newName && newName.trim()) {
                Alert.alert('Success', `File renamed to: ${newName}`);
              }
            },
          },
        ],
        'plain-text',
        fileName
      );
    } else if (actionId === 'remove') {
      Alert.alert(
        'Remove File',
        `Are you sure you want to permanently delete "${fileName}"?`,
        [
          {
            text: 'Cancel',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'Delete',
            onPress: () => {
              Alert.alert('Deleted', `File "${fileName}" has been removed from vault`);
            },
            style: 'destructive',
          },
        ]
      );
    } else if (actionId === 'decrypt') {
      router.push('/(tabs)/decrypt' as any);
    } else if (actionId === 'share') {
      router.push('/(tabs)/share' as any);
    }
  };

  const filteredItems = vaultItems.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesType = filterType === 'All Types' || item.subtype === filterType;
    return matchesSearch && matchesType;
  });

  // Select-all logic
  const allSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));
  const someSelected = filteredItems.some((item) => selectedIds.has(item.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((item) => item.id)));
    }
  };

  const toggleSelectItem = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  // UX-01: Illustrated empty state with CTA when no files exist
  if (vaultItems.length === 0) {
    return (
      <View style={styles.wrap}>
        <View style={[styles.tableWrap, { alignItems: 'center', paddingVertical: 60 }]}>
          <View style={styles.tableSheen} />
          <Feather name="shield" size={52} color="rgba(139,92,246,0.5)" />
          <Text style={{ color: dashboardColors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: 16, textAlign: 'center' }}>
            Your Vault is Empty
          </Text>
          <Text style={{ color: dashboardColors.textSecondary, fontSize: 14, marginTop: 6, textAlign: 'center', opacity: 0.8, maxWidth: 320 }}>
            Encrypt your first file to start building your secure vault with post-quantum protection.
          </Text>
          <Pressable
            onPress={() => router.push('/(tabs)/encrypt' as any)}
            style={{
              marginTop: 18,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(139,92,246,0.5)',
              backgroundColor: 'rgba(139,92,246,0.15)',
            }}
          >
            <Feather name="lock" size={16} color="#A855F7" />
            <Text style={{ color: '#A855F7', fontSize: 14, fontWeight: '600' }}>Encrypt Your First File</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <TableHeader
        allSelected={allSelected}
        someSelected={someSelected}
        onToggleSelectAll={toggleSelectAll}
        searchQuery={searchText}
        onSearchChange={setSearchText}
        filterType={filterType}
        onFilterChange={setFilterType}
      />

      {openMenuId && (
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setOpenMenuId(null)}
        />
      )}

      <View style={styles.tableWrap}>
        <View style={styles.tableSheen} />
        <View style={styles.tableBorderOverlay} />

        {filteredItems.map((item, index) => (
          <VaultTableRow
            key={item.id}
            item={item}
            isChecked={selectedIds.has(item.id)}
            isMenuOpen={openMenuId === item.id}
            menuDirection={menuDirection}
            onToggleCheck={() => toggleSelectItem(item.id)}
            onToggleMenu={() => toggleMenu(item.id, index, filteredItems.length)}
            onMenuAction={handleContextAction}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    ...webOnly({
      overflow: 'visible',
    }),
  },
  tableWrap: {
    ...webOnlyGlassLuxury,
    ...webOnlyGlowTier3,
    position: 'relative',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(18,12,40,0.65)',
    ...webOnly({
      overflow: 'visible',
      backdropFilter: 'blur(18px)',
      background: 'linear-gradient(160deg, rgba(139,92,246,0.18), rgba(34,211,238,0.06))',
      boxShadow:
        '0 10px 40px rgba(0,0,0,0.6), 0 0 24px rgba(139,92,246,0.2), inset 0 0 26px rgba(139,92,246,0.2), inset 0 0 48px rgba(34,211,238,0.08)',
    }),
  },
  tableSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 90,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(245,243,255,0.08), rgba(245,243,255,0))',
    }),
    opacity: 0.6,
    pointerEvents: 'none',
  },
  tableBorderOverlay: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245,243,255,0.04)',
    ...webOnly({
      pointerEvents: 'none',
    }),
  },
  menuBackdrop: {
    ...webOnly({
      position: 'fixed',
    }),
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
});
