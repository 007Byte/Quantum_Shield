import React, { useMemo } from 'react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Polygon,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import {
  secureShareEntries,
  securityChecklist,
  securityRadarMetrics,
} from './mockData';
import { dashboardColors, glassPanelStrong, webOnlyGlass } from './styles';
import { SecurityRadarMetric } from './types';
import { WebSvg } from './WebSvg';

function RadarChart({ metrics }: { metrics: SecurityRadarMetric[] }) {
  const size = 246;
  const center = size / 2;
  const radius = 82;
  const rings = [0.25, 0.5, 0.75, 1];

  const axisPoints = metrics.map((_, index) => {
    const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
      angle,
    };
  });

  const valuePoints = metrics
    .map((metric, index) => {
      const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
      const x = center + Math.cos(angle) * radius * metric.value;
      const y = center + Math.sin(angle) * radius * metric.value;
      return `${x},${y}`;
    })
    .join(' ');

  const ringPolygons = rings.map((ring) => {
    const points = metrics
      .map((_, index) => {
        const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
        const x = center + Math.cos(angle) * radius * ring;
        const y = center + Math.sin(angle) * radius * ring;
        return `${x},${y}`;
      })
      .join(' ');
    return points;
  });

  return (
    <Svg width="100%" height="236" viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id="radarStrokeGrad" x1="30" y1="16" x2="230" y2="230" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#22D3EE" />
          <Stop offset="0.58" stopColor="#A855F7" />
          <Stop offset="1" stopColor="#60A5FA" />
        </LinearGradient>
      </Defs>

      {ringPolygons.map((points, idx) => (
        <Polygon key={`ring-${idx}`} points={points} fill="none" stroke="rgba(184,179,209,0.22)" strokeWidth={1} />
      ))}

      {axisPoints.map((point, idx) => (
        <Line
          key={`axis-${idx}`}
          x1={center}
          y1={center}
          x2={point.x}
          y2={point.y}
          stroke="rgba(184,179,209,0.22)"
          strokeWidth={1}
        />
      ))}

      <Polygon points={valuePoints} fill="rgba(34,211,238,0.14)" stroke="url(#radarStrokeGrad)" strokeWidth={3} />

      {axisPoints.map((point, idx) => {
        const labelRadius = radius + 24;
        const lx = center + Math.cos(point.angle) * labelRadius;
        const ly = center + Math.sin(point.angle) * labelRadius;
        return (
          <SvgText
            key={`label-${idx}`}
            x={lx}
            y={ly}
            fill="#B8B3D1"
            fontSize={11}
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {metrics[idx]?.label ?? ''}
          </SvgText>
        );
      })}

      <Circle cx={center} cy={center} r={4} fill="#D946EF" />
    </Svg>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const size = 156;
  const center = size / 2;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id="scoreStrokeGrad" x1="22" y1="78" x2="134" y2="78" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#22D3EE" />
          <Stop offset="1" stopColor="#22C55E" />
        </LinearGradient>
      </Defs>

      <Circle cx={center} cy={center} r={radius} stroke="rgba(184,179,209,0.22)" strokeWidth={10} fill="none" />
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke="url(#scoreStrokeGrad)"
        strokeWidth={10}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${circumference}`}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <Circle cx={center} cy={center + radius} r={4} fill="#DCFCE7" />
    </Svg>
  );
}

const gemSvg = `
<svg width="102" height="98" viewBox="0 0 102 98" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gemStroke" x1="14" y1="4" x2="88" y2="92" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#93C5FD"/>
      <stop offset="0.5" stop-color="#D946EF"/>
      <stop offset="1" stop-color="#22D3EE"/>
    </linearGradient>
  </defs>
  <path d="M20 20L34 6H68L82 20L51 92L20 20Z" fill="rgba(217,70,239,0.2)" stroke="url(#gemStroke)" stroke-width="3"/>
  <path d="M34 6L51 92L68 6" stroke="rgba(236,253,255,0.8)" stroke-width="2"/>
  <path d="M20 20H82" stroke="rgba(236,253,255,0.8)" stroke-width="2"/>
</svg>
`;

export function RightRail() {
  const metrics = useMemo(() => securityRadarMetrics, []);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, styles.overviewCard, glassPanelStrong, webOnlyGlass]}>
        <Text style={styles.cardTitle}>Security Overview</Text>
        <View style={styles.radarWrap}>
          <RadarChart metrics={metrics} />
        </View>
      </View>

      <View style={[styles.card, styles.scoreCard, glassPanelStrong, webOnlyGlass]}>
        <Text style={styles.cardTitle}>Security Score</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreRingWrap}>
            <ScoreGauge score={98} />
            <View style={styles.scoreLabelWrap}>
              <Text style={styles.scoreValue}>98%</Text>
              <Text style={styles.scoreStatus}>Excellent</Text>
            </View>
          </View>

          <View style={styles.checkListWrap}>
            {securityChecklist.map((item) => (
              <View key={item.id} style={styles.checkItem}>
                <Ionicons
                  name={item.complete ? 'checkmark-circle' : 'ellipse-outline'}
                  size={16}
                  color={item.complete ? dashboardColors.green : dashboardColors.textSecondary}
                />
                <Text style={styles.checkItemText}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.card, styles.shareCard, glassPanelStrong, webOnlyGlass]}>
        <Text style={styles.cardTitle}>Secure Share</Text>
        <View style={styles.shareList}>
          {secureShareEntries.map((entry) => (
            <Pressable key={entry.id} style={styles.shareRow}>
              <View style={[styles.avatar, { backgroundColor: entry.avatarColor }]}>
                <Text style={styles.avatarText}>{entry.avatarLabel}</Text>
              </View>

              <View style={styles.shareTextWrap}>
                <Text style={styles.shareName}>{entry.name}</Text>
                <Text style={[styles.shareSubtitle, entry.accent ? { color: entry.accent } : null]}>
                  {entry.subtitle}
                </Text>
              </View>

              <Feather name="chevron-right" size={17} color={dashboardColors.textSecondary} />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.card, styles.upgradeCard, glassPanelStrong, webOnlyGlass]}>
        <Text style={styles.cardTitle}>Unlock Premium</Text>
        <View style={styles.upgradeRow}>
          <View style={styles.bulletsWrap}>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark" size={16} color={dashboardColors.cyan} />
              <Text style={styles.bulletText}>Quantum Firewall</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark" size={16} color={dashboardColors.cyan} />
              <Text style={styles.bulletText}>Priority Support</Text>
            </View>
            <View style={styles.bulletRow}>
              <Ionicons name="checkmark" size={16} color={dashboardColors.cyan} />
              <Text style={styles.bulletText}>Unlimited Storage</Text>
            </View>
          </View>

          <WebSvg svg={gemSvg} style={styles.gemSvg} fallbackColor="rgba(168,85,247,0.18)" />
        </View>

        <Pressable style={styles.upgradeBtn}>
          <Text style={styles.upgradeBtnText}>Upgrade Now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 330,
    gap: 10,
    paddingBottom: 10,
  },
  card: {
    padding: 16,
    borderColor: 'rgba(168,85,247,0.42)',
  },
  overviewCard: {
    minHeight: 304,
  },
  scoreCard: {
    minHeight: 174,
    paddingBottom: 12,
  },
  shareCard: {
    minHeight: 236,
  },
  upgradeCard: {
    minHeight: 166,
    paddingBottom: 12,
  },
  cardTitle: {
    color: dashboardColors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  radarWrap: {
    width: '100%',
    height: 236,
    marginTop: 6,
  },
  scoreRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreRingWrap: {
    width: 162,
    height: 156,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreLabelWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  scoreValue: {
    color: dashboardColors.textPrimary,
    fontSize: 44,
    fontWeight: '700',
  },
  scoreStatus: {
    color: '#86EFAC',
    fontSize: 15,
    fontWeight: '600',
  },
  checkListWrap: {
    flex: 1,
    gap: 7,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  checkItemText: {
    color: dashboardColors.textSecondary,
    fontSize: 13,
  },
  shareList: {
    marginTop: 8,
    gap: 8,
  },
  shareRow: {
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.28)',
    backgroundColor: 'rgba(19,14,40,0.74)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // @ts-ignore RN Web-only share row depth.
    boxShadow: 'inset 0 0 16px rgba(168,85,247,0.12)',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  shareTextWrap: {
    flex: 1,
  },
  shareName: {
    color: dashboardColors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  shareSubtitle: {
    marginTop: 1,
    color: dashboardColors.textSecondary,
    fontSize: 13,
  },
  upgradeRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletsWrap: {
    flex: 1,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulletText: {
    color: dashboardColors.textSecondary,
    fontSize: 16,
  },
  gemSvg: {
    width: 106,
    height: 98,
    marginLeft: 6,
  },
  upgradeBtn: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.44)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(57,31,95,0.95)',
    // @ts-ignore RN Web-only premium button gradient.
    background: 'linear-gradient(90deg, rgba(147,51,234,0.72) 0%, rgba(37,99,235,0.7) 100%)',
    // @ts-ignore RN Web-only premium button glow.
    boxShadow: '0 0 18px rgba(34,211,238,0.32)',
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
