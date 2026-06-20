/**
 * Classroom - Education Screen (CLASSROOM-01)
 *
 * Fully interactive educational course modules for learning about encryption,
 * security, and USBVault best practices.
 *
 * MONO-1: Decomposed from 1,854 LOC monolith into sub-components:
 *   - CryptoLab: Interactive cipher demonstrations
 *   - KDFLab: Key derivation function demos
 *   - ModuleCard: Individual lesson module cards
 *   - LearnMorePanel: Expandable info panels
 *   - courseData: Static data, types, and persistence helpers
 *   - styles: All StyleSheet definitions
 */

import { Text, View, Pressable } from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { Feather } from '@expo/vector-icons';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { resolveLayerStyle, useTheme } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import {
  COURSE_MODULES,
  loadProgress,
  saveProgress,
} from '@/components/classroom';
import { CryptoLab } from '@/components/classroom/CryptoLab';
import { KDFLab } from '@/components/classroom/KDFLab';
import { ModuleCard } from '@/components/classroom/ModuleCard';
import { classroomStyles as styles } from '@/components/classroom/styles';

export default function ClassroomScreen() {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const [completedModules, setCompletedModules] = useState<Set<string>>(() => loadProgress());
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Save progress whenever it changes
  useEffect(() => {
    saveProgress(completedModules);
  }, [completedModules]);

  const handleToggle = useCallback((id: string) => {
    setExpandedModule(prev => (prev === id ? null : id));
  }, []);

  const handleComplete = useCallback((id: string) => {
    setCompletedModules(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // Sequential unlock: a module is unlocked if the previous one is completed (or it's the first)
  const isUnlocked = useCallback(
    (index: number): boolean => {
      if (index === 0) return true;
      return completedModules.has(COURSE_MODULES[index - 1].id);
    },
    [completedModules]
  );

  const completedCount = completedModules.size;
  const totalModules = COURSE_MODULES.length;
  const progressPercentage = (completedCount / totalModules) * 100;

  return (
    <ShellLayout>
      <View style={styles.contentArea}>
        {/* Page Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.L2.base.text.primary }]}>
            {t('classroom.pageTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.L2.base.text.secondary }]}>
            {t('classroom.pageSubtitle')}
          </Text>
        </View>

        {/* Interactive Crypto Lab */}
        <CryptoLab />

        {/* KDF Lab */}
        <KDFLab />

        {/* Progress Card */}
        <View style={[styles.progressCard, resolveLayerStyle(theme.L2.base)]}>
          <View style={styles.progressHeaderRow}>
            <Text style={[styles.progressTitle, { color: theme.L2.base.text.primary }]}>
              {t('classroom.yourProgress')}
            </Text>
            {completedCount === totalModules && (
              <View
                style={[
                  styles.allCompleteBadge,
                  {
                    backgroundColor: `${theme.semantic.green}20`,
                    borderColor: `${theme.semantic.green}40`,
                  },
                ]}
              >
                <Feather name="award" size={14} color={theme.semantic.green} />
                <Text style={[styles.allCompleteText, { color: theme.semantic.green }]}>
                  {t('classroom.allComplete')}
                </Text>
              </View>
            )}
          </View>

          {/* Progress Bar */}
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progressPercentage}%` as any, backgroundColor: theme.semantic.cyan },
                ]}
              />
            </View>
          </View>

          <View style={styles.progressFooterRow}>
            <Text style={[styles.progressText, { color: theme.L2.base.text.secondary }]}>
              {t('classroom.modulesCompleted', { completed: completedCount, total: totalModules })}
            </Text>
            {completedCount > 0 && completedCount < totalModules && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const nextIndex = COURSE_MODULES.findIndex(
                    (m, i) => !completedModules.has(m.id) && isUnlocked(i)
                  );
                  if (nextIndex >= 0) {
                    setExpandedModule(COURSE_MODULES[nextIndex].id);
                  }
                }}
                style={[
                  styles.continueBtn,
                  {
                    backgroundColor: `${theme.semantic.cyan}20`,
                    borderColor: `${theme.semantic.cyan}40`,
                  },
                ]}
              >
                <Text style={[styles.continueBtnText, { color: theme.semantic.cyan }]}>
                  {t('classroom.continueLearning')}
                </Text>
                <Feather name="arrow-right" size={14} color={theme.semantic.cyan} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Course Modules Section */}
        <View style={styles.modulesSection}>
          <Text style={[styles.sectionTitle, { color: theme.L2.base.text.primary }]}>
            {t('classroom.courses')}
          </Text>
          <View style={styles.modulesList}>
            {COURSE_MODULES.map((module, index) => (
              <ModuleCard
                key={module.id}
                module={module}
                index={index}
                isCompleted={completedModules.has(module.id)}
                isUnlocked={isUnlocked(index)}
                isExpanded={expandedModule === module.id}
                onToggle={() => handleToggle(module.id)}
                onComplete={() => handleComplete(module.id)}
              />
            ))}
          </View>
        </View>
      </View>
    </ShellLayout>
  );
}
