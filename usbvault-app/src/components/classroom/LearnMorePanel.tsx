import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { learnStyles } from './styles';

/** Collapsible "Learn More" panel for ciphers and KDFs */
export function LearnMorePanel({ prefix, accentColor }: { prefix: string; accentColor: string }) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const sections = [
    {
      icon: 'cpu' as const,
      labelKey: 'classroom.learn.howItWorks',
      contentKey: `${prefix}.howItWorks`,
    },
    {
      icon: 'check-circle' as const,
      labelKey: 'classroom.learn.strengths',
      contentKey: `${prefix}.strengths`,
    },
    {
      icon: 'alert-triangle' as const,
      labelKey: 'classroom.learn.weaknesses',
      contentKey: `${prefix}.weaknesses`,
    },
    {
      icon: 'globe' as const,
      labelKey: 'classroom.learn.realWorld',
      contentKey: `${prefix}.realWorld`,
    },
  ];

  return (
    <View style={learnStyles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('classroom.learn.learnMore')}
        style={[
          learnStyles.toggle,
          { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}0A` },
        ]}
        onPress={() => setExpanded(prev => !prev)}
      >
        <Feather name="book-open" size={14} color={accentColor} />
        <Text style={[learnStyles.toggleText, { color: accentColor }]}>
          {t('classroom.learn.learnMore')}
        </Text>
        <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={accentColor} />
      </Pressable>

      {expanded && (
        <View
          style={[
            learnStyles.panel,
            { borderColor: `${accentColor}30`, backgroundColor: `${accentColor}06` },
          ]}
        >
          {sections.map((s, i) => {
            const content = t(s.contentKey, { defaultValue: '' });
            if (!content) return null;
            return (
              <View key={i} style={learnStyles.section}>
                <View style={learnStyles.sectionHeader}>
                  <Feather name={s.icon} size={13} color={accentColor} />
                  <Text style={[learnStyles.sectionLabel, { color: theme.L2.base.text.primary }]}>
                    {t(s.labelKey)}
                  </Text>
                </View>
                <Text style={[learnStyles.sectionContent, { color: theme.L2.base.text.secondary }]}>
                  {content}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
