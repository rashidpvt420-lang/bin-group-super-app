/**
 * WhatsApp job status updates to tenants and owners (Owner Trust Centre item 12).
 * Events: SUBMITTED, ASSIGNED, ARRIVAL, COMPLETED, APPROVAL_NEEDED.
 *  - Opt-in per user: only users with an explicit `whatsapp_optins/{uid}.optIn === true` are messaged.
 *  - Approved templates only: a send happens only when `whatsapp_templates/{event}` exists with
 *    `approved: true` and a template name (set by Admin to the name Meta approved). Missing → not sent.
 *  - Idempotent per event: `whatsapp_notifications/{ticketId}_{event}_{uid}` is created transactionally
 *    before sending, so retries and duplicate trigger deliveries never send twice.
 *  - Every outcome is written to `audit_logs`. Message parameters carry only a short job reference and
 *    category, never personal data.
 *  - Fail-closed: no token/phone-number-id → SKIPPED_NOT_CONFIGURED. Under the emulator the real Graph
 *    API is never called. Inbound webhook signature checks stay in whatsappSignature.ts (fail-closed).
 * Secrets are read via defineSecret and never logged.
 */
import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const waToken = defineSecret("WHATSAPP_TOKEN");
const waPhoneId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");

export const JOB_EVENTS = ["SUBMITTED", "ASSIGNED", "ARRIVAL", "COMPLETED", "APPROVAL_NEEDED"] as const;
export type JobEvent = (typeof JOB_EVENTS)[number];
export type Sender = (args: { to: string; template: string; language: string; params: string[] }) => Promise<{ ok: boolean; status?: number }>;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const E164 = /^\+[1-9]\d{7,14}$/;

/** Which status events a ticket write represents. Pure, for testing. */
export function ticketEvents(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): JobEvent[] {
  if (!after) return [];
  if (!before) return ["SUBMITTED"];
  const out: JobEvent[] = [];
  const tech = (d: Record<string, unknown>) => text(d.assignedTechnicianId || d.technicianId, 180);
  if (!tech(before) && tech(after)) out.push("ASSIGNED");
  const b = text(before.status).toUpperCase(); const a = text(after.status).toUpperCase();
  if (a !== b && a === "ARRIVED") out.push("ARRIVAL");
  if (a !== b && (a === "COMPLETED" || a === "COMPLETE")) out.push("COMPLETED");
  return out;
}

export function recipientsFor(event: JobEvent, t: Record<string, unknown>) {
  const tenant = text(t.tenantId || t.requesterId || t.createdBy, 180);
  const owner = text(t.ownerId, 180);
  const list = event === "APPROVAL_NEEDED" ? [owner] : [tenant, owner];
  return [...new Set(list.filter(Boolean))];
}

export const graphSender: Sender = async ({ to, template, language, params }) => {
  if (process.env.FUNCTIONS_EMULATOR === "true") return { ok: false, status: 0 };
  const token = waToken.value(); const phoneId = waPhoneId.value();
  if (!token || !phoneId) return { ok: false, status: -1 };
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template", template: { name: template, language: { code: language }, components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] } }),
  });
  return { ok: res.ok, status: res.status };
};

export async function notifyJobEvent(refId: string, event: JobEvent, t: Record<string, unknown>, send: Sender = graphSender) {
  const db = admin.firestore();
  const tpl = (await db.doc(`whatsapp_templates/${event}`).get()).data();
  const outcomes: { uid: string; result: string }[] = [];
  for (const uid of recipientsFor(event, t)) {
    const opt = (await db.doc(`whatsapp_optins/${uid}`).get()).data();
    if (opt?.optIn !== true || !E164.test(text(opt.phoneE164, 20))) { outcomes.push({ uid, result: "SKIPPED_NOT_OPTED_IN" }); continue; }
    const logRef = db.doc(`whatsapp_notifications/${refId}_${event}_${uid}`);
    const claimed = await db.runTransaction(async (tx) => {
      if ((await tx.get(logRef)).exists) return false;
      tx.create(logRef, { refId, event, userId: uid, status: "CLAIMED", createdAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) { outcomes.push({ uid, result: "DUPLICATE" }); continue; }
    let result: string;
    if (!tpl || tpl.approved !== true || !text(tpl.templateName, 120)) result = "SKIPPED_TEMPLATE_NOT_APPROVED";
    else {
      const lang = opt.language === "ar" ? "ar" : "en";
      try {
        const r = await send({ to: opt.phoneE164, template: text(tpl.templateName, 120), language: lang, params: [refId.slice(0, 8).toUpperCase(), text(t.category, 60) || "-"] });
        result = r.ok ? "SENT" : r.status === -1 || r.status === 0 ? "SKIPPED_NOT_CONFIGURED" : "FAILED";
      } catch {
        result = "FAILED";
      }
    }
    await logRef.update({ status: result, updatedAt: FieldValue.serverTimestamp() });
    await db.collection("audit_logs").add({ action: "WHATSAPP_JOB_STATUS_NOTIFICATION", actorId: "system", actorRole: "system", targetType: "whatsapp_notifications", targetId: logRef.id, targetUserId: uid, event, result, createdAt: FieldValue.serverTimestamp() });
    outcomes.push({ uid, result });
  }
  return outcomes;
}

export const onTicketWrittenWhatsAppStatus = onDocumentWritten({ document: "maintenanceTickets/{ticketId}", region: "europe-west3", secrets: [waToken, waPhoneId] }, async (e) => {
  const after = e.data?.after?.data();
  for (const ev of ticketEvents(e.data?.before?.data(), after)) await notifyJobEvent(e.params.ticketId, ev, after || {});
});

export const onApprovalRequestWhatsAppStatus = onDocumentCreated({ document: "owner_approval_requests/{approvalId}", region: "europe-west3", secrets: [waToken, waPhoneId] }, async (e) => {
  const d = e.data?.data() || {};
  await notifyJobEvent(e.params.approvalId, "APPROVAL_NEEDED", { ownerId: d.ownerId, category: d.trade || d.category });
});

/** Tenants and owners opt in or out for their own account. The phone comes from their profile, not from input. */
export const setWhatsAppJobUpdatesOptIn = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (!["tenant", "owner"].includes(role) || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Tenants and owners only. / للمستأجرين والملاك فقط.");
  const db = admin.firestore();
  const profile = (await db.doc(`users/${auth.uid}`).get()).data() || {};
  if (profile.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  const optIn = request.data?.optIn === true;
  const phone = text(profile.phoneNumber || profile.phone, 20).replace(/[\s-]/g, "");
  if (optIn && !E164.test(phone)) throw new HttpsError("failed-precondition", "Add a mobile number in international format (+971…) to your profile first. / أضف رقم جوال بالصيغة الدولية (+971…) في ملفك أولاً.");
  const now = FieldValue.serverTimestamp();
  await db.doc(`whatsapp_optins/${auth.uid}`).set({ userId: auth.uid, optIn, phoneE164: optIn ? phone : null, language: request.data?.language === "ar" ? "ar" : "en", updatedAt: now }, { merge: true });
  await db.collection("audit_logs").add({ action: optIn ? "WHATSAPP_JOB_UPDATES_OPT_IN" : "WHATSAPP_JOB_UPDATES_OPT_OUT", actorId: auth.uid, actorRole: role, targetType: "whatsapp_optins", targetId: auth.uid, createdAt: now });
  return { status: "SUCCESS", optIn };
});
