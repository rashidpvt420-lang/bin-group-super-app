/**
 * WhatsApp job and rent status updates to tenants and owners.
 * Events: TICKET_SUBMITTED, TECH_ASSIGNED, TECH_ARRIVED, JOB_COMPLETED,
 * OWNER_APPROVAL_NEEDED, RENT_DUE_REMINDER.
 *  - Opt-in per user: only users with an explicit `whatsapp_optins/{uid}.optIn === true` are messaged.
 *  - Approved templates only: a send happens only when `whatsapp_templates/{event}` exists with
 *    `approved: true` and a template name (set by Admin/CEO with MFA to the name Meta approved).
 *    Missing → not sent. The Owner/Tenant toggle says "coming soon" until the job event set is approved.
 *  - Idempotent per event: `whatsapp_notifications/{refId}_{event}_{uid}` is created transactionally
 *    before sending, so retries and duplicate trigger deliveries never send twice.
 *  - Locale: `ar` maps to Meta `ar`, `en` maps to `en_US`, overridable per template.
 *  - Rate-limited per user per Dubai day. Quiet hours 22:00–07:00 Asia/Dubai, except emergency tickets.
 *  - Every outcome is written to `audit_logs`. Message parameters carry only a short reference and
 *    category (or rent amount and due date), never personal data or payment links.
 *  - Fail-closed: no token/phone-number-id → SKIPPED_NOT_CONFIGURED. Under the emulator the real Graph
 *    API is never called. Provider error bodies are never logged; only a status/code is.
 * Secrets are read via defineSecret and never logged.
 */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { claimRateLimit } from "./whatsappRateLimit";
import {
  JOB_TEMPLATE_EVENTS,
  OUTBOUND_DAILY_LIMIT,
  PHASE1_TEMPLATE_EVENTS,
  dubaiCalendarDay,
  isPhase1TemplateEvent,
  isSafeTemplateName,
  optInLanguageKey,
  paramsForEvent,
  phase1JobTemplatesReady,
  recipientsFor,
  resolveWhatsAppLanguageCode,
  sanitizeLanguageCodes,
  shouldSkipQuietHours,
  ticketEvents,
  type Phase1TemplateEvent,
} from "./whatsappPolicy";

export {
  JOB_TEMPLATE_EVENTS,
  PHASE1_TEMPLATE_EVENTS,
  paramsForEvent,
  recipientsFor,
  resolveWhatsAppLanguageCode,
  ticketEvents,
};

if (!admin.apps.length) admin.initializeApp();
export const whatsappTokenSecret = defineSecret("WHATSAPP_TOKEN");
export const whatsappPhoneNumberIdSecret = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const waToken = whatsappTokenSecret;
const waPhoneId = whatsappPhoneNumberIdSecret;

export type JobEvent = Phase1TemplateEvent;
export const JOB_EVENTS = PHASE1_TEMPLATE_EVENTS;
export type Sender = (args: { to: string; template: string; language: string; params: string[] }) => Promise<{ ok: boolean; status?: number; code?: string | number }>;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const E164 = /^\+[1-9]\d{7,14}$/;
const TEMPLATE_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);

export const graphSender: Sender = async ({ to, template, language, params }) => {
  if (process.env.FUNCTIONS_EMULATOR === "true") return { ok: false, status: 0 };
  const token = waToken.value(); const phoneId = waPhoneId.value();
  if (!token || !phoneId) return { ok: false, status: -1 };
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "template", template: { name: template, language: { code: language }, components: [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }] } }),
  });
  if (!res.ok) {
    let code: string | number = res.status;
    try {
      const payload = await res.json() as { error?: { code?: string | number } };
      if (payload?.error?.code !== undefined) code = payload.error.code;
    } catch {
      /* ignore body; never log it */
    }
    console.error("WhatsApp send failed", { status: res.status, code });
    return { ok: false, status: res.status, code };
  }
  return { ok: true, status: res.status };
};

export async function loadTemplateMap(db: Firestore) {
  const snaps = await Promise.all(PHASE1_TEMPLATE_EVENTS.map((event) => db.doc(`whatsapp_templates/${event}`).get()));
  const map: Record<string, { approved?: unknown; templateName?: unknown; languageCodes?: unknown }> = {};
  snaps.forEach((snap, i) => { map[PHASE1_TEMPLATE_EVENTS[i]] = snap.data() || {}; });
  return map;
}

export async function jobTemplatesAreReady(db: Firestore): Promise<boolean> {
  const map = await loadTemplateMap(db);
  return phase1JobTemplatesReady(map);
}

