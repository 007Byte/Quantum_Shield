/**
 * PH4-FIX: Sharing Domain — Consolidated Service
 *
 * Merges shareService.ts, externalShareService.ts, and externalPortalService.ts
 * into a single domain-bounded module.
 *
 * Sub-systems:
 *  - P2P Sharing (X25519 sealed-box, key verification)     ← shareService
 *  - External Sharing (time-limited tokens, PIN, AES-GCM)  ← externalShareService
 *  - External Portal (download limits, branding, analytics) ← externalPortalService
 *
 * @module services/sharing
 */

// ─────────────────────────────────────────────────────────────
// Section 1: P2P Share Service (X25519)
// Sourced from: shareService.ts
// ─────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { generateShareKeypair, sealToPublicKey, openSealed } from '@/crypto/bridge';
import { auditService } from '@/services/auditService';
import { syncService } from '@/services/syncService';
import { generateId } from '@/utils/generateId';
import { keyVerificationService } from '@/services/crypto/keyVerification';

// ── Types ──────────────────────────────────────────────────────

export type ShareStatus = 'pending' | 'accepted' | 'rejected' | 'revoked' | 'expired';

export interface ShareRequest {
  id: string;
  fileId: string;
  fileName: string;
  senderEmail: string;
  recipientEmail: string;
  /** Hex-encoded sealed file key (encrypted to recipient's public key) */
  encryptedFileKeyHex: string;
  status: ShareStatus;
  createdAt: string;
  expiresAt?: string;
  /** SG-009: Whether the recipient's key was verified at time of sharing. */
  recipientKeyVerified?: boolean;
  /** SG-009: Whether a key change warning was present at time of sharing. */
  keyChangeWarning?: boolean;
}

export interface ShareKeypair {
  publicKeyHex: string;
  secretKeyHex: string;
}

// ── Constants ──────────────────────────────────────────────────

const SHARES_KEY = 'qav:shares';
const KEYPAIR_KEY = 'qav:share_keypair';
const PUBLIC_KEYS_KEY = 'qav:public_keys';

// ── Helpers ────────────────────────────────────────────────────

function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToUint8(hex: string): Uint8Array {
  const bytes = hex.match(/.{1,2}/g);
  return new Uint8Array(bytes ? bytes.map((b) => parseInt(b, 16)) : []);
}

function readShares(): ShareRequest[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(SHARES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeShares(shares: ShareRequest[]): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(SHARES_KEY, JSON.stringify(shares));
  } catch {
    // Silent fail
  }
}

