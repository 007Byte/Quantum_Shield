/**
 * SessionTimeoutModal — Warning overlay when the web session is about to expire.
 *
 * Shows a countdown timer, an "Extend Session" button (primary), and a "Logout"
 * button (destructive). Respects the design skill's glass morphism, dark luxury
 * cyberpunk theme, and the prefers-reduced-motion media query.
 */
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { SessionTimeoutState } from '@/hooks/useSessionTimeoutWarning';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SessionTimeoutModal({
  visible,
  secondsLeft,
  extendSession,
  logoutNow,
}: SessionTimeoutState) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const focusTrapRef = useFocusTrap(visible, extendSession);
  const cardStyle = resolveLayerStyle(theme.L4.base);
  const textPrimary = theme.L4.base.text.primary;
  const textSecondary = theme.L4.base.text.secondary;
  const textMuted = theme.L4.base.text.muted;
  const isUrgent = secondsLeft <= 60;

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={extendSession}
      accessibilityViewIsModal
    >
      <View style={s.overlay} ref={focusTrapRef}>
        <View style={[s.card, cardStyle]}>
          {/* Icon */}
          <View style={[s.iconWrap, isUrgent && s.iconWrapUrgent]}>
            <Feather name="clock" size={28} color={isUrgent ? '#EF4444' : '#F59E0B'} />
          </View>

          {/* Title */}
          <Text style={[s.title, { color: textPrimary }]} accessibilityRole="header">
            {t('session.expiring')}
          </Text>

          {/* Message */}
          <Text style={[s.message, { color: textSecondary }]}>{t('session.willExpireIn')}</Text>

          {/* Countdown */}
          <Text
            style={[s.countdown, isUrgent && s.countdownUrgent]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`${secondsLeft} seconds remaining`}
          >
            {formatTime(secondsLeft)}
          </Text>

          <Text style={[s.subtext, { color: textMuted }]}>
            {isUrgent ? t('session.loggedOutShortly') : t('session.extendOrLogout')}
          </Text>

          {/* Buttons */}
          <View style={s.buttonRow}>
            <Pressable
              style={(state: any) => [
                s.button,
                s.buttonDestructive,
                state.hovered && s.buttonDestructiveHover,
              ]}
              onPress={logoutNow}
              accessibilityRole="button"
              accessibilityLabel={t('session.logout')}
            >
              <Text style={[s.buttonText, { color: '#EF4444' }]}>{t('session.logout')}</Text>
            </Pressable>

            <Pressable
              style={(state: any) => [
                s.button,
                s.buttonPrimary,
                state.hovered && s.buttonPrimaryHover,
              ]}
              onPress={extendSession}
              accessibilityRole="button"
              accessibilityLabel={t('session.extendSession')}
            >
              <Feather name="refresh-cw" size={14} color="#fff" style={{ marginRight: 6 }} />
              <Text style={[s.buttonText, { color: '#fff' }]}>{t('session.extendSession')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ backdropFilter: 'blur(8px)' }),
  },
  card: {
    width: '90%',
    maxWidth: 400,
    paddingHorizontal: 28,
    paddingVertical: 32,
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconWrapUrgent: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderColor: 'rgba(239,68,68,0.4)',
    ...webOnly({
      boxShadow: '0 0 20px rgba(239,68,68,0.3)',
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  countdown: {
    fontSize: 48,
    fontWeight: '800',
    color: '#F59E0B',
    textAlign: 'center',
    marginBottom: 8,
    fontVariant: ['tabular-nums'],
  },
  countdownUrgent: {
    color: '#EF4444',
    ...webOnly({
      textShadow: '0 0 20px rgba(239,68,68,0.5)',
    }),
  },
  subtext: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 16,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  buttonPrimary: {
    backgroundColor: 'rgba(139,92,246,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.65)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.35)',
    }),
  },
  buttonPrimaryHover: {
    backgroundColor: 'rgba(139,92,246,0.65)',
    borderColor: 'rgba(139,92,246,0.85)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 28px rgba(139,92,246,0.55), 0 0 40px rgba(34,211,238,0.2)',
    }),
  },
  buttonDestructive: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  buttonDestructiveHover: {
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderColor: 'rgba(239,68,68,0.5)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(239,68,68,0.3)',
    }),
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
