import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const SKELETON_COLOR = 'rgba(139, 92, 246, 0.15)';
const SKELETON_BG = 'rgba(15, 10, 40, 0.3)';

interface SkeletonLineProps {
  width?: string | number;
  height?: number;
  style?: ViewStyle;
}

interface SkeletonCardProps {
  lines?: number;
  style?: ViewStyle;
}

interface SkeletonTableProps {
  rowCount?: number;
  style?: ViewStyle;
}

interface SkeletonAvatarProps {
  size?: number;
  style?: ViewStyle;
}

/**
 * SkeletonLine - Animated placeholder line for skeleton loading states
 * @param width - Width of the line (default: '100%')
 * @param height - Height of the line (default: 14px)
 */
export const SkeletonLine: React.FC<SkeletonLineProps> = ({
  width = '100%',
  height = 14,
  style,
}) => {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 0.5 : 0.3)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.5);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.skeletonLine,
        {
          width: width as any,
          height,
          opacity,
        },
        style,
      ]}
    />
  );
};

/**
 * SkeletonCard - Card-shaped skeleton with multiple placeholder lines
 * @param lines - Number of lines to show (default: 3)
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({ lines = 3, style }) => {
  return (
    <View style={[styles.skeletonCard, style]}>
      <SkeletonLine width="80%" height={16} style={{ marginBottom: 12 }} />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === lines - 2 ? '60%' : '100%'}
          height={14}
          style={{ marginBottom: i === lines - 2 ? 0 : 8 }}
        />
      ))}
    </View>
  );
};

/**
 * SkeletonTable - Table-shaped skeleton with header and multiple rows
 * @param rowCount - Number of rows to show (default: 5)
 */
export const SkeletonTable: React.FC<SkeletonTableProps> = ({ rowCount = 5, style }) => {
  return (
    <View style={[styles.skeletonTable, style]}>
      {/* Table Header */}
      <View style={styles.skeletonTableRow}>
        <SkeletonLine width="25%" height={16} style={{ flex: 1 }} />
        <SkeletonLine width="25%" height={16} style={{ flex: 1, marginLeft: 12 }} />
        <SkeletonLine width="25%" height={16} style={{ flex: 1, marginLeft: 12 }} />
        <SkeletonLine width="15%" height={16} style={{ flex: 1, marginLeft: 12 }} />
      </View>

      {/* Table Rows */}
      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <View
          key={rowIndex}
          style={[
            styles.skeletonTableRow,
            {
              marginTop: 12,
              paddingTop: 12,
              borderTopWidth: 1,
              borderTopColor: 'rgba(139, 92, 246, 0.1)',
            },
          ]}
        >
          <SkeletonLine width="100%" height={14} style={{ flex: 1 }} />
          <SkeletonLine width="100%" height={14} style={{ flex: 1, marginLeft: 12 }} />
          <SkeletonLine width="100%" height={14} style={{ flex: 1, marginLeft: 12 }} />
          <SkeletonLine width="100%" height={14} style={{ flex: 1, marginLeft: 12 }} />
        </View>
      ))}
    </View>
  );
};

/**
 * SkeletonAvatar - Circular skeleton for avatar/profile images
 * @param size - Size of the avatar (default: 40px)
 */
export const SkeletonAvatar: React.FC<SkeletonAvatarProps> = ({ size = 40, style }) => {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 0.5 : 0.3)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.5);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      style={[
        styles.skeletonAvatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeletonLine: {
    backgroundColor: SKELETON_COLOR,
    borderRadius: 6,
  },
  skeletonCard: {
    backgroundColor: SKELETON_BG,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  skeletonTable: {
    backgroundColor: SKELETON_BG,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  skeletonTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonAvatar: {
    backgroundColor: SKELETON_COLOR,
  },
});
