import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnly } from '@/utils/webStyle';
import { webOnlyEdgeLit, webOnlyGlassLuxury, webOnlyTransition } from '../styles';

interface ShareEntry {
  id: string;
  name: string;
  subtitle: string;
  avatarLabel: string;
  avatarColor: string;
  accent?: string;
}

interface SecureShareProps {
  entries: ShareEntry[];
  onEntryPress?: (entry: ShareEntry) => void;
}

/**
 * SecureShare - Card displaying list of shared contacts and their share status.
 *
 * Features:
 * - Displays up to 3 most recent share contacts
 * - Avatar with initials colored uniquely per contact
 * - Contact name and share count subtitle
 * - Empty state with guidance when no shares exist
 * - Interactive rows with hover effect on desktop
 *
 * @remarks
 * - Share entries are limited to 3 most recent
 * - Avatar colors are assigned from a predefined palette
 * - Empty state provides clear call-to-action guidance
 * - Rows highlight on hover with glow effect
 */
export const SecureShare = React.memo(function SecureShare({
  entries,
  onEntryPress,
}: SecureShareProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[styles.card, resolveLayerStyle(theme.L2.base)]}>
      <View style={styles.cardSheen} />
      <View style={styles.cardInnerBorder} />

      <Text style={[styles.cardTitle, { color: theme.L2.base.text.primary }]}>
        {t('rightRail.secureShare')}
      </Text>

      <View style={styles.shareList}>
        {entries.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
            <Feather name="share-2" size={28} color={theme.L2.base.text.muted} />
            <Text
              style={{ color: theme.L2.base.text.secondary, fontSize: 15, textAlign: 'center' }}
            >
              {t('rightRail.noSharesYet')}
            </Text>
            <Text
              style={{
                color: theme.L2.base.text.secondary,
                fontSize: 13,
                opacity: 0.6,
                textAlign: 'center',
              }}
            >
              {t('rightRail.shareSecurely')}
            </Text>
          </View>
        ) : (
          entries.map(entry => (
            <Pressable
              accessibilityRole="button"
              key={entry.id}
              onPress={() => onEntryPress?.(entry)}
              style={(state: any) => [
                styles.shareRow,
                resolveLayerStyle(theme.L2.base),
                state.hovered && styles.shareRowHovered,
              ]}
            >
              {/* Avatar with initials */}
              <View style={[styles.avatar, { backgroundColor: entry.avatarColor }]}>
                <Text style={[styles.avatarText, { color: '#FFFFFF' }]}>{entry.avatarLabel}</Text>
              </View>

              {/* Contact info */}
              <View style={styles.shareTextWrap}>
                <Text style={[styles.shareName, { color: theme.L2.base.text.primary }]}>
                  {entry.name}
                </Text>
                <Text
                  style={[
                    styles.shareSubtitle,
                    { color: theme.L2.base.text.secondary },
                    entry.accent ? { color: entry.accent } : null,
                  ]}
                >
                  {entry.subtitle}
                </Text>
              </View>

              {/* Chevron indicator */}
              <Feather name="chevron-right" size={17} color={theme.L2.base.text.secondary} />
            </Pressable>
          ))
        )}
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
    minHeight: 242,
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
  shareList: {
    marginTop: 8,
    gap: 8,
  },
  shareRow: {
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    minHeight: 58,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareRowHovered: {
    borderColor: 'rgba(34,211,238,0.4)',
    backgroundColor: 'transparent',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.28), inset 0 0 14px rgba(34,211,238,0.1)',
    }),
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  shareTextWrap: {
    flex: 1,
  },
  shareName: {
    fontSize: 18,
    fontWeight: '600',
  },
  shareSubtitle: {
    marginTop: 1,
    fontSize: 15,
  },
});
