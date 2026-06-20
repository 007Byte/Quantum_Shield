/**
 * VaultUnlockModal — shared modal for vault password unlock.
 *
 * Reused by encrypt-store, vault-manager, remove-file.
 */

import {
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface Props {
  visible: boolean;
  vaultName: string;
  password: string;
  onPasswordChange: (text: string) => void;
  error: string | null;
  onErrorClear: () => void;
  isUnlocking: boolean;
  onUnlock: () => void;
  onClose: () => void;
}

export function VaultUnlockModal({
  visible,
  vaultName,
  password,
  onPasswordChange,
  error,
  onErrorClear,
  isUnlocking,
  onUnlock,
  onClose,
}: Props) {
  const { theme, colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';
  const focusTrapRef = useFocusTrap(visible, onClose);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        ref={focusTrapRef}
        style={[
          styles.overlay,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.3)' },
        ]}
      >
        <View
          style={[
            styles.container,
            resolveLayerStyle(theme.L4.base),
            {
              shadowColor: isDark ? '#000' : 'rgba(139,92,246,0.3)',
              shadowOpacity: isDark ? 0.4 : 0.2,
            },
          ]}
          accessibilityViewIsModal={true}
        >
          <View style={styles.header}>
            <View
              style={[
                styles.iconCircle,
                { backgroundColor: isDark ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.10)' },
              ]}
            >
              <Feather name="lock" size={28} color={theme.semantic.purple} />
            </View>
            <Text
              style={[styles.title, { color: theme.L2.base.text.primary }]}
              accessibilityRole="header"
            >
              Unlock Vault
            </Text>
            <Text style={[styles.subtitle, { color: theme.L2.base.text.secondary }]}>
              Enter your vault password to unlock{' '}
              <Text style={{ fontWeight: '600' }}>{vaultName}</Text> for file operations.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.L2.base.text.primary }]}>
              Vault Password
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(139,92,246,0.04)',
                  borderColor: error
                    ? theme.semantic.danger
                    : isDark
                      ? 'rgba(139,92,246,0.3)'
                      : 'rgba(139,92,246,0.25)',
                  color: theme.L2.base.text.primary,
                },
              ]}
              placeholder="Enter vault password"
              placeholderTextColor={theme.L2.base.text.muted}
              secureTextEntry
              value={password}
              onChangeText={text => {
                onPasswordChange(text);
                if (error) onErrorClear();
              }}
              onSubmitEditing={onUnlock}
              editable={!isUnlocking}
              autoFocus
              accessibilityLabel="Vault password"
            />
            {error && (
              <View style={styles.errorRow}>
                <Feather name="alert-circle" size={14} color={theme.semantic.danger} />
                <Text style={[styles.errorText, { color: theme.semantic.danger }]}>{error}</Text>
              </View>
            )}
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={[
                styles.button,
                {
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.25)',
                },
              ]}
              onPress={onClose}
              disabled={isUnlocking}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelText, { color: theme.L2.base.text.primary }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                { backgroundColor: theme.semantic.accentPrimary },
                isUnlocking && { opacity: 0.6 },
              ]}
              onPress={onUnlock}
              disabled={isUnlocking || !password}
              accessibilityRole="button"
            >
              {isUnlocking ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="unlock" size={16} color="#FFFFFF" />
                  <Text style={styles.unlockText}>Unlock</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    borderRadius: 16,
    padding: 32,
    width: 420,
    maxWidth: '90%',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 20,
  },
  header: { alignItems: 'center', marginBottom: 24 },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  inputGroup: { marginBottom: 24 },
  inputLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  errorText: { fontSize: 13, flex: 1 },
  buttonRow: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cancelText: { fontSize: 15, fontWeight: '600' },
  unlockText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
