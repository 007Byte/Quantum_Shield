// PH4-FIX: DecryptControls component - action buttons, options
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useLanguage } from '@/hooks/useLanguage';
import {
  dashboardSpacing,
  dashboardColors,
  dashboardLayout,
  webOnlyTransition,
} from '@/components/dashboard2/styles';

type DecryptMode = 'save' | 'view';

interface DecryptControlsProps {
  mode: DecryptMode;
  onModeChange: (mode: DecryptMode) => void;
  selectedCount: number;
  onDecrypt: () => void;
  isDecrypting: boolean;
  progress: number;
}

export function DecryptControls({
  mode,
  onModeChange,
  selectedCount,
  onDecrypt,
  isDecrypting,
  progress,
}: DecryptControlsProps) {
  const { t } = useLanguage();
  return (
    <>
      {/* Mode selector */}
      <View style={styles.modeSelector}>
        <Text style={styles.modeSelectorLabel}>{t('decrypt.afterDecryption')}</Text>
        <View style={styles.modeOptions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onModeChange('save')}
            style={(state: any) => [
              styles.modeButton,
              mode === 'save' && styles.modeButtonActive,
              state.hovered && styles.modeButtonHover,
            ]}
          >
            <Feather
              name="download"
              size={16}
              color={mode === 'save' ? '#FFFFFF' : dashboardColors.textSecondary}
            />
            <Text style={[styles.modeButtonText, mode === 'save' && styles.modeButtonTextActive]}>
              {t('decrypt.saveToDevice')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => onModeChange('view')}
            style={(state: any) => [
              styles.modeButton,
              mode === 'view' && styles.modeButtonActive,
              state.hovered && styles.modeButtonHover,
            ]}
          >
            <Feather
              name="eye"
              size={16}
              color={mode === 'view' ? '#FFFFFF' : dashboardColors.textSecondary}
            />
            <Text style={[styles.modeButtonText, mode === 'view' && styles.modeButtonTextActive]}>
              {t('decrypt.viewTemporarily')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Decrypt action bar */}
      {selectedCount > 0 && (
        <View style={styles.actionBar}>
          <Text style={styles.actionBarText}>
            {t('decrypt.filesSelected', { count: selectedCount })}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              styles.decryptButton,
              webOnlyTransition,
              isDecrypting && styles.decryptButtonDisabled,
              state.hovered && !isDecrypting && styles.decryptButtonHover,
            ]}
            onPress={onDecrypt}
            disabled={isDecrypting}
          >
            <Feather
              name={isDecrypting ? 'loader' : mode === 'save' ? 'download' : 'eye'}
              size={18}
              color="#FFFFFF"
            />
            <Text style={styles.decryptButtonText}>
              {isDecrypting
                ? `${t('decrypt.decryptBtn')}${progress > 0 ? ` ${Math.round(progress * 100)}%` : '...'}`
                : mode === 'save'
                  ? t('decrypt.saveToDevice')
                  : t('decrypt.viewTemporarily')}
            </Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  modeSelector: {
    marginBottom: dashboardSpacing.md,
    gap: dashboardSpacing.sm,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  modeSelectorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  modeOptions: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: dashboardColors.borderPurple,
    backgroundColor: 'rgba(18,12,40,0.6)',
    ...webOnly({ transition: 'all 0.25s ease' }),
  },
  modeButtonActive: {
    backgroundColor: 'rgba(139,92,246,0.3)',
    borderColor: dashboardColors.purple,
    ...webOnly({ boxShadow: '0 0 16px rgba(139,92,246,0.4)' }),
  },
  modeButtonText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modeButtonHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(8,5,20,0.75)',
    ...webOnly({
      position: 'sticky',
      bottom: 16,
      boxShadow: '0 -4px 20px rgba(0,0,0,0.4)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }),
  },
  actionBarText: {
    fontSize: 13,
    fontWeight: '500',
    color: dashboardColors.textSecondary,
  },
  decryptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: 10,
    borderRadius: dashboardLayout.radiusXl,
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 20px rgba(139,92,246,0.5), 0 0 40px rgba(34,211,238,0.2)',
    }),
  },
  decryptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  decryptButtonDisabled: {
    opacity: 0.6,
  },
  decryptButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
});
