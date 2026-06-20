import { useLanguageStore } from '@/stores/languageStore';
import { useTranslation } from 'react-i18next';

/**
 * Subscribe to language changes so the calling component re-renders
 * when the language switches. Returns the current language, setter, and t() function.
 */
export function useLanguage() {
  const language = useLanguageStore(s => s.language);
  const setLanguage = useLanguageStore(s => s.setLanguage);
  const { t } = useTranslation();
  return { language, setLanguage, t };
}
