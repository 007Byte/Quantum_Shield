/**
 * Step 3 — Master password validation with strength meter.
 * Pure presentational component; all data arrives via props.
 */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle, theme as themeProxy } from '@/theme/engine';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import type { PasswordStepProps } from '../domain/setup-usb.types';

export function PasswordStep({
  password,
  passwordConfirm,
  showPassword,
  showPasswordConfirm,
  passwordsMatch,
  strength,
  onChangePassword,
  onChangePasswordConfirm,
  onToggleShowPassword,
  onToggleShowPasswordConfirm,
  t,
}: PasswordStepProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.stepContent}>
      <View
        style={[
          styles.card,
          resolveLayerStyle(theme.L2.base),
          {
            backgroundColor: theme.name === 'dark' ? 'rgba(8,5,20,0.55)' : '#FFFFFF',
            borderColor: theme.name === 'dark' ? 'rgba(34,211,238,0.1)' : '#E2DEF0',
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <Feather name="lock" size={24} color={theme.semantic.cyan} />
          <Text style={[styles.cardTitle, { color: theme.L2.base.text.primary }]}>
            {t('setupUsb.setPasswordTitle')}
          </Text>
        </View>
        <Text style={[styles.cardDescription, { color: theme.L2.base.text.secondary }]}>
          {t('setupUsb.setPasswordDesc')}
        </Text>

        {/* Master password field */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.L2.base.text.secondary }]}>
            {t('setupUsb.masterPassword')}
          </Text>
          <View
            style={[
              styles.inputRow,
              {
                borderColor: theme.name === 'dark' ? 'rgba(34,211,238,0.2)' : '#E2DEF0',
                backgroundColor: theme.name === 'dark' ? 'rgba(34,211,238,0.05)' : '#F8F7FC',
              },
            ]}
          >
            <Feather name="lock" size={16} color={theme.semantic.cyan} style={styles.inputIcon} />
            <TextInput
              accessibilityLabel={t('setupUsb.enterMasterPassword')}
              style={[styles.textInput, { color: theme.L2.base.text.primary }]}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={onChangePassword}
              placeholder={t('setupUsb.enterMasterPassword')}
              placeholderTextColor={theme.L2.base.text.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={onToggleShowPassword} accessibilityRole="button">
              <Feather
                name={showPassword ? 'eye-off' : 'eye'}
                size={16}
                color={theme.L2.base.text.secondary}
              />
            </Pressable>
          </View>
        </View>

        {/* Confirm password field */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.L2.base.text.secondary }]}>
            {t('setupUsb.confirmPassword')}
          </Text>
          <View
            style={[
              styles.inputRow,
              {
                borderColor: theme.name === 'dark' ? 'rgba(34,211,238,0.2)' : '#E2DEF0',
                backgroundColor: theme.name === 'dark' ? 'rgba(34,211,238,0.05)' : '#F8F7FC',
              },
              passwordConfirm && !passwordsMatch ? styles.inputRowError : {},
            ]}
          >
            <Feather
              name="lock"
              size={16}
              color={
                passwordConfirm && !passwordsMatch ? theme.semantic.danger : theme.semantic.cyan
              }
              style={styles.inputIcon}
            />
            <TextInput
              accessibilityLabel={t('setupUsb.confirmMasterPassword')}
              style={[styles.textInput, { color: theme.L2.base.text.primary }]}
              secureTextEntry={!showPasswordConfirm}
              value={passwordConfirm}
              onChangeText={onChangePasswordConfirm}
              placeholder={t('setupUsb.confirmMasterPassword')}
              placeholderTextColor={theme.L2.base.text.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={onToggleShowPasswordConfirm} accessibilityRole="button">
              <Feather
                name={showPasswordConfirm ? 'eye-off' : 'eye'}
                size={16}
                color={theme.L2.base.text.secondary}
              />
            </Pressable>
          </View>
          {passwordConfirm && !passwordsMatch && (
            <Text style={[styles.fieldError, { color: theme.semantic.danger }]}>
              {t('setupUsb.passwordsDontMatch')}
            </Text>
          )}
          {passwordConfirm && passwordsMatch && (
            <View style={styles.fieldOk}>
              <Feather name="check-circle" size={13} color={theme.semantic.success} />
              <Text style={[styles.fieldOkText, { color: theme.semantic.success }]}>
                {t('setupUsb.passwordsMatch')}
              </Text>
            </View>
          )}
        </View>

        {/* Strength bar */}
        {password.length > 0 && (
          <View style={styles.strengthContainer}>
            <View style={styles.strengthHeader}>
              <Text style={[styles.strengthLabelText, { color: theme.L2.base.text.secondary }]}>
                {t('setupUsb.passwordStrength')}
              </Text>
              <Text style={[styles.strengthValue, { color: strength.color }]}>
                {strength.label}
              </Text>
            </View>
            <View
              style={[
                styles.strengthBar,
                {
                  backgroundColor:
                    theme.name === 'dark' ? 'rgba(34,211,238,0.1)' : 'rgba(124,58,237,0.1)',
                },
              ]}
            >
              <View
                style={[
                  styles.strengthFill,
                  {
                    width: `${strength.strength}%` as any,
                    backgroundColor: strength.color,
                  },
                ]}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  stepContent: { marginBottom: dashboardSpacing.lg },
  card: {
    padding: dashboardSpacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderColor: 'rgba(34,211,238,0.1)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: dashboardSpacing.md,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: dashboardSpacing.md,
    flex: 1,
  },
  cardDescription: {
    fontSize: 13,
    marginBottom: dashboardSpacing.lg,
  },

  fieldGroup: { marginBottom: dashboardSpacing.lg },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: dashboardSpacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
    backgroundColor: 'rgba(34,211,238,0.05)',
    gap: dashboardSpacing.sm,
  },
  inputRowError: {
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  inputIcon: { flexShrink: 0 },
  textInput: {
    flex: 1,
    fontSize: 14,
    ...webOnly({ outline: 'none' }),
  },
  fieldError: { marginTop: 5, fontSize: 12, color: themeProxy.semantic.danger },
  fieldOk: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fieldOkText: { fontSize: 12, color: themeProxy.semantic.success },

  strengthContainer: { marginBottom: dashboardSpacing.lg },
  strengthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.sm,
  },
  strengthLabelText: { fontSize: 12, fontWeight: '600' },
  strengthValue: { fontSize: 12, fontWeight: '600' },
  strengthBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  strengthFill: { height: '100%', borderRadius: 3 },
});
