import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  Modal,
} from 'react-native';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  testID?: string;
}

/**
 * LoadingOverlay - Full-screen overlay with centered spinner and optional message
 * Used for displaying loading states during async operations
 *
 * @param visible - Controls visibility of the overlay
 * @param message - Optional message text below the spinner
 */
export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  visible,
  message,
  testID,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      testID={testID}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ActivityIndicator
            size="large"
            color="#8B5CF6"
            testID="loading-spinner"
          />

          {message && (
            <Text style={styles.message}>{message}</Text>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 4, 18, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 12, 40, 0.85)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    paddingHorizontal: 32,
    paddingVertical: 40,
    minWidth: 200,
  },
  message: {
    marginTop: 16,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    fontWeight: '500',
  },
});
