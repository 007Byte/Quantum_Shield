import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardSpacing } from './styles';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/theme/engine';
import { webOnly } from '@/utils/webStyle';

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
  textLight: {
    color: '#6B6190',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  footerLight: {
    backgroundColor: 'rgba(255,255,255,0.40)',
    borderTopColor: 'rgba(200,190,230,0.25)',
    ...webOnly({
      backdropFilter: 'blur(16px)',
    }),
  },
  dividerLight: {
    backgroundColor: 'rgba(200,190,230,0.30)',
  },
});

export function Footer() {
  const { t } = useLanguage();
  const { colorScheme, theme } = useTheme();
  const isLight = colorScheme === 'light';
  return (
    <View style={[styles.footer, isLight && styles.footerLight]}>
      {/* Vault Name */}
      <View style={styles.footerItem}>
        <Feather name="folder" size={12} color={isLight ? '#6B6190' : '#B8B3D1'} />
        <Text style={[styles.text, isLight && styles.textLight]}>{t('footer.personalVault')}</Text>
      </View>

      {/* Divider */}
      <View style={[styles.divider, isLight && styles.dividerLight]} />

      {/* Connection Status */}
      <View style={styles.footerItem}>
        <View style={styles.statusDot} />
        <Text style={[styles.text, isLight && styles.textLight]}>{t('footer.connected')}</Text>
      </View>

      {/* Divider */}
      <View style={[styles.divider, isLight && styles.dividerLight]} />

      {/* Encryption Algorithm */}
      <View style={styles.footerItem}>
        <Feather name="lock" size={12} color={isLight ? '#6B6190' : '#B8B3D1'} />
        <Text style={[styles.text, isLight && styles.textLight]}>{t('footer.cipher')}</Text>
      </View>

      {/* Divider */}
      <View style={[styles.divider, isLight && styles.dividerLight]} />

      {/* Version */}
      <View style={styles.footerItem}>
        <Text style={[styles.text, isLight && styles.textLight]}>{t('footer.version')}</Text>
      </View>
    </View>
  );
}
