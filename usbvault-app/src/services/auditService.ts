/**
 * QAV Audit Logging Service
 *
 * Persists all security-relevant actions to localStorage for compliance and
 * activity tracking. Capped at 500 entries (FIFO). Supports filtering by
 * action type, date range, and resource.
 *
 * PL-035 SCALE NOTE: Audit log append does a full read→parse→append→serialize→write
 * cycle (O(n), n=MAX_ENTRIES) on every log() call. ~5-10ms per call at 500 entries.
 * Acceptable at current cap but won't scale past ~5000 entries. For higher volume,
 * consider: (1) IndexedDB append-only store, (2) batched writes with in-memory queue,
 * or (3) a ring-buffer approach that avoids re-serializing the full array.
 *
 * @module services/auditService
 */

import { Platform } from 'react-native';
import { generateId } from '@/utils/generateId';
import { readLocal, writeLocal, removeLocal } from '@/utils/storageHelpers';

// ── Types ──────────────────────────────────────────────────────

/**
 * Core audit actions known at compile time.
 * New services can register additional actions at runtime via
 * `auditService.registerAction()` — no need to modify this file.
 */
export type CoreAuditAction =
  | 'encrypt'
  | 'decrypt'
  | 'share'
  | 'share_accept'
  | 'share_reject'
  | 'share_revoke'
  | 'login'
  | 'logout'
  | 'failed_login'
  | 'vault_create'
  | 'vault_delete'
  | 'password_change'
  | 'settings_change'
  | 'fido2_register'
  | 'fido2_revoke'
  | 'message_send'
  | 'message_delete'
  | 'vault_lock'
  | 'key_rotation'
  | 'vault_backup'
  | 'vault_restore'
  | 'recovery_phrase_generate'
  | 'recovery_phrase_verify'
  | 'recovery_phrase_used'
  | 'policy_update'
  | 'system';

/**
 * Open audit action type — accepts all core actions plus any string
 * registered at runtime via `auditService.registerAction()`.
 * This prevents TS2345 errors when new services introduce new actions.
 */
export type AuditAction = CoreAuditAction | (string & {});

export type AuditStatus = 'success' | 'warning' | 'error';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  userId: string;
  action: AuditAction;
  resource: string; // vault_id, file_id, email, etc.
  status: AuditStatus;
  metadata: Record<string, unknown>;
  userAgent?: string;
}

export interface AuditFilterOptions {
  action?: AuditAction;
  status?: AuditStatus;
  startDate?: string; // ISO 8601
  endDate?: string;
  limit?: number;
  offset?: number;
}

// ── Constants ──────────────────────────────────────────────────

const STORAGE_KEY = 'qav:audit_log';
const MAX_ENTRIES = 500;

// ── Helpers ────────────────────────────────────────────────────

// PL-032: generateId moved to @/utils/generateId
// PL-031: readLog/writeLog now use storageHelpers

const readLog = () => readLocal<AuditLogEntry[]>(STORAGE_KEY, []);

function writeLog(entries: AuditLogEntry[]): void {
  // Keep only the most recent MAX_ENTRIES
  writeLocal(STORAGE_KEY, entries.slice(-MAX_ENTRIES));
}

// ── Action metadata helpers ────────────────────────────────────
//
// Labels are stored in a Map so new services can register their own
// action labels via `auditService.registerAction()` without modifying
// this file. Core labels are seeded below; everything else falls back
// to a title-cased version of the action key.

const ACTION_LABELS = new Map<string, string>([
  ['encrypt', 'File Encrypted'],
  ['decrypt', 'File Decrypted'],
  ['share', 'File Shared'],
  ['share_accept', 'Share Accepted'],
  ['share_reject', 'Share Rejected'],
  ['share_revoke', 'Share Revoked'],
  ['login', 'User Login'],
  ['logout', 'User Logout'],
  ['failed_login', 'Failed Login Attempt'],
  ['vault_create', 'Vault Created'],
  ['vault_delete', 'Vault Deleted'],
  ['password_change', 'Password Changed'],
  ['settings_change', 'Settings Updated'],
  ['fido2_register', 'Security Key Registered'],
  ['fido2_revoke', 'Security Key Revoked'],
  ['message_send', 'Encrypted Message Sent'],
  ['message_delete', 'Message Deleted'],
  ['vault_lock', 'Vault Locked'],
  ['key_rotation', 'Key Rotation'],
  ['vault_backup', 'Vault Backup'],
  ['vault_restore', 'Vault Restored'],
  ['recovery_phrase_generate', 'Recovery Phrase Generated'],
  ['recovery_phrase_verify', 'Recovery Phrase Verified'],
  ['recovery_phrase_used', 'Recovery Phrase Used'],
  ['policy_update', 'Policy Update'],
  ['system', 'System Event'],
]);

