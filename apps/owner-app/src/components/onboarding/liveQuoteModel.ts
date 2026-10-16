// Live owner quote preview (Founder request 2026-10-14 13:00). All prices come from the SAME shared
// pricing module the server uses (calculateUaeQuote2026); this file only shapes inputs and labels.
// The server quote (calculateOwnerOnboardingQuote) remains the authority at submit.
import {
  calculateUaeQuote2026,
  resolveAssetClassIdForPropertyType,
  resolveAreaZone,
  resolveEmirateMultiplier,
  resolveAgeFactor,
  UAE_AREA_ZONES_2026,
  UAE_PRICING_MATRIX_2026,
  ZONE_PENDING_FLAG,
  BEDROOMS_PENDING_FLAG,
  AGE_PENDING_FLAG,
  EMIRATE_PENDING_FLAG,
  normalizeAedMoney,
} from '@bin/shared';

export type LiveContract = 'FM_ONLY' | 'PM_ONLY' | 'BOTH';
export type LiveLang = 'en' | 'ar';

export interface LiveQuoteState {
  emirate: string;
  area: string;
  propertyType: string;
  /** Apartment bedrooms (0 = studio); ignored for other types. */
  bedrooms: number | null;
  scope: 'Standard' | 'Luxury';
  sqft: number;
  annualRent: number;
  /** null = not provided: priced at the highest age band with a warning. */
  age: number | null;
  contractType: LiveContract;
}

export const LIVE_EMIRATES: Array<{ id: string; en: string; ar: string }> = [
  { id: 'Dubai', en: 'Dubai', ar: 'دبي' },
  { id: 'Abu Dhabi', en: 'Abu Dhabi', ar: 'أبوظبي' },
  { id: 'Sharjah', en: 'Sharjah', ar: 'الشارقة' },
  { id: 'Ajman', en: 'Ajman', ar: 'عجمان' },
  { id: 'Ras Al Khaimah', en: 'Ras Al Khaimah', ar: 'رأس الخيمة' },
  { id: 'Umm Al Quwain', en: 'Umm Al Quwain', ar: 'أم القيوين' },
  { id: 'Fujairah', en: 'Fujairah', ar: 'الفجيرة' },
];

export const LIVE_PROPERTY_TYPES: Array<{ id: string; en: string; ar: string }> = [
  { id: 'Apartment', en: 'Apartment', ar: 'شقة' },
  { id: 'Villa', en: 'Villa', ar: 'فيلا' },
  { id: 'Residential Building', en: 'Residential building', ar: 'مبنى سكني' },
  { id: 'Office', en: 'Office', ar: 'مكتب' },
  { id: 'Warehouse', en: 'Warehouse', ar: 'مستودع' },
];

const ABU_DHABI_REGIONS = new Set(['Abu Dhabi', 'Al Ain', 'Al Dhafra']);
export const ZONE_LABEL: Record<string, { en: string; ar: string }> = {
  A: { en: 'Premium', ar: 'مميزة' },
  B: { en: 'Standard', ar: 'قياسية' },
  C: { en: 'Affordable', ar: 'اقتصادية' },
};

/** Areas from the approved zone CSV for one emirate (Abu Dhabi includes Al Ain and Al Dhafra). */
export function areasForEmirate(emirate: string) {
  return UAE_AREA_ZONES_2026.filter((row) => (emirate === 'Abu Dhabi' ? ABU_DHABI_REGIONS.has(row.region) : row.region === emirate));
}

/** Dropdown value for an area that is not in the zone map (priced Zone A until admin confirmation). */
export const OTHER_AREA = 'Other area (not listed)';

/** Arabic display name from the zone CSV aliases when the UI is Arabic (value stays the English area). */
export function areaLabel(entry: { area: string; aliases: string[] }, lang: LiveLang): string {
  if (lang !== 'ar') return entry.area;
  return entry.aliases.find((a) => /[\u0600-\u06FF]/.test(a)) || entry.area;
}

/** The exact property payload the server onboarding quote receives. */
export function toServerProperty(s: LiveQuoteState) {
  return {
    propertyType: s.propertyType,
    assetGrade: s.scope,
    emirate: s.emirate,
    area: s.area,
    strategy: s.contractType === 'FM_ONLY' ? 'fm' : s.contractType === 'PM_ONLY' ? 'pm' : 'both',
    sqft: s.sqft,
    units: 1,
    bedrooms: s.propertyType === 'Apartment' ? (s.bedrooms ?? undefined) : 0,
    annualRent: s.contractType === 'FM_ONLY' ? 0 : s.annualRent,
    age: s.age ?? undefined,
  };
}

function engineInput(s: LiveQuoteState, contractType: LiveContract) {
  return {
    assetClassId: resolveAssetClassIdForPropertyType(s.propertyType, s.scope) || '',
    emirate: s.emirate, area: s.area, zone: 'B' as const, contractType,
    sqft: s.sqft, units: 1, beds: 0, bedrooms: s.propertyType === 'Apartment' ? (s.bedrooms ?? undefined) : 0, annualRent: contractType === 'FM_ONLY' ? 0 : s.annualRent, annualRevenue: 0,
    propertyAge: s.age ?? undefined, floors: 0, lifts: 0, addOns: [], slaTier: 'standard' as const, paymentPlan: 'annual' as const,
  };
}

// Same canonical half-up fils rounding as the server quote (functions/shared/aedMoney.ts).
const money = (n: number) => normalizeAedMoney(Number.isFinite(n) ? n : 0);