function readPublicKeys(): Record<string, string> {
  if (Platform.OS !== 'web') return {};
  try {
    const raw = localStorage.getItem(PUBLIC_KEYS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writePublicKeys(keys: Record<string, string>): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(PUBLIC_KEYS_KEY, JSON.stringify(keys));
  } catch {
    // Silent fail
  }
}

// ── P2P ShareService ───────────────────────────────────────────

class ShareServiceImpl {
  private _keypair: ShareKeypair | null = null;

  async getOrCreateKeypair(): Promise<ShareKeypair> {
    if (this._keypair) return this._keypair;

    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(KEYPAIR_KEY);
        if (stored) {
          this._keypair = JSON.parse(stored);
          return this._keypair!;
        }
      } catch {
        // Generate new
      }
    }

    const kp = await generateShareKeypair();
    this._keypair = {
      publicKeyHex: uint8ToHex(kp.publicKey),
      secretKeyHex: uint8ToHex(kp.secretKey),
    };

    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(KEYPAIR_KEY, JSON.stringify(this._keypair));
      } catch {
        // Silent fail
      }
    }

    return this._keypair;
  }

  registerPublicKey(email: string, publicKeyHex: string): void {
    const keys = readPublicKeys();
    keys[email] = publicKeyHex;
    writePublicKeys(keys);
  }

  getPublicKey(email: string): string | null {
    const keys = readPublicKeys();
    return keys[email] || null;
  }

  async shareFile(
    fileId: string,
    fileName: string,
    senderEmail: string,
    recipientEmail: string,
    fileKey: Uint8Array,
  ): Promise<ShareRequest> {
    const kp = await this.getOrCreateKeypair();
    this.registerPublicKey(senderEmail, kp.publicKeyHex);

    let recipientPublicHex = this.getPublicKey(recipientEmail);
    if (!recipientPublicHex) {
      const recipientKp = await generateShareKeypair();
      recipientPublicHex = uint8ToHex(recipientKp.publicKey);
      this.registerPublicKey(recipientEmail, recipientPublicHex);
      if (Platform.OS === 'web') {
        try {
          localStorage.setItem(
            `qav:share_keypair:${recipientEmail}`,
            JSON.stringify({
              publicKeyHex: recipientPublicHex,
              secretKeyHex: uint8ToHex(recipientKp.secretKey),
            }),
          );
        } catch {}
      }
    }

    let recipientKeyVerified = false;
    let keyChangeWarning = false;
    try {
      const keyCheck = await keyVerificationService.checkKeyChanged(
        recipientEmail,
        recipientPublicHex,
      );
      recipientKeyVerified = keyCheck.wasVerified && !keyCheck.changed;
      keyChangeWarning = keyCheck.changed;

      if (keyCheck.changed) {
        await auditService.log('share_key_change_warning', fileName, {
          recipientEmail,
          previousKeyHash: keyCheck.previousKeyHash,
          currentKeyHash: keyCheck.currentKeyHash,
        });
      }
    } catch {
      // Non-fatal
    }

    const recipientPublicKey = hexToUint8(recipientPublicHex);
    const sealed = await sealToPublicKey(recipientPublicKey, fileKey);

    const share: ShareRequest = {
      id: generateId('share'),
      fileId,
      fileName,
      senderEmail,
      recipientEmail,
      encryptedFileKeyHex: uint8ToHex(sealed),
      status: 'pending',
      createdAt: new Date().toISOString(),
      recipientKeyVerified,
      keyChangeWarning,
    };

    const shares = readShares();
    shares.push(share);
    writeShares(shares);

    await auditService.log('share', fileName, {
      shareId: share.id,
      recipientEmail,
      fileId,
    });

    syncService.enqueue('share', {
      shareId: share.id,
      fileId,
      fileName,
      senderEmail,
      recipientEmail,
    });

    return share;
  }

  async acceptShare(shareId: string): Promise<void> {
    const shares = readShares();
    const idx = shares.findIndex((s) => s.id === shareId);
    if (idx === -1) throw new Error('Share not found');
    shares[idx].status = 'accepted';
    writeShares(shares);
    await auditService.log('share_accept', shares[idx].fileName, { shareId, senderEmail: shares[idx].senderEmail });
  }

  async rejectShare(shareId: string): Promise<void> {
    const shares = readShares();
    const idx = shares.findIndex((s) => s.id === shareId);
    if (idx === -1) throw new Error('Share not found');
    shares[idx].status = 'rejected';
    writeShares(shares);
    await auditService.log('share_reject', shares[idx].fileName, { shareId, senderEmail: shares[idx].senderEmail });
  }

  async revokeShare(shareId: string): Promise<void> {
    const shares = readShares();
    const idx = shares.findIndex((s) => s.id === shareId);
    if (idx === -1) throw new Error('Share not found');
    shares[idx].status = 'revoked';
    writeShares(shares);
    await auditService.log('share_revoke', shares[idx].fileName, { shareId, recipientEmail: shares[idx].recipientEmail });
  }

  getOutgoingShares(senderEmail?: string): ShareRequest[] {
    const shares = readShares();
    if (!senderEmail) return shares.filter((s) => s.status !== 'rejected');
    return shares.filter((s) => s.senderEmail === senderEmail);
  }

  getIncomingShares(recipientEmail?: string): ShareRequest[] {
    const shares = readShares();
    if (!recipientEmail) return shares;
    return shares.filter((s) => s.recipientEmail === recipientEmail);
  }

  getAllShares(): ShareRequest[] {
    return readShares();
  }

  async unsealFileKey(shareId: string, recipientEmail: string): Promise<Uint8Array> {
    const shares = readShares();
    const share = shares.find((s) => s.id === shareId);
    if (!share) throw new Error('Share not found');

    let secretKeyHex: string | null = null;
    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(`qav:share_keypair:${recipientEmail}`);
        if (stored) {
          secretKeyHex = JSON.parse(stored).secretKeyHex;
        }
      } catch {}
    }

    if (!secretKeyHex) {
      const kp = await this.getOrCreateKeypair();
      secretKeyHex = kp.secretKeyHex;
    }

    const secretKey = hexToUint8(secretKeyHex);
    const sealed = hexToUint8(share.encryptedFileKeyHex);
    return openSealed(secretKey, sealed);
  }
}

