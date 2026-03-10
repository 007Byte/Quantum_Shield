import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { deviceManagementService, DeviceSession } from '@/services/deviceManagementService';

export default function DevicesScreen() {
  const [sessions, setSessions] = React.useState<DeviceSession[]>([]);
  const [currentSession, setCurrentSession] = React.useState<DeviceSession | null>(null);
  const [expandedHistory, setExpandedHistory] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    loadDevices();
  }, [refreshKey]);

  const loadDevices = () => {
    const allSessions = deviceManagementService.getActiveSessions();
    const current = deviceManagementService.getCurrentSession();
    setSessions(allSessions);
    setCurrentSession(current);
  };

  const handleRevokeSession = (id: string, name: string) => {
    Alert.alert(
      'Revoke Session',
      `Are you sure you want to revoke access for ${name}?`,
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Revoke',
          onPress: async () => {
            try {
              await deviceManagementService.revokeSession(id);
              setRefreshKey((prev) => prev + 1);
            } catch (error) {
              Alert.alert('Error', 'Failed to revoke session');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleRevokeAllOthers = () => {
    Alert.alert(
      'Revoke All Other Sessions',
      'This will log out all other devices. Are you sure?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Revoke All',
          onPress: async () => {
            try {
              await deviceManagementService.revokeAllOtherSessions();
              setRefreshKey((prev) => prev + 1);
            } catch (error) {
              Alert.alert('Error', 'Failed to revoke sessions');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleTrustDevice = (id: string) => {
    deviceManagementService.trustDevice(id);
    setRefreshKey((prev) => prev + 1);
  };

  const handleUntrustDevice = (id: string) => {
    deviceManagementService.untrustDevice(id);
    setRefreshKey((prev) => prev + 1);
  };

  const getDeviceIcon = (deviceType: string): React.ComponentProps<typeof Feather>['name'] => {
    switch (deviceType) {
      case 'mobile':
        return 'smartphone';
      case 'tablet':
        return 'tablet';
      case 'desktop':
        return 'monitor';
      default:
        return 'globe';
    }
  };

  const getOSIcon = (os: string): React.ComponentProps<typeof Feather>['name'] => {
    if (os.includes('Windows')) return 'monitor';
    if (os.includes('Mac')) return 'command';
    if (os.includes('Linux')) return 'terminal';
    if (os.includes('iOS')) return 'smartphone';
    if (os.includes('Android')) return 'smartphone';
    return 'info';
  };

  const formatTimeAgo = (date: string): string => {
    const now = new Date();
    const then = new Date(date);
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const security = deviceManagementService.getSecuritySummary();
  const otherSessions = sessions.filter((s) => !s.isCurrent);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Device Management</Text>
        <Text style={styles.headerSubtitle}>
          Manage your devices and active sessions
        </Text>
      </View>

      {/* Current Device Card */}
      {currentSession && (
        <View style={[styles.card, styles.currentDeviceCard]}>
          <View style={styles.currentDeviceHeader}>
            <View style={styles.currentDeviceIconContainer}>
              <Feather
                name={getDeviceIcon(currentSession.deviceType)}
                size={24}
                color="#06B6D4"
              />
            </View>
            <View style={styles.currentDeviceInfo}>
              <Text style={styles.currentDeviceName}>
                {currentSession.deviceName}
              </Text>
              <View style={styles.badgeContainer}>
                <View style={styles.currentBadge}>
                  <Text style={styles.badgeText}>This Device</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.currentDeviceDetails}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Browser:</Text>
              <Text style={styles.detailValue}>{currentSession.browser}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location:</Text>
              <Text style={styles.detailValue}>{currentSession.location}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>IP Address:</Text>
              <Text style={styles.detailValue}>{currentSession.ipAddress}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status:</Text>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>Active</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Security Summary */}
      <View style={styles.securitySummary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{security.totalActive}</Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#22C55E' }]}>
            {security.trustedCount}
          </Text>
          <Text style={styles.summaryLabel}>Trusted</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
            {security.suspiciousCount}
          </Text>
          <Text style={styles.summaryLabel}>Suspicious</Text>
        </View>
      </View>

      {/* Revoke All Others Button */}
      {otherSessions.length > 0 && (
        <TouchableOpacity
          style={styles.revokeAllButton}
          onPress={handleRevokeAllOthers}
        >
          <Feather name="alert-circle" size={16} color="#FFFFFF" />
          <Text style={styles.revokeAllButtonText}>
            Revoke All Other Sessions
          </Text>
        </TouchableOpacity>
      )}

      {/* Active Sessions */}
      {otherSessions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Active Sessions</Text>
          {otherSessions.map((session) => (
            <View key={session.id} style={styles.card}>
              <View style={styles.sessionHeader}>
                <View style={styles.sessionIconContainer}>
                  <Feather
                    name={getDeviceIcon(session.deviceType)}
                    size={20}
                    color="#A855F7"
                  />
                </View>
                <View style={styles.sessionInfoContainer}>
                  <Text style={styles.sessionName}>{session.deviceName}</Text>
                  <View style={styles.sessionMeta}>
                    <Feather
                      name={getOSIcon(session.os)}
                      size={12}
                      color="#B0B0B0"
                    />
                    <Text style={styles.sessionMetaText}>
                      {session.os} • {session.browser}
                    </Text>
                  </View>
                </View>
                {session.isTrusted ? (
                  <View style={styles.trustedBadge}>
                    <Feather name="check-circle" size={16} color="#22C55E" />
                  </View>
                ) : (
                  <View style={styles.suspiciousBadge}>
                    <Feather name="alert-circle" size={16} color="#EF4444" />
                  </View>
                )}
              </View>

              <View style={styles.sessionDetails}>
                <View style={styles.detailRow}>
                  <Feather name="map-pin" size={14} color="#B0B0B0" />
                  <Text style={styles.sessionDetailText}>
                    {session.location}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Feather name="clock" size={14} color="#B0B0B0" />
                  <Text style={styles.sessionDetailText}>
                    Last active {formatTimeAgo(session.lastActiveAt)}
                  </Text>
                </View>
              </View>

              <View style={styles.sessionActions}>
                <TouchableOpacity
                  style={[
                    styles.trustButton,
                    session.isTrusted && styles.trustedButton,
                  ]}
                  onPress={() =>
                    session.isTrusted
                      ? handleUntrustDevice(session.id)
                      : handleTrustDevice(session.id)
                  }
                >
                  <Feather
                    name={session.isTrusted ? 'check-circle' : 'user-check'}
                    size={14}
                    color={session.isTrusted ? '#22C55E' : '#B0B0B0'}
                  />
                  <Text
                    style={[
                      styles.trustButtonText,
                      session.isTrusted && styles.trustedButtonText,
                    ]}
                  >
                    {session.isTrusted ? 'Trusted' : 'Trust'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.revokeButton}
                  onPress={() =>
                    handleRevokeSession(session.id, session.deviceName)
                  }
                >
                  <Feather name="x-circle" size={14} color="#EF4444" />
                  <Text style={styles.revokeButtonText}>Revoke</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      {/* Session History */}
      <TouchableOpacity
        style={styles.historyToggle}
        onPress={() => setExpandedHistory(!expandedHistory)}
      >
        <Text style={styles.historyToggleText}>Session History</Text>
        <Feather
          name={expandedHistory ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#A855F7"
        />
      </TouchableOpacity>

      {expandedHistory && (
        <View style={styles.historyContainer}>
          {sessions.length === 0 ? (
            <Text style={styles.emptyText}>No session history</Text>
          ) : (
            sessions.map((session, index) => (
              <View key={index} style={styles.historyItem}>
                <View style={styles.historyDot} />
                <View style={styles.historyContent}>
                  <Text style={styles.historyDeviceName}>
                    {session.deviceName}
                  </Text>
                  <Text style={styles.historyDate}>
                    Created {formatTimeAgo(session.createdAt)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      )}

      {/* Empty State */}
      {otherSessions.length === 0 && (
        <View style={styles.emptyStateContainer}>
          <Feather name="check-circle" size={48} color="#A855F7" />
          <Text style={styles.emptyStateTitle}>Only One Active Session</Text>
          <Text style={styles.emptyStateText}>
            You have no other active sessions at this time
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#B0B0B0',
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  currentDeviceCard: {
    borderColor: '#06B6D4',
    borderWidth: 1.5,
    backgroundColor: 'rgba(6, 182, 212, 0.08)',
  },
  currentDeviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  currentDeviceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(6, 182, 212, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  currentDeviceInfo: {
    flex: 1,
  },
  currentDeviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentBadge: {
    backgroundColor: 'rgba(6, 182, 212, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#06B6D4',
  },
  currentDeviceDetails: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#B0B0B0',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#22C55E',
    fontWeight: '500',
  },
  securitySummary: {
    marginHorizontal: 16,
    marginBottom: 16,
    marginTop: 8,
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#B0B0B0',
    fontWeight: '500',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  revokeAllButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  revokeAllButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 8,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sessionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sessionInfoContainer: {
    flex: 1,
  },
  sessionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionMetaText: {
    fontSize: 11,
    color: '#B0B0B0',
    marginLeft: 6,
  },
  trustedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  suspiciousBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionDetails: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  sessionDetailText: {
    fontSize: 11,
    color: '#B0B0B0',
    marginLeft: 6,
  },
  sessionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  trustButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  trustedButton: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  trustButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B0B0B0',
    marginLeft: 6,
  },
  trustedButtonText: {
    color: '#22C55E',
  },
  revokeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  revokeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
    marginLeft: 6,
  },
  historyToggle: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  historyToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  historyContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#A855F7',
    marginRight: 12,
    marginTop: 4,
  },
  historyContent: {
    flex: 1,
  },
  historyDeviceName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  historyDate: {
    fontSize: 11,
    color: '#B0B0B0',
  },
  emptyText: {
    fontSize: 13,
    color: '#B0B0B0',
    textAlign: 'center',
    paddingVertical: 12,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 32,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 12,
    marginBottom: 6,
  },
  emptyStateText: {
    fontSize: 13,
    color: '#B0B0B0',
    textAlign: 'center',
  },
});
