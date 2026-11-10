/** Human label for broker commission terms versions such as BIN_BROKER_TERMS_2026_01. */

const KNOWN: Record<string, [string, string]> = {
  BIN_BROKER_TERMS_2026_01: ['Broker commission terms (January 2026)', 'شروط عمولة الوسيط (يناير 2026)'],
};

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function brokerTermsLabel(version: unknown, lang: 'en' | 'ar' = 'en'): string {
  const key = String(version ?? '').trim();
  if (!key) return lang === 'ar' ? 'شروط عمولة الوسيط' : 'Broker commission terms';
  const known = KNOWN[key];
  if (known) return lang === 'ar' ? known[1] : known[0];
  const parsed = key.match(/^BIN_BROKER_TERMS_(\d{4})_(\d{2})$/);
  if (parsed) {
    const year = parsed[1];
    const monthIndex = Number(parsed[2]) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return lang === 'ar'
        ? `شروط عمولة الوسيط (${MONTHS_AR[monthIndex]} ${year})`
        : `Broker commission terms (${MONTHS_EN[monthIndex]} ${year})`;
    }
  }
  return lang === 'ar' ? 'شروط عمولة الوسيط' : 'Broker commission terms';
}
