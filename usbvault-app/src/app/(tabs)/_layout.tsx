import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { colors } from '@/theme/colors';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { InAppModal } from '@/components/common';
import { VaultUnlockModal } from '@/components/common/VaultUnlockModal';
import { useVaultUnlock } from '@/hooks/useVaultUnlock';
import { useInAppModal } from '@/components/common';
import { logger } from '@/utils/logger';
import { injectWebTabFixCSS } from '@/styles/webTabFixes';

export default function TabsLayout() {
  // PL-011: Use individual selectors to prevent cascading re-renders
  const loadVaults = useVaultListStore(s => s.loadVaults);
  const vaults = useVaultListStore(s => s.vaults);
  const vaultsById = useVaultListStore(s => s.vaultsById);
  const selectVaultFn = useActiveVaultStore(s => s.selectVault);
  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = activeVaultId ? vaultsById[activeVaultId] : undefined;

  // ── Global vault unlock ───────────────────────────────────────────────
  // FIX: Vault unlock was previously only available on the encrypt-store tab.
  // Moving it to the Tabs layout ensures the unlock modal appears on ANY tab
  // (dashboard, decrypt, remove-file, etc.) when a USB vault needs unlocking.
  const vaultUnlock = useVaultUnlock();
  const { modal } = useInAppModal();

  // SEC-001: Inject web-only CSS that hides inactive tab scenes.
  // Without this, React Nav v7 scenes with z-index:-1 bleed through
  // transparent/glassmorphic backgrounds, causing screen stacking.
  useEffect(() => {
    if (Platform.OS === 'web') {
      const cleanup = injectWebTabFixCSS();
      return cleanup;
    }
    return undefined;
  }, []);

  // Auto-load vaults on mount
  useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  // Auto-select first vault once loaded (if none selected)
  useEffect(() => {
    if (vaults.length > 0 && !currentVault) {
      selectVaultFn(vaults[0].id);
    }
  }, [vaults, currentVault, selectVaultFn]);

  // IMPORTANT: Never return early before <Tabs> — Expo Router v6 requires the
  // Tabs navigator to always be mounted so it can resolve routes from the URL.
  // Returning a loading/error view here unmounts Tabs, which causes ALL tab
  // navigation to fall back to the initial tab (dashboard).
  // Loading/error states are handled within individual screens instead.

  return (
    <ErrorBoundary
      onError={(err, info) => {
        logger.error('[TabsLayout] Screen error:', err);
        logger.error('[TabsLayout] Component stack:', info);
      }}
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarActiveTintColor: colors.accentPrimary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle:
            Platform.OS === 'web'
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
          name="share"
          options={{
            title: 'Share',
            tabBarIcon: () => '🔗',
            tabBarLabel: 'Share',
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

        <Tabs.Screen
          name="encrypt-store"
          options={{
            headerShown: false,
            href: null,
            title: 'Encrypt & Store',
          }}
        />

        <Tabs.Screen
          name="decrypt-export"
          options={{
            headerShown: false,
            href: null,
            title: 'Decrypt & Export',
          }}
        />

        <Tabs.Screen
          name="vault-manager"
          options={{
            headerShown: false,
            href: null,
            title: 'Vault Manager',
          }}
        />

        <Tabs.Screen
          name="privacy-policy"
          options={{
            headerShown: false,
            href: null,
            title: 'Privacy Policy',
          }}
        />

        <Tabs.Screen
          name="terms-of-service"
          options={{
            headerShown: false,
            href: null,
            title: 'Terms of Service',
          }}
        />

      </Tabs>

      {/* ── Global Vault Unlock Modal ────────────────────────────────── */}
      {/* Renders on top of any active tab so USB vaults can be unlocked
          from the dashboard, decrypt screen, or any other tab. */}
      <VaultUnlockModal
        visible={vaultUnlock.showUnlockModal}
        vaultName={currentVault?.name || 'this vault'}
        password={vaultUnlock.unlockPassword}
        onPasswordChange={vaultUnlock.setUnlockPassword}
        error={vaultUnlock.unlockError}
        onErrorClear={() => {}}
        isUnlocking={vaultUnlock.isUnlocking}
        onUnlock={vaultUnlock.handleVaultUnlock}
        onClose={vaultUnlock.dismissUnlockModal}
      />

      {/* InAppModal for success/error alerts from vault unlock */}
      <InAppModal config={modal} />
    </ErrorBoundary>
  );
}

