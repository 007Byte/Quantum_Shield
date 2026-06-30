import {
  TIER_FEATURES,
  canAccessFeature,
  getVaultLimit,
  getStorageLimit,
  getTierFeatures,
  compareTiers,
  getMinimumTier,
} from '@/utils/featureGates';

describe('featureGates', () => {
  describe('TIER_FEATURES table', () => {
    it('defines the four known tiers with ascending vault limits', () => {
      expect(TIER_FEATURES.free.maxVaults).toBe(1);
      expect(TIER_FEATURES.individual.maxVaults).toBe(5);
      expect(TIER_FEATURES.team.maxVaults).toBe(50);
      expect(TIER_FEATURES.enterprise.maxVaults).toBe(Infinity);
    });

    it('grants sharing/auditLogs only at team and above', () => {
      expect(TIER_FEATURES.free.sharing).toBe(false);
      expect(TIER_FEATURES.individual.sharing).toBe(false);
      expect(TIER_FEATURES.team.sharing).toBe(true);
      expect(TIER_FEATURES.enterprise.sharing).toBe(true);

      expect(TIER_FEATURES.free.auditLogs).toBe(false);
      expect(TIER_FEATURES.team.auditLogs).toBe(true);
    });

    it('grants prioritySupport only at enterprise', () => {
      expect(TIER_FEATURES.team.prioritySupport).toBe(false);
      expect(TIER_FEATURES.enterprise.prioritySupport).toBe(true);
    });

    it('only free tier is limited to aes-256-gcm', () => {
      expect(TIER_FEATURES.free.algorithms).toEqual(['aes-256-gcm']);
      expect(TIER_FEATURES.individual.algorithms).toContain('ml-kem');
      expect(TIER_FEATURES.enterprise.algorithms).toContain('xchacha20');
    });
  });

  describe('canAccessFeature', () => {
    it('allows free-tier features at every tier', () => {
      expect(canAccessFeature('free', 'basic_encryption')).toBe(true);
      expect(canAccessFeature('enterprise', 'basic_encryption')).toBe(true);
      expect(canAccessFeature('free', 'fido2_auth')).toBe(true);
    });

    it('denies higher-tier features to free users', () => {
      expect(canAccessFeature('free', 'ghost_messages')).toBe(false);
      expect(canAccessFeature('free', 'sharing')).toBe(false);
      expect(canAccessFeature('free', 'sso_integration')).toBe(false);
    });

    it('grants a feature at exactly its minimum tier (>= boundary)', () => {
      expect(canAccessFeature('individual', 'ghost_messages')).toBe(true);
      expect(canAccessFeature('team', 'sharing')).toBe(true);
      expect(canAccessFeature('enterprise', 'sso_integration')).toBe(true);
    });

    it('grants a feature to tiers above its minimum', () => {
      expect(canAccessFeature('enterprise', 'ghost_messages')).toBe(true);
      expect(canAccessFeature('team', 'backup_restore')).toBe(true);
    });

    it('fails closed for unknown features', () => {
      expect(canAccessFeature('enterprise', 'nonexistent_capability')).toBe(false);
    });

    it('is case-insensitive on the tier argument', () => {
      expect(canAccessFeature('ENTERPRISE', 'sso_integration')).toBe(true);
      expect(canAccessFeature('Individual', 'ghost_messages')).toBe(true);
    });

    it('treats an unknown tier as rank 0 (free)', () => {
      expect(canAccessFeature('bogus', 'basic_encryption')).toBe(true);
      expect(canAccessFeature('bogus', 'sharing')).toBe(false);
    });
  });

  describe('getVaultLimit', () => {
    it('returns the configured limit per tier', () => {
      expect(getVaultLimit('free')).toBe(1);
      expect(getVaultLimit('team')).toBe(50);
      expect(getVaultLimit('enterprise')).toBe(Infinity);
    });

    it('normalizes case and falls back to free for unknown tiers', () => {
      expect(getVaultLimit('TEAM')).toBe(50);
      expect(getVaultLimit('unknown')).toBe(1);
    });
  });

  describe('getStorageLimit', () => {
    it('returns the configured storage cap per tier', () => {
      expect(getStorageLimit('free')).toBe(100);
      expect(getStorageLimit('individual')).toBe(10240);
      expect(getStorageLimit('enterprise')).toBe(1048576);
    });

    it('falls back to the free cap for unknown tiers', () => {
      expect(getStorageLimit('mystery')).toBe(100);
    });
  });

  describe('getTierFeatures', () => {
    it('returns the full feature object for a known tier', () => {
      expect(getTierFeatures('team')).toBe(TIER_FEATURES.team);
    });

    it('falls back to free features for an unknown tier', () => {
      expect(getTierFeatures('???')).toBe(TIER_FEATURES.free);
    });
  });

  describe('compareTiers', () => {
    it('returns -1 when the first tier is lower', () => {
      expect(compareTiers('free', 'enterprise')).toBe(-1);
      expect(compareTiers('individual', 'team')).toBe(-1);
    });

    it('returns 1 when the first tier is higher', () => {
      expect(compareTiers('enterprise', 'free')).toBe(1);
      expect(compareTiers('team', 'individual')).toBe(1);
    });

    it('returns 0 for equal tiers, case-insensitively', () => {
      expect(compareTiers('team', 'team')).toBe(0);
      expect(compareTiers('Team', 'TEAM')).toBe(0);
    });

    it('treats unknown tiers as the lowest rank', () => {
      expect(compareTiers('unknown', 'free')).toBe(0);
      expect(compareTiers('unknown', 'team')).toBe(-1);
    });
  });

  describe('getMinimumTier', () => {
    it('returns the minimum tier for a known feature', () => {
      expect(getMinimumTier('basic_encryption')).toBe('free');
      expect(getMinimumTier('sharing')).toBe('team');
      expect(getMinimumTier('sso_integration')).toBe('enterprise');
    });

    it('returns null for an unknown feature', () => {
      expect(getMinimumTier('not_a_feature')).toBeNull();
    });
  });
});
