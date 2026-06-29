/**
 * MONO-1: Messaging domain types
 * Extracted from messaging.ts — all exported types/interfaces
 *
 * @module services/messaging/types
 */

// ── Direct Message Types ───────────────────────────────────────

export type GhostTimer = 5 | 30 | 60 | 300 | 3600 | 86400;

export interface EncryptedMessage {
  id: string;
  conversationId: string;
  senderEmail: string;
  recipientEmail: string;
  encryptedContentHex: string;
  createdAt: string;
  readAt?: string;
  isGhost?: boolean;
  ghostTimerSec?: GhostTimer;
  expiresAt?: string;
  ghostTimerStarted?: boolean;
}

export interface Conversation {
  id: string;
  participantEmail: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  ghostMode?: boolean;
  ghostTimerSec?: GhostTimer;
}

// ── Group Message Types ────────────────────────────────────────

export interface GroupConversation {
  id: string;
  name: string;
  creatorEmail: string;
  members: GroupMember[];
  createdAt: string;
  lastMessageAt?: string;
  lastMessagePreview: string;
  unreadCount: number;
  groupKeyHex: string;
  keyVersion: number;
  ghostMode?: boolean;
  ghostTimerSec?: number;
}

export interface GroupMember {
  email: string;
  displayName: string;
  publicKeyHex: string;
  joinedAt: string;
  role: 'admin' | 'member';
  encryptedGroupKeyHex: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  senderEmail: string;
  senderDisplayName: string;
  encryptedContentHex: string;
  createdAt: string;
  readBy: string[];
  isGhost?: boolean;
  ghostTimerSec?: number;
  expiresAt?: string;
  ghostTimerStarted?: boolean;
  keyVersion: number;
}

export interface GroupKeyRotationHistory {
  groupId: string;
  version: number;
  keyHex: string;
  createdAt: string;
  createdBy: string;
}

// ── Email Alert Types ──────────────────────────────────────────

export type AlertType =
  'brute_force' | 'self_destruct' | 'emergency_access' | 'device_change' | 'key_rotation';

export interface EmailAlertConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPasswordSet: boolean;
  useTLS: boolean;
  fromAddress: string;
  alertRecipients: string[];
  enabled: boolean;
}

export interface AlertRecord {
  id: string;
  type: AlertType;
  timestamp: string;
  details: Record<string, unknown>;
  status: 'sent' | 'failed' | 'pending';
  attempts: number;
  lastAttemptAt?: string;
  nextRetryAt?: string;
}
