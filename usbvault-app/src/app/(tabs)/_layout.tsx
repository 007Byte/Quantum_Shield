import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { colors } from '@/theme/colors';
import { useVaultStore } from '@/stores/vaultStore';

export default function TabsLayout() {
  // PL-011: Use individual selectors to prevent cascading re-renders
  const loadVaults = useVaultStore((s) => s.loadVaults);
  const vaults = useVaultStore((s) => s.vaults);
  const selectVault = useVaultStore((s) => s.selectVault);
  const currentVault = useVaultStore((s) => s.currentVault);

  // Auto-load vaults on mount
  useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  // Auto-select first vault once loaded (if none selected)
  useEffect(() => {
    if (vaults.length > 0 && !currentVault) {
      selectVault(vaults[0].id);
    }
  }, [vaults, currentVault, selectVault]);

  return (
      <Tabs
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: Platform.OS === 'web'
          ? { display: 'none' }
          : {
              backgroundColor: colors.bgSecondary,
              borderTopColor: colors.border,
              borderTopWidth: 1,
            },
        tabBarLabelStyle: {
          fontFamily: 'Roboto',
          fontSize: 12,
          fontWeight: '500' as const,
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: () => '📊',
          tabBarLabel: 'Dashboard',
        }}
      />

      <Tabs.Screen
        name="vault"
        options={{
          title: 'Vault',
          tabBarIcon: () => '🔐',
          tabBarLabel: 'Vault',
        }}
      />

      <Tabs.Screen
        name="share"
        options={{
          title: 'Share',
          tabBarIcon: () => '🔗',
          tabBarLabel: 'Share',
        }}
      />

      <Tabs.Screen
        name="encrypt"
        options={{
          headerShown: false,
          href: null,
          title: 'Encrypt',
        }}
      />

      <Tabs.Screen
        name="decrypt"
        options={{
          headerShown: false,
          href: null,
          title: 'Decrypt',
        }}
      />

      <Tabs.Screen
        name="passwords"
        options={{
          headerShown: false,
          href: null,
          title: 'Passwords',
        }}
      />

      <Tabs.Screen
        name="messages"
        options={{
          headerShown: false,
          href: null,
          title: 'Messages',
        }}
      />

      <Tabs.Screen
        name="activity"
        options={{
          headerShown: false,
          href: null,
          title: 'Activity',
        }}
      />

      <Tabs.Screen
        name="defense"
        options={{
          headerShown: false,
          href: null,
          title: 'Defense-in-Depth',
        }}
      />

      <Tabs.Screen
        name="help"
        options={{
          headerShown: false,
          href: null,
          title: 'Help',
        }}
      />

      <Tabs.Screen
        name="premium"
        options={{
          headerShown: false,
          href: null,
          title: 'Premium',
        }}
      />

      <Tabs.Screen
        name="keys"
        options={{
          headerShown: false,
          href: null,
          title: 'Key Management',
        }}
      />

      <Tabs.Screen
        name="billing"
        options={{
          headerShown: false,
          href: null,
          title: 'Billing',
        }}
      />

      <Tabs.Screen
        name="devices"
        options={{
          headerShown: false,
          href: null,
          title: 'Devices',
        }}
      />

      <Tabs.Screen
        name="add-file"
        options={{
          headerShown: false,
          href: null,
          title: 'Add File',
        }}
      />

      <Tabs.Screen
        name="export-file"
        options={{
          headerShown: false,
          href: null,
          title: 'Export File',
        }}
      />

      <Tabs.Screen
        name="remove-file"
        options={{
          headerShown: false,
          href: null,
          title: 'Remove File',
        }}
      />

      <Tabs.Screen
        name="health-check"
        options={{
          headerShown: false,
          href: null,
          title: 'Health Check',
        }}
      />

      <Tabs.Screen
        name="storage"
        options={{
          headerShown: false,
          href: null,
          title: 'Storage',
        }}
      />

      <Tabs.Screen
        name="backup"
        options={{
          headerShown: false,
          href: null,
          title: 'Backup',
        }}
      />

      <Tabs.Screen
        name="restore"
        options={{
          headerShown: false,
          href: null,
          title: 'Restore',
        }}
      />

      <Tabs.Screen
        name="manage-vaults"
        options={{
          headerShown: false,
          href: null,
          title: 'Manage Vaults',
        }}
      />

      <Tabs.Screen
        name="find-vault"
        options={{
          headerShown: false,
          href: null,
          title: 'Find Vault',
        }}
      />

      <Tabs.Screen
        name="setup-usb"
        options={{
          headerShown: false,
          href: null,
          title: 'Setup USB',
        }}
      />

      <Tabs.Screen
        name="reset-usb"
        options={{
          headerShown: false,
          href: null,
          title: 'Reset USB',
        }}
      />

      <Tabs.Screen
        name="brute-force"
        options={{
          headerShown: false,
          href: null,
          title: 'Brute-Force Protection',
        }}
      />

      <Tabs.Screen
        name="app-lock"
        options={{
          headerShown: false,
          href: null,
          title: 'App Lock',
        }}
      />

      <Tabs.Screen
        name="zero-trace"
        options={{
          headerShown: false,
          href: null,
          title: 'Zero-Trace',
        }}
      />

      <Tabs.Screen
        name="tools"
        options={{
          headerShown: false,
          href: null,
          title: 'Tools',
        }}
      />

      <Tabs.Screen
        name="classroom"
        options={{
          headerShown: false,
          href: null,
          title: 'Classroom',
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: () => '⚙️',
          tabBarLabel: 'Settings',
        }}
      />
    </Tabs>
  );
}
