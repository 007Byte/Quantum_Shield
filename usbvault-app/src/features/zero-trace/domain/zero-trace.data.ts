/**
 * Zero-Trace Feature — Static Configuration Data
 * @module features/zero-trace/domain/zero-trace.data
 */

import { Platform } from 'react-native';

// ── Color Constants ────────────────────────────────────────────────────
// Zero-Trace UI palette — static constants for the dark glass theme

export const ztColors = {
  textPrimary: '#F5F3FF',
  textSecondary: '#B8B3D1',
  cyan: '#22D3EE',
  purple: '#8B5CF6',
  green: '#10B981',
  danger: '#EF4444',
  warning: '#EAB308',
  gray: '#8893A7',
} as const;

// ── Category ID to Human-Readable Name ────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  clipboard: 'Clipboard',
  session_data: 'Session Data',
  app_cache: 'App Cache',
  temp_files: 'Temporary Files',
  browser_traces: 'Browser Traces',
  os_journals: 'OS Journals',
  swap_pagefile: 'Swap / Pagefile',
  ram_buffers: 'RAM Buffers',
};

export function humanizeCategory(id: string): string {
  return CATEGORY_LABELS[id] || id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── OS Cleaner Definitions ────────────────────────────────────────────

export const OS_CLEANERS: Record<string, { label: string; icon: string }[]> = {
  macos: [
    { label: '.DS_Store files', icon: 'file' },
    { label: 'QuickLook Cache', icon: 'image' },
    { label: 'Recent Documents', icon: 'clock' },
    { label: 'Spotlight Index', icon: 'search' },
    { label: 'USB Metadata', icon: 'hard-drive' },
    { label: 'Session Files', icon: 'folder' },
  ],
  windows: [
    { label: 'Recent Items', icon: 'clock' },
    { label: 'Jump Lists', icon: 'list' },
    { label: 'Thumbnails', icon: 'image' },
    { label: 'Shellbags', icon: 'folder' },
    { label: 'Registry MRU', icon: 'database' },
    { label: 'Search Index', icon: 'search' },
    { label: 'Recycle Bin', icon: 'trash-2' },
    { label: 'USB Metadata', icon: 'hard-drive' },
    { label: 'Session Files', icon: 'folder' },
  ],
  linux: [
    { label: 'Recently Used', icon: 'clock' },
    { label: 'Zeitgeist', icon: 'activity' },
    { label: 'Thumbnails', icon: 'image' },
    { label: 'USB Trash', icon: 'trash-2' },
    { label: 'Temp Files', icon: 'file' },
    { label: 'GNOME Tracker', icon: 'search' },
  ],
};

export const ADMIN_CLEANERS: Record<string, string[]> = {
  macos: ['Spotlight re-index with sudo'],
  windows: ['Prefetch files', 'Event Logs'],
  linux: ['System journal cleanup'],
};

/** Map Platform.OS values to our cleaner keys */
export function getPlatformKey(): string {
  const os = Platform.OS as string;
  if (os === 'macos' || os === 'ios') return 'macos';
  if (os === 'windows') return 'windows';
  if (os === 'android' || os === 'linux') return 'linux';
  // For web, try navigator.platform heuristics
  if (os === 'web' && typeof navigator !== 'undefined') {
    const p = navigator.platform?.toLowerCase() ?? '';
    if (p.includes('mac')) return 'macos';
    if (p.includes('win')) return 'windows';
    if (p.includes('linux')) return 'linux';
  }
  return 'macos'; // fallback
}

// ── Severity / Status Helpers ─────────────────────────────────────────

import type { FeatherIconName } from './zero-trace.types';

export function getSeverityIcon(severity: string): FeatherIconName {
  switch (severity) {
    case 'critical':
      return 'alert-circle';
    case 'warning':
      return 'alert-triangle';
    default:
      return 'info';
  }
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return ztColors.danger;
    case 'warning':
      return ztColors.warning;
    default:
      return ztColors.textSecondary;
  }
}

export function getStatusIcon(status: string): FeatherIconName {
  switch (status) {
    case 'clean':
      return 'check-circle';
    case 'dirty':
      return 'alert-triangle';
    case 'requires_desktop':
      return 'lock';
    default:
      return 'help-circle';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'clean':
      return ztColors.green;
    case 'dirty':
      return ztColors.warning;
    case 'requires_desktop':
      return ztColors.gray;
    default:
      return ztColors.textSecondary;
  }
}
