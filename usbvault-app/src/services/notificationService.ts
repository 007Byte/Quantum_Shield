/**
 * Push Notification Service — expo-notifications integration
 *
 * Handles push notification permissions, token registration with the
 * Go server, and notification display/response handling.
 *
 * Security-relevant notifications:
 * - "New device login" alerts
 * - "Vault unlocked from new location" alerts
 * - Subscription status changes
 *
 * On web, notifications use the Web Notifications API.
 * On native, uses expo-notifications with APNs (iOS) and FCM (Android).
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

/** Notification payload from server */
interface NotificationData {
  type?: 'security_alert' | 'new_device' | 'subscription' | 'general';
  action?: string;
  [key: string]: unknown;
}

/** Permission status */
type PermissionStatus = 'granted' | 'denied' | 'undetermined';

class NotificationServiceImpl {
  private initialized = false;
  private pushToken: string | null = null;
  private permissionStatus: PermissionStatus = 'undetermined';
  private responseListener: { remove: () => void } | null = null;
  private receivedListener: { remove: () => void } | null = null;

  /**
   * Initialize the notification service.
   * Requests permission, gets push token, registers with server.
   * Should be called AFTER authentication (needs user context for server registration).
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // expo-notifications is not available on web (use Web Notifications API fallback)
    if (Platform.OS === 'web') {
      await this.initWeb();
      this.initialized = true;
      return;
    }

    try {
      const Notifications = require('expo-notifications');

      // Set notification handler for foreground notifications
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      // Request permission
      const { status } = await Notifications.requestPermissionsAsync();
      this.permissionStatus = status as PermissionStatus;

      if (status !== 'granted') {
        logger.log('[Notifications] Permission not granted:', status);
        this.initialized = true;
        return;
      }

      // Get push token
      const tokenData = await Notifications.getExpoPushTokenAsync();
      this.pushToken = tokenData.data;
      logger.log('[Notifications] Push token obtained');

      // Set up notification listeners
      this.receivedListener = Notifications.addNotificationReceivedListener(
        this.handleNotificationReceived
      );
      this.responseListener = Notifications.addNotificationResponseReceivedListener(
        this.handleNotificationResponse
      );

      this.initialized = true;
      logger.log('[Notifications] Initialized');
    } catch (error) {
      logger.warn('[Notifications] Init failed:', error);
      this.initialized = true;
    }
  }

  /**
   * Web fallback — use browser Notification API.
   */
  private async initWeb(): Promise<void> {
    if (typeof Notification === 'undefined') {
      logger.log('[Notifications] Web Notifications API not available');
      return;
    }

    const permission = await Notification.requestPermission();
    this.permissionStatus =
      permission === 'granted' ? 'granted' : permission === 'denied' ? 'denied' : 'undetermined';
    logger.log('[Notifications] Web permission:', permission);
  }

  /**
   * Register the push token with the backend server.
   * Called after successful authentication.
   */
  async registerWithServer(apiClient: any): Promise<void> {
    if (!this.pushToken) return;

    try {
      await apiClient.post('/api/v1/notify/register-device', {
        device_token: this.pushToken,
        platform: Platform.OS,
      });
      logger.log('[Notifications] Token registered with server');
    } catch (error) {
      logger.warn('[Notifications] Failed to register token with server:', error);
    }
  }

  /**
   * Unregister the push token from the backend server.
   * Called on logout to stop receiving notifications.
   */
  async unregisterFromServer(apiClient: any): Promise<void> {
    if (!this.pushToken) return;

    try {
      await apiClient.post('/api/v1/notify/unregister-device', {
        device_token: this.pushToken,
      });
      logger.log('[Notifications] Token unregistered from server');
    } catch (error) {
      logger.warn('[Notifications] Failed to unregister token:', error);
    }
  }

  /**
   * Schedule a local notification (no server needed).
   * Used for reminders, vault lock warnings, etc.
   */
  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: NotificationData
  ): Promise<void> {
    if (Platform.OS === 'web') {
      if (this.permissionStatus === 'granted' && typeof Notification !== 'undefined') {
        new Notification(title, { body, icon: '/assets/icon.png' });
      }
      return;
    }

    try {
      const Notifications = require('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        content: { title, body, data: data || {} },
        trigger: null, // Immediate
      });
    } catch (error) {
      logger.warn('[Notifications] Failed to schedule local notification:', error);
    }
  }

  /** Handle notification received while app is in foreground */
  private handleNotificationReceived = (notification: any) => {
    const data = notification?.request?.content?.data as NotificationData | undefined;
    logger.log('[Notifications] Received:', data?.type || 'general');
  };

  /** Handle user tapping on a notification */
  private handleNotificationResponse = (response: any) => {
    const data = response?.notification?.request?.content?.data as NotificationData | undefined;
    logger.log('[Notifications] User tapped:', data?.type || 'general');

    // Route based on notification type
    if (data?.type === 'security_alert' || data?.type === 'new_device') {
      // Could navigate to activity/security screen
      logger.log('[Notifications] Security alert tapped — user should review activity');
    }
  };

  /** Get current permission status */
  getPermissionStatus(): PermissionStatus {
    return this.permissionStatus;
  }

  /** Get the push token (if available) */
  getPushToken(): string | null {
    return this.pushToken;
  }

  /** Check if notifications are enabled */
  isEnabled(): boolean {
    return this.permissionStatus === 'granted';
  }

  /** Cleanup listeners */
  destroy(): void {
    this.receivedListener?.remove();
    this.responseListener?.remove();
    this.receivedListener = null;
    this.responseListener = null;
  }
}

export const notificationService = new NotificationServiceImpl();
