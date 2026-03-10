/**
 * PH4-FIX: Billing Domain — Consolidated Service
 *
 * Merges tierService.ts and receiptService.ts
 * into a single domain-bounded module.
 *
 * Sub-systems:
 *  - Tier / Feature Gate Service (Free/Pro/Enterprise, INFRA-03)  ← tierService
 *  - Receipt Timing Obfuscation Service (SEC-09, RM-06)           ← receiptService
 *
 * @module services/billing
 */

// ─────────────────────────────────────────────────────────────
// Section 1: Tier & Feature Gate Service (INFRA-03)
// Sourced from: tierService.ts
// ─────────────────────────────────────────────────────────────

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { auditService } from '@/services/auditService';
import { generateSecureId } from '@/utils/generateId';

// ── Tier Types ─────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export type Feature =
  | 'basic_encryption'
  | 'password_manager'
  | 'secure_messaging'
  | 'file_sharing'
  | 'ghost_messages'
  | 'backup_restore'
  | 'recovery_phrase'
  | 'fido2_auth'
  | 'biometric_auth'
  | 'key_verification'
  | 'metadata_reduction'
  | 'forensic_cleanup'
  | 'defense_dashboard'
  | 'priority_support'
  | 'unlimited_storage'
  | 'custom_encryption'
  | 'enterprise_qr'
  | 'advanced_analytics'
  | 'dedicated_support'
  | 'sso_integration'
  | 'audit_export'
  | 'auto_backup';

export type LimitType = 'maxFiles' | 'maxVaults' | 'maxPasswords' | 'maxShares' | 'storageBytes';

export interface TierConfig {
  name: string;
  price: number;
  priceMonthly: number;
  features: Feature[];
  limits: {
    maxFiles: number;
    maxVaults: number;
    maxPasswords: number;
    maxShares: number;
    storageBytes: number;
  };
}

export interface FeatureGateResult {
  allowed: boolean;
  reason?: string;
  requiredTier?: SubscriptionTier;
}

export interface FeatureListItem {
  feature: Feature;
  available: boolean;
  label: string;
}

// ── Constants ──────────────────────────────────────────────────

const TIER_STORAGE_KEY = 'usbvault_subscription_tier';
const isTierWeb = Platform.OS === 'web';

const FEATURE_LABELS: Record<Feature, string> = {
  basic_encryption: 'Basic Encryption',
  password_manager: 'Password Manager',
  secure_messaging: 'Secure Messaging',
  file_sharing: 'File Sharing',
  ghost_messages: 'Ghost Messages (Auto-Delete)',
  backup_restore: 'Backup & Restore',
  recovery_phrase: 'Recovery Phrase',
  fido2_auth: 'FIDO2 Authentication',
  biometric_auth: 'Biometric Authentication',
  key_verification: 'Key Verification',
  metadata_reduction: 'Metadata Reduction',
  forensic_cleanup: 'Forensic Cleanup',
  defense_dashboard: 'Defense Dashboard',
  priority_support: 'Priority Support',
  unlimited_storage: 'Unlimited Storage',
  custom_encryption: 'Custom Encryption',
  enterprise_qr: 'Enterprise QR Codes',
  advanced_analytics: 'Advanced Analytics',
  dedicated_support: 'Dedicated Support',
  sso_integration: 'SSO Integration',
  audit_export: 'Audit Log Export',
  auto_backup: 'Automatic Backup',
};

