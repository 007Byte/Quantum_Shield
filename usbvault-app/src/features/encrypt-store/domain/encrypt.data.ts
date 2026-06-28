/**
 * Algorithm and security level configuration data.
 */

import type { AlgorithmOption, SecurityLevel } from './encrypt.types';

export function getAlgorithmOptions(t: (key: string) => string): AlgorithmOption[] {
  return [
    {
      id: 'AES-256-GCM-SIV',
      name: 'AES-256-GCM-SIV',
      icon: 'shield',
      tag: t('encrypt.recommended'),
      summary: t('encrypt.aes256Summary'),
      details: [
        { label: 'Cipher', value: '256-bit AES in GCM-SIV mode (12-byte nonce)' },
        { label: 'Auth', value: '16-byte AEAD tag per 64 KB chunk' },
        { label: 'Integrity', value: 'HMAC-SHA256 over full record' },
        { label: 'Key Wrap', value: 'HKDF-SHA256 per-file subkey derivation' },
      ],
    },
    {
      id: 'ChaCha20-Poly1305',
      name: 'XChaCha20-Poly1305',
      icon: 'zap',
      tag: t('encrypt.fast'),
      summary: t('encrypt.chacha20Summary'),
      details: [
        { label: 'Cipher', value: 'XChaCha20 stream cipher (24-byte nonce)' },
        { label: 'Auth', value: '16-byte Poly1305 tag per 64 KB chunk' },
        { label: 'Integrity', value: 'HMAC-SHA256 over full record' },
        { label: 'Key Wrap', value: 'HKDF-SHA256 per-file subkey derivation' },
      ],
    },
    {
      id: 'PQC Kyber',
      name: 'ML-KEM-1024 Hybrid',
      icon: 'cpu',
      tag: t('encrypt.quantumSafe'),
      summary: t('encrypt.pqcHybridSummary'),
      details: [
        { label: 'KEM', value: 'ML-KEM-1024 (FIPS 203) key encapsulation' },
        { label: 'Hybrid', value: 'Classical + PQC keys via HKDF-SHA384' },
        { label: 'Auth', value: 'AEAD tag per chunk + Ed25519 signature' },
        { label: 'Integrity', value: 'HMAC-SHA256 record + Ed25519 header sig' },
      ],
    },
  ];
}

export function getSecurityLevels(t: (key: string) => string): SecurityLevel[] {
  return [
    {
      id: 'Standard',
      icon: 'lock',
      speed: t('encrypt.fastest'),
      summary: t('encrypt.standardSummary'),
      details: [
        { label: 'KDF', value: 'Argon2id (64 MB memory, 3 iterations)' },
        { label: 'Encrypt', value: 'Per-chunk AEAD with 16-byte auth tag' },
        { label: 'HMAC', value: 'HMAC-SHA256 record integrity check' },
        { label: 'Keys', value: '32-byte enc key + 32-byte HMAC key' },
      ],
    },
    {
      id: 'High',
      icon: 'shield',
      speed: t('encrypt.balanced'),
      summary: t('encrypt.highSummary'),
      details: [
        { label: 'KDF', value: 'Argon2id (128 MB memory, 5 iterations)' },
        { label: 'Encrypt', value: 'Per-chunk AEAD + header re-authentication' },
        { label: 'HMAC', value: 'Dual HMAC: header + per-record verification' },
        { label: 'Keys', value: 'HKDF-SHA256 per-file subkeys from 64-byte MEK' },
      ],
    },
    {
      id: 'Maximum',
      icon: 'award',
      speed: t('encrypt.slowest'),
      summary: t('encrypt.maximumSummary'),
      details: [
        { label: 'KDF', value: 'Argon2id + ML-KEM-1024 hybrid via HKDF-SHA384' },
        { label: 'Encrypt', value: 'AEAD per-chunk + PQC key encapsulation layer' },
        { label: 'HMAC', value: 'HMAC-SHA256 + Ed25519 header signature' },
        { label: 'Keys', value: 'Classical + PQC keys — secure if either holds' },
      ],
    },
  ];
}

export const SUPPORTED_FORMATS = [
  'PDF',
  'DOCX',
  'XLSX',
  'PPTX',
  'ZIP',
  'RAR',
  'Images',
  'Videos',
  'Audio',
];

/**
 * Sanitize a user-provided filename:
 * - Strip path traversal sequences
 * - Remove null bytes and control characters
 * - Restrict to safe characters
 * - Enforce max length (255 chars)
 * - Preserve the original extension
 */
export function sanitizeFileName(raw: string): string {
  let name = raw.replace(/^.*[\\/]/, '');
  name = name.replace(/[\x00-\x1f\x7f]/g, '');
  name = name.replace(/\.\.\//g, '').replace(/\.\.\\/g, '');
  name = name.replace(/[^a-zA-Z0-9.\-_ ]/g, '');
  name = name.replace(/\.{2,}/g, '.').replace(/ {2,}/g, ' ');
  name = name.replace(/^[.\s]+|[.\s]+$/g, '');
  if (name.length > 255) {
    const lastDot = name.lastIndexOf('.');
    if (lastDot > 0) {
      const ext = name.slice(lastDot);
      name = name.slice(0, 255 - ext.length) + ext;
    } else {
      name = name.slice(0, 255);
    }
  }
  return name || 'unnamed-file';
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
