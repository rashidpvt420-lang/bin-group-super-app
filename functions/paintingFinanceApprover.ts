import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

/**
 * Painting payment release authority (Rashid, Oct 2026). Only a person holding the finance_manager or
 * finance_controller role, signed in with a second factor, may approve or reject a painting stage
 * payment. Admin / super_admin / CEO claims do NOT grant this authority, and finance_controller is
 * recognised here only (it grants nothing else in the codebase). The caller must also differ from the
 * invoice issuer; that check is done against the invoice inside the decision transaction.
 */
export const PAINTING_FINANCE_APPROVER_ROLES: ReadonlySet<string> = new Set(["finance_manager", "finance_controller"]);
const text = (value: unknown) => String(value || "").trim();

export async function requirePaintingFinanceApprover(request: any): Promise<{ uid: string; email: string; role: string }> {
  const auth = request?.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Finance login required.");
  const token = auth.token || {};
  const role = text(token.role || token.financeRole).toLowerCase();
  if (!PAINTING_FINANCE_APPROVER_ROLES.has(role) || token.suspended === true) {
    throw new HttpsError("permission-denied", "Only a Finance Manager or Finance Controller can decide painting payments.");
  }
  if (token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified MFA session is required for payment decisions.");
  }
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled || !record.emailVerified || !record.email) {
    throw new HttpsError("permission-denied", "The Finance account is not active and verified.");
  }
  return { uid: auth.uid, email: text(token.email || record.email).toLowerCase(), role };
}
