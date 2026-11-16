import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

// Centralized explicit Finance approval authorization policy.
// CEO, super_admin, and generic admin alone NEVER grant financial approval authority.
// Financial approvals must be restricted to explicitly authorized Finance approver identities.
export const FINANCE_ADMIN_ROLES = new Set(["finance_admin", "finance_manager", "finance_controller"]);
const text = (value: unknown) => String(value || "").trim();

export function claimsGrantFinanceAdmin(claims: Record<string, any>): boolean {
  if (!claims || claims.suspended === true) return false;
  const role = text(claims.role || claims.userRole || claims.primaryRole).toLowerCase();
  if (FINANCE_ADMIN_ROLES.has(role)) return true;
  // If an account holds a separately assigned explicit Finance approver role in custom claims,
  // that explicit Finance role authorizes the operation. CEO or Super Admin status alone is never sufficient.
  if (claims.finance_admin === true || claims.finance_manager === true || claims.finance_controller === true) {
    return true;
  }
  return false;
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
