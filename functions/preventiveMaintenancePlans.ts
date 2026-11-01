// Preventive maintenance plans (annual). Separate from painting.
//
// Security model:
//   - Every write runs here; firestore.rules deny all browser writes to pm_plan_templates and
//     pm_subscriptions (Admin sessions included).
//   - Admins (verified MFA session) manage plan templates priced in AED.
//   - Owners subscribe only properties/units they own. The subject is always request.auth.uid.
//   - Billing is a cash/cheque invoice only (card stays OFF). A plan activates only after a Finance
//     Admin (MFA) links a real payment_collection_records entry for that invoice that is not voided
//     and covers the invoice amount (the existing finance proof flow).
//   - A daily job turns due visits into SCHEDULED_SERVICE maintenance tickets for technician
//     dispatch (deterministic ticket ids, so re-runs never duplicate) and sends owner reminders.
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { requireMfaFinanceAdminActor } from "./financeAdminMfa";

if (!admin.apps.length) admin.initializeApp();

const db = () => admin.firestore();
const REGION = "europe-west3";
export const PM_POLICY_VERSION = "BIN-PM-PLANS-2026-11";
export const PM_JOB_LOOKAHEAD_DAYS = 14;
export const PM_REMINDER_DAYS = 3;
export const PM_ALLOWED_METHODS = ["cash", "cheque"] as const;

/** Service catalogue: code -> dispatch trade + bilingual label. */
export const PM_SERVICES: Record<string, { category: string; en: string; ar: string }> = {
  AC_SERVICE: { category: "AC", en: "AC service", ar: "صيانة المكيفات" },
  WATER_TANK_CLEANING: { category: "Plumbing", en: "Water tank cleaning", ar: "تنظيف خزان المياه" },
  PEST_CONTROL: { category: "Pest Control", en: "Pest control", ar: "مكافحة الحشرات" },
  ELECTRICAL_INSPECTION: { category: "Electrical", en: "Electrical safety inspection", ar: "فحص السلامة الكهربائية" },
  PLUMBING_INSPECTION: { category: "Plumbing", en: "Plumbing inspection", ar: "فحص السباكة" },
  FIRE_SAFETY_CHECK: { category: "General", en: "Fire safety check", ar: "فحص السلامة من الحرائق" },
};
const ALLOWED_VISITS = [1, 2, 3, 4, 6, 12];

export class PmRuleError extends Error {}
const asHttps = (e: unknown) => (e instanceof PmRuleError ? new HttpsError("invalid-argument", e.message) : e);
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const isAdmin = (auth: any) => auth?.token?.admin === true || auth?.token?.role === "admin" || auth?.token?.role === "super_admin";
const idArg = (v: unknown, field: string) => {
  const s = text(v, 240);
  if (!s || s.includes("/")) throw new HttpsError("invalid-argument", `${field} is required.`);
  return s;
};

/** Exact AED to the fils (no floats beyond 2 decimals, no zero, no negatives). */
export function parsePriceAed(value: unknown): number {
  const raw = typeof value === "number" ? String(value) : text(value, 20);
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) throw new PmRuleError("Annual price must be AED with at most 2 decimals.");
  const n = Number(raw);
  if (!(n > 0)) throw new PmRuleError("Annual price must be greater than zero.");
  return n;
}

export function normaliseTemplate(input: any) {
  const serviceCode = text(input?.serviceCode, 40).toUpperCase();
  if (!PM_SERVICES[serviceCode]) throw new PmRuleError("Unknown service type.");
  const nameEn = text(input?.nameEn, 120);
  const nameAr = text(input?.nameAr, 120);
  if (nameEn.length < 3 || nameAr.length < 2) throw new PmRuleError("English and Arabic plan names are required.");
  const visitsPerYear = Number(input?.visitsPerYear);
  if (!ALLOWED_VISITS.includes(visitsPerYear)) throw new PmRuleError("Visits per year must be 1, 2, 3, 4, 6 or 12.");
  const annualPriceAed = parsePriceAed(input?.annualPriceAed);
  const scope = text(input?.scope, 20).toUpperCase() || "UNIT";
  if (!["UNIT", "PROPERTY"].includes(scope)) throw new PmRuleError("Scope must be UNIT or PROPERTY.");
  return {
    serviceCode, nameEn, nameAr, visitsPerYear, annualPriceAed, scope, currency: "AED",
    descriptionEn: text(input?.descriptionEn, 600), descriptionAr: text(input?.descriptionAr, 600),
    active: input?.active !== false,
  };
}

