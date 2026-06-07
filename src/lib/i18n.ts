/**
 * BIN GROUP Internationalization (i18n)
 * Arabic & English translations
 */

import en from '../locales/en.json';
import ar from '../locales/ar.json';

export type Language = 'en' | 'ar';

const translations: Record<Language, any> = {
  en: en,
  ar: ar
};

export function t(key: string, language: Language = 'en'): string {
  const keys = key.split('.');
  let value: any = translations[language];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key; // Return key if translation not found
    }
  }

  return typeof value === 'string' ? value : key;
}

export function tx(key: string, fallback: string, language: Language = 'en'): string {
  const translated = t(key, language);
  return translated === key ? fallback : translated;
}

export function getLanguage(): Language {
  const stored = localStorage.getItem('bin_language');
  if (stored === 'en' || stored === 'ar') return stored;
  return 'en';
}

export function setLanguage(lang: Language) {
  localStorage.setItem('bin_language', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export default translations;
