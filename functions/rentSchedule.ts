/**
 * Rent schedule, due-date reminders, tenant payment decisions and receipts
 * (feature 1, owner/tenant deep audit 2026-10-21 §4).
 *
 * Data model: rent_installments/{leaseKey}_{nn}
 *   { leaseKey, unitId, propertyId, ownerId, tenantUid, tenantEmail, dueDate (YYYY-MM-DD, Dubai),
 *     amount (AED, exact to the fils), chequeNumber?, status: DUE | OVERDUE | PENDING_VERIFICATION | PAID,
 *     paymentId?, receiptPdfPath?, remindersSent: { "7d": true, ... } }
 * Written only by the server (owner/admin callable, scheduler and payment trigger).
 * Phase 1 payment policy is unchanged: Cash or Cheque only; no card payments.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { parseExactAedAmount } from "./shared/aedMoneyInput";
import { generateTenantRentReceiptPdfArtifact } from "./pdfEngine";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const upper = (value: unknown) => text(value, 120).toUpperCase();
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin", "account_manager", "finance_admin"]);
export const RENT_REMINDER_OFFSETS = [7, 1, 0, -1, -7] as const;
export const MAX_INSTALLMENTS = 12;

export function dubaiDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function reminderKeyFor(daysUntilDue: number): string | null {
  if (!(RENT_REMINDER_OFFSETS as readonly number[]).includes(daysUntilDue)) return null;
  return daysUntilDue >= 0 ? `${daysUntilDue}d` : `overdue_${-daysUntilDue}d`;
}

export function reminderCopy(daysUntilDue: number, amount: number, dueDate: string) {
  const aed = `AED ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (daysUntilDue > 1) return { title: `Rent due in ${daysUntilDue} days`, body: `${aed} is due on ${dueDate}. Pay by cash or cheque and upload the receipt in the app.`, titleAr: `الإيجار مستحق خلال ${daysUntilDue} أيام`, bodyAr: `مبلغ ${aed} مستحق بتاريخ ${dueDate}. ادفع نقدًا أو بشيك وارفع الإيصال في التطبيق.` };
  if (daysUntilDue === 1) return { title: "Rent due tomorrow", body: `${aed} is due on ${dueDate}.`, titleAr: "الإيجار مستحق غدًا", bodyAr: `مبلغ ${aed} مستحق بتاريخ ${dueDate}.` };
  if (daysUntilDue === 0) return { title: "Rent due today", body: `${aed} is due today (${dueDate}).`, titleAr: "الإيجار مستحق اليوم", bodyAr: `مبلغ ${aed} مستحق اليوم (${dueDate}).` };
  return { title: "Rent overdue", body: `${aed} was due on ${dueDate} and is ${-daysUntilDue} day(s) overdue.`, titleAr: "الإيجار متأخر", bodyAr: `مبلغ ${aed} كان مستحقًا بتاريخ ${dueDate} ومتأخر ${-daysUntilDue} يوم.` };
}

type InstallmentInput = { dueDate: string; amount: number; chequeNumber: string };

export function validateInstallments(raw: unknown): InstallmentInput[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_INSTALLMENTS) {
    throw new HttpsError("invalid-argument", `Provide 1 to ${MAX_INSTALLMENTS} installments.`);
  }
  const seen = new Set<string>();
  return raw.map((item: any, index) => {
    const dueDate = text(item?.dueDate, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`))) {
      throw new HttpsError("invalid-argument", `Installment ${index + 1}: dueDate must be YYYY-MM-DD.`);
    }
    if (seen.has(dueDate)) throw new HttpsError("invalid-argument", `Installment ${index + 1}: duplicate due date.`);
    seen.add(dueDate);
    let amount: number;
    try { amount = parseExactAedAmount(item?.amount); } catch {
      throw new HttpsError("invalid-argument", `Installment ${index + 1}: amount must be AED exact to the fils.`);
    }
    if (!(amount > 0)) throw new HttpsError("invalid-argument", `Installment ${index + 1}: amount must be positive.`);
    return { dueDate, amount, chequeNumber: text(item?.chequeNumber, 40) };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Owner (of the unit's property) or admin sets the rent schedule for the tenant bound to a unit. */
