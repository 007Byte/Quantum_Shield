import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Image, Pressable, Text, View } from 'react-native';
import { InAppModal, useInAppModal } from '@/components/common';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/theme/engine';

// GUI-02/03/04: No longer importing mock data — all metrics from real services
import { shareService } from '@/services/shareService';
import { passwordService } from '@/services/passwordService';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useAuthStore } from '@/stores/authStore';
import { fido2Service } from '@/services/fido2Service';
import { auditService } from '@/services/auditService';
import { settingsService } from '@/services/settingsService';
import {
  dashboardColors,
  glassPanelStrong,
  webOnlyGlass,
  webOnlyGlowTier3,
} from './styles';

import { RadarChart, ScoreGauge, getRadarTooltip, rightRailStyles as styles } from './right-rail';

const premiumDiamondAsset = require('../../../assets/diamond.png');

/* ── Right Rail Component ───────────────────────────────────────── */

/**
 * RightRail - Right sidebar with security metrics, score gauge, and premium upgrade.
 *
 * Displays four cards in a vertical layout:
 * 1. Security Overview - Hexagonal radar chart showing 6 security dimensions
 * 2. Security Score - Semicircle gauge (0-100%) with security checklist
 * 3. Secure Share - List of shared contacts with status indicators
 * 4. Unlock Premium - Feature list with diamond imagery and upgrade CTA
 */
