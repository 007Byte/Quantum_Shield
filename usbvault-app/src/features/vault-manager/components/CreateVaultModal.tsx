/**
 * CreateVaultModal — Name + security level + encryption type display.
 * Pure presentational: all state managed by parent via props.
 */
import { StyleSheet, Text, View, Pressable, TextInput, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, theme as themeProxy } from '@/theme/engine';
import { dashboardLayout } from '@/components/dashboard2/styles';
import type { CreateVaultModalState, SecurityLevel } from '../domain/vault-manager.types';
import { SECURITY_LEVELS } from '../domain/vault-manager.types';

interface CreateVaultModalProps {
  state: CreateVaultModalState;
  onChangeState: (state: CreateVaultModalState) => void;
  onClose: () => void;
  onCreate: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function CreateVaultModal({
  state,
  onChangeState,
  onClose,
  onCreate,
  t,
}: CreateVaultModalProps) {
  const { theme } = useTheme();

  return (
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} accessibilityRole="button">
        <Pressable
          style={[
            styles.modalContent,
            {
              backgroundColor: theme.L2.base.native.backgroundColor,
              borderColor: theme.L2.base.native.borderColor,
            },
          ]}
          onPress={e => e.stopPropagation()}
          accessibilityViewIsModal={true}
          accessibilityRole="button"
        >
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.L2.base.text.primary }]}>
              {t('vaultManager.createNewVault')}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <Feather name="x" size={22} color={theme.L2.base.text.primary} />
            </Pressable>
          </View>

          {/* Body */}
          <View style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.L2.base.text.primary }]}>
                {t('manageVaults.vaultName')}
              </Text>
              <TextInput
                accessibilityLabel={t('vaultManager.enterName')}
                style={[styles.textInput, { color: theme.L2.base.text.primary }]}
                placeholder={t('vaultManager.enterName')}
                placeholderTextColor={theme.L2.base.text.secondary}
                value={state.vaultName}
                onChangeText={text => onChangeState({ ...state, vaultName: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.L2.base.text.primary }]}>
                {t('manageVaults.securityLevel')}
              </Text>
              <View style={styles.securityLevelSelector}>
                {SECURITY_LEVELS.map((level: SecurityLevel) => (
                  <Pressable
                    accessibilityRole="button"
                    key={level}
                    style={[
                      styles.securityLevelOption,
                      state.securityLevel === level && styles.securityLevelOptionActive,
                    ]}
                    onPress={() => onChangeState({ ...state, securityLevel: level })}
                  >
                    <Text
                      style={[
                        styles.securityLevelOptionText,
                        { color: theme.L2.base.text.secondary },
                        state.securityLevel === level && styles.securityLevelOptionTextActive,
                      ]}
                    >
                      {level}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.L2.base.text.primary }]}>
                {t('manageVaults.encryptionType')}
              </Text>
              <View style={styles.encryptionDisplayContainer}>
                <Feather name="lock" size={16} color={theme.semantic.cyan} />
                <Text style={styles.encryptionDisplayText}>
                  Post-Quantum Cryptography (PQC-256)
                </Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.modalFooter}>
            <Pressable
              accessibilityRole="button"
              style={(s: any) => [
                styles.modalButton,
                styles.modalButtonCancel,
                { backgroundColor: theme.L2.base.native.backgroundColor },
                s.hovered && styles.modalButtonCancelHover,
              ]}
              onPress={onClose}
            >
              <Text style={[styles.modalButtonTextCancel, { color: theme.L2.base.text.secondary }]}>
                {t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={(s: any) => [
                styles.modalButton,
                styles.modalButtonCreate,
                state.vaultName.trim() === '' && styles.modalButtonDisabled,
                s.hovered && styles.modalButtonCreateHover,
              ]}
              onPress={onCreate}
              disabled={state.vaultName.trim() === ''}
            >
              <Text style={styles.modalButtonText}>{t('common.create')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: dashboardLayout.radiusXl,
    width: '92%',
    maxWidth: 500,
    ...webOnly({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  securityLevelSelector: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  securityLevelOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    backgroundColor: 'rgba(139,92,246,0.05)',
    alignItems: 'center',
  },
  securityLevelOptionActive: {
    backgroundColor: themeProxy.semantic.purple,
    borderColor: themeProxy.semantic.purple,
  },
  securityLevelOptionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  securityLevelOptionTextActive: {
    color: '#FFFFFF',
  },
  encryptionDisplayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
    gap: 8,
  },
  encryptionDisplayText: {
    fontSize: 13,
    color: themeProxy.semantic.cyan,
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.1)',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: dashboardLayout.radiusXl,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalButtonCancel: {
    borderColor: 'rgba(139,92,246,0.3)',
  },
  modalButtonCancelHover: {
    ...webOnly({ transform: 'translateY(-1px)', boxShadow: '0 0 16px rgba(139,92,246,0.2)' }),
  },
  modalButtonCreate: {
    borderColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 20px rgba(139,92,246,0.3)',
    }),
  },
  modalButtonCreateHover: {
    ...webOnly({ transform: 'translateY(-1px)', boxShadow: '0 0 30px rgba(139,92,246,0.5)' }),
  },
  modalButtonDisabled: {
    opacity: 0.5,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalButtonTextCancel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