export async function notifyJobEvent(refId: string, event: JobEvent, t: Record<string, unknown>, send: Sender = graphSender, now = new Date()) {
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
    if (!tpl || tpl.approved !== true || !isSafeTemplateName(text(tpl.templateName, 120))) result = "SKIPPED_TEMPLATE_NOT_APPROVED";
    else if (shouldSkipQuietHours(t, now)) result = "SKIPPED_QUIET_HOURS";
    else if (!(await claimRateLimit(db, "out", uid, dubaiCalendarDay(now), OUTBOUND_DAILY_LIMIT))) result = "SKIPPED_RATE_LIMITED";
    else {
      const language = resolveWhatsAppLanguageCode(opt.language, tpl);
      try {
        const r = await send({ to: text(opt.phoneE164, 20), template: text(tpl.templateName, 120), language, params: paramsForEvent(event, refId, t) });
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
  await notifyJobEvent(e.params.approvalId, "OWNER_APPROVAL_NEEDED", { ownerId: d.ownerId, category: d.trade || d.category, urgency: d.urgency || d.priority });
});

/** Tenants and owners opt in or out for their own account. The phone comes from their profile, not from input. Pre-opt-in is allowed while templates are still unapproved. */
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
  const comingSoon = !(await jobTemplatesAreReady(db));
  await db.doc(`whatsapp_optins/${auth.uid}`).set({ userId: auth.uid, optIn, phoneE164: optIn ? phone : null, language: optInLanguageKey(request.data?.language), updatedAt: now }, { merge: true });
  await db.collection("audit_logs").add({ action: optIn ? "WHATSAPP_JOB_UPDATES_OPT_IN" : "WHATSAPP_JOB_UPDATES_OPT_OUT", actorId: auth.uid, actorRole: role, targetType: "whatsapp_optins", targetId: auth.uid, comingSoon, createdAt: now });
  return { status: "SUCCESS", optIn, comingSoon };
});

/** Owners and tenants can see whether WhatsApp job updates are still coming soon. Does not expose template names or secrets. */
export const getWhatsAppJobUpdatesStatus = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (!["tenant", "owner"].includes(role) || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Tenants and owners only. / للمستأجرين والملاك فقط.");
  const db = admin.firestore();
  const opt = (await db.doc(`whatsapp_optins/${auth.uid}`).get()).data();
  const comingSoon = !(await jobTemplatesAreReady(db));
  return { optIn: opt?.optIn === true, comingSoon };
});

/** Admin or CEO with a verified MFA session may register or update a Meta-approved template name. No secret values. */
export const adminUpsertWhatsAppTemplate = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  await requirePrivilegedMfaSession(request.auth);
  const role = text(request.auth?.token?.role || request.auth?.token?.userRole, 40).toLowerCase();
  const ceoClaim = request.auth?.token?.ceo === true || request.auth?.token?.superAdmin === true || request.auth?.token?.super_admin === true;
  if (!TEMPLATE_ADMIN_ROLES.has(role) && !ceoClaim) {
    throw new HttpsError("permission-denied", "Only Admin or CEO with MFA can register WhatsApp templates. / يمكن للمدير أو الرئيس التنفيذي فقط مع التحقق الثنائي تسجيل قوالب واتساب.");
  }
  const event = text(request.data?.event, 60);
  if (!isPhase1TemplateEvent(event)) {
    throw new HttpsError("invalid-argument", "A supported phase-1 template event is required.");
  }
  const templateName = text(request.data?.templateName, 120).toLowerCase();
  if (!isSafeTemplateName(templateName)) {
    throw new HttpsError("invalid-argument", "Template name must match the Meta name (lowercase letters, digits, underscores).");
  }
  const approved = request.data?.approved === true;
  const languageCodes = sanitizeLanguageCodes(request.data?.languageCodes);
  const db = admin.firestore();
  const ref = db.doc(`whatsapp_templates/${event}`);
  const previous = (await ref.get()).data() || {};
  const now = FieldValue.serverTimestamp();
  await ref.set({
    event,
    templateName,
    approved,
    languageCodes,
    updatedBy: request.auth!.uid,
    updatedAt: now,
    createdAt: previous.createdAt || now,
  }, { merge: true });
  await db.collection("audit_logs").add({
    action: "WHATSAPP_TEMPLATE_UPSERT",
    actorId: request.auth!.uid,
    actorRole: role || "admin",
    targetType: "whatsapp_templates",
    targetId: event,
    templateName,
    approved,
    languageCodes,
    previousTemplateName: previous.templateName || null,
    previousApproved: previous.approved === true,
    createdAt: now,
  });
  return { status: "SUCCESS", event, templateName, approved, languageCodes };
});
