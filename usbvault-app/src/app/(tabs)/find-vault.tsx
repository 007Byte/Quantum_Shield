import { ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardLayout, dashboardSpacing } from '@/components/dashboard2/styles';
import { useLanguage } from '@/hooks/useLanguage';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { usbService } from '@/services/usbService';

type VaultStatus = 'healthy' | 'corrupted' | 'locked';

interface DetectedVault {
  id: string;
  name: string;
  path: string;
  size: string;
  status: VaultStatus;
}

interface KnownLocation {
  id: string;
  path: string;
}

function FindVaultScreen() {
  const { t } = useLanguage();
  const [isScanning, setIsScanning] = useState(false);
  const [currentScanPath, setCurrentScanPath] = useState('');
  const [detectedVaults, setDetectedVaults] = useState<DetectedVault[]>([]);
  const [knownLocations, setKnownLocations] = useState<KnownLocation[]>([]);

  const handleScanAll = useCallback(async () => {
    setIsScanning(true);
    setCurrentScanPath(t('findVault.scanningDrives') || 'Scanning USB drives...');
    try {
      const discovered = await usbService.discoverVaults();
      const vaults: DetectedVault[] = [];
      const locations: KnownLocation[] = [];

      for (const drive of discovered) {
        const vaultPartitions = drive.partitions?.filter(p => p.hasVault) ?? [];
        if (vaultPartitions.length > 0) {
          for (const p of vaultPartitions) {
            const mountPath = p.mountPoint ?? p.mountpoint ?? drive.device;
            vaults.push({
              id: drive.driveId,
              name: p.label || drive.driveName,
              path: mountPath,
              size: drive.capacity,
              status: 'healthy',
            });
            locations.push({ id: drive.driveId, path: mountPath });
          }
        } else {
          vaults.push({
            id: drive.driveId,
            name: drive.driveName,
            path: drive.device,
            size: drive.capacity,
            status: 'locked',
          });
          locations.push({ id: drive.driveId, path: drive.device });
        }
      }

      setDetectedVaults(vaults);
      setKnownLocations(locations);
    } catch {
      // Companion may not be running — show empty state
      setDetectedVaults([]);
    } finally {
      setIsScanning(false);
      setCurrentScanPath('');
    }
  }, [t]);

  // Auto-scan on mount
  useEffect(() => {
    handleScanAll();
  }, [handleScanAll]);

  const getStatusColor = (status: VaultStatus) => {
    switch (status) {
      case 'healthy':
        return '#10b981';
      case 'corrupted':
        return '#ef4444';
      case 'locked':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: VaultStatus) => {
    switch (status) {
      case 'healthy':
        return t('findVault.statusHealthy');
      case 'corrupted':
        return t('findVault.statusCorrupted');
      case 'locked':
        return t('findVault.statusLocked');
      default:
        return t('findVault.statusUnknown');
    }
  };

  const handleRemoveLocation = (id: string) => {
    setKnownLocations(knownLocations.filter(loc => loc.id !== id));
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator
      >
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentArea}>
              {/* Header Section */}
              <View style={styles.headerSection}>
                <Text style={styles.pageTitle} accessibilityRole="header">
                  {t('findVault.pageTitle')}
                </Text>
                <Text style={styles.pageSubtitle}>{t('findVault.pageSubtitle')}</Text>
              </View>

              {/* Scan All Drives Button */}
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
                onPress={handleScanAll}
                disabled={isScanning}
              >
                <View style={styles.scanButtonGradient}>
                  <Feather name="search" size={20} color="#ffffff" style={styles.scanIcon} />
                  <Text style={styles.scanButtonText}>{t('findVault.scanAllDrives')}</Text>
                </View>
              </Pressable>

              {/* Scanning Animation State */}
              {isScanning && (
                <View style={styles.scanningContainer}>
                  <View style={styles.scanningContent}>
                    <ActivityIndicator size="large" color="#06b6d4" style={styles.spinner} />
                    <Text style={styles.scanningText}>{t('findVault.scanningDrive', { drive: currentScanPath })}</Text>
                    <Text style={styles.scanningSubtext}>{t('findVault.pleaseWait')}</Text>
                  </View>
                </View>
              )}

              {/* Detected Vaults Section */}
              {!isScanning && (
                <>
                  <View style={styles.sectionHeader}>
                    <Feather name="box" size={18} color="#d4d4d8" />
                    <Text style={styles.sectionTitle} accessibilityRole="header">
                      {t('findVault.detectedVaults')}
                    </Text>
                    <Text style={styles.vaultCount}>{detectedVaults.length}</Text>
                  </View>

                  <View style={styles.vaultsList}>
                    {detectedVaults.map(vault => (
                      <View key={vault.id} style={styles.vaultCard}>
                        {/* Vault Icon and Info */}
                        <View style={styles.vaultHeader}>
                          <View style={styles.vaultIconContainer}>
                            <Feather name="lock" size={24} color="#a78bfa" />
                          </View>
                          <View style={styles.vaultInfo}>
                            <Text style={styles.vaultName}>{vault.name}</Text>
                            <Text style={styles.vaultPath}>{vault.path}</Text>
                            <View style={styles.vaultMeta}>
                              <Text style={styles.vaultSize}>{vault.size}</Text>
                              <View
                                style={[
                                  styles.statusBadge,
                                  { borderColor: getStatusColor(vault.status) },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.statusDot,
                                    { backgroundColor: getStatusColor(vault.status) },
                                  ]}
                                />
                                <Text style={styles.statusBadgeText}>
                                  {getStatusLabel(vault.status)}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>

                        {/* Action Button */}
                        <Pressable
                          accessibilityRole="button"
                          style={({ pressed }) => [
                            styles.actionButton,
                            vault.status === 'healthy' ? styles.openButton : styles.repairButton,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          <Feather
                            name={vault.status === 'healthy' ? 'arrow-right' : 'tool'}
                            size={16}
                            color="#ffffff"
                          />
                          <Text style={styles.actionButtonText}>
                            {vault.status === 'healthy' ? t('findVault.open') : t('findVault.repair')}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Known Locations Section */}
              <View style={styles.knownLocationsSection}>
                <View style={styles.sectionHeader}>
                  <Feather name="folder" size={18} color="#d4d4d8" />
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('findVault.knownLocations')}
                  </Text>
                  <Text style={styles.locationCount}>{knownLocations.length}</Text>
                </View>

                <View style={styles.locationsList}>
                  {knownLocations.map(location => (
                    <View key={location.id} style={styles.locationCard}>
                      <View style={styles.locationContent}>
                        <Feather name="folder" size={18} color="#60a5fa" />
                        <Text style={styles.locationPath}>{location.path}</Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.removeButton,
                          pressed && styles.removeButtonPressed,
                        ]}
                        onPress={() => handleRemoveLocation(location.id)}
                      >
                        <Feather name="x" size={16} color="#ef4444" />
                      </Pressable>
                    </View>
                  ))}
                </View>

                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.addLocationButton,
                    pressed && styles.addLocationButtonPressed,
                  ]}
                >
                  <Feather name="plus" size={16} color="#06b6d4" />
                  <Text style={styles.addLocationButtonText}>{t('findVault.addLocation')}</Text>
                </Pressable>
              </View>

              {/* Last Scan Info */}
              <View style={styles.lastScanSection}>
                <View style={styles.lastScanContent}>
                  <Feather name="clock" size={16} color="#a78bfa" />
                  <View style={styles.lastScanText}>
                    <Text style={styles.lastScanLabel}>{t('findVault.lastScanned')}</Text>
                    <Text style={styles.lastScanTime}>{t('findVault.lastScanTime')}</Text>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.refreshButton,
                    pressed && styles.refreshButtonPressed,
                  ]}
                >
                  <Feather name="refresh-cw" size={16} color="#06b6d4" />
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
  pageScroll: {
    flex: 1,
    width: '100%',
    ...webOnly({ overflowY: 'auto' }),
  },
  pageContent: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    alignItems: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center',
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background:
        'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(217,70,239,0.55)',
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  contentArea: {
    paddingRight: 10,
  },

  // Header
  headerSection: {
    marginBottom: dashboardSpacing.xl,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#a1a1aa',
    fontWeight: '400',
  },

  // Scan Button
  scanButton: {
    marginBottom: dashboardSpacing.xl,
    borderRadius: 12,
    overflow: 'hidden',
  },
  scanButtonPressed: {
    opacity: 0.85,
  },
  scanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    ...webOnly({
      background: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)',
    }),
    backgroundColor: '#a855f7',
  },
  scanIcon: {
    marginRight: 10,
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.3,
  },

  // Scanning State
  scanningContainer: {
    marginVertical: dashboardSpacing.xl,
    paddingVertical: dashboardSpacing.xl,
    paddingHorizontal: dashboardSpacing.lg,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.2)',
    alignItems: 'center',
  },
  scanningContent: {
    alignItems: 'center',
  },
  spinner: {
    marginBottom: dashboardSpacing.md,
  },
  scanningText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#e4e4e7',
    marginTop: dashboardSpacing.sm,
    textAlign: 'center',
  },
  scanningSubtext: {
    fontSize: 13,
    color: '#a1a1aa',
    marginTop: 6,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: dashboardSpacing.xl,
    marginBottom: dashboardSpacing.md,
    paddingBottom: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.08)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e4e4e7',
    marginLeft: 10,
    flex: 1,
  },
  vaultCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  locationCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    backgroundColor: 'rgba(107, 114, 128, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },

  // Vaults List
  vaultsList: {
    gap: dashboardSpacing.md,
    marginBottom: dashboardSpacing.lg,
  },
  vaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'rgba(51, 65, 85, 0.3)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  vaultHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  vaultIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(168, 85, 247, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: dashboardSpacing.md,
    flexShrink: 0,
  },
  vaultInfo: {
    flex: 1,
  },
  vaultName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  vaultPath: {
    fontSize: 12,
    color: '#a1a1aa',
    marginBottom: 8,
    fontFamily: 'monospace',
  },
  vaultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  vaultSize: {
    fontSize: 12,
    color: '#71717a',
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
    color: '#e4e4e7',
  },

  // Action Buttons
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: dashboardSpacing.md,
    gap: 6,
    minWidth: 90,
  },
  openButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  repairButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  actionButtonPressed: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Known Locations
  knownLocationsSection: {
    marginTop: dashboardSpacing.xl,
    paddingTop: dashboardSpacing.xl,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.08)',
  },
  locationsList: {
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.md,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'rgba(51, 65, 85, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.08)',
  },
  locationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  locationPath: {
    fontSize: 13,
    color: '#e4e4e7',
    fontWeight: '500',
    fontFamily: 'monospace',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  removeButtonPressed: {
    opacity: 0.7,
  },
  addLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.3)',
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
    gap: 8,
  },
  addLocationButtonPressed: {
    opacity: 0.75,
  },
  addLocationButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#06b6d4',
  },

  // Last Scan Info
  lastScanSection: {
    marginTop: dashboardSpacing.xl,
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastScanContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    flex: 1,
  },
  lastScanText: {
    flex: 1,
  },
  lastScanLabel: {
    fontSize: 12,
    color: '#a1a1aa',
    fontWeight: '500',
  },
  lastScanTime: {
    fontSize: 13,
    color: '#e4e4e7',
    fontWeight: '600',
    marginTop: 2,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.1)',
  },
  refreshButtonPressed: {
    opacity: 0.7,
  },
});

export default withErrorBoundary(FindVaultScreen, 'FindVault');