export function RightRail() {
  const { colorScheme } = useTheme();
  const isLight = colorScheme === 'light';
  const router = useRouter();
  const { modal } = useInAppModal();
  const vaults = useVaultListStore(s => s.vaults);
  const files = useVaultListStore(s => s.files);
  const { email } = useAuthStore();
  const { t } = useLanguage();
  const [hoveredMetric, setHoveredMetric] = useState<number | null>(null);
  // GUI-02: Initialize with empty arrays — no mock data
  const [shareEntries, setShareEntries] = useState<
    {
      id: string;
      name: string;
      subtitle: string;
      avatarLabel: string;
      avatarColor: string;
      accent?: string;
    }[]
  >([]);
  const [dynamicChecklist, setDynamicChecklist] = useState<
    { id: string; label: string; complete: boolean }[]
  >([
    { id: 'post-quantum', label: 'rightRail.postQuantum', complete: true },
    { id: 'policies', label: 'rightRail.pqcPolicies', complete: true },
    { id: 'fido2', label: 'rightRail.hardwareKey', complete: false },
    { id: 'files', label: 'rightRail.filesEncrypted', complete: false },
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
    const privacyScore =
      (settings.biometricLockEnabled ? 0.3 : 0) + (settings.twoFactorEnabled ? 0.3 : 0) + 0.35;

    return [
      { id: 'files', label: 'rightRail.files', value: filesScore },
      { id: 'passwords', label: 'rightRail.passwords', value: pwScore },
      { id: 'backups', label: 'rightRail.backups', value: vaults.length > 1 ? 0.9 : 0.5 },
      { id: 'sessions', label: 'rightRail.sessions', value: sessionsScore },
      { id: 'sharing', label: 'rightRail.sharing', value: sharingScore },
      { id: 'privacy', label: 'rightRail.privacy', value: Math.min(privacyScore, 0.95) },
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
      const entries = Array.from(emailMap.entries())
        .slice(0, 3)
        .map(([addr, info]) => {
          const parts = addr.split('@')[0].split(/[._-]/);
          const name = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          const initials =
            parts.length >= 2
              ? (parts[0][0] + parts[1][0]).toUpperCase()
              : parts[0].substring(0, 2).toUpperCase();
          return {
            id: addr,
            name,
            subtitle: t('rightRail.sharedFiles', { count: info.count }),
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
        { id: 'post-quantum', label: 'rightRail.postQuantum', complete: true },
        { id: 'biometric', label: 'rightRail.biometricLock', complete: settings.biometricLockEnabled },
        { id: 'fido2', label: 'rightRail.hardwareKey', complete: fido2Count > 0 },
        { id: 'files', label: 'rightRail.filesEncrypted', complete: fileCount > 0 },
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
    } catch {
      /* ignore */
    }
  }, [email, files.length, vaults.length]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleUpgradeNow = () => {
    router.navigate('/(tabs)/premium' as any);
  };

  return (
    <>
      <InAppModal config={modal} />
      <View style={styles.wrap}>
        {/* Security Overview — Radar Chart with Hover Tooltips */}
        <View
          style={[
            styles.card,
            styles.overviewCard,
            glassPanelStrong,
            webOnlyGlass,
            webOnlyGlowTier3,
            isLight && styles.cardLight,
          ]}
        >
          <View style={[styles.cardSheen, isLight && styles.cardSheenLight]} />
          <View style={styles.cardInnerBorder} />
          <Text style={styles.cardTitle}>{t('rightRail.securityOverview')}</Text>
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

              // SVG is 236x236 centered inside the 290x260 radarWrap
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
                  <Text style={[styles.radarHitLabel, { textAlign }]}>{t(metric.label)}</Text>
                </Pressable>
              );
            })}
          </View>
          {/* Tooltip — appears below the chart when hovering */}
          {hoveredMetric !== null &&
            metrics[hoveredMetric] &&
            (() => {
              const m = metrics[hoveredMetric];
              const tip = getRadarTooltip(m.id, m.value, t);
              return (
                <View style={styles.radarTooltip}>
                  <View style={styles.tooltipHeader}>
                    <Text style={styles.tooltipTitle}>{t(m.label)}</Text>
                    <View
                      style={[
                        styles.tooltipBadge,
                        {
                          backgroundColor: tip.statusColor + '22',
                          borderColor: tip.statusColor + '55',
                        },
                      ]}
                    >
                      <View style={[styles.tooltipDot, { backgroundColor: tip.statusColor }]} />
                      <Text style={[styles.tooltipBadgeText, { color: tip.statusColor }]}>
                        {t(`rightRail.${tip.status}`)}
                      </Text>
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
        <View
          style={[styles.card, styles.scoreCard, glassPanelStrong, webOnlyGlass, webOnlyGlowTier3, isLight && styles.cardLight]}
        >
          <View style={[styles.cardSheen, isLight && styles.cardSheenLight]} />
          <View style={styles.cardInnerBorder} />
          <Text style={styles.cardTitle}>{t('rightRail.securityScore')}</Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreRingWrap}>
              <ScoreGauge score={dynamicScore} />
              <View style={styles.scoreLabelWrap}>
                <Text style={styles.scoreValue}>{dynamicScore}%</Text>
                <Text style={styles.scoreStatus}>
                  {dynamicScore >= 90 ? t('rightRail.excellent') : dynamicScore >= 75 ? t('rightRail.good') : t('rightRail.needsWork')}
                </Text>
              </View>
            </View>

            <View style={styles.checkListWrap}>
              {dynamicChecklist.map(item => (
                <View key={item.id} style={styles.checkItem}>
                  <Ionicons
                    name={item.complete ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={item.complete ? dashboardColors.green : dashboardColors.textSecondary}
                  />
                  <Text style={styles.checkItemText}>{t(item.label)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Secure Share */}
        <View
          style={[styles.card, styles.shareCard, glassPanelStrong, webOnlyGlass, webOnlyGlowTier3, isLight && styles.cardLight]}
        >
          <View style={[styles.cardSheen, isLight && styles.cardSheenLight]} />
          <View style={styles.cardInnerBorder} />
          <Text style={styles.cardTitle}>{t('rightRail.secureShare')}</Text>
          <View style={styles.shareList}>
            {shareEntries.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24, gap: 8 }}>
                <Feather name="share-2" size={28} color="rgba(139,92,246,0.35)" />
                <Text
                  style={{
                    color: dashboardColors.textSecondary,
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  {t('rightRail.noSharesYet')}
                </Text>
                <Text
                  style={{
                    color: dashboardColors.textSecondary,
                    fontSize: 11,
                    opacity: 0.6,
                    textAlign: 'center',
                  }}
                >
                  {t('rightRail.shareSecurely')}
                </Text>
              </View>
            ) : (
              shareEntries.map(entry => (
                <Pressable
                  key={entry.id}
                  style={(state: any) => [styles.shareRow, state.hovered && styles.shareRowHovered]}
                >
                  <View style={[styles.avatar, { backgroundColor: entry.avatarColor }]}>
                    <Text style={styles.avatarText}>{entry.avatarLabel}</Text>
                  </View>

                  <View style={styles.shareTextWrap}>
                    <Text style={styles.shareName}>{entry.name}</Text>
                    <Text
                      style={[styles.shareSubtitle, entry.accent ? { color: entry.accent } : null]}
                    >
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
        <View
          style={[
            styles.card,
            styles.upgradeCard,
            glassPanelStrong,
            webOnlyGlass,
            webOnlyGlowTier3,
            isLight && styles.cardLight,
          ]}
        >
          <View style={[styles.cardSheen, isLight && styles.cardSheenLight]} />
          <View style={styles.cardInnerBorder} />
          <Text style={styles.cardTitle}>{t('rightRail.unlockPremium')}</Text>
          <View style={styles.upgradeRow}>
            <View style={styles.bulletsWrap}>
              <View style={styles.bulletRow}>
                <Ionicons name="checkmark" size={16} color={dashboardColors.cyan} />
                <Text style={styles.bulletText}>{t('rightRail.quantumFirewall')}</Text>
              </View>
              <View style={styles.bulletRow}>
                <Ionicons name="checkmark" size={16} color={dashboardColors.cyan} />
                <Text style={styles.bulletText}>{t('rightRail.prioritySupport')}</Text>
              </View>
              <View style={styles.bulletRow}>
                <Ionicons name="checkmark" size={16} color={dashboardColors.cyan} />
                <Text style={styles.bulletText}>{t('rightRail.unlimitedStorage')}</Text>
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
            <Text style={styles.upgradeBtnText}>{t('rightRail.upgradeNow')}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
