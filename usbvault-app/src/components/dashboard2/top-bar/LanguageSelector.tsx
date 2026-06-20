import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import type { SupportedLanguage } from '@/stores/languageStore';
import { webOnly } from '@/utils/webStyle';
import { DropdownItem } from './DropdownItem';
import { baseControl, sharedStyles } from './shared';
import type { PressableState } from '@/types/utilities';

interface LanguageSelectorProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const LANGUAGE_CODES: SupportedLanguage[] = ['en', 'es', 'fr', 'de'];

// Helper to get translated language names
function getLanguageName(code: SupportedLanguage, t: (key: string) => string | undefined): string {
  const key = `topBar.language_${code}`;
  return t(key) || code.toUpperCase();
}

const styles = StyleSheet.create({
  controlPill: {
    ...baseControl,
    paddingHorizontal: 12,
    gap: 8,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  dropdown: {
    ...sharedStyles.dropdown,
    minWidth: 180,
  },
  controlText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

/**
 * LanguageSelector: Dropdown menu for switching between supported languages
 *
 * Features:
 * - Supports 4 languages (English, Spanish, French, German)
 * - Shows current language code (EN, ES, FR, DE)
 * - Persists language selection via useLanguage hook
 * - Theme-aware styling
 */
export const LanguageSelector = React.memo(function LanguageSelector({
  isOpen,
  onToggle,
  onClose,
}: LanguageSelectorProps) {
  const { language, setLanguage, t } = useLanguage();
  const { theme } = useTheme();

  const handleSelectLanguage = useCallback(
    (lang: SupportedLanguage) => {
      setLanguage(lang);
      onClose();
    },
    [setLanguage, onClose]
  );

  const languageCode = language.toUpperCase();

  return (
    <View style={[sharedStyles.controlContainer, isOpen && sharedStyles.controlContainerOpen]}>
      {/* Toggle button */}
      <Pressable
        onPress={onToggle}
        style={(state: PressableState) =>
          [
            styles.controlPill,
            resolveLayerStyle(theme.L3.base),
            state.hovered && resolveLayerStyle(theme.L3.hover),
          ] as any
        }
        accessibilityRole="button"
        accessibilityLabel={
          (t('topBar.changeLanguage') || 'Change language') + ': ' + getLanguageName(language, t)
        }
        accessibilityState={{ expanded: isOpen }}
      >
        <Feather name="globe" size={15} color={theme.L2.base.text.primary} />
        <Text style={[styles.controlText, { color: theme.L2.base.text.primary }]}>
          {languageCode}
        </Text>
        <Feather name="chevron-down" size={15} color={theme.L2.base.text.secondary} />
      </Pressable>

      {/* Dropdown menu */}
      {isOpen && (
        <View
          nativeID="dropdown-language"
          style={[styles.dropdown, resolveLayerStyle(theme.L4.base)]}
          accessibilityRole="menu"
        >
          <Text style={[sharedStyles.dropdownTitle, { color: theme.L2.base.text.secondary }]}>
            {t('topBar.language')}
          </Text>
          {LANGUAGE_CODES.map(code => (
            <DropdownItem
              key={code}
              onPress={() => handleSelectLanguage(code)}
              active={language === code}
            >
              <Text
                style={[
                  sharedStyles.dropdownItemText,
                  language === code && sharedStyles.dropdownItemTextActive,
                  { color: language === code ? theme.semantic.cyan : theme.L2.base.text.primary },
                ]}
              >
                {getLanguageName(code, t)}
              </Text>
              {language === code && <Feather name="check" size={14} color={theme.semantic.cyan} />}
            </DropdownItem>
          ))}
        </View>
      )}
    </View>
  );
});
