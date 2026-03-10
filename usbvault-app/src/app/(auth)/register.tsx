import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Badge } from '@/components/common/Badge';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/utils/logger';
import {
  validatePassword,
  checkPasswordBreach,
  levelToColor,
  levelToLabel,
  PASSWORD_MIN_LENGTH,
  validateInputField,
} from '@/utils/passwordPolicy';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },

  header: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },

  logo: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },

  title: {
    fontSize: typography.sizes['3xl'],
    fontWeight: '700' as const,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: 'center',
    fontFamily: typography.fontFamily,
  },

  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    textAlign: 'center',
    fontFamily: typography.fontFamily,
  },

  form: {
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },

  formGroup: {
    gap: spacing.md,
  },

  infoBox: {
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },

  infoText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },

  passwordStrength: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },

  strengthLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
    textTransform: 'uppercase',
    fontWeight: '600' as const,
  },

  strengthBars: {
    flexDirection: 'row',
    gap: spacing.xs,
    height: 6,
  },

  strengthBar: {
    flex: 1,
    backgroundColor: colors.bgTertiary,
    borderRadius: 3,
  },

  strengthBarFilled: {
    backgroundColor: colors.success,
  },

  strengthText: {
    fontSize: typography.sizes.xs,
    fontWeight: '600' as const,
    fontFamily: typography.fontFamily,
    marginTop: spacing.xs,
  },

  actions: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },

  link: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },

  linkText: {
    fontSize: typography.sizes.base,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },

  linkTextHighlight: {
    color: colors.accentPrimary,
    fontWeight: '600' as const,
  },

  error: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },

  errorText: {
    fontSize: typography.sizes.sm,
    color: colors.danger,
    fontFamily: typography.fontFamily,
  },

  badge: {
    marginTop: spacing.md,
  },

  classRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },

  classPill: {
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily,
    fontWeight: '600' as const,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});

// NIST SP 800-63B-4 password policy is enforced via passwordPolicy.ts

export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const error = useAuthStore((state) => state.error);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const [breachWarning, setBreachWarning] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(false);

  // NIST SP 800-63B-4 + OWASP password validation with user context
  const passwordValidation = useMemo(
    () => validatePassword(password, { email }),
    [password, email],
  );

  // Async HIBP breach check on password blur
  const handlePasswordBlur = useCallback(async () => {
    if (password.length >= PASSWORD_MIN_LENGTH) {
      try {
        const breached = await checkPasswordBreach(password);
        setBreachWarning(breached ? 'This password has appeared in a known data breach. Please choose a different one.' : '');
      } catch {
        // Network failure — silent fallback (NIST allows offline-only)
      }
    }
  }, [password]);

  const handleRegister = async () => {
    setValidationError('');

    if (!email || !password || !confirmPassword) {
      setValidationError('Please fill in all fields');
      return;
    }

    // Input validation: type + length + format
    const emailValidation = validateInputField(email, 'Email', {
      minLength: 5,
      maxLength: 254,
    });
    if (!emailValidation.isValid) {
      setValidationError(emailValidation.errors[0]);
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setValidationError('Please enter a valid email');
      return;
    }

    if (!passwordValidation.isValid) {
      setValidationError(passwordValidation.feedback[0] || `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
      return;
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (breachWarning) {
      setValidationError(breachWarning);
      return;
    }

    try {
      await register(email, password);
      setShowOnboarding(true);
    } catch (err) {
      logger.error('Registration failed:', err);
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    router.replace('/(tabs)/dashboard');
  };

  if (showOnboarding) {
    return (
      <View style={styles.container}>
        <OnboardingWizard email={email} onComplete={handleOnboardingComplete} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>🛡️</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Start your secure journey</Text>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Your password never leaves this device. Encryption happens locally.
          </Text>
        </View>

        {/* Errors */}
        {(error || validationError) && (
          <View style={styles.error}>
            <Text style={styles.errorText}>
              {error || validationError}
            </Text>
          </View>
        )}

        {/* Registration Form */}
        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Input
              label="Email"
              placeholder="your@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!isLoading}
              testID="register-email-input"
            />

            <View>
              <Input
                label={`Password (min ${PASSWORD_MIN_LENGTH} characters)`}
                placeholder="Choose a strong passphrase"
                value={password}
                onChangeText={(text: string) => { setPassword(text); setBreachWarning(''); }}
                onBlur={handlePasswordBlur}
                secureTextEntry
                editable={!isLoading}
                testID="register-password-input"
              />

              {password && (
                <View style={styles.passwordStrength}>
                  <Text style={styles.strengthLabel}>
                    Password Strength (NIST SP 800-63B-4 + OWASP)
                  </Text>

                  <View style={styles.strengthBars}>
                    {[1, 2, 3, 4, 5].map((bar) => (
                      <View
                        key={bar}
                        style={[
                          styles.strengthBar,
                          {
                            backgroundColor:
                              bar <= passwordValidation.score
                                ? levelToColor(passwordValidation.level)
                                : colors.bgTertiary,
                          },
                        ]}
                      />
                    ))}
                  </View>

                  <Text
                    style={[
                      styles.strengthText,
                      { color: levelToColor(passwordValidation.level) },
                    ]}
                  >
                    {levelToLabel(passwordValidation.level)} — {passwordValidation.estimatedCrackTime}
                  </Text>

                  {/* OWASP character class indicators */}
                  <View style={styles.classRow}>
                    {([
                      ['a-z', passwordValidation.characterClasses.hasLowercase],
                      ['A-Z', passwordValidation.characterClasses.hasUppercase],
                      ['0-9', passwordValidation.characterClasses.hasDigits],
                      ['!@#', passwordValidation.characterClasses.hasSpecial],
                    ] as const).map(([label, present]) => (
                      <Text
                        key={label}
                        style={[
                          styles.classPill,
                          { color: present ? '#10B981' : colors.textMuted,
                            borderColor: present ? '#10B981' : colors.border },
                        ]}
                      >
                        {present ? '✓' : '○'} {label}
                      </Text>
                    ))}
                  </View>

                  {passwordValidation.feedback.length > 0 && (
                    <Text style={[styles.strengthText, { color: colors.warning, marginTop: 4 }]}>
                      {passwordValidation.feedback[0]}
                    </Text>
                  )}

                  {breachWarning ? (
                    <Text style={[styles.strengthText, { color: colors.danger, marginTop: 4 }]}>
                      {breachWarning}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>

            <Input
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!isLoading}
              error={
                confirmPassword && password !== confirmPassword
                  ? 'Passwords do not match'
                  : undefined
              }
              testID="register-confirm-password-input"
            />
          </View>

          <View style={styles.actions}>
            <Button
              variant="hero"
              onPress={handleRegister}
              loading={isLoading}
              disabled={isLoading}
              fullWidth
              testID="register-button"
            >
              Create Account
            </Button>
          </View>
        </View>

        {/* PQC Badge */}
        <View style={styles.badge}>
          <Badge
            variant="pqc"
            label="Protected by Post-Quantum Cryptography"
            icon="🛡️"
          />
        </View>

        {/* Login Link */}
        <View style={styles.link}>
          <Text style={styles.linkText}>Already have an account?</Text>
          <Button
            variant="link"
            onPress={() => router.push('/(auth)/login')}
            testID="register-login-link"
          >
            Sign In
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
