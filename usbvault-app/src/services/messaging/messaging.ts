/**
 * PH4-FIX: Messaging Domain — Consolidated Service
 *
 * Merges messageService.ts, groupMessageService.ts, and emailAlertService.ts
 * into a single domain-bounded module.
 *
 * Sub-systems:
 *  - Direct Messaging (X25519 E2E, ghost messages, FEAT-14)  ← messageService
 *  - Group Messaging (AES-256-GCM group key, key rotation)   ← groupMessageService
 *  - Email Alerts (SMTP config, brute-force, RM-06)          ← emailAlertService
 *
 * @module services/messaging
 */

// ─────────────────────────────────────────────────────────────
// Section 1: Direct Message Service (X25519 E2E)
// Sourced from: messageService.ts
// ─────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { sealToPublicKey, openSealed } from '@/crypto/bridge';
import { shareService } from '@/services/sharing';
import { auditService } from '@/services/auditService';
import { generateId, generateSecureId } from '@/utils/generateId';
import { readLocal, writeLocal } from '@/utils/storageHelpers';
import { syncService } from '@/services/syncService';

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

const MESSAGES_KEY = 'qav:messages';

function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToUint8(hex: string): Uint8Array {
  const bytes = hex.match(/.{1,2}/g);
  return new Uint8Array(bytes ? bytes.map((b) => parseInt(b, 16)) : []);
}

const readMessages = () => readLocal<EncryptedMessage[]>(MESSAGES_KEY, []);
const writeMessages = (messages: EncryptedMessage[]) => writeLocal(MESSAGES_KEY, messages);

function getConversationId(email1: string, email2: string): string {
  const sorted = [email1.toLowerCase(), email2.toLowerCase()].sort();
  return `conv-${sorted.join('-')}`;
}

// ── Direct MessageService ──────────────────────────────────────

class MessageServiceImpl {
  async sendMessage(
    senderEmail: string,
    recipientEmail: string,
    plaintext: string,
  ): Promise<EncryptedMessage> {
    const kp = await shareService.getOrCreateKeypair();
    shareService.registerPublicKey(senderEmail, kp.publicKeyHex);

    let recipientPublicHex = shareService.getPublicKey(recipientEmail);
    if (!recipientPublicHex) {
      const { generateShareKeypair } = await import('@/crypto/bridge');
      const recipientKp = await generateShareKeypair();
      recipientPublicHex = uint8ToHex(recipientKp.publicKey);
      shareService.registerPublicKey(recipientEmail, recipientPublicHex);
      if (Platform.OS === 'web') {
        try {
          localStorage.setItem(
            `qav:share_keypair:${recipientEmail}`,
            JSON.stringify({ publicKeyHex: recipientPublicHex, secretKeyHex: uint8ToHex(recipientKp.secretKey) }),
          );
        } catch {}
      }
    }

    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);
    const recipientPublicKey = hexToUint8(recipientPublicHex);
    const sealed = await sealToPublicKey(recipientPublicKey, plaintextBytes);

    const conversationId = getConversationId(senderEmail, recipientEmail);
    const ghostConfig = this.getConversationGhostConfig(conversationId);

    const msg: EncryptedMessage = {
      id: generateId('msg'),
      conversationId,
      senderEmail,
      recipientEmail,
      encryptedContentHex: uint8ToHex(sealed),
      createdAt: new Date().toISOString(),
      isGhost: ghostConfig?.enabled || false,
      ghostTimerSec: ghostConfig?.timerSec,
    };

    const messages = readMessages();
    messages.push(msg);
    writeMessages(messages);

    await auditService.log('message_send', recipientEmail, { messageId: msg.id, conversationId });
    syncService.enqueue('message', { messageId: msg.id, conversationId, senderEmail, recipientEmail });

