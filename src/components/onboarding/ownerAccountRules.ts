// Pure rules for the Owner account step (page 1). Kept free of React and
// Firebase imports so they can be unit tested with node --experimental-strip-types.

export const OWNER_PASSWORD_MIN_LENGTH = 8;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60_000;
export const VERIFICATION_SENT_AT_KEY = 'bin-owner-verification-sent-at';

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; meetsMinimum: boolean };

/** A simple strength meter. Only the minimum length blocks submission; the score is advisory. */
export function passwordStrength(password: string): PasswordStrength {
  const value = String(password || '');
  const meetsMinimum = value.length >= OWNER_PASSWORD_MIN_LENGTH;
  if (!value) return { score: 0, meetsMinimum: false };
  let score = 0;
  if (meetsMinimum) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;
  if (!meetsMinimum) score = Math.min(score, 1);
  return { score: Math.min(4, score) as PasswordStrength['score'], meetsMinimum };
}

/** Milliseconds until another verification email may be requested (0 = allowed now). */
export function resendCooldownRemaining(lastSentAtMs: number | null | undefined, nowMs: number, cooldownMs = VERIFICATION_RESEND_COOLDOWN_MS): number {
  const last = Number(lastSentAtMs || 0);
  if (!Number.isFinite(last) || last <= 0 || last > nowMs) return 0;
  return Math.max(0, cooldownMs - (nowMs - last));
}

export const NON_OWNER_ROLES = new Set(['tenant', 'technician', 'staff', 'broker', 'admin', 'super_admin', 'auditor']);

/**
 * An account that already carries another portal role must not be silently
 * reused for Owner onboarding. A blank role (brand-new account) or 'owner' is fine.
 */
export function existingRoleConflict(role: unknown): string | null {
  const normalized = String(role ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'owner') return null;
  return NON_OWNER_ROLES.has(normalized) ? normalized : null;
}

export function roleConflictMessage(role: string, lang: 'en' | 'ar' | string): string {
  const en: Record<string, string> = {
    tenant: 'tenant', technician: 'technician', staff: 'staff', broker: 'broker',
    admin: 'admin', super_admin: 'admin', auditor: 'auditor',
  };
  const ar: Record<string, string> = {
    tenant: 'مستأجر', technician: 'فني', staff: 'موظف', broker: 'وسيط',
    admin: 'مسؤول', super_admin: 'مسؤول', auditor: 'مدقق',
  };
  return lang === 'ar'
    ? `هذا البريد مسجل كحساب ${ar[role] || role}. استخدم بريداً مختلفاً لحساب المالك أو تواصل مع دعم BIN GROUP.`
    : `This email is registered as a ${en[role] || role} account. Use a different email for the Owner account, or contact BIN GROUP support.`;
}

/** Page-1 section to open on load: resume at the account section when an account already exists. */
export function initialOwnerSection(page: number, requested: number | null, hasAccountContext: boolean): number {
  if (requested !== null && requested !== undefined) return requested;
  return page === 1 && hasAccountContext ? 1 : 0;
}
