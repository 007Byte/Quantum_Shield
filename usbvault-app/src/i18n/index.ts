import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';

// Read persisted language before React renders
function getInitialLanguage(): string {
  if (typeof localStorage === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem('usbvault:language');
    if (stored && ['en', 'es', 'fr', 'de'].includes(stored)) return stored;
  } catch {
    // localStorage not available
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

export default i18n;
