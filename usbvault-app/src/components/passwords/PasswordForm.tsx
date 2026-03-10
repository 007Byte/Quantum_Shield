// PH4-FIX: PasswordForm component - add/edit password modal
import { StyleSheet, Text, TextInput, View, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing, dashboardColors, dashboardLayout, glassPanelBase, webOnlyGlass, webOnlyTransition } from '@/components/dashboard2/styles';
import type { PasswordFormData } from '@/hooks/usePasswords';

interface PasswordFormProps {
  visible: boolean;
  isEditing: boolean;
  formData: PasswordFormData;
  onFormChange: (data: PasswordFormData) => void;
  onClose: () => void;
  onSave: () => void;
  onGeneratePassword: () => void;
}

export function PasswordForm({
  visible,
  isEditing,
  formData,
  onFormChange,
  onClose,
  onSave,
  onGeneratePassword,
}: PasswordFormProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, glassPanelBase, webOnlyGlass]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEditing ? 'Edit Password' : 'Add Password'}</Text>
            <Pressable style={(state: any) => [state.hovered && styles.modalCloseHover]} onPress={onClose}>
              <Feather name="x" size={24} color={dashboardColors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., Gmail, GitHub"
              placeholderTextColor={dashboardColors.textSecondary}
              value={formData.title}
              onChangeText={(text) => onFormChange({ ...formData, title: text })}
            />

            <Text style={styles.inputLabel}>Username/Email</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="your@email.com"
              placeholderTextColor={dashboardColors.textSecondary}
              value={formData.username}
              onChangeText={(text) => onFormChange({ ...formData, username: text })}
            />

            <Text style={styles.inputLabel}>Password</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, marginBottom: 0 }]}
                placeholder="Enter password"
                placeholderTextColor={dashboardColors.textSecondary}
                value={formData.password}
                onChangeText={(text) => onFormChange({ ...formData, password: text })}
              />
              <Pressable
                style={(state: any) => [styles.generateBtn, webOnlyTransition, state.hovered && styles.generateBtnHover]}
                onPress={onGeneratePassword}
              >
                <Feather name="zap" size={14} color="#22D3EE" />
                <Text style={styles.generateBtnText}>Generate</Text>
              </Pressable>
            </View>

            <Text style={styles.inputLabel}>URL (optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="https://example.com"
              placeholderTextColor={dashboardColors.textSecondary}
              value={formData.url}
              onChangeText={(text) => onFormChange({ ...formData, url: text })}
            />

            <Text style={styles.inputLabel}>Category (optional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Work, Personal, etc."
              placeholderTextColor={dashboardColors.textSecondary}
              value={formData.category}
              onChangeText={(text) => onFormChange({ ...formData, category: text })}
            />
          </View>

          <View style={styles.modalFooter}>
            <Pressable
              style={(state: any) => [styles.modalCancelButton, webOnlyTransition, state.hovered && styles.modalCancelButtonHover]}
              onPress={onClose}
            >
              <Text style={styles.modalCancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={(state: any) => [styles.modalSaveButton, webOnlyTransition, state.hovered && styles.modalSaveButtonHover]}
              onPress={onSave}
            >
              <Text style={styles.modalSaveButtonText}>Save Password</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: dashboardSpacing.md,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    borderRadius: dashboardLayout.radiusXl,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  modalBody: {
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.lg,
    gap: dashboardSpacing.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
    marginBottom: 6,
  },
  modalInput: {
    fontSize: 14,
    color: dashboardColors.textPrimary,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(18,12,40,0.6)',
    marginBottom: dashboardSpacing.md,
    ...webOnly({ outline: 'none' }),
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    backgroundColor: 'rgba(34,211,238,0.08)',
    ...webOnly({ cursor: 'pointer' }),
  },
  generateBtnHover: {
    borderColor: 'rgba(34,211,238,0.6)',
    backgroundColor: 'rgba(34,211,238,0.15)',
    ...webOnly({ boxShadow: '0 0 12px rgba(34,211,238,0.3)' }),
  },
  generateBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22D3EE',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.2)',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    ...webOnly({ cursor: 'pointer' }),
  },
  modalCancelButtonHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
      cursor: 'pointer',
    }),
  },
  modalSaveButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  modalSaveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  modalCloseHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
});