export interface LiveQuoteResult {
  maintenance: number | null;
  management: number | null;
  total: number;
  lines: string[];
  blockers: string[];
  /** Owner-facing warnings, e.g. zone pending admin confirmation. */
  warnings: string[];
  regionLabel: string;
  scaleLabel: string;
}

export function computeLiveQuote(s: LiveQuoteState, lang: LiveLang = 'en'): LiveQuoteResult {
  const ar = lang === 'ar';
  // Founder decision 2026-10-14 13:21: bedrooms is required for apartments on the card.
  if (s.propertyType === 'Apartment' && (s.bedrooms === null || s.bedrooms === undefined)) {
    return { maintenance: null, management: null, total: 0, lines: [], warnings: [], blockers: [ar ? 'اختر عدد غرف النوم لعرض السعر' : 'Select the number of bedrooms to see the price'], regionLabel: s.emirate, scaleLabel: `${Math.round(s.sqft).toLocaleString('en-US')} sqft` };
  }
  const total = calculateUaeQuote2026(engineInput(s, s.contractType) as any);
  const fm = s.contractType !== 'PM_ONLY' ? calculateUaeQuote2026(engineInput(s, 'FM_ONLY') as any) : null;
  const pm = s.contractType !== 'FM_ONLY' ? calculateUaeQuote2026(engineInput(s, 'PM_ONLY') as any) : null;
  const explain = [...(fm?.pricingExplanation || []), ...(pm?.pricingExplanation || [])];
  const lines: string[] = [];
  const zone = resolveAreaZone(s.area, s.emirate).entry;
  if (zone) {
    const m = UAE_PRICING_MATRIX_2026.zones[zone.zone]?.multiplier;
    lines.push(ar ? `${areaLabel(zone, 'ar')}: منطقة ${ZONE_LABEL[zone.zone].ar} ×${m.toFixed(2)}` : `${zone.area}: ${ZONE_LABEL[zone.zone].en} area ×${m.toFixed(2)}`);
  }
  const region = resolveEmirateMultiplier(s.emirate, s.area);
  if (region.emirate && s.contractType !== 'PM_ONLY') lines.push(ar ? `عامل المنطقة (${region.emirate}) ×${region.multiplier.toFixed(2)}` : `${region.emirate} regional factor ×${region.multiplier.toFixed(2)}`);
  const ageFactor = resolveAgeFactor(s.age);
  if (s.age !== null && ageFactor > 1 && s.contractType !== 'PM_ONLY') lines.push(ar ? `عمر العقار ${s.age} سنة ×${ageFactor.toFixed(2)}` : `Property age ${s.age} years ×${ageFactor.toFixed(2)}`);
  const bedLine = explain.find((l) => l.startsWith('Apartment bedroom factor'));
  if (bedLine) { const f = bedLine.match(/factor ([\d.]+)x/)?.[1]; lines.push(ar ? `عدد غرف النوم ${s.bedrooms} ×${f}` : `${s.bedrooms} bedrooms ×${f}`); }
  if (explain.some((l) => l.startsWith('Remote-area'))) lines.push(ar ? `منطقة نائية: +15% على الصيانة` : 'Remote area: +15% on maintenance');
  if (explain.some((l) => l.startsWith('Minimum technical annual contract'))) lines.push(ar ? 'تم تطبيق الحد الأدنى لعقد الصيانة' : 'Minimum maintenance contract applied');
  if (explain.some((l) => l.startsWith('Minimum annual Property Management fee'))) lines.push(ar ? 'تم تطبيق الحد الأدنى لرسوم الإدارة' : 'Minimum management fee applied');
  else if (pm && pm.annualTotal > 0) lines.push(ar ? 'رسوم الإدارة نسبة من الإيجار السنوي' : 'Management fee is a percentage of annual rent');
  const blockers = total.annualTotal > 0 ? [] : total.riskFlags.length ? total.riskFlags : total.pricingExplanation.slice(0, 1);
  const WARN: Array<[string, string, string]> = [
    [ZONE_PENDING_FLAG, 'Zone pending admin confirmation: area not listed, priced as Premium (Zone A) until confirmed', 'المنطقة غير مدرجة: تم التسعير كمنطقة مميزة (A) بانتظار تأكيد الإدارة'],
    [BEDROOMS_PENDING_FLAG, 'Bedrooms pending inspection confirmation: priced as 2 bedrooms', 'عدد الغرف بانتظار التأكيد عند المعاينة: تم التسعير كغرفتين'],
    [AGE_PENDING_FLAG, 'Property age pending inspection confirmation: highest age factor applied', 'عمر العقار بانتظار التأكيد عند المعاينة: تم تطبيق أعلى معامل للعمر'],
    [EMIRATE_PENDING_FLAG, 'Emirate pending admin confirmation: highest regional factor applied', 'الإمارة بانتظار تأكيد الإدارة: تم تطبيق أعلى معامل إقليمي'],
  ];
  const flags = [...total.riskFlags, ...(fm?.riskFlags || []), ...(pm?.riskFlags || [])];
  const warnings = WARN.filter(([prefix]) => flags.some((f) => f.startsWith(prefix))).map(([, en, arText]) => (ar ? arText : en));
  return {
    warnings,
    maintenance: fm ? money(fm.annualTotal) : null,
    management: pm ? money(pm.annualTotal) : null,
    total: money(total.annualTotal),
    lines,
    blockers,
    regionLabel: region.emirate || s.emirate,
    scaleLabel: `${Math.round(s.sqft).toLocaleString('en-US')} sqft`,
  };
}
