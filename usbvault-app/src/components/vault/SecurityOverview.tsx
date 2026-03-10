import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  Text,
} from 'react-native';
import Svg, { Polygon, Line } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';

interface SecurityOverviewProps {
  style?: ViewStyle;
  testID?: string;
}

interface Axis {
  label: string;
  value: number; // 0-100
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },

  hexagon: {
    width: 200,
    height: 200,
  },

  label: {
    fontSize: typography.sizes.xs,
    fontWeight: '500' as const,
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontFamily: typography.fontFamily,
  },
});

// Available for future use
export const SecurityOverview: React.FC<SecurityOverviewProps> = ({
  style,
  testID,
}) => {
  const axes: Axis[] = [
    { label: 'Files', value: 95 },
    { label: 'Passwords', value: 90 },
    { label: 'Privacy', value: 100 },
    { label: 'Sharing', value: 80 },
    { label: 'Sessions', value: 85 },
    { label: 'Backups', value: 70 },
  ];

  // Generate hexagon points for radar chart
  const centerX = 100;
  const centerY = 100;
  const maxRadius = 80;

  // Generate points for the hexagon (6 axes)
  const generatePoints = (scores: number[]): string => {
    const points = scores.map((score, index) => {
      const angle = (index * 2 * Math.PI) / scores.length - Math.PI / 2;
      const radius = (score / 100) * maxRadius;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      return `${x},${y}`;
    });
    return points.join(' ');
  };

  const values = axes.map((a) => a.value);
  const polygonPoints = generatePoints(values);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <Svg width={200} height={200} style={styles.hexagon}>
        {/* Background hexagon (max score) */}
        <Polygon
          points={generatePoints([100, 100, 100, 100, 100, 100])}
          fill="none"
          stroke={colors.border}
          strokeWidth="1"
        />

        {/* Mid-level hexagons */}
        <Polygon
          points={generatePoints([50, 50, 50, 50, 50, 50])}
          fill="none"
          stroke={colors.border}
          strokeWidth="0.5"
          opacity={0.5}
        />

        {/* Data polygon */}
        <Polygon
          points={polygonPoints}
          fill={colors.accentPrimary}
          fillOpacity="0.3"
          stroke={colors.accentPrimary}
          strokeWidth="2"
        />

        {/* Axis lines */}
        {axes.map((_, index) => {
          const angle = (index * 2 * Math.PI) / axes.length - Math.PI / 2;
          const x2 = centerX + maxRadius * Math.cos(angle);
          const y2 = centerY + maxRadius * Math.sin(angle);
          return (
            <Line
              key={`line-${index}`}
              x1={centerX}
              y1={centerY}
              x2={x2}
              y2={y2}
              stroke={colors.border}
              strokeWidth="0.5"
              opacity="0.3"
            />
          );
        })}
      </Svg>

      <Text style={styles.label}>
        Security Overview
      </Text>
    </View>
  );
};
