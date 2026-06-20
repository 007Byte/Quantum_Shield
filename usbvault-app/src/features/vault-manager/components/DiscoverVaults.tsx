/**
 * DiscoverVaults — USB scan results, detected vaults, known locations, last scan info.
 * Pure presentational: all state and actions come via props.
 */
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import {
  dashboardSpacing,
  dashboardLayout,
  webOnlyTransition,
} from '@/components/dashboard2/styles';
import type { DetectedVault, KnownLocation } from '../domain/vault-manager.types';
import { getStatusColor, getStatusLabel } from '../domain/vault-manager.types';

interface DiscoverVaultsProps {
  isScanning: boolean;
  detectedVaults: DetectedVault[];
  knownLocations: KnownLocation[];
  lastScanTime: string | null;
  onScanAll: () => void;
  onOpenVault: (id: string) => void;
  onEjectVault: (id: string, path: string) => void;
  onRemoveLocation: (id: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function DiscoverVaults({
  isScanning,
  detectedVaults,
  knownLocations,
  lastScanTime,
  onScanAll,
  onOpenVault,
  onEjectVault,
  onRemoveLocation,
  t,
}: DiscoverVaultsProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.sectionContainer, resolveLayerStyle(theme.L2.base)]}>
      <View style={styles.sectionHeaderRow}>
        <Feather name="search" size={18} color={theme.semantic.cyan} />
        <Text
          style={[styles.sectionTitle, { color: theme.L2.base.text.primary }]}
          accessibilityRole="header"
        >
          {t('vaultManager.discoverVaults')}
        </Text>
      </View>

      {/* Scan button */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [
          styles.scanButton,
          webOnlyTransition,
          state.hovered && styles.scanButtonHover,
        ]}
        onPress={onScanAll}
        disabled={isScanning}
      >
        <Feather name="search" size={18} color="#FFFFFF" />
        <Text style={styles.scanButtonText}>
          {isScanning ? t('findVault.pleaseWait') : t('findVault.scanAllDrives')}
        </Text>
      </Pressable>

      {/* Scanning spinner */}
      {isScanning && (
        <View style={styles.scanningContainer}>
          <ActivityIndicator size="large" color="#06b6d4" />
          <Text style={[styles.scanningText, { color: theme.L2.base.text.secondary }]}>
            {t('vaultManager.scanningDrives')}
          </Text>
        </View>
      )}

      {/* Detected vaults */}
      {!isScanning && detectedVaults.length > 0 && (
        <View style={styles.detectedSection}>
          <View style={styles.detectedHeaderRow}>
            <Feather name="box" size={16} color={theme.L2.base.text.secondary} />
            <Text style={[styles.detectedTitle, { color: theme.L2.base.text.primary }]}>
              {t('findVault.detectedVaults')}
            </Text>
            <Text style={[styles.countBadge, { color: theme.L2.base.text.secondary }]}>
              {detectedVaults.length}
            </Text>
          </View>
          {detectedVaults.map(vault => (
            <DetectedVaultCard
              key={vault.id}
              vault={vault}
              onOpen={onOpenVault}
              onEject={onEjectVault}
              t={t}
            />
          ))}
        </View>
      )}

      {/* No vaults found */}
      {!isScanning && detectedVaults.length === 0 && lastScanTime && (
        <View style={styles.noDetectedContainer}>
          <Feather name="inbox" size={32} color={theme.L2.base.text.secondary} />
          <Text style={[styles.noDetectedText, { color: theme.L2.base.text.secondary }]}>
            {t('vaultManager.noVaultsFound')}
          </Text>
        </View>
      )}

