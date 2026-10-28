/**
 * One accessible status-colour map for chips and badges.
 * Every `text` colour is >= 4.5:1 on white AND on its own `fill`
 * (the global chip CSS forces chip backgrounds to white, so text must pass on white).
 * Meaning is kept: green = done, amber = pending/review, red = missing/failed, blue = in progress, gold = brand.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

export const STATUS_TONES: Record<StatusTone, { text: string; fill: string; border: string }> = {
  success: { text: '#166534', fill: '#DCFCE7', border: '#86EFAC' },
  warning: { text: '#92400E', fill: '#FEF3C7', border: '#FCD34D' },
  danger: { text: '#B91C1C', fill: '#FEE2E2', border: '#FCA5A5' },
  info: { text: '#1D4ED8', fill: '#DBEAFE', border: '#93C5FD' },
  neutral: { text: '#374151', fill: '#F3F4F6', border: '#D1D5DB' },
  brand: { text: '#7A5C12', fill: '#F7E8B9', border: '#E5C86B' },
};

const TONE_BY_STATUS: Array<[RegExp, StatusTone]> = [
  [/^(done|verified|approved|active|closed|completed?|resolved|paid|signed|success|live|ai_render_complete)$/i, 'success'],
  [/^(in[ _-]?review|under[ _-]?review|pending.*|review|awaiting.*|waiting.*|draft|provisional|reference_image_required|scheduled|partial)$/i, 'warning'],
  [/^(missing|failed|rejected|overdue|blocked|cancelled|canceled|emergency|sos|pending[ _-]?upload|error)$/i, 'danger'],
  [/^(track|in[ _-]?progress|assigned|en[ _-]?route|dispatched|open|on[ _-]?duty)$/i, 'info'],
];

export function statusTone(status: string | null | undefined): StatusTone {
  const s = String(status || '').trim();
  // pending_upload must win over the generic pending rule
  if (/^pending[ _-]?upload$/i.test(s)) return 'danger';
  for (const [re, tone] of TONE_BY_STATUS) if (re.test(s)) return tone;
  return 'neutral';
}

/** Vivid UI hexes used across the app -> their AA-safe text equivalent. */
const VIVID_TO_TONE: Record<string, StatusTone> = {
  '#10b981': 'success', '#22c55e': 'success', '#4ade80': 'success', '#34d399': 'success', '#16a34a': 'success',
  '#f59e0b': 'warning', '#fbbf24': 'warning', '#eab308': 'warning', '#fde68a': 'warning',
  '#ef4444': 'danger', '#f87171': 'danger', '#dc2626': 'danger',
  '#3b82f6': 'info', '#60a5fa': 'info', '#2563eb': 'info',
  '#c9a646': 'brand', '#b8932f': 'brand', '#d4af37': 'brand', '#c6a75e': 'brand', '#e5c86b': 'brand',
};

/** Accessible text colour for a chip whose design colour is `hex`. Unknown colours pass through. */
export function chipTextColor(hex: string): string {
  const tone = VIVID_TO_TONE[String(hex || '').toLowerCase()];
  return tone ? STATUS_TONES[tone].text : hex;
}

const CODE_LABELS: Record<string, string> = {
  REFERENCE_IMAGE_REQUIRED: 'Reference image required',
  AI_RENDER_COMPLETE: 'Design ready',
  PENDING_TRIGGER: 'Waiting to send',
  SUCCESS: 'Sent',
  PARTIAL: 'Partly sent',
  FAILED: 'Not sent',
  CALL_FIRST: 'Call before visiting',
  ENTER_FREELY: 'Can enter without calling',
  UNKNOWN: 'Not stated',
  PENDING_UPLOAD: 'Upload needed',
  UNDER_REVIEW: 'Under review',
  IN_REVIEW: 'In review',
};

/**
 * Arabic labels for the same stored codes (plain Modern Standard Arabic). Codes with no entry here
 * are NOT guessed: Arabic callers get the English label instead, so nothing is invented.
 */
export const AR_CODE_LABELS: Record<string, string> = {
  REFERENCE_IMAGE_REQUIRED: 'صورة مرجعية مطلوبة',
  AI_RENDER_COMPLETE: 'التصميم جاهز',
  PENDING_TRIGGER: 'بانتظار الإرسال',
  SUCCESS: 'تم الإرسال',
  PARTIAL: 'أُرسل جزئيًا',
  FAILED: 'لم يُرسل',
  CALL_FIRST: 'اتصل قبل الزيارة',
  ENTER_FREELY: 'يمكن الدخول دون اتصال',
  UNKNOWN: 'غير محدد',
  PENDING_UPLOAD: 'مطلوب رفع',
  UNDER_REVIEW: 'قيد المراجعة',
  IN_REVIEW: 'قيد المراجعة',
  // Ticket / job lifecycle
  OPEN: 'مفتوح',
  NEW: 'جديد',
  PENDING: 'قيد الانتظار',
  PENDING_SCHEDULING: 'بانتظار الجدولة',
  SCHEDULED: 'مجدول',
  ASSIGNED: 'تم التعيين',
  REOPENED: 'أُعيد فتحه',
  ACCEPTED: 'تم القبول',
  DISPATCHED: 'تم الإرسال للفني',
  EN_ROUTE: 'في الطريق',
  ON_THE_WAY: 'في الطريق',
  ARRIVED: 'وصل',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتمل',
  RESOLVED: 'تم الحل',
  CLOSED: 'مغلق',
  CANCELLED: 'ملغى',
  CANCELED: 'ملغى',
  REJECTED: 'مرفوض',
  APPROVED: 'تمت الموافقة',
  VERIFIED: 'تم التحقق',
  OVERDUE: 'متأخر',
  EMERGENCY: 'طوارئ',
};

function statusCodeKey(code: string | null | undefined): string {
  return String(code ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/** Arabic label for a stored status code, or null when there is no reviewed translation. */
export function arabicStatusLabel(code: string | null | undefined): string | null {
  const key = statusCodeKey(code);
  return key && AR_CODE_LABELS[key] ? AR_CODE_LABELS[key] : null;
}

/** Turns stored codes (SNAKE_CASE / snake_case) into a readable English label. */
export function formatStatusLabel(code: string | null | undefined, lang: 'en' | 'ar' = 'en'): string {
  const raw = String(code ?? '').trim();
  if (!raw) return '';
  if (lang === 'ar') {
    const arabic = arabicStatusLabel(raw);
    if (arabic) return arabic;
  }
  const key = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (CODE_LABELS[key]) return CODE_LABELS[key];
  if (!/[_]/.test(raw) && raw !== raw.toUpperCase()) return raw;
  const words = raw.replace(/[_-]+/g, ' ').toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
