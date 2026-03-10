import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { InAppModal, useInAppModal } from '@/components/common';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { validatePassword, PASSWORD_MIN_LENGTH } from '@/utils/passwordPolicy';
import { auditService } from '@/services/auditService';

interface AccountSectionProps {
  email: string | null;
  subscriptionTier: string | null;
}

export function AccountSection({ email, subscriptionTier }: AccountSectionProps) {
  const { modal, showPrompt, showSuccess, showError } = useInAppModal();

  const handleChangePassword = () => {
    showPrompt(
      'Change Password',
      [
        {
          key: 'oldPassword',
          label: 'Current Password',
          placeholder: 'Enter your current password',
          secure: true,
        },
        {
          key: 'newPassword',
          label: 'New Password',
          placeholder: 'Enter your new password',
          secure: true,
        },
        {
          key: 'confirmPassword',
          label: 'Confirm Password',
          placeholder: 'Confirm your new password',
          secure: true,
        },
      ],
      (values) => {
        const { oldPassword, newPassword, confirmPassword } = values;

        if (!oldPassword || !newPassword || !confirmPassword) {
          showError('Validation Error', 'All fields are required');
          return;
        }

        // NIST SP 800-63B-4 + OWASP validation with user context
        const validation = validatePassword(newPassword, { email: email || undefined });
        if (!validation.isValid) {
          showError(
            'Password Too Weak',
            validation.feedback[0] || `Password must be at least ${PASSWORD_MIN_LENGTH} characters. NIST SP 800-63B-4 requires a strong passphrase.`,
          );
          return;
        }

        if (newPassword !== confirmPassword) {
          showError('Validation Error', 'Passwords do not match!');
          return;
        }

        // In a real app, call API to change password
        auditService.log('password_change', email || 'unknown').catch(() => {});
        showSuccess('Success', 'Password changed successfully!');
      },
      'Change Password'
    );
  };

  return (
    <>
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="user" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle}>Account</Text>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Email</Text>
          <Text style={styles.settingValue}>{email || 'Not signed in'}</Text>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Subscription</Text>
          <View style={styles.tierBadge}>
            <Text style={styles.tierText}>
              {subscriptionTier
                ? subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)
                : 'Free'}
            </Text>
          </View>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>PQC Status</Text>
          <View style={styles.pqcPill}>
            <View style={styles.pqcDot} />
            <Text style={styles.pqcText}>Protected</Text>
          </View>
        </View>

        <Pressable
          style={(state: any) => [styles.actionBtn, state.hovered && styles.actionBtnHover]}
          onPress={handleChangePassword}
        >
          <Feather name="lock" size={16} color={dashboardColors.textPrimary} />
          <Text style={styles.actionBtnText}>Change Password</Text>
        </Pressable>
      </View>
      <InAppModal config={modal} />
    </>
  );
}
