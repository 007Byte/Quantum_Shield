import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnly } from '@/utils/webStyle';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { DropdownItem } from './DropdownItem';
import { baseControl, sharedStyles } from './shared';
import type { PressableState } from '@/types/utilities';

interface VaultSelectorProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

interface VaultContextLabel {
  name: string;
  isUsb: boolean;
  driveName: string | null;
  mountPoint: string | null;
  fileSystem: string | null;
  algorithm: string;
  fileCount: number;
}

const styles = StyleSheet.create({
  vaultContextPill: {
    ...baseControl,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 8,
    maxWidth: 340,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  vaultContextInfo: {
    flexShrink: 1,
    minWidth: 0,
  },
  vaultContextName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  vaultContextMeta: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  dropdown: {
    ...sharedStyles.dropdown,
    minWidth: 300,
    maxWidth: 380,
  },
  vaultDropdownIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultDropdownMeta: {
    fontSize: 13,
    marginTop: 1,
  },
  dropdownItemContent: {
    flex: 1,
  },
  dropdownItemText: {
    ...sharedStyles.dropdownItemText,
  },
});

/**
 * VaultSelector: Dropdown menu for switching between available vaults
 *
 * Features:
 * - Shows currently active vault with metadata (USB/Local, file count, etc.)
 * - Displays all available vaults with icons and details
 * - Quick access to setup new vault and manage vaults
 * - Lazy-loads file count from vault orchestrator if needed
 * - Theme-aware styling
 */
export const VaultSelector = React.memo(function VaultSelector({
  isOpen,
  onToggle,
  onClose,
}: VaultSelectorProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { theme } = useTheme();

  // Vault state
  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = useVaultListStore(s => (activeVaultId ? s.vaultsById[activeVaultId] : null));
  const vaults = useVaultListStore(s => s.vaults);
  const files = useVaultListStore(s => s.files);
  const selectVault = useActiveVaultStore(s => s.selectVault);

  // Derive vault context display info
  const vaultContextLabel = useMemo((): VaultContextLabel | null => {
    if (!currentVault) return null;
    const isUsb = !!currentVault.mountPoint;
    return {
      name: currentVault.name,
      isUsb,
      driveName: currentVault.driveName || null,
      mountPoint: currentVault.mountPoint || null,
      fileSystem: currentVault.fileSystem || null,
      algorithm: currentVault.algorithm || 'AES-256-GCM',
      fileCount: (() => {
        const storeCount = files.filter(f => f.vaultId === currentVault.id).length;
        if (storeCount > 0) return storeCount;
        // Fall back to orchestrator index if store hasn't loaded files yet
        const idx = vaultOrchestrator.getIndex();
        return idx ? Object.keys(idx.files).length : 0;
      })(),
    };
  }, [currentVault, files]);

  const handleSelectVault = useCallback(
    async (vaultId: string) => {
      onClose();
      try {
        await selectVault(vaultId);
      } catch {
        /* selectVault sets error in store */
      }
    },
    [selectVault, onClose]
  );

  return (
    <View style={[sharedStyles.controlContainer, isOpen && sharedStyles.controlContainerOpen]}>
      {/* Toggle button */}
      <Pressable
        onPress={onToggle}
        style={(state: PressableState) =>
          [
            styles.vaultContextPill,
            resolveLayerStyle(theme.L3.base),
            state.hovered && resolveLayerStyle(theme.L3.hover),
          ] as any
        }
        accessibilityRole="button"
        accessibilityLabel={
          vaultContextLabel
            ? (t('topBar.switchVault') || 'Switch vault') + ': ' + vaultContextLabel.name
            : t('topBar.selectVault') || 'Select a vault'
        }
        accessibilityState={{ expanded: isOpen }}
      >
        {vaultContextLabel ? (
          <>
            {vaultContextLabel.isUsb ? (
              <MaterialCommunityIcons
                name="usb-flash-drive"
                size={16}
                color={theme.semantic.cyan}
              />
            ) : (
              <Feather name="hard-drive" size={15} color={theme.semantic.purple} />
            )}
            <View style={styles.vaultContextInfo}>
              <Text
                style={[styles.vaultContextName, { color: theme.L2.base.text.primary }]}
                numberOfLines={1}
              >
                {vaultContextLabel.name}
              </Text>
              <Text
                style={[styles.vaultContextMeta, { color: theme.L2.base.text.secondary }]}
                numberOfLines={1}
              >
                {vaultContextLabel.isUsb
                  ? `${vaultContextLabel.driveName} · ${vaultContextLabel.mountPoint}`
                  : t('topBar.localVault') || 'Local Vault'}
                {vaultContextLabel.fileCount > 0
                  ? ` · ${vaultContextLabel.fileCount} ${vaultContextLabel.fileCount === 1 ? t('topBar.file') || 'file' : t('topBar.files') || 'files'}`
                  : ''}
              </Text>
            </View>
            <Feather name="chevron-down" size={14} color={theme.L2.base.text.secondary} />
          </>
        ) : (
          <>
            <Feather name="alert-circle" size={15} color={theme.semantic.warning} />
            <Text style={[styles.dropdownItemText, { color: theme.semantic.warning }]}>
              {t('topBar.noVaultSelected') || 'No Vault Selected'}
            </Text>
            <Feather name="chevron-down" size={14} color={theme.L2.base.text.secondary} />
          </>
        )}
      </Pressable>

      {/* Dropdown menu */}
      {isOpen && (
        <View
          nativeID="dropdown-vault"
          style={[styles.dropdown, resolveLayerStyle(theme.L4.base)]}
          accessibilityRole="menu"
        >
          <Text style={[sharedStyles.dropdownTitle, { color: theme.L2.base.text.secondary }]}>
            {vaults.length > 0
              ? t('topBar.availableVaults') || 'AVAILABLE VAULTS'
              : t('topBar.noVaultsDetected') || 'NO VAULTS DETECTED'}
          </Text>
          {vaults.length === 0 && (
            <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
              <Text
                style={[
                  sharedStyles.dropdownItemText,
                  { color: theme.L2.base.text.secondary, fontSize: 14 },
                ]}
              >
                {t('topBar.connectUsbPrompt') ||
                  'Connect a USB drive with a vault or set up a new one'}
              </Text>
            </View>
          )}
          {vaults.map(vault => {
            const isActive = currentVault?.id === vault.id;
            const isUsb = !!vault.mountPoint;
            return (
              <DropdownItem
                key={vault.id}
                onPress={() => handleSelectVault(vault.id)}
                active={isActive}
              >
                <View
                  style={[
                    styles.vaultDropdownIcon,
                    {
                      backgroundColor: isActive ? 'rgba(139,92,246,0.12)' : 'rgba(139,92,246,0.06)',
                      borderColor: isActive ? 'rgba(139,92,246,0.25)' : 'rgba(139,92,246,0.12)',
                    },
                  ]}
                >
                  {isUsb ? (
                    <MaterialCommunityIcons
                      name="usb-flash-drive"
                      size={16}
                      color={isActive ? theme.semantic.purple : theme.L2.base.text.secondary}
                    />
                  ) : (
                    <Feather
                      name="hard-drive"
                      size={14}
                      color={isActive ? theme.semantic.purple : theme.L2.base.text.secondary}
                    />
                  )}
                </View>
                <View style={styles.dropdownItemContent}>
                  <Text
                    style={[
                      sharedStyles.dropdownItemText,
                      isActive && sharedStyles.dropdownItemTextActive,
                      {
                        color: isActive ? theme.semantic.accentPrimary : theme.L2.base.text.primary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {vault.name}
                  </Text>
                  <Text
                    style={[styles.vaultDropdownMeta, { color: theme.L2.base.text.secondary }]}
                    numberOfLines={1}
                  >
                    {isUsb ? `${vault.driveName || t('topBar.usb') || 'USB'} · ${vault.mountPoint}` : t('topBar.localStorage') || 'Local Storage'}
                    {(() => {
                      let count = vault.fileCount;
                      if (count === 0 && isActive) {
                        const idx = vaultOrchestrator.getIndex();
                        if (idx) count = Object.keys(idx.files).length;
                      }
                      return count > 0
                        ? ` · ${count} ${count === 1 ? t('topBar.file') || 'file' : t('topBar.files') || 'files'}`
                        : vaultOrchestrator.isUnlocked() && isActive
                          ? ` · ${t('topBar.empty') || 'Empty'}`
                          : '';
                    })()}
                  </Text>
                </View>
                {isActive && (
                  <Feather name="check" size={14} color={theme.semantic.accentPrimary} />
                )}
              </DropdownItem>
            );
          })}
          <View
            style={[sharedStyles.dropdownDivider, { backgroundColor: theme.special.divider }]}
          />
          <DropdownItem
            onPress={() => {
              onClose();
              router.navigate('/(tabs)/setup-usb');
            }}
          >
            <Feather name="plus-circle" size={15} color={theme.semantic.accentPrimary} />
            <Text style={[sharedStyles.dropdownItemText, { color: theme.semantic.accentPrimary }]}>
              {t('topBar.setupNewUsbVault') || 'Setup New USB Vault'}
            </Text>
          </DropdownItem>
          <DropdownItem
            onPress={() => {
              onClose();
              router.navigate('/(tabs)/vault-manager');
            }}
          >
            <Feather name="settings" size={15} color={theme.L2.base.text.secondary} />
            <Text style={[sharedStyles.dropdownItemText, { color: theme.L2.base.text.primary }]}>
              {t('topBar.manageVaults') || 'Manage Vaults'}
            </Text>
          </DropdownItem>
        </View>
      )}
    </View>
  );
});
