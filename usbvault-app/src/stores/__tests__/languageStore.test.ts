/**
 * languageStore tests.
 *
 * Verifies the real setLanguage transition, localStorage persistence, the
 * load/validate-against-allowlist logic, and that the i18n boundary is invoked.
 * Only the genuine boundary (i18n) is mocked; jsdom localStorage runs for real.
 */
import { useLanguageStore, type SupportedLanguage } from '../languageStore';
const changeLanguage = jest.fn();
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { changeLanguage: (...a: unknown[]) => changeLanguage(...a) },
}));

const STORAGE_KEY = 'usbvault:language';

localStorage.clear();

describe('languageStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    useLanguageStore.setState({ language: 'en' });
  });

  describe('initial state', () => {
    it('defaults to English when nothing is persisted', () => {
      expect(useLanguageStore.getState().language).toBe('en');
    });

    it('exposes setLanguage as a function', () => {
      expect(typeof useLanguageStore.getState().setLanguage).toBe('function');
    });
  });

  describe('setLanguage', () => {
    it('updates the store language', () => {
      useLanguageStore.getState().setLanguage('es');
      expect(useLanguageStore.getState().language).toBe('es');
    });

    it('persists the selected language to localStorage', () => {
      useLanguageStore.getState().setLanguage('de');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('de');
    });

    it('drives i18n.changeLanguage to the selected language', () => {
      useLanguageStore.getState().setLanguage('fr');
      expect(changeLanguage).toHaveBeenCalledWith('fr');
    });

    it('handles each supported language', () => {
      const langs: SupportedLanguage[] = ['en', 'es', 'fr', 'de'];
      for (const lang of langs) {
        useLanguageStore.getState().setLanguage(lang);
        expect(useLanguageStore.getState().language).toBe(lang);
        expect(localStorage.getItem(STORAGE_KEY)).toBe(lang);
      }
    });
  });

  describe('persistence round-trip via a fresh module load', () => {
    it('loads a persisted valid language on re-import', () => {
      jest.resetModules();
      localStorage.setItem(STORAGE_KEY, 'fr');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useLanguageStore: fresh } = require('../languageStore');
      expect(fresh.getState().language).toBe('fr');
    });

    it('falls back to English for an unsupported persisted value', () => {
      jest.resetModules();
      localStorage.setItem(STORAGE_KEY, 'jp');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useLanguageStore: fresh } = require('../languageStore');
      expect(fresh.getState().language).toBe('en');
    });

    it('falls back to English when nothing is persisted', () => {
      jest.resetModules();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { useLanguageStore: fresh } = require('../languageStore');
      expect(fresh.getState().language).toBe('en');
    });
  });

  describe('subscriptions', () => {
    it('notifies subscribers of language changes', () => {
      const seen: SupportedLanguage[] = [];
      const unsub = useLanguageStore.subscribe(s => seen.push(s.language));
      useLanguageStore.getState().setLanguage('es');
      useLanguageStore.getState().setLanguage('de');
      expect(seen).toEqual(['es', 'de']);
      unsub();
    });
  });
});
