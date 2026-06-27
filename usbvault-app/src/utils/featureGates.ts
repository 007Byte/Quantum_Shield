/**
 * PH8-FIX: Feature Gates — Server-aligned tier-based feature gating utility.
 *
 * Defines resource limits and feature access per subscription tier.
 * Must stay in sync with the server-side TierLimitsMap in middleware/auth.go.
 *
 * SECURITY (TIER-TRUST): These helpers are pure functions of the `tier` argument and are
 * for CLIENT-SIDE UX gating only. Callers MUST pass a tier that originates from the server
 * (validated JWT claim / GET /user/profile), never one derived solely from
 * attacker-writable client storage (e.g. localStorage `usbvault_subscription_tier`).
 * Any gate that controls a security-relevant capability MUST also be enforced server-side
 * (mirrors TierLimitsMap in middleware/auth.go); the client check here can be bypassed.
 *
 * @module utils/featureGates
 */

// ── Tier Feature Definitions ────────────────────────────────────

export interface TierFeatures {
  maxVaults: number;
  maxStorageMB: number;
  algorithms: string[];
  sharing: boolean;
  auditLogs: boolean;
  prioritySupport: boolean;
}

/**
 * TIER_FEATURES defines the resource limits and capabilities for each subscription tier.
 * These values mirror the server-side TierLimitsMap for consistent enforcement.
 */
export const TIER_FEATURES: Record<string, TierFeatures> = {
  free: {
    maxVaults: 1,
    maxStorageMB: 100,
    algorithms: ['aes-256-gcm'],
    sharing: false,
    auditLogs: false,
    prioritySupport: false,
  },
  individual: {
    maxVaults: 5,
    maxStorageMB: 10240,
    algorithms: ['aes-256-gcm', 'xchacha20', 'ml-kem'],
    sharing: false,
    auditLogs: false,
    prioritySupport: false,
  },
  team: {
    maxVaults: 50,
    maxStorageMB: 102400,
    algorithms: ['aes-256-gcm', 'xchacha20', 'ml-kem'],
    sharing: true,
    auditLogs: true,
    prioritySupport: false,
  },
  enterprise: {
    maxVaults: Infinity,
    maxStorageMB: 1048576,
    algorithms: ['aes-256-gcm', 'xchacha20', 'ml-kem'],
    sharing: true,
    auditLogs: true,
    prioritySupport: true,
  },
};

// ── Tier Hierarchy ──────────────────────────────────────────────

const TIER_RANKING: Record<string, number> = {
  free: 0,
  individual: 1,
  team: 2,
  enterprise: 3,
};

// ── Feature Name to Minimum Tier Mapping ────────────────────────

const FEATURE_MIN_TIER: Record<string, string> = {
  // Free tier features
  basic_encryption: 'free',
  password_manager: 'free',
  secure_messaging: 'free',
  file_sharing: 'free',
  fido2_auth: 'free',
  biometric_auth: 'free',
  defense_dashboard: 'free',

  // Individual tier features
  ghost_messages: 'individual',
  backup_restore: 'individual',
  recovery_phrase: 'individual',
  key_verification: 'individual',
  metadata_reduction: 'individual',
  forensic_cleanup: 'individual',
  priority_support: 'individual',
  audit_export: 'individual',
  auto_backup: 'individual',

  // Team tier features
  sharing: 'team',
  audit_logs: 'team',

  // Enterprise tier features
  unlimited_storage: 'enterprise',
  custom_encryption: 'enterprise',
  enterprise_qr: 'enterprise',
  advanced_analytics: 'enterprise',
  dedicated_support: 'enterprise',
  sso_integration: 'enterprise',
};

// ── Public API ──────────────────────────────────────────────────

/**
 * Check if a user with the given tier can access a specific feature.
 *
 * @param tier - The user's current subscription tier
 * @param feature - The feature name to check
 * @returns true if the tier grants access to the feature
 */
export function canAccessFeature(tier: string, feature: string): boolean {
  const normalizedTier = tier.toLowerCase();
  const minTier = FEATURE_MIN_TIER[feature];

  // Unknown features are denied by default (fail-closed)
  if (!minTier) {
    return false;
  }

  const userRank = TIER_RANKING[normalizedTier] ?? 0;
  const requiredRank = TIER_RANKING[minTier] ?? 0;

  return userRank >= requiredRank;
}

/**
 * Get the maximum number of vaults for a given tier.
 *
 * @param tier - The subscription tier
 * @returns Maximum vault count (Infinity for enterprise)
 */
export function getVaultLimit(tier: string): number {
  const normalizedTier = tier.toLowerCase();
  return TIER_FEATURES[normalizedTier]?.maxVaults ?? TIER_FEATURES.free.maxVaults;
}

/**
 * Get the maximum storage in MB for a given tier.
 *
 * @param tier - The subscription tier
 * @returns Maximum storage in megabytes
 */
export function getStorageLimit(tier: string): number {
  const normalizedTier = tier.toLowerCase();
  return TIER_FEATURES[normalizedTier]?.maxStorageMB ?? TIER_FEATURES.free.maxStorageMB;
}

/**
 * Get the full feature set for a given tier.
 *
 * @param tier - The subscription tier
 * @returns TierFeatures object with all limits and capabilities
 */
export function getTierFeatures(tier: string): TierFeatures {
  const normalizedTier = tier.toLowerCase();
  return TIER_FEATURES[normalizedTier] ?? TIER_FEATURES.free;
}

/**
 * Compare two tiers. Returns -1 if a < b, 0 if equal, 1 if a > b.
 *
 * @param a - First tier
 * @param b - Second tier
 * @returns Comparison result
 */
export function compareTiers(a: string, b: string): number {
  const rankA = TIER_RANKING[a.toLowerCase()] ?? 0;
  const rankB = TIER_RANKING[b.toLowerCase()] ?? 0;
  if (rankA < rankB) return -1;
  if (rankA > rankB) return 1;
  return 0;
}

/**
 * Get the minimum tier required for a feature.
 *
 * @param feature - The feature name
 * @returns The minimum tier name, or null if feature is unknown
 */
export function getMinimumTier(feature: string): string | null {
  return FEATURE_MIN_TIER[feature] ?? null;
}
