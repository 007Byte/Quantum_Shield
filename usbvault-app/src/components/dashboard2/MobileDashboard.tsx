import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import {
  dashboardColors,
  dashboardSpacing,
} from './styles';

/**
 * MobileDashboard - Mobile-optimized dashboard layout
 * Displays stacked card layout with security score, quick actions, activity, and stats
 */
export const MobileDashboard: React.FC = () => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'encrypt':
        router.push('/(tabs)/encrypt' as any);
        break;
      case 'decrypt':
        router.push('/(tabs)/decrypt' as any);
        break;
      case 'share':
        router.push('/(tabs)/share' as any);
        break;
      case 'messages':
        router.push('/(tabs)/messages' as any);
        break;
    }
  };

  // Mock data for activity
  const recentActivity = [
    { id: '1', type: 'encrypt', title: 'File encrypted', time: '2 hours ago' },
    { id: '2', type: 'share', title: 'Shared with John', time: '4 hours ago' },
    { id: '3', type: 'decrypt', title: 'File decrypted', time: '1 day ago' },
    { id: '4', type: 'sync', title: 'Vault synced', time: '2 days ago' },
    { id: '5', type: 'update', title: 'Security updated', time: '3 days ago' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Header with Menu */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>USBVault</Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.menuButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => setMenuOpen(!menuOpen)}
        >
          <Feather name="menu" size={24} color={dashboardColors.textPrimary} />
        </Pressable>
      </View>

      {/* Security Score Card */}
      <View style={styles.securityCard}>
        <View style={styles.securityHeader}>
          <Text style={styles.securityLabel}>Security Score</Text>
          <Feather name="shield" size={20} color={dashboardColors.cyan} />
        </View>
        <View style={styles.securityScoreContainer}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreText}>92</Text>
            <Text style={styles.scoreLabel}>Excellent</Text>
          </View>
          <View style={styles.scoreDetails}>
            <View style={styles.scoreDetailRow}>
              <View
                style={[
                  styles.scoreIndicator,
                  { backgroundColor: dashboardColors.green },
                ]}
              />
              <Text style={styles.scoreDetailText}>Encryption: Active</Text>
            </View>
            <View style={styles.scoreDetailRow}>
              <View
                style={[
                  styles.scoreIndicator,
                  { backgroundColor: dashboardColors.green },
                ]}
              />
              <Text style={styles.scoreDetailText}>PQC Protection: On</Text>
            </View>
            <View style={styles.scoreDetailRow}>
              <View
                style={[
                  styles.scoreIndicator,
                  { backgroundColor: dashboardColors.green },
                ]}
              />
              <Text style={styles.scoreDetailText}>2FA Enabled</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Actions Grid */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => handleQuickAction('encrypt')}
          >
            <Feather
              name="lock"
              size={24}
              color={dashboardColors.cyan}
            />
            <Text style={styles.actionButtonText}>Encrypt</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => handleQuickAction('decrypt')}
          >
            <Feather
              name="unlock"
              size={24}
              color={dashboardColors.cyan}
            />
            <Text style={styles.actionButtonText}>Decrypt</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => handleQuickAction('share')}
          >
            <Feather
              name="share-2"
              size={24}
              color={dashboardColors.cyan}
            />
            <Text style={styles.actionButtonText}>Share</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => handleQuickAction('messages')}
          >
            <Feather
              name="mail"
              size={24}
              color={dashboardColors.cyan}
            />
            <Text style={styles.actionButtonText}>Messages</Text>
          </Pressable>
        </View>
      </View>

      {/* Recent Activity Card */}
      <View style={styles.activityCard}>
        <View style={styles.activityHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <Feather name="clock" size={18} color={dashboardColors.cyan} />
        </View>
        <View style={styles.activityList}>
          {recentActivity.map((item, index) => (
            <View
              key={item.id}
              style={[
                styles.activityItem,
                index !== recentActivity.length - 1 && styles.activityItemBorder,
              ]}
            >
              <View style={styles.activityIconContainer}>
                <Feather
                  name={
                    item.type === 'encrypt'
                      ? 'lock'
                      : item.type === 'decrypt'
                      ? 'unlock'
                      : item.type === 'share'
                      ? 'share-2'
                      : item.type === 'sync'
                      ? 'refresh-cw'
                      : 'shield'
                  }
                  size={16}
                  color={dashboardColors.cyan}
                />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>{item.title}</Text>
                <Text style={styles.activityTime}>{item.time}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Vault Stats Card */}
      <View style={styles.statsCard}>
        <Text style={styles.sectionTitle}>Vault Stats</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <View style={styles.statIconContainer}>
              <Feather name="file" size={20} color={dashboardColors.cyan} />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statNumber}>1,247</Text>
              <Text style={styles.statLabel}>Files</Text>
            </View>
          </View>

          <View style={styles.statItem}>
            <View style={styles.statIconContainer}>
              <Feather name="hard-drive" size={20} color={dashboardColors.cyan} />
            </View>
            <View style={styles.statContent}>
              <Text style={styles.statNumber}>2.4 GB</Text>
              <Text style={styles.statLabel}>Storage</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Bottom spacing for navigation tab bar */}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(15, 10, 40, 0.4)',
  },
  contentContainer: {
    paddingHorizontal: dashboardSpacing.md,
    paddingTop: dashboardSpacing.md,
    paddingBottom: dashboardSpacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: dashboardSpacing.lg,
    paddingBottom: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.15)',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
  },
  menuButton: {
    padding: 8,
  },

  // Security Card
  securityCard: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.lg,
  },
  securityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: dashboardSpacing.lg,
  },
  securityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  securityScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.lg,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderWidth: 2,
    borderColor: dashboardColors.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 36,
    fontWeight: '700',
    color: dashboardColors.cyan,
  },
  scoreLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 4,
  },
  scoreDetails: {
    flex: 1,
    gap: 8,
  },
  scoreDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  scoreDetailText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },

  // Actions Section
  actionsSection: {
    marginBottom: dashboardSpacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: dashboardSpacing.md,
  },
  actionButton: {
    flex: 0,
    width: '48%',
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    paddingVertical: dashboardSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
  },
  actionButtonPressed: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: 'rgba(139,92,246,0.4)',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },

  // Activity Card
  activityCard: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.lg,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: dashboardSpacing.lg,
  },
  activityList: {
    gap: 0,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
  },
  activityItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.1)',
  },
  activityIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
  },

  // Stats Card
  statsCard: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.lg,
  },
  statsGrid: {
    gap: dashboardSpacing.md,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    backgroundColor: 'rgba(34, 211, 238, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.15)',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statContent: {
    flex: 1,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
});
