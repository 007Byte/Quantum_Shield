/**
 * P2P Share Service (X25519 sealed-box, key verification)
 *
 * Sourced from: shareService.ts
 *
 * @module services/sharing/p2p
 */

import { Platform } from 'react-native';
import { generateShareKeypair, sealToPublicKey, openSealed } from '@/crypto/bridge';
import { auditService } from '@/services/auditService';
import { syncService } from '@/services/syncService';
import { generateId } from '@/utils/generateId';
import { keyVerificationService } from '@/services/crypto/keyVerification';

import type { ShareRequest, ShareKeypair } from './types';

// ── Constants ──────────────────────────────────────────────────

const SHARES_KEY = 'usbvault:shares';
const KEYPAIR_KEY = 'usbvault:share_keypair';
const PUBLIC_KEYS_KEY = 'usbvault:public_keys';

// ── Helpers ────────────────────────────────────────────────────

function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8(hex: string): Uint8Array {
  const bytes = hex.match(/.{1,2}/g);
  return new Uint8Array(bytes ? bytes.map(b => parseInt(b, 16)) : []);
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
    fileKey: Uint8Array
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
            `usbvault:share_keypair:${recipientEmail}`,
            JSON.stringify({
              publicKeyHex: recipientPublicHex,
              secretKeyHex: uint8ToHex(recipientKp.secretKey),
            })
          );
        } catch {}
      }
    }

    let recipientKeyVerified = false;
    let keyChangeWarning = false;
    try {
      const keyCheck = await keyVerificationService.checkKeyChanged(
        recipientEmail,
        recipientPublicHex
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
    const idx = shares.findIndex(s => s.id === shareId);
    if (idx === -1) throw new Error('Share not found');
    shares[idx].status = 'accepted';
    writeShares(shares);
    await auditService.log('share_accept', shares[idx].fileName, {
      shareId,
      senderEmail: shares[idx].senderEmail,
    });
  }

  async rejectShare(shareId: string): Promise<void> {
    const shares = readShares();
    const idx = shares.findIndex(s => s.id === shareId);
    if (idx === -1) throw new Error('Share not found');
    shares[idx].status = 'rejected';
    writeShares(shares);
    await auditService.log('share_reject', shares[idx].fileName, {
      shareId,
      senderEmail: shares[idx].senderEmail,
    });
  }

  async revokeShare(shareId: string): Promise<void> {
    const shares = readShares();
    const idx = shares.findIndex(s => s.id === shareId);
    if (idx === -1) throw new Error('Share not found');
    shares[idx].status = 'revoked';
    writeShares(shares);
    await auditService.log('share_revoke', shares[idx].fileName, {
      shareId,
      recipientEmail: shares[idx].recipientEmail,
    });
  }

  getOutgoingShares(senderEmail?: string): ShareRequest[] {
    const shares = readShares();
    if (!senderEmail) return shares.filter(s => s.status !== 'rejected');
    return shares.filter(s => s.senderEmail === senderEmail);
  }

  getIncomingShares(recipientEmail?: string): ShareRequest[] {
    const shares = readShares();
    if (!recipientEmail) return shares;
    return shares.filter(s => s.recipientEmail === recipientEmail);
  }

  getAllShares(): ShareRequest[] {
    return readShares();
  }

  async unsealFileKey(shareId: string, recipientEmail: string): Promise<Uint8Array> {
    const shares = readShares();
    const share = shares.find(s => s.id === shareId);
    if (!share) throw new Error('Share not found');

    let secretKeyHex: string | null = null;
    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(`usbvault:share_keypair:${recipientEmail}`);
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

/**
 * Testing helper: reset all caches for testing.
 * @internal For testing only
 */
export function _resetCachesForTesting(): void {
  (shareService as any)._keypair = null;
}
