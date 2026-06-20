// PH4-FIX: PasswordList component - password entry list
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import {
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
  webOnlyGlowTier3,
} from '@/components/dashboard2/styles';
import { useLanguage } from '@/hooks/useLanguage';
import type { PasswordEntry } from '@/hooks/usePasswords';

interface PasswordListProps {
  entries: PasswordEntry[];
  isLoading: boolean;
  copyFeedback: string | null;
  onCopyPassword: (password: string, entryId: string) => void;
  onEditPassword: (entry: PasswordEntry) => void;
  onDeletePassword: (entryId: string, title: string) => void;
  onAddClick: () => void;
  getStrengthColor: (strength: string) => string;
}

export function PasswordList({
  entries,
  isLoading,
  copyFeedback,
  onCopyPassword,
  onEditPassword,
  onDeletePassword,
  onAddClick,
  getStrengthColor,
}: PasswordListProps) {
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <View style={styles.emptyState}>
        <Feather name="loader" size={48} color="rgba(139,92,246,0.4)" />
        <Text style={styles.emptyText}>{t('passwords.loading')}</Text>
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Feather name="shield" size={48} color="rgba(139,92,246,0.4)" />
        <Text style={styles.emptyTitle}>{t('passwords.emptyTitle')}</Text>
        <Text style={styles.emptyText}>
          {t('passwords.emptyDescription')}
        </Text>
        <Pressable
          accessibilityRole="button"
          style={(state: any) => [
            styles.emptyCtaBtn,
            webOnly({ transition: 'all 0.2s ease' }),
            state.hovered && styles.emptyCtaBtnHover,
          ]}
          onPress={onAddClick}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.addButtonText}>{t('passwords.addFirst')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.entriesList}>
      {entries.map(entry => (
        <Pressable
          accessibilityRole="button"
          key={entry.id}
          style={(state: any) => [
            styles.entryCard,
            glassPanelBase,
            webOnlyGlass,
            webOnlyGlowTier3,
            state.hovered && styles.entryCardHover,
          ]}
        >
          <View style={styles.entryMainContent}>
            <View style={styles.entryLeft}>
              <Text style={styles.serviceName}>{entry.title}</Text>
              <Text style={styles.username}>{entry.username}</Text>
            </View>
            <View style={styles.entryCenter}>
              <View style={styles.strengthIndicator}>
                <View
                  style={[
                    styles.strengthDot,
                    { backgroundColor: getStrengthColor(entry.strength) },
                  ]}
                />
                <Text style={styles.strengthText}>{t(`passwords.strength${entry.strength}`)}</Text>
              </View>
              <Text style={styles.lastModified}>{entry.lastModified}</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.entryActions}>
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [
                styles.iconButton,
                webOnly({ transition: 'all 0.2s ease' }),
                state.hovered && styles.iconButtonHover,
              ]}
              onPress={() => onCopyPassword(entry.password, entry.id)}
            >
              {copyFeedback === entry.id ? (
                <Feather name="check" size={18} color="#10B981" />
              ) : (
                <Feather name="copy" size={18} color={dashboardColors.cyan} />
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [
                styles.iconButton,
                webOnly({ transition: 'all 0.2s ease' }),
                state.hovered && styles.iconButtonHover,
              ]}
              onPress={() => onEditPassword(entry)}
            >
              <Feather name="edit-2" size={18} color={dashboardColors.cyan} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [
                styles.iconButton,
                webOnly({ transition: 'all 0.2s ease' }),
                state.hovered && styles.iconButtonHover,
              ]}
              onPress={() => onDeletePassword(entry.id, entry.title)}
            >
              <Feather name="trash-2" size={18} color="#EF4444" />
            </Pressable>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  entriesList: {
    gap: dashboardSpacing.md,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    minHeight: 90,
  },
  entryCardHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  entryMainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.lg,
  },
  entryLeft: {
    minWidth: 200,
  },
  serviceName: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 4,
  },
  username: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  entryCenter: {
    flex: 1,
    gap: 8,
  },
  strengthIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  strengthDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  strengthText: {
    fontSize: 13,
    fontWeight: '500',
    color: dashboardColors.textPrimary,
  },
  lastModified: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    marginLeft: dashboardSpacing.md,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  iconButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.md,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 30,
    paddingVertical: 50,
    marginHorizontal: dashboardSpacing.md,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
    maxWidth: 360,
  },
  emptyCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    marginTop: 8,
    ...webOnly({
      background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
      boxShadow: '0 0 20px rgba(168,85,247,0.5), 0 0 40px rgba(124,58,237,0.3)',
      cursor: 'pointer',
    }),
  },
  emptyCtaBtnHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
