import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { useAuthStore } from '@/stores/authStore';
import { logger } from '@/utils/logger';

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

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    gap: spacing.md,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },

  dividerText: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    fontFamily: typography.fontFamily,
  },

  methodButtons: {
    gap: spacing.md,
  },

  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },

  methodIcon: {
    fontSize: 20,
  },

  usbSection: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },

  usbHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  usbTitle: {
    fontSize: typography.sizes.base,
    fontWeight: '600' as const,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },

  usbStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  usbStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(184, 179, 209, 0.4)',
  },

  usbStatusText: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },

  usbActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  usbRescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },

  usbRescanText: {
    fontSize: typography.sizes.sm,
    color: colors.accentPrimary,
    fontWeight: '600' as const,
    fontFamily: typography.fontFamily,
  },

  usbSetupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },

  usbSetupText: {
    fontSize: typography.sizes.sm,
    color: colors.accentPrimary,
    fontWeight: '600' as const,
    fontFamily: typography.fontFamily,
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
});

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const error = useAuthStore((state) => state.error);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleLogin = async () => {
    setValidationError('');

    if (!email || !password) {
      setValidationError('Please enter your email and password');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setValidationError('Please enter a valid email');
      return;
    }

    try {
      await login(email, password);
      router.replace('/(tabs)/dashboard');
    } catch (err) {
      // Error is handled by store
      logger.error('Login failed:', err);
    }
  };

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
          <Text style={styles.title}>Welcome to USBVault</Text>
          <Text style={styles.subtitle}>Zero-Knowledge Security</Text>
        </View>

        {/* USB Detection Section */}
        <View style={styles.usbSection}>
          <View style={styles.usbHeader}>
            <Feather name="hard-drive" size={18} color={colors.textSecondary} />
            <Text style={styles.usbTitle}>USB Vault Detection</Text>
          </View>
          <View style={styles.usbStatus}>
            <View style={styles.usbStatusDot} />
            <Text style={styles.usbStatusText}>No USB vaults detected</Text>
          </View>
          <View style={styles.usbActions}>
            <Pressable style={styles.usbRescanBtn} onPress={() => {}}>
              <Feather name="refresh-cw" size={14} color={colors.accentPrimary} />
              <Text style={styles.usbRescanText}>Rescan</Text>
            </Pressable>
            <Pressable style={styles.usbSetupBtn} onPress={() => {}}>
              <Feather name="plus-circle" size={14} color={colors.accentPrimary} />
              <Text style={styles.usbSetupText}>Setup New USB</Text>
            </Pressable>
          </View>
        </View>

        {/* Errors */}
        {(error || validationError) && (
          <View style={styles.error}>
            <Text style={styles.errorText}>
              {error || validationError}
            </Text>
          </View>
        )}

        {/* Login Form */}
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
              testID="login-email-input"
            />

            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isLoading}
              testID="login-password-input"
            />
          </View>

          <View style={styles.actions}>
            <Button
              variant="hero"
              onPress={handleLogin}
              loading={isLoading}
              disabled={isLoading}
              fullWidth
              testID="login-button"
            >
              Sign In
            </Button>
          </View>
        </View>

        {/* Biometric / FIDO2 Options */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Or use</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.methodButtons}>
          <Button
            variant="secondary"
            onPress={() => {
              // Biometric authentication handler to be implemented
            }}
            fullWidth
            testID="login-biometric-button"
          >
            <Text style={styles.methodIcon}>👆</Text>
            Biometric Unlock
          </Button>

          <Button
            variant="secondary"
            onPress={() => {
              // FIDO2 authentication handler to be implemented
            }}
            fullWidth
            testID="login-fido2-button"
          >
            <Text style={styles.methodIcon}>🔐</Text>
            Security Key
          </Button>
        </View>

        {/* Register Link */}
        <View style={styles.link}>
          <Text style={styles.linkText}>Don't have an account?</Text>
          <Button
            variant="link"
            onPress={() => router.push('/(auth)/register')}
            testID="login-register-link"
          >
            Create Account
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
