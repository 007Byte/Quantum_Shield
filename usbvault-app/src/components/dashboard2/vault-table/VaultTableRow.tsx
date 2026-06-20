import { Feather, Ionicons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dashboardColors, webOnlyEdgeLit, webOnlyTransition } from '../styles';
import { webOnly } from '@/utils/webStyle';
import { VaultItem } from '../types';
import { ContextMenu } from './ContextMenu';

interface VaultTableRowProps {
  item: VaultItem;
  isChecked: boolean;
  isMenuOpen: boolean;
  menuDirection: 'up' | 'down';
  onToggleCheck: () => void;
  onToggleMenu: () => void;
  onMenuAction: (action: string) => void;
}

function IconForItem({ item, color }: { item: VaultItem; color: string }) {
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

export function VaultTableRow({
  item,
  isChecked,
  isMenuOpen,
  menuDirection,
  onToggleCheck,
  onToggleMenu,
  onMenuAction,
}: VaultTableRowProps) {
  const isSelected = item.selected;

  return (
    <View style={{ position: 'relative' as any, zIndex: isMenuOpen ? 999 : 1 }}>
      <Pressable
        accessibilityRole="button"
        onPress={onToggleCheck}
        style={(state: any) => [
          styles.row,
          state.hovered && styles.rowHovered,
          isSelected && styles.rowSelected,
          isChecked && styles.rowChecked,
        ]}
      >
        <View style={styles.nameCol}>
          <Pressable
            accessibilityRole="button"
            onPress={(e: any) => {
              e.stopPropagation?.();
              onToggleCheck();
            }}
            style={[styles.checkbox, styles.rowCheckbox, isChecked && styles.checkboxChecked]}
          >
            {isChecked && <Feather name="check" size={14} color="#fff" />}
          </Pressable>
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

        <Pressable
          accessibilityRole="button"
          style={(state: any) => [
            styles.actionsCol,
            styles.actionsBtn,
            state.hovered && styles.actionsBtnHover,
          ]}
          onPress={(e: any) => {
            e.stopPropagation?.();
            onToggleMenu();
          }}
        >
          <Feather name="more-horizontal" size={17} color={dashboardColors.textSecondary} />
        </Pressable>
      </Pressable>

      {isMenuOpen && (
        <ContextMenu direction={menuDirection} onAction={onMenuAction} onClose={onToggleMenu} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    ...webOnlyTransition,
    minHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(168,85,247,0.2)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(12,9,28,0.72)',
    ...webOnly({
      cursor: 'pointer',
    }),
  },
  rowHovered: {
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(139,92,246,0.16), rgba(34,211,238,0.06))',
      boxShadow: 'inset 0 0 18px rgba(168,85,247,0.15)',
    }),
  },
  rowSelected: {
    backgroundColor: 'rgba(39,24,72,0.88)',
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(139,92,246,0.22), rgba(34,211,238,0.08))',
      boxShadow: 'inset 0 0 26px rgba(168,85,247,0.28), inset 0 1px 0 rgba(245,243,255,0.07)',
    }),
  },
  rowChecked: {
    backgroundColor: 'rgba(39,24,72,0.65)',
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
  actionsBtn: {
    borderRadius: 6,
    padding: 4,
    ...webOnly({
      cursor: 'pointer',
    }),
  },
  actionsBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.2)',
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
  checkboxChecked: {
    backgroundColor: 'rgba(139,92,246,0.7)',
    borderColor: 'rgba(139,92,246,0.9)',
  },
  rowCheckbox: {
    marginRight: 0,
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
    ...webOnlyEdgeLit,
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.42)',
    backgroundColor: 'rgba(9,16,28,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    ...webOnly({
      boxShadow: '0 0 10px rgba(139,92,246,0.22), inset 0 0 14px rgba(34,211,238,0.14)',
    }),
  },
  pqcDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: dashboardColors.green,
    ...webOnly({
      boxShadow: '0 0 10px rgba(34,197,94,0.85)',
    }),
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
});
