import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

interface CardProps {
  children: React.ReactNode;
  glow?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  cardGlow: {
    borderColor: colors.accentPrimary,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
});

export const Card: React.FC<CardProps> = ({ children, glow = false, style, testID }) => {
  return (
    <View style={[styles.card, glow && styles.cardGlow, style]} testID={testID}>
      {children}
    </View>
  );
};
