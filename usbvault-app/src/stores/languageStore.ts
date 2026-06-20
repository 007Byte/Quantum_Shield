import { create } from 'zustand';
import i18n from '@/i18n';

export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de';

const STORAGE_KEY = 'usbvault:language';

const VALID_LANGUAGES: SupportedLanguage[] = ['en', 'es', 'fr', 'de'];

function loadLanguage(): SupportedLanguage {
  if (typeof localStorage === 'undefined') return 'en';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_LANGUAGES.includes(raw as SupportedLanguage)) {
      return raw as SupportedLanguage;
    }
  } catch {
    // localStorage not available
  }
  return 'en';
}

function persistLanguage(lang: SupportedLanguage): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage not available
  }
}

interface LanguageState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
}

export const useLanguageStore = create<LanguageState>(set => ({
  language: loadLanguage(),

  setLanguage: (lang: SupportedLanguage) => {
    persistLanguage(lang);
    i18n.changeLanguage(lang);
    set({ language: lang });
  },
}));
