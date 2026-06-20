/**
 * MONO-1: Group Message Service (AES-256-GCM group key)
 * Extracted from messaging.ts — Section 2
 *
 * @module services/messaging/groupMessage
 */

import { Platform } from 'react-native';
import { sealToPublicKey } from '@/crypto/bridge';
import { shareService } from '@/services/sharing';
import { auditService } from '@/services/auditService';
import { syncService } from '@/services/syncService';
import { logger } from '@/utils/logger';

import type {
  GroupConversation,
  GroupMember,
  GroupMessage,
  GroupKeyRotationHistory,
} from './types';

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
      const groupsData = localStorage.getItem('usbvault:groups');
      if (groupsData)
        (JSON.parse(groupsData) as GroupConversation[]).forEach(g => this.groups.set(g.id, g));

      const messagesData = localStorage.getItem('usbvault:group_messages');
      if (messagesData)
        (JSON.parse(messagesData) as Array<{ groupId: string; messages: GroupMessage[] }>).forEach(
          item => this.messages.set(item.groupId, item.messages)
        );

      const historyData = localStorage.getItem('usbvault:group_key_history');
      if (historyData)
        (
          JSON.parse(historyData) as Array<{ groupId: string; history: GroupKeyRotationHistory[] }>
        ).forEach(item => this.keyHistory.set(item.groupId, item.history));
    } catch (error) {
      logger.error('Failed to load groups from storage:', error);
    }
  }

  private saveToStorage(): void {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.setItem('usbvault:groups', JSON.stringify(Array.from(this.groups.values())));
      localStorage.setItem(
        'usbvault:group_messages',
        JSON.stringify(
          Array.from(this.messages.entries()).map(([groupId, messages]) => ({ groupId, messages }))
        )
      );
      localStorage.setItem(
        'usbvault:group_key_history',
        JSON.stringify(
          Array.from(this.keyHistory.entries()).map(([groupId, history]) => ({ groupId, history }))
        )
      );
    } catch (error) {
      logger.error('Failed to save groups to storage:', error);
    }
  }

  private async generateAndSealGroupKey(
    members: Array<{ email: string; publicKeyHex: string }>
  ): Promise<{ keyHex: string; sealedKeys: { email: string; encryptedKeyHex: string }[] }> {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const rawKey = await crypto.subtle.exportKey('raw', key);
    const keyHex = arrayBufferToHex(rawKey);

    const sealedKeys = await Promise.all(
      members.map(async member => {
        const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const publicKeyBytes = new Uint8Array(
          member.publicKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
        );
        const encryptedKeyBytes = await sealToPublicKey(publicKeyBytes, keyBytes);
        const encryptedKeyHex = Array.from(encryptedKeyBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        return { email: member.email, encryptedKeyHex };
      })
    );

    return { keyHex, sealedKeys };
  }

  async createGroup(
    name: string,
    creatorEmail: string,
    memberEmails: string[]
  ): Promise<GroupConversation> {
    const allMembers = [creatorEmail, ...memberEmails].filter((v, i, a) => a.indexOf(v) === i);
    const memberDetails = await Promise.all(
      allMembers.map(async email => ({
        email,
        publicKeyHex: shareService.getPublicKey(email) || '',
      }))
    );

    const { keyHex, sealedKeys } = await this.generateAndSealGroupKey(memberDetails);
    const now = new Date().toISOString();
    const members: GroupMember[] = allMembers.map(email => {
      const sealed = sealedKeys.find(s => s.email === email)!;
      return {
        email,
        displayName: email.split('@')[0],
        publicKeyHex: memberDetails.find(m => m.email === email)?.publicKeyHex || '',
        joinedAt: now,
        role: email === creatorEmail ? 'admin' : 'member',
        encryptedGroupKeyHex: sealed.encryptedKeyHex,
      };
    });

    const groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const group: GroupConversation = {
      id: groupId,
      name,
      creatorEmail,
      members,
      createdAt: now,
      lastMessagePreview: '',
      unreadCount: 0,
      groupKeyHex: keyHex,
      keyVersion: 1,
      ghostMode: false,
      ghostTimerSec: 0,
    };

    this.groups.set(groupId, group);
    this.messages.set(groupId, []);
    this.keyHistory.set(groupId, [
      { groupId, version: 1, keyHex, createdAt: now, createdBy: creatorEmail },
    ]);
    this.saveToStorage();

    await auditService.log('system', 'group_created', {
      groupId,
      creatorEmail,
      name,
      memberCount: memberEmails.length,
    });
    await syncService.enqueue('message', { type: 'group_created', groupId, data: group });

    return group;
  }

  async addMember(groupId: string, newMemberEmail: string, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find(m => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can add members');
    if (group.members.some(m => m.email === newMemberEmail))
      throw new Error('Member already in group');

    const publicKeyHex = shareService.getPublicKey(newMemberEmail);
    if (!publicKeyHex) throw new Error(`Could not fetch public key for ${newMemberEmail}`);

    const keyBytes = new Uint8Array(
      group.groupKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );
    const publicKeyBytes = new Uint8Array(
      publicKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );
    const encryptedGroupKeyBytes = await sealToPublicKey(publicKeyBytes, keyBytes);
    const encryptedGroupKeyHex = Array.from(encryptedGroupKeyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const now = new Date().toISOString();
    group.members.push({
      email: newMemberEmail,
      displayName: newMemberEmail.split('@')[0],
      publicKeyHex,
      joinedAt: now,
      role: 'member',
      encryptedGroupKeyHex,
    });
    this.saveToStorage();
    await auditService.log('system', 'group_member_added', { groupId, newMemberEmail, adminEmail });
    await syncService.enqueue('message', {
      type: 'group_member_added',
      groupId,
      data: { newMemberEmail },
    });
  }

  async removeMember(groupId: string, memberEmail: string, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find(m => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can remove members');
    group.members = group.members.filter(m => m.email !== memberEmail);
    await this.rotateGroupKey(groupId, adminEmail);
    await auditService.log('system', 'group_member_removed', { groupId, memberEmail, adminEmail });
    await syncService.enqueue('message', {
      type: 'group_member_removed',
      groupId,
      data: { memberEmail },
    });
  }

  async rotateGroupKey(groupId: string, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find(m => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can rotate keys');

    const { keyHex, sealedKeys } = await this.generateAndSealGroupKey(
      group.members.map(m => ({ email: m.email, publicKeyHex: m.publicKeyHex }))
    );

    group.groupKeyHex = keyHex;
    group.keyVersion += 1;
    group.members.forEach(member => {
      const sealed = sealedKeys.find(s => s.email === member.email)!;
      member.encryptedGroupKeyHex = sealed.encryptedKeyHex;
    });

    const now = new Date().toISOString();
    const history = this.keyHistory.get(groupId) || [];
    history.push({
      groupId,
      version: group.keyVersion,
      keyHex,
      createdAt: now,
      createdBy: adminEmail,
    });
    this.keyHistory.set(groupId, history);
    this.saveToStorage();

    await auditService.log('key_rotation', groupId, { newVersion: group.keyVersion, adminEmail });
    await syncService.enqueue('message', {
      type: 'group_key_rotated',
      groupId,
      data: { keyVersion: group.keyVersion },
    });
  }

  async sendGroupMessage(
    groupId: string,
    senderEmail: string,
    plaintext: string
  ): Promise<GroupMessage> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const sender = group.members.find(m => m.email === senderEmail);
    if (!sender) throw new Error(`${senderEmail} is not a member of group ${groupId}`);

    const groupKeyBuffer = hexToArrayBuffer(group.groupKeyHex);
    const groupKey = await crypto.subtle.importKey('raw', groupKeyBuffer, 'AES-GCM', true, [
      'encrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plainBuffer = new TextEncoder().encode(plaintext);
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      groupKey,
      plainBuffer
    );

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

    await auditService.log('message_send', groupId, {
      messageId: message.id,
      isGhost: message.isGhost,
      senderEmail,
    });
    await syncService.enqueue('message', {
      type: 'group_message_sent',
      groupId,
      data: { message },
    });

    return message;
  }

  getGroupMessages(groupId: string): GroupMessage[] {
    return (this.messages.get(groupId) || []).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  async decryptGroupMessage(message: GroupMessage, memberEmail: string): Promise<string> {
    const group = this.groups.get(message.groupId);
    if (!group) throw new Error(`Group ${message.groupId} not found`);
    const member = group.members.find(m => m.email === memberEmail);
    if (!member) throw new Error(`${memberEmail} is not a member of this group`);

    let groupKeyHex = group.groupKeyHex;
    if (message.keyVersion < group.keyVersion) {
      const history = this.keyHistory.get(message.groupId) || [];
      const histEntry = history.find(h => h.version === message.keyVersion);
      if (!histEntry) throw new Error(`Could not find key version ${message.keyVersion}`);
      groupKeyHex = histEntry.keyHex;
    }

    const groupKey = await crypto.subtle.importKey(
      'raw',
      hexToArrayBuffer(groupKeyHex),
      'AES-GCM',
      true,
      ['decrypt']
    );
    const combined = hexToArrayBuffer(message.encryptedContentHex);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(combined.slice(0, 12)) },
      groupKey,
      combined.slice(12)
    );
    return new TextDecoder().decode(decryptedBuffer);
  }

  getGroups(userEmail: string): GroupConversation[] {
    const userGroups: GroupConversation[] = [];
    this.groups.forEach(group => {
      if (group.members.some(m => m.email === userEmail)) userGroups.push(group);
    });
    return userGroups.sort((a, b) => {
      const aTime = a.lastMessageAt
        ? new Date(a.lastMessageAt).getTime()
        : new Date(a.createdAt).getTime();
      const bTime = b.lastMessageAt
        ? new Date(b.lastMessageAt).getTime()
        : new Date(b.createdAt).getTime();
      return bTime - aTime;
    });
  }

  getGroup(groupId: string): GroupConversation | undefined {
    return this.groups.get(groupId);
  }

  async deleteGroup(groupId: string, adminEmail: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find(m => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can delete groups');

    this.groups.delete(groupId);
    this.messages.delete(groupId);
    this.keyHistory.delete(groupId);
    this.saveToStorage();

    await auditService.log('system', 'group_deleted', {
      groupId,
      groupName: group.name,
      adminEmail,
    });
    await syncService.enqueue('message', { type: 'group_deleted', groupId });
  }

  async setGroupGhostMode(
    groupId: string,
    enabled: boolean,
    timerSec: number,
    adminEmail: string
  ): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group) throw new Error(`Group ${groupId} not found`);
    const admin = group.members.find(m => m.email === adminEmail);
    if (!admin || admin.role !== 'admin') throw new Error('Only admins can set ghost mode');

    group.ghostMode = enabled;
    group.ghostTimerSec = timerSec;
    this.saveToStorage();

    await auditService.log('system', 'group_ghost_mode_set', {
      groupId,
      enabled,
      timerSec,
      adminEmail,
    });
    await syncService.enqueue('message', {
      type: 'group_ghost_mode_set',
      groupId,
      data: { enabled, timerSec },
    });
  }

  async reapExpiredGroupGhostMessages(): Promise<void> {
    const now = new Date();
    let reaped = 0;
    this.messages.forEach((messages, groupId) => {
      const filtered = messages.filter(msg => {
        if (msg.isGhost && msg.expiresAt && now >= new Date(msg.expiresAt)) {
          reaped++;
          return false;
        }
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
    const memberIndex = group.members.findIndex(m => m.email === memberEmail);
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
    await syncService.enqueue('message', {
      type: 'group_member_left',
      groupId,
      data: { memberEmail },
    });
  }

  async markGroupMessageAsRead(
    messageId: string,
    groupId: string,
    memberEmail: string
  ): Promise<void> {
    const messages = this.messages.get(groupId);
    if (!messages) return;
    const message = messages.find(m => m.id === messageId);
    if (!message) return;
    if (!message.readBy.includes(memberEmail)) {
      message.readBy.push(memberEmail);
      this.saveToStorage();
      await syncService.enqueue('message', {
        type: 'group_message_read',
        groupId,
        data: { messageId, memberEmail },
      });
    }
  }

  updateGroupUnreadCount(groupId: string, userEmail: string): number {
    const group = this.groups.get(groupId);
    if (!group) return 0;
    const messages = this.messages.get(groupId) || [];
    const unreadCount = messages.filter(msg => !msg.readBy.includes(userEmail)).length;
    group.unreadCount = unreadCount;
    return unreadCount;
  }

  clearAll(): void {
    this.groups.clear();
    this.messages.clear();
    this.keyHistory.clear();
    if (Platform.OS === 'web') {
      localStorage.removeItem('usbvault:groups');
      localStorage.removeItem('usbvault:group_messages');
      localStorage.removeItem('usbvault:group_key_history');
    }
  }
}

export const groupMessageService = new GroupMessageServiceImpl();
