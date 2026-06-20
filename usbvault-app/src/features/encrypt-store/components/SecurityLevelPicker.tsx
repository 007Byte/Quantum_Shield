/**
 * SecurityLevelPicker — security level selection cards.
 */

import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { getSecurityLevels } from '../domain/encrypt.data';

interface Props {
  securityLevel: string;
  onSelect: (id: string) => void;
}

export function SecurityLevelPicker({ securityLevel, onSelect }: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const levels = useMemo(() => getSecurityLevels(t), [t]);

  return (
    <View
      style={[
        styles.optionsPanel,
        { backgroundColor: theme.L2.base.native.backgroundColor },
        resolveLayerStyle(theme.L2.base),
      ]}
    >
      <View style={styles.optionGroup}>
        <Text style={[styles.optionLabel, { color: theme.L2.base.text.primary }]}>
          {t('encrypt.securityLevel')}
        </Text>
        <Text style={[styles.optionHint, { color: theme.L2.base.text.secondary }]}>
          {t('encrypt.securityLevelHint')}
        </Text>
        <View style={styles.securityOptions}>
          {levels.map(level => (
            <Pressable
              accessibilityRole="button"
              key={level.id}
              onPress={() => onSelect(level.id)}
              style={(state: any) => [
                styles.securityCard,
                securityLevel === level.id && styles.securityCardActive,
                state.hovered && styles.securityCardHover,
                resolveLayerStyle(theme.L2.base),
              ]}
            >
              <View
                style={[
                  styles.securityIconWrap,
                  securityLevel === level.id && styles.securityIconWrapActive,
                ]}
              >
                <Feather
                  name={level.icon}
                  size={20}
                  color={securityLevel === level.id ? '#FFFFFF' : theme.L2.base.text.secondary}
                />
              </View>
              <Text
                style={[
                  styles.securityCardTitle,
                  { color: theme.L2.base.text.secondary },
                  securityLevel === level.id && [
                    styles.securityCardTitleActive,
                    { color: theme.L2.base.text.primary },
                  ],
                ]}
              >
                {t(`encrypt.${level.id.toLowerCase()}`)}
              </Text>
              <Text
                style={[
                  styles.securityCardDesc,
                  {
                    color:
                      securityLevel === level.id
                        ? theme.L2.base.text.primary
                        : theme.L2.base.text.secondary,
                  },
                ]}
              >
                {level.summary}
              </Text>
              {securityLevel === level.id && (
                <View style={styles.detailGrid}>
                  {level.details.map(d => (
                    <View key={d.label} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{d.label}</Text>
                      <Text style={[styles.detailValue, { color: theme.L2.base.text.secondary }]}>
                        {d.value}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              <View
                style={[
                  styles.speedBadge,
                  {
                    backgroundColor:
                      securityLevel === level.id
                        ? 'rgba(34,211,238,0.1)'
                        : 'rgba(255,255,255,0.05)',
                  },
                ]}
              >
                <Feather
                  name="clock"
                  size={10}
                  color={
                    securityLevel === level.id ? theme.semantic.cyan : theme.L2.base.text.secondary
                  }
                />
                <Text
                  style={[
                    styles.speedBadgeText,
                    {
                      color:
                        securityLevel === level.id
                          ? theme.semantic.cyan
                          : theme.L2.base.text.secondary,
                    },
                  ]}
                >
                  {level.speed}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  optionsPanel: {
    marginBottom: dashboardSpacing.lg,
    gap: dashboardSpacing.lg,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 16,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  optionGroup: { gap: dashboardSpacing.sm },
  optionLabel: { fontSize: 16, fontWeight: '700' },
  optionHint: { fontSize: 13, marginBottom: 4 },
  securityOptions: { flexDirection: 'row', gap: dashboardSpacing.sm, flexWrap: 'wrap' },
  securityCard: {
    flex: 1,
    minWidth: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
    ...webOnly({ transition: 'all 0.2s ease', cursor: 'pointer' }),
  },
  securityCardActive: {
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.15)',
    ...webOnly({ boxShadow: '0 0 20px rgba(139,92,246,0.25)' }),
  },
  securityCardHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({ boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)' }),
  },
  securityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  securityIconWrapActive: {
    backgroundColor: 'rgba(139,92,246,0.4)',
    ...webOnly({ boxShadow: '0 0 16px rgba(139,92,246,0.4)' }),
  },
  securityCardTitle: { fontSize: 15, fontWeight: '700' },
  securityCardTitleActive: {},
  securityCardDesc: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  detailGrid: { marginTop: 8, gap: 5, width: '100%', alignItems: 'flex-start' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, width: '100%' },
  detailLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(34,211,238,0.8)',
    width: 60,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  detailValue: { fontSize: 11, lineHeight: 15, flex: 1, textAlign: 'left' },
  speedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  speedBadgeActive: {},
  speedBadgeText: { fontSize: 10, fontWeight: '600' },
  speedBadgeTextActive: {},
});