    return msg;
  }

  getConversations(userEmail: string): Conversation[] {
    const allMessages = readMessages();
    const userMessages = allMessages.filter(
      (m) => m.senderEmail === userEmail || m.recipientEmail === userEmail,
    );

    const convMap = new Map<string, EncryptedMessage[]>();
    for (const msg of userMessages) {
      const existing = convMap.get(msg.conversationId) || [];
      existing.push(msg);
      convMap.set(msg.conversationId, existing);
    }

    const conversations: Conversation[] = [];
    for (const [convId, msgs] of convMap) {
      msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const lastMsg = msgs[msgs.length - 1];
      const participantEmail = lastMsg.senderEmail === userEmail ? lastMsg.recipientEmail : lastMsg.senderEmail;
      const unreadCount = msgs.filter((m) => m.recipientEmail === userEmail && !m.readAt).length;
      conversations.push({ id: convId, participantEmail, lastMessagePreview: '[Encrypted]', lastMessageAt: lastMsg.createdAt, unreadCount });
    }

    conversations.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    return conversations;
  }

  getMessages(conversationId: string): EncryptedMessage[] {
    return readMessages()
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async decryptMessage(message: EncryptedMessage, recipientEmail: string): Promise<string> {
    let secretKeyHex: string | null = null;
    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(`qav:share_keypair:${recipientEmail}`);
        if (stored) secretKeyHex = JSON.parse(stored).secretKeyHex;
      } catch {}
    }
    if (!secretKeyHex) {
      const kp = await shareService.getOrCreateKeypair();
      secretKeyHex = kp.secretKeyHex;
    }
    const secretKey = hexToUint8(secretKeyHex);
    const sealed = hexToUint8(message.encryptedContentHex);
    const decrypted = await openSealed(secretKey, sealed);
    return new TextDecoder().decode(decrypted);
  }

  markAsRead(messageId: string): void {
    const messages = readMessages();
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx !== -1) { messages[idx].readAt = new Date().toISOString(); writeMessages(messages); }
  }

  deleteMessage(messageId: string): void {
    writeMessages(readMessages().filter((m) => m.id !== messageId));
  }

  deleteConversation(conversationId: string): void {
    writeMessages(readMessages().filter((m) => m.conversationId !== conversationId));
  }

  // ── Ghost Message Methods (FEAT-14) ─────────────────────────

  setGhostMode(conversationId: string, enabled: boolean, timerSec: GhostTimer = 30): void {
    const validTimers: GhostTimer[] = [5, 30, 60, 300, 3600, 86400];
    if (!validTimers.includes(timerSec)) throw new Error(`Invalid ghost timer: ${timerSec}`);
    const key = `qav:ghost_config:${conversationId}`;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify({ enabled, timerSec }));
    } catch { /* silent */ }
    auditService.log('settings_change', 'ghost_mode', { conversationId, enabled, timerSec }).catch(() => {});
  }

  getConversationGhostConfig(conversationId: string): { enabled: boolean; timerSec: GhostTimer } | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(`qav:ghost_config:${conversationId}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  startGhostTimer(messageId: string): string | null {
    const messages = readMessages();
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx === -1 || !messages[idx].isGhost || !messages[idx].ghostTimerSec) return null;
    const msg = messages[idx];
    if (msg.ghostTimerStarted && msg.expiresAt) return msg.expiresAt;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (msg.ghostTimerSec! * 1000)).toISOString();
    messages[idx] = { ...msg, readAt: msg.readAt || now.toISOString(), ghostTimerStarted: true, expiresAt };
    writeMessages(messages);
    return expiresAt;
  }

  reapExpiredGhostMessages(): number {
    const messages = readMessages();
    const now = new Date().toISOString();
    const surviving = messages.filter((m) => {
      if (!m.isGhost || !m.expiresAt || !m.ghostTimerStarted) return true;
      return m.expiresAt > now;
    });
    const reaped = messages.length - surviving.length;
    if (reaped > 0) {
      writeMessages(surviving);
      auditService.log('message_delete', 'ghost_reap', { count: reaped }).catch(() => {});
    }
    return reaped;
  }

  getGhostTimeRemaining(message: EncryptedMessage): number {
    if (!message.isGhost || !message.expiresAt || !message.ghostTimerStarted) return -1;
    return Math.max(0, Math.ceil((new Date(message.expiresAt).getTime() - Date.now()) / 1000));
  }

  static formatGhostTimer(seconds: number): string {
    if (seconds <= 0) return 'Expired';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }

  static ghostTimerLabel(sec: GhostTimer): string {
    switch (sec) {
      case 5: return '5 seconds';
      case 30: return '30 seconds';
      case 60: return '1 minute';
      case 300: return '5 minutes';
      case 3600: return '1 hour';
      case 86400: return '24 hours';
      default: return `${sec}s`;
    }
  }
}

export const messageService = new MessageServiceImpl();

// ─────────────────────────────────────────────────────────────
// Section 2: Group Message Service (AES-256-GCM group key)
// Sourced from: groupMessageService.ts
// ─────────────────────────────────────────────────────────────

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

interface GroupKeyRotationHistory {
  groupId: string;
  version: number;
  keyHex: string;
  createdAt: string;
  createdBy: string;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes.buffer;
}

class GroupMessageServiceImpl {
  private groups: Map<string, GroupConversation> = new Map();
  private messages: Map<string, GroupMessage[]> = new Map();
  private keyHistory: Map<string, GroupKeyRotationHistory[]> = new Map();

  constructor() {
    if (Platform.OS === 'web') this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const groupsData = localStorage.getItem('qav:groups');
      if (groupsData) (JSON.parse(groupsData) as GroupConversation[]).forEach(g => this.groups.set(g.id, g));

      const messagesData = localStorage.getItem('qav:group_messages');
      if (messagesData) (JSON.parse(messagesData) as Array<{ groupId: string; messages: GroupMessage[] }>)
        .forEach(item => this.messages.set(item.groupId, item.messages));

      const historyData = localStorage.getItem('qav:group_key_history');
      if (historyData) (JSON.parse(historyData) as Array<{ groupId: string; history: GroupKeyRotationHistory[] }>)
        .forEach(item => this.keyHistory.set(item.groupId, item.history));
    } catch (error) {
      console.error('Failed to load groups from storage:', error);
    }
  }

  private saveToStorage(): void {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.setItem('qav:groups', JSON.stringify(Array.from(this.groups.values())));
      localStorage.setItem('qav:group_messages', JSON.stringify(Array.from(this.messages.entries()).map(([groupId, messages]) => ({ groupId, messages }))));
      localStorage.setItem('qav:group_key_history', JSON.stringify(Array.from(this.keyHistory.entries()).map(([groupId, history]) => ({ groupId, history }))));
    } catch (error) {
      console.error('Failed to save groups to storage:', error);
    }
  }

  private async generateAndSealGroupKey(
    members: Array<{ email: string; publicKeyHex: string }>,
  ): Promise<{ keyHex: string; sealedKeys: { email: string; encryptedKeyHex: string }[] }> {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const rawKey = await crypto.subtle.exportKey('raw', key);
    const keyHex = arrayBufferToHex(rawKey);

    const sealedKeys = await Promise.all(
      members.map(async (member) => {
        const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const publicKeyBytes = new Uint8Array(member.publicKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const encryptedKeyBytes = await sealToPublicKey(publicKeyBytes, keyBytes);
        const encryptedKeyHex = Array.from(encryptedKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        return { email: member.email, encryptedKeyHex };
      }),
    );

    return { keyHex, sealedKeys };
  }

  async createGroup(name: string, creatorEmail: string, memberEmails: string[]): Promise<GroupConversation> {
    const allMembers = [creatorEmail, ...memberEmails].filter((v, i, a) => a.indexOf(v) === i);
    const memberDetails = await Promise.all(
      allMembers.map(async (email) => ({ email, publicKeyHex: shareService.getPublicKey(email) || '' })),
    );

    const { keyHex, sealedKeys } = await this.generateAndSealGroupKey(memberDetails);
    const now = new Date().toISOString();
    const members: GroupMember[] = allMembers.map((email) => {
      const sealed = sealedKeys.find((s) => s.email === email)!;
      return {
        email,
        displayName: email.split('@')[0],
        publicKeyHex: memberDetails.find((m) => m.email === email)?.publicKeyHex || '',
        joinedAt: now,
        role: email === creatorEmail ? 'admin' : 'member',
        encryptedGroupKeyHex: sealed.encryptedKeyHex,
      };
    });

    const groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const group: GroupConversation = { id: groupId, name, creatorEmail, members, createdAt: now, lastMessagePreview: '', unreadCount: 0, groupKeyHex: keyHex, keyVersion: 1, ghostMode: false, ghostTimerSec: 0 };

    this.groups.set(groupId, group);
    this.messages.set(groupId, []);
    this.keyHistory.set(groupId, [{ groupId, version: 1, keyHex, createdAt: now, createdBy: creatorEmail }]);
    this.saveToStorage();

    await auditService.log('system', 'group_created', { groupId, creatorEmail, name, memberCount: memberEmails.length });
    await syncService.enqueue('message', { type: 'group_created', groupId, data: group });

    return group;
  }

  async addMember(groupId: string, newMemberEmail: string, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find((m) => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can add members');
    if (group.members.some((m) => m.email === newMemberEmail)) throw new Error('Member already in group');

    const publicKeyHex = shareService.getPublicKey(newMemberEmail);
    if (!publicKeyHex) throw new Error(`Could not fetch public key for ${newMemberEmail}`);

    const keyBytes = new Uint8Array(group.groupKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const publicKeyBytes = new Uint8Array(publicKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const encryptedGroupKeyBytes = await sealToPublicKey(publicKeyBytes, keyBytes);
    const encryptedGroupKeyHex = Array.from(encryptedGroupKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const now = new Date().toISOString();
    group.members.push({ email: newMemberEmail, displayName: newMemberEmail.split('@')[0], publicKeyHex, joinedAt: now, role: 'member', encryptedGroupKeyHex });
    this.saveToStorage();
    await auditService.log('system', 'group_member_added', { groupId, newMemberEmail, adminEmail });
    await syncService.enqueue('message', { type: 'group_member_added', groupId, data: { newMemberEmail } });
  }

  async removeMember(groupId: string, memberEmail: string, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find((m) => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can remove members');
    group.members = group.members.filter((m) => m.email !== memberEmail);
    await this.rotateGroupKey(groupId, adminEmail);
    await auditService.log('system', 'group_member_removed', { groupId, memberEmail, adminEmail });
    await syncService.enqueue('message', { type: 'group_member_removed', groupId, data: { memberEmail } });
  }

  async rotateGroupKey(groupId: string, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find((m) => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can rotate keys');

    const { keyHex, sealedKeys } = await this.generateAndSealGroupKey(
      group.members.map((m) => ({ email: m.email, publicKeyHex: m.publicKeyHex })),
    );

    group.groupKeyHex = keyHex;
    group.keyVersion += 1;
    group.members.forEach((member) => {
      const sealed = sealedKeys.find((s) => s.email === member.email)!;
      member.encryptedGroupKeyHex = sealed.encryptedKeyHex;
    });

    const now = new Date().toISOString();
    const history = this.keyHistory.get(groupId) || [];
    history.push({ groupId, version: group.keyVersion, keyHex, createdAt: now, createdBy: adminEmail });
    this.keyHistory.set(groupId, history);
    this.saveToStorage();

    await auditService.log('key_rotation', groupId, { newVersion: group.keyVersion, adminEmail });
    await syncService.enqueue('message', { type: 'group_key_rotated', groupId, data: { keyVersion: group.keyVersion } });
  }

  async sendGroupMessage(groupId: string, senderEmail: string, plaintext: string): Promise<GroupMessage> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const sender = group.members.find((m) => m.email === senderEmail);
    if (!sender) throw new Error(`${senderEmail} is not a member of group ${groupId}`);

    const groupKeyBuffer = hexToArrayBuffer(group.groupKeyHex);
    const groupKey = await crypto.subtle.importKey('raw', groupKeyBuffer, 'AES-GCM', true, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plainBuffer = new TextEncoder().encode(plaintext);
    const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, groupKey, plainBuffer);

    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(new Uint8Array(iv), 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);
    const encryptedContentHex = arrayBufferToHex(combined.buffer);

    const now = new Date().toISOString();
    const message: GroupMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      groupId,
      senderEmail,
      senderDisplayName: sender.displayName,
      encryptedContentHex,
      createdAt: now,
      readBy: [senderEmail],
      isGhost: group.ghostMode || false,
      ghostTimerSec: group.ghostTimerSec,
      keyVersion: group.keyVersion,
    };

    if (message.isGhost && message.ghostTimerSec && message.ghostTimerSec > 0) {
      const expiresAt = new Date(now);
      expiresAt.setSeconds(expiresAt.getSeconds() + message.ghostTimerSec);
      message.expiresAt = expiresAt.toISOString();
      message.ghostTimerStarted = true;
    }

    const messages = this.messages.get(groupId) || [];
    messages.push(message);
    this.messages.set(groupId, messages);
    group.lastMessageAt = now;
    group.lastMessagePreview = plaintext.substring(0, 100);
    this.saveToStorage();

    await auditService.log('message_send', groupId, { messageId: message.id, isGhost: message.isGhost, senderEmail });
    await syncService.enqueue('message', { type: 'group_message_sent', groupId, data: { message } });

    return message;
  }

  getGroupMessages(groupId: string): GroupMessage[] {
    return (this.messages.get(groupId) || []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async decryptGroupMessage(message: GroupMessage, memberEmail: string): Promise<string> {
    const group = this.groups.get(message.groupId);
    if (!group) throw new Error(`Group ${message.groupId} not found`);
    const member = group.members.find((m) => m.email === memberEmail);
    if (!member) throw new Error(`${memberEmail} is not a member of this group`);

    let groupKeyHex = group.groupKeyHex;
    if (message.keyVersion < group.keyVersion) {
      const history = this.keyHistory.get(message.groupId) || [];
      const histEntry = history.find((h) => h.version === message.keyVersion);
      if (!histEntry) throw new Error(`Could not find key version ${message.keyVersion}`);
      groupKeyHex = histEntry.keyHex;
    }

    const groupKey = await crypto.subtle.importKey('raw', hexToArrayBuffer(groupKeyHex), 'AES-GCM', true, ['decrypt']);
    const combined = hexToArrayBuffer(message.encryptedContentHex);
    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(combined.slice(0, 12)) }, groupKey, combined.slice(12));
    return new TextDecoder().decode(decryptedBuffer);
  }

  getGroups(userEmail: string): GroupConversation[] {
    const userGroups: GroupConversation[] = [];
    this.groups.forEach((group) => {
      if (group.members.some((m) => m.email === userEmail)) userGroups.push(group);
    });
    return userGroups.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : new Date(a.createdAt).getTime();
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }

  getGroup(groupId: string): GroupConversation | undefined { return this.groups.get(groupId); }

  async deleteGroup(groupId: string, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find((m) => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can delete groups');

    this.groups.delete(groupId);
    this.messages.delete(groupId);
    this.keyHistory.delete(groupId);
    this.saveToStorage();

    await auditService.log('system', 'group_deleted', { groupId, groupName: group.name, adminEmail });
    await syncService.enqueue('message', { type: 'group_deleted', groupId });
  }

  async setGroupGhostMode(groupId: string, enabled: boolean, timerSec: number, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find((m) => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can set ghost mode');

    group.ghostMode = enabled;
    group.ghostTimerSec = timerSec;
    this.saveToStorage();

    await auditService.log('system', 'group_ghost_mode_set', { groupId, enabled, timerSec, adminEmail });
    await syncService.enqueue('message', { type: 'group_ghost_mode_set', groupId, data: { enabled, timerSec } });
  }

  async reapExpiredGroupGhostMessages(): Promise<void> {
    const now = new Date();
    let reaped = 0;
    this.messages.forEach((messages, groupId) => {
      const filtered = messages.filter((msg) => {
        if (msg.isGhost && msg.expiresAt && now >= new Date(msg.expiresAt)) { reaped++; return false; }
        return true;
      });
      if (filtered.length < messages.length) this.messages.set(groupId, filtered);
    });
    if (reaped > 0) {
      this.saveToStorage();
      await auditService.log('system', 'group_ghost_messages_reaped', { count: reaped });
    }
  }

  async leaveGroup(groupId: string, memberEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const memberIndex = group.members.findIndex((m) => m.email === memberEmail);
    if (memberIndex === -1) throw new Error(`${memberEmail} is not a member`);

    const wasAdmin = group.members[memberIndex].role === 'admin';
    group.members.splice(memberIndex, 1);
    if (wasAdmin && group.members.length > 0) group.members[0].role = 'admin';
    if (group.members.length === 0) {
      this.groups.delete(groupId);
      this.messages.delete(groupId);
      this.keyHistory.delete(groupId);
    }
    this.saveToStorage();

    await auditService.log('system', 'group_member_left', { groupId, memberEmail, wasAdmin });
    await syncService.enqueue('message', { type: 'group_member_left', groupId, data: { memberEmail } });
  }

  async markGroupMessageAsRead(messageId: string, groupId: string, memberEmail: string): Promise<void> {
    const messages = this.messages.get(groupId);
    if (!messages) return;
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    if (!message.readBy.includes(memberEmail)) {
      message.readBy.push(memberEmail);
      this.saveToStorage();
      await syncService.enqueue('message', { type: 'group_message_read', groupId, data: { messageId, memberEmail } });
    }
  }

  updateGroupUnreadCount(groupId: string, userEmail: string): number {
    const group = this.groups.get(groupId);
    if (!group) return 0;
    const messages = this.messages.get(groupId) || [];
    const unreadCount = messages.filter((msg) => !msg.readBy.includes(userEmail)).length;
    group.unreadCount = unreadCount;
    return unreadCount;
  }

  clearAll(): void {
    this.groups.clear(); this.messages.clear(); this.keyHistory.clear();
    if (Platform.OS === 'web') {
      localStorage.removeItem('qav:groups');
      localStorage.removeItem('qav:group_messages');
      localStorage.removeItem('qav:group_key_history');
    }
  }
}

export const groupMessageService = new GroupMessageServiceImpl();

// ─────────────────────────────────────────────────────────────
// Section 3: Email Alert Service (SMTP, RM-06)
// Sourced from: emailAlertService.ts
// ─────────────────────────────────────────────────────────────

export type AlertType = 'brute_force' | 'self_destruct' | 'emergency_access' | 'device_change' | 'key_rotation';

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

const EMAIL_CONFIG_KEY = 'qav:email_alert_config';
const EMAIL_HISTORY_KEY = 'qav:email_alert_history';
const EMAIL_PENDING_KEY = 'qav:email_alert_pending';
const EMAIL_TEST_RESULT_KEY = 'qav:email_alert_test_result';
const EMAIL_MAX_HISTORY = 50;
const EMAIL_RETRY_DELAY_MS = 60000;
const isEmailWeb = Platform.OS === 'web';

const DEFAULT_EMAIL_CONFIG: EmailAlertConfig = {
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPasswordSet: false,
  useTLS: true,
  fromAddress: 'security-alerts@qav.local',
  alertRecipients: [],
  enabled: false,
};

function readEmailConfig(): EmailAlertConfig {
  if (!isEmailWeb) return DEFAULT_EMAIL_CONFIG;
  try {
    const raw = localStorage.getItem(EMAIL_CONFIG_KEY);
    return raw ? { ...DEFAULT_EMAIL_CONFIG, ...JSON.parse(raw) } : DEFAULT_EMAIL_CONFIG;
  } catch { return DEFAULT_EMAIL_CONFIG; }
}

function writeEmailConfig(config: EmailAlertConfig): void {
  if (!isEmailWeb) return;
  try { localStorage.setItem(EMAIL_CONFIG_KEY, JSON.stringify(config)); } catch {}
}

function readAlertHistory(): AlertRecord[] {
  if (!isEmailWeb) return [];
  try {
    const raw = localStorage.getItem(EMAIL_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeAlertHistory(records: AlertRecord[]): void {
  if (!isEmailWeb) return;
  try { localStorage.setItem(EMAIL_HISTORY_KEY, JSON.stringify(records.slice(-EMAIL_MAX_HISTORY))); } catch {}
}

function readPendingAlerts(): AlertRecord[] {
  if (!isEmailWeb) return [];
  try {
    const raw = localStorage.getItem(EMAIL_PENDING_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writePendingAlerts(records: AlertRecord[]): void {
  if (!isEmailWeb) return;
  try { localStorage.setItem(EMAIL_PENDING_KEY, JSON.stringify(records)); } catch {}
}

class EmailAlertServiceImpl {
  getEmailConfig(): EmailAlertConfig { return readEmailConfig(); }

  updateEmailConfig(config: Partial<EmailAlertConfig & { smtpPassword?: string }>): void {
    const current = readEmailConfig();
    const { smtpPassword, ...configToMerge } = config;
    if (smtpPassword) (configToMerge as any).smtpPasswordSet = !!smtpPassword;

    const updated: EmailAlertConfig = { ...current, ...configToMerge };
    if (updated.smtpPort < 1 || updated.smtpPort > 65535) updated.smtpPort = 587;
    updated.alertRecipients = updated.alertRecipients.filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

    writeEmailConfig(updated);
    auditService.log('policy_update', 'email_alert_config', { smtpHost: updated.smtpHost, useTLS: updated.useTLS, enabled: updated.enabled }, 'success');
  }

  testEmailConnection(): { success: boolean; message: string } {
    const config = readEmailConfig();
    if (!config.smtpHost || !config.smtpUser || !config.smtpPasswordSet) return { success: false, message: 'Missing SMTP configuration' };
    if (config.alertRecipients.length === 0) return { success: false, message: 'No alert recipients configured' };

    const testResult = { success: true, message: `Connected to ${config.smtpHost}:${config.smtpPort}`, timestamp: new Date().toISOString() };
    if (isEmailWeb) {
      try { localStorage.setItem(EMAIL_TEST_RESULT_KEY, JSON.stringify(testResult)); } catch {}
    }
    auditService.log('system', 'email_alert', { action: 'connection_test', success: true }, 'success');
    return testResult;
  }

  sendAlert(type: AlertType, details: Record<string, unknown>): void {
    const config = readEmailConfig();
    if (!config.enabled) return;

    const alert: AlertRecord = {
      id: generateSecureId('alert'),
      type,
      timestamp: new Date().toISOString(),
      details,
      status: 'pending',
      attempts: 0,
    };

    const pending = readPendingAlerts();
    pending.push(alert);
    writePendingAlerts(pending);
    auditService.log('system', 'email_alert', { type, status: 'queued', alertId: alert.id }, 'success');
  }

  getAlertHistory(): AlertRecord[] { return readAlertHistory(); }
  getPendingAlerts(): AlertRecord[] { return readPendingAlerts(); }

  retryFailedAlerts(): void {
    const config = readEmailConfig();
    if (!config.enabled) return;
    const failedAlerts = readAlertHistory().filter((a) => a.status === 'failed');
    const pending = readPendingAlerts();
    failedAlerts.forEach((alert) => pending.push({ ...alert, id: generateSecureId('alert'), status: 'pending', nextRetryAt: undefined }));
    writePendingAlerts(pending);
    auditService.log('system', 'email_alert', { action: 'retry_failed', count: failedAlerts.length }, 'success');
  }

  markAlertSent(alertId: string): void {
    const pending = readPendingAlerts();
    const alert = pending.find((a) => a.id === alertId);
    if (alert) {
      alert.status = 'sent';
      alert.attempts += 1;
      alert.lastAttemptAt = new Date().toISOString();
      writePendingAlerts(pending.filter((a) => a.id !== alertId));
      const history = readAlertHistory();
      history.push(alert);
      writeAlertHistory(history);
    }
  }

  markAlertFailed(alertId: string): void {
    const pending = readPendingAlerts();
    const alert = pending.find((a) => a.id === alertId);
    if (alert) {
      alert.status = 'failed';
      alert.attempts += 1;
      alert.lastAttemptAt = new Date().toISOString();
      const nextRetry = new Date();
      nextRetry.setMilliseconds(nextRetry.getMilliseconds() + EMAIL_RETRY_DELAY_MS * Math.pow(2, Math.min(alert.attempts, 3)));
      alert.nextRetryAt = nextRetry.toISOString();
      writePendingAlerts(pending);
      auditService.log('system', 'email_alert', { alertId, status: 'failed', attempt: alert.attempts }, 'error');
    }
  }

  clearEmailHistory(): void {
    if (!isEmailWeb) return;
    try { localStorage.removeItem(EMAIL_HISTORY_KEY); } catch {}
    auditService.log('system', 'email_alert', { action: 'history_cleared' }, 'success');
  }

  clearPendingAlerts(): void {
    if (!isEmailWeb) return;
    try { localStorage.removeItem(EMAIL_PENDING_KEY); } catch {}
    auditService.log('system', 'email_alert', { action: 'pending_cleared' }, 'success');
  }
}

export const emailAlertService = new EmailAlertServiceImpl();
