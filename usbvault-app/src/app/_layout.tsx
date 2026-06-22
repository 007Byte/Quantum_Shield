// FIX: Import platform setup FIRST — must run before any crypto/Buffer usage
import '@/platformSetup';

import { useEffect, useCallback } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useAppProtection } from '@/services/security/appProtection';
import { checkDeviceIntegrity } from '@/services/security/deviceIntegrity';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
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

// Background images — independent per theme
const BACKGROUND_DARK = require('../../assets/background.png');
const BACKGROUND_LIGHT = require('../../assets/background-light.png');

/**
 * Resolve a Metro asset require() result into a URL string.
 */
function resolveAssetUri(asset: unknown): string | null {
  try {
    if (typeof asset === 'number') {
      const { getAssetByID } = require('react-native-web/dist/modules/AssetRegistry');
      const meta = getAssetByID(asset);
      if (meta) {
        return meta.httpServerLocation + '/' + meta.name + '.' + meta.type;
      }
    } else if (typeof asset === 'string') {
      return asset;
    } else if (asset && typeof asset === 'object' && 'uri' in asset) {
      return (asset as { uri: string }).uri;
    }
  } catch {
    // silent fallback
  }
  return null;
}

/**
 * On web, inject the background image as a CSS `body::before` pseudo-element.
 * Switches between dark/light background images based on theme.
 *
 * Why not use React Native's ImageBackground or CSS background-image on a View?
 * react-native-web applies `z-index: 0` and `position: relative` to EVERY View,
 * creating stacking contexts that trap any background behind opaque layers.
 * The only reliable approach is to place the image outside React's DOM tree entirely.
 */
function useWebBackground() {
  const colorScheme = useThemeStore(s => s.colorScheme);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const bgAsset = colorScheme === 'light' ? BACKGROUND_LIGHT : BACKGROUND_DARK;
    const uri = resolveAssetUri(bgAsset);
    if (!uri) return;

    // Overlay tint: dark mode gets a subtle dark veil, light mode gets a subtle white veil
    const overlayColor =
      colorScheme === 'light' ? 'rgba(237, 232, 245, 0.08)' : 'rgba(5, 2, 15, 0.08)';

    const styleId = 'usbvault-global-bg';
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }

    el.textContent = `
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
        transition: background-image 0.3s ease;
      }
      body::after {
        content: '';
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: ${overlayColor};
        z-index: 0;
        pointer-events: none;
      }
      #root {
        position: relative;
        z-index: 1;
      }
    `;

    return () => {
      // Only remove on unmount, not on theme change
    };
  }, [colorScheme]);
}

export default function RootLayout() {
  const checkAuth = useAuthStore(state => state.checkAuth);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const lockVault = useAuthStore(state => state.lockVault);
  const colorScheme = useThemeStore(s => s.colorScheme);

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
      checkDeviceIntegrity()
        .then(result => {
          if (result.isCompromised) {
            logger.warn('[RootLayout] Device integrity check failed:', result.riskLevel);
          }
        })
        .catch((err: Error) => {
          logger.error('[RootLayout] Device integrity check error:', err);
        });
    }
  }, []);

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        logger.error('[RootLayout] Uncaught error:', error);
        logger.error('[RootLayout] Component stack:', errorInfo);
      }}
    >
      <GestureHandlerRootView style={styles.container}>
        {/* On native only: absolutely-positioned Image (CSS pseudo-elements don't exist) */}
        {Platform.OS !== 'web' && (
          <>
            <Image
              source={colorScheme === 'light' ? BACKGROUND_LIGHT : BACKGROUND_DARK}
              resizeMode="cover"
              style={styles.backgroundImage}
            />
            <View
              pointerEvents="none"
              style={[styles.nativeOverlay, colorScheme === 'light' && styles.nativeOverlayLight]}
            />
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
    </ErrorBoundary>
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
  nativeOverlayLight: {
    backgroundColor: 'rgba(237, 232, 245, 0.08)',
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
