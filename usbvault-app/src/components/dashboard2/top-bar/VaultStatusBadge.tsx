import React, { useMemo, useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';

interface VaultStatusBadgeProps {
  // Optional: can accept vaultLocked prop, or derive from auth store
  vaultLocked?: boolean;
}

const styles = StyleSheet.create({
  vaultStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 'auto',
  },
  vaultStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  vaultStatusText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
});

/**
 * VaultStatusBadge: Display current vault lock status
 *
 * Features:
 * - Shows colored badge (green for unlocked, red for locked)
 * - Animated dot indicator
 * - Accessibility label with lock status
 * - Can be driven by prop or derive from auth store
 */
export const VaultStatusBadge = React.memo(function VaultStatusBadge({
  vaultLocked: vaultLockedProp,
}: VaultStatusBadgeProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  // FIX: Derive vaultLocked from orchestrator state, not app auth
  const [orchestratorUnlocked, setOrchestratorUnlocked] = useState(() =>
    vaultOrchestrator.isUnlocked()
  );
  useEffect(() => {
    setOrchestratorUnlocked(vaultOrchestrator.isUnlocked());
    const unsub = vaultOrchestrator.onLockStateChange((unlocked: boolean) => {
      setOrchestratorUnlocked(unlocked);
    });
    return unsub;
  }, []);
  const vaultLocked = vaultLockedProp !== undefined ? vaultLockedProp : !orchestratorUnlocked;

  const badgeStyles = useMemo(() => {
    if (vaultLocked) {
      return {
        backgroundColor: `${theme.semantic.danger}1A`,
        borderColor: `${theme.semantic.danger}4D`,
      };
    }
    return {
      backgroundColor: `${theme.semantic.success}1A`,
      borderColor: `${theme.semantic.success}4D`,
    };
  }, [vaultLocked, theme.semantic.danger, theme.semantic.success]);

  return (
    <View
      style={[styles.vaultStatusBadge, badgeStyles]}
      accessibilityRole="text"
      accessibilityLabel={
        vaultLocked
          ? t('topBar.vaultLocked') || 'Vault is locked'
          : t('topBar.vaultUnlocked') || 'Vault is unlocked'
      }
    >
      <View
        style={[
          styles.vaultStatusDot,
          { backgroundColor: vaultLocked ? theme.semantic.danger : theme.semantic.success },
        ]}
      />
      <Text
        style={[
          styles.vaultStatusText,
          { color: vaultLocked ? theme.semantic.danger : theme.semantic.success },
        ]}
      >
        {vaultLocked ? t('topBar.locked') : t('topBar.unlocked')}
      </Text>
    </View>
  );
});
