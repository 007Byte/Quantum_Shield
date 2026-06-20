import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnly } from '@/utils/webStyle';
import { webOnlyEdgeLit, webOnlyGlassLuxury, webOnlyTransition, dashboardSpacing } from '../styles';
import { ScoreGauge } from './ScoreGauge';

interface ChecklistItem {
  id: string;
  labelKey: string;
  complete: boolean;
}

interface SecurityScoreProps {
  score: number;
  checklist: ChecklistItem[];
}

/**
 * SecurityScore - Card displaying overall security score and completion checklist.
 *
 * Features:
 * - Semicircle gauge visualization with score percentage
 * - Status text (Excellent/Good/Needs Work) based on score
 * - Checklist of 4 security tasks with completion indicators
 * - Dynamic styling based on completion status
 *
 * @remarks
 * - Score range: 0-100%
 * - Checklist items show checkmark icon when complete, circle outline when incomplete
 * - Color scheme adapts to theme (green for complete, secondary text for incomplete)
 */
export const SecurityScore = React.memo(function SecurityScore({
  score,
  checklist,
}: SecurityScoreProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[styles.card, resolveLayerStyle(theme.L2.base)]}>
      <View style={styles.cardSheen} />
      <View style={styles.cardInnerBorder} />

      <Text style={[styles.cardTitle, { color: theme.L2.base.text.primary }]}>
        {t('rightRail.securityScore')}
      </Text>

      <View style={styles.scoreRow}>
        {/* Left: Score gauge with value overlay */}
        <View style={styles.scoreRingWrap}>
          <ScoreGauge score={score} />
          <View style={styles.scoreLabelWrap}>
            <Text style={[styles.scoreValue, { color: theme.L2.base.text.primary }]}>{score}%</Text>
            <Text style={[styles.scoreStatus, { color: theme.semantic.success }]}>
              {score >= 90
                ? t('rightRail.excellent')
                : score >= 75
                  ? t('rightRail.good')
                  : t('rightRail.needsWork')}
            </Text>
          </View>
        </View>

        {/* Right: Checklist of security tasks */}
        <View style={styles.checkListWrap}>
          {checklist.map(item => (
            <View key={item.id} style={styles.checkItem}>
              <Ionicons
                name={item.complete ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={item.complete ? theme.semantic.green : theme.L2.base.text.secondary}
              />
              <Text style={[styles.checkItemText, { color: theme.L2.base.text.secondary }]}>
                {t(item.labelKey)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    ...webOnlyGlassLuxury,
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 220,
    paddingBottom: 12,
  },
  cardSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 62,
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(245,243,255,0.09), rgba(245,243,255,0))',
    }),
    opacity: 0.56,
  },
  cardInnerBorder: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245,243,255,0.04)',
    pointerEvents: 'none',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  scoreRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  scoreRingWrap: {
    width: 180,
    height: 150,
    position: 'relative',
  },
  scoreLabelWrap: {
    position: 'absolute',
    top: 55,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: 42,
    fontWeight: '800',
    ...webOnly({ textShadow: '0 0 22px rgba(139,92,246,0.42)' }),
  },
  scoreStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: -2,
  },
  checkListWrap: {
    flex: 1,
    gap: 7,
    justifyContent: 'center',
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  checkItemText: {
    fontSize: 14,
  },
});
