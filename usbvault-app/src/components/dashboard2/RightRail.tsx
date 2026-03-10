import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { InAppModal, useInAppModal } from '@/components/common';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Stop,
} from 'react-native-svg';
import { webOnly } from '@/utils/webStyle';

// GUI-02/03/04: No longer importing mock data — all metrics from real services
import { shareService } from '@/services/shareService';
import { passwordService } from '@/services/passwordService';
import { useVaultStore } from '@/stores/vaultStore';
import { useAuthStore } from '@/stores/authStore';
import { fido2Service } from '@/services/fido2Service';
import { auditService } from '@/services/auditService';
import { settingsService } from '@/services/settingsService';
import {
  dashboardColors,
  dashboardSpacing,
  webOnlyEdgeLit,
  webOnlyGlassLuxury,
  webOnlyGlowTier2,
  webOnlyGlowTier3,
  glassPanelStrong,
  webOnlyGlass,
  webOnlyTransition,
} from './styles';
import { SecurityRadarMetric } from './types';

const premiumDiamondAsset = require('../../../assets/diamond.png');

/* ── Radar Tooltip Data ─────────────────────────────────────────── */

interface RadarTooltipInfo {
  status: string;
  statusColor: string;
  current: string;
  suggestions: string[];
}

function getRadarTooltip(metricId: string, value: number): RadarTooltipInfo {
  const pct = Math.round(value * 100);
  const statusColor = pct >= 80 ? '#4ADE80' : pct >= 50 ? '#FACC15' : '#EF4444';
  const status = pct >= 80 ? 'Strong' : pct >= 50 ? 'Moderate' : 'Needs Attention';

  switch (metricId) {
    case 'files':
      return {
        status, statusColor,
        current: pct >= 50 ? `${pct}% — You have encrypted files in your vault` : `${pct}% — No files encrypted yet`,
        suggestions: pct >= 80
          ? ['Your file encryption coverage is excellent']
          : ['Encrypt sensitive documents (IDs, tax forms, contracts)', 'Use PQC encryption for maximum protection', 'Enable auto-encrypt for new uploads'],
      };
    case 'passwords':
      return {
        status, statusColor,
        current: pct >= 50 ? `${pct}% — Passwords stored securely` : `${pct}% — No passwords stored yet`,
        suggestions: pct >= 80
          ? ['Password vault is well-populated']
          : ['Import passwords from your browser or another manager', 'Use the password generator for strong unique passwords', 'Enable breach monitoring for stored credentials'],
      };
    case 'backups':
      return {
        status, statusColor,
        current: pct >= 80 ? `${pct}% — Backup configuration is solid` : `${pct}% — Backup coverage could improve`,
        suggestions: pct >= 80
          ? ['Backup strategy is comprehensive']
          : ['Set up automatic vault backups', 'Store your 24-word recovery phrase offline', 'Consider a secondary backup location'],
      };
    case 'sessions':
      return {
        status, statusColor,
        current: pct >= 50 ? `${pct}% — Active session monitoring enabled` : `${pct}% — Limited session activity`,
        suggestions: pct >= 80
          ? ['Session security is well-monitored']
          : ['Review active sessions regularly on the Devices screen', 'Set a shorter auto-lock timeout', 'Enable "Remember this device" only on trusted machines'],
      };
    case 'sharing':
      return {
        status, statusColor,
        current: pct >= 50 ? `${pct}% — Secure sharing is active` : `${pct}% — No shares created yet`,
        suggestions: pct >= 80
          ? ['Sharing practices look secure']
          : ['Use time-limited share links (24–72h expiry)', 'Require PIN access for sensitive shares', 'Verify recipient key fingerprints before sharing'],
      };
    case 'privacy':
      return {
        status, statusColor,
        current: pct >= 60 ? `${pct}% — Privacy controls are configured` : `${pct}% — Privacy settings need attention`,
        suggestions: pct >= 80
          ? ['Privacy posture is strong']
          : ['Enable biometric lock for app access', 'Register a FIDO2 hardware key for 2FA', 'Turn on Ghost Mode to minimize digital footprint'],
      };
    default:
      return { status, statusColor, current: `${pct}%`, suggestions: [] };
  }
}

