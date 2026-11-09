import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

// Same authority model as the payment-approval gate in securePaymentApproval.ts:
// finance-capable Admin role AND a verified second-factor (MFA) sign-in.
const FINANCE_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin"]);
const text = (value: unknown) => String(value || "").trim();

/**
 * Payment approve / reject and cheque-clearance authority (audit D-01, Nov 2026): Admin-tier finance
 * roles plus the dedicated finance tiers. operations_admin, manager, HR and every other staff role are
 * refused on the server. MFA and dual control (recorder != approver) still apply on top of this.
 */
export const PAYMENT_DECISION_ROLES: ReadonlySet<string> = new Set([...FINANCE_ADMIN_ROLES, "finance_manager", "finance_controller"]);

function roleOf(claims: Record<string, any>): string {
  return text(claims.role || claims.userRole || claims.primaryRole).toLowerCase();
}

// A generic admin/isAdmin boolean only counts when the account carries no explicit role. A staff
// account with an explicit non-finance role (e.g. operations_admin) never gains finance authority
// from a stray boolean claim.
function claimsGrantRoleSet(claims: Record<string, any>, roles: ReadonlySet<string>): boolean {
  const role = roleOf(claims);
  if (roles.has(role)) return true;
  if (claims.superAdmin === true || claims.super_admin === true || claims.ceo === true) return true;
  return role === "" && (claims.admin === true || claims.isAdmin === true);
}


export async function requireMfaFinanceAdminActor(request: any): Promise<{ uid: string; email: string }> {
  return requireMfaRoleActor(request, FINANCE_ADMIN_ROLES);
}

/** Payment approve / reject gate: finance roles only (see PAYMENT_DECISION_ROLES), MFA, live claims. */
export async function requireMfaPaymentDecisionActor(request: any): Promise<{ uid: string; email: string }> {
  return requireMfaRoleActor(request, PAYMENT_DECISION_ROLES);
}

async function requireMfaRoleActor(request: any, roles: ReadonlySet<string>): Promise<{ uid: string; email: string }> {
  const auth = request?.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  if (!claimsGrantRoleSet(token, roles) || token.suspended === true) {
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
  if (!claimsGrantRoleSet(live, roles) || live.suspended === true) {
    throw new HttpsError("permission-denied", "Finance Admin authority is no longer active on this account.");
  }
  return { uid: auth.uid, email: text(token.email || record.email).toLowerCase() };
}
