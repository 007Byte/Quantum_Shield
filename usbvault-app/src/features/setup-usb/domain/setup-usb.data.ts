/**
 * Static configuration data for the setup-usb wizard.
 */
import type { AlgorithmOption, FileSystemOption, SetupState } from './setup-usb.types';

// ── Encryption algorithms ────────────────────────────────────────────────
// Algorithm badge colors — semantic, not theme-dependent
export const ALGORITHMS: AlgorithmOption[] = [
  {
    id: 'AES-256-GCM-SIV',
    name: 'AES-256-GCM-SIV',
    icon: 'shield',
    tag: 'Recommended',
    tagColor: '#10B981',
    description:
      'Military-grade 256-bit AES encryption with nonce misuse resilience. Best all-around choice.',
    specs: '256-bit key · 12-byte nonce · 16-byte AEAD tag · HMAC-SHA256 integrity',
  },
  {
    id: 'XChaCha20-Poly1305',
    name: 'XChaCha20-Poly1305',
    icon: 'zap',
    tag: 'Fast',
    tagColor: '#3B82F6',
    description:
      'Modern stream cipher with excellent performance. Great for large files and older hardware.',
    specs: '256-bit key · 24-byte nonce · 16-byte Poly1305 tag · HMAC-SHA256 integrity',
  },
  {
    id: 'ML-KEM-1024 Hybrid',
    name: 'ML-KEM-1024 Hybrid',
    icon: 'cpu',
    tag: 'Quantum-Safe',
    tagColor: '#8B5CF6',
    description:
      'Post-quantum hybrid encryption. Protects against future quantum computer attacks.',
    specs: 'ML-KEM-1024 + AES-256-GCM-SIV · Ed25519 signatures · HKDF-SHA384',
  },
];

// ── File system options ──────────────────────────────────────────────────
export const FILE_SYSTEMS: FileSystemOption[] = [
  {
    id: 'exfat',
    name: 'exFAT',
    description: 'Works on Mac, Windows, and Linux without extra software',
    platforms: 'Mac · Windows · Linux',
    category: 'universal',
    platformIcon: 'globe',
  },
  {
    id: 'apfs',
    name: 'APFS',
    description: 'Apple native file system with advanced features',
    platforms: 'Mac only',
    category: 'platform',
    platformIcon: 'monitor',
  },
  {
    id: 'ntfs',
    name: 'NTFS',
    description: 'Windows native file system. Read-only on Mac without extra software',
    platforms: 'Windows · Linux',
    category: 'platform',
    platformIcon: 'monitor',
  },
  {
    id: 'ext4',
    name: 'EXT4',
    description: 'Linux native file system. Not readable on Mac or Windows without extra software',
    platforms: 'Linux only',
    category: 'platform',
    platformIcon: 'terminal',
  },
];

// ── Format type options (used in FormatStep) ─────────────────────────────
export interface FormatTypeOption {
  value: 'quick' | 'full';
  labelKey: string;
  desc: string;
  icon: 'zap' | 'shield';
  time: string;
}

export const FORMAT_TYPES: FormatTypeOption[] = [
  {
    value: 'quick',
    labelKey: 'setupUsb.quickFormat',
    desc: 'Erases the file table only. Fast (seconds), but previously deleted files may be recoverable with forensic tools. Best for new or trusted drives.',
    icon: 'zap',
    time: '~10 seconds',
  },
  {
    value: 'full',
    labelKey: 'setupUsb.fullFormat',
    desc: 'Overwrites every sector on the drive with zeros. Slower, but ensures no previously stored data can ever be recovered. Recommended for used or shared drives.',
    icon: 'shield',
    time: 'Several minutes',
  },
];

// ── Initial wizard state ─────────────────────────────────────────────────
export const INITIAL_STATE: SetupState = {
  currentStep: 0,
  selectedDriveId: null,
  vaultName: '',
  partitionName: '',
  formatType: 'quick',
  fileSystem: 'exfat',
  algorithm: 'AES-256-GCM-SIV',
  password: '',
  passwordConfirm: '',
  showPassword: false,
  showPasswordConfirm: false,
};
