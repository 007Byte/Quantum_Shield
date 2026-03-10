import {
  DashboardNavItem,
  HeroAction,
  SecureShareEntry,
  SecurityChecklistItem,
  SecurityRadarMetric,
  TopBarProfile,
  VaultContextAction,
  VaultItem,
} from './types';

export const navItems: DashboardNavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    iconSet: 'MaterialCommunityIcons',
    iconName: 'view-dashboard-outline',
    active: true,
    section: 'main',
  },
  {
    id: 'encrypt',
    label: 'Encrypt',
    iconSet: 'Feather',
    iconName: 'file-plus',
    section: 'main',
  },
  {
    id: 'decrypt',
    label: 'Decrypt',
    iconSet: 'Feather',
    iconName: 'unlock',
    section: 'main',
  },
  {
    id: 'secure-share',
    label: 'Secure Share',
    iconSet: 'Feather',
    iconName: 'share-2',
    section: 'main',
  },
  {
    id: 'vault',
    label: 'Vault',
    iconSet: 'Feather',
    iconName: 'folder',
    section: 'main',
  },
  {
    id: 'passwords',
    label: 'Passwords',
    iconSet: 'Octicons',
    iconName: 'shield-check',
    section: 'main',
  },
  {
    id: 'messages',
    label: 'Messages',
    iconSet: 'Feather',
    iconName: 'message-circle',
    section: 'main',
  },
  {
    id: 'activity',
    label: 'Activity',
    iconSet: 'Feather',
    iconName: 'clock',
    section: 'main',
  },
  {
    id: 'settings',
    label: 'Settings',
    iconSet: 'Feather',
    iconName: 'settings',
    section: 'bottom',
  },
];

export const heroActions: HeroAction[] = [
  {
    id: 'encrypt',
    label: 'Encrypt',
    iconSet: 'Feather',
    iconName: 'feather',
  },
  {
    id: 'decrypt',
    label: 'Decrypt',
    iconSet: 'Feather',
    iconName: 'droplet',
  },
  {
    id: 'share',
    label: 'Share Securely',
    iconSet: 'Feather',
    iconName: 'share-2',
  },
];

export const vaultItems: VaultItem[] = [
  {
    id: 'file-1',
    name: 'Financial_Records_2024.pdf',
    subtype: 'PDF Document',
    sizeLabel: '1.2 MB',
    securityLabel: 'PQC',
    modifiedLabel: '2 min ago',
    iconSet: 'Feather',
    iconName: 'file-text',
    iconTint: '#FFFFFF',
    iconBg: '#E11D48',
  },
  {
    id: 'file-2',
    name: 'Design_Assets.zip',
    subtype: 'Archive',
    sizeLabel: '842 MB',
    securityLabel: 'PQC',
    modifiedLabel: '11 min ago',
    iconSet: 'Feather',
    iconName: 'archive',
    iconTint: '#F8E16C',
    iconBg: '#7C3AED',
    selected: true,
  },
  {
    id: 'file-3',
    name: 'Client_Presentations',
    subtype: 'Secure Folder',
    securityLabel: 'PQC',
    modifiedLabel: '35 min ago',
    iconSet: 'Feather',
    iconName: 'folder',
    iconTint: '#7DD3FC',
    iconBg: '#2563EB',
  },
  {
    id: 'file-4',
    name: 'Passwords.kdbx',
    subtype: 'Password Database',
    securityLabel: 'PQC',
    modifiedLabel: '1 hour ago',
    iconSet: 'Feather',
    iconName: 'lock',
    iconTint: '#93C5FD',
    iconBg: '#1E40AF',
  },
  {
    id: 'file-5',
    name: 'Research_Data.xlsx',
    subtype: 'Spreadsheet',
    sizeLabel: '3.4 MB',
    securityLabel: 'PQC',
    modifiedLabel: 'Yesterday',
    iconSet: 'Feather',
    iconName: 'grid',
    iconTint: '#6EE7B7',
    iconBg: '#0F766E',
  },
];

export const openVaultRowId = 'file-2';

export const vaultContextActions: VaultContextAction[] = [
  { id: 'open', label: 'Open', iconSet: 'Feather', iconName: 'folder' },
  { id: 'decrypt', label: 'Decrypt', iconSet: 'Feather', iconName: 'unlock' },
  {
    id: 'share',
    label: 'Share Securely',
    iconSet: 'Feather',
    iconName: 'share-2',
  },
  {
    id: 'show-folder',
    label: 'Show in Folder',
    iconSet: 'Feather',
    iconName: 'inbox',
  },
  { id: 'rename', label: 'Rename', iconSet: 'Feather', iconName: 'edit-2' },
  {
    id: 'remove',
    label: 'Remove from Recent List',
    iconSet: 'Feather',
    iconName: 'x-square',
  },
];

export const securityRadarMetrics: SecurityRadarMetric[] = [
  { id: 'files', label: 'Files', value: 0.95 },
  { id: 'passwords', label: 'Passwords', value: 0.86 },
  { id: 'backups', label: 'Backups', value: 0.9 },
  { id: 'sessions', label: 'Sessions', value: 0.78 },
  { id: 'sharing', label: 'Sharing', value: 0.88 },
  { id: 'privacy', label: 'Privacy', value: 0.84 },
];

export const securityChecklist: SecurityChecklistItem[] = [
  { id: 'post-quantum', label: 'Post-Quantum', complete: true },
  { id: 'policies', label: 'PQC Policies', complete: true },
  { id: 'audit', label: 'Zero-Trust Audit', complete: true },
  { id: 'backup', label: 'Vault Backup', complete: true },
];

export const secureShareEntries: SecureShareEntry[] = [
  {
    id: 'emma',
    name: 'Emma Watson',
    subtitle: 'Shared 4 files • Active',
    avatarLabel: 'EW',
    avatarColor: '#C084FC',
  },
  {
    id: 'team-project',
    name: 'Team Project',
    subtitle: '3 members • 2 pending',
    avatarLabel: 'TP',
    avatarColor: '#22D3EE',
    accent: '#FBBF24',
  },
  {
    id: 'richard',
    name: 'Richard Mohan',
    subtitle: 'Shared yesterday',
    avatarLabel: 'RM',
    avatarColor: '#60A5FA',
  },
];

export const topBarProfile: TopBarProfile = {
  name: 'John Doe',
  initials: 'JD',
};
