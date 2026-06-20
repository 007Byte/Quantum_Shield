/**
 * AlgorithmPicker — encryption algorithm selection cards.
 */

import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { getAlgorithmOptions } from '../domain/encrypt.data';

interface Props {
  algorithm: string;
  onSelect: (id: string) => void;
}

export function AlgorithmPicker({ algorithm, onSelect }: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const options = useMemo(() => getAlgorithmOptions(t), [t]);

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
          {t('encrypt.algorithm')}
        </Text>
        <Text style={[styles.optionHint, { color: theme.L2.base.text.secondary }]}>
          {t('encrypt.algorithmHint')}
        </Text>
        <View style={styles.algorithmOptions}>
          {options.map(algo => (
            <Pressable
              accessibilityRole="button"
              key={algo.id}
              onPress={() => onSelect(algo.id)}
              style={(state: any) => [
                styles.algorithmCard,
                algorithm === algo.id && styles.algorithmCardActive,
                state.hovered && styles.algorithmCardHover,
                resolveLayerStyle(theme.L2.base),
              ]}
            >
              <View style={styles.algorithmCardHeader}>
                <View
                  style={[
                    styles.algorithmIconWrap,
                    algorithm === algo.id && styles.algorithmIconWrapActive,
                  ]}
                >
                  <Feather
                    name={algo.icon}
                    size={16}
                    color={algorithm === algo.id ? '#FFFFFF' : theme.L2.base.text.secondary}
                  />
                </View>
                <View style={styles.algorithmCardTitleRow}>
                  <Text
                    style={[
                      styles.algorithmCardName,
                      { color: theme.L2.base.text.secondary },
                      algorithm === algo.id && [
                        styles.algorithmCardNameActive,
                        { color: theme.L2.base.text.primary },
                      ],
                    ]}
                  >
                    {algo.name}
                  </Text>
                  <View
                    style={[
                      styles.algorithmTag,
                      algorithm === algo.id && styles.algorithmTagActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.algorithmTagText,
                        { color: theme.L2.base.text.secondary },
                        algorithm === algo.id && [
                          styles.algorithmTagTextActive,
                          { color: theme.semantic.cyan },
                        ],
                      ]}
                    >
                      {algo.tag}
                    </Text>
                  </View>
                </View>
                {algorithm === algo.id && (
                  <Feather name="check-circle" size={16} color={theme.semantic.cyan} />
                )}
              </View>
              <Text
                style={[
                  styles.algorithmCardDesc,
                  {
                    color:
                      algorithm === algo.id
                        ? theme.L2.base.text.primary
                        : theme.L2.base.text.secondary,
                  },
                ]}
              >
                {algo.summary}
              </Text>
              {algorithm === algo.id && (
                <View style={styles.detailGrid}>
                  {algo.details.map(d => (
                    <View key={d.label} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{d.label}</Text>
                      <Text style={[styles.detailValue, { color: theme.L2.base.text.secondary }]}>
                        {d.value}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
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
  algorithmOptions: { gap: dashboardSpacing.sm },
  algorithmCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...webOnly({ transition: 'all 0.2s ease', cursor: 'pointer' }),
  },
  algorithmCardActive: {
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.15)',
    ...webOnly({ boxShadow: '0 0 20px rgba(139,92,246,0.25)' }),
  },
  algorithmCardHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({ boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)' }),
  },
  algorithmCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  algorithmIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  algorithmIconWrapActive: { backgroundColor: 'rgba(139,92,246,0.4)' },
  algorithmCardTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  algorithmCardName: { fontSize: 14, fontWeight: '600' },
  algorithmCardNameActive: {},
  algorithmTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  algorithmTagActive: {
    backgroundColor: 'rgba(34,211,238,0.15)',
    borderColor: 'rgba(34,211,238,0.35)',
  },
  algorithmTagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  algorithmTagTextActive: {},
  algorithmCardDesc: { fontSize: 13, lineHeight: 18, paddingLeft: 42 },
  algorithmCardDescActive: {},
  detailGrid: { marginTop: 10, paddingLeft: 42, gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(34,211,238,0.8)',
    width: 80,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  detailValue: { fontSize: 12, lineHeight: 17, flex: 1 },
});
