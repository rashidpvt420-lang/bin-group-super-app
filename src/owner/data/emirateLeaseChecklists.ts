/**
 * Emirate lease checklists — GENERAL GUIDANCE ONLY. BIN GROUP is not a government service, these lists are
 * not official, and requirements change. Every list tells the user to confirm with the relevant authority.
 * No government system is integrated or contacted.
 */
export type ChecklistItem = { en: string; ar: string };
export type EmirateChecklist = { emirate: string; en: string; ar: string; items: ChecklistItem[] };

export const CHECKLIST_DISCLAIMER = {
  en: 'General guidance only — not official and not legal advice. Requirements change; confirm with the relevant emirate authority before acting.',
  ar: 'إرشادات عامة فقط — ليست رسمية وليست استشارة قانونية. قد تتغير المتطلبات؛ تحقق من الجهة المختصة في الإمارة قبل أي إجراء.',
};

const COMMON: ChecklistItem[] = [
  { en: 'Signed tenancy contract with rent, term and payment schedule', ar: 'عقد إيجار موقّع يتضمن قيمة الإيجار والمدة وجدول الدفعات' },
  { en: 'Copies of tenant Emirates ID / passport and owner title documents', ar: 'نسخ من هوية المستأجر أو جوازه ووثائق ملكية المالك' },
  { en: 'Post-dated cheques listed with number, date and amount', ar: 'قائمة بالشيكات المؤجلة برقمها وتاريخها ومبلغها' },
  { en: 'Security deposit receipt', ar: 'إيصال مبلغ التأمين' },
];

export const EMIRATE_CHECKLISTS: EmirateChecklist[] = [
  { emirate: 'DUBAI', en: 'Dubai', ar: 'دبي', items: [...COMMON, { en: 'Tenancy registration (commonly through Ejari) — confirm current steps with the authority', ar: 'تسجيل عقد الإيجار (عادةً عبر إيجاري) — تحقق من الخطوات الحالية لدى الجهة المختصة' }] },
  { emirate: 'ABU_DHABI', en: 'Abu Dhabi', ar: 'أبوظبي', items: [...COMMON, { en: 'Tenancy registration (commonly through Tawtheeq) — confirm current steps with the authority', ar: 'تسجيل عقد الإيجار (عادةً عبر توثيق) — تحقق من الخطوات الحالية لدى الجهة المختصة' }] },
  { emirate: 'SHARJAH', en: 'Sharjah', ar: 'الشارقة', items: [...COMMON, { en: 'Contract attestation with the municipality — confirm current steps with the authority', ar: 'تصديق العقد لدى البلدية — تحقق من الخطوات الحالية لدى الجهة المختصة' }] },
  { emirate: 'AJMAN', en: 'Ajman', ar: 'عجمان', items: [...COMMON, { en: 'Contract attestation with the municipality — confirm current steps with the authority', ar: 'تصديق العقد لدى البلدية — تحقق من الخطوات الحالية لدى الجهة المختصة' }] },
  { emirate: 'RAS_AL_KHAIMAH', en: 'Ras Al Khaimah', ar: 'رأس الخيمة', items: [...COMMON, { en: 'Check local registration requirements with the municipality', ar: 'تحقق من متطلبات التسجيل المحلية لدى البلدية' }] },
  { emirate: 'UMM_AL_QUWAIN', en: 'Umm Al Quwain', ar: 'أم القيوين', items: [...COMMON, { en: 'Check local registration requirements with the municipality', ar: 'تحقق من متطلبات التسجيل المحلية لدى البلدية' }] },
  { emirate: 'FUJAIRAH', en: 'Fujairah', ar: 'الفجيرة', items: [...COMMON, { en: 'Check local registration requirements with the municipality', ar: 'تحقق من متطلبات التسجيل المحلية لدى البلدية' }] },
];
