// Email/password accounts must verify their address before they can pick a portal role
// (the assignPublicPortalRole callable enforces the same rule on the server). Google, phone
// and other federated sign-ins are verified by their provider and are not gated.

export interface VerifiableUser {
  emailVerified?: boolean | null;
  providerData?: ReadonlyArray<{ providerId?: string | null } | null> | null;
}

export function needsEmailVerification(user: VerifiableUser | null | undefined): boolean {
  if (!user || user.emailVerified === true) return false;
  const providers = (user.providerData || []).map((entry) => String(entry?.providerId || ''));
  return providers.length > 0 && providers.every((id) => id === 'password');
}

export const EMAIL_NOT_VERIFIED_REASON = 'email_not_verified';

/** True when a callable error says the account's email is not verified yet. */
export function isEmailNotVerifiedError(error: unknown): boolean {
  const details = (error as { details?: { reason?: unknown } } | null)?.details;
  return String(details?.reason || '') === EMAIL_NOT_VERIFIED_REASON;
}

export const VERIFICATION_RESEND_COOLDOWN_MS = 60_000;

export function verificationResendRemaining(lastSentAtMs: number | null | undefined, nowMs: number): number {
  const last = Number(lastSentAtMs || 0);
  if (!Number.isFinite(last) || last <= 0 || last > nowMs) return 0;
  return Math.max(0, VERIFICATION_RESEND_COOLDOWN_MS - (nowMs - last));
}
