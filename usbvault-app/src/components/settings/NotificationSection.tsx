import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { useState, useEffect } from 'react';

export function NotificationSection() {
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [shareNotifications, setShareNotifications] = useState(true);
  const [breachAlerts, setBreachAlerts] = useState(true);
  const [systemUpdates, setSystemUpdates] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('usbvault:notification_prefs');
      if (stored) {
        const prefs = JSON.parse(stored);
        setSecurityAlerts(prefs.securityAlerts ?? true);
        setShareNotifications(prefs.shareNotifications ?? true);
        setBreachAlerts(prefs.breachAlerts ?? true);
        setSystemUpdates(prefs.systemUpdates ?? true);
        setWeeklyDigest(prefs.weeklyDigest ?? false);
      }
    } catch (error) {
      console.error('Failed to load notification preferences', error);
    }
  }, []);

  // Save preferences to localStorage whenever they change
  const savePreferences = (updates: Record<string, boolean>) => {
    try {
      const stored = localStorage.getItem('usbvault:notification_prefs');
      const current = stored ? JSON.parse(stored) : {};
      const updated = { ...current, ...updates };
      localStorage.setItem('usbvault:notification_prefs', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save notification preferences', error);
    }
  };

  const handleSecurityAlertsToggle = () => {
    const newValue = !securityAlerts;
    setSecurityAlerts(newValue);
    savePreferences({ securityAlerts: newValue });
  };

  const handleShareNotificationsToggle = () => {
    const newValue = !shareNotifications;
    setShareNotifications(newValue);
    savePreferences({ shareNotifications: newValue });
  };

  const handleBreachAlertsToggle = () => {
    const newValue = !breachAlerts;
    setBreachAlerts(newValue);
    savePreferences({ breachAlerts: newValue });
  };

  const handleSystemUpdatesToggle = () => {
    const newValue = !systemUpdates;
    setSystemUpdates(newValue);
    savePreferences({ systemUpdates: newValue });
  };

  const handleWeeklyDigestToggle = () => {
    const newValue = !weeklyDigest;
    setWeeklyDigest(newValue);
    savePreferences({ weeklyDigest: newValue });
  };

  const ToggleIndicator = ({ enabled }: { enabled: boolean }) => (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: enabled ? dashboardColors.green : 'rgba(139,92,246,0.3)',
      }}
    />
  );

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Feather name="bell" size={18} color={dashboardColors.cyan} />
        <Text style={styles.sectionTitle}>Notifications</Text>
      </View>

      {/* Security Alerts */}
      <Pressable
        onPress={handleSecurityAlertsToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>Security Alerts</Text>
          <Text style={styles.settingMeta}>Login from new device, failed auth attempts</Text>
        </View>
        <ToggleIndicator enabled={securityAlerts} />
      </Pressable>

      {/* Share Notifications */}
      <Pressable
        onPress={handleShareNotificationsToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>Share Notifications</Text>
          <Text style={styles.settingMeta}>New shares received, accessed, or expired</Text>
        </View>
        <ToggleIndicator enabled={shareNotifications} />
      </Pressable>

      {/* Breach Alerts */}
      <Pressable
        onPress={handleBreachAlertsToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>Breach Alerts</Text>
          <Text style={styles.settingMeta}>HIBP dark web monitoring alerts</Text>
        </View>
        <ToggleIndicator enabled={breachAlerts} />
      </Pressable>

      {/* System Updates */}
      <Pressable
        onPress={handleSystemUpdatesToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>System Updates</Text>
          <Text style={styles.settingMeta}>App updates and security patches</Text>
        </View>
        <ToggleIndicator enabled={systemUpdates} />
      </Pressable>

      {/* Weekly Digest */}
      <Pressable
        onPress={handleWeeklyDigestToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>Weekly Digest</Text>
          <Text style={styles.settingMeta}>Weekly summary email</Text>
        </View>
        <ToggleIndicator enabled={weeklyDigest} />
      </Pressable>
    </View>
  );
}
