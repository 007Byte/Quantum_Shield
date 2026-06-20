/**
 * Sharing domain types
 *
 * All type definitions for P2P sharing, external sharing, and portal sharing.
 *
 * @module services/sharing/types
 */

// ── P2P Share Types ──────────────────────────────────────────

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

// ── External Share Types ─────────────────────────────────────

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

// ── Portal Types ─────────────────────────────────────────────

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

export interface PortalAnalytics {
  totalShares: number;
  activeShares: number;
  totalDownloads: number;
  avgDownloadsPerShare: number;
  mostAccessedShare?: PortalShare;
}
