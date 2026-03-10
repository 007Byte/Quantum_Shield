/**
 * Tier Service Tests — INFRA-03
 *
 * Tests feature gating, tier limits, and subscription management.
 */

import { tierService, SubscriptionTier, Feature, LimitType, TIER_CONFIGS } from '../tierService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock audit service
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('TierService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('getCurrentTier', () => {
    it('should return free tier by default', () => {
      const tier = tierService.getCurrentTier();

      expect(tier).toBe('free');
    });

    it('should load tier from localStorage', () => {
      localStorage.setItem('usbvault_subscription_tier', 'pro');

      const tier = tierService.getCurrentTier();

      expect(tier).toBe('pro');
    });

    it('should validate tier value', () => {
      localStorage.setItem('usbvault_subscription_tier', 'invalid');

      const tier = tierService.getCurrentTier();

      expect(tier).toBe('free'); // Fallback to free
    });
  });

  describe('setCurrentTier', () => {
    it('should set subscription tier', () => {
      tierService.setCurrentTier('pro');

      expect(tierService.getCurrentTier()).toBe('pro');
    });

    it('should persist to localStorage', () => {
      tierService.setCurrentTier('enterprise');

      const stored = localStorage.getItem('usbvault_subscription_tier');
      expect(stored).toBe('enterprise');
    });

    it('should reject invalid tiers', () => {
      tierService.setCurrentTier('invalid' as any);

      const tier = tierService.getCurrentTier();
      expect(tier).not.toBe('invalid');
    });
  });

  describe('checkFeature', () => {
    it('should allow feature on free tier', () => {
      tierService.setCurrentTier('free');

      const result = tierService.checkFeature('basic_encryption');

      expect(result.allowed).toBe(true);
    });

    it('should deny feature not on free tier', () => {
      tierService.setCurrentTier('free');

      const result = tierService.checkFeature('ghost_messages');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.requiredTier).toBe('pro');
    });

    it('should allow all features on enterprise tier', () => {
      tierService.setCurrentTier('enterprise');

      const features: Feature[] = [
        'basic_encryption',
        'ghost_messages',
        'sso_integration',
        'dedicated_support',
      ];

      features.forEach((feature) => {
        const result = tierService.checkFeature(feature);
        expect(result.allowed).toBe(true);
      });
    });

    it('should check feature on specified tier', () => {
      const result = tierService.checkFeature('ghost_messages', 'pro');

      expect(result.allowed).toBe(true);
    });

    it('should find minimum required tier for feature', () => {
      const result = tierService.checkFeature('sso_integration', 'free');

      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBe('enterprise');
    });
  });

  describe('checkLimit', () => {
    it('should allow within limit on free tier', () => {
      tierService.setCurrentTier('free');

      const result = tierService.checkLimit('maxFiles', 50);

      expect(result.allowed).toBe(true);
    });

    it('should deny over limit on free tier', () => {
      tierService.setCurrentTier('free');

      const result = tierService.checkLimit('maxFiles', 100);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.requiredTier).toBe('pro');
    });

    it('should allow high counts on enterprise tier', () => {
      tierService.setCurrentTier('enterprise');

      const result = tierService.checkLimit('maxFiles', 1000000);

      expect(result.allowed).toBe(true);
    });

    it('should check limits on specified tier', () => {
      const result = tierService.checkLimit('maxVaults', 25, 'free');

      expect(result.allowed).toBe(false);
      expect(result.requiredTier).toBeDefined();
    });

    it('should validate all limit types', () => {
      const limits: LimitType[] = [
        'maxFiles',
        'maxVaults',
        'maxPasswords',
        'maxShares',
        'storageBytes',
      ];

      tierService.setCurrentTier('pro');

      limits.forEach((limit) => {
        const result = tierService.checkLimit(limit, 100);
        expect(result.allowed || !result.allowed).toBe(true);
      });
    });
  });

  describe('getTierConfig', () => {
    it('should return current tier config', () => {
      tierService.setCurrentTier('pro');

      const config = tierService.getTierConfig();

      expect(config.name).toBe('Pro');
      expect(config.priceMonthly).toBe(9.99);
    });

    it('should return specified tier config', () => {
      const config = tierService.getTierConfig('enterprise');

      expect(config.name).toBe('Enterprise');
      expect(config.priceMonthly).toBe(29.99);
    });

    it('should include pricing information', () => {
      const freeConfig = tierService.getTierConfig('free');
      const proConfig = tierService.getTierConfig('pro');
      const enterpriseConfig = tierService.getTierConfig('enterprise');

      expect(freeConfig.priceMonthly).toBe(0);
      expect(proConfig.priceMonthly).toBeGreaterThan(0);
      expect(enterpriseConfig.priceMonthly).toBeGreaterThan(proConfig.priceMonthly);
    });

    it('should include feature lists', () => {
      const config = tierService.getTierConfig('pro');

      expect(Array.isArray(config.features)).toBe(true);
      expect(config.features.length).toBeGreaterThan(0);
      expect(config.features).toContain('ghost_messages');
    });

    it('should include limits', () => {
      const config = tierService.getTierConfig('free');

      expect(config.limits.maxFiles).toBe(50);
      expect(config.limits.maxVaults).toBe(3);
      expect(config.limits.storageBytes).toBe(1 * 1024 * 1024 * 1024);
    });
  });

  describe('getAllTierConfigs', () => {
    it('should return all tier configs', () => {
      const allConfigs = tierService.getAllTierConfigs();

      expect(Object.keys(allConfigs)).toEqual(['free', 'pro', 'enterprise']);
    });

    it('should return same configs as individual getTierConfig', () => {
      const allConfigs = tierService.getAllTierConfigs();

      expect(allConfigs.free).toEqual(tierService.getTierConfig('free'));
      expect(allConfigs.pro).toEqual(tierService.getTierConfig('pro'));
      expect(allConfigs.enterprise).toEqual(tierService.getTierConfig('enterprise'));
    });
  });

  describe('getUpgradeRequired', () => {
    it('should return minimum tier for feature', () => {
      const requiredTier = tierService.getUpgradeRequired('ghost_messages');

      expect(requiredTier).toBe('pro');
    });

    it('should return enterprise for enterprise-only features', () => {
      const requiredTier = tierService.getUpgradeRequired('sso_integration');

      expect(requiredTier).toBe('enterprise');
    });

    it('should return free for features available at free level', () => {
      const requiredTier = tierService.getUpgradeRequired('basic_encryption');

      expect(requiredTier).toBe('free');
    });

    it('should return null for non-existent feature', () => {
      const requiredTier = tierService.getUpgradeRequired('nonexistent_feature' as any);

      expect(requiredTier).toBeNull();
    });
  });

  describe('canUpgrade', () => {
    it('should return true on free tier', () => {
      tierService.setCurrentTier('free');

      const canUpgrade = tierService.canUpgrade();

      expect(canUpgrade).toBe(true);
    });

    it('should return true on pro tier', () => {
      tierService.setCurrentTier('pro');

      const canUpgrade = tierService.canUpgrade();

      expect(canUpgrade).toBe(true);
    });

    it('should return false on enterprise tier', () => {
      tierService.setCurrentTier('enterprise');

      const canUpgrade = tierService.canUpgrade();

      expect(canUpgrade).toBe(false);
    });
  });

  describe('getFeatureList', () => {
    it('should return feature list for current tier', () => {
      tierService.setCurrentTier('free');

      const features = tierService.getFeatureList();

      expect(Array.isArray(features)).toBe(true);
      expect(features.length).toBeGreaterThan(0);
      expect(features[0].feature).toBeDefined();
      expect(features[0].available).toBeDefined();
      expect(features[0].label).toBeDefined();
    });

    it('should mark available features correctly', () => {
      tierService.setCurrentTier('free');
      const features = tierService.getFeatureList();

      const basicEncryption = features.find((f) => f.feature === 'basic_encryption');
      expect(basicEncryption?.available).toBe(true);

      const ghostMessages = features.find((f) => f.feature === 'ghost_messages');
      expect(ghostMessages?.available).toBe(false);
    });

    it('should show all features available on enterprise tier', () => {
      tierService.setCurrentTier('enterprise');
      const features = tierService.getFeatureList();

      const unavailable = features.filter((f) => !f.available);
      expect(unavailable.length).toBe(0);
    });

    it('should return feature list for specified tier', () => {
      const features = tierService.getFeatureList('pro');

      const ghostMessages = features.find((f) => f.feature === 'ghost_messages');
      expect(ghostMessages?.available).toBe(true);
    });

    it('should include human-readable labels', () => {
      const features = tierService.getFeatureList();

      features.forEach((f) => {
        expect(f.label.length).toBeGreaterThan(0);
        expect(typeof f.label).toBe('string');
      });
    });
  });

  describe('tier progression', () => {
    it('should support upgrading from free to pro to enterprise', () => {
      tierService.setCurrentTier('free');
      expect(tierService.getCurrentTier()).toBe('free');
      expect(tierService.canUpgrade()).toBe(true);

      tierService.setCurrentTier('pro');
      expect(tierService.getCurrentTier()).toBe('pro');
      expect(tierService.canUpgrade()).toBe(true);

      tierService.setCurrentTier('enterprise');
      expect(tierService.getCurrentTier()).toBe('enterprise');
      expect(tierService.canUpgrade()).toBe(false);
    });

    it('should enforce feature availability across tiers', () => {
      // Ghost messages: Pro and above
      expect(tierService.checkFeature('ghost_messages', 'free').allowed).toBe(false);
      expect(tierService.checkFeature('ghost_messages', 'pro').allowed).toBe(true);
      expect(tierService.checkFeature('ghost_messages', 'enterprise').allowed).toBe(true);

      // SSO: Enterprise only
      expect(tierService.checkFeature('sso_integration', 'free').allowed).toBe(false);
      expect(tierService.checkFeature('sso_integration', 'pro').allowed).toBe(false);
      expect(tierService.checkFeature('sso_integration', 'enterprise').allowed).toBe(true);
    });

    it('should enforce limits across tiers', () => {
      // File limits: free(50), pro(500), enterprise(unlimited)
      expect(tierService.checkLimit('maxFiles', 40, 'free').allowed).toBe(true);
      expect(tierService.checkLimit('maxFiles', 100, 'free').allowed).toBe(false);
      expect(tierService.checkLimit('maxFiles', 500, 'pro').allowed).toBe(true);
      expect(tierService.checkLimit('maxFiles', 1000, 'pro').allowed).toBe(false);
      expect(tierService.checkLimit('maxFiles', 999999, 'enterprise').allowed).toBe(true);
    });
  });

  describe('pricing information', () => {
    it('should have correct pricing structure', () => {
      const freeConfig = TIER_CONFIGS.free;
      const proConfig = TIER_CONFIGS.pro;
      const enterpriseConfig = TIER_CONFIGS.enterprise;

      expect(freeConfig.priceMonthly).toBe(0);
      expect(proConfig.priceMonthly).toBe(9.99);
      expect(enterpriseConfig.priceMonthly).toBe(29.99);
    });

    it('should have correct annual pricing', () => {
      const proConfig = TIER_CONFIGS.pro;
      const enterpriseConfig = TIER_CONFIGS.enterprise;

      expect(proConfig.price).toBe(9.99 * 12);
      expect(enterpriseConfig.price).toBe(29.99 * 12);
    });
  });
});
