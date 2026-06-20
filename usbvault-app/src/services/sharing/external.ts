/**
 * External Share Service (time-limited tokens, PIN, AES-GCM)
 *
 * Sourced from: externalShareService.ts (FEAT-04)
 *
 * @module services/sharing/external
 */

import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';
import { syncService } from '@/services/syncService';
import { logger } from '@/utils/logger';

import type { ExternalShareConfig, ShareAccessEntry, ExternalShare } from './types';

// ── Constants ──────────────────────────────────────────────────

const STORAGE_KEY_SHARES = 'usbvault:external_shares';
const SHARE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// ── External Share Service ─────────────────────────────────────

class ExternalShareServiceImpl {
  private shares: Map<string, ExternalShare> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  async init(): Promise<void> {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(STORAGE_KEY_SHARES);
      if (stored) {
        const sharesArray = JSON.parse(stored);
        this.shares = new Map(sharesArray);
      }
    }
    this.startCleanupInterval();
    await auditService.log('system', 'external_share_init', { status: 'initialized' });
  }

  async destroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await auditService.log('system', 'external_share_destroy', { status: 'destroyed' });
  }

  async createShare(
    fileId: string,
    fileName: string,
    fileContent: Uint8Array,
    creatorEmail: string,
    config: ExternalShareConfig
  ): Promise<ExternalShare> {
    try {
      const shareKey = crypto.getRandomValues(new Uint8Array(32));
      const shareKeyHex = this.bytesToHex(shareKey);

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const algorithm = { name: 'AES-GCM', iv };
      const key = await crypto.subtle.importKey('raw', shareKey, 'AES-GCM', false, ['encrypt']);
      const encryptedBuffer = await crypto.subtle.encrypt(
        algorithm as any,
        key,
        fileContent as BufferSource
      );
      const encryptedContentHex = this.bytesToHex(
        new Uint8Array([...iv, ...new Uint8Array(encryptedBuffer)])
      );

      const shareId = this.generateShareId();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + config.expiryHours * 60 * 60 * 1000);

      const tokenPayload = {
        shareId,
        fileId,
        fileName,
        creatorEmail,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      const token = await this.generateShareToken(tokenPayload);

      let pinHash: string | undefined;
      if (config.requirePin) {
        const pin = this.generateRandomPin();
        pinHash = await this.hashPin(pin);
        logger.debug(`[DEV] Generated PIN for share: ${pin}`);
      }

      const share: ExternalShare = {
        id: shareId,
        fileId,
        fileName,
        creatorEmail,
        token,
        encryptedContentHex,
        shareKeyHex,
        pin: pinHash,
        createdAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        maxAccessCount: config.maxAccess,
        accessCount: 0,
        accessLog: [],
        status: 'active',
      };

      this.shares.set(shareId, share);
      if (Platform.OS === 'web') this.persistShares();

      await auditService.log('share', 'external_share_created', {
        shareId,
        fileId,
        fileName,
        creatorEmail,
        expiryHours: config.expiryHours,
        requirePin: config.requirePin,
        maxAccess: config.maxAccess,
      });
      await syncService.enqueue('share', { shareId, fileId, expiresAt: expiresAt.toISOString() });

      return share;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('error', 'external_share_create_failed', { error: errorMsg });
      throw new Error(`Failed to create share: ${errorMsg}`);
    }
  }

  async accessShare(token: string, pin?: string): Promise<Uint8Array> {
    try {
      const tokenPayload = await this.verifyShareToken(token);
      const shareId = tokenPayload.shareId;
      const share = this.shares.get(shareId);
      if (!share) throw new Error('Share not found');
      if (share.status !== 'active') throw new Error(`Share is ${share.status}`);

      const now = new Date();
      if (now > new Date(share.expiresAt)) {
        share.status = 'expired';
        await auditService.log('share', 'external_share_expired', { shareId });
        throw new Error('Share has expired');
      }

      if (share.maxAccessCount !== undefined && share.accessCount >= share.maxAccessCount) {
        throw new Error('Maximum access count reached');
      }

      if (share.pin) {
        if (!pin) throw new Error('PIN required for this share');
        const pinValid = await this.verifyPin(shareId, pin);
        if (!pinValid) throw new Error('Invalid PIN');
      }

      const encryptedBytes = this.hexToBytes(share.encryptedContentHex);
      const iv = encryptedBytes.slice(0, 12);
      const encryptedData = encryptedBytes.slice(12);
      const shareKey = this.hexToBytes(share.shareKeyHex);
      const key = await crypto.subtle.importKey(
        'raw',
        shareKey as BufferSource,
        'AES-GCM' as any,
        false,
        ['decrypt']
      );
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv } as any,
        key,
        encryptedData as BufferSource
      );
      const decrypted = new Uint8Array(decryptedBuffer);

      share.accessLog.push({
        accessedAt: new Date().toISOString(),
        userAgent: Platform.OS !== 'web' ? undefined : navigator.userAgent,
      });
      share.accessCount += 1;
      if (Platform.OS === 'web') this.persistShares();

      await auditService.log('share', 'external_share_accessed', {
        shareId,
        fileId: share.fileId,
        accessCount: share.accessCount,
      });
      await syncService.enqueue('share_accept', { shareId, accessCount: share.accessCount });

      return decrypted;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('error', 'external_share_access_failed', { error: errorMsg });
      throw new Error(`Failed to access share: ${errorMsg}`);
    }
  }

  async revokeExternalShare(shareId: string): Promise<void> {
    try {
      const share = this.shares.get(shareId);
      if (!share) throw new Error('Share not found');
      share.status = 'revoked';
      if (Platform.OS === 'web') this.persistShares();
      await auditService.log('share', 'external_share_revoked', { shareId, fileId: share.fileId });
      await syncService.enqueue('share_revoke', { shareId });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('error', 'external_share_revoke_failed', { error: errorMsg });
      throw new Error(`Failed to revoke share: ${errorMsg}`);
    }
  }

  async extendShare(shareId: string, additionalHours: 24 | 48): Promise<void> {
    try {
      const share = this.shares.get(shareId);
      if (!share) throw new Error('Share not found');
      if (share.status !== 'active') throw new Error(`Cannot extend ${share.status} share`);

      const newExpiry = new Date(
        new Date(share.expiresAt).getTime() + additionalHours * 60 * 60 * 1000
      );
      share.expiresAt = newExpiry.toISOString();
      if (Platform.OS === 'web') this.persistShares();

      await auditService.log('share', 'external_share_extended', {
        shareId,
        additionalHours,
        newExpiresAt: newExpiry.toISOString(),
      });
      await syncService.enqueue('share', { shareId, expiresAt: newExpiry.toISOString() });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('error', 'external_share_extend_failed', { error: errorMsg });
      throw new Error(`Failed to extend share: ${errorMsg}`);
    }
  }

  getActiveExternalShares(creatorEmail: string): ExternalShare[] {
    const now = new Date();
    return Array.from(this.shares.values()).filter(share => {
      if (share.creatorEmail !== creatorEmail) return false;
      if (share.status === 'revoked') return false;
      if (new Date(share.expiresAt) < now) {
        share.status = 'expired';
        return false;
      }
      return true;
    });
  }

  getShareAuditLog(shareId: string): ShareAccessEntry[] {
    return this.shares.get(shareId)?.accessLog ?? [];
  }

  async cleanupExpiredExternalShares(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let cleanedCount = 0;
      for (const [shareId, share] of this.shares.entries()) {
        if (share.status === 'expired' && new Date(share.expiresAt) < thirtyDaysAgo) {
          this.shares.delete(shareId);
          cleanedCount++;
        }
      }
      if (cleanedCount > 0) {
        if (Platform.OS === 'web') this.persistShares();
        await auditService.log('system', 'external_share_cleanup', { cleanedCount });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('error', 'external_share_cleanup_failed', { error: errorMsg });
    }
  }

  generateShareUrl(token: string): string {
    const baseUrl = Platform.OS === 'web' ? window.location.origin : 'https://usbvault.app';
    return `${baseUrl}/share?token=${encodeURIComponent(token)}`;
  }

  async verifyPin(shareId: string, pin: string): Promise<boolean> {
    try {
      const share = this.shares.get(shareId);
      if (!share || !share.pin) return false;
      return (await this.hashPin(pin)) === share.pin;
    } catch {
      return false;
    }
  }

  private async generateShareToken(payload: Record<string, string>): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerEncoded = this.toBase64Url(JSON.stringify(header));
    const payloadEncoded = this.toBase64Url(JSON.stringify(payload));
    const message = `${headerEncoded}.${payloadEncoded}`;
    const messageBytes = new TextEncoder().encode(message);
    const signingKey = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey(
      'raw',
      signingKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageBytes);
    const signatureEncoded = this.toBase64Url(Buffer.from(signatureBuffer).toString('base64'));
    return `${message}.${signatureEncoded}`;
  }

  private async verifyShareToken(
    token: string
  ): Promise<Record<string, string> & { shareId: string }> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');
    const payload = JSON.parse(this.fromBase64Url(parts[1]));
    if (!payload.shareId || !payload.expiresAt) throw new Error('Invalid token payload');
    if (new Date() > new Date(payload.expiresAt)) throw new Error('Token expired');
    return payload;
  }

  private async hashPin(pin: string): Promise<string> {
    const data = new TextEncoder().encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return this.bytesToHex(new Uint8Array(hashBuffer));
  }

  private generateRandomPin(): string {
    const pinLength = Math.random() > 0.5 ? 6 : 4;
    return Math.floor(Math.random() * Math.pow(10, pinLength))
      .toString()
      .padStart(pinLength, '0');
  }

  private generateShareId(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    return `share-${Date.now()}-${this.bytesToHex(randomBytes)}`;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredExternalShares();
    }, SHARE_CLEANUP_INTERVAL_MS);
  }

  private persistShares(): void {
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY_SHARES, JSON.stringify(Array.from(this.shares.entries())));
    }
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
  }

  private toBase64Url(str: string): string {
    return Buffer.from(str)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private fromBase64Url(str: string): string {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64 + '='.repeat((4 - (str.length % 4)) % 4), 'base64').toString('utf-8');
  }
}

export const externalShareService = new ExternalShareServiceImpl();
