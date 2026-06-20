/**
 * Mobile Sidebar Drawer
 *
 * Modal overlay that slides Sidebar content from the left on mobile.
 * Auto-closes on route navigation.
 *
 * @module components/dashboard2/MobileSidebarDrawer
 */

import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { usePathname } from 'expo-router';
import { Sidebar } from './Sidebar';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useLanguage } from '@/hooks/useLanguage';

export function MobileSidebarDrawer() {
  const isOpen = useSidebarStore(s => s.isDrawerOpen);
  const setDrawerOpen = useSidebarStore(s => s.setDrawerOpen);
  const pathname = usePathname();
  const { t } = useLanguage();

  // Auto-close drawer on navigation
  useEffect(() => {
    if (isOpen) setDrawerOpen(false);
  }, [pathname]);

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      onRequestClose={() => setDrawerOpen(false)}
    >
      <View style={styles.overlay} accessibilityViewIsModal={true}>
        {/* Backdrop — tap to close */}
        <Pressable
          style={styles.backdrop}
          onPress={() => setDrawerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={t('sidebar.closeNavMenu') || 'Close navigation menu'}
        />

        {/* Drawer panel */}
        <View style={styles.drawer}>
          <Sidebar />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  drawer: {
    width: 280,
    height: '100%',
    backgroundColor: 'transparent',
    borderRightWidth: 1,
    borderRightColor: 'rgba(139,92,246,0.3)',
  },
});