export const ownerSetRentSchedule = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = text(request.auth.token?.role || request.auth.token?.userRole, 40).toLowerCase();
  const isAdmin = ADMIN_ROLES.has(role);
  if (!isAdmin && (role !== "owner" || request.auth.token?.email_verified !== true || request.auth.token?.suspended === true)) {
    throw new HttpsError("permission-denied", "A verified owner or admin is required.");
  }
  const unitId = text(request.data?.unitId, 160);
  if (!unitId) throw new HttpsError("invalid-argument", "unitId is required.");
  const installments = validateInstallments(request.data?.installments);

  const unitSnap = await db.collection("units").doc(unitId).get();
  if (!unitSnap.exists) throw new HttpsError("not-found", "Unit not found.");
  const unit = unitSnap.data() || {};
  const propertyId = text(unit.propertyId, 160);
  const propertySnap = propertyId ? await db.collection("properties").doc(propertyId).get() : null;
  const ownerId = text(propertySnap?.data()?.ownerId || propertySnap?.data()?.ownerUid || unit.ownerId || unit.ownerUid, 160);
  if (!isAdmin && ownerId !== request.auth.uid) throw new HttpsError("permission-denied", "This unit is not on your property.");
  const tenantUid = text(unit.tenantUid || unit.tenantId || unit.currentTenantId, 160);
  if (!tenantUid) throw new HttpsError("failed-precondition", "Link a tenant to this unit before setting a rent schedule.");
  const leaseKey = text(request.data?.leaseId, 160) || `unit_${unitId}_${tenantUid}`;
  const tenantEmail = text(unit.tenantEmail, 320).toLowerCase();

  const existing = await db.collection("rent_installments").where("leaseKey", "==", leaseKey).get();
  const locked = existing.docs.filter((d) => ["PAID", "PENDING_VERIFICATION"].includes(upper(d.data().status)));
  const batch = db.batch();
  for (const d of existing.docs) if (!locked.includes(d)) batch.delete(d.ref);
  const lockedDates = new Set(locked.map((d) => text(d.data().dueDate, 10)));
  const now = FieldValue.serverTimestamp();
  const today = dubaiDateString(new Date());
  installments.forEach((item, index) => {
    if (lockedDates.has(item.dueDate)) return;
    const id = `${leaseKey}_${String(index + 1).padStart(2, "0")}_${item.dueDate}`.replace(/[^A-Za-z0-9_-]/g, "_");
    batch.set(db.collection("rent_installments").doc(id), {
      leaseKey, unitId, propertyId, ownerId, tenantUid, tenantEmail,
      dueDate: item.dueDate, amount: item.amount, currency: "AED", chequeNumber: item.chequeNumber || null,
      status: item.dueDate < today ? "OVERDUE" : "DUE",
      remindersSent: {}, createdBy: request.auth!.uid, createdAt: now, updatedAt: now,
    });
  });
  batch.set(db.collection("audit_logs").doc(), {
    action: "RENT_SCHEDULE_SET", actorId: request.auth.uid, actorRole: role, unitId, propertyId, leaseKey,
    installments: installments.length, keptLocked: locked.length, createdAt: now,
  });
  await batch.commit();
  return { status: "SUCCESS", leaseKey, installments: installments.length, keptLocked: locked.length };
});

