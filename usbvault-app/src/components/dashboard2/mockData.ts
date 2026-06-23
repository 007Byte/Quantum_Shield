// Mock data for development/testing only — stripped from production builds
import type {
  SecurityChecklistItem,
  SecurityRadarMetric,
  SecureShareEntry,
  TopBarProfile,
  VaultItem,
} from './types';

// ─── Vault file rows (demo) ─────────────────────────────────────────

const _vaultItems: VaultItem[] = [
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
export const vaultItems: VaultItem[] = __DEV__ ? _vaultItems : [];

export const openVaultRowId = '';

// ─── Security radar metrics (demo) ──────────────────────────────────

const _securityRadarMetrics: SecurityRadarMetric[] = [
  { id: 'files', label: 'rightRail.files', value: 0.95 },
  { id: 'passwords', label: 'rightRail.passwords', value: 0.86 },
  { id: 'backups', label: 'rightRail.backups', value: 0.9 },
  { id: 'sessions', label: 'rightRail.sessions', value: 0.78 },
  { id: 'sharing', label: 'rightRail.sharing', value: 0.88 },
  { id: 'privacy', label: 'rightRail.privacy', value: 0.84 },
];
export const securityRadarMetrics: SecurityRadarMetric[] = __DEV__ ? _securityRadarMetrics : [];

// ─── Security checklist (demo) ──────────────────────────────────────

const _securityChecklist: SecurityChecklistItem[] = [
  { id: 'post-quantum', label: 'rightRail.postQuantum', complete: true },
  { id: 'policies', label: 'rightRail.pqcPolicies', complete: true },
  { id: 'audit', label: 'rightRail.zeroTrustAudit', complete: true },
  { id: 'backup', label: 'rightRail.vaultBackup', complete: true },
];
export const securityChecklist: SecurityChecklistItem[] = __DEV__ ? _securityChecklist : [];

// ─── Secure share entries (demo) ────────────────────────────────────

const _secureShareEntries: SecureShareEntry[] = [
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
export const secureShareEntries: SecureShareEntry[] = __DEV__ ? _secureShareEntries : [];

// ─── Top bar profile (demo) ─────────────────────────────────────────

const _topBarProfile: TopBarProfile = {
  name: 'John Doe',
  initials: 'JD',
};
export const topBarProfile: TopBarProfile = __DEV__ ? _topBarProfile : { name: '', initials: '' };

// ─── Password entries (demo) ────────────────────────────────────────

const _passwordEntries = [
  {
    id: 'pw1',
    service: 'AWS Console',
    username: 'admin@usbvault.io',
    lastModified: '2 hours ago',
    strength: 'Strong',
  },
  {
    id: 'pw2',
    service: 'GitHub Enterprise',
    username: 'john.doe@usbvault.io',
    lastModified: '1 day ago',
    strength: 'Strong',
  },
  {
    id: 'pw3',
    service: 'Slack Workspace',
    username: 'jdoe',
    lastModified: '3 days ago',
    strength: 'Medium',
  },
  {
    id: 'pw4',
    service: 'Jira Cloud',
    username: 'john.doe@usbvault.io',
    lastModified: '1 week ago',
    strength: 'Strong',
  },
  {
    id: 'pw5',
    service: 'Confluence',
    username: 'john.doe',
    lastModified: '2 weeks ago',
    strength: 'Weak',
  },
  {
    id: 'pw6',
    service: 'Azure DevOps',
    username: 'jdoe@usbvault.onmicrosoft.com',
    lastModified: '1 month ago',
    strength: 'Strong',
  },
];
export const passwordEntries = __DEV__ ? _passwordEntries : [];

// ─── Message threads (demo) ─────────────────────────────────────────

const _messageThreads = [
  {
    id: 'msg1',
    sender: 'Alice Chen',
    preview: 'Encrypted file package ready for review',
    time: '10:32 AM',
    unread: 2,
    avatar: 'AC',
  },
  {
    id: 'msg2',
    sender: 'Security Team',
    preview: 'Monthly compliance report attached',
    time: 'Yesterday',
    unread: 0,
    avatar: 'ST',
  },
  {
    id: 'msg3',
    sender: 'Bob Martinez',
    preview: 'Re: Vault access request approved',
    time: 'Mar 5',
    unread: 1,
    avatar: 'BM',
  },
  {
    id: 'msg4',
    sender: 'Emma Watson',
    preview: 'Shared project keys updated',
    time: 'Mar 3',
    unread: 0,
    avatar: 'EW',
  },
];
export const messageThreads = __DEV__ ? _messageThreads : [];

// ─── Activity log entries (demo) ────────────────────────────────────

const _activityLogEntries = [
  {
    id: 'act1',
    action: 'encrypt',
    file: 'Financial_Records_2024.pdf',
    user: 'John Doe',
    time: '2 min ago',
    status: 'success',
  },
  {
    id: 'act2',
    action: 'share',
    file: 'Design_Assets.zip',
    user: 'John Doe',
    time: '11 min ago',
    status: 'success',
  },
  {
    id: 'act3',
    action: 'decrypt',
    file: 'Client_Presentations',
    user: 'John Doe',
    time: '35 min ago',
    status: 'success',
  },
  {
    id: 'act4',
    action: 'login',
    file: '',
    user: 'John Doe',
    time: '1 hour ago',
    status: 'success',
  },
  {
    id: 'act5',
    action: 'encrypt',
    file: 'Passwords.kdbx',
    user: 'John Doe',
    time: '2 hours ago',
    status: 'success',
  },
  {
    id: 'act6',
    action: 'share',
    file: 'Research_Data.xlsx',
    user: 'Emma Watson',
    time: '3 hours ago',
    status: 'success',
  },
  {
    id: 'act7',
    action: 'decrypt',
    file: 'Compliance_Audit_Notes.docx',
    user: 'John Doe',
    time: '5 hours ago',
    status: 'success',
  },
  {
    id: 'act8',
    action: 'failed_login',
    file: '',
    user: 'Unknown',
    time: '6 hours ago',
    status: 'warning',
  },
  {
    id: 'act9',
    action: 'encrypt',
    file: 'Incident_Response_Playbook.pdf',
    user: 'John Doe',
    time: 'Yesterday',
    status: 'success',
  },
  {
    id: 'act10',
    action: 'share',
    file: 'Q4_Budget_Forecast.xlsx',
    user: 'Bob Martinez',
    time: 'Yesterday',
    status: 'success',
  },
  {
    id: 'act11',
    action: 'key_rotation',
    file: '',
    user: 'System',
    time: '2 days ago',
    status: 'info',
  },
  {
    id: 'act12',
    action: 'decrypt',
    file: 'API_Keys_Backup.enc',
    user: 'John Doe',
    time: '2 days ago',
    status: 'success',
  },
  {
    id: 'act13',
    action: 'vault_backup',
    file: 'Personal Vault',
    user: 'System',
    time: '3 days ago',
    status: 'success',
  },
  {
    id: 'act14',
    action: 'encrypt',
    file: 'Employee_Records.csv',
    user: 'Alice Chen',
    time: '4 days ago',
    status: 'success',
  },
  {
    id: 'act15',
    action: 'policy_update',
    file: '',
    user: 'Admin',
    time: '1 week ago',
    status: 'info',
  },
];
export const activityLogEntries = __DEV__ ? _activityLogEntries : [];
