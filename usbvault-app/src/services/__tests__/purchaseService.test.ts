/**
 * Purchase Service Tests — RevenueCat integration
 *
 * Covers the configured/unconfigured branches, offering + customer-info mapping,
 * purchase flow (success, package-not-found, user-cancelled, error rethrow),
 * restore, and entitlement→tier syncing. The RevenueCat SDK is the genuine
 * external boundary: we inject a fake `purchases` object into the service rather
 * than mock the file under test. tierService + analyticsService are mocked at
 * the module boundary; their real shape is asserted via the calls made.
 */

import { purchaseService } from '../purchaseService';
import { tierService } from '@/services/billing/billing';
import { analyticsService } from '@/services/analyticsService';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@/utils/logger', () => ({
  logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// tierService is a downstream boundary — track sync calls, drive getCurrentTier.
jest.mock('@/services/billing/billing', () => ({
  tierService: {
    getCurrentTier: jest.fn(() => 'free'),
    setCurrentTier: jest.fn(),
  },
}));

jest.mock('@/services/analyticsService', () => ({
  analyticsService: { track: jest.fn() },
}));

const mockedTier = tierService as jest.Mocked<typeof tierService>;

/** Build a fake RevenueCat customerInfo with the active entitlements provided. */
function rcCustomerInfo(
  active: Record<string, { isActive: boolean; productIdentifier: string }>,
  extra: Record<string, unknown> = {}
) {
  return {
    activeSubscriptions: Object.values(active).map(e => e.productIdentifier),
    entitlements: { active },
    managementURL: 'https://apps.apple.com/account/subscriptions',
    ...extra,
  };
}

/** Build a fake RevenueCat offerings object with one package. */
function rcOfferings() {
  return {
    current: {
      identifier: 'default',
      availablePackages: [
        {
          identifier: '$rc_monthly',
          packageType: 'MONTHLY',
          product: {
            identifier: 'pro_monthly',
            title: 'Pro Monthly',
            description: 'Pro tier, billed monthly',
            priceString: '$4.99',
            price: 4.99,
            currencyCode: 'USD',
          },
        },
      ],
    },
  };
}

/** Inject a fake SDK into the singleton (the real external boundary). */
function injectSdk(sdk: any): void {
  (purchaseService as any).purchases = sdk;
  (purchaseService as any).initialized = true;
}