/** YYYY-MM-DD (Dubai calendar) helpers on whole dates only. */
export function dubaiToday(now = new Date()): string {
  return new Date(now.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
export function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
export function parseStartDate(value: unknown, now = new Date()): string {
  const d = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) throw new PmRuleError("Start date must be YYYY-MM-DD.");
  const today = dubaiToday(now);
  if (d < today) throw new PmRuleError("Start date cannot be in the past.");
  if (d > addDays(today, 120)) throw new PmRuleError("Start date must be within 120 days.");
  return d;
}

/** Evenly spaced visits across the 12-month term, first visit on the start date. */
export function buildVisitSchedule(startDate: string, visitsPerYear: number) {
  if (!ALLOWED_VISITS.includes(visitsPerYear)) throw new PmRuleError("Invalid visit frequency.");
  const step = 12 / visitsPerYear;
  return Array.from({ length: visitsPerYear }, (_, i) => ({
    index: i + 1, date: addMonths(startDate, Math.round(i * step)), ticketId: null as string | null, reminderSent: false,
  }));
}

async function audit(action: string, actorUid: string, data: Record<string, unknown>, tx?: FirebaseFirestore.Transaction) {
  const ref = db().collection("audit_logs").doc();
  const entry = { action, actorUid, targetType: "pm_subscriptions", policyVersion: PM_POLICY_VERSION, ...data, at: FieldValue.serverTimestamp() };
  if (tx) tx.set(ref, entry); else await ref.set(entry);
}

// ---------------------------------------------------------------------------
// Admin: plan templates
// ---------------------------------------------------------------------------
export const adminUpsertPmPlanTemplate = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  if (!isAdmin(request.auth)) throw new HttpsError("permission-denied", "Admin only.");
  await requirePrivilegedMfaSession(request.auth);
  try {
    const tpl = normaliseTemplate(request.data);
    const rawId = request.data?.templateId;
    const ref = rawId ? db().collection("pm_plan_templates").doc(idArg(rawId, "templateId")) : db().collection("pm_plan_templates").doc();
    const uid = request.auth!.uid;
    return await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (rawId && !snap.exists) throw new HttpsError("not-found", "Template not found.");
      const version = Number(snap.get("version") ?? 0) + 1;
      tx.set(ref, {
        ...tpl, version, updatedBy: uid, updatedAt: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdBy: uid, createdAt: FieldValue.serverTimestamp() }),
      }, { merge: true });
      tx.set(ref.collection("history").doc(`v${version}`), { ...tpl, version, changedBy: uid, changedAt: FieldValue.serverTimestamp() });
      await audit(snap.exists ? "PM_TEMPLATE_UPDATED" : "PM_TEMPLATE_CREATED", uid, { templateId: ref.id, version, annualPriceAed: tpl.annualPriceAed }, tx);
      return { templateId: ref.id, version };
    });
  } catch (e) { throw asHttps(e); }
});

