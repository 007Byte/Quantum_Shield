/**
 * Purchase Service — RevenueCat integration for in-app subscriptions
 *
 * Manages subscription purchases across iOS (StoreKit) and Android (Play Billing)
 * via the RevenueCat SDK. Syncs entitlements with the existing tierService.
 *
 * Works in sandbox mode without a RevenueCat account — purchases use
 * Apple/Google sandbox billing. When EXPO_PUBLIC_REVENUECAT_KEY is not set,
 * all methods return graceful defaults (free tier).
 *
 * Entitlement mapping:
 *   RevenueCat entitlement "pro"        → tierService.setCurrentTier('pro')
 *   RevenueCat entitlement "enterprise" → tierService.setCurrentTier('enterprise')
 *   No active entitlement               → tierService.setCurrentTier('free')
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { tierService, type SubscriptionTier } from '@/services/billing/billing';
import { analyticsService } from '@/services/analyticsService';

const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_KEY || '';

/** Offering from RevenueCat — simplified for our use */
export interface PurchaseOffering {
  identifier: string;
  packages: PurchasePackage[];
}

export interface PurchasePackage {
  identifier: string;
  productId: string;
  title: string;
  description: string;
  priceString: string;
  price: number;
  currencyCode: string;
  packageType: string;
}

export interface CustomerInfo {
  activeSubscriptions: string[];
  entitlements: Record<string, { isActive: boolean; productIdentifier: string }>;
  managementURL: string | null;
}

class PurchaseServiceImpl {
  private initialized = false;
  private purchases: any = null;

  /**
   * Initialize RevenueCat SDK.
   * If no API key is configured, operates in offline mode (free tier only).
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (!REVENUECAT_API_KEY) {
      logger.log('[Purchases] No RevenueCat API key configured — operating in free tier mode');
      this.initialized = true;
      return;
    }

    if (Platform.OS === 'web') {
      logger.log('[Purchases] RevenueCat not available on web — use Stripe for web billing');
      this.initialized = true;
      return;
    }

    try {
      const Purchases = require('react-native-purchases').default;
      this.purchases = Purchases;

      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });

      // Sync current entitlements with tier service
      await this.syncTierFromEntitlements();

      this.initialized = true;
      logger.log('[Purchases] Initialized');
    } catch (error) {
      logger.warn('[Purchases] Init failed:', error);
      this.initialized = true;
    }
  }

  /**
   * Get available subscription offerings.
   * Returns empty array if not configured.
   */
  async getOfferings(): Promise<PurchaseOffering[]> {
    if (!this.purchases) return [];

    try {
      const offerings = await this.purchases.getOfferings();
      if (!offerings.current) return [];

      return [
        {
          identifier: offerings.current.identifier,
          packages: offerings.current.availablePackages.map((pkg: any) => ({
            identifier: pkg.identifier,
            productId: pkg.product.identifier,
            title: pkg.product.title,
            description: pkg.product.description,
            priceString: pkg.product.priceString,
            price: pkg.product.price,
            currencyCode: pkg.product.currencyCode,
            packageType: pkg.packageType,
          })),
        },
      ];
    } catch (error) {
      logger.warn('[Purchases] Failed to get offerings:', error);
      return [];
    }
  }

  /**
   * Purchase a subscription package.
   * Returns the updated customer info after purchase.
   */
  async purchasePackage(packageId: string): Promise<CustomerInfo | null> {
    if (!this.purchases) {
      logger.warn('[Purchases] Cannot purchase — SDK not initialized');
      return null;
    }

    try {
      const offerings = await this.purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find((p: any) => p.identifier === packageId);

      if (!pkg) {
        logger.warn('[Purchases] Package not found:', packageId);
        return null;
      }

      const { customerInfo } = await this.purchases.purchasePackage(pkg);
      const info = this.mapCustomerInfo(customerInfo);

      // Sync tier after purchase
      await this.syncTierFromEntitlements();
      analyticsService.track('subscription_purchased', { package: packageId });

      return info;
    } catch (error: any) {
      if (error.userCancelled) {
        logger.log('[Purchases] User cancelled purchase');
        return null;
      }
      logger.error('[Purchases] Purchase failed:', error);
      throw error;
    }
  }

  /**
   * Restore previous purchases (e.g., after reinstall).
   */
  async restorePurchases(): Promise<CustomerInfo | null> {
    if (!this.purchases) return null;

    try {
      const customerInfo = await this.purchases.restorePurchases();
      const info = this.mapCustomerInfo(customerInfo);
      await this.syncTierFromEntitlements();
      analyticsService.track('purchases_restored');
      return info;
    } catch (error) {
      logger.error('[Purchases] Restore failed:', error);
      throw error;
    }
  }

  /**
   * Get current customer info and entitlements.
   */
  async getCustomerInfo(): Promise<CustomerInfo | null> {
    if (!this.purchases) return null;

    try {
      const customerInfo = await this.purchases.getCustomerInfo();
      return this.mapCustomerInfo(customerInfo);
    } catch (error) {
      logger.warn('[Purchases] Failed to get customer info:', error);
      return null;
    }
  }

  /**
   * Sync RevenueCat entitlements with the local tier service.
   * Maps entitlement identifiers to subscription tiers.
   */
  async syncTierFromEntitlements(): Promise<void> {
    if (!this.purchases) return;

    try {
      const customerInfo = await this.purchases.getCustomerInfo();

      let newTier: SubscriptionTier = 'free';

      if (customerInfo.entitlements?.active?.enterprise?.isActive) {
        newTier = 'enterprise';
      } else if (customerInfo.entitlements?.active?.pro?.isActive) {
        newTier = 'pro';
      }

      const currentTier = tierService.getCurrentTier();
      if (newTier !== currentTier) {
        tierService.setCurrentTier(newTier);
        logger.log(`[Purchases] Tier synced: ${currentTier} → ${newTier}`);
      }
    } catch (error) {
      logger.warn('[Purchases] Tier sync failed:', error);
    }
  }

  /**
   * Get the management URL for the user to manage their subscription
   * (App Store / Play Store subscription settings).
   */
  async getManagementURL(): Promise<string | null> {
    const info = await this.getCustomerInfo();
    return info?.managementURL || null;
  }

  /** Check if RevenueCat is configured and available */
  isConfigured(): boolean {
    return this.purchases !== null;
  }

  /** Map RevenueCat CustomerInfo to our simplified type */
  private mapCustomerInfo(raw: any): CustomerInfo {
    const entitlements: CustomerInfo['entitlements'] = {};
    if (raw.entitlements?.active) {
      for (const [key, value] of Object.entries(raw.entitlements.active)) {
        const ent = value as any;
        entitlements[key] = {
          isActive: ent.isActive,
          productIdentifier: ent.productIdentifier,
        };
      }
    }

    return {
      activeSubscriptions: raw.activeSubscriptions || [],
      entitlements,
      managementURL: raw.managementURL || null,
    };
  }
}

export const purchaseService = new PurchaseServiceImpl();
