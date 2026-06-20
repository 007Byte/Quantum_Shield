import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { logger } from '@/utils/logger';
import { captureException } from '@/utils/sentry';

/**
 * Higher-order component that wraps a screen in an ErrorBoundary.
 *
 * Use this on high-risk screens (those that make async calls, process
 * crypto, or interact with USB state) so a crash in one screen doesn't
 * propagate to the layout or other screens.
 *
 * @example
 * export default withErrorBoundary(DashboardScreen, 'Dashboard');
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  screenName: string
): React.FC<P> {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    logger.error(`[ErrorBoundary:${screenName}] Uncaught render error:`, error);
    captureException(error, {
      tags: { screen: screenName },
      componentStack: errorInfo.componentStack,
    });
  };

  const WithErrorBoundaryWrapper: React.FC<P> = props => (
    <ErrorBoundary onError={handleError}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundaryWrapper.displayName = `withErrorBoundary(${screenName})`;

  return WithErrorBoundaryWrapper;
}