// ---------------------------------------------------------------------------
// Owner: subscribe / cancel before payment
// ---------------------------------------------------------------------------
export const ownerSubscribePmPlan = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  try {
    const templateId = idArg(request.data?.templateId, "templateId");
    const propertyId = idArg(request.data?.propertyId, "propertyId");
    const unitId = request.data?.unitId ? idArg(request.data.unitId, "unitId") : null;
    const requestId = text(request.data?.requestId, 64);
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) throw new HttpsError("invalid-argument", "requestId must be 8-64 letters, digits, '-' or '_'.");
    const startDate = parseStartDate(request.data?.startDate);

    const [tplSnap, propSnap] = await Promise.all([
      db().collection("pm_plan_templates").doc(templateId).get(),
      db().collection("properties").doc(propertyId).get(),
    ]);
    if (!tplSnap.exists || tplSnap.get("active") !== true) throw new HttpsError("not-found", "Plan is not available.");
    if (!propSnap.exists || propSnap.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your property.");
    const tpl = tplSnap.data()!;
    if (tpl.scope === "UNIT" && !unitId) throw new HttpsError("invalid-argument", "Choose a unit for this plan.");
    if (unitId) {
      const unitSnap = await db().collection("properties").doc(propertyId).collection("units").doc(unitId).get();
      const flat = unitSnap.exists ? unitSnap : await db().collection("units").doc(unitId).get();
      if (!flat.exists || (flat.get("propertyId") && flat.get("propertyId") !== propertyId)) throw new HttpsError("not-found", "Unit not found on this property.");
      if (flat.get("ownerId") && flat.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your unit.");
    }

    const subRef = db().collection("pm_subscriptions").doc(`${uid}_${requestId}`);
    const invoiceRef = db().collection("invoices").doc(`pm_${uid}_${requestId}`);
    return await db().runTransaction(async (tx) => {
      const existing = await tx.get(subRef);
      if (existing.exists) {
        if (existing.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your request.");
        return { subscriptionId: subRef.id, invoiceId: existing.get("invoiceId"), status: existing.get("status"), idempotent: true };
      }
      // One live plan per template + property + unit.
      const dupKey = `${uid}|${templateId}|${propertyId}|${unitId ?? "-"}`;
      const dupRef = db().collection("pm_subscription_keys").doc(Buffer.from(dupKey).toString("base64url").slice(0, 600));
      const dup = await tx.get(dupRef);
      if (dup.exists && ["PENDING_PAYMENT", "ACTIVE"].includes(String(dup.get("status")))) {
        throw new HttpsError("already-exists", "This plan is already active or awaiting payment for that property/unit.");
      }
      const svc = PM_SERVICES[tpl.serviceCode];
      const amount = Number(tpl.annualPriceAed);
      const record = {
        ownerId: uid, propertyId, unitId, templateId, templateVersion: Number(tpl.version ?? 1), requestId,
        serviceCode: tpl.serviceCode, category: svc.category, nameEn: tpl.nameEn, nameAr: tpl.nameAr,
        visitsPerYear: Number(tpl.visitsPerYear), annualPriceAed: amount, currency: "AED",
        status: "PENDING_PAYMENT", requestedStartDate: startDate, invoiceId: invoiceRef.id,
        allowedPaymentMethods: [...PM_ALLOWED_METHODS], dupKeyId: dupRef.id,
        policyVersion: PM_POLICY_VERSION, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      };
      tx.create(subRef, record);
      tx.set(dupRef, { subscriptionId: subRef.id, status: "PENDING_PAYMENT", ownerId: uid });
      tx.create(invoiceRef, {
        ownerId: uid, payerId: uid, propertyId, unitId, invoiceType: "PREVENTIVE_MAINTENANCE_PLAN",
        sourceType: "pm_subscription", sourceId: subRef.id, invoiceNumber: `PM-${subRef.id.slice(-10).toUpperCase()}`,
        description: `${tpl.nameEn} (annual, ${tpl.visitsPerYear} visits)`, descriptionAr: `${tpl.nameAr} (سنوي، ${tpl.visitsPerYear} زيارات)`,
        amount, totalAmount: amount, currency: "AED", status: "issued", paymentStatus: "UNPAID",
        allowedPaymentMethods: [...PM_ALLOWED_METHODS], cardPaymentsEnabled: false,
        issuedAt: dubaiToday(), createdAt: FieldValue.serverTimestamp(),
      });
      await audit("PM_SUBSCRIPTION_REQUESTED", uid, { subscriptionId: subRef.id, templateId, propertyId, unitId, amount }, tx);
      return { subscriptionId: subRef.id, invoiceId: invoiceRef.id, status: "PENDING_PAYMENT", idempotent: false };
    });
  } catch (e) { throw asHttps(e); }
});

export const ownerCancelPendingPmSubscription = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const ref = db().collection("pm_subscriptions").doc(idArg(request.data?.subscriptionId, "subscriptionId"));
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("ownerId") !== uid) throw new HttpsError("permission-denied", "Not your plan.");
    if (snap.get("status") !== "PENDING_PAYMENT") throw new HttpsError("failed-precondition", "Only unpaid plans can be cancelled here. Contact BIN GROUP for active plans.");
    tx.update(ref, { status: "CANCELLED", cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.set(db().collection("pm_subscription_keys").doc(String(snap.get("dupKeyId"))), { status: "CANCELLED" }, { merge: true });
    tx.update(db().collection("invoices").doc(String(snap.get("invoiceId"))), { status: "cancelled", paymentStatus: "CANCELLED" });
    await audit("PM_SUBSCRIPTION_CANCELLED", uid, { subscriptionId: ref.id }, tx);
    return { subscriptionId: ref.id, status: "CANCELLED" };
  });
});

