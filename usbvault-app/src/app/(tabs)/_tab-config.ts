/**
 * Tab screen configuration — single source of truth for all tab routes.
 *
 * Visible tabs appear in the mobile tab bar.
 * Hidden screens are accessible via Sidebar navigation on web.
 */

export interface TabConfig {
  name: string;
  titleKey: string;
  /** If set, this tab is visible in the mobile tab bar */
  tabBar?: {
    icon: string; // Feather icon name
    labelKey: string;
  };
}

/** Tabs visible in the mobile tab bar (order matters) */
export const VISIBLE_TABS: TabConfig[] = [
  {
    name: 'dashboard',
    titleKey: 'nav.dashboard',
    tabBar: { icon: 'bar-chart-2', labelKey: 'nav.dashboard' },
  },
  { name: 'vault', titleKey: 'nav.vault', tabBar: { icon: 'lock', labelKey: 'nav.vault' } },
  { name: 'share', titleKey: 'nav.share', tabBar: { icon: 'share-2', labelKey: 'nav.share' } },
  {
    name: 'settings',
    titleKey: 'nav.settings',
    tabBar: { icon: 'settings', labelKey: 'nav.settings' },
  },
];

/** Hidden screens — accessible via Sidebar, not shown in mobile tab bar */
export const HIDDEN_SCREENS: TabConfig[] = [
  { name: 'vault-manager', titleKey: 'nav.vaultManager' },
  { name: 'encrypt-store', titleKey: 'nav.encryptStore' },
  { name: 'encrypt', titleKey: 'nav.encrypt' },
  { name: 'decrypt-export', titleKey: 'nav.decryptExport' },
  { name: 'decrypt', titleKey: 'nav.decrypt' },
  { name: 'passwords', titleKey: 'nav.passwords' },
  { name: 'messages', titleKey: 'nav.messages' },
  { name: 'activity', titleKey: 'nav.activity' },
  { name: 'defense', titleKey: 'nav.defenseInDepth' },
  { name: 'help', titleKey: 'nav.help' },
  { name: 'premium', titleKey: 'nav.premium' },
  { name: 'keys', titleKey: 'nav.keyManagement' },
  { name: 'billing', titleKey: 'nav.billing' },
  { name: 'devices', titleKey: 'nav.devices' },
  { name: 'add-file', titleKey: 'nav.addFile' },
  { name: 'export-file', titleKey: 'nav.exportFile' },
  { name: 'remove-file', titleKey: 'nav.removeFile' },
  { name: 'health-check', titleKey: 'nav.healthCheck' },
  { name: 'storage', titleKey: 'nav.storage' },
  { name: 'backup', titleKey: 'nav.backup' },
  { name: 'restore', titleKey: 'nav.restore' },
  { name: 'manage-vaults', titleKey: 'nav.manageVaults' },
  { name: 'find-vault', titleKey: 'nav.findVault' },
  { name: 'setup-usb', titleKey: 'nav.setupUsb' },
  { name: 'reset-usb', titleKey: 'nav.resetUsb' },
  { name: 'brute-force', titleKey: 'nav.bruteForceProtection' },
  { name: 'app-lock', titleKey: 'nav.appLock' },
  { name: 'zero-trace', titleKey: 'nav.zeroTrace' },
  { name: 'tools', titleKey: 'nav.tools' },
  { name: 'classroom', titleKey: 'nav.classroom' },
  { name: 'privacy-policy', titleKey: 'legal.privacyPolicy' },
  { name: 'terms-of-service', titleKey: 'legal.termsOfService' },
];

/** All tab configs in render order (visible first, then hidden) */
export const ALL_TABS: TabConfig[] = [...VISIBLE_TABS, ...HIDDEN_SCREENS];
