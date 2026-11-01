/**
 * Secure per-job tenant link (gap audit 2026-11-01, item 6).
 *
 * An admin or the job's owner issues a link for ONE maintenance ticket. Only the SHA-256 hash of
 * the 32-byte token is stored; links expire after 7 days, have a use cap, and issuing a new link
 * revokes earlier ones. The link is a scoped deep link, not a login: the holder must still be
 * signed in as the ticket's own tenant. Through it the tenant can see the job status and send a
 * report (audited, never changes status). Confirming completion still goes through the existing
 * tenantReviewTicketCompletion callable with its full tenant-authority checks.
 */
import * as crypto from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const JOB_LINK_TTL_MS = 7 * 86_400_000;
export const JOB_LINK_MAX_USES = 30;
export const JOB_LINK_MAX_REPORTS = 5;
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin"]);
const text = (v: unknown, max = 1000) => String(v ?? "").trim().slice(0, max);
const hashToken = (raw: string) => crypto.createHash("sha256").update(raw).digest("hex");
const ticketTenant = (t: any) => text(t?.tenantId || t?.tenantUid || t?.userId || t?.requesterId, 128);

function roleOf(auth: any) {
  return text(auth?.token?.role || auth?.token?.userRole, 40).toLowerCase();
}

export function linkState(link: any, nowMs = Date.now()) {
  if (!link) return "INVALID";
  if (link.revoked === true) return "REVOKED";
  const exp = typeof link.expiresAt?.toMillis === "function" ? link.expiresAt.toMillis() : NaN;
  if (!Number.isFinite(exp) || exp <= nowMs) return "EXPIRED";
  if ((Number(link.uses) || 0) >= JOB_LINK_MAX_USES) return "USED_UP";
  return "ACTIVE";
}

export const createTenantJobLink = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  if (request.auth?.token?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  const role = roleOf(request.auth);
  const isAdmin = ADMIN_ROLES.has(role);
  if (!isAdmin && role !== "owner") throw new HttpsError("permission-denied", "Only an admin or the property owner can send a job link. / فقط المسؤول أو المالك يمكنه إرسال رابط الطلب.");
  const ticketId = text(request.data?.ticketId, 128);
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(ticketId)) throw new HttpsError("invalid-argument", "ticketId is required. / رقم الطلب مطلوب.");

  const db = admin.firestore();
  const ticketSnap = await db.collection("maintenanceTickets").doc(ticketId).get();
  if (!ticketSnap.exists) throw new HttpsError("not-found", "Job not found. / الطلب غير موجود.");
  const t = ticketSnap.data() || {};
  if (!isAdmin && text(t.ownerId || t.ownerUid, 128) !== uid) throw new HttpsError("permission-denied", "This job is not on your property. / هذا الطلب ليس على عقارك.");
  const tenantId = ticketTenant(t);
  if (!tenantId) throw new HttpsError("failed-precondition", "This job has no tenant to send a link to. / لا يوجد مستأجر لهذا الطلب.");

  const raw = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(raw);
  const expiresAt = Timestamp.fromMillis(Date.now() + JOB_LINK_TTL_MS);
  const now = FieldValue.serverTimestamp();
  const open = await db.collection("tenant_job_links").where("ticketId", "==", ticketId).where("revoked", "==", false).get();
  const batch = db.batch();
  open.docs.forEach((d) => batch.update(d.ref, { revoked: true, revokedAt: now, revokedReason: "REPLACED" }));
  batch.create(db.collection("tenant_job_links").doc(tokenHash), {
    ticketId, tenantId, createdBy: uid, createdByRole: isAdmin ? "admin" : "owner",
    expiresAt, uses: 0, reports: 0, revoked: false, createdAt: now,
  });
  const linkPath = `/tenant/job-link?t=${raw}`;
  batch.create(db.collection("notifications").doc(), {
    userId: tenantId, type: "TENANT_JOB_LINK", ticketId, link: linkPath, read: false, createdAt: now,
    title: "Your job link", titleAr: "رابط طلبك",
    body: "Use this secure link to check your job and report or confirm. It expires in 7 days and only works when you are signed in.",
    bodyAr: "استخدم هذا الرابط الآمن لمتابعة طلبك والإبلاغ أو التأكيد. ينتهي خلال 7 أيام ويعمل فقط بعد تسجيل الدخول.",
  });
  batch.create(db.collection("audit_logs").doc(), {
    action: "TENANT_JOB_LINK_ISSUED", actorId: uid, actorRole: isAdmin ? "admin" : "owner",
    targetType: "maintenanceTickets", targetId: ticketId, metadata: { revokedPrevious: open.size, ttlDays: 7 }, createdAt: now,
  });
  await batch.commit();
  return { linkPath, expiresAt: expiresAt.toDate().toISOString(), revokedPrevious: open.size };
});

