import React from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface ErrorRetryProps {
  error: string;
  onRetry: () => void;
  retrying?: boolean;
  testID?: string;
}

/**
 * ErrorRetry - Inline error display with retry button
 * Compact error component for showing errors inline in lists or forms
 *
 * @param error - Error message to display
 * @param onRetry - Callback when retry button is pressed
 * @param retrying - Whether currently retrying (shows loading state)
 */
export const ErrorRetry: React.FC<ErrorRetryProps> = ({
  error,
  onRetry,
  retrying = false,
  testID,
}) => {
  return (
    <View style={[styles.container, testID && ({ testID } as any)]}>
      <View style={styles.content}>
        <Feather name="alert-circle" size={18} color="#F59E0B" style={{ marginRight: 12 }} />
        <Text style={styles.errorText}>{error}</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.retryButton,
          pressed && styles.retryButtonPressed,
          retrying && styles.retryButtonDisabled,
        ]}
        onPress={onRetry}
        disabled={retrying}
        testID="error-retry-button"
      >
        {retrying ? (
          <ActivityIndicator size="small" color="#F59E0B" />
        ) : (
          <>
            <Feather name="refresh-cw" size={14} color="#F59E0B" />
            <Text style={styles.retryButtonText}>Retry</Text>
          </>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  errorText: {
    fontSize: 13,
    color: 'rgba(245, 158, 11, 0.9)',
    fontWeight: '500',
    flex: 1,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  retryButtonPressed: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '600',
  },
});