export const shareService = new ShareServiceImpl();

// ─────────────────────────────────────────────────────────────
// Section 2: External Share Service (time-limited tokens)
// Sourced from: externalShareService.ts (FEAT-04)
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY_SHARES = 'qav:external_shares';
const SHARE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface ExternalShareConfig {
  expiryHours: 24 | 48 | 72;
  requirePin: boolean;
  maxAccess?: number;
}

export interface ShareAccessEntry {
  accessedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ExternalShare {
  id: string;
  fileId: string;
  fileName: string;
  creatorEmail: string;
  token: string;
  encryptedContentHex: string;
  shareKeyHex: string;
  pin?: string;
  createdAt: string;
  expiresAt: string;
  maxAccessCount?: number;
  accessCount: number;
  accessLog: ShareAccessEntry[];
  status: 'active' | 'expired' | 'revoked';
}

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
    config: ExternalShareConfig,
  ): Promise<ExternalShare> {
    try {
      const shareKey = crypto.getRandomValues(new Uint8Array(32));
      const shareKeyHex = this.bytesToHex(shareKey);

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const algorithm = { name: 'AES-GCM', iv };
      const key = await crypto.subtle.importKey('raw', shareKey, 'AES-GCM', false, ['encrypt']);
      const encryptedBuffer = await crypto.subtle.encrypt(algorithm as any, key, fileContent as BufferSource);
      const encryptedContentHex = this.bytesToHex(new Uint8Array([...iv, ...new Uint8Array(encryptedBuffer)]));

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
        console.log(`[DEV] Generated PIN for share: ${pin}`);
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
        shareId, fileId, fileName, creatorEmail,
        expiryHours: config.expiryHours, requirePin: config.requirePin, maxAccess: config.maxAccess,
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
      const key = await crypto.subtle.importKey('raw', shareKey as BufferSource, 'AES-GCM' as any, false, ['decrypt']);
      const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv } as any, key, encryptedData as BufferSource);
      const decrypted = new Uint8Array(decryptedBuffer);

      share.accessLog.push({ accessedAt: new Date().toISOString(), userAgent: Platform.OS !== 'web' ? undefined : navigator.userAgent });
      share.accessCount += 1;
      if (Platform.OS === 'web') this.persistShares();

      await auditService.log('share', 'external_share_accessed', { shareId, fileId: share.fileId, accessCount: share.accessCount });
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

      const newExpiry = new Date(new Date(share.expiresAt).getTime() + additionalHours * 60 * 60 * 1000);
      share.expiresAt = newExpiry.toISOString();
      if (Platform.OS === 'web') this.persistShares();

      await auditService.log('share', 'external_share_extended', { shareId, additionalHours, newExpiresAt: newExpiry.toISOString() });
      await syncService.enqueue('share', { shareId, expiresAt: newExpiry.toISOString() });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('error', 'external_share_extend_failed', { error: errorMsg });
      throw new Error(`Failed to extend share: ${errorMsg}`);
    }
  }

  getActiveExternalShares(creatorEmail: string): ExternalShare[] {
    const now = new Date();
    return Array.from(this.shares.values()).filter((share) => {
      if (share.creatorEmail !== creatorEmail) return false;
      if (share.status === 'revoked') return false;
      if (new Date(share.expiresAt) < now) { share.status = 'expired'; return false; }
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
    const baseUrl = Platform.OS === 'web' ? window.location.origin : 'https://qav.app';
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
    const key = await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageBytes);
    const signatureEncoded = this.toBase64Url(Buffer.from(signatureBuffer).toString('base64'));
    return `${message}.${signatureEncoded}`;
  }

  private async verifyShareToken(token: string): Promise<Record<string, string> & { shareId: string }> {
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
    return Math.floor(Math.random() * Math.pow(10, pinLength)).toString().padStart(pinLength, '0');
  }

  private generateShareId(): string {
    const randomBytes = crypto.getRandomValues(new Uint8Array(8));
    return `share-${Date.now()}-${this.bytesToHex(randomBytes)}`;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => { this.cleanupExpiredExternalShares(); }, SHARE_CLEANUP_INTERVAL_MS);
  }

  private persistShares(): void {
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY_SHARES, JSON.stringify(Array.from(this.shares.entries())));
    }
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    return bytes;
  }

  private toBase64Url(str: string): string {
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  private fromBase64Url(str: string): string {
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64 + '='.repeat((4 - (str.length % 4)) % 4), 'base64').toString('utf-8');
  }
}

