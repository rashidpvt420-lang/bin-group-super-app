import { useLanguage } from '../../context/LanguageContext';
import { useTechnicianLanguage } from '../i18n/technicianLanguages';
import { hrText } from '../i18n/hrTechnicianStrings';

/** Drop-in for <Bi en ar /> on technician HR screens: follows the technician language (7 languages). */
export default function HrBi({ en, ar }: { en: string; ar: string }) {
  const { lang: appLang } = useLanguage();
  const { lang } = useTechnicianLanguage(appLang);
  return <>{hrText(lang, en, ar)}</>;
}

/** Hook form for props (labels, chips). */
export function useHrText() {
  const { lang: appLang } = useLanguage();
  const tech = useTechnicianLanguage(appLang);
  return { ...tech, ht: (en: string, ar = en) => hrText(tech.lang, en, ar) };
}