/* ── Radar Chart (react-native-svg) ─────────────────────────────── */

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

  const valueCoords = metrics.map((metric, index) => {
    const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
    return {
      x: center + Math.cos(angle) * radius * metric.value,
      y: center + Math.sin(angle) * radius * metric.value,
    };
  });

  const valuePoints = valueCoords.map((c) => `${c.x},${c.y}`).join(' ');

  const ringPolygons = rings.map((ring) =>
    metrics
      .map((_, index) => {
        const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
        const x = center + Math.cos(angle) * radius * ring;
        const y = center + Math.sin(angle) * radius * ring;
        return `${x},${y}`;
      })
      .join(' '),
  );

  return (
    <Svg width={236} height={236} viewBox={`0 0 ${size} ${size}`} style={webOnly({ overflow: 'visible' })}>
      <Defs>
        <LinearGradient id="radarStrokeGrad2" x1="30" y1="16" x2="230" y2="230" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#22D3EE" />
          <Stop offset="0.45" stopColor="#22D3EE" />
          <Stop offset="0.75" stopColor="#A855F7" />
          <Stop offset="1" stopColor="#60A5FA" />
        </LinearGradient>
      </Defs>

      {ringPolygons.map((points, idx) => (
        <Polygon key={`ring-${idx}`} points={points} fill="none" stroke="rgba(250,204,21,0.45)" strokeWidth={1} />
      ))}

      {axisPoints.map((point, idx) => (
        <Line
          key={`axis-${idx}`}
          x1={center}
          y1={center}
          x2={point.x}
          y2={point.y}
          stroke="rgba(250,204,21,0.45)"
          strokeWidth={1}
        />
      ))}

      {/* Glow layer behind the main data polygon */}
      <Polygon points={valuePoints} fill="none" stroke="rgba(34,211,238,0.3)" strokeWidth={8} />
      {/* Main data polygon */}
      <Polygon points={valuePoints} fill="rgba(34,211,238,0.08)" stroke="url(#radarStrokeGrad2)" strokeWidth={2} />

      {/* Data point dots at each vertex */}
      {valueCoords.map((coord, idx) => (
        <Circle key={`dot-${idx}`} cx={coord.x} cy={coord.y} r={3.5} fill="#22D3EE" />
      ))}

      {/* Labels rendered by Pressable overlays for hover interactivity */}

      <Circle cx={center} cy={center} r={4} fill="#D946EF" />
    </Svg>
  );
}

/* ── Score Gauge (react-native-svg) ─────────────────────────────── */

function ScoreGauge({ score }: { score: number }) {
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
        <LinearGradient id="scoreStrokeGrad2" x1={cx - radius} y1={cy} x2={cx + radius} y2={cy} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#A855F7" />
          <Stop offset="0.3" stopColor="#22D3EE" />
          <Stop offset="0.7" stopColor="#4ADE80" />
          <Stop offset="1" stopColor="#FACC15" />
        </LinearGradient>
      </Defs>

      {/* Background track */}
      <Path d={arcPath} fill="none" stroke="rgba(184,179,209,0.1)" strokeWidth={strokeW} strokeLinecap="round" />
      {/* Soft glow behind the progress arc */}
      <Path
        d={arcPath}
        fill="none"
        stroke="rgba(34,211,238,0.15)"
        strokeWidth={strokeW + 12}
        strokeLinecap="round"
        strokeDasharray={`${halfCirc}`}
        strokeDashoffset={dashOffset}
      />
      {/* Main progress arc */}
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
      <Circle cx={dotX} cy={dotY} r={5} fill="#FACC15" />
    </Svg>
  );
}

/* ── Right Rail Component ───────────────────────────────────────── */

/**
 * RightRail - Right sidebar with security metrics, score gauge, and premium upgrade.
 *
 * Displays four cards in a vertical layout:
 * 1. Security Overview - Hexagonal radar chart showing 6 security dimensions
 * 2. Security Score - Semicircle gauge (0-100%) with security checklist
 * 3. Secure Share - List of shared contacts with status indicators
 * 4. Unlock Premium - Feature list with diamond imagery and upgrade CTA
 *
 * @remarks
 * - Security Overview uses SVG radar with gradient stroke
 * - Score gauge shows visual progress arc with glowing end dot
 * - Checklist items marked complete/incomplete with icons
 * - Share list shows avatars with custom colors per contact
 * - Premium card includes diamond image with glow effects
 */