/** Humanise an action key: 'vault_lock' → 'Vault Lock' */
function fallbackLabel(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function getActionLabel(action: AuditAction): string {
  return ACTION_LABELS.get(action) ?? fallbackLabel(action);
}

const ACTION_ICONS = new Map<string, string>([
  ['encrypt', 'lock'],
  ['decrypt', 'unlock'],
  ['share', 'share-2'], ['share_accept', 'share-2'], ['share_reject', 'share-2'], ['share_revoke', 'share-2'],
  ['login', 'log-in'], ['logout', 'log-in'],
  ['failed_login', 'alert-triangle'],
  ['vault_create', 'hard-drive'], ['vault_delete', 'hard-drive'],
  ['password_change', 'key'],
  ['settings_change', 'settings'],
  ['fido2_register', 'shield'], ['fido2_revoke', 'shield'],
  ['message_send', 'message-square'], ['message_delete', 'message-square'],
  ['vault_lock', 'lock'],
  ['key_rotation', 'refresh-cw'],
  ['vault_backup', 'download-cloud'], ['vault_restore', 'upload-cloud'],
  ['recovery_phrase_generate', 'key'], ['recovery_phrase_verify', 'check-circle'], ['recovery_phrase_used', 'unlock'],
  ['policy_update', 'file-text'],
  ['system', 'cpu'],
]);

const ACTION_COLORS = new Map<string, string>([
  ['encrypt', '#8B5CF6'], ['decrypt', '#8B5CF6'],
  ['share', '#22D3EE'], ['share_accept', '#22D3EE'],
  ['share_reject', '#F59E0B'], ['share_revoke', '#F59E0B'],
  ['login', '#10B981'], ['logout', '#10B981'],
  ['failed_login', '#EF4444'],
  ['vault_create', '#22D3EE'], ['vault_delete', '#EF4444'],
  ['password_change', '#F59E0B'], ['key_rotation', '#F59E0B'],
  ['fido2_register', '#10B981'], ['fido2_revoke', '#EF4444'],
  ['message_send', '#8B5CF6'], ['message_delete', '#EF4444'],
  ['vault_lock', '#F59E0B'],
  ['vault_backup', '#22D3EE'], ['vault_restore', '#22D3EE'],
  ['recovery_phrase_generate', '#10B981'], ['recovery_phrase_verify', '#10B981'], ['recovery_phrase_used', '#F59E0B'],
  ['policy_update', '#6B7280'],
  ['system', '#6B7280'],
]);

export function getActionIcon(action: AuditAction): string {
  return ACTION_ICONS.get(action) ?? 'activity';
}

export function getActionColor(action: AuditAction): string {
  return ACTION_COLORS.get(action) ?? '#6B7280';
}

// ── Service ────────────────────────────────────────────────────

class AuditServiceImpl {
  /**
   * Register a custom audit action so it gets a human-readable label
   * in the activity log. Call this from your service's module scope
   * (runs once at import time) so it's always available.
   *
   * @example
   *   // In forensicsService.ts (top-level):
   *   auditService.registerAction('forensic_cleanup', 'Forensic Cleanup');
   */
  registerAction(action: string, label: string, icon?: string, color?: string): void {
    ACTION_LABELS.set(action, label);
    if (icon) ACTION_ICONS.set(action, icon);
    if (color) ACTION_COLORS.set(action, color);
  }

  /**
   * Log an audit event.
   */
  async log(
    action: AuditAction,
    resource: string,
    metadata: Record<string, unknown> = {},
    status: AuditStatus = 'success',
  ): Promise<void> {
    if (Platform.OS !== 'web') return;

    const entry: AuditLogEntry = {
      id: generateId('audit'),
      timestamp: new Date().toISOString(),
      userId: this._getUserId(),
      action,
      resource,
      status,
      metadata,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };

    const entries = readLog();
    entries.push(entry);
    writeLog(entries);
  }

  /**
   * Get audit log entries with optional filters.
   */
  async getEntries(filters?: AuditFilterOptions): Promise<AuditLogEntry[]> {
    let entries = readLog();

    if (filters?.action) {
      entries = entries.filter((e) => e.action === filters.action);
    }
    if (filters?.status) {
      entries = entries.filter((e) => e.status === filters.status);
    }
    if (filters?.startDate) {
      entries = entries.filter((e) => e.timestamp >= filters.startDate!);
    }
    if (filters?.endDate) {
      entries = entries.filter((e) => e.timestamp <= filters.endDate!);
    }

    // Most recent first
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const offset = filters?.offset || 0;
    const limit = filters?.limit || 100;
    return entries.slice(offset, offset + limit);
  }

  /**
   * Export all logs as a downloadable JSON file.
   */
  async exportLogs(): Promise<void> {
    if (Platform.OS !== 'web') return;

    const entries = readLog();
    const json = JSON.stringify(entries, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `qav-audit-log-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  /**
   * Clear all audit logs.
   */
  async clear(): Promise<void> {
    removeLocal(STORAGE_KEY);
  }

  /**
   * Get total entry count.
   */
  getCount(): number {
    return readLog().length;
  }

  // ── Private helpers ──

  private _getUserId(): string {
    // Try to get from sessionStorage (set during login)
    if (Platform.OS === 'web') {
      try {
        return sessionStorage.getItem('qav:userId') || 'anonymous';
      } catch {
        return 'anonymous';
      }
    }
    return 'anonymous';
  }
}

export const auditService = new AuditServiceImpl();
