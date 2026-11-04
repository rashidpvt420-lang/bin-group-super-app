import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

// Same authority model as the payment-approval gate in securePaymentApproval.ts:
// finance-capable Admin role AND a verified second-factor (MFA) sign-in.
const FINANCE_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin"]);
const text = (value: unknown) => String(value || "").trim();

function claimsGrantFinanceAdmin(claims: Record<string, any>): boolean {
  const role = text(claims.role || claims.userRole || claims.primaryRole).toLowerCase();
  return (
    claims.admin === true ||
    claims.isAdmin === true ||
    claims.superAdmin === true ||
    claims.super_admin === true ||
    claims.ceo === true ||
    FINANCE_ADMIN_ROLES.has(role)
  );
}

export async function requireMfaFinanceAdminActor(request: any): Promise<{ uid: string; email: string }> {
  const auth = request?.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  if (!claimsGrantFinanceAdmin(token) || token.suspended === true) {
    throw new HttpsError("permission-denied", "Finance Admin authority is required.");
  }
  if (token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified Admin MFA session is required for payment decisions.");
  }
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled || !record.emailVerified || !record.email) {
    throw new HttpsError("permission-denied", "The Admin account is not active and verified.");
  }
  // Stale-token guard: an ID token minted before a demotion or suspension stays valid for up to
  // an hour, so authority is re-checked against the LIVE custom claims on every money decision.
  const live = (record.customClaims || {}) as Record<string, unknown>;
  if (!claimsGrantFinanceAdmin(live) || live.suspended === true) {
    throw new HttpsError("permission-denied", "Finance Admin authority is no longer active on this account.");
  }
  return { uid: auth.uid, email: text(token.email || record.email).toLowerCase() };
}
