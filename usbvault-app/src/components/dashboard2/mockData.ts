import {
  DashboardNavItem,
  NavSection,
  HeroAction,
  SecureShareEntry,
  SecurityChecklistItem,
  SecurityRadarMetric,
  TopBarProfile,
  VaultContextAction,
  VaultItem,
} from './types';

export const navItems: DashboardNavItem[] = [
  // ─── DASHBOARD (top-level, no group) ───
  { id: 'dashboard', label: 'Dashboard', iconSet: 'MaterialCommunityIcons', iconName: 'view-dashboard-outline', active: true, section: NavSection.Top },
  // ─── FILES ─────────────
  { id: 'add-file', label: 'Add File', iconSet: 'Feather', iconName: 'plus-circle', section: NavSection.Main, group: 'FILES' },
  { id: 'encrypt', label: 'Encrypt', iconSet: 'Feather', iconName: 'file-plus', section: NavSection.Main, group: 'FILES' },
  { id: 'decrypt', label: 'Decrypt', iconSet: 'Feather', iconName: 'unlock', section: NavSection.Main, group: 'FILES' },
  { id: 'export-file', label: 'Export File', iconSet: 'Feather', iconName: 'download', section: NavSection.Main, group: 'FILES' },
  { id: 'remove-file', label: 'Remove File', iconSet: 'Feather', iconName: 'trash-2', section: NavSection.Main, group: 'FILES' },
  // ─── VAULT ─────────────
  { id: 'vault', label: 'Vault', iconSet: 'Feather', iconName: 'folder', section: NavSection.Main, group: 'VAULT' },
  { id: 'health-check', label: 'Health Check', iconSet: 'Feather', iconName: 'activity', section: NavSection.Main, group: 'VAULT' },
  { id: 'storage', label: 'Storage', iconSet: 'Feather', iconName: 'hard-drive', section: NavSection.Main, group: 'VAULT' },
  { id: 'backup', label: 'Backup', iconSet: 'Feather', iconName: 'save', section: NavSection.Main, group: 'VAULT' },
  { id: 'restore', label: 'Restore', iconSet: 'Feather', iconName: 'rotate-ccw', section: NavSection.Main, group: 'VAULT' },
  { id: 'manage-vaults', label: 'Manage Vaults', iconSet: 'Feather', iconName: 'database', section: NavSection.Main, group: 'VAULT' },
  { id: 'find-vault', label: 'Find Vault', iconSet: 'Feather', iconName: 'search', section: NavSection.Main, group: 'VAULT' },
  // ─── USB ─────────────
  { id: 'setup-usb', label: 'Setup USB', iconSet: 'Feather', iconName: 'disc', section: NavSection.Main, group: 'USB' },
  { id: 'reset-usb', label: 'Reset USB', iconSet: 'Feather', iconName: 'refresh-cw', section: NavSection.Main, group: 'USB' },
  // ─── SECURITY ──────────
  { id: 'passwords', label: 'Passwords', iconSet: 'Octicons', iconName: 'shield-check', section: NavSection.Main, group: 'SECURITY' },
  { id: 'keys', label: 'Keys', iconSet: 'Feather', iconName: 'key', section: NavSection.Main, group: 'SECURITY' },
  { id: 'defense', label: 'Defense-in-Depth', iconSet: 'Feather', iconName: 'layers', section: NavSection.Main, group: 'SECURITY' },
  { id: 'brute-force', label: 'Brute-Force', iconSet: 'Feather', iconName: 'shield', section: NavSection.Main, group: 'SECURITY' },
  { id: 'app-lock', label: 'App Lock', iconSet: 'Feather', iconName: 'lock', section: NavSection.Main, group: 'SECURITY' },
  { id: 'zero-trace', label: 'Zero-Trace', iconSet: 'Feather', iconName: 'eye-off', section: NavSection.Main, group: 'SECURITY' },
  // ─── COMMUNICATION ─────
  { id: 'messages', label: 'Messages', iconSet: 'Feather', iconName: 'message-circle', section: NavSection.Main, group: 'COMMUNICATION' },
  { id: 'secure-share', label: 'Secure Share', iconSet: 'Feather', iconName: 'share-2', section: NavSection.Main, group: 'COMMUNICATION' },
  // ─── BOTTOM ────────────
  { id: 'activity', label: 'Activity', iconSet: 'Feather', iconName: 'clock', section: NavSection.Bottom },
  { id: 'lock-vault', label: 'Lock Vault', iconSet: 'Feather', iconName: 'lock', section: NavSection.Bottom },
  { id: 'tools', label: 'Tools', iconSet: 'Feather', iconName: 'tool', section: NavSection.Bottom },
  { id: 'classroom', label: 'Classroom', iconSet: 'Feather', iconName: 'book-open', section: NavSection.Bottom },
  { id: 'help', label: 'Help', iconSet: 'Feather', iconName: 'help-circle', section: NavSection.Bottom },
  { id: 'settings', label: 'Settings', iconSet: 'Feather', iconName: 'settings', section: NavSection.Bottom },
  { id: 'exit', label: 'Exit', iconSet: 'Feather', iconName: 'log-out', section: NavSection.Bottom },
];