describe('PurchaseService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTier.getCurrentTier.mockReturnValue('free');
    // Reset singleton state between tests.
    (purchaseService as any).purchases = null;
    (purchaseService as any).initialized = false;
  });

  describe('unconfigured (no SDK) behavior', () => {
    it('reports not configured and returns graceful defaults', async () => {
      expect(purchaseService.isConfigured()).toBe(false);
      await expect(purchaseService.getOfferings()).resolves.toEqual([]);
      await expect(purchaseService.purchasePackage('$rc_monthly')).resolves.toBeNull();
      await expect(purchaseService.restorePurchases()).resolves.toBeNull();
      await expect(purchaseService.getCustomerInfo()).resolves.toBeNull();
      await expect(purchaseService.getManagementURL()).resolves.toBeNull();
    });

    it('syncTierFromEntitlements is a no-op without an SDK', async () => {
      await purchaseService.syncTierFromEntitlements();
      expect(mockedTier.setCurrentTier).not.toHaveBeenCalled();
    });
  });

  describe('init', () => {
    it('initializes in free-tier mode when no API key is configured', async () => {
      // REVENUECAT_API_KEY is read from env at module load; in the test env it is
      // empty, so init short-circuits without touching the SDK.
      await purchaseService.init();
      expect(purchaseService.isConfigured()).toBe(false);
      // Second call is a no-op (already initialized).
      await purchaseService.init();
      expect(purchaseService.isConfigured()).toBe(false);
    });
  });

  describe('getOfferings', () => {
    it('maps the current offering and its packages to our shape', async () => {
      injectSdk({ getOfferings: jest.fn().mockResolvedValue(rcOfferings()) });

      const offerings = await purchaseService.getOfferings();
      expect(offerings).toHaveLength(1);
      expect(offerings[0].identifier).toBe('default');
      const pkg = offerings[0].packages[0];
      expect(pkg).toEqual({
        identifier: '$rc_monthly',
        productId: 'pro_monthly',
        title: 'Pro Monthly',
        description: 'Pro tier, billed monthly',
        priceString: '$4.99',
        price: 4.99,
        currencyCode: 'USD',
        packageType: 'MONTHLY',
      });
    });

    it('returns [] when there is no current offering', async () => {
      injectSdk({ getOfferings: jest.fn().mockResolvedValue({ current: null }) });
      await expect(purchaseService.getOfferings()).resolves.toEqual([]);
    });

    it('returns [] when the SDK throws', async () => {
      injectSdk({ getOfferings: jest.fn().mockRejectedValue(new Error('network')) });
      await expect(purchaseService.getOfferings()).resolves.toEqual([]);
    });
  });

  describe('purchasePackage', () => {
    it('purchases, maps customer info, and syncs the tier on success', async () => {
      const customerInfo = rcCustomerInfo({
        pro: { isActive: true, productIdentifier: 'pro_monthly' },
      });
      const sdk = {
        getOfferings: jest.fn().mockResolvedValue(rcOfferings()),
        purchasePackage: jest.fn().mockResolvedValue({ customerInfo }),
        getCustomerInfo: jest.fn().mockResolvedValue(customerInfo),
      };
      injectSdk(sdk);

      const info = await purchaseService.purchasePackage('$rc_monthly');

      expect(sdk.purchasePackage).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: '$rc_monthly' })
      );
      expect(info?.entitlements.pro).toEqual({
        isActive: true,
        productIdentifier: 'pro_monthly',
      });
      expect(info?.managementURL).toBe('https://apps.apple.com/account/subscriptions');
      // Entitlement sync upgraded the tier.
      expect(mockedTier.setCurrentTier).toHaveBeenCalledWith('pro');
      expect(analyticsService.track).toHaveBeenCalledWith('subscription_purchased', {
        package: '$rc_monthly',
      });
    });

    it('returns null when the requested package is not found', async () => {
      const sdk = {
        getOfferings: jest.fn().mockResolvedValue(rcOfferings()),
        purchasePackage: jest.fn(),
        getCustomerInfo: jest.fn(),
      };
      injectSdk(sdk);

      const info = await purchaseService.purchasePackage('$rc_yearly');
      expect(info).toBeNull();
      expect(sdk.purchasePackage).not.toHaveBeenCalled();
    });

    it('returns null (no throw) when the user cancels', async () => {
      const cancelError: any = new Error('cancelled');
      cancelError.userCancelled = true;
      const sdk = {
        getOfferings: jest.fn().mockResolvedValue(rcOfferings()),
        purchasePackage: jest.fn().mockRejectedValue(cancelError),
        getCustomerInfo: jest.fn(),
      };
      injectSdk(sdk);

      await expect(purchaseService.purchasePackage('$rc_monthly')).resolves.toBeNull();
      expect(analyticsService.track).not.toHaveBeenCalled();
    });

    it('rethrows non-cancellation purchase errors', async () => {
      const sdk = {
        getOfferings: jest.fn().mockResolvedValue(rcOfferings()),
        purchasePackage: jest.fn().mockRejectedValue(new Error('billing unavailable')),
        getCustomerInfo: jest.fn(),
      };
      injectSdk(sdk);

      await expect(purchaseService.purchasePackage('$rc_monthly')).rejects.toThrow(
        'billing unavailable'
      );
    });
  });

  describe('restorePurchases', () => {
    it('maps restored info, syncs tier, and tracks the event', async () => {
      const customerInfo = rcCustomerInfo({
        enterprise: { isActive: true, productIdentifier: 'ent_yearly' },
      });
      const sdk = {
        restorePurchases: jest.fn().mockResolvedValue(customerInfo),
        getCustomerInfo: jest.fn().mockResolvedValue(customerInfo),
      };
      injectSdk(sdk);

      const info = await purchaseService.restorePurchases();
      expect(info?.entitlements.enterprise.isActive).toBe(true);
      expect(mockedTier.setCurrentTier).toHaveBeenCalledWith('enterprise');
      expect(analyticsService.track).toHaveBeenCalledWith('purchases_restored');
    });

    it('rethrows when restore fails', async () => {
      injectSdk({ restorePurchases: jest.fn().mockRejectedValue(new Error('restore failed')) });
      await expect(purchaseService.restorePurchases()).rejects.toThrow('restore failed');
    });
  });

  describe('getCustomerInfo', () => {
    it('maps active entitlements and activeSubscriptions', async () => {
      const customerInfo = rcCustomerInfo({
        pro: { isActive: true, productIdentifier: 'pro_monthly' },
      });
      injectSdk({ getCustomerInfo: jest.fn().mockResolvedValue(customerInfo) });

      const info = await purchaseService.getCustomerInfo();
      expect(info?.activeSubscriptions).toEqual(['pro_monthly']);
      expect(info?.entitlements.pro.productIdentifier).toBe('pro_monthly');
    });

    it('returns null when the SDK throws', async () => {
      injectSdk({ getCustomerInfo: jest.fn().mockRejectedValue(new Error('offline')) });
      await expect(purchaseService.getCustomerInfo()).resolves.toBeNull();
    });

    it('defaults activeSubscriptions/managementURL when absent on raw info', async () => {
      injectSdk({ getCustomerInfo: jest.fn().mockResolvedValue({ entitlements: { active: {} } }) });
      const info = await purchaseService.getCustomerInfo();
      expect(info?.activeSubscriptions).toEqual([]);
      expect(info?.managementURL).toBeNull();
      expect(info?.entitlements).toEqual({});
    });
  });

  describe('syncTierFromEntitlements', () => {
    it('upgrades to enterprise when the enterprise entitlement is active', async () => {
      mockedTier.getCurrentTier.mockReturnValue('free');
      injectSdk({
        getCustomerInfo: jest
          .fn()
          .mockResolvedValue(
            rcCustomerInfo({ enterprise: { isActive: true, productIdentifier: 'ent' } })
          ),
      });

      await purchaseService.syncTierFromEntitlements();
      expect(mockedTier.setCurrentTier).toHaveBeenCalledWith('enterprise');
    });

    it('prefers enterprise over pro when both are active', async () => {
      mockedTier.getCurrentTier.mockReturnValue('free');
      injectSdk({
        getCustomerInfo: jest.fn().mockResolvedValue(
          rcCustomerInfo({
            pro: { isActive: true, productIdentifier: 'pro' },
            enterprise: { isActive: true, productIdentifier: 'ent' },
          })
        ),
      });

      await purchaseService.syncTierFromEntitlements();
      expect(mockedTier.setCurrentTier).toHaveBeenCalledWith('enterprise');
    });

    it('downgrades to free when no entitlement is active', async () => {
      mockedTier.getCurrentTier.mockReturnValue('pro');
      injectSdk({
        getCustomerInfo: jest.fn().mockResolvedValue(rcCustomerInfo({})),
      });

      await purchaseService.syncTierFromEntitlements();
      expect(mockedTier.setCurrentTier).toHaveBeenCalledWith('free');
    });

    it('does not call setCurrentTier when the tier is unchanged', async () => {
      mockedTier.getCurrentTier.mockReturnValue('pro');
      injectSdk({
        getCustomerInfo: jest
          .fn()
          .mockResolvedValue(rcCustomerInfo({ pro: { isActive: true, productIdentifier: 'pro' } })),
      });

      await purchaseService.syncTierFromEntitlements();
      expect(mockedTier.setCurrentTier).not.toHaveBeenCalled();
    });

    it('swallows SDK errors during sync without throwing', async () => {
      injectSdk({ getCustomerInfo: jest.fn().mockRejectedValue(new Error('boom')) });
      await expect(purchaseService.syncTierFromEntitlements()).resolves.toBeUndefined();
      expect(mockedTier.setCurrentTier).not.toHaveBeenCalled();
    });
  });

  describe('getManagementURL', () => {
    it('returns the management URL from customer info', async () => {
      injectSdk({
        getCustomerInfo: jest.fn().mockResolvedValue(rcCustomerInfo({})),
      });
      await expect(purchaseService.getManagementURL()).resolves.toBe(
        'https://apps.apple.com/account/subscriptions'
      );
    });

    it('returns null when customer info is unavailable', async () => {
      injectSdk({ getCustomerInfo: jest.fn().mockRejectedValue(new Error('x')) });
      await expect(purchaseService.getManagementURL()).resolves.toBeNull();
    });
  });
});
