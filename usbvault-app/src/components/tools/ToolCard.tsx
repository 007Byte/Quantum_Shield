/**
 * ToolCard — Shared glassmorphic card for the Tools screen.
 *
 * Displays a single tool with colored left border accent, icon, title,
 * description, and an action button (Open / Launch / Close).
 *
 * @module components/tools/ToolCard
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolAction = { type: 'navigate'; route: string } | { type: 'inline'; id: string };

export interface ToolDef {
  id: string;
  titleKey: string;
  descKey: string;
  icon: string;
  color: string;
  action: ToolAction;
}

export interface ToolCategory {
  id: string;
  titleKey: string;
  icon: string;
  tools: ToolDef[];
}

interface ToolCardProps {
  tool: ToolDef;
  t: (key: string) => string;
  onPress: () => void;
  isExpanded?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ToolCard({ tool, t, onPress, isExpanded }: ToolCardProps) {
  const { theme } = useTheme();
  const isNavigate = tool.action.type === 'navigate';
  const buttonLabel = isNavigate
    ? `${t('tools.open')} \u2192`
    : isExpanded
      ? t('tools.close')
      : t('tools.launch');

  return (
    <Pressable
      onPress={onPress}
      style={(state: any) => [
        styles.card,
        { borderLeftColor: tool.color, borderLeftWidth: 3 },
        resolveLayerStyle(theme.L2.base),
        isExpanded && styles.cardExpanded,
        state.hovered && styles.cardHovered,
      ]}
      accessibilityRole="button"
      accessibilityLabel={t(tool.titleKey)}
    >
      <View style={styles.row}>
        {/* Icon Circle */}
        <View style={[styles.iconCircle, { backgroundColor: `${tool.color}15` }]}>
          <Feather name={tool.icon as any} size={22} color={tool.color} />
        </View>

        {/* Text Column */}
        <View style={styles.textCol}>
          <Text
            style={[styles.title, { color: theme.L2.base.text.primary }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {t(tool.titleKey)}
          </Text>
          <Text
            style={[styles.description, { color: theme.L2.base.text.secondary }]}
            numberOfLines={2}
          >
            {t(tool.descKey)}
          </Text>
        </View>

        {/* Action Button */}
        <Pressable
          onPress={onPress}
          style={(state: any) => [
            styles.actionBtn,
            isExpanded && styles.actionBtnClose,
            state.hovered && styles.actionBtnHovered,
          ]}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
        >
          <Text
            style={[
              styles.actionBtnText,
              { color: theme.L2.base.text.primary },
              isExpanded && styles.actionBtnTextClose,
              isExpanded && { color: theme.semantic.cyan },
            ]}
          >
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 14,
    padding: dashboardSpacing.md,
    marginBottom: dashboardSpacing.sm,
    ...webOnly({
      backdropFilter: 'blur(18px)',
      cursor: 'pointer',
      transition: 'all 0.22s ease',
    }),
  },
  cardExpanded: {
    borderColor: 'rgba(34,211,238,0.5)',
    ...webOnly({
      boxShadow: '0 4px 24px rgba(0,0,0,0.4), 0 0 18px rgba(34,211,238,0.2)',
    }),
  },
  cardHovered: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 20px rgba(139,92,246,0.22)',
    }),
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
  },

  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.20)',
    flexShrink: 0,
  },

  textCol: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },

  description: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },

  actionBtn: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 7,
    backgroundColor: 'rgba(139,92,246,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.50)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.18s ease',
      boxShadow: '0 0 10px rgba(139,92,246,0.2)',
    }),
  },
  actionBtnClose: {
    backgroundColor: 'rgba(34,211,238,0.20)',
    borderColor: 'rgba(34,211,238,0.45)',
    ...webOnly({
      boxShadow: '0 0 10px rgba(34,211,238,0.2)',
    }),
  },
  actionBtnHovered: {
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 18px rgba(139,92,246,0.35)',
    }),
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnTextClose: {},
});
