import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { logger } from '@/utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error: Error) {
    return { hasError: true };
  }

  componentDidCatch(err: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error: err,
      errorInfo,
    });

    // Call optional onError callback
    if (this.props.onError) {
      this.props.onError(err, errorInfo);
    }

    // Log error details to console for debugging
    logger.error('ErrorBoundary caught an error:', err);
    logger.error('Error Info:', errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default dark cyberpunk themed error display
      return (
        <View style={styles.container}>
          <View style={styles.contentWrap}>
            <View style={styles.iconContainer}>
              <Feather name="alert-triangle" size={48} color="#FF6B6B" />
            </View>

            <Text style={styles.errorTitle}>Something went wrong</Text>

            <Text style={styles.errorMessage}>
              An unexpected error occurred. Please try again or contact support if the problem
              persists.
            </Text>

            {this.state.error && (
              <View style={styles.errorDetailsContainer}>
                <Text style={styles.errorLabel}>Error Details:</Text>
                <Text style={styles.errorDetails}>{this.state.error.toString()}</Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
              onPress={this.handleRetry}
            >
              <Feather name="refresh-cw" size={18} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.supportButton,
                pressed && styles.supportButtonPressed,
              ]}
              onPress={() => {
                // Navigate to support or open contact
                // Support channel to be implemented
              }}
            >
              <Feather name="help-circle" size={18} color="#22D3EE" />
              <Text style={styles.supportButtonText}>Get Help</Text>
            </Pressable>
          </View>

          {/* Background gradient glow effects */}
          <View style={styles.bgGlowTop} />
          <View style={styles.bgGlowBottom} />
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    backgroundColor: '#070412',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ background: 'linear-gradient(135deg, #070412 0%, #1a0f2e 50%, #0a0519 100%)' }),
    position: 'relative',
    overflow: 'hidden',
  },

  contentWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    maxWidth: 520,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(18,12,40,0.7)',
    ...webOnly({
      backdropFilter: 'blur(16px)',
      background: 'linear-gradient(160deg, rgba(139,92,246,0.15), rgba(34,211,238,0.08))',
      boxShadow:
        '0 10px 40px rgba(0,0,0,0.6), 0 0 24px rgba(139,92,246,0.25), inset 0 0 26px rgba(139,92,246,0.15)',
    }),
    zIndex: 10,
  },

  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    ...webOnly({ boxShadow: '0 0 24px rgba(255,107,107,0.3)' }),
  },

  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },

  errorMessage: {
    fontSize: 16,
    color: 'rgba(245,243,255,0.75)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },

  errorDetailsContainer: {
    width: '100%',
    marginBottom: 28,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,107,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.2)',
  },

  errorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  errorDetails: {
    fontSize: 13,
    color: 'rgba(245,243,255,0.6)',
    fontFamily: 'monospace',
    lineHeight: 18,
  },

  retryButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    ...webOnly({
      transition: 'all 0.2s ease',
      boxShadow: '0 0 20px rgba(139,92,246,0.4)',
    }),
  },

  retryButtonPressed: {
    backgroundColor: 'rgba(139,92,246,0.95)',
    ...webOnly({ boxShadow: '0 0 28px rgba(139,92,246,0.6)' }),
  },

  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  supportButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    ...webOnly({ transition: 'all 0.2s ease' }),
  },

  supportButtonPressed: {
    backgroundColor: 'rgba(34,211,238,0.1)',
    borderColor: 'rgba(34,211,238,0.8)',
  },

  supportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22D3EE',
  },

  bgGlowTop: {
    position: 'absolute',
    top: -180,
    left: '50%',
    width: 600,
    height: 400,
    borderRadius: 300,
    marginLeft: -300,
    backgroundColor: 'rgba(139,92,246,0.2)',
    ...webOnly({ filter: 'blur(120px)' }),
    pointerEvents: 'none',
  },

  bgGlowBottom: {
    position: 'absolute',
    bottom: -150,
    right: -100,
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: 'rgba(34,211,238,0.15)',
    ...webOnly({ filter: 'blur(100px)' }),
    pointerEvents: 'none',
  },
});
