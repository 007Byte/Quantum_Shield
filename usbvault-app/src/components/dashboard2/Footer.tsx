import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardSpacing } from './styles';

const styles = StyleSheet.create({
  footer: {
    height: 32,
    backgroundColor: 'rgba(8, 5, 20, 0.8)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(34, 211, 238, 0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md,
    justifyContent: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    marginHorizontal: dashboardSpacing.md,
  },
  text: {
    fontSize: 11,
    color: '#B8B3D1',
    fontWeight: '400',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
});

export function Footer() {
  return (
    <View style={styles.footer}>
      {/* Vault Name */}
      <View style={styles.footerItem}>
        <Feather name="folder" size={12} color="#B8B3D1" />
        <Text style={styles.text}>Personal Vault</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Connection Status */}
      <View style={styles.footerItem}>
        <View style={styles.statusDot} />
        <Text style={styles.text}>Connected</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Encryption Algorithm */}
      <View style={styles.footerItem}>
        <Feather name="lock" size={12} color="#B8B3D1" />
        <Text style={styles.text}>ML-KEM-1024 + AES-256-GCM-SIV</Text>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Version */}
      <View style={styles.footerItem}>
        <Text style={styles.text}>QAV v3.2 Enterprise</Text>
      </View>
    </View>
  );
}
