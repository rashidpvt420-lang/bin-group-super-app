/**
 * Owner Trust Centre — warranty protection (gap audit 2026-11-01, item 10).
 * - On completion, each job gets a warranty record: duration, coverage and expiry are taken only from what
 *   was recorded on the ticket (warrantyDays / warrantyCoverage). Nothing recorded → NO_WARRANTY_RECORDED.
 * - When a new ticket reports the same category at the same property/unit while an earlier job's warranty
 *   is active, the new ticket is flagged `warrantyReview.status = PENDING_REVIEW` with
 *   `ownerChargeHold: true` and a review record is opened, so the owner is not charged again before review.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const DONE = new Set(["completed", "closed", "done"]);
const MAX_WARRANTY_DAYS = 3650;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
export const faultKey = (t: Record<string, unknown>) => {
  const p = text(t.propertyId, 160); const u = text(t.unitId || t.unitNumber, 80); const c = text(t.category || t.serviceType, 80).toLowerCase();
  return p && c ? `${p}|${u}|${c}` : "";
};

export function warrantyFromTicket(t: Record<string, unknown>, completedMs: number) {
  const days = Number(t.warrantyDays);
  if (!Number.isFinite(days) || days <= 0 || days > MAX_WARRANTY_DAYS) return { status: "NO_WARRANTY_RECORDED" as const, durationDays: null, coverage: null, expiresAtMs: null };
  return { status: "ACTIVE" as const, durationDays: Math.round(days), coverage: text(t.warrantyCoverage, 500) || null, expiresAtMs: completedMs + Math.round(days) * 864e5 };
}

export async function recordWarrantyOnCompletion(ticketId: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  if (DONE.has(text(before.status).toLowerCase()) || !DONE.has(text(after.status).toLowerCase())) return;
  const db = admin.firestore();
  const w = warrantyFromTicket(after, Date.now());
  await db.doc(`job_warranties/${ticketId}`).set({
    ticketId, ownerId: text(after.ownerId, 180), faultKey: faultKey(after), status: w.status, durationDays: w.durationDays, coverage: w.coverage,
    expiresAt: w.expiresAtMs ? Timestamp.fromMillis(w.expiresAtMs) : null, technicianId: text(after.technicianId || after.assignedTechnicianId, 180) || null,
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function flagRepeatFault(ticketId: string, t: Record<string, unknown>) {
  const key = faultKey(t);
  const ownerId = text(t.ownerId, 180);
  if (!key || !ownerId) return null;
  const db = admin.firestore();
  const s = await db.collection("job_warranties").where("faultKey", "==", key).limit(20).get();
  const now = Date.now();
  const hit = s.docs.map((d) => d.data()).find((w) => w.ownerId === ownerId && w.status === "ACTIVE" && w.ticketId !== ticketId && w.expiresAt?.toMillis?.() > now);
  if (!hit) return null;
  const at = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.doc(`maintenanceTickets/${ticketId}`), { warrantyReview: { status: "PENDING_REVIEW", priorTicketId: hit.ticketId }, ownerChargeHold: true }, { merge: true });
  batch.set(db.doc(`warranty_reviews/${ticketId}`), { ticketId, priorTicketId: hit.ticketId, ownerId, status: "PENDING_REVIEW", createdAt: at });
  batch.create(db.collection("notifications").doc(), {
    userId: ownerId, type: "WARRANTY_REPEAT_FAULT", ticketId, read: false,
    titleEn: "Possible warranty repeat", titleAr: "عطل متكرر محتمل ضمن الضمان",
    bodyEn: "This fault matches a recent job still under warranty. You will not be charged until it is reviewed.",
    bodyAr: "هذا العطل يطابق عملاً حديثاً لا يزال ضمن الضمان. لن يتم تحصيل أي مبلغ منك قبل المراجعة.",
    createdAt: at,
  });
  batch.create(db.collection("audit_logs").doc(), { action: "WARRANTY_REPEAT_FAULT_FLAGGED", actorId: "system", actorRole: "system", targetOwnerId: ownerId, targetType: "maintenanceTickets", targetId: ticketId, createdAt: at });
  await batch.commit();
  return hit.ticketId as string;
}

export const onTicketCompletedRecordWarranty = onDocumentUpdated({ document: "maintenanceTickets/{ticketId}", region: "europe-west3" }, async (e) => {
  await recordWarrantyOnCompletion(e.params.ticketId, e.data?.before.data() || {}, e.data?.after.data() || {});
});
export const onTicketCreatedCheckWarranty = onDocumentCreated({ document: "maintenanceTickets/{ticketId}", region: "europe-west3" }, async (e) => {
  await flagRepeatFault(e.params.ticketId, e.data?.data() || {});
});

export const getOwnerWarranties = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Owner access only. / للمالك فقط.");
  const db = admin.firestore();
  if ((await db.doc(`users/${auth.uid}`).get()).data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  const [w, r] = await Promise.all([
    db.collection("job_warranties").where("ownerId", "==", auth.uid).limit(200).get(),
    db.collection("warranty_reviews").where("ownerId", "==", auth.uid).limit(100).get(),
  ]);
  const now = Date.now();
  return {
    warranties: w.docs.map((d) => { const x = d.data(); const exp = x.expiresAt?.toMillis?.() ?? null; return { ticketId: x.ticketId, status: x.status === "ACTIVE" && exp !== null && exp <= now ? "EXPIRED" : x.status, durationDays: x.durationDays, coverage: x.coverage, expiresAtMs: exp }; }),
    reviews: r.docs.map((d) => ({ ticketId: d.data().ticketId, priorTicketId: d.data().priorTicketId, status: d.data().status })),
  };
});
