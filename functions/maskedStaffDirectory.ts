// P1-10 (audit 9 Nov 2026): masked staff directory.
// Staff roles that may not list the raw `users` collection (Finance, Account, Support, Manager,
// Admin Assistant) get names, roles and a masked phone here instead. Email, full phone, Emirates ID,
// salary and every other profile field stay on the server. Requires an MFA session.
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { requirePrivilegedMfaSession } from "./adminMfaSession";

if (!admin.apps.length) admin.initializeApp();

export const MASKED_DIRECTORY_CALLER_ROLES: ReadonlySet<string> = new Set([
  "admin", "super_admin", "ceo",
  "manager", "operations_admin", "operations_manager", "dispatcher",
  "finance_admin", "finance_staff", "finance_manager", "finance_controller",
  "hr_admin", "hr_manager", "hr_staff",
  "support_admin", "account_manager", "admin_assistant",
]);

// Only staff profiles are listed; owners, tenants and brokers are never part of this directory.
export const MASKED_DIRECTORY_STAFF_ROLES: readonly string[] = [
  "technician", "manager", "operations_admin", "operations_manager", "dispatcher",
  "finance_admin", "finance_staff", "finance_manager", "finance_controller",
  "hr_admin", "hr_manager", "hr_staff", "support_admin", "account_manager", "admin_assistant",
];

const MAX_PAGE = 200;
const text = (value: unknown, max = 160) => String(value ?? "").trim().slice(0, max);

export function maskPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `•••• ${digits.slice(-3)}`;
}

export function maskedDirectoryEntry(uid: string, data: Record<string, unknown>) {
  return {
    uid,
    displayName: text(data.displayName || data.fullName || data.name) || "Staff member",
    role: text(data.role, 40).toLowerCase(),
    department: text(data.department, 80) || null,
    status: text(data.status, 40) || null,
    maskedPhone: maskPhone(data.phoneNumber || data.phone),
  };
}

function callerRole(token: Record<string, unknown>): string {
  if (token.admin === true || token.isAdmin === true || token.super_admin === true || token.superAdmin === true || token.ceo === true) {
    return "admin";
  }
  return text(token.role || token.userRole || token.primaryRole, 40).toLowerCase();
}

export const getMaskedStaffDirectory = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  const token = (request.auth.token || {}) as Record<string, unknown>;
  if (token.suspended === true || !MASKED_DIRECTORY_CALLER_ROLES.has(callerRole(token))) {
    throw new HttpsError("permission-denied", "The staff directory is available to BIN GROUP staff roles only.");
  }
  await requirePrivilegedMfaSession(request.auth);

  const data = (request.data || {}) as Record<string, unknown>;
  const pageSize = Math.min(MAX_PAGE, Math.max(1, Math.floor(Number(data.limit) || 100)));
  const after = text(data.startAfterUid, 128);
  let query: admin.firestore.Query = admin.firestore().collection("users")
    .where("role", "in", [...MASKED_DIRECTORY_STAFF_ROLES])
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(pageSize + 1);
  if (after) query = query.startAfter(after);
  const snap = await query.get();
  const docs = snap.docs.slice(0, pageSize);
  return {
    entries: docs.map((doc) => maskedDirectoryEntry(doc.id, doc.data())),
    nextStartAfterUid: snap.size > pageSize ? docs[docs.length - 1].id : null,
  };
});