export const resolveTenantJobLink = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  return useLinkCounted(request, text(request.data?.token, 128));
});

async function useLinkCounted(request: any, raw: string) {
  const db = admin.firestore();
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to open this job link. / سجّل الدخول لفتح رابط الطلب.");
  if (roleOf(request.auth) !== "tenant" || request.auth?.token?.suspended === true) {
    throw new HttpsError("permission-denied", "Sign in with the tenant account for this job. / سجّل الدخول بحساب المستأجر لهذا الطلب.");
  }
  if (!/^[a-f0-9]{64}$/.test(raw)) throw new HttpsError("invalid-argument", "Invalid link. / رابط غير صالح.");
  const linkRef = db.collection("tenant_job_links").doc(hashToken(raw));
  return db.runTransaction(async (tx) => {
    const linkSnap = await tx.get(linkRef);
    const link = linkSnap.exists ? linkSnap.data() : null;
    const state = linkState(link);
    if (state !== "ACTIVE") throw new HttpsError("failed-precondition", `This link is no longer valid (${state}). Please ask for a new one. / هذا الرابط لم يعد صالحاً. يرجى طلب رابط جديد.`);
    if (link!.tenantId !== uid) throw new HttpsError("permission-denied", "This link belongs to a different tenant. / هذا الرابط لمستأجر آخر.");
    const ticketRef = db.collection("maintenanceTickets").doc(String(link!.ticketId));
    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Job not found. / الطلب غير موجود.");
    const t = ticketSnap.data() || {};
    if (ticketTenant(t) !== uid) throw new HttpsError("permission-denied", "This job is not yours. / هذا الطلب ليس لك.");
    tx.update(linkRef, { uses: FieldValue.increment(1), lastUsedAt: FieldValue.serverTimestamp() });
    const status = text(t.status, 60).toUpperCase().replace(/\s+/g, "_");
    return {
      ticketId: ticketSnap.id,
      status,
      title: text(t.title || t.category || t.issueType, 140) || null,
      category: text(t.category, 60) || null,
      scheduledAt: t.scheduledAt?.toDate?.().toISOString?.() || null,
      canConfirm: ["COMPLETED", "RESOLVED", "PENDING_TENANT_REVIEW", "COMPLETED_PENDING_APPROVAL", "COMPLETED_PENDING_TENANT_APPROVAL"].includes(status),
      reportsLeft: Math.max(0, JOB_LINK_MAX_REPORTS - (Number(link!.reports) || 0)),
      expiresAt: link!.expiresAt.toDate().toISOString(),
    };
  });
}

export const reportViaTenantJobLink = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const db = admin.firestore();
  const raw = text(request.data?.token, 128);
  const note = text(request.data?.note, 1000);
  if (note.length < 8) throw new HttpsError("invalid-argument", "Describe the problem (at least 8 characters). / صف المشكلة (8 أحرف على الأقل).");
  const view = await useLinkCounted(request, raw);
  const linkRef = db.collection("tenant_job_links").doc(hashToken(raw));
  const uid = request.auth!.uid;
  return db.runTransaction(async (tx) => {
    const link = (await tx.get(linkRef)).data() || {};
    const reports = Number(link.reports) || 0;
    if (reports >= JOB_LINK_MAX_REPORTS) throw new HttpsError("resource-exhausted", "Report limit for this link reached. Please use the app chat. / تم بلوغ حد البلاغات لهذا الرابط. يرجى استخدام المحادثة في التطبيق.");
    const now = FieldValue.serverTimestamp();
    tx.update(linkRef, { reports: reports + 1 });
    tx.create(db.collection("tenant_job_reports").doc(), { ticketId: view.ticketId, tenantId: uid, note, ticketStatusAtReport: view.status, source: "JOB_LINK", createdAt: now });
    tx.create(db.collection("audit_logs").doc(), {
      action: "TENANT_JOB_LINK_REPORT", actorId: uid, actorRole: "tenant", targetType: "maintenanceTickets", targetId: view.ticketId,
      metadata: { noteLength: note.length, reportNumber: reports + 1 }, createdAt: now,
    });
    return { status: "REPORTED", reportsLeft: JOB_LINK_MAX_REPORTS - reports - 1 };
  });
});
