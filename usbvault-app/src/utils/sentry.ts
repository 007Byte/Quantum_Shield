/**
 * Sentry error monitoring initialization and helpers.
 *
 * Initializes Sentry with the DSN from EXPO_PUBLIC_SENTRY_DSN.
 * Safe to import anywhere — init is a no-op when DSN is not configured.
 */
import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';
const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

let initialized = false;

export function initSentry(): void {
  if (initialized || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    debug: IS_DEV,
    enabled: !IS_DEV, // Only send events in production
    environment: IS_DEV ? 'development' : 'production',
    tracesSampleRate: 0.2, // 20% of transactions for performance monitoring
    attachStacktrace: true,
    // Strip sensitive data from breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'http' && breadcrumb.data) {
        delete breadcrumb.data.request_body;
        // Redact Authorization header values
        const headers = breadcrumb.data.headers as Record<string, unknown> | undefined;
        if (headers?.Authorization) {
          headers.Authorization = '[REDACTED]';
        }
      }
      return breadcrumb;
    },
    // Strip sensitive data from events before sending
    beforeSend(event) {
      // Remove any PII from user context beyond what we explicitly set
      if (event.user) {
        delete event.user.ip_address;
      }
      // Redact any auth tokens from breadcrumbs
      if (event.breadcrumbs) {
        for (const bc of event.breadcrumbs) {
          const headers = bc.data?.headers as Record<string, unknown> | undefined;
          if (headers?.Authorization) {
            headers.Authorization = '[REDACTED]';
          }
        }
      }
      return event;
    },
  });

  Sentry.setTag('platform', Platform.OS);
  initialized = true;
}

/** Set user context after successful login. */
export function setSentryUser(userId: string, email?: string): void {
  if (!initialized) return;
  Sentry.setUser({ id: userId, email });
}

/** Clear user context on logout. */
export function clearSentryUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}

/** Add a navigation breadcrumb. */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = 'info'
): void {
  if (!initialized) return;
  Sentry.addBreadcrumb({ category, message, data, level });
}

/** Capture an exception with optional context. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  if (context) {
    Sentry.withScope(scope => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/** Capture a message with severity level. */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}

/** Re-export Sentry's ErrorBoundary wrapper for use in _layout. */
export { Sentry };
