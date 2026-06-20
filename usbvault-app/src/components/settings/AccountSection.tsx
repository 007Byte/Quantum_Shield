import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { InAppModal, useInAppModal } from '@/components/common';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { validatePassword, PASSWORD_MIN_LENGTH } from '@/utils/passwordPolicy';
import { auditService } from '@/services/auditService';
import { useLanguage } from '@/hooks/useLanguage';

interface AccountSectionProps {
  email: string | null;
  subscriptionTier: string | null;
}

export function AccountSection({ email, subscriptionTier }: AccountSectionProps) {
  const { t } = useLanguage();
  const { modal, showPrompt, showSuccess, showError } = useInAppModal();

  const handleChangePassword = () => {
    showPrompt(
      t('settings.changePassword'),
      [
        {
          key: 'oldPassword',
          label: t('settings.currentPassword'),
          placeholder: t('settings.currentPasswordPlaceholder'),
          secure: true,
        },
        {
          key: 'newPassword',
          label: t('settings.newPassword'),
          placeholder: t('settings.newPasswordPlaceholder'),
          secure: true,
        },
        {
          key: 'confirmPassword',
          label: t('settings.confirmPassword'),
          placeholder: t('settings.confirmPasswordPlaceholder'),
          secure: true,
        },
      ],
      values => {
        const { oldPassword, newPassword, confirmPassword } = values;

        if (!oldPassword || !newPassword || !confirmPassword) {
          showError(t('settings.validationError'), t('settings.allFieldsRequired'));
          return;
        }

        // NIST SP 800-63B-4 + OWASP validation with user context
        const validation = validatePassword(newPassword, { email: email || undefined });
        if (!validation.isValid) {
          showError(
            t('settings.passwordTooWeak'),
            validation.feedback[0] ||
              t('settings.passwordMinLength', { count: PASSWORD_MIN_LENGTH })
          );
          return;
        }

        if (newPassword !== confirmPassword) {
          showError(t('settings.validationError'), t('settings.passwordMismatch'));
          return;
        }

        // In a real app, call API to change password
        auditService.log('password_change', email || 'unknown').catch(() => {});
        showSuccess(t('settings.changePassword'), t('settings.passwordChanged'));
      },
      t('settings.changePassword')
    );
  };

  return (
    <>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="user" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('settings.account')}
          </Text>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t('settings.email')}</Text>
          <Text style={styles.settingValue}>{email || t('settings.notSignedIn')}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t('settings.subscription')}</Text>
          <View style={styles.tierBadge}>
            <Text style={styles.tierText}>
              {subscriptionTier
                ? subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)
                : t('settings.free')}
            </Text>
          </View>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t('settings.pqcStatus')}</Text>
          <View style={styles.pqcPill}>
            <View style={styles.pqcDot} />
            <Text style={styles.pqcText}>{t('settings.protected')}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={(state: any) => [styles.actionBtn, state.hovered && styles.actionBtnHover]}
          onPress={handleChangePassword}
        >
          <Feather name="lock" size={16} color={dashboardColors.textPrimary} />
          <Text style={styles.actionBtnText}>{t('settings.changePassword')}</Text>
        </Pressable>
      </View>
      <InAppModal config={modal} />
    </>
  );
}