// ---------------------------------------------------------------------------
// Finance: activate after a recorded cash/cheque collection (existing proof flow)
// ---------------------------------------------------------------------------
export const financeActivatePmSubscription = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireMfaFinanceAdminActor(request);
  const subRef = db().collection("pm_subscriptions").doc(idArg(request.data?.subscriptionId, "subscriptionId"));
  const recordId = text(request.data?.collectionRecordId, 64);
  if (!/^[a-f0-9]{32}$/.test(recordId)) throw new HttpsError("invalid-argument", "A payment collection record is required.");
  const recRef = db().collection("payment_collection_records").doc(recordId);
  const voidRef = db().collection("payment_collection_voids").doc(recordId);
  const useRef = db().collection("pm_collection_record_uses").doc(recordId);
  return db().runTransaction(async (tx) => {
    const [sub, rec, voided, used] = await Promise.all([tx.get(subRef), tx.get(recRef), tx.get(voidRef), tx.get(useRef)]);
    if (!sub.exists) throw new HttpsError("not-found", "Plan not found.");
    if (sub.get("status") === "ACTIVE") return { subscriptionId: subRef.id, status: "ACTIVE", idempotent: true };
    if (sub.get("status") !== "PENDING_PAYMENT") throw new HttpsError("failed-precondition", "Plan is not awaiting payment.");
    if (!rec.exists) throw new HttpsError("not-found", "Payment collection record not found.");
    if (voided.exists) throw new HttpsError("failed-precondition", "That collection record was voided.");
    if (used.exists) throw new HttpsError("failed-precondition", "That collection record is already linked to a plan.");
    const r = rec.data()!;
    if (r.targetType !== "invoice" || r.targetId !== sub.get("invoiceId")) throw new HttpsError("failed-precondition", "The record is not for this plan's invoice.");
    if (r.payerUid !== sub.get("ownerId")) throw new HttpsError("failed-precondition", "The record payer is not the plan owner.");
    if (!(PM_ALLOWED_METHODS as readonly string[]).includes(String(r.method))) throw new HttpsError("failed-precondition", "Only cash or cheque collections can activate a plan.");
    if (r.status !== "collected") throw new HttpsError("failed-precondition", "The collection is not in collected status.");
    if (Math.round(Number(r.amount) * 100) < Math.round(Number(sub.get("annualPriceAed")) * 100)) {
      throw new HttpsError("failed-precondition", "The collected amount is less than the plan invoice.");
    }
    const requested = String(sub.get("requestedStartDate"));
    const startDate = requested < dubaiToday() ? dubaiToday() : requested;
    const visits = buildVisitSchedule(startDate, Number(sub.get("visitsPerYear")));
    const endDate = addDays(addMonths(startDate, 12), -1);
    tx.update(subRef, {
      status: "ACTIVE", startDate, endDate, visits, collectionRecordId: recordId, activatedBy: actor.uid,
      activatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(useRef, { subscriptionId: subRef.id, at: FieldValue.serverTimestamp() });
    tx.set(db().collection("pm_subscription_keys").doc(String(sub.get("dupKeyId"))), { status: "ACTIVE" }, { merge: true });
    tx.update(db().collection("invoices").doc(String(sub.get("invoiceId"))), {
      status: "paid", paymentStatus: "PAID_CASH_CHEQUE", paymentCollectionRecordId: recordId, paidOn: r.collectedOn ?? null,
    });
    await audit("PM_SUBSCRIPTION_ACTIVATED", actor.uid, { subscriptionId: subRef.id, collectionRecordId: recordId, startDate, endDate }, tx);
    return { subscriptionId: subRef.id, status: "ACTIVE", startDate, endDate, visits: visits.length };
  });
});