async function notifyTenant(inst: any, id: string, key: string, copy: { title: string; body: string; titleAr: string; bodyAr: string }, type: string) {
  const tenantUid = text(inst.tenantUid, 160);
  if (tenantUid) {
    await db.collection("notifications").doc(`${type}_${id}_${key}`).set({
      userId: tenantUid, role: "tenant", type, title: copy.title, body: copy.body, titleAr: copy.titleAr, bodyAr: copy.bodyAr,
      link: "/tenant/payments", read: false, status: "PENDING", installmentId: id, unitId: inst.unitId || null,
      propertyId: inst.propertyId || null, createdAt: FieldValue.serverTimestamp(), source: "RENT_SCHEDULE",
    }, { merge: true });
  }
  const email = text(inst.tenantEmail, 320);
  if (email) {
    await db.collection("mail").doc(`${type}_${id}_${key}`).set({
      to: email, type, status: "PENDING", installmentId: id,
      message: { subject: `[BIN GROUP] ${copy.title}`, html: `<p>${copy.body}</p><p dir="rtl">${copy.bodyAr}</p>` },
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

/** Pure planner, exported for tests: which reminder (if any) an installment needs today. */
export function planReminder(inst: any, today: string): { key: string; days: number; markOverdue: boolean } | null {
  const status = upper(inst.status);
  if (status !== "DUE" && status !== "OVERDUE") return null;
  const days = daysBetween(today, text(inst.dueDate, 10));
  const key = reminderKeyFor(days);
  const markOverdue = days < 0 && status !== "OVERDUE";
  if (!key || inst.remindersSent?.[key]) return markOverdue ? { key: "", days, markOverdue } : null;
  return { key, days, markOverdue };
}

export async function runRentReminders(now = new Date()) {
  const today = dubaiDateString(now);
  const horizon = dubaiDateString(new Date(now.getTime() + 8 * 86_400_000));
  const snap = await db.collection("rent_installments").where("status", "in", ["DUE", "OVERDUE"]).where("dueDate", "<=", horizon).limit(500).get();
  let sent = 0; let overdue = 0;
  for (const doc of snap.docs) {
    const inst = doc.data();
    const plan = planReminder(inst, today);
    if (!plan) continue;
    const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (plan.markOverdue) { update.status = "OVERDUE"; overdue += 1; }
    if (plan.key) {
      await notifyTenant(inst, doc.id, plan.key, reminderCopy(plan.days, Number(inst.amount || 0), text(inst.dueDate, 10)), "RENT_DUE_REMINDER");
      update[`remindersSent.${plan.key}`] = true;
      sent += 1;
    }
    await doc.ref.update(update);
  }
  await db.collection("system_health").doc("rentReminders").set({ scanned: snap.size, sent, markedOverdue: overdue, day: today, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { scanned: snap.size, sent, overdue };
}

export const sendRentDueReminders = onSchedule({ schedule: "0 9 * * *", timeZone: "Asia/Dubai", region: "europe-west3" }, async () => {
  const r = await runRentReminders();
  console.log(`[rentReminders] scanned=${r.scanned} sent=${r.sent} overdue=${r.overdue}`);
});

function isRentPayment(p: any) {
  return ["OWNER_RENT_PAYMENT", "TENANT_RENT_PAYMENT_PROOF"].includes(upper(p?.recordType)) ||
    ["RENT_COLLECTION", "RENT_PAYMENT_PROOF"].includes(upper(p?.transactionType)) || upper(p?.paymentType) === "RENT_COLLECTION";
}

export function receiptNumberFor(paymentId: string) {
  return `BIN-RR-${crypto.createHash("sha256").update(paymentId).digest("hex").slice(0, 10).toUpperCase()}`;
}

/** On an admin rent decision: notify the tenant, settle the linked installment, issue a receipt PDF. */
export const onRentPaymentDecision = onDocumentUpdated({ document: "payment_transactions/{paymentId}", region: "europe-west3" }, async (event) => {
  const before = event.data?.before.data() || {};
  const after = event.data?.after.data() || {};
  if (!isRentPayment(after)) return;
  const was = upper(before.status); const now = upper(after.status);
  if (was === now || !["APPROVED", "REJECTED"].includes(now)) return;
  const paymentId = event.params.paymentId;
  const approved = now === "APPROVED";
  const tenantUid = text(after.tenantUid || after.tenantId, 160);
  const amount = Number(after.amountReceived || after.amount || after.rentPaid || 0);
  const installmentId = text(after.installmentId, 220);
  const receiptNumber = receiptNumberFor(paymentId);

  let receiptPdfPath: string | null = null;
  let receiptPdfUrl: string | null = null;
  if (approved) {
    try {
      const artifact = await generateTenantRentReceiptPdfArtifact({
        receiptNumber, paymentId, tenantUid, amount, method: upper(after.paymentMethod || after.method) || "-",
        reference: text(after.paymentReferenceId || after.reference, 180), tenantName: text(after.tenantName, 180),
        propertyName: text(after.propertyName, 180), unitNumber: text(after.unitNumber, 80),
        approvedOn: dubaiDateString(new Date()), verifyUrl: `https://bin-groups.com/verify?receipt=${receiptNumber}`,
      });
      receiptPdfPath = artifact.storagePath;
      receiptPdfUrl = artifact.pdfUrl;
    } catch (error) {
      console.error("[rentSchedule] receipt PDF failed", paymentId, error);
      receiptPdfPath = null;
    }
    await db.collection("rent_receipts").doc(paymentId).set({
      receiptNumber, paymentId, tenantUid: tenantUid || null, ownerId: text(after.ownerId || after.ownerUid, 160) || null,
      propertyId: after.propertyId || null, unitId: after.unitId || null, amount, currency: "AED",
      pdfPath: receiptPdfPath, pdfUrl: receiptPdfUrl, status: receiptPdfPath ? "ISSUED" : "PDF_PENDING", issuedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  if (installmentId) {
    const ref = db.collection("rent_installments").doc(installmentId);
    const snap = await ref.get();
    if (snap.exists && text(snap.data()?.tenantUid, 160) === tenantUid) {
      await ref.update(approved
        ? { status: "PAID", paymentId, receiptNumber, receiptPdfPath, receiptPdfUrl, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }
        : { status: snap.data()?.dueDate < dubaiDateString(new Date()) ? "OVERDUE" : "DUE", paymentId: null, updatedAt: FieldValue.serverTimestamp() });
    }
  }

  if (tenantUid) {
    const reason = text(after.rejectionReason || after.adminNotes, 300);
    const copy = approved
      ? { title: "Rent payment verified", body: `Your payment of AED ${amount.toFixed(2)} was verified. Receipt ${receiptNumber} is in Payments.`, titleAr: "تم التحقق من دفعة الإيجار", bodyAr: `تم التحقق من دفعتك بمبلغ ${amount.toFixed(2)} درهم. الإيصال ${receiptNumber} في صفحة المدفوعات.` }
      : { title: "Rent payment not accepted", body: `Your payment evidence was not accepted${reason ? `: ${reason}` : ""}. Please upload a new receipt.`, titleAr: "لم يتم قبول دفعة الإيجار", bodyAr: "لم يتم قبول إثبات الدفع. يرجى رفع إيصال جديد." };
    await notifyTenant({ tenantUid, tenantEmail: after.tenantEmail, unitId: after.unitId, propertyId: after.propertyId }, paymentId, now.toLowerCase(), copy, approved ? "RENT_PAYMENT_VERIFIED" : "RENT_PAYMENT_REJECTED");
  }
});
