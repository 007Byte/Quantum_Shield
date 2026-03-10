import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { InAppModal, useInAppModal } from '@/components/common';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardColors } from '@/components/dashboard2/styles';
import { AccountSection } from '@/components/settings/AccountSection';
import { SecuritySection } from '@/components/settings/SecuritySection';
import { NotificationSection } from '@/components/settings/NotificationSection';
import { PrivacySection } from '@/components/settings/PrivacySection';
import { AdvancedSecuritySection } from '@/components/settings/AdvancedSecuritySection';
import { HelpSection } from '@/components/settings/HelpSection';
import { AboutSection } from '@/components/settings/AboutSection';
import { styles } from '@/components/settings/styles';
import type { PressableState } from '@/types/utilities';

export default function SettingsScreen() {
  const { modal, showConfirm, showError } = useInAppModal();
  const router = useRouter();
  const authState = useAuthStore((state) => ({
    email: state.email,
    subscriptionTier: state.subscriptionTier,
  }));
  const logout = useAuthStore((state) => state.logout);
  const lockVault = useAuthStore((state) => state.lockVault);

  const handleLogout = () => {
    showConfirm(
      'Sign Out',
      'Are you sure you want to sign out?',
      async () => {
        try {
          await logout();
          router.replace('/(auth)/login');
        } catch (error) {
          showError('Error', 'Failed to sign out. Please try again.');
        }
      },
      'Sign Out',
      'destructive',
    );
  };

  const handleLockVault = () => {
    lockVault();
    router.replace('/(auth)/login');
  };

  return (
    <View style={styles.screen}>
      <InAppModal config={modal} />
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.settingsArea}>
              <View style={styles.backRow}>
                {/* PH4-FIX: Replaced any with proper PressableState type */}
                <Pressable
                  onPress={() => router.push('/(tabs)/dashboard' as any)}
                  style={(state: PressableState) => [styles.backBtn, state.hovered && styles.backBtnHover]}
                >
                  <Feather name="arrow-left" size={20} color={dashboardColors.cyan} />
                  <Text style={styles.backLabel}>Dashboard</Text>
                </Pressable>
              </View>

              <Text style={styles.pageTitle}>Settings</Text>

              <View style={styles.columnsRow}>
                <View style={styles.leftCol}>
                  <PrivacySection />
                  <SecuritySection onLockVault={handleLockVault} />
                  <NotificationSection />
                </View>

                <View style={styles.rightCol}>
                  <AccountSection
                    email={authState.email}
                    subscriptionTier={authState.subscriptionTier}
                  />
                  <AdvancedSecuritySection />
                  <HelpSection />
                  <AboutSection onSignOut={handleLogout} />
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
