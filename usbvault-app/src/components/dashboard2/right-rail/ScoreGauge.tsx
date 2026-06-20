import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/engine';

interface ScoreGaugeProps {
  score: number;
}

/**
 * ScoreGauge - Semicircle progress arc visualization for security score (0-100%).
 *
 * Renders a semicircular gauge with:
 * - Background track arc
 * - Soft glow layer behind progress
 * - Main gradient-filled progress arc
 * - Glowing end dot positioned at current score
 *
 * @remarks
 * - Uses SVG strokeDasharray for smooth progress animation
 * - Gradient spans from purple through cyan to blue
 * - Maintains consistent arc geometry regardless of score value
 */
export const ScoreGauge = React.memo(function ScoreGauge({ score }: ScoreGaugeProps) {
  const { theme } = useTheme();
  const width = 180;
  const height = 120;
  const cx = width / 2;
  const cy = 106;
  const radius = 76;
  const strokeW = 7;

  // Semicircle: arc length = π * r
  const halfCirc = Math.PI * radius;
  const fraction = Math.min(score / 100, 1);
  const filledLength = halfCirc * fraction;
  const dashOffset = halfCirc - filledLength;

  // SVG arc path: semicircle from left to right across the top
  const arcPath = `M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  // End dot position along the arc
  const endAngle = Math.PI - Math.PI * fraction;
  const dotX = cx + Math.cos(endAngle) * radius;
  const dotY = cy - Math.sin(endAngle) * radius;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient
          id="scoreStrokeGrad2"
          x1={cx - radius}
          y1={cy}
          x2={cx + radius}
          y2={cy}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={theme.semantic.purple} />
          <Stop offset="0.3" stopColor={theme.semantic.cyan} />
          <Stop offset="0.7" stopColor={theme.semantic.success} />
          <Stop offset="1" stopColor={theme.semantic.warning} />
        </LinearGradient>
      </Defs>

      {/* Background track */}
      <Path
        d={arcPath}
        fill="none"
        stroke="rgba(184,179,209,0.1)"
        strokeWidth={strokeW}
        strokeLinecap="round"
      />

      {/* Soft glow behind the progress arc */}
      <Path
        d={arcPath}
        fill="none"
        stroke={theme.semantic.cyan + '26'}
        strokeWidth={strokeW + 12}
        strokeLinecap="round"
        strokeDasharray={`${halfCirc}`}
        strokeDashoffset={dashOffset}
      />

      {/* Main progress arc with gradient */}
      <Path
        d={arcPath}
        fill="none"
        stroke="url(#scoreStrokeGrad2)"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${halfCirc}`}
        strokeDashoffset={dashOffset}
      />

      {/* Glowing end dot */}
      <Circle cx={dotX} cy={dotY} r={5} fill={theme.semantic.warning} />
    </Svg>
  );
});
