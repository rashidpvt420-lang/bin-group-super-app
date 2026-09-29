import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

/**
 * N-05: server-side MFA for privileged (Admin / HR / Finance / Operations) callables.
 * The Admin panel only enforces MFA in the UI; a non-enrolled, bridged or custom-token
 * session must not reach privileged server operations. This runs in addition to each
 * callable's existing role check and requires:
 *   - a verified email on the ID token,
 *   - an ID token minted with a second factor (firebase.sign_in_second_factor),
 *   - a live, non-disabled, non-suspended Auth user (fresh getUser, not token-only).
 */
export async function requirePrivilegedMfaSession(auth: any): Promise<void> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  const token = auth.token || {};
  if (token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError(
      "permission-denied",
      "A verified multi-factor (MFA) session is required for this administrative action.",
    );
  }
  let user: admin.auth.UserRecord;
  try {
    user = await admin.auth().getUser(String(auth.uid));
  } catch {
    throw new HttpsError("permission-denied", "The administrative account could not be verified.");
  }
  if (user.disabled || user.customClaims?.suspended === true || !user.emailVerified) {
    throw new HttpsError("permission-denied", "The administrative account is inactive or suspended.");
  }
}
