/**
 * Limited ticket reopen (gap audit 2026-11-01, item 2).
 * A tenant (own ticket) or an admin may reopen a finished job with a written reason. Every reopen
 * increments reopenCount, writes an immutable ticket_reopen_events row and an audit_logs row.
 * Caps: tenants may reopen a ticket at most MAX_TENANT_REOPENS times; admins at most
 * MAX_TOTAL_REOPENS times in total. Beyond the cap the job must go through a new ticket or a dispute.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const MAX_TENANT_REOPENS = 2;
export const MAX_TOTAL_REOPENS = 3;
export const MIN_REOPEN_REASON = 8;
const REOPENABLE = new Set(["COMPLETED", "COMPLETED_PENDING_APPROVAL", "DISPUTED"]); // canonical transitions to REOPENED only
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin"]);
const text = (v: unknown, max = 1000) => String(v ?? "").trim().slice(0, max);
const status = (v: unknown) => text(v, 60).toUpperCase().replace(/\s+/g, "_");

export function reopenDecision(input: { status: string; reopenCount: number; actorRole: "tenant" | "admin" }) {
  if (!REOPENABLE.has(status(input.status))) return { ok: false, code: "failed-precondition", reason: "NOT_REOPENABLE" } as const;
  const cap = input.actorRole === "admin" ? MAX_TOTAL_REOPENS : MAX_TENANT_REOPENS;
  if (input.reopenCount >= cap) return { ok: false, code: "resource-exhausted", reason: "REOPEN_CAP_REACHED", cap } as const;
  return { ok: true, cap, next: input.reopenCount + 1 } as const;
}

export const reopenMaintenanceTicket = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(request.auth?.token?.role || request.auth?.token?.userRole, 40).toLowerCase();
  const isAdmin = ADMIN_ROLES.has(role) || (role === "" && request.auth?.token?.admin === true);
  if (role !== "tenant" && !isAdmin) throw new HttpsError("permission-denied", "Only the tenant or an admin can reopen a job. / فقط المستأجر أو المسؤول يمكنه إعادة فتح الطلب.");
  if (request.auth?.token?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  const ticketId = text(request.data?.ticketId, 128);
  const reason = text(request.data?.reason);
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(ticketId)) throw new HttpsError("invalid-argument", "ticketId is required. / رقم الطلب مطلوب.");
  if (reason.length < MIN_REOPEN_REASON) throw new HttpsError("invalid-argument", `Explain what is still wrong (at least ${MIN_REOPEN_REASON} characters). / اشرح ما زال غير صحيح (${MIN_REOPEN_REASON} أحرف على الأقل).`);

  const db = admin.firestore();
  const ref = db.collection("maintenanceTickets").doc(ticketId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Job not found. / الطلب غير موجود.");
    const t = snap.data() || {};
    const tenantId = text(t.tenantId || t.tenantUid || t.userId || t.requesterId, 128);
    if (!isAdmin && tenantId !== uid) throw new HttpsError("permission-denied", "This job is not yours. / هذا الطلب ليس لك.");
    const reopenCount = Math.max(0, Math.floor(Number(t.reopenCount) || 0));
    const d = reopenDecision({ status: t.status, reopenCount, actorRole: isAdmin ? "admin" : "tenant" });
    if (!d.ok) {
      if (d.reason === "REOPEN_CAP_REACHED") throw new HttpsError("resource-exhausted", `This job was already reopened ${reopenCount} time(s), the limit. Please raise a new request or a dispute. / أعيد فتح هذا الطلب ${reopenCount} مرة وهو الحد الأقصى. يرجى تقديم طلب جديد أو نزاع.`);
      throw new HttpsError("failed-precondition", "Only a finished job can be reopened. / يمكن إعادة فتح الطلب المنجز فقط.");
    }
    const now = FieldValue.serverTimestamp();
    const actorRole = isAdmin ? "admin" : "tenant";
    tx.update(ref, {
      status: "REOPENED", reopenCount: d.next, lastReopenedAt: now, lastReopenedBy: uid, lastReopenedByRole: actorRole,
      lastReopenReason: reason, previousStatus: status(t.status), updatedAt: now,
    });
    const eventRef = db.collection("ticket_reopen_events").doc(`${ticketId}_${d.next}`);
    tx.create(eventRef, { ticketId, tenantId, actorId: uid, actorRole, reason, fromStatus: status(t.status), reopenNumber: d.next, cap: d.cap, createdAt: now });
    tx.create(db.collection("audit_logs").doc(), {
      action: "TICKET_REOPENED", actorId: uid, actorRole, targetType: "maintenanceTickets", targetId: ticketId,
      metadata: { reopenNumber: d.next, cap: d.cap, fromStatus: status(t.status), reasonLength: reason.length }, createdAt: now,
    });
    return { status: "REOPENED", reopenCount: d.next, remainingForTenant: Math.max(0, MAX_TENANT_REOPENS - d.next) };
  });
});
