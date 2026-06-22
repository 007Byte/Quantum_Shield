/**
 * navigationConfig — Static navigation & UI action configuration.
 *
 * These are NOT mock data — they are structural definitions that describe
 * the app's navigation items, hero actions, and vault context menu entries.
 *
 * Extracted from mockData.ts to clearly separate static UI config from
 * runtime data that should come from services/stores.
 *
 * @module components/dashboard2/navigationConfig
 */

import type { DashboardNavItem, HeroAction, VaultContextAction } from './types';
import { NavSection } from './types';

// ─── Sidebar navigation items ───────────────────────────────────────

export const navItems: DashboardNavItem[] = [
  // ─── DASHBOARD (top-level, no group) ───
  {
    id: 'dashboard',
    label: 'sidebar.dashboard',
    iconSet: 'MaterialCommunityIcons',
    iconName: 'view-dashboard-outline',
    active: true,
    section: NavSection.Top,
  },
  // ─── FILES ─────────────
  {
    id: 'encrypt-store',
    label: 'sidebar.encryptStore',
    iconSet: 'Feather',
    iconName: 'shield',
    section: NavSection.Main,
    group: 'FILES',
  },
  {
    id: 'decrypt-export',
    label: 'sidebar.decryptExport',
    iconSet: 'Feather',
    iconName: 'unlock',
    section: NavSection.Main,
    group: 'FILES',
  },
  {
    id: 'remove-file',
    label: 'sidebar.removeFile',
    iconSet: 'Feather',
    iconName: 'trash-2',
    section: NavSection.Main,
    group: 'FILES',
  },
  // ─── VAULT ─────────────
  {
    id: 'vault-manager',
    label: 'sidebar.vaultManager',
    iconSet: 'Feather',
    iconName: 'database',
    section: NavSection.Main,
    group: 'VAULT',
  },
  {
    id: 'health-check',
    label: 'sidebar.healthCheck',
    iconSet: 'Feather',
    iconName: 'activity',
    section: NavSection.Main,
    group: 'VAULT',
  },
  {
    id: 'storage',
    label: 'sidebar.storage',
    iconSet: 'Feather',
    iconName: 'hard-drive',
    section: NavSection.Main,
    group: 'VAULT',
  },
  {
    id: 'backup',
    label: 'sidebar.backup',
    iconSet: 'Feather',
    iconName: 'save',
    section: NavSection.Main,
    group: 'VAULT',
  },
  {
    id: 'restore',
    label: 'sidebar.restore',
    iconSet: 'Feather',
    iconName: 'rotate-ccw',
    section: NavSection.Main,
    group: 'VAULT',
  },
  // ─── USB ─────────────
  {
    id: 'setup-usb',
    label: 'sidebar.setupUsb',
    iconSet: 'Feather',
    iconName: 'disc',
    section: NavSection.Main,
    group: 'USB',
  },
  {
    id: 'reset-usb',
    label: 'sidebar.resetUsb',
    iconSet: 'Feather',
    iconName: 'refresh-cw',
    section: NavSection.Main,
    group: 'USB',
  },
  // ─── SECURITY ──────────
  {
    id: 'passwords',
    label: 'sidebar.passwords',
    iconSet: 'Octicons',
    iconName: 'shield-check',
    section: NavSection.Main,
    group: 'SECURITY',
  },
  {
    id: 'keys',
    label: 'sidebar.keys',
    iconSet: 'Feather',
    iconName: 'key',
    section: NavSection.Main,
    group: 'SECURITY',
  },
  {
    id: 'defense',
    label: 'sidebar.defenseInDepth',
    iconSet: 'Feather',
    iconName: 'layers',
    section: NavSection.Main,
    group: 'SECURITY',
  },
  {
    id: 'brute-force',
    label: 'sidebar.bruteForce',
    iconSet: 'Feather',
    iconName: 'shield',
    section: NavSection.Main,
    group: 'SECURITY',
  },
  {
    id: 'app-lock',
    label: 'sidebar.appLock',
    iconSet: 'Feather',
    iconName: 'lock',
    section: NavSection.Main,
    group: 'SECURITY',
  },
  {
    id: 'zero-trace',
    label: 'sidebar.zeroTrace',
    iconSet: 'Feather',
    iconName: 'eye-off',
    section: NavSection.Main,
    group: 'SECURITY',
  },
  // ─── COMMUNICATION ─────
  {
    id: 'messages',
    label: 'sidebar.messages',
    iconSet: 'Feather',
    iconName: 'message-circle',
    section: NavSection.Main,
    group: 'COMMUNICATION',
  },
  {
    id: 'secure-share',
    label: 'sidebar.secureShare',
    iconSet: 'Feather',
    iconName: 'share-2',
    section: NavSection.Main,
    group: 'COMMUNICATION',
  },
  // ─── BOTTOM ────────────
  {
    id: 'activity',
    label: 'sidebar.activity',
    iconSet: 'Feather',
    iconName: 'clock',
    section: NavSection.Bottom,
  },
  {
    id: 'lock-vault',
    label: 'sidebar.lockVault',
    iconSet: 'Feather',
    iconName: 'lock',
    section: NavSection.Bottom,
  },
  {
    id: 'tools',
    label: 'sidebar.tools',
    iconSet: 'Feather',
    iconName: 'tool',
    section: NavSection.Bottom,
  },
  {
    id: 'classroom',
    label: 'sidebar.classroom',
    iconSet: 'Feather',
    iconName: 'book-open',
    section: NavSection.Bottom,
  },
  {
    id: 'help',
    label: 'sidebar.help',
    iconSet: 'Feather',
    iconName: 'help-circle',
    section: NavSection.Bottom,
  },
  {
    id: 'settings',
    label: 'sidebar.settings',
    iconSet: 'Feather',
    iconName: 'settings',
    section: NavSection.Bottom,
  },
  {
    id: 'exit',
    label: 'sidebar.exit',
    iconSet: 'Feather',
    iconName: 'log-out',
    section: NavSection.Bottom,
  },
];

// ─── Dashboard hero quick-action buttons ────────────────────────────

export const heroActions: HeroAction[] = [
  { id: 'encrypt', label: 'hero.encrypt', iconSet: 'Feather', iconName: 'link' },
  { id: 'decrypt', label: 'hero.decrypt', iconSet: 'Feather', iconName: 'rotate-ccw' },
  { id: 'share', label: 'hero.shareSecurely', iconSet: 'Feather', iconName: 'share-2' },
];

// ─── Vault file context-menu actions ────────────────────────────────

export const vaultContextActions: VaultContextAction[] = [
  { id: 'open', label: 'vaultContext.open', iconSet: 'Feather', iconName: 'folder' },
  { id: 'decrypt', label: 'vaultContext.decrypt', iconSet: 'Feather', iconName: 'unlock' },
  { id: 'share', label: 'vaultContext.shareSecurely', iconSet: 'Feather', iconName: 'share-2' },
  { id: 'show-folder', label: 'vaultContext.showInFolder', iconSet: 'Feather', iconName: 'inbox' },
  { id: 'rename', label: 'vaultContext.rename', iconSet: 'Feather', iconName: 'edit-2' },
  {
    id: 'remove',
    label: 'vaultContext.removeFromRecent',
    iconSet: 'Feather',
    iconName: 'x-square',
  },
];
