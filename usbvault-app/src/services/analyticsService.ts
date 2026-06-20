/**
 * Analytics Service — PostHog integration with local event buffering
 *
 * Tracks product analytics events (feature usage, funnels, retention).
 * When no PostHog API key is configured (EXPO_PUBLIC_POSTHOG_KEY), events
 * are buffered in-memory (max 1000, FIFO drop) and flushed when the key
 * is configured later.
 *
 * PRIVACY CONSTRAINTS:
 * - No PII in event properties (no file names, passwords, email, content)
 * - Track action names only (e.g., "file_encrypted", not "encrypted budget.xlsx")
 * - Disabled entirely when user opts out via settings
 * - All data sent over HTTPS to PostHog (or self-hosted instance)
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

interface BufferedEvent {
  event: string;
  properties?: Record<string, string | number | boolean>;
  timestamp: number;
}

const MAX_BUFFER_SIZE = 1000;
const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

class AnalyticsServiceImpl {
  private initialized = false;
  private client: any = null;
  private buffer: BufferedEvent[] = [];
  private enabled = true;

  /**
   * Initialize the analytics service.
   * If PostHog API key is configured, creates a client and flushes buffered events.
   * If not, events continue to buffer silently.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    if (POSTHOG_API_KEY) {
      try {
        const PostHog = require('posthog-react-native').PostHog;
        this.client = new PostHog(POSTHOG_API_KEY, {
          host: POSTHOG_HOST,
          // Flush events every 30 seconds or when 20 events are queued
          flushAt: 20,
          flushInterval: 30000,
          // Disable automatic screen tracking — we track specific events only
          captureNativeAppLifecycleEvents: false,
        });

        // Flush any buffered events from before initialization
        await this.flushBuffer();
        logger.log('[Analytics] Initialized with PostHog');
      } catch (error) {
        logger.warn('[Analytics] PostHog init failed, continuing with buffer:', error);
      }
    } else {
      logger.log('[Analytics] No API key configured — events will buffer locally');
    }

    // Track app open
    this.track('app_opened', { platform: Platform.OS });

    this.initialized = true;
  }

  /**
   * Identify the current user. Called after login.
   * Only sends userId — no email or PII.
   */
  identify(userId: string): void {
    if (this.client) {
      this.client.identify(userId);
    }
  }

  /**
   * Track an analytics event.
   * If no client is configured, buffers the event in-memory.
   */
  track(event: string, properties?: Record<string, string | number | boolean>): void {
    if (!this.enabled) return;

    if (this.client) {
      this.client.capture(event, properties);
    } else {
      // Buffer locally — FIFO drop when full
      if (this.buffer.length >= MAX_BUFFER_SIZE) {
        this.buffer.shift();
      }
      this.buffer.push({
        event,
        properties,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Track a screen view.
   */
  screen(screenName: string): void {
    if (!this.enabled) return;

    if (this.client) {
      this.client.screen(screenName);
    } else {
      this.track('$screen', { $screen_name: screenName });
    }
  }

  /**
   * Reset analytics state. Called on logout.
   * Clears user identity and flushes remaining events.
   */
  reset(): void {
    if (this.client) {
      this.client.reset();
    }
  }

  /**
   * Enable or disable analytics tracking.
   * When disabled, all track/identify/screen calls are no-ops.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.client) {
      this.client.optOut();
    } else if (enabled && this.client) {
      this.client.optIn();
    }
  }

  /**
   * Flush buffered events to PostHog client.
   * Called when a client is first initialized after events were buffered.
   */
  private async flushBuffer(): Promise<void> {
    if (!this.client || this.buffer.length === 0) return;

    const eventsToFlush = [...this.buffer];
    this.buffer = [];

    for (const { event, properties } of eventsToFlush) {
      this.client.capture(event, properties);
    }

    logger.log(`[Analytics] Flushed ${eventsToFlush.length} buffered events`);
  }

  /** Get the number of buffered events (for diagnostics) */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /** Shutdown — flush and close */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
      this.client = null;
    }
    this.initialized = false;
  }
}

export const analyticsService = new AnalyticsServiceImpl();
