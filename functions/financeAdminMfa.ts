import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

// Same authority model as the payment-approval gate in securePaymentApproval.ts:
// finance-capable Admin role AND a verified second-factor (MFA) sign-in.
const FINANCE_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin"]);
const text = (value: unknown) => String(value || "").trim();

export async function requireMfaFinanceAdminActor(request: any): Promise<{ uid: string; email: string }> {
  const auth = request?.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const role = text(token.role || token.userRole || token.primaryRole).toLowerCase();
  const authorized =
    token.admin === true ||
    token.isAdmin === true ||
    token.superAdmin === true ||
    token.super_admin === true ||
    token.ceo === true ||
    FINANCE_ADMIN_ROLES.has(role);
  if (!authorized || token.suspended === true) {
    throw new HttpsError("permission-denied", "Finance Admin authority is required.");
  }
  if (token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified Admin MFA session is required for payment decisions.");
  }
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled || !record.emailVerified || !record.email) {
    throw new HttpsError("permission-denied", "The Admin account is not active and verified.");
  }
  return { uid: auth.uid, email: text(token.email || record.email).toLowerCase() };
}
