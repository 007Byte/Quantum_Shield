import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';

interface SecurityScoreProps {
  score: number; // 0-100
  style?: ViewStyle;
  testID?: string;
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },

  circle: {
    width: 150,
    height: 150,
  },

  scoreText: {
    fontSize: typography.sizes['2xl'],
    fontWeight: '700' as const,
    color: colors.accentPrimary,
    marginTop: spacing.md,
    fontFamily: typography.fontFamily,
  },

  label: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    fontFamily: typography.fontFamily,
  },
});

// Available for future use
export const SecurityScore: React.FC<SecurityScoreProps> = ({
  score,
  style,
  testID,
}) => {
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getColor = () => {
    if (score >= 80) return colors.accentPrimary;
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#EF4444';
    return colors.danger;
  };

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Svg width={150} height={150} style={styles.circle}>
        {/* Background circle */}
        <Circle
          cx={75}
          cy={75}
          r={radius}
          fill="none"
          stroke={colors.border}
          strokeWidth="4"
        />

        {/* Score circle */}
        <Circle
          cx={75}
          cy={75}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          originX="75"
          originY="75"
        />
      </Svg>

      <Text style={styles.scoreText}>{Math.round(score)}</Text>
      <Text style={styles.label}>Security Score</Text>
    </View>
  );
};
