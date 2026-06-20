import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnly } from '@/utils/webStyle';
import { webOnlyEdgeLit, webOnlyGlassLuxury, webOnlyTransition, dashboardSpacing } from '../styles';

/**
 * SetupPrompt - Empty state card shown when user has no data (files or passwords).
 *
 * Features:
 * - Shield icon indicating security focus
 * - Clear title prompting user to add content
 * - Descriptive subtitle with guidance
 * - Appears above other cards when no data exists
 *
 * @remarks
 * - Removed from view when user has at least one file or password entry
 * - Provides immediate visual feedback for new users
 * - Uses same card styling as other panels for consistency
 */
export const SetupPrompt = React.memo(function SetupPrompt() {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[styles.card, styles.setupCard, resolveLayerStyle(theme.L2.base)]}>
      <View style={styles.cardSheen} />
      <View style={styles.cardInnerBorder} />
      <View style={styles.setupContent}>
        <Feather name="shield" size={32} color={theme.L2.base.text.secondary} />
        <Text style={[styles.setupTitle, { color: theme.L2.base.text.primary }]}>
          {t('rightRail.setupTitle')}
        </Text>
        <Text style={[styles.setupSubtitle, { color: theme.L2.base.text.secondary }]}>
          {t('rightRail.setupSubtitle')}
        </Text>
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
  setupCard: {
    minHeight: 120,
  },
  setupContent: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg,
    gap: dashboardSpacing.sm,
  },
  setupTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  setupSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 260,
  },
});
