/**
 * Classroom - Education Screen (CLASSROOM-01)
 *
 * Educational course modules for learning about encryption, security,
 * and QAV best practices. Features progress tracking, module cards
 * with status indicators, and interactive content structure.
 * Uses glassmorphic design consistent with Dashboard 2 theme.
 */

import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
// useState available for future interactive features
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
  webOnlyTransition,
} from '@/components/dashboard2/styles';

// ── Module Type ────────────────────────────────────────────────

interface CourseModule {
  id: string;
  icon: any;
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'locked';
  estimatedTime: string;
}

// ── Course Modules Data ────────────────────────────────────────

const courseModules: CourseModule[] = [
  {
    id: 'encryption-fundamentals',
    icon: 'lock',
    title: 'Encryption Fundamentals',
    description: 'Understanding symmetric and asymmetric encryption',
    status: 'completed',
    estimatedTime: '~10 min',
  },
  {
    id: 'post-quantum-crypto',
    icon: 'shield',
    title: 'Post-Quantum Cryptography',
    description: 'Why PQC matters and how QAV implements it',
    status: 'completed',
    estimatedTime: '~10 min',
  },
  {
    id: 'password-security',
    icon: 'key',
    title: 'Password Security',
    description: 'Creating and managing strong passwords',
    status: 'completed',
    estimatedTime: '~10 min',
  },
  {
    id: 'usb-security',
    icon: 'disc',
    title: 'USB Security Best Practices',
    description: 'Safe USB handling and vault management',
    status: 'in-progress',
    estimatedTime: '~10 min',
  },
  {
    id: 'zero-trust',
    icon: 'eye-off',
    title: 'Zero-Trust Architecture',
    description: 'Implementing zero-trust security principles',
    status: 'locked',
    estimatedTime: '~10 min',
  },
  {
    id: 'data-recovery',
    icon: 'save',
    title: 'Data Recovery & Backup',
    description: 'Backup strategies and disaster recovery',
    status: 'locked',
    estimatedTime: '~10 min',
  },
  {
    id: 'threat-detection',
    icon: 'alert-triangle',
    title: 'Threat Detection',
    description: 'Identifying and responding to security threats',
    status: 'locked',
    estimatedTime: '~10 min',
  },
  {
    id: 'advanced-forensics',
    icon: 'search',
    title: 'Advanced Forensics',
    description: 'Digital forensics and trace analysis',
    status: 'locked',
    estimatedTime: '~10 min',
  },
];

// ── Main Component ─────────────────────────────────────────────

export default function ClassroomScreen() {
  const { modal, showSuccess } = useInAppModal();

  const completedCount = courseModules.filter(m => m.status === 'completed').length;
  const totalModules = courseModules.length;
  const progressPercentage = (completedCount / totalModules) * 100;

  const handleModulePress = () => {
    showSuccess('Module', 'Interactive lessons coming in a future update');
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />
          <Sidebar />
          <View style={styles.mainCol}>
            <TopBar />
            <View style={styles.contentArea}>
              {/* Page Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Classroom</Text>
                <Text style={styles.subtitle}>
                  Learn about encryption, security, and QAV best practices
                </Text>
              </View>

              {/* Progress Card */}
              <View style={[styles.progressCard, glassPanelBase, webOnlyGlass]}>
                <Text style={styles.progressTitle}>Your Progress</Text>

                {/* Progress Bar */}
                <View style={styles.progressBarContainer}>
                  <View style={styles.progressBarBackground}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${progressPercentage}%` },
                      ]}
                    />
                  </View>
                </View>

                <Text style={styles.progressText}>
                  {completedCount} of {totalModules} modules completed
                </Text>
              </View>

              {/* Course Modules Section */}
              <View style={styles.modulesSection}>
                <Text style={styles.sectionTitle}>Course Modules</Text>
                <View style={styles.modulesList}>
                  {courseModules.map((module) => (
                    <Pressable
                      key={module.id}
                      onPress={handleModulePress}
                      style={(state: any) => [
                        styles.moduleCard,
                        glassPanelBase,
                        webOnlyGlass,
                        state.hovered && styles.moduleCardHovered,
                      ]}
                    >
                      {/* Module Icon and Status */}
                      <View style={styles.moduleHeader}>
                        <View style={styles.moduleIconContainer}>
                          <Feather
                            name={module.icon}
                            size={24}
                            color={dashboardColors.cyan}
                          />
                        </View>
                        <View style={styles.moduleInfo}>
                          <Text style={styles.moduleTitle}>{module.title}</Text>
                          <Text style={styles.moduleDescription}>
                            {module.description}
                          </Text>
                        </View>
                        <View style={styles.statusContainer}>
                          {module.status === 'completed' && (
                            <View style={styles.completedBadge}>
                              <Feather
                                name="check-circle"
                                size={20}
                                color={dashboardColors.green}
                              />
                            </View>
                          )}
                          {module.status === 'in-progress' && (
                            <View style={styles.inProgressIndicator} />
                          )}
                          {module.status === 'locked' && (
                            <Feather
                              name="lock"
                              size={18}
                              color={dashboardColors.textSecondary}
                            />
                          )}
                        </View>
                      </View>

                      {/* Estimated Time */}
                      <View style={styles.moduleFooter}>
                        <Text style={styles.estimatedTime}>
                          {module.estimatedTime}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
      <InAppModal config={modal} />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
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
      background: 'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow: '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
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
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  contentArea: {
    paddingRight: 10,
  },

  // Header
  header: {
    marginBottom: dashboardSpacing.lg,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },

  // Progress Card
  progressCard: {
    padding: dashboardSpacing.lg,
    borderRadius: dashboardLayout.radiusXl,
    marginBottom: dashboardSpacing.xl,
    ...webOnlyTransition,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.md,
  },
  progressBarContainer: {
    marginBottom: dashboardSpacing.md,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: dashboardColors.cyan,
    borderRadius: 4,
    ...webOnly({ transition: 'width 0.4s ease' }),
  },
  progressText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },

  // Modules Section
  modulesSection: {
    marginBottom: dashboardSpacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.md,
  },
  modulesList: {
    gap: dashboardSpacing.md,
  },

  // Module Card
  moduleCard: {
    padding: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    ...webOnlyTransition,
  },
  moduleCardHovered: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
    ...webOnly({ cursor: 'pointer' }),
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dashboardSpacing.md,
    marginBottom: dashboardSpacing.md,
  },
  moduleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  moduleInfo: {
    flex: 1,
    minWidth: 0,
  },
  moduleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 4,
  },
  moduleDescription: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    lineHeight: 18,
  },
  statusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  completedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inProgressIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: dashboardColors.cyan,
    ...webOnly({ boxShadow: `0 0 12px ${dashboardColors.cyan}` }),
  },

  // Module Footer
  moduleFooter: {
    paddingTop: dashboardSpacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139, 92, 246, 0.1)',
    alignItems: 'flex-end',
  },
  estimatedTime: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
});
