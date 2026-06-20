/**
 * Shared types for the setup-usb feature.
 */
import type { USBDrive } from '@/services/usbService';

// ── Step keys ────────────────────────────────────────────────────────────
export const STEP_KEYS = [
  'setupUsb.detectUsb',
  'setupUsb.formatOptions',
  'setupUsb.setMasterPassword',
  'setupUsb.initialize',
] as const;

export type StepKey = (typeof STEP_KEYS)[number];

// ── Filesystem IDs ───────────────────────────────────────────────────────
export type FileSystemId = 'exfat' | 'ntfs' | 'ext4' | 'apfs';

// ── Algorithm option ─────────────────────────────────────────────────────
export interface AlgorithmOption {
  id: string;
  name: string;
  icon: string;
  tag: string;
  tagColor: string;
  description: string;
  specs: string;
}

// ── File system option ───────────────────────────────────────────────────
export interface FileSystemOption {
  id: FileSystemId;
  name: string;
  description: string;
  platforms: string;
  category: 'universal' | 'platform';
  platformIcon: string;
}

// ── Wizard state ─────────────────────────────────────────────────────────
export interface SetupState {
  currentStep: number;
  selectedDriveId: string | null;
  vaultName: string;
  partitionName: string;
  formatType: 'quick' | 'full';
  fileSystem: FileSystemId;
  algorithm: string;
  password: string;
  passwordConfirm: string;
  showPassword: boolean;
  showPasswordConfirm: boolean;
}

// ── Password strength ────────────────────────────────────────────────────
export interface PasswordStrength {
  strength: number;
  label: string;
  color: string;
}

// ── Companion status ────────────────────────────────────────────────────
export type CompanionStatus = 'checking' | 'connected' | 'disconnected';

// ── Detect step props ────────────────────────────────────────────────────
export interface DetectStepProps {
  drives: USBDrive[];
  loadingDrives: boolean;
  driveError: string | null;
  selectedDriveId: string | null;
  companionStatus: CompanionStatus;
  companionVersionMismatch: boolean;
  companionVersion: string | null;
  onSelectDrive: (id: string) => void;
  onRefresh: () => void;
  t: (key: string) => string;
}

// ── Format step props ────────────────────────────────────────────────────
export interface FormatStepProps {
  vaultName: string;
  partitionName: string;
  formatType: 'quick' | 'full';
  fileSystem: FileSystemId;
  algorithm: string;
  showPlatformFS: boolean;
  onChangeVaultName: (text: string) => void;
  onChangePartitionName: (text: string) => void;
  onChangeFormatType: (value: 'quick' | 'full') => void;
  onChangeFileSystem: (value: FileSystemId) => void;
  onChangeAlgorithm: (value: string) => void;
  onTogglePlatformFS: () => void;
  t: (key: string) => string;
}

// ── Password step props ──────────────────────────────────────────────────
export interface PasswordStepProps {
  password: string;
  passwordConfirm: string;
  showPassword: boolean;
  showPasswordConfirm: boolean;
  passwordsMatch: boolean;
  strength: PasswordStrength;
  onChangePassword: (text: string) => void;
  onChangePasswordConfirm: (text: string) => void;
  onToggleShowPassword: () => void;
  onToggleShowPasswordConfirm: () => void;
  t: (key: string) => string;
}