// ---------------------------------------------------------------------------
// Scheduler: due visits -> dispatch tickets + owner reminders (idempotent)
// ---------------------------------------------------------------------------
export async function runPmJobGeneration(now = new Date()) {
  const today = dubaiToday(now);
  const horizon = addDays(today, PM_JOB_LOOKAHEAD_DAYS);
  const reminderBy = addDays(today, PM_REMINDER_DAYS);
  const subs = await db().collection("pm_subscriptions").where("status", "==", "ACTIVE").limit(1000).get();
  let created = 0;
  let reminders = 0;
  let expired = 0;
  for (const s of subs.docs) {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(s.ref);
      const d = snap.data();
      if (!d || d.status !== "ACTIVE") return;
      if (d.endDate && String(d.endDate) < today) {
        tx.update(s.ref, { status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() });
        if (d.dupKeyId) tx.set(db().collection("pm_subscription_keys").doc(String(d.dupKeyId)), { status: "EXPIRED" }, { merge: true });
        expired += 1;
        return;
      }
      const visits = Array.isArray(d.visits) ? d.visits.map((v: any) => ({ ...v })) : [];
      const svc = PM_SERVICES[d.serviceCode] ?? { category: "General", en: d.nameEn, ar: d.nameAr };
      const ticketRefs: FirebaseFirestore.DocumentReference[] = visits.map((v: any) => db().collection("maintenanceTickets").doc(`pm_${s.id}_${v.index}`));
      const ticketSnaps: FirebaseFirestore.DocumentSnapshot[] = await Promise.all(ticketRefs.map((r: FirebaseFirestore.DocumentReference) => tx.get(r)));
      let changed = false;
      visits.forEach((v: any, i: number) => {
        if (!v.ticketId && v.date <= horizon) {
          if (!ticketSnaps[i].exists) {
            tx.create(ticketRefs[i], {
              requestType: "SCHEDULED_SERVICE", source: "PREVENTIVE_MAINTENANCE_PLAN", pmSubscriptionId: s.id, pmVisitIndex: v.index,
              ownerId: d.ownerId, ownerUid: d.ownerId, createdBy: d.ownerId, propertyId: d.propertyId, unitId: d.unitId ?? null,
              serviceCode: d.serviceCode, serviceLabel: svc.en, serviceLabelAr: svc.ar, category: svc.category,
              description: `${d.nameEn} - planned visit ${v.index} of ${visits.length}`,
              descriptionAr: `${d.nameAr} - الزيارة المجدولة ${v.index} من ${visits.length}`,
              requestedServiceDate: v.date, preferredServiceDate: v.date, priority: "NORMAL", currency: "AED",
              quoteStatus: "PREPAID_ANNUAL_PLAN", paymentVerified: true, paymentStatus: "PREPAID_PLAN",
              status: "PENDING_SCHEDULING", dispatchStatus: "PENDING_SCHEDULING", appointmentStatus: "PENDING_CONFIRMATION",
              trackingStatus: "WAITING_FOR_APPOINTMENT_CONFIRMATION", technicianId: null, assignedTechnicianId: null,
              photoEvidenceRequired: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
            });
            created += 1;
          }
          v.ticketId = ticketRefs[i].id;
          changed = true;
        }
        if (v.ticketId && !v.reminderSent && v.date <= reminderBy && v.date >= today) {
          tx.set(db().collection("notifications").doc(`pm_${s.id}_${v.index}_reminder`), {
            recipientId: d.ownerId, userId: d.ownerId, type: "PM_VISIT_REMINDER",
            title: `${svc.en} on ${v.date}`, titleAr: `${svc.ar} بتاريخ ${v.date}`,
            body: `Planned visit ${v.index} of ${visits.length} for your maintenance plan. Please make sure access is ready.`,
            bodyAr: `الزيارة المجدولة ${v.index} من ${visits.length} ضمن خطة الصيانة. يرجى تجهيز الدخول.`,
            link: "/owner/dashboard", read: false, priority: "NORMAL", ticketId: v.ticketId, createdAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          v.reminderSent = true;
          reminders += 1;
          changed = true;
        }
      });
      if (changed) tx.update(s.ref, { visits, updatedAt: FieldValue.serverTimestamp() });
    });
  }
  return { scanned: subs.size, created, reminders, expired };
}

export const generatePmScheduledJobs = onSchedule(
  { region: REGION, schedule: "15 6 * * *", timeZone: "Asia/Dubai" },
  async () => { await runPmJobGeneration(); },
);
