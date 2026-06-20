/**
 * MONO-1: Direct Message Service (X25519 E2E)
 * Extracted from messaging.ts — Section 1
 *
 * @module services/messaging/directMessage
 */

import { Platform } from 'react-native';
import { sealToPublicKey, openSealed } from '@/crypto/bridge';
import { shareService } from '@/services/sharing';
import { auditService } from '@/services/auditService';
import { generateId } from '@/utils/generateId';
import { readLocal, writeLocal } from '@/utils/storageHelpers';
import { syncService } from '@/services/syncService';

import type { GhostTimer, EncryptedMessage, Conversation } from './types';

const MESSAGES_KEY = 'usbvault:messages';

function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8(hex: string): Uint8Array {
  const bytes = hex.match(/.{1,2}/g);
  return new Uint8Array(bytes ? bytes.map(b => parseInt(b, 16)) : []);
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
    plaintext: string
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
            `usbvault:share_keypair:${recipientEmail}`,
            JSON.stringify({
              publicKeyHex: recipientPublicHex,
              secretKeyHex: uint8ToHex(recipientKp.secretKey),
            })
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
    syncService.enqueue('message', {
      messageId: msg.id,
      conversationId,
      senderEmail,
      recipientEmail,
    });

    return msg;
  }

  getConversations(userEmail: string): Conversation[] {
    const allMessages = readMessages();
    const userMessages = allMessages.filter(
      m => m.senderEmail === userEmail || m.recipientEmail === userEmail
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
      const participantEmail =
        lastMsg.senderEmail === userEmail ? lastMsg.recipientEmail : lastMsg.senderEmail;
      const unreadCount = msgs.filter(m => m.recipientEmail === userEmail && !m.readAt).length;
      conversations.push({
        id: convId,
        participantEmail,
        lastMessagePreview: '[Encrypted]',
        lastMessageAt: lastMsg.createdAt,
        unreadCount,
      });
    }

    conversations.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    return conversations;
  }

  getMessages(conversationId: string): EncryptedMessage[] {
    return readMessages()
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async decryptMessage(message: EncryptedMessage, recipientEmail: string): Promise<string> {
    let secretKeyHex: string | null = null;
    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(`usbvault:share_keypair:${recipientEmail}`);
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
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx !== -1) {
      messages[idx].readAt = new Date().toISOString();
      writeMessages(messages);
    }
  }

  deleteMessage(messageId: string): void {
    writeMessages(readMessages().filter(m => m.id !== messageId));
  }

  deleteConversation(conversationId: string): void {
    writeMessages(readMessages().filter(m => m.conversationId !== conversationId));
  }

  // ── Ghost Message Methods (FEAT-14) ─────────────────────────

  setGhostMode(conversationId: string, enabled: boolean, timerSec: GhostTimer = 30): void {
    const validTimers: GhostTimer[] = [5, 30, 60, 300, 3600, 86400];
    if (!validTimers.includes(timerSec)) throw new Error(`Invalid ghost timer: ${timerSec}`);
    const key = `usbvault:ghost_config:${conversationId}`;
    try {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem(key, JSON.stringify({ enabled, timerSec }));
    } catch {
      /* silent */
    }
    auditService
      .log('settings_change', 'ghost_mode', { conversationId, enabled, timerSec })
      .catch(() => {});
  }

  getConversationGhostConfig(
    conversationId: string
  ): { enabled: boolean; timerSec: GhostTimer } | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(`usbvault:ghost_config:${conversationId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  startGhostTimer(messageId: string): string | null {
    const messages = readMessages();
    const idx = messages.findIndex(m => m.id === messageId);
    if (idx === -1 || !messages[idx].isGhost || !messages[idx].ghostTimerSec) return null;
    const msg = messages[idx];
    if (msg.ghostTimerStarted && msg.expiresAt) return msg.expiresAt;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + msg.ghostTimerSec! * 1000).toISOString();
    messages[idx] = {
      ...msg,
      readAt: msg.readAt || now.toISOString(),
      ghostTimerStarted: true,
      expiresAt,
    };
    writeMessages(messages);
    return expiresAt;
  }

  reapExpiredGhostMessages(): number {
    const messages = readMessages();
    const now = new Date().toISOString();
    const surviving = messages.filter(m => {
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
      case 5:
        return '5 seconds';
      case 30:
        return '30 seconds';
      case 60:
        return '1 minute';
      case 300:
        return '5 minutes';
      case 3600:
        return '1 hour';
      case 86400:
        return '24 hours';
      default:
        return `${sec}s`;
    }
  }
}

export const messageService = new MessageServiceImpl();
