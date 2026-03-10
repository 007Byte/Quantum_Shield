import { Feather, Ionicons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { vaultContextActions } from '../mockData';
import { dashboardColors, webOnlyGlassLuxury, webOnlyTransition } from '../styles';
import { webOnly } from '@/utils/webStyle';
import { VaultContextAction } from '../types';

interface ContextMenuProps {
  direction: 'up' | 'down';
  onAction: (actionId: string) => void;
  onClose: () => void;
}

function IconForAction({ action, color }: { action: VaultContextAction; color: string }) {
  const size = 17;
  if (action.iconSet === 'Feather') {
    return <Feather name={action.iconName as any} size={size} color={color} />;
  }
  if (action.iconSet === 'Ionicons') {
    return <Ionicons name={action.iconName as any} size={size} color={color} />;
  }
  if (action.iconSet === 'Octicons') {
    return <Octicons name={action.iconName as any} size={size} color={color} />;
  }
  return <MaterialCommunityIcons name={action.iconName as any} size={size} color={color} />;
}

export function ContextMenu({ direction, onAction, onClose }: ContextMenuProps) {
  return (
    <View
      style={[
        styles.contextMenu,
        direction === 'up' ? styles.contextMenuUp : styles.contextMenuDown,
      ]}
    >
      <View style={styles.contextMenuSheen} />
      {vaultContextActions.map((action, index) => (
        <Pressable
          key={action.id}
          onPress={() => {
            onAction(action.id);
            onClose();
          }}
          style={(state: any) => [
            styles.contextRow,
            state.hovered && styles.contextRowHovered,
            index < vaultContextActions.length - 1 ? styles.contextRowDivider : null,
          ]}
        >
          <IconForAction action={action} color={dashboardColors.textPrimary} />
          <Text style={styles.contextText}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  contextMenu: {
    ...webOnlyGlassLuxury,
    position: 'absolute',
    right: 8,
    zIndex: 100,
    width: 286,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    backgroundColor: 'rgba(18,13,40,0.88)',
    paddingVertical: 8,
    ...webOnlyTransition,
    ...webOnly({
      backdropFilter: 'blur(16px)',
      background: 'linear-gradient(180deg, rgba(124,58,237,0.2), rgba(17,24,39,0.56))',
      boxShadow:
        '0 14px 34px rgba(0,0,0,0.62), 0 0 20px rgba(139,92,246,0.36), 0 0 34px rgba(34,211,238,0.12), inset 0 0 26px rgba(139,92,246,0.24)',
    }),
  },
  contextMenuDown: {
    ...webOnly({
      top: '100%',
    }),
  },
  contextMenuUp: {
    ...webOnly({
      bottom: '100%',
    }),
  },
  contextMenuSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 42,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(245,243,255,0.1), rgba(245,243,255,0))',
    }),
    opacity: 0.5,
    pointerEvents: 'none',
  },
  contextRow: {
    ...webOnlyTransition,
    minHeight: 43,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contextRowHovered: {
    backgroundColor: 'rgba(139,92,246,0.14)',
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(139,92,246,0.18), rgba(34,211,238,0.08))',
    }),
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
