/**
 * Ticket Form Modal component for Help screen.
 */

import { Text, View, Pressable, TextInput, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import type { TicketCategory, TicketPriority } from '@/services/supportService';
import { CATEGORY_I18N, CATEGORIES } from './data';
import { styles } from './styles';

interface TicketFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitted: boolean;
  error: string;
  subject: string;
  onSubjectChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  category: TicketCategory;
  onCategoryChange: (value: TicketCategory) => void;
  priority: TicketPriority;
  onPriorityChange: (value: TicketPriority) => void;
}

const PRIORITY_I18N: Record<string, string> = {
  low: 'help.priorityLow',
  medium: 'help.priorityMedium',
  high: 'help.priorityHigh',
  critical: 'help.priorityCritical',
};

const prioritiesList: { value: TicketPriority; color: string }[] = [
  { value: 'low', color: dashboardColors.textSecondary },
  { value: 'medium', color: 'rgba(245,158,11,1)' },
  { value: 'high', color: '#F97316' },
  { value: 'critical', color: 'rgba(239,68,68,1)' },
];

export function TicketFormModal({
  visible,
  onClose,
  onSubmit,
  submitted,
  error,
  subject,
  onSubjectChange,
  description,
  onDescriptionChange,
  category,
  onCategoryChange,
  priority,
  onPriorityChange,
}: TicketFormModalProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, resolveLayerStyle(theme.L2.base)]}>
          <View style={styles.modalHeader}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              {t('help.submitTicket')}
            </Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <Feather name="x" size={24} color={dashboardColors.textSecondary} />
            </Pressable>
          </View>

          {submitted ? (
            <View style={styles.ticketSuccess}>
              <Feather name="check-circle" size={48} color={theme.semantic.success} />
              <Text style={[styles.ticketSuccessTitle, { color: theme.semantic.success }]}>
                {t('help.ticketSubmitted')}
              </Text>
              <Text style={styles.ticketSuccessText}>{t('help.ticketSubmittedMessage')}</Text>
            </View>
          ) : (
            <View style={styles.ticketForm}>
              {error !== '' && (
                <View
                  style={[
                    styles.errorBanner,
                    {
                      backgroundColor: `${theme.semantic.danger}15`,
                      borderColor: `${theme.semantic.danger}33`,
                    },
                  ]}
                >
                  <Feather name="alert-circle" size={14} color={theme.semantic.danger} />
                  <Text style={[styles.errorText, { color: theme.semantic.danger }]}>{error}</Text>
                </View>
              )}

              <Text style={styles.formLabel}>{t('help.subject')}</Text>
              <TextInput
                style={styles.formInput}
                placeholder={t('help.subjectPlaceholder')}
                placeholderTextColor={dashboardColors.textSecondary}
                value={subject}
                onChangeText={onSubjectChange}
                accessibilityLabel="Support ticket subject"
              />

              <Text style={styles.formLabel}>{t('help.category')}</Text>
              <View style={styles.chipRow}>
                {CATEGORIES.map(cat => (
                  <Pressable
                    accessibilityRole="button"
                    key={cat.value}
                    style={[styles.chip, category === cat.value && styles.chipActive]}
                    onPress={() => onCategoryChange(cat.value)}
                  >
                    <Text
                      style={[styles.chipText, category === cat.value && styles.chipTextActive]}
                    >
                      {t(CATEGORY_I18N[cat.value]) || cat.value}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.formLabel}>{t('help.priority')}</Text>
              <View style={styles.chipRow}>
                {prioritiesList.map(p => (
                  <Pressable
                    accessibilityRole="button"
                    key={p.value}
                    style={[
                      styles.chip,
                      priority === p.value && {
                        borderColor: p.color,
                        backgroundColor: `${p.color}15`,
                      },
                    ]}
                    onPress={() => onPriorityChange(p.value)}
                  >
                    <Text style={[styles.chipText, priority === p.value && { color: p.color }]}>
                      {t(PRIORITY_I18N[p.value]) || p.value}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.formLabel}>{t('help.description')}</Text>
              <TextInput
                accessibilityLabel="Description input"
                style={[styles.formInput, { height: 120, textAlignVertical: 'top' }]}
                placeholder={t('help.descriptionPlaceholder')}
                placeholderTextColor={dashboardColors.textSecondary}
                value={description}
                onChangeText={onDescriptionChange}
                multiline
              />

              <Pressable
                accessibilityRole="button"
                style={(state: any) => [styles.submitBtn, state.hovered && styles.submitBtnHover]}
                onPress={onSubmit}
              >
                <Feather name="send" size={16} color="#fff" />
                <Text style={styles.submitBtnText}>{t('help.submitTicketBtn')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
