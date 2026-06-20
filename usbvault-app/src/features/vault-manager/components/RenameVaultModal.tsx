/**
 * RenameVaultModal — Rename an existing vault.
 * Pure presentational: all state managed by parent via props.
 */
import { StyleSheet, Text, View, Pressable, TextInput, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme } from '@/theme/engine';
import { dashboardLayout } from '@/components/dashboard2/styles';
import type { RenameModalState } from '../domain/vault-manager.types';

interface RenameVaultModalProps {
  state: RenameModalState;
  onChangeState: (state: RenameModalState) => void;
  onClose: () => void;
  onRename: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function RenameVaultModal({
  state,
  onChangeState,
  onClose,
  onRename,
  t,
}: RenameVaultModalProps) {
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
              {t('manageVaults.renameDlgTitle')}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <Feather name="x" size={22} color={theme.L2.base.text.primary} />
            </Pressable>
          </View>

          {/* Body */}
          <View style={styles.modalBody}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.L2.base.text.primary }]}>
                {t('manageVaults.currentName')}
              </Text>
              <View style={[styles.textInput, styles.disabledInput]}>
                <Text style={[styles.disabledInputText, { color: theme.L2.base.text.secondary }]}>
                  {state.currentName}
                </Text>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.L2.base.text.primary }]}>
                {t('manageVaults.newName')}
              </Text>
              <TextInput
                accessibilityLabel={t('manageVaults.enterNewName')}
                style={[styles.textInput, { color: theme.L2.base.text.primary }]}
                placeholder={t('manageVaults.enterNewName')}
                placeholderTextColor={theme.L2.base.text.secondary}
                value={state.newName}
                onChangeText={text => onChangeState({ ...state, newName: text })}
              />
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
                state.newName.trim() === '' && styles.modalButtonDisabled,
                s.hovered && styles.modalButtonCreateHover,
              ]}
              onPress={onRename}
              disabled={state.newName.trim() === ''}
            >
              <Text style={styles.modalButtonText}>{t('vaultManager.rename')}</Text>
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
    borderColor: 'rgba(139,92,246,0.3)', // purple-30 glass accent (static StyleSheet — theme override via inline style if needed)
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
  disabledInput: {
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderColor: 'rgba(139,92,246,0.1)',
    justifyContent: 'center',
  },
  disabledInputText: {
    fontSize: 14,
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
