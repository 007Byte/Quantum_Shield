import React from 'react';
// StyleSheet not needed — SVG-only component
import Svg, { Circle, Defs, Line, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/engine';
import { webOnly } from '@/utils/webStyle';
import { SecurityRadarMetric } from '../types';

interface RadarChartProps {
  metrics: SecurityRadarMetric[];
  isLight?: boolean;
}

/**
 * RadarChart - Hexagonal/N-axis radar visualization showing security metrics.
 *
 * Renders a radar polygon with:
 * - Concentric rings for scale
 * - Axis lines radiating from center
 * - Data polygon with gradient stroke and glow
 * - Data point dots at each vertex
 *
 * @remarks
 * - Uses react-native-svg for cross-platform rendering
 * - Supports arbitrary number of metrics (auto-calculates angles)
 * - Applies theme-aware gradient based on semantic colors
 */
export const RadarChart = React.memo(function RadarChart({ metrics, isLight }: RadarChartProps) {
  const { theme } = useTheme();
  const size = 246;
  const center = size / 2;
  const radius = 82;
  const rings = [0.25, 0.5, 0.75, 1];
  const gridColor = isLight ? 'rgba(124,58,237,0.25)' : 'rgba(250,204,21,0.45)';

  const axisPoints = metrics.map((_, index) => {
    const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
      angle,
    };
  });

  const valueCoords = metrics.map((metric, index) => {
    const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
    return {
      x: center + Math.cos(angle) * radius * metric.value,
      y: center + Math.sin(angle) * radius * metric.value,
    };
  });

  const valuePoints = valueCoords.map(c => `${c.x},${c.y}`).join(' ');

  const ringPolygons = rings.map(ring =>
    metrics
      .map((_, index) => {
        const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
        const x = center + Math.cos(angle) * radius * ring;
        const y = center + Math.sin(angle) * radius * ring;
        return `${x},${y}`;
      })
      .join(' ')
  );

  return (
    <Svg
      width={236}
      height={236}
      viewBox={`0 0 ${size} ${size}`}
      style={webOnly({ overflow: 'visible' })}
    >
      <Defs>
        <LinearGradient
          id="radarStrokeGrad2"
          x1="30"
          y1="16"
          x2="230"
          y2="230"
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={theme.semantic.cyan} />
          <Stop offset="0.45" stopColor={theme.semantic.cyan} />
          <Stop offset="0.75" stopColor={theme.semantic.purple} />
          <Stop offset="1" stopColor={theme.semantic.blue} />
        </LinearGradient>
      </Defs>

      {/* Background grid rings */}
      {ringPolygons.map((points, idx) => (
        <Polygon
          key={`ring-${idx}`}
          points={points}
          fill="none"
          stroke={gridColor}
          strokeWidth={1}
        />
      ))}

      {/* Axis lines radiating from center */}
      {axisPoints.map((point, idx) => (
        <Line
          key={`axis-${idx}`}
          x1={center}
          y1={center}
          x2={point.x}
          y2={point.y}
          stroke={gridColor}
          strokeWidth={1}
        />
      ))}

      {/* Glow layer behind the main data polygon */}
      <Polygon
        points={valuePoints}
        fill="none"
        stroke={theme.semantic.cyan + '4D'}
        strokeWidth={8}
      />

      {/* Main data polygon with gradient stroke */}
      <Polygon
        points={valuePoints}
        fill={theme.semantic.cyan + '14'}
        stroke="url(#radarStrokeGrad2)"
        strokeWidth={2}
      />

      {/* Data point dots at each vertex */}
      {valueCoords.map((coord, idx) => (
        <Circle key={`dot-${idx}`} cx={coord.x} cy={coord.y} r={3.5} fill={theme.semantic.cyan} />
      ))}

      {/* Center accent dot */}
      <Circle cx={center} cy={center} r={4} fill={theme.semantic.accentSecondary} />
    </Svg>
  );
});
