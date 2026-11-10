/**
 * Human labels for Privacy Centre access-log actions, share scopes,
 * correction fields and roles. Stored audit values stay as machine keys;
 * the UI must never show those raw keys to the owner.
 */

export type PrivacyLang = 'en' | 'ar';

const ACTIONS: Record<string, [string, string]> = {
  OWNER_DATA_EXPORT: ['You downloaded your data', 'قمت بتنزيل بياناتك'],
  OWNER_CORRECTION_REQUEST: ['You asked for a correction', 'طلبت تصحيحاً'],
  OWNER_DATA_SHARE_CREATED: ['You created a data share', 'أنشأت مشاركة بيانات'],
  OWNER_DATA_SHARE_REVOKED: ['You revoked a data share', 'ألغيت مشاركة بيانات'],
  OWNER_DATA_SHARE: ['A data share was updated', 'تم تحديث مشاركة بيانات'],
  LOGIN: ['Signed in', 'تم تسجيل الدخول'],
  LOGOUT: ['Signed out', 'تم تسجيل الخروج'],
};

const SCOPES: Record<string, [string, string]> = {
  PROPERTY_PASSPORT: ['Property Passport', 'جواز العقار'],
  STATEMENTS: ['Statements', 'الكشوفات'],
  COMPLIANCE_CALENDAR: ['Compliance calendar', 'تقويم الالتزامات'],
};

const FIELDS: Record<string, [string, string]> = {
  PROFILE: ['Profile', 'الملف الشخصي'],
  PROPERTY: ['Property', 'العقار'],
  LEASE: ['Lease', 'عقد الإيجار'],
  PAYMENT_RECORD: ['Payment record', 'سجل الدفع'],
  OTHER: ['Other', 'أخرى'],
};

const ROLES: Record<string, [string, string]> = {
  OWNER: ['Owner', 'المالك'],
  ADMIN: ['Admin', 'مسؤول'],
  SUPER_ADMIN: ['Super Admin', 'المسؤول الأعلى'],
  CEO: ['CEO', 'الرئيس التنفيذي'],
  FINANCE_ADMIN: ['Finance Admin', 'مسؤول المالية'],
  TENANT: ['Tenant', 'المستأجر'],
  TECHNICIAN: ['Technician', 'الفني'],
  BROKER: ['Broker', 'الوسيط'],
};

const STATUSES: Record<string, [string, string]> = {
  ACTIVE: ['Active', 'نشطة'],
  EXPIRED: ['Expired', 'منتهية'],
  REVOKED: ['Revoked', 'ملغاة'],
  OPEN: ['Open', 'مفتوح'],
  RESOLVED: ['Resolved', 'تم الحل'],
  REJECTED: ['Rejected', 'مرفوض'],
};

function humanizeRaw(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function lookup(table: Record<string, [string, string]>, raw: unknown, lang: PrivacyLang, unknownEn: string, unknownAr: string): string {
  const key = String(raw ?? '').trim();
  if (!key) return lang === 'ar' ? '—' : '—';
  const hit = table[key] || table[key.toUpperCase()] || table[key.replace(/[\s-]+/g, '_').toUpperCase()];
  if (hit) return lang === 'ar' ? hit[1] : hit[0];
  const readable = humanizeRaw(key);
  return lang === 'ar' ? `${unknownAr}: ${readable}` : `${unknownEn}: ${readable}`;
}

export function privacyActionLabel(action: unknown, lang: PrivacyLang): string {
  return lookup(ACTIONS, action, lang, 'Recorded event', 'حدث مسجّل');
}

export function privacyScopeLabel(scope: unknown, lang: PrivacyLang): string {
  return lookup(SCOPES, scope, lang, 'Share scope', 'نطاق المشاركة');
}

export function privacyFieldLabel(field: unknown, lang: PrivacyLang): string {
  return lookup(FIELDS, field, lang, 'Field', 'حقل');
}

export function privacyRoleLabel(role: unknown, lang: PrivacyLang): string {
  return lookup(ROLES, role, lang, 'Role', 'الدور');
}

export function privacyStatusLabel(status: unknown, lang: PrivacyLang): string {
  return lookup(STATUSES, status, lang, 'Status', 'الحالة');
}