export const externalShareService = new ExternalShareServiceImpl();

// ─────────────────────────────────────────────────────────────
// Section 3: External Portal Service (download limits, branding)
// Sourced from: externalPortalService.ts
// ─────────────────────────────────────────────────────────────

export interface PortalAuditEntry {
  timestamp: number;
  action: 'created' | 'accessed' | 'downloaded' | 'expired' | 'revoked';
  ipAddress?: string;
  userAgent?: string;
}

export interface PortalShare {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  encryptedData: string;
  encryptionKey: string;
  accessPin?: string;
  expiresAt: number;
  maxDownloads: number;
  downloadCount: number;
  createdAt: number;
  createdBy: string;
  isActive: boolean;
  auditTrail: PortalAuditEntry[];
}

export interface CustomBranding {
  logo?: string;
  primaryColor?: string;
  companyName?: string;
}

export interface PortalConfig {
  defaultExpiry: number;
  maxExpiry: number;
  requirePin: boolean;
  maxDownloads: number;
  allowAnonymous: boolean;
  customBranding: CustomBranding;
}

interface PortalAnalytics {
  totalShares: number;
  activeShares: number;
  totalDownloads: number;
  avgDownloadsPerShare: number;
  mostAccessedShare?: PortalShare;
}

class ExternalPortalServiceImpl {
  private readonly SHARES_KEY = 'qav:portal_shares';
  private readonly CONFIG_KEY = 'qav:portal_config';

