import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';

interface AboutSectionProps {
  onSignOut: () => void;
}

// Dynamic version from package.json
const APP_VERSION = (() => {
  try {
    const pkg = require('../../../package.json');
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
})();

const BUILD_DATE = new Date().toISOString().slice(0, 10).replace(/-/g, '.');

export function AboutSection({ onSignOut }: AboutSectionProps) {
  return (
    <>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="info" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle}>About</Text>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Version</Text>
          <Text style={styles.settingValue}>{APP_VERSION}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Build</Text>
          <Text style={styles.settingValue}>{BUILD_DATE}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Platform</Text>
          <Text style={styles.settingValue}>Quantum Shield (V3.0)</Text>
        </View>
      </View>

      <Pressable
        style={(state: any) => [styles.signOutBtn, state.hovered && styles.signOutBtnHover]}
        onPress={onSignOut}
      >
        <Feather name="log-out" size={16} color="#FF6B6B" />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </>
  );
}
