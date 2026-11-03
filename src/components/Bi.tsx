import { useLanguage } from '../context/LanguageContext';

/**
 * Bilingual inline text. Renders the Arabic copy when the app language is Arabic,
 * otherwise the English copy. Used for profile screens whose static copy was
 * English-only (2026-11-03 five-profile audit).
 */
export default function Bi({ en, ar }: { en: string; ar: string }) {
  const { lang } = useLanguage();
  return <>{lang === 'ar' ? ar : en}</>;
}