      {/* Known Locations */}
      {knownLocations.length > 0 && (
        <View style={styles.knownLocationsSection}>
          <View style={styles.detectedHeaderRow}>
            <Feather name="folder" size={16} color={theme.L2.base.text.secondary} />
            <Text style={[styles.detectedTitle, { color: theme.L2.base.text.primary }]}>
              {t('findVault.knownLocations')}
            </Text>
            <Text style={[styles.countBadge, { color: theme.L2.base.text.secondary }]}>
              {knownLocations.length}
            </Text>
          </View>
          {knownLocations.map(loc => (
            <View
              key={loc.id}
              style={[
                styles.locationCard,
                { backgroundColor: 'rgba(139,92,246,0.06)', borderColor: 'rgba(139,92,246,0.12)' },
              ]}
            >
              <View style={styles.locationContent}>
                <Feather name="folder" size={16} color={theme.semantic.blue} />
                <Text style={[styles.locationPath, { color: theme.L2.base.text.primary }]}>
                  {loc.path}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                style={(state: any) => [
                  styles.removeLocationBtn,
                  state.hovered && styles.removeLocationBtnHover,
                ]}
                onPress={() => onRemoveLocation(loc.id)}
              >
                <Feather name="x" size={14} color="#ef4444" />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Last scan info */}
      {lastScanTime && (
        <View style={styles.lastScanRow}>
          <Feather name="clock" size={14} color="#a78bfa" />
          <Text style={[styles.lastScanLabel, { color: theme.L2.base.text.secondary }]}>
            {t('findVault.lastScanned')}
          </Text>
          <Text style={[styles.lastScanTime, { color: theme.L2.base.text.primary }]}>
            {lastScanTime}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [styles.refreshBtn, state.hovered && styles.refreshBtnHover]}
            onPress={onScanAll}
          >
            <Feather name="refresh-cw" size={14} color="#06b6d4" />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Detected Vault Card (private sub-component) ─────────────────────

function DetectedVaultCard({
  vault,
  onOpen,
  onEject,
  t,
}: {
  vault: DetectedVault;
  onOpen: (id: string) => void;
  onEject: (id: string, path: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.detectedCard,
        { backgroundColor: 'rgba(139,92,246,0.08)', borderColor: 'rgba(139,92,246,0.18)' },
      ]}
    >
      <View style={styles.detectedCardLeft}>
        <View style={styles.detectedIcon}>
          <Feather name="lock" size={20} color={theme.semantic.purple} />
        </View>
        <View style={styles.detectedInfo}>
          <Text style={[styles.detectedName, { color: theme.L2.base.text.primary }]}>
            {vault.name}
          </Text>
          <Text style={[styles.detectedPath, { color: theme.L2.base.text.secondary }]}>
            {vault.path}
          </Text>
          <View style={styles.detectedMeta}>
            <Text style={[styles.detectedSize, { color: theme.L2.base.text.secondary }]}>
              {vault.size}
            </Text>
            <View style={[styles.statusBadge, { borderColor: getStatusColor(vault.status) }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(vault.status) }]} />
              <Text style={[styles.statusBadgeText, { color: theme.L2.base.text.secondary }]}>
                {getStatusLabel(vault.status)}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [
          styles.detectedAction,
          vault.status === 'healthy' ? styles.detectedActionOpen : styles.detectedActionRepair,
          state.hovered && styles.detectedActionHover,
        ]}
        onPress={() => {
          if (vault.status === 'healthy' && vault.id) {
            onOpen(vault.id);
          }
        }}
      >
        <Feather
          name={vault.status === 'healthy' ? 'arrow-right' : 'tool'}
          size={16}
          color="#FFFFFF"
        />
        <Text style={styles.detectedActionText}>
          {vault.status === 'healthy' ? t('findVault.open') : t('findVault.repair')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [
          styles.detectedAction,
          { backgroundColor: 'rgba(255,107,107,0.2)', borderColor: 'rgba(255,107,107,0.4)' },
          state.hovered && { opacity: 0.8 },
        ]}
        onPress={() => onEject(vault.id, vault.path)}
      >
        <Feather name="power" size={16} color="#FF6B6B" />
        <Text style={[styles.detectedActionText, { color: '#FF6B6B' }]}>
          {t('vaultManager.eject') || 'Eject'}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: dashboardSpacing.lg,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: dashboardSpacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(139,92,246,0.1)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: dashboardLayout.radiusXl,
    marginBottom: dashboardSpacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)',
      cursor: 'pointer',
    }),
    backgroundColor: '#a855f7',
  },
  scanButtonHover: {
    ...webOnly({ transform: 'translateY(-2px)', boxShadow: '0 0 30px rgba(139,92,246,0.5)' }),
  },
  scanButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  scanningContainer: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg,
    gap: dashboardSpacing.md,
  },
  scanningText: {
    fontSize: 14,
  },
  detectedSection: {
    marginTop: dashboardSpacing.md,
  },
  detectedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: dashboardSpacing.sm,
  },
  detectedTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  detectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.18)',
    marginBottom: 8,
  },
  detectedCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detectedIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(168,85,247,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: dashboardSpacing.md,
  },
  detectedInfo: { flex: 1 },
  detectedName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  detectedPath: {
    fontSize: 12,
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  detectedMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  detectedSize: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detectedAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginLeft: dashboardSpacing.md,
    gap: 6,
    minWidth: 80,
    borderWidth: 1,
  },
  detectedActionOpen: {
    backgroundColor: 'rgba(16,185,129,0.2)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  detectedActionRepair: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  detectedActionHover: {
    ...webOnly({ transform: 'translateY(-1px)' }),
  },
  detectedActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  noDetectedContainer: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg,
    gap: 8,
  },
  noDetectedText: {
    fontSize: 14,
  },
  knownLocationsSection: {
    marginTop: dashboardSpacing.md,
    paddingTop: dashboardSpacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.1)',
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.12)',
    marginBottom: 6,
  },
  locationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  locationPath: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  removeLocationBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  removeLocationBtnHover: {
    backgroundColor: 'rgba(239,68,68,0.25)',
  },
  lastScanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'rgba(168,85,247,0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.15)',
  },
  lastScanLabel: {
    fontSize: 12,
  },
  lastScanTime: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(6,182,212,0.1)',
  },
  refreshBtnHover: {
    backgroundColor: 'rgba(6,182,212,0.25)',
  },
});
