import { Platform, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage } from '@/hooks/useLanguage';

/**
 * Displays a persistent banner when the web app is running in demo mode
 * (no backend connected). Hidden on native platforms and when a real
 * backend is detected.
 */
export function DemoModeBanner() {
  const isDemoMode = useAuthStore((s: any) => s.isDemoMode);
  const isAuthenticated = useAuthStore((s: any) => s.isAuthenticated);
  const { t } = useLanguage();

  // Only show on web in development, when authenticated, and in demo mode
  if (!__DEV__ || Platform.OS !== 'web' || !isDemoMode || !isAuthenticated) return null;

  return (
    <View style={styles.banner}>
      <Feather name="alert-circle" size={14} color="#FCD34D" />
      <Text style={styles.text}>
        {t('demo.bannerText', {
          defaultValue:
            'Demo Mode — Data is stored locally in your browser. Connect a backend for production use.',
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(251,191,36,0.3)',
    ...webOnly({
      position: 'sticky' as any,
      top: 0,
      zIndex: 9999,
      backdropFilter: 'blur(8px)',
    }),
  },
  text: {
    fontSize: 12,
    color: '#FCD34D',
    fontWeight: '500',
    flex: 1,
  },
});
