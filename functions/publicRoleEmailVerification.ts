import { HttpsError } from "firebase-functions/v2/https";

export const EMAIL_NOT_VERIFIED_REASON = "email_not_verified";

/**
 * Email/password accounts must prove they own the address before they can claim a portal role.
 * Google (google.com), phone and other federated providers verify the identity themselves, so
 * only password sign-ins are gated. The live Auth record is authoritative (the ID token may
 * pre-date the user clicking the verification link).
 */
export function requiresVerifiedEmail(
  token: { firebase?: { sign_in_provider?: unknown } } | undefined,
  userRecord: { emailVerified?: boolean; providerData?: Array<{ providerId?: string }> },
): boolean {
  const provider = String(token?.firebase?.sign_in_provider || "").trim().toLowerCase();
  if (provider) return provider === "password";
  const providers = (userRecord.providerData || []).map((entry) => String(entry?.providerId || ""));
  return providers.length > 0 && providers.every((id) => id === "password");
}

export function assertEmailVerifiedForPasswordSignIn(
  token: { firebase?: { sign_in_provider?: unknown } } | undefined,
  userRecord: { emailVerified?: boolean; providerData?: Array<{ providerId?: string }> },
): void {
  if (requiresVerifiedEmail(token, userRecord) && userRecord.emailVerified !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Verify your email address before selecting a portal role.",
      { reason: EMAIL_NOT_VERIFIED_REASON },
    );
  }
}
