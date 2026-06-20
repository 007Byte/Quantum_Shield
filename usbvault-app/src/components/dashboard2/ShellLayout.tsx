/**
 * PL-010: Shared Shell Layout Wrapper
 *
 * Extracts the repeated View(screen) → ScrollView → View(shell) → [shellEdgeGlow
 * + Sidebar + View(mainCol) → TopBar + children] pattern that appears in all
 * 30 tab screens. Screens now wrap their unique content in <ShellLayout>.
 *
 * @example
 *   export default function SettingsScreen() {
 *     return (
 *       <ShellLayout>
 *         <Text>Settings content here</Text>
 *       </ShellLayout>
 *     );
 *   }
 *
 * @module components/dashboard2/ShellLayout
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { dashboardLayout, dashboardSpacing } from './styles';
import { webOnly } from '@/utils/webStyle';
import { useTheme } from '@/theme/engine';

interface ShellLayoutProps {
  children: React.ReactNode;
}

export function ShellLayout({ children }: ShellLayoutProps) {
  const { colorScheme } = useTheme();
  const isLight = colorScheme === 'light';

  return (
    <View style={styles.screen}>
      {/* Skip-to-content link for keyboard accessibility (WCAG 2.2 AA) */}
      <Text
        accessibilityRole="link"
        style={styles.skipLink}
        onPress={() => {
          if (typeof document !== 'undefined') {
            const main = document.getElementById('main-content');
            if (main) {
              main.focus();
              main.scrollIntoView();
            }
          }
        }}
      >
        Skip to main content
      </Text>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator
      >
        <View style={[styles.shell, isLight && styles.shellLight]}>
          <View style={[styles.shellEdgeGlow, isLight && styles.shellEdgeGlowLight]} />
          <Sidebar />
          <View style={styles.mainCol} nativeID="main-content" accessible>
            <TopBar />
            {children}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
  skipLink: {
    position: 'absolute',
    top: -100,
    left: 16,
    zIndex: 9999,
    backgroundColor: '#8B5CF6',
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '600',
    ...webOnly({
      // Becomes visible on focus
      transition: 'top 0.15s ease',
    }),
  } as any,
  pageScroll: {
    flex: 1,
    width: '100%',
    ...webOnly({ overflowY: 'auto' }),
  },
  pageContent: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    alignItems: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center',
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background:
        'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellLight: {
    borderColor: 'rgba(200,190,230,0.30)',
    backgroundColor: 'rgba(255,255,255,0.18)',
    ...webOnly({
      background:
        'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.12) 56%, rgba(255,255,255,0.18) 100%)',
      boxShadow:
        '0 0 0 1px rgba(200,190,230,0.18), 0 4px 24px rgba(124,58,237,0.08), inset 0 0 30px rgba(255,255,255,0.10)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(217,70,239,0.55)',
  },
  shellEdgeGlowLight: {
    backgroundColor: 'rgba(124,58,237,0.20)',
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
});
