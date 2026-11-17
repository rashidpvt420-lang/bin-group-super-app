import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

// Centralized explicit Finance approval authorization policy.
// CEO, super_admin, and generic admin alone NEVER grant financial approval authority.
// Financial approvals must be restricted to explicitly authorized Finance approver identities.
export const FINANCE_ADMIN_ROLES = new Set(["finance_admin", "finance_manager", "finance_controller"]);
export const FINANCE_AUTHORIZATION_TTL_MS = 24 * 60 * 60 * 1000; // 86,400,000 ms (24 hours)
export const FINANCE_AUTHORIZED_AT_CLAIM = "financeAuthorizedAt";
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

/**
 * Robust parser for Firestore timestamps, dates, millisecond integers, and ISO strings.
 * Returns null if timestamp is missing, malformed, non-finite, or invalid.
 */
export function parseAuthorizationTimestampMs(timestamp: unknown): number | null {
  if (timestamp === null || timestamp === undefined) return null;
  if (typeof (timestamp as any)?.toMillis === "function") {
    try {
      const ms = (timestamp as any).toMillis();
      return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
    } catch {
      return null;
    }
  }
  if (typeof timestamp === "object") {
    const s = (timestamp as any)._seconds ?? (timestamp as any).seconds;
    const ns = (timestamp as any)._nanoseconds ?? (timestamp as any).nanoseconds ?? 0;
    if (typeof s === "number" && Number.isFinite(s) && s > 0) {
      const ms = s * 1000 + Math.floor(ns / 1e6);
      return Number.isFinite(ms) ? ms : null;
    }
  }
  if (timestamp instanceof Date) {
    const ms = timestamp.getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  }
  if (typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0) {
    return timestamp;
  }
  if (typeof timestamp === "string" && timestamp.trim()) {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/**
 * Checks whether a Finance role authorization has expired under the strict 24-hour rule.
 * Fails closed: if timestamp is missing, malformed, or unparseable, returns expired: true.
 * If ageMs >= FINANCE_AUTHORIZATION_TTL_MS, returns expired: true.
 */
export function isAuthorizationExpired(
  createdAt: unknown,
  nowMs: number = Date.now(),
): { expired: boolean; reason?: string; ageMs?: number; createdMs?: number } {
  const createdMs = parseAuthorizationTimestampMs(createdAt);
  if (createdMs === null) {
    return { expired: true, reason: "MISSING_OR_MALFORMED_TIMESTAMP" };
  }
  // Max 60-second forward clock-drift guard
  if (createdMs > nowMs + 60000) {
    return { expired: true, reason: "FUTURE_TIMESTAMP_DRIFT", createdMs };
  }
  const ageMs = nowMs - createdMs;
  if (ageMs >= FINANCE_AUTHORIZATION_TTL_MS) {
    return { expired: true, reason: "EXPIRED_AFTER_24_HOURS", ageMs, createdMs };
  }
  return { expired: false, ageMs, createdMs };
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
  // 24-hour finance access TTL: money approval fails closed when the grant timestamp is
  // missing, malformed, or at least 24 hours old. A demoted account is already refused above.
  const expiry = isAuthorizationExpired(live[FINANCE_AUTHORIZED_AT_CLAIM]);
  if (expiry.expired) {
    throw new HttpsError(
      "permission-denied",
      "Finance Admin authorization has expired. A new independent Finance authorization is required.",
    );
  }
  return { uid: auth.uid, email: text(token.email || record.email).toLowerCase() };
}
