import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { CourseModule, COURSE_MODULES } from './courseData';
import { classroomStyles as styles } from './styles';

export interface ModuleCardProps {
  module: CourseModule;
  index: number;
  isCompleted: boolean;
  isUnlocked: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onComplete: () => void;
}

export function ModuleCard({
  module,
  index,
  isCompleted,
  isUnlocked,
  isExpanded,
  onToggle,
  onComplete,
}: ModuleCardProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const status = isCompleted ? 'completed' : isUnlocked ? 'available' : 'locked';

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        onPress={isUnlocked || isCompleted ? onToggle : undefined}
        style={(state: any) => [
          styles.moduleCard,
          resolveLayerStyle(theme.L2.base),
          {
            borderLeftColor: isCompleted
              ? theme.semantic.green
              : isUnlocked
                ? module.color
                : theme.L2.base.text.muted,
            borderLeftWidth: 3,
          },
          status === 'locked' && { opacity: 0.45 },
          isExpanded && styles.moduleCardExpanded,
          state.hovered && isUnlocked && styles.moduleCardHovered,
        ]}
        accessibilityLabel={`${t(module.titleKey)} — ${status}`}
      >
        {/* Module Icon and Status */}
        <View style={styles.moduleHeader}>
          <View style={[styles.moduleIconContainer, { backgroundColor: `${module.color}18` }]}>
            <Feather
              name={module.icon as any}
              size={24}
              color={
                isCompleted
                  ? theme.semantic.green
                  : isUnlocked
                    ? module.color
                    : theme.L2.base.text.muted
              }
            />
          </View>
          <View style={styles.moduleInfo}>
            <Text style={[styles.moduleTitle, { color: theme.L2.base.text.primary }]}>
              {t(module.titleKey)}
            </Text>
            <Text style={[styles.moduleDescription, { color: theme.L2.base.text.secondary }]}>
              {t(module.descKey)}
            </Text>
          </View>
          <View style={styles.statusContainer}>
            {status === 'completed' && (
              <View style={styles.completedBadge}>
                <Feather name="check-circle" size={20} color={theme.semantic.green} />
              </View>
            )}
            {status === 'available' && (
              <View style={[styles.availableBadge, { borderColor: module.color }]}>
                <Feather
                  name={isExpanded ? 'chevron-up' : 'chevron-right'}
                  size={18}
                  color={module.color}
                />
              </View>
            )}
            {status === 'locked' && (
              <Feather name="lock" size={18} color={theme.L2.base.text.muted} />
            )}
          </View>
        </View>

        {/* Footer with time + lesson number */}
        <View style={styles.moduleFooter}>
          <Text style={[styles.lessonNumber, { color: theme.L2.base.text.muted }]}>
            {t('classroom.lessonOf', { n: index + 1, total: COURSE_MODULES.length })}
          </Text>
          <Text style={[styles.estimatedTime, { color: theme.L2.base.text.secondary }]}>
            {module.estimatedTime}
          </Text>
        </View>
      </Pressable>

      {/* Expanded Lesson Content */}
      {isExpanded && (isUnlocked || isCompleted) && (
        <View
          style={[
            styles.lessonContent,
            resolveLayerStyle(theme.L3.base),
            { borderLeftColor: module.color, borderLeftWidth: 3 },
          ]}
        >
          {module.sections.map((section, si) => (
            <View key={si} style={styles.lessonSection}>
              <View style={styles.sectionHeadingRow}>
                <View style={[styles.sectionDot, { backgroundColor: module.color }]} />
                <Text style={[styles.sectionHeading, { color: theme.L2.base.text.primary }]}>
                  {t(section.headingKey)}
                </Text>
              </View>
              <Text style={[styles.sectionBody, { color: theme.L2.base.text.secondary }]}>
                {t(section.bodyKey)}
              </Text>
            </View>
          ))}

          {/* Key Takeaway */}
          <View
            style={[
              styles.takeawayBox,
              { borderColor: `${module.color}40`, backgroundColor: `${module.color}0A` },
            ]}
          >
            <Feather name="award" size={16} color={module.color} />
            <View style={styles.takeawayTextCol}>
              <Text style={[styles.takeawayLabel, { color: module.color }]}>
                {t('classroom.keyTakeaway')}
              </Text>
              <Text style={[styles.takeawayBody, { color: theme.L2.base.text.primary }]}>
                {t(module.keyTakeawayKey)}
              </Text>
            </View>
          </View>

          {/* Complete Button */}
          {!isCompleted && (
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [
                styles.completeBtn,
                { backgroundColor: `${module.color}30`, borderColor: `${module.color}60` },
                state.hovered && { backgroundColor: `${module.color}50` },
              ]}
              onPress={onComplete}
              accessibilityLabel={t('classroom.markComplete')}
            >
              <Feather name="check" size={16} color="#fff" />
              <Text style={styles.completeBtnText}>{t('classroom.markComplete')}</Text>
            </Pressable>
          )}

          {isCompleted && (
            <View
              style={[
                styles.completedBanner,
                {
                  backgroundColor: `${theme.semantic.green}15`,
                  borderColor: `${theme.semantic.green}30`,
                },
              ]}
            >
              <Feather name="check-circle" size={16} color={theme.semantic.green} />
              <Text style={[styles.completedBannerText, { color: theme.semantic.green }]}>
                {t('classroom.lessonCompleted')}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
