import React, { useState, useEffect } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

/**
 * OfflineIndicator - Banner that displays when device is offline
 * Automatically hides when connection is restored
 */
export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(true);
  const slideAnim = new Animated.Value(isOnline ? 100 : 0);

  useEffect(() => {
    // Initial check
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }

    const handleOnline = () => {
      setIsOnline(true);
      Animated.timing(slideAnim, {
        toValue: 100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    };

    const handleOffline = () => {
      setIsOnline(false);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return undefined;
  }, [slideAnim]);

  if (isOnline) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: slideAnim.interpolate({
            inputRange: [0, 100],
            outputRange: [0, 1],
          }),
          transform: [
            {
              translateY: slideAnim.interpolate({
                inputRange: [0, 100],
                outputRange: [-60, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.content}>
        <Feather name="wifi-off" size={16} color="#F59E0B" style={{ marginRight: 10 }} />
        <Text style={styles.message}>You're offline. Changes will sync when reconnected.</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '500',
    textAlign: 'center',
    flex: 1,
  },
});