export function RightRail() {
  const router = useRouter();
  const { modal } = useInAppModal();
  const { vaults, files } = useVaultStore();
  const { email } = useAuthStore();
  const [hoveredMetric, setHoveredMetric] = useState<number | null>(null);
  // GUI-02: Initialize with empty arrays — no mock data
  const [shareEntries, setShareEntries] = useState<{ id: string; name: string; subtitle: string; avatarLabel: string; avatarColor: string; accent?: string }[]>([]);
  const [dynamicChecklist, setDynamicChecklist] = useState<{ id: string; label: string; complete: boolean }[]>([
    { id: 'post-quantum', label: 'Post-Quantum', complete: true },
    { id: 'policies', label: 'PQC Policies', complete: true },
    { id: 'fido2', label: 'Hardware Key', complete: false },
    { id: 'files', label: 'Files Encrypted', complete: false },
  ]);
  const [dynamicScore, setDynamicScore] = useState(70);
  const [passwordCount, setPasswordCount] = useState(0);

  // GUI-04: Compute real security radar metrics from actual service data
  const metrics = useMemo(() => {
    const fileCount = files.length || 0;
    const filesScore = fileCount > 0 ? Math.min(0.95, 0.5 + fileCount * 0.05) : 0.3;
    const auditCount = auditService.getCount();
    const sessionsScore = auditCount > 0 ? Math.min(0.92, 0.5 + auditCount * 0.02) : 0.4;
    // Real password score from passwordService
    const pwScore = passwordCount > 0 ? Math.min(0.95, 0.4 + passwordCount * 0.06) : 0.25;
    // Sharing score from real share count
    const shareCount = shareEntries.length;
    const sharingScore = shareCount > 0 ? Math.min(0.92, 0.6 + shareCount * 0.08) : 0.35;
    // Privacy score from settings
    const settings = settingsService.load();
    const privacyScore = (settings.biometricLockEnabled ? 0.3 : 0) + (settings.twoFactorEnabled ? 0.3 : 0) + 0.35;

    return [
      { id: 'files', label: 'Files', value: filesScore },
      { id: 'passwords', label: 'Passwords', value: pwScore },
      { id: 'backups', label: 'Backups', value: vaults.length > 1 ? 0.9 : 0.5 },
      { id: 'sessions', label: 'Sessions', value: sessionsScore },
      { id: 'sharing', label: 'Sharing', value: sharingScore },
      { id: 'privacy', label: 'Privacy', value: Math.min(privacyScore, 0.95) },
    ];
  }, [files.length, vaults.length, passwordCount, shareEntries.length]);

  // GUI-02/03: Load real share contacts and compute security posture
  const refreshData = useCallback(async () => {
    try {
      // Load real password count
      const pwEntries = await passwordService.loadEntries();
      setPasswordCount(pwEntries.length);

      // Load real share contacts
      const allShares = shareService.getAllShares();
      const emailMap = new Map<string, { count: number; latest: string }>();
      allShares.forEach(s => {
        const other = s.senderEmail === email ? s.recipientEmail : s.senderEmail;
        const existing = emailMap.get(other) || { count: 0, latest: '' };
        existing.count++;
        if (s.createdAt > existing.latest) existing.latest = s.createdAt;
        emailMap.set(other, existing);
      });
      const colors = ['#C084FC', '#22D3EE', '#60A5FA', '#F472B6', '#34D399'];
      let i = 0;
      const entries = Array.from(emailMap.entries()).slice(0, 3).map(([addr, info]) => {
        const parts = addr.split('@')[0].split(/[._-]/);
        const name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        const initials = parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0].substring(0, 2).toUpperCase();
        return {
          id: addr,
          name,
          subtitle: `Shared ${info.count} file${info.count > 1 ? 's' : ''}`,
          avatarLabel: initials,
          avatarColor: colors[i++ % colors.length],
        };
      });
      setShareEntries(entries); // GUI-02: Always set real data, even if empty

      // GUI-03: Compute security checklist from real state
      const fileCount = files.length || 0;
      const fido2Count = fido2Service.getDeviceCount();
      const settings = settingsService.load();
      setDynamicChecklist([
        { id: 'post-quantum', label: 'Post-Quantum', complete: true },
        { id: 'biometric', label: 'Biometric Lock', complete: settings.biometricLockEnabled },
        { id: 'fido2', label: 'Hardware Key', complete: fido2Count > 0 },
        { id: 'files', label: 'Files Encrypted', complete: fileCount > 0 },
      ]);

      // GUI-03: Compute security score from all real metrics
      let score = 50; // Base score for having PQC
      if (fileCount > 0) score += 8;
      if (fido2Count > 0) score += 12;
      if (vaults.length > 0) score += 5;
      if (auditService.getCount() > 0) score += 5;
      if (settings.biometricLockEnabled) score += 8;
      if (settings.twoFactorEnabled) score += 7;
      if (pwEntries.length > 0) score += 5;
      setDynamicScore(Math.min(score, 100));
    } catch { /* ignore */ }
  }, [email, files.length, vaults.length]);

  useEffect(() => { refreshData(); }, [refreshData]);

  const handleUpgradeNow = () => {
    router.push('/(tabs)/premium' as any);
  };

  return (
    <>
      <InAppModal config={modal} />
      <View style={styles.wrap}>
      {/* Security Overview — Radar Chart with Hover Tooltips */}
      <View style={[styles.card, styles.overviewCard, glassPanelStrong, webOnlyGlass, webOnlyGlowTier3]}>
        <View style={styles.cardSheen} />
        <View style={styles.cardInnerBorder} />
        <Text style={styles.cardTitle}>Security Overview</Text>
        <View style={styles.radarWrap}>
          <RadarChart metrics={metrics} />
          {/* Label overlays — one per axis, placed just outside each axis tip */}
          {metrics.map((metric, idx) => {
            const angle = (Math.PI * 2 * idx) / metrics.length - Math.PI / 2;
            const svgCenter = 246 / 2;
            const scale = 236 / 246;
            const axisRadius = 82;
            const GAP = 6;
            const labelW = 68;
            const labelH = 20;

            // SVG is 236×236 centered inside the 290×260 radarWrap
            const svgOffsetX = (290 - 236) / 2; // 27px
            const svgOffsetY = (260 - 236) / 2; // 12px

            // Axis tip position in radarWrap coords
            const axisX = svgOffsetX + (svgCenter + Math.cos(angle) * axisRadius) * scale;
            const axisY = svgOffsetY + (svgCenter + Math.sin(angle) * axisRadius) * scale;

            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            // Place label so it extends OUTWARD from the axis tip
            let labelLeft: number;
            let labelTop: number;

            if (cosA >= 0.4) {
              labelLeft = axisX + GAP;
            } else if (cosA <= -0.4) {
              labelLeft = axisX - GAP - labelW;
            } else {
              labelLeft = axisX - labelW / 2;
            }

            if (sinA >= 0.4) {
              labelTop = axisY + GAP;
            } else if (sinA <= -0.4) {
              labelTop = axisY - GAP - labelH;
            } else {
              labelTop = axisY - labelH / 2;
            }

            // Text flows AWAY from the graph on every axis:
            // right-side → left-aligned (text starts at axis tip, reads outward)
            // left-side  → right-aligned (text ends at axis tip, reads outward)
            // top/bottom → centered
            const textAlign: 'left' | 'right' | 'center' =
              cosA >= 0.4 ? 'left' : cosA <= -0.4 ? 'right' : 'center';

            return (
              <Pressable
                key={`hover-${metric.id}`}
                onHoverIn={() => setHoveredMetric(idx)}
                onHoverOut={() => setHoveredMetric(null)}
                onPressIn={() => setHoveredMetric(idx)}
                onPressOut={() => setHoveredMetric(null)}
                style={[
                  styles.radarHitZone,
                  {
                    left: labelLeft,
                    top: labelTop,
                    width: labelW,
                    height: labelH,
                  },
                ]}
              >
                <Text style={[styles.radarHitLabel, { textAlign }]}>{metric.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {/* Tooltip — appears below the chart when hovering */}
        {hoveredMetric !== null && metrics[hoveredMetric] && (() => {
          const m = metrics[hoveredMetric];
          const tip = getRadarTooltip(m.id, m.value);
          return (
            <View style={styles.radarTooltip}>
              <View style={styles.tooltipHeader}>
                <Text style={styles.tooltipTitle}>{m.label}</Text>
                <View style={[styles.tooltipBadge, { backgroundColor: tip.statusColor + '22', borderColor: tip.statusColor + '55' }]}>
                  <View style={[styles.tooltipDot, { backgroundColor: tip.statusColor }]} />
                  <Text style={[styles.tooltipBadgeText, { color: tip.statusColor }]}>{tip.status}</Text>
                </View>
              </View>
              <Text style={styles.tooltipCurrent}>{tip.current}</Text>
              {tip.suggestions.map((s, i) => (
                <View key={i} style={styles.tooltipSuggestionRow}>
                  <Feather
                    name={tip.statusColor === '#4ADE80' ? 'check-circle' : 'arrow-right'}
                    size={11}
                    color={tip.statusColor === '#4ADE80' ? '#4ADE80' : '#A855F7'}
                  />
                  <Text style={styles.tooltipSuggestion}>{s}</Text>
                </View>
              ))}
            </View>
          );
        })()}
      </View>

      {/* Security Score — Gauge Ring */}
      <View style={[styles.card, styles.scoreCard, glassPanelStrong, webOnlyGlass, webOnlyGlowTier3]}>
        <View style={styles.cardSheen} />
        <View style={styles.cardInnerBorder} />
        <Text style={styles.cardTitle}>Security Score</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreRingWrap}>
            <ScoreGauge score={dynamicScore} />
            <View style={styles.scoreLabelWrap}>
              <Text style={styles.scoreValue}>{dynamicScore}%</Text>
              <Text style={styles.scoreStatus}>{dynamicScore >= 90 ? 'Excellent' : dynamicScore >= 75 ? 'Good' : 'Needs Work'}</Text>
            </View>
          </View>

          <View style={styles.checkListWrap}>
            {dynamicChecklist.map((item) => (
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

      {/* Secure Share */}
      <View style={[styles.card, styles.shareCard, glassPanelStrong, webOnlyGlass, webOnlyGlowTier3]}>
        <View style={styles.cardSheen} />
        <View style={styles.cardInnerBorder} />
        <Text style={styles.cardTitle}>Secure Share</Text>
        <View style={styles.shareList}>
          {shareEntries.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
              <Feather name="share-2" size={28} color="rgba(139,92,246,0.35)" />
              <Text style={{ color: dashboardColors.textSecondary, fontSize: 13, textAlign: 'center' }}>
                No active shares yet
              </Text>
              <Text style={{ color: dashboardColors.textSecondary, fontSize: 11, opacity: 0.6, textAlign: 'center' }}>
                Share files securely with contacts
              </Text>
            </View>
          ) : (
            shareEntries.map((entry) => (
              <Pressable key={entry.id} style={(state: any) => [styles.shareRow, state.hovered && styles.shareRowHovered]}>
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
            ))
          )}
        </View>
      </View>

      {/* Unlock Premium */}
      <View style={[styles.card, styles.upgradeCard, glassPanelStrong, webOnlyGlass, webOnlyGlowTier3]}>
        <View style={styles.cardSheen} />
        <View style={styles.cardInnerBorder} />
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

          <View style={styles.diamondWrap}>
            <Image source={premiumDiamondAsset} style={styles.diamondImg} resizeMode="contain" />
          </View>
        </View>

        <Pressable
          style={(state: any) => [styles.upgradeBtn, state.hovered && styles.upgradeBtnHovered]}
          onPress={handleUpgradeNow}
        >
          <Text style={styles.upgradeBtnText}>Upgrade Now</Text>
        </Pressable>
      </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 330,
    gap: dashboardSpacing.sm + 2,
    paddingBottom: dashboardSpacing.sm + 2,
  },
  card: {
    ...webOnlyGlassLuxury,
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    padding: 16,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(18,12,40,0.65)',
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
    ...webOnly({ background: 'linear-gradient(160deg, rgba(139,92,246,0.18), rgba(34,211,238,0.06))' }),
  },
  cardSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 62,
    ...webOnly({ background: 'linear-gradient(180deg, rgba(245,243,255,0.09), rgba(245,243,255,0))' }),
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
  overviewCard: {
    minHeight: 296,
    overflow: 'visible',
  },
  scoreCard: {
    minHeight: 220,
    paddingBottom: 12,
  },
  shareCard: {
    minHeight: 242,
  },
  upgradeCard: {
    minHeight: 188,
    paddingBottom: 12,
  },
  cardTitle: {
    color: dashboardColors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  radarWrap: {
    width: 290,
    height: 260,
    marginTop: 6,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  radarHitZone: {
    position: 'absolute',
    zIndex: 10,
    justifyContent: 'center',
    ...webOnly({ cursor: 'pointer' }),
  },
  radarHitLabel: {
    color: '#B8B3D1',
    fontSize: 13,
    fontWeight: '500',
    ...webOnly({ userSelect: 'none' }),
  },
  radarTooltip: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    backgroundColor: 'rgba(15,10,35,0.95)',
    ...webOnly({
      backdropFilter: 'blur(16px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 16px rgba(168,85,247,0.15)',
      animation: 'fadeIn 0.15s ease-out',
    }),
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tooltipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tooltipCurrent: {
    color: '#B0B0B0',
    fontSize: 12,
    marginBottom: 6,
  },
  tooltipSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  tooltipSuggestion: {
    color: '#D4D0E8',
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  scoreRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  scoreRingWrap: {
    width: 180,
    height: 150,
    position: 'relative',
  },
  scoreLabelWrap: {
    position: 'absolute',
    top: 55,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scoreValue: {
    color: dashboardColors.textPrimary,
    fontSize: 42,
    fontWeight: '800',
    ...webOnly({ textShadow: '0 0 22px rgba(139,92,246,0.42)' }),
  },
  scoreStatus: {
    color: '#86EFAC',
    fontSize: 14,
    fontWeight: '600',
    marginTop: -2,
  },
  checkListWrap: {
    flex: 1,
    gap: 7,
    justifyContent: 'center',
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  checkItemText: {
    color: dashboardColors.textSecondary,
    fontSize: 14,
  },
  shareList: {
    marginTop: 8,
    gap: 8,
  },
  shareRow: {
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(18,12,40,0.72)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...webOnly({
      boxShadow: '0 0 12px rgba(139,92,246,0.2), inset 0 0 16px rgba(139,92,246,0.16)',
      background: 'linear-gradient(145deg, rgba(139,92,246,0.16), rgba(34,211,238,0.06))',
    }),
  },
  shareRowHovered: {
    borderColor: 'rgba(34,211,238,0.4)',
    backgroundColor: 'rgba(39,23,72,0.78)',
    ...webOnly({ boxShadow: '0 0 16px rgba(139,92,246,0.28), inset 0 0 14px rgba(34,211,238,0.1)' }),
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
    position: 'relative',
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
  diamondWrap: {
    position: 'absolute',
    right: -50,
    top: 0,
    bottom: 0,
    width: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamondImg: {
    width: 240,
    height: 240,
  },
  upgradeBtn: {
    ...webOnlyGlowTier2,
    ...webOnlyTransition,
    marginTop: 10,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.44)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(57,31,95,0.95)',
    ...webOnly({
      background: 'linear-gradient(135deg,#8b5cf6 0%, #22d3ee 100%)',
      boxShadow: '0 8px 25px rgba(139,92,246,0.45), 0 0 20px rgba(34,211,238,0.35)',
    }),
  },
  upgradeBtnHovered: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 12px 40px rgba(139,92,246,0.6), 0 0 30px rgba(34,211,238,0.45)',
    }),
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