/**
 * Tier configurations: Free ($0), Pro ($9.99/mo), Enterprise ($29.99/mo).
 * INFRA-03: Finalized feature matrices and transparent pricing.
 */
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: 'Free',
    price: 0,
    priceMonthly: 0,
    features: ['basic_encryption', 'password_manager', 'secure_messaging', 'file_sharing', 'fido2_auth', 'biometric_auth', 'defense_dashboard'],
    limits: { maxFiles: 50, maxVaults: 3, maxPasswords: 10, maxShares: 3, storageBytes: 1 * 1024 * 1024 * 1024 },
  },
  pro: {
    name: 'Pro',
    price: 119.88,
    priceMonthly: 9.99,
    features: [
      'basic_encryption', 'password_manager', 'secure_messaging', 'file_sharing', 'fido2_auth', 'biometric_auth', 'defense_dashboard',
      'ghost_messages', 'backup_restore', 'recovery_phrase', 'key_verification', 'metadata_reduction', 'forensic_cleanup',
      'priority_support', 'audit_export', 'auto_backup',
    ],
    limits: { maxFiles: 500, maxVaults: 20, maxPasswords: Number.MAX_SAFE_INTEGER, maxShares: 50, storageBytes: 50 * 1024 * 1024 * 1024 },
  },
  enterprise: {
    name: 'Enterprise',
    price: 359.88,
    priceMonthly: 29.99,
    features: [
      'basic_encryption', 'password_manager', 'secure_messaging', 'file_sharing', 'fido2_auth', 'biometric_auth', 'defense_dashboard',
      'ghost_messages', 'backup_restore', 'recovery_phrase', 'key_verification', 'metadata_reduction', 'forensic_cleanup',
      'priority_support', 'audit_export', 'auto_backup',
      'unlimited_storage', 'custom_encryption', 'enterprise_qr', 'advanced_analytics', 'dedicated_support', 'sso_integration',
    ],
    limits: {
      maxFiles: Number.MAX_SAFE_INTEGER,
      maxVaults: Number.MAX_SAFE_INTEGER,
      maxPasswords: Number.MAX_SAFE_INTEGER,
      maxShares: Number.MAX_SAFE_INTEGER,
      storageBytes: Number.MAX_SAFE_INTEGER,
    },
  },
};

// ── Tier Service ───────────────────────────────────────────────

class TierServiceImpl {
  checkFeature(feature: Feature, tier?: SubscriptionTier): FeatureGateResult {
    const targetTier = tier || this.getCurrentTier();
    const config = TIER_CONFIGS[targetTier];
    if (!config) return { allowed: false, reason: 'Invalid subscription tier' };

    const allowed = config.features.includes(feature);
    if (allowed) { logger.debug(`[TierService] Feature "${feature}" allowed on "${targetTier}" tier`); return { allowed: true }; }

    let requiredTier: SubscriptionTier | undefined;
    for (const [tierKey, tierConfig] of Object.entries(TIER_CONFIGS)) {
      if (tierConfig.features.includes(feature)) { requiredTier = tierKey as SubscriptionTier; break; }
    }

    logger.info(`[TierService] Feature "${feature}" denied on "${targetTier}" tier. Requires: ${requiredTier || 'N/A'}`);
    return {
      allowed: false,
      reason: `Feature "${FEATURE_LABELS[feature]}" not available on ${TIER_CONFIGS[targetTier].name} tier`,
      requiredTier,
    };
  }

  checkLimit(limitType: LimitType, currentCount: number, tier?: SubscriptionTier): FeatureGateResult {
    const targetTier = tier || this.getCurrentTier();
    const config = TIER_CONFIGS[targetTier];
    if (!config) return { allowed: false, reason: 'Invalid subscription tier' };

    const limit = config.limits[limitType];
    const allowed = currentCount <= limit;
    if (allowed) return { allowed: true };

    let requiredTier: SubscriptionTier | undefined;
    for (const [tierKey, tierConfig] of Object.entries(TIER_CONFIGS)) {
      if (currentCount <= tierConfig.limits[limitType]) { requiredTier = tierKey as SubscriptionTier; break; }
    }

    return {
      allowed: false,
      reason: `${limitType} limit (${limit}) exceeded for ${TIER_CONFIGS[targetTier].name} tier`,
      requiredTier,
    };
  }

