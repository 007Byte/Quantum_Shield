/**
 * External Portal Service (download limits, branding, analytics)
 *
 * Sourced from: externalPortalService.ts
 *
 * @module services/sharing/portal
 */

import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';

import type { PortalShare, PortalConfig, PortalAnalytics } from './types';

// ── External Portal Service ────────────────────────────────────

class ExternalPortalServiceImpl {
  private readonly SHARES_KEY = 'usbvault:portal_shares';
  private readonly CONFIG_KEY = 'usbvault:portal_config';

  private defaultConfig: PortalConfig = {
    defaultExpiry: 24,
    maxExpiry: 720,
    requirePin: false,
    maxDownloads: 10,
    allowAnonymous: true,
    customBranding: { companyName: 'USBVault' },
  };

  constructor() {
    this.initializeConfig();
  }

  private initializeConfig(): void {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      if (!stored) localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.defaultConfig));
    }
  }

  createPortalShare(
    fileId: string,
    fileName: string,
    fileSize: number,
    fileType: string,
    encryptedData: string,
    options?: Partial<
      Omit<
        PortalShare,
        | 'id'
        | 'fileId'
        | 'fileName'
        | 'fileSize'
        | 'fileType'
        | 'encryptedData'
        | 'createdAt'
        | 'createdBy'
        | 'auditTrail'
        | 'downloadCount'
        | 'isActive'
      >
    >
  ): Promise<PortalShare> {
    return new Promise(resolve => {
      const shareId = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const config = this.getPortalConfig();
      const expiryTime = options?.expiresAt ?? Date.now() + config.defaultExpiry * 60 * 60 * 1000;

      const share: PortalShare = {
        id: shareId,
        fileId,
        fileName,
        fileSize,
        fileType,
        encryptedData,
        encryptionKey: options?.encryptionKey ?? this.generateEncryptionKey(),
        accessPin: options?.accessPin,
        expiresAt: expiryTime,
        maxDownloads: options?.maxDownloads ?? config.maxDownloads,
        downloadCount: 0,
        createdAt: Date.now(),
        createdBy: 'system',
        isActive: true,
        auditTrail: [
          {
            timestamp: Date.now(),
            action: 'created',
            userAgent: Platform.OS === 'web' ? navigator.userAgent : 'mobile',
          },
        ],
      };

      if (Platform.OS === 'web') {
        const shares = this.getAllPortalShares();
        shares.push(share);
        localStorage.setItem(this.SHARES_KEY, JSON.stringify(shares));
      }

      auditService.log('PORTAL_SHARE_CREATED', fileId, { shareId, fileName, fileSize } as any);
      resolve(share);
    });
  }

  generateAccessUrl(shareId: string): string {
    return `https://vault.usbvault.com/portal/${shareId}`;
  }

  async validateAccess(
    shareId: string,
    pin?: string
  ): Promise<{ valid: boolean; share?: PortalShare; error?: string }> {
    const shares = this.getAllPortalShares();
    const share = shares.find(s => s.id === shareId);
    if (!share) return { valid: false, error: 'Share not found' };
    if (!share.isActive) return { valid: false, error: 'Share has been revoked' };
    if (share.expiresAt < Date.now()) {
      share.isActive = false;
      this.updatePortalShare(share);
      return { valid: false, error: 'Share has expired' };
    }
    if (share.downloadCount >= share.maxDownloads)
      return { valid: false, error: 'Maximum downloads exceeded' };

    const config = this.getPortalConfig();
    if (config.requirePin && share.accessPin && share.accessPin !== pin) {
      return { valid: false, error: 'Invalid access PIN' };
    }

    share.auditTrail.push({
      timestamp: Date.now(),
      action: 'accessed',
      userAgent: Platform.OS === 'web' ? navigator.userAgent : 'mobile',
    });
    this.updatePortalShare(share);
    auditService.log('PORTAL_SHARE_ACCESSED', shareId, { fileName: share.fileName } as any);
    return { valid: true, share };
  }

  recordDownload(shareId: string): void {
    const shares = this.getAllPortalShares();
    const share = shares.find(s => s.id === shareId);
    if (share) {
      share.downloadCount += 1;
      share.auditTrail.push({
        timestamp: Date.now(),
        action: 'downloaded',
        userAgent: Platform.OS === 'web' ? navigator.userAgent : 'mobile',
      });
      this.updatePortalShare(share);
      auditService.log('PORTAL_SHARE_DOWNLOADED', shareId, {
        downloadCount: share.downloadCount,
      } as any);
    }
  }

  revokePortalShare(shareId: string): void {
    const shares = this.getAllPortalShares();
    const share = shares.find(s => s.id === shareId);
    if (share) {
      share.isActive = false;
      share.auditTrail.push({ timestamp: Date.now(), action: 'revoked' });
      this.updatePortalShare(share);
      auditService.log('PORTAL_SHARE_REVOKED', shareId, { fileName: share.fileName } as any);
    }
  }

  extendPortalExpiry(shareId: string, hours: number): void {
    const shares = this.getAllPortalShares();
    const share = shares.find(s => s.id === shareId);
    if (share) {
      const config = this.getPortalConfig();
      const newExpiry = Date.now() + hours * 60 * 60 * 1000;
      if (newExpiry - share.createdAt <= config.maxExpiry * 60 * 60 * 1000) {
        share.expiresAt = newExpiry;
        this.updatePortalShare(share);
        auditService.log('PORTAL_SHARE_EXTENDED', shareId, { hours, newExpiry } as any);
      }
    }
  }

  getActivePortalShares(): PortalShare[] {
    return this.getAllPortalShares().filter(s => s.isActive && s.expiresAt > Date.now());
  }

  getShareAnalytics(): PortalAnalytics {
    const shares = this.getActivePortalShares();
    const totalDownloads = shares.reduce((sum, s) => sum + s.downloadCount, 0);
    const avgDownloadsPerShare = shares.length > 0 ? totalDownloads / shares.length : 0;
    const mostAccessedShare = shares.reduce((prev, current) =>
      current.downloadCount > (prev?.downloadCount ?? 0) ? current : prev
    );
    return {
      totalShares: shares.length,
      activeShares: shares.filter(s => s.isActive).length,
      totalDownloads,
      avgDownloadsPerShare: Math.round(avgDownloadsPerShare * 100) / 100,
      mostAccessedShare: mostAccessedShare || undefined,
    };
  }

  getPortalConfig(): PortalConfig {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(this.CONFIG_KEY);
      return stored ? JSON.parse(stored) : this.defaultConfig;
    }
    return this.defaultConfig;
  }

  updatePortalConfig(partial: Partial<PortalConfig>): void {
    if (Platform.OS === 'web') {
      const current = this.getPortalConfig();
      const updated: PortalConfig = {
        ...current,
        ...partial,
        customBranding: { ...current.customBranding, ...(partial.customBranding || {}) },
      };
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(updated));
      auditService.log('PORTAL_CONFIG_UPDATED', 'config', { changes: Object.keys(partial) } as any);
    }
  }

  generateEmbedCode(shareId: string): string {
    return `<iframe src="${this.generateAccessUrl(shareId)}" width="600" height="400" frameborder="0" allow="encrypted-media"></iframe>`;
  }

  cleanupExpiredPortalShares(): number {
    const shares = this.getAllPortalShares();
    const expired = shares.filter(s => s.expiresAt < Date.now());
    const cleaned = expired.length;
    if (cleaned > 0) {
      const remaining = shares.filter(s => s.expiresAt >= Date.now());
      if (Platform.OS === 'web') localStorage.setItem(this.SHARES_KEY, JSON.stringify(remaining));
      auditService.log('PORTAL_SHARES_CLEANUP', 'config', { cleanedCount: cleaned } as any);
    }
    return cleaned;
  }

  private getAllPortalShares(): PortalShare[] {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(this.SHARES_KEY);
      return stored ? JSON.parse(stored) : [];
    }
    return [];
  }

  private updatePortalShare(share: PortalShare): void {
    if (Platform.OS === 'web') {
      const shares = this.getAllPortalShares();
      const index = shares.findIndex(s => s.id === share.id);
      if (index !== -1) {
        shares[index] = share;
        localStorage.setItem(this.SHARES_KEY, JSON.stringify(shares));
      }
    }
  }

  private generateEncryptionKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) key += chars.charAt(Math.floor(Math.random() * chars.length));
    return key;
  }
}

export const externalPortalService = new ExternalPortalServiceImpl();