  private defaultConfig: PortalConfig = {
    defaultExpiry: 24,
    maxExpiry: 720,
    requirePin: false,
    maxDownloads: 10,
    allowAnonymous: true,
    customBranding: { companyName: 'QAV' },
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
    options?: Partial<Omit<PortalShare, 'id' | 'fileId' | 'fileName' | 'fileSize' | 'fileType' | 'encryptedData' | 'createdAt' | 'createdBy' | 'auditTrail' | 'downloadCount' | 'isActive'>>,
  ): Promise<PortalShare> {
    return new Promise((resolve) => {
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
        auditTrail: [{
          timestamp: Date.now(),
          action: 'created',
          userAgent: Platform.OS === 'web' ? navigator.userAgent : 'mobile',
        }],
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
    return `https://vault.qav.com/portal/${shareId}`;
  }

  async validateAccess(shareId: string, pin?: string): Promise<{ valid: boolean; share?: PortalShare; error?: string }> {
    const shares = this.getAllPortalShares();
    const share = shares.find((s) => s.id === shareId);
    if (!share) return { valid: false, error: 'Share not found' };
    if (!share.isActive) return { valid: false, error: 'Share has been revoked' };
    if (share.expiresAt < Date.now()) {
      share.isActive = false;
      this.updatePortalShare(share);
      return { valid: false, error: 'Share has expired' };
    }
    if (share.downloadCount >= share.maxDownloads) return { valid: false, error: 'Maximum downloads exceeded' };

    const config = this.getPortalConfig();
    if (config.requirePin && share.accessPin && share.accessPin !== pin) {
      return { valid: false, error: 'Invalid access PIN' };
    }

    share.auditTrail.push({ timestamp: Date.now(), action: 'accessed', userAgent: Platform.OS === 'web' ? navigator.userAgent : 'mobile' });
    this.updatePortalShare(share);
    auditService.log('PORTAL_SHARE_ACCESSED', shareId, { fileName: share.fileName } as any);
    return { valid: true, share };
  }

  recordDownload(shareId: string): void {
    const shares = this.getAllPortalShares();
    const share = shares.find((s) => s.id === shareId);
    if (share) {
      share.downloadCount += 1;
      share.auditTrail.push({ timestamp: Date.now(), action: 'downloaded', userAgent: Platform.OS === 'web' ? navigator.userAgent : 'mobile' });
      this.updatePortalShare(share);
      auditService.log('PORTAL_SHARE_DOWNLOADED', shareId, { downloadCount: share.downloadCount } as any);
    }
  }

  revokePortalShare(shareId: string): void {
    const shares = this.getAllPortalShares();
    const share = shares.find((s) => s.id === shareId);
    if (share) {
      share.isActive = false;
      share.auditTrail.push({ timestamp: Date.now(), action: 'revoked' });
      this.updatePortalShare(share);
      auditService.log('PORTAL_SHARE_REVOKED', shareId, { fileName: share.fileName } as any);
    }
  }

  extendPortalExpiry(shareId: string, hours: number): void {
    const shares = this.getAllPortalShares();
    const share = shares.find((s) => s.id === shareId);
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
    return this.getAllPortalShares().filter((s) => s.isActive && s.expiresAt > Date.now());
  }

  getShareAnalytics(): PortalAnalytics {
    const shares = this.getActivePortalShares();
    const totalDownloads = shares.reduce((sum, s) => sum + s.downloadCount, 0);
    const avgDownloadsPerShare = shares.length > 0 ? totalDownloads / shares.length : 0;
    const mostAccessedShare = shares.reduce((prev, current) =>
      current.downloadCount > (prev?.downloadCount ?? 0) ? current : prev);
    return {
      totalShares: shares.length,
      activeShares: shares.filter((s) => s.isActive).length,
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
      const updated: PortalConfig = { ...current, ...partial, customBranding: { ...current.customBranding, ...(partial.customBranding || {}) } };
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(updated));
      auditService.log('PORTAL_CONFIG_UPDATED', 'config', { changes: Object.keys(partial) } as any);
    }
  }

  generateEmbedCode(shareId: string): string {
    return `<iframe src="${this.generateAccessUrl(shareId)}" width="600" height="400" frameborder="0" allow="encrypted-media"></iframe>`;
  }

  cleanupExpiredPortalShares(): number {
    const shares = this.getAllPortalShares();
    const expired = shares.filter((s) => s.expiresAt < Date.now());
    const cleaned = expired.length;
    if (cleaned > 0) {
      const remaining = shares.filter((s) => s.expiresAt >= Date.now());
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
      const index = shares.findIndex((s) => s.id === share.id);
      if (index !== -1) { shares[index] = share; localStorage.setItem(this.SHARES_KEY, JSON.stringify(shares)); }
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