  getCurrentTier(): SubscriptionTier {
    try {
      if (isTierWeb) {
        const stored = localStorage.getItem(TIER_STORAGE_KEY);
        if (stored && ['free', 'pro', 'enterprise'].includes(stored)) return stored as SubscriptionTier;
      }
      try {
        const { useAuthStore } = require('@/stores/authStore');
        const tier = useAuthStore?.getState?.()?.subscriptionTier;
        if (tier && ['free', 'pro', 'enterprise'].includes(tier)) return tier as SubscriptionTier;
      } catch {}
    } catch (error) {
      logger.error('[TierService] Error reading current tier:', error);
    }
    return 'free';
  }

  setCurrentTier(tier: SubscriptionTier): void {
    if (!['free', 'pro', 'enterprise'].includes(tier)) { logger.error(`[TierService] Invalid tier: ${tier}`); return; }
    try {
      if (isTierWeb) localStorage.setItem(TIER_STORAGE_KEY, tier);
      logger.info(`[TierService] Tier updated to: ${tier}`);
      auditService.log('settings_change', '', { setting: 'subscription_tier', newValue: tier }).catch(() => {});
    } catch (error) {
      logger.error('[TierService] Error setting tier:', error);
    }
  }

  getTierConfig(tier?: SubscriptionTier): TierConfig {
    const targetTier = tier || this.getCurrentTier();
    return TIER_CONFIGS[targetTier] || TIER_CONFIGS.free;
  }

  getAllTierConfigs(): Record<SubscriptionTier, TierConfig> { return TIER_CONFIGS; }

  getUpgradeRequired(feature: Feature): SubscriptionTier | null {
    for (const tier of ['free', 'pro', 'enterprise'] as SubscriptionTier[]) {
      if (TIER_CONFIGS[tier].features.includes(feature)) return tier;
    }
    logger.warn(`[TierService] Feature "${feature}" not found in any tier`);
    return null;
  }

  canUpgrade(): boolean { return this.getCurrentTier() !== 'enterprise'; }

  getFeatureList(tier?: SubscriptionTier): FeatureListItem[] {
    const targetTier = tier || this.getCurrentTier();
    const config = TIER_CONFIGS[targetTier];
    if (!config) return [];
    return (Object.keys(FEATURE_LABELS) as Feature[]).map((feature) => ({
      feature,
      available: config.features.includes(feature),
      label: FEATURE_LABELS[feature],
    }));
  }
}

export const tierService = new TierServiceImpl();

// ─────────────────────────────────────────────────────────────
// Section 2: Receipt Timing Obfuscation Service (SEC-09)
// Sourced from: receiptService.ts
// ─────────────────────────────────────────────────────────────

// ── Receipt Types ──────────────────────────────────────────────

export interface Receipt {
  messageId: string;
  sentAt: string;
  scheduledFor?: string;
}

export interface ReceiptPreferences {
  enabled: boolean;
  randomDelay: boolean;
  minDelaySec: number;
  maxDelaySec: number;
  batchWithSync: boolean;
}

const RECEIPT_PREFS_KEY = 'usbvault:receipt_prefs';
const RECEIPT_PENDING_KEY = 'usbvault:pending_receipts';
const isReceiptWeb = Platform.OS === 'web';

const DEFAULT_RECEIPT_PREFS: ReceiptPreferences = {
  enabled: true,
  randomDelay: true,
  minDelaySec: 1,
  maxDelaySec: 15,
  batchWithSync: true,
};

/**
 * Generate a cryptographically secure random integer in [min, max].
 * Uses rejection sampling to avoid modulo bias.
 */
function secureRandomInt(min: number, max: number): number {
  if (min >= max) return min;
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = Math.pow(256, bytesNeeded);
  const limit = Math.floor(maxValue / range) * range;

  let value: number;
  do {
    if (!crypto.getRandomValues) {
      value = Math.floor(Math.random() * maxValue);
    } else {
      const bytes = new Uint8Array(bytesNeeded);
      crypto.getRandomValues(bytes);
      value = 0;
      for (let i = 0; i < bytes.length; i++) value = (value << 8) | bytes[i];
    }
  } while (value >= limit);

  return min + (value % range);
}

