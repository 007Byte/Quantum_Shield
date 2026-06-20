import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { useState, useEffect } from 'react';
import { useLanguage } from '@/hooks/useLanguage';
import { logger } from '@/utils/logger';

export function PrivacySection() {
  const { t } = useLanguage();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [crashReportingEnabled, setCrashReportingEnabled] = useState(true);
  const [dataCollectionEnabled, setDataCollectionEnabled] = useState(false);

  // Load privacy toggles from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('usbvault:privacy_toggles');
      if (stored) {
        const prefs = JSON.parse(stored);
        setAnalyticsEnabled(prefs.analyticsEnabled ?? false);
        setCrashReportingEnabled(prefs.crashReportingEnabled ?? true);
        setDataCollectionEnabled(prefs.dataCollectionEnabled ?? false);
      }
    } catch (error) {
      logger.error('Failed to load privacy toggles', error);
    }
  }, []);

  // Save preferences to localStorage whenever they change
  const savePreferences = (updates: Record<string, boolean>) => {
    try {
      const stored = localStorage.getItem('usbvault:privacy_toggles');
      const current = stored ? JSON.parse(stored) : {};
      const updated = { ...current, ...updates };
      localStorage.setItem('usbvault:privacy_toggles', JSON.stringify(updated));
    } catch (error) {
      logger.error('Failed to save privacy toggles', error);
    }
  };

  const handleAnalyticsToggle = () => {
    const newValue = !analyticsEnabled;
    setAnalyticsEnabled(newValue);
    savePreferences({ analyticsEnabled: newValue });
  };

  const handleCrashReportingToggle = () => {
    const newValue = !crashReportingEnabled;
    setCrashReportingEnabled(newValue);
    savePreferences({ crashReportingEnabled: newValue });
  };

  const handleDataCollectionToggle = () => {
    const newValue = !dataCollectionEnabled;
    setDataCollectionEnabled(newValue);
    savePreferences({ dataCollectionEnabled: newValue });
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

  const handleViewWhitepaper = () => {
    Linking.openURL('https://usbvault.io/security').catch(() => {
      logger.error('Failed to open security whitepaper');
    });
  };

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Feather name="key" size={18} color={dashboardColors.cyan} />
        <Text style={styles.sectionTitle}>{t('settings.privacy')}</Text>
      </View>

      {/* Encryption pipeline detail */}
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>{t('settings.primaryCipher')}</Text>
        <Text style={styles.settingValueHighlight}>AES-256-GCM-SIV</Text>
      </View>

      <View style={local.detailBlock}>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>CIPHER</Text>
          <Text style={local.detailValue}>{t('settings.cipherSpec')}</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>KDF</Text>
          <Text style={local.detailValue}>{t('settings.kdfSpec')}</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>INTEGRITY</Text>
          <Text style={local.detailValue}>{t('settings.integritySpec')}</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>KEY WRAP</Text>
          <Text style={local.detailValue}>{t('settings.keyWrapSpec')}</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>PQC</Text>
          <Text style={local.detailValue}>{t('settings.pqcSpec')}</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>SIGNING</Text>
          <Text style={local.detailValue}>{t('settings.signingSpec')}</Text>
        </View>
      </View>

      <View style={styles.keyFingerprint}>
        <Text style={styles.keyLabel}>{t('settings.publicKeyFingerprint')}</Text>
        <Text style={styles.keyValue}>0x7C3A... (Ed25519)</Text>
      </View>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>{t('settings.postQuantumReady')}</Text>
        <View style={styles.enabledBadge}>
          <Feather name="check" size={14} color={dashboardColors.green} />
          <Text style={styles.enabledText}>{t('settings.active')}</Text>
        </View>
      </View>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>{t('settings.zkArchitecture')}</Text>
        <View style={styles.enabledBadge}>
          <Feather name="check" size={14} color={dashboardColors.green} />
          <Text style={styles.enabledText}>{t('settings.enforced')}</Text>
        </View>
      </View>

      <Pressable
        style={(state: any) => [styles.linkRow, state.hovered && styles.linkRowHover]}
        onPress={handleViewWhitepaper}
      >
        <Text style={styles.linkText}>{t('settings.viewWhitepaper')}</Text>
        <Feather name="external-link" size={14} color={dashboardColors.cyan} />
      </Pressable>

      <View
        style={{
          marginTop: 16,
          paddingTop: 16,
          borderTopWidth: 1,
          borderTopColor: 'rgba(139,92,246,0.2)',
        }}
      />

      {/* Privacy Toggles */}
      <Pressable onPress={handleAnalyticsToggle} style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>{t('settings.analyticsCollection')}</Text>
          <Text style={styles.settingMeta}>{t('settings.analyticsDesc')}</Text>
        </View>
        <ToggleIndicator enabled={analyticsEnabled} />
      </Pressable>

      <Pressable onPress={handleCrashReportingToggle} style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>{t('settings.crashReporting')}</Text>
          <Text style={styles.settingMeta}>{t('settings.crashReportingDesc')}</Text>
        </View>
        <ToggleIndicator enabled={crashReportingEnabled} />
      </Pressable>

      <Pressable onPress={handleDataCollectionToggle} style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>{t('settings.dataCollection')}</Text>
          <Text style={styles.settingMeta}>{t('settings.dataCollectionDesc')}</Text>
        </View>
        <ToggleIndicator enabled={dataCollectionEnabled} />
      </Pressable>
    </View>
  );
}

const local = StyleSheet.create({
  detailBlock: {
    backgroundColor: 'rgba(8,5,20,0.6)',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(34,211,238,0.9)',
    width: 88,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingTop: 1,
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.85)',
    flex: 1,
  },
});
