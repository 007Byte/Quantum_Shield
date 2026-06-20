import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { logger } from '@/utils/logger';

export function NotificationSection() {
  const { t } = useLanguage();
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
      logger.error('Failed to load notification preferences', error);
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
      logger.error('Failed to save notification preferences', error);
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
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('settings.notifications')}
        </Text>
      </View>

      {/* Security Alerts */}
      <Pressable
        accessibilityRole="button"
        onPress={handleSecurityAlertsToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>{t('settings.securityAlerts')}</Text>
          <Text style={styles.settingMeta}>{t('settings.securityAlertsDesc')}</Text>
        </View>
        <ToggleIndicator enabled={securityAlerts} />
      </Pressable>

      {/* Share Notifications */}
      <Pressable
        accessibilityRole="button"
        onPress={handleShareNotificationsToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>{t('settings.shareNotifications')}</Text>
          <Text style={styles.settingMeta}>{t('settings.shareNotificationsDesc')}</Text>
        </View>
        <ToggleIndicator enabled={shareNotifications} />
      </Pressable>

      {/* Breach Alerts */}
      <Pressable
        accessibilityRole="button"
        onPress={handleBreachAlertsToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>{t('settings.breachAlerts')}</Text>
          <Text style={styles.settingMeta}>{t('settings.breachAlertsDesc')}</Text>
        </View>
        <ToggleIndicator enabled={breachAlerts} />
      </Pressable>

      {/* System Updates */}
      <Pressable
        accessibilityRole="button"
        onPress={handleSystemUpdatesToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>{t('settings.systemUpdates')}</Text>
          <Text style={styles.settingMeta}>{t('settings.systemUpdatesDesc')}</Text>
        </View>
        <ToggleIndicator enabled={systemUpdates} />
      </Pressable>

      {/* Weekly Digest */}
      <Pressable
        accessibilityRole="button"
        onPress={handleWeeklyDigestToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>{t('settings.weeklyDigest')}</Text>
          <Text style={styles.settingMeta}>{t('settings.weeklyDigestDesc')}</Text>
        </View>
        <ToggleIndicator enabled={weeklyDigest} />
      </Pressable>
    </View>
  );
}
