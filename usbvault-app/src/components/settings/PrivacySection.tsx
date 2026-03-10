import { View, Text, Pressable, Linking, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { useState, useEffect } from 'react';

export function PrivacySection() {
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
      console.error('Failed to load privacy toggles', error);
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
      console.error('Failed to save privacy toggles', error);
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
      console.error('Failed to open security whitepaper');
    });
  };

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Feather name="key" size={18} color={dashboardColors.cyan} />
        <Text style={styles.sectionTitle}>Privacy &amp; Encryption</Text>
      </View>

      {/* Encryption pipeline detail */}
      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Primary Cipher</Text>
        <Text style={styles.settingValueHighlight}>AES-256-GCM-SIV</Text>
      </View>

      <View style={local.detailBlock}>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>CIPHER</Text>
          <Text style={local.detailValue}>AES-256-GCM-SIV — nonce-misuse resistant AEAD</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>KDF</Text>
          <Text style={local.detailValue}>Argon2id (64 MB, 3 iterations, 4 lanes)</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>INTEGRITY</Text>
          <Text style={local.detailValue}>HMAC-SHA256 per record + 16-byte AEAD tag per chunk</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>KEY WRAP</Text>
          <Text style={local.detailValue}>HKDF-SHA256 per-file subkeys from 64-byte MEK</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>PQC</Text>
          <Text style={local.detailValue}>ML-KEM-1024 hybrid key encapsulation (FIPS 203)</Text>
        </View>
        <View style={local.detailRow}>
          <Text style={local.detailLabel}>SIGNING</Text>
          <Text style={local.detailValue}>Ed25519 identity + ML-DSA-87 header signature</Text>
        </View>
      </View>

      <View style={styles.keyFingerprint}>
        <Text style={styles.keyLabel}>Public Key Fingerprint</Text>
        <Text style={styles.keyValue}>0x7C3A... (Ed25519)</Text>
      </View>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Post-Quantum Ready</Text>
        <View style={styles.enabledBadge}>
          <Feather name="check" size={14} color={dashboardColors.green} />
          <Text style={styles.enabledText}>Active</Text>
        </View>
      </View>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>Zero-Knowledge Architecture</Text>
        <View style={styles.enabledBadge}>
          <Feather name="check" size={14} color={dashboardColors.green} />
          <Text style={styles.enabledText}>Enforced</Text>
        </View>
      </View>

      <Pressable
        style={(state: any) => [styles.linkRow, state.hovered && styles.linkRowHover]}
        onPress={handleViewWhitepaper}
      >
        <Text style={styles.linkText}>View Security Whitepaper</Text>
        <Feather name="external-link" size={14} color={dashboardColors.cyan} />
      </Pressable>

      <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(139,92,246,0.2)' }} />

      {/* Privacy Toggles */}
      <Pressable
        onPress={handleAnalyticsToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>Analytics Collection</Text>
          <Text style={styles.settingMeta}>Allow anonymous usage analytics</Text>
        </View>
        <ToggleIndicator enabled={analyticsEnabled} />
      </Pressable>

      <Pressable
        onPress={handleCrashReportingToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>Crash Reporting</Text>
          <Text style={styles.settingMeta}>Send crash reports to improve stability</Text>
        </View>
        <ToggleIndicator enabled={crashReportingEnabled} />
      </Pressable>

      <Pressable
        onPress={handleDataCollectionToggle}
        style={styles.settingRow}
      >
        <View>
          <Text style={styles.settingLabel}>Data Collection</Text>
          <Text style={styles.settingMeta}>Share feature usage data</Text>
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