export const heroActions: HeroAction[] = [
  {
    id: 'encrypt',
    label: 'Encrypt',
    iconSet: 'Feather',
    iconName: 'link',
  },
  {
    id: 'decrypt',
    label: 'Decrypt',
    iconSet: 'Feather',
    iconName: 'rotate-ccw',
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
  {
    id: 'file-6',
    name: 'Compliance_Audit_Notes.docx',
    subtype: 'Document',
    sizeLabel: '920 KB',
    securityLabel: 'PQC',
    modifiedLabel: 'Yesterday',
    iconSet: 'Feather',
    iconName: 'file-text',
    iconTint: '#E9D5FF',
    iconBg: '#7E22CE',
  },
  {
    id: 'file-7',
    name: 'Incident_Response_Playbook.pdf',
    subtype: 'PDF Document',
    sizeLabel: '2.1 MB',
    securityLabel: 'PQC',
    modifiedLabel: '2 days ago',
    iconSet: 'Feather',
    iconName: 'file-text',
    iconTint: '#FDE68A',
    iconBg: '#C2410C',
  },
  {
    id: 'file-8',
    name: 'Customer_Onboarding_Package.zip',
    subtype: 'Archive',
    sizeLabel: '508 MB',
    securityLabel: 'PQC',
    modifiedLabel: '2 days ago',
    iconSet: 'Feather',
    iconName: 'archive',
    iconTint: '#BFDBFE',
    iconBg: '#1D4ED8',
  },
];

export const openVaultRowId = '';

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

export const passwordEntries = [
  { id: 'pw1', service: 'AWS Console', username: 'admin@usbvault.io', lastModified: '2 hours ago', strength: 'Strong' },
  { id: 'pw2', service: 'GitHub Enterprise', username: 'john.doe@usbvault.io', lastModified: '1 day ago', strength: 'Strong' },
  { id: 'pw3', service: 'Slack Workspace', username: 'jdoe', lastModified: '3 days ago', strength: 'Medium' },
  { id: 'pw4', service: 'Jira Cloud', username: 'john.doe@usbvault.io', lastModified: '1 week ago', strength: 'Strong' },
  { id: 'pw5', service: 'Confluence', username: 'john.doe', lastModified: '2 weeks ago', strength: 'Weak' },
  { id: 'pw6', service: 'Azure DevOps', username: 'jdoe@usbvault.onmicrosoft.com', lastModified: '1 month ago', strength: 'Strong' },
];

export const messageThreads = [
  { id: 'msg1', sender: 'Alice Chen', preview: 'Encrypted file package ready for review', time: '10:32 AM', unread: 2, avatar: 'AC' },
  { id: 'msg2', sender: 'Security Team', preview: 'Monthly compliance report attached', time: 'Yesterday', unread: 0, avatar: 'ST' },
  { id: 'msg3', sender: 'Bob Martinez', preview: 'Re: Vault access request approved', time: 'Mar 5', unread: 1, avatar: 'BM' },
  { id: 'msg4', sender: 'Emma Watson', preview: 'Shared project keys updated', time: 'Mar 3', unread: 0, avatar: 'EW' },
];

export const activityLogEntries = [
  { id: 'act1', action: 'encrypt', file: 'Financial_Records_2024.pdf', user: 'John Doe', time: '2 min ago', status: 'success' },
  { id: 'act2', action: 'share', file: 'Design_Assets.zip', user: 'John Doe', time: '11 min ago', status: 'success' },
  { id: 'act3', action: 'decrypt', file: 'Client_Presentations', user: 'John Doe', time: '35 min ago', status: 'success' },
  { id: 'act4', action: 'login', file: '', user: 'John Doe', time: '1 hour ago', status: 'success' },
  { id: 'act5', action: 'encrypt', file: 'Passwords.kdbx', user: 'John Doe', time: '2 hours ago', status: 'success' },
  { id: 'act6', action: 'share', file: 'Research_Data.xlsx', user: 'Emma Watson', time: '3 hours ago', status: 'success' },
  { id: 'act7', action: 'decrypt', file: 'Compliance_Audit_Notes.docx', user: 'John Doe', time: '5 hours ago', status: 'success' },
  { id: 'act8', action: 'failed_login', file: '', user: 'Unknown', time: '6 hours ago', status: 'warning' },
  { id: 'act9', action: 'encrypt', file: 'Incident_Response_Playbook.pdf', user: 'John Doe', time: 'Yesterday', status: 'success' },
  { id: 'act10', action: 'share', file: 'Q4_Budget_Forecast.xlsx', user: 'Bob Martinez', time: 'Yesterday', status: 'success' },
  { id: 'act11', action: 'key_rotation', file: '', user: 'System', time: '2 days ago', status: 'info' },
  { id: 'act12', action: 'decrypt', file: 'API_Keys_Backup.enc', user: 'John Doe', time: '2 days ago', status: 'success' },
  { id: 'act13', action: 'vault_backup', file: 'Personal Vault', user: 'System', time: '3 days ago', status: 'success' },
  { id: 'act14', action: 'encrypt', file: 'Employee_Records.csv', user: 'Alice Chen', time: '4 days ago', status: 'success' },
  { id: 'act15', action: 'policy_update', file: '', user: 'Admin', time: '1 week ago', status: 'info' },
];
