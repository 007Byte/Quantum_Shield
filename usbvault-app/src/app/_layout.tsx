// FIX: Import platform setup FIRST — must run before any crypto/Buffer usage
import '@/platformSetup';

import { useEffect, useCallback } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useAuthStore } from '@/stores/authStore';
import { useAppProtection } from '@/services/security/appProtection';
import { checkDeviceIntegrity } from '@/services/security/deviceIntegrity';
import { logger } from '@/utils/logger';

/**
 * Custom navigation theme with transparent background.
 * React Navigation's default theme applies `rgb(242, 242, 242)` as an inline
 * backgroundColor on its internal container View, which blocks our background image.
 */
const TransparentTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: 'transparent',
  },
};

// Single source of truth: the canonical project assets folder
const BACKGROUND_IMAGE = require('../../assets/background.png');

/**
 * On web, inject the background image as a CSS `body::before` pseudo-element.
 *
 * Why not use React Native's ImageBackground or CSS background-image on a View?
 * react-native-web applies `z-index: 0` and `position: relative` to EVERY View,
 * creating stacking contexts that trap any background behind opaque layers.
 * The only reliable approach is to place the image outside React's DOM tree entirely.
 */
function useWebBackground() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // Resolve the Metro asset URI from the require() result
    let uri: string | null = null;
    try {
      if (typeof BACKGROUND_IMAGE === 'number') {
        const { getAssetByID } = require('react-native-web/dist/modules/AssetRegistry');
        const asset = getAssetByID(BACKGROUND_IMAGE);
        if (asset) {
          uri = asset.httpServerLocation + '/' + asset.name + '.' + asset.type;
        }
      } else if (typeof BACKGROUND_IMAGE === 'string') {
        uri = BACKGROUND_IMAGE;
      } else if (BACKGROUND_IMAGE?.uri) {
        uri = BACKGROUND_IMAGE.uri;
      }
    } catch {
      // silent fallback
    }

    if (!uri) return;

    const styleId = 'usbvault-global-bg';
    // Don't inject twice on hot reload
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      body::before {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-image: url("${uri}");
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        z-index: 0;
        pointer-events: none;
      }
      /* Subtle dark overlay on top of the image */
      body::after {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(5, 2, 15, 0.08);
        z-index: 0;
        pointer-events: none;
      }
      /* Make sure #root sits above the pseudo-elements */
      #root {
        position: relative;
        z-index: 1;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);
}

export default function RootLayout() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const lockVault = useAuthStore((state) => state.lockVault);

  useWebBackground();

  // RM-005: Auto-lock callback — locks vault and clears sensitive state
  const handleAutoLock = useCallback(() => {
    logger.log('[RootLayout] Auto-lock triggered — locking vault');
    lockVault();
  }, [lockVault]);

  // RM-005: Initialize app protection (auto-lock, clipboard clearing, screenshot prevention)
  useAppProtection(handleAutoLock, {
    autoLockTimeoutMs: 300000, // 5 minutes
    clearClipboardMs: 30000, // 30 seconds
    preventScreenshots: true,
    lockOnBackground: true,
  });

  useEffect(() => {
    checkAuth();

    // RM-005: Run device integrity check on app startup
    if (Platform.OS !== 'web') {
      checkDeviceIntegrity().then((result) => {
        if (result.isCompromised) {
          logger.warn('[RootLayout] Device integrity check failed:', result.riskLevel);
        }
      }).catch((err: Error) => {
        logger.error('[RootLayout] Device integrity check error:', err);
      });
    }
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* On native only: absolutely-positioned Image (CSS pseudo-elements don't exist) */}
      {Platform.OS !== 'web' && (
        <>
          <Image
            source={BACKGROUND_IMAGE}
            resizeMode="cover"
            style={styles.backgroundImage}
          />
          <View pointerEvents="none" style={styles.nativeOverlay} />
        </>
      )}

      {/* ThemeProvider overrides React Navigation's default rgb(242,242,242) background */}
      <ThemeProvider value={TransparentTheme}>
        <View style={styles.appShell}>
          <SafeAreaProvider style={styles.provider}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: {
                  backgroundColor: 'transparent',
                },
              }}
            >
              {isAuthenticated ? (
                <>
                  <Stack.Screen name="(tabs)" />
                </>
              ) : (
                <>
                  <Stack.Screen name="(auth)" />
                </>
              )}
            </Stack>
          </SafeAreaProvider>
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Transparent on web so body::before shows through.
    // Dark fallback on native where the Image component handles the background.
    backgroundColor: Platform.OS === 'web' ? 'transparent' : '#0B0617',
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  nativeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 2, 15, 0.08)',
    zIndex: 1,
  },
  appShell: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  provider: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
