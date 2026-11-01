/**
 * Owner Trust Centre — technician offline mode sync (gap audit 2026-11-01, item 11).
 * Field events captured offline (arrival note, photos, materials, notes, completion evidence) are synced in
 * batches with:
 *  - duplicate protection: one record per technician + clientEventId (transactional create), so a retry
 *    after a dropped connection returns DUPLICATE instead of writing twice;
 *  - conflict protection: events for tickets no longer assigned to this technician, tickets already
 *    closed/cancelled, or implausible capture times are returned as CONFLICT_* and not applied.
 * Accepted events are stored as offline evidence for review. They never change ticket status: arrival
 * and completion still go through the existing protected lifecycle (GPS, installation binding, evidence).
 * Needs real Android/iOS device testing (Capacitor) before relying on it in the field.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const EVENT_TYPES = ["ARRIVAL_NOTE", "PHOTOS", "MATERIALS", "NOTE", "COMPLETION_EVIDENCE"] as const;
export const MAX_BATCH = 25;
const MAX_AGE_MS = 14 * 864e5;
const FUTURE_SKEW_MS = 5 * 60_000;
const CLOSED = new Set(["closed", "cancelled", "canceled", "rejected"]);
const STORAGE = /^https:\/\/firebasestorage\.googleapis\.com\//;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export function sanitizePayload(type: string, p: Record<string, unknown>): Record<string, unknown> | null {
  if (type === "PHOTOS" || type === "COMPLETION_EVIDENCE") {
    const urls = Array.isArray(p.photoUrls) ? p.photoUrls.map((u) => text(u, 600)) : [];
    if (!urls.length || urls.length > 10 || urls.some((u) => !STORAGE.test(u))) return null;
    return { photoUrls: urls, note: text(p.note, 1000) };
  }
  if (type === "MATERIALS") {
    const items = Array.isArray(p.items) ? p.items.slice(0, 30).map((i: any) => ({ name: text(i?.name, 120), qty: Number(i?.qty) })) : [];
    if (!items.length || items.some((i) => !i.name || !Number.isFinite(i.qty) || i.qty <= 0)) return null;
    return { items };
  }
  const note = text(p.note, 2000);
  return note ? { note } : null;
}

export const technicianSyncOfflineEvents = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "technician" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Technician access only. / للفنيين فقط.");
  const db = admin.firestore();
  if ((await db.doc(`users/${auth.uid}`).get()).data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  const events = Array.isArray(request.data?.events) ? request.data.events : [];
  if (!events.length || events.length > MAX_BATCH) throw new HttpsError("invalid-argument", `Send 1 to ${MAX_BATCH} events. / أرسل من 1 إلى ${MAX_BATCH} حدثاً.`);
  const now = Date.now();
  const results: { clientEventId: string; result: string }[] = [];
  for (const raw of events) {
    const clientEventId = text(raw?.clientEventId, 100);
    const ticketId = text(raw?.ticketId, 160);
    const type = text(raw?.type, 40).toUpperCase();
    const capturedAtMs = Number(raw?.capturedAtMs);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(clientEventId) || !ticketId || !(EVENT_TYPES as readonly string[]).includes(type)) { results.push({ clientEventId, result: "REJECTED_INVALID" }); continue; }
    if (!Number.isFinite(capturedAtMs) || capturedAtMs > now + FUTURE_SKEW_MS || capturedAtMs < now - MAX_AGE_MS) { results.push({ clientEventId, result: "REJECTED_TIMESTAMP" }); continue; }
    const payload = sanitizePayload(type, raw?.payload || {});
    if (!payload) { results.push({ clientEventId, result: "REJECTED_INVALID" }); continue; }
    const ref = db.doc(`technician_offline_events/${auth.uid}_${clientEventId}`);
    const result = await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return "DUPLICATE";
      const t = (await tx.get(db.doc(`maintenanceTickets/${ticketId}`))).data();
      if (!t) return "CONFLICT_TICKET_MISSING";
      if (text(t.assignedTechnicianId || t.technicianId, 180) !== auth.uid) return "CONFLICT_NOT_ASSIGNED";
      if (CLOSED.has(text(t.status).toLowerCase())) return "CONFLICT_TICKET_CLOSED";
      const at = FieldValue.serverTimestamp();
      tx.create(ref, { technicianId: auth.uid, clientEventId, ticketId, ownerId: text(t.ownerId, 180) || null, type, payload, capturedAt: Timestamp.fromMillis(capturedAtMs), syncedAt: at, reviewStatus: "PENDING_REVIEW" });
      tx.create(db.collection("audit_logs").doc(), { action: "TECHNICIAN_OFFLINE_EVENT_SYNCED", actorId: auth.uid, actorRole: "technician", targetType: "maintenanceTickets", targetId: ticketId, eventType: type, createdAt: at });
      return "ACCEPTED";
    });
    results.push({ clientEventId, result });
  }
  return { results };
});