function readReceiptPrefs(): ReceiptPreferences {
  if (!isReceiptWeb) return DEFAULT_RECEIPT_PREFS;
  try {
    const stored = localStorage.getItem(RECEIPT_PREFS_KEY);
    return stored ? { ...DEFAULT_RECEIPT_PREFS, ...JSON.parse(stored) } : DEFAULT_RECEIPT_PREFS;
  } catch { return DEFAULT_RECEIPT_PREFS; }
}

function writeReceiptPrefs(prefs: ReceiptPreferences): void {
  if (!isReceiptWeb) return;
  try { localStorage.setItem(RECEIPT_PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

function readPendingReceipts(): Receipt[] {
  if (!isReceiptWeb) return [];
  try {
    const stored = localStorage.getItem(RECEIPT_PENDING_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function writePendingReceipts(receipts: Receipt[]): void {
  if (!isReceiptWeb) return;
  try { localStorage.setItem(RECEIPT_PENDING_KEY, JSON.stringify(receipts)); } catch {}
}

// ── Receipt Service ────────────────────────────────────────────

class ReceiptServiceImpl {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  async scheduleReadReceipt(messageId: string, delay?: number): Promise<void> {
    const prefs = readReceiptPrefs();

    if (!prefs.enabled) { await this.sendReceipt(messageId); return; }

    let delaySec = delay;
    if (delaySec === undefined) {
      delaySec = prefs.randomDelay ? secureRandomInt(prefs.minDelaySec, prefs.maxDelaySec) : prefs.minDelaySec;
    }

    const delayMs = delaySec * 1000;
    const scheduledFor = new Date(Date.now() + delayMs).toISOString();

    const existing = this.timers.get(messageId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => { this.timers.delete(messageId); await this.sendReceipt(messageId); }, delayMs);
    this.timers.set(messageId, timer);

    const pending = readPendingReceipts();
    const filtered = pending.filter((r) => r.messageId !== messageId);
    filtered.push({ messageId, sentAt: new Date().toISOString(), scheduledFor });
    writePendingReceipts(filtered);

    auditService.log('system', 'receipt_scheduled', { messageId, delaySec }, 'success').catch(() => {});
  }

  setReceiptPreferences(prefs: Partial<ReceiptPreferences>): void {
    writeReceiptPrefs({ ...readReceiptPrefs(), ...prefs });
    auditService.log('settings_change', 'receipt_prefs', { prefs }, 'success').catch(() => {});
  }

  getReceiptPreferences(): ReceiptPreferences { return readReceiptPrefs(); }

  async batchReceipts(): Promise<void> {
    const prefs = readReceiptPrefs();
    if (!prefs.batchWithSync) { await this.flushReceipts(); return; }
    auditService.log('system', 'receipts_batched', { count: this.timers.size }, 'success').catch(() => {});
  }

  getPendingReceipts(): Receipt[] { return readPendingReceipts(); }

  async flushReceipts(): Promise<void> {
    const pending = readPendingReceipts();
    const errors: string[] = [];

    for (const receipt of pending) {
      try {
        const timer = this.timers.get(receipt.messageId);
        if (timer) { clearTimeout(timer); this.timers.delete(receipt.messageId); }
        await this.sendReceipt(receipt.messageId);
      } catch (err) {
        errors.push(`${receipt.messageId}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    writePendingReceipts([]);
    auditService.log('system', 'receipts_flushed', { count: pending.length, errors: errors.length }, 'success').catch(() => {});
  }

  private async sendReceipt(messageId: string): Promise<void> {
    // Production: encrypt + send via messageService or sync
    const pending = readPendingReceipts();
    writePendingReceipts(pending.filter((r) => r.messageId !== messageId));
  }
}

export const receiptService = new ReceiptServiceImpl();
