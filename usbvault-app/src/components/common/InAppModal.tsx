import { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useFocusTrap } from '@/hooks/useFocusTrap';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModalButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface PromptField {
  key: string;
  label: string;
  placeholder?: string;
  secure?: boolean;
  defaultValue?: string;
}

export interface InAppModalConfig {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: ModalButton[];
  icon?: string;
  iconColor?: string;
  /** For prompt-style modals with text inputs */
  fields?: PromptField[];
  onSubmitFields?: (values: Record<string, string>) => void;
  /** Auto-dismiss after this many ms (for success toasts) */
  autoDismissMs?: number;
}

export const EMPTY_MODAL: InAppModalConfig = {
  visible: false,
  title: '',
};

// ─── Hook for easy usage ──────────────────────────────────────────────────────

export function useInAppModal() {
  const [modal, setModal] = useState<InAppModalConfig>(EMPTY_MODAL);

  const showAlert = (title: string, message?: string, buttons?: ModalButton[]) => {
    setModal({
      visible: true,
      title,
      message,
      buttons: buttons || [{ text: 'OK', onPress: () => setModal(EMPTY_MODAL) }],
    });
  };

  const showSuccess = (title: string, message?: string) => {
    setModal({
      visible: true,
      title,
      message,
      icon: 'check-circle',
      iconColor: '#22D3EE',
      autoDismissMs: 2500,
      buttons: [{ text: 'OK', onPress: () => setModal(EMPTY_MODAL) }],
    });
  };

  const showError = (title: string, message?: string) => {
    setModal({
      visible: true,
      title,
      message,
      icon: 'alert-circle',
      iconColor: '#EF4444',
      buttons: [{ text: 'OK', onPress: () => setModal(EMPTY_MODAL) }],
    });
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirm',
    confirmStyle: 'default' | 'destructive' = 'default'
  ) => {
    setModal({
      visible: true,
      title,
      message,
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => setModal(EMPTY_MODAL) },
        {
          text: confirmText,
          style: confirmStyle,
          onPress: () => {
            setModal(EMPTY_MODAL);
            onConfirm();
          },
        },
      ],
    });
  };

  const showPrompt = (
    title: string,
    fields: PromptField[],
    onSubmit: (values: Record<string, string>) => void,
    _submitText = 'Submit'
  ) => {
    setModal({
      visible: true,
      title,
      fields,
      onSubmitFields: vals => {
        setModal(EMPTY_MODAL);
        onSubmit(vals);
      },
      buttons: [{ text: 'Cancel', style: 'cancel', onPress: () => setModal(EMPTY_MODAL) }],
    });
  };

  const dismiss = () => setModal(EMPTY_MODAL);

  return { modal, showAlert, showSuccess, showError, showConfirm, showPrompt, dismiss, setModal };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InAppModal({
  config,
  onDismiss,
}: {
  config: InAppModalConfig;
  onDismiss?: () => void;
}) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const handleCloseForTrap = () => {
    onDismiss?.();
    const cancelBtn = config.buttons?.find(b => b.style === 'cancel');
    if (cancelBtn?.onPress) {
      cancelBtn.onPress();
    } else {
      config.buttons?.[0]?.onPress?.();
    }
  };

  const focusTrapRef = useFocusTrap(config.visible, handleCloseForTrap);

  // Reset field values when modal opens
  useEffect(() => {
    if (config.visible && config.fields) {
      const initial: Record<string, string> = {};
      config.fields.forEach(f => {
        initial[f.key] = f.defaultValue || '';
      });
      setFieldValues(initial);
    }
  }, [config.visible]);

  // Auto-dismiss
  useEffect(() => {
    if (config.visible && config.autoDismissMs) {
      const timer = setTimeout(() => {
        onDismiss?.();
        config.buttons?.[0]?.onPress?.();
      }, config.autoDismissMs);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [config.visible, config.autoDismissMs]);

  if (!config.visible) return null;

  const handleClose = handleCloseForTrap;

  const hasFields = config.fields && config.fields.length > 0;

  return (
    <Modal transparent animationType="fade" visible={config.visible} onRequestClose={handleClose}>
      <Pressable style={s.overlay} onPress={handleClose} ref={focusTrapRef}>
        <Pressable style={s.card} onPress={e => e.stopPropagation?.()} accessibilityRole="button">
          {/* Close button */}
          <Pressable
            style={(state: any) => [s.closeBtn, state.hovered && s.closeBtnHover]}
            onPress={handleClose}
            accessibilityRole="button"
          >
            <Feather name="x" size={16} color="rgba(255,255,255,0.5)" />
          </Pressable>

          {/* Icon */}
          {config.icon && (
            <View style={s.iconWrap}>
              <Feather name={config.icon as any} size={28} color={config.iconColor || '#8B5CF6'} />
            </View>
          )}

          {/* Title */}
          <Text style={s.title}>{config.title}</Text>

          {/* Message */}
          {config.message && <Text style={s.message}>{config.message}</Text>}

          {/* Fields (for prompt-style modals) */}
          {hasFields && (
            <View style={s.fieldsWrap}>
              {config.fields!.map(field => (
                <View key={field.key} style={s.fieldGroup}>
                  <Text style={s.fieldLabel}>{field.label}</Text>
                  <TextInput
                    accessibilityLabel="Text input"
                    style={s.fieldInput}
                    value={fieldValues[field.key] || ''}
                    onChangeText={text => setFieldValues(prev => ({ ...prev, [field.key]: text }))}
                    placeholder={field.placeholder || ''}
                    placeholderTextColor="rgba(255,255,255,0.25)"
                    secureTextEntry={field.secure}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}
            </View>
          )}

          {/* Buttons */}
          <View style={s.buttonRow}>
            {config.buttons?.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              const isPrimary = !isDestructive && !isCancel;

              return (
                <Pressable
                  testID={isCancel ? 'modal-cancel' : 'modal-confirm'}
                  accessibilityRole="button"
                  key={i}
                  style={(state: any) => [
                    s.button,
                    isCancel && s.buttonCancel,
                    isDestructive && s.buttonDestructive,
                    isPrimary && s.buttonPrimary,
                    state.hovered &&
                      (isCancel
                        ? s.buttonCancelHover
                        : isDestructive
                          ? s.buttonDestructiveHover
                          : s.buttonPrimaryHover),
                  ]}
                  onPress={() => btn.onPress?.()}
                >
                  <Text
                    style={[
                      s.buttonText,
                      isCancel && s.buttonTextCancel,
                      isDestructive && s.buttonTextDestructive,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </Pressable>
              );
            })}

            {/* Submit button for field modals */}
            {hasFields && config.onSubmitFields && (
              <Pressable
                accessibilityRole="button"
                style={(state: any) => [
                  s.button,
                  s.buttonPrimary,
                  state.hovered && s.buttonPrimaryHover,
                ]}
                onPress={() => config.onSubmitFields?.(fieldValues)}
              >
                <Text style={s.buttonText}>Submit</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ backdropFilter: 'blur(6px)' }),
  },
  card: {
    width: '90%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.45)',
    backgroundColor: 'rgba(15,10,30,0.97)',
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    ...webOnly({
      boxShadow:
        '0 12px 60px rgba(0,0,0,0.7), 0 0 30px rgba(139,92,246,0.3), 0 0 1px rgba(139,92,246,0.5)',
      backdropFilter: 'blur(30px)',
    }),
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    ...webOnly({ transition: 'all 0.15s ease' }),
  },
  closeBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    ...webOnly({
      boxShadow: '0 0 10px rgba(139,92,246,0.3)',
    }),
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5F3FF',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  fieldsWrap: {
    width: '100%',
    gap: 14,
    marginBottom: 20,
  },
  fieldGroup: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  fieldInput: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(18,12,40,0.6)',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#F5F3FF',
    ...webOnly({ outlineWidth: 0 }),
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  buttonPrimary: {
    backgroundColor: 'rgba(139,92,246,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.6)',
    ...webOnly({
      boxShadow: '0 0 14px rgba(139,92,246,0.3)',
    }),
  },
  buttonPrimaryHover: {
    backgroundColor: 'rgba(139,92,246,0.6)',
    borderColor: 'rgba(139,92,246,0.8)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 24px rgba(139,92,246,0.5), 0 0 40px rgba(34,211,238,0.2)',
    }),
  },
  buttonCancel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  buttonCancelHover: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(255,255,255,0.08)',
    }),
  },
  buttonDestructive: {
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    ...webOnly({
      boxShadow: '0 0 14px rgba(239,68,68,0.2)',
    }),
  },
  buttonDestructiveHover: {
    backgroundColor: 'rgba(239,68,68,0.35)',
    borderColor: 'rgba(239,68,68,0.6)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 24px rgba(239,68,68,0.4)',
    }),
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5F3FF',
  },
  buttonTextCancel: {
    color: 'rgba(255,255,255,0.5)',
  },
  buttonTextDestructive: {
    color: '#EF4444',
  },
});
