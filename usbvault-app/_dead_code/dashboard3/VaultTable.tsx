import React from 'react';
import { Feather, Ionicons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { openVaultRowId, vaultContextActions, vaultItems } from './mockData';
import { dashboardColors } from './styles';
import { VaultContextAction, VaultItem } from './types';

function IconForItem({ item, color }: { item: VaultItem | VaultContextAction; color: string }) {
  const size = 17;
  if (item.iconSet === 'Feather') {
    return <Feather name={item.iconName as any} size={size} color={color} />;
  }
  if (item.iconSet === 'Ionicons') {
    return <Ionicons name={item.iconName as any} size={size} color={color} />;
  }
  if (item.iconSet === 'Octicons') {
    return <Octicons name={item.iconName as any} size={size} color={color} />;
  }
  return <MaterialCommunityIcons name={item.iconName as any} size={size} color={color} />;
}

export function VaultTable() {
  return (
    <View style={styles.wrap}>
      <View style={styles.sectionTop}>
        <Text style={styles.sectionTitle}>Your Vault</Text>

        <View style={styles.controlsRow}>
          <View style={styles.searchWrap}>
            <Feather name="search" size={18} color={dashboardColors.textSecondary} />
            <TextInput
              placeholder="Search vault..."
              placeholderTextColor={dashboardColors.textSecondary}
              defaultValue=""
              style={styles.searchInput}
            />
          </View>

          <Pressable style={styles.filterPill}>
            <Text style={styles.filterLabel}>All Types</Text>
            <Feather name="chevron-down" size={16} color={dashboardColors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <View style={styles.tableWrap}>
        <View style={styles.headerRow}>
          <View style={styles.nameColHeader}>
            <View style={styles.checkbox} />
            <Text style={styles.headerText}>Name</Text>
          </View>
          <Text style={[styles.headerText, styles.securityCol]}>Security</Text>
          <Text style={[styles.headerText, styles.modifiedCol]}>Modified</Text>
          <View style={styles.actionsCol}>
            <Feather name="more-horizontal" size={18} color={dashboardColors.textSecondary} />
          </View>
        </View>

        {vaultItems.map((item) => {
          const selected = item.id === openVaultRowId || item.selected;
          return (
            <View key={item.id} style={[styles.row, selected && styles.rowSelected]}>
              <View style={styles.nameCol}>
                <View style={[styles.fileIcon, { backgroundColor: item.iconBg }]}>
                  <IconForItem item={item} color={item.iconTint} />
                </View>
                <View style={styles.nameStack}>
                  <Text style={styles.fileName}>{item.name}</Text>
                  <Text style={styles.fileMeta}>
                    {item.subtype}
                    {item.sizeLabel ? ` • ${item.sizeLabel}` : ''}
                  </Text>
                </View>
              </View>

              <View style={[styles.securityPill, styles.securityCol]}>
                <View style={styles.pqcDot} />
                <Text style={styles.securityLabel}>{item.securityLabel}</Text>
              </View>

              <Text style={[styles.modifiedText, styles.modifiedCol]}>{item.modifiedLabel}</Text>

              <Pressable style={styles.actionsCol}>
                <Feather name="more-horizontal" size={17} color={dashboardColors.textSecondary} />
              </Pressable>
            </View>
          );
        })}

        <View style={styles.contextMenu}>
          {vaultContextActions.map((action, index) => (
            <Pressable
              key={action.id}
              style={[styles.contextRow, index < vaultContextActions.length - 1 ? styles.contextRowDivider : null]}
            >
              <IconForItem item={action} color={dashboardColors.textPrimary} />
              <Text style={styles.contextText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
  },
  sectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  sectionTitle: {
    color: dashboardColors.textPrimary,
    fontSize: 47,
    fontWeight: '700',
    width: 300,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchWrap: {
    minHeight: 48,
    width: 266,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    backgroundColor: 'rgba(14,12,31,0.78)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // @ts-ignore RN Web-only input sheen.
    boxShadow: 'inset 0 0 18px rgba(168,85,247,0.14)',
  },
  searchInput: {
    flex: 1,
    color: dashboardColors.textPrimary,
    fontSize: 17,
  },
  filterPill: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    backgroundColor: 'rgba(18,14,36,0.82)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    // @ts-ignore RN Web-only input sheen.
    boxShadow: 'inset 0 0 18px rgba(168,85,247,0.14)',
  },
  filterLabel: {
    color: dashboardColors.textPrimary,
    fontSize: 17,
    fontWeight: '500',
  },
  tableWrap: {
    position: 'relative',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.36)',
    overflow: 'hidden',
    backgroundColor: 'rgba(15,10,32,0.7)',
    // @ts-ignore RN Web-only layered glass look.
    backdropFilter: 'blur(10px)',
    // @ts-ignore RN Web-only subtle panel glow.
    boxShadow:
      'inset 0 0 26px rgba(96,165,250,0.08), inset 0 0 54px rgba(217,70,239,0.08), 0 0 0 1px rgba(34,211,238,0.08)',
  },
  headerRow: {
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,85,247,0.3)',
    backgroundColor: 'rgba(34,23,62,0.6)',
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
  row: {
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,85,247,0.2)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,12,31,0.72)',
  },
  rowSelected: {
    backgroundColor: 'rgba(39,24,72,0.88)',
    // @ts-ignore RN Web-only selected row sheen.
    boxShadow: 'inset 0 0 26px rgba(168,85,247,0.22)',
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
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
  actionsCol: {
    width: 32,
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(184,179,209,0.38)',
    backgroundColor: 'rgba(8,7,16,0.5)',
    marginRight: 4,
  },
  fileIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  nameStack: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    color: dashboardColors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
  },
  fileMeta: {
    marginTop: 2,
    color: dashboardColors.textSecondary,
    fontSize: 13,
  },
  securityPill: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.42)',
    backgroundColor: 'rgba(9,16,28,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    // @ts-ignore RN Web-only security pill glow.
    boxShadow: 'inset 0 0 14px rgba(34,211,238,0.09)',
  },
  pqcDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: dashboardColors.green,
    // @ts-ignore RN Web-only glow for status dot.
    boxShadow: '0 0 10px rgba(34,197,94,0.85)',
  },
  securityLabel: {
    color: dashboardColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  modifiedText: {
    color: dashboardColors.textPrimary,
    fontSize: 16,
  },
  contextMenu: {
    position: 'absolute',
    right: 8,
    top: 114,
    width: 286,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.52)',
    backgroundColor: 'rgba(26,17,54,0.92)',
    paddingVertical: 8,
    // @ts-ignore RN Web-only menu blur.
    backdropFilter: 'blur(12px)',
    // @ts-ignore RN Web-only menu glow.
    boxShadow:
      '0 18px 56px rgba(2,5,18,0.78), 0 0 0 1px rgba(34,211,238,0.12), inset 0 0 30px rgba(217,70,239,0.24)',
  },
  contextRow: {
    minHeight: 43,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contextRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184,179,209,0.12)',
  },
  contextText: {
    color: dashboardColors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
});
