/**
 * Post-dated cheque (PDC) register (gap audit 2026-11-01, item 4).
 * Cheques come from rent_installments that carry a chequeNumber. Finance (admin + MFA) records the bank
 * outcome of each cheque — DEPOSITED, CLEARED, BOUNCED or REPLACED — in pdc_cheques/{installmentId}
 * with a full history, audit row, and an EN/AR owner notice on a bounce. Owners read a register of
 * their own cheques with maturity buckets. This register never marks rent as paid and never changes
 * the installment: rent is still settled only through the verified payment flow. No bank or
 * government integration; statuses are what finance records from the bank statement.
 */
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { requireMfaFinanceAdminActor } from "./financeAdminMfa";

if (!admin.apps.length) admin.initializeApp();
const text = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);
export const PDC_STATUSES = ["DEPOSITED", "CLEARED", "BOUNCED", "REPLACED"] as const;
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin", "operations_admin"]);
const ALLOWED_FROM: Record<string, string[]> = {
  PENDING: ["DEPOSITED", "REPLACED"],
  DEPOSITED: ["CLEARED", "BOUNCED"],
  BOUNCED: ["DEPOSITED", "REPLACED"],
  CLEARED: [],
  REPLACED: [],
};

export function dubaiToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function maturityBucket(dueDate: string, today: string) {
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days)) return "UNKNOWN";
  if (days < 0) return "PAST_DUE";
  if (days <= 7) return "THIS_WEEK";
  if (days <= 30) return "THIS_MONTH";
  if (days <= 90) return "NEXT_90_DAYS";
  return "LATER";
}

export const financeRecordPdcStatus = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const actor = await requireMfaFinanceAdminActor(request);
  const installmentId = text(request.data?.installmentId, 160);
  const status = text(request.data?.status, 20).toUpperCase();
  const note = text(request.data?.note, 500);
  const bounceReason = text(request.data?.bounceReason, 200);
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(installmentId)) throw new HttpsError("invalid-argument", "installmentId is required.");
  if (!(PDC_STATUSES as readonly string[]).includes(status)) throw new HttpsError("invalid-argument", "Unsupported cheque status.");
  if (status === "BOUNCED" && bounceReason.length < 3) throw new HttpsError("invalid-argument", "A bounce reason from the bank is required.");
  const db = admin.firestore();
  const instRef = db.collection("rent_installments").doc(installmentId);
  const pdcRef = db.collection("pdc_cheques").doc(installmentId);
  return db.runTransaction(async (tx) => {
    const [inst, pdc] = await Promise.all([tx.get(instRef), tx.get(pdcRef)]);
    if (!inst.exists) throw new HttpsError("not-found", "Installment not found.");
    const i = inst.data() || {};
    const chequeNumber = text(i.chequeNumber, 40);
    if (!chequeNumber) throw new HttpsError("failed-precondition", "This installment has no cheque on record.");
    const current = text(pdc.data()?.status, 20).toUpperCase() || "PENDING";
    if (!(ALLOWED_FROM[current] || []).includes(status)) throw new HttpsError("failed-precondition", `A ${current} cheque cannot move to ${status}.`);
    const now = FieldValue.serverTimestamp();
    const entry = { status, note, bounceReason: status === "BOUNCED" ? bounceReason : "", by: actor.uid, at: new Date().toISOString() };
    tx.set(pdcRef, {
      installmentId, chequeNumber, amount: Number(i.amount || 0), dueDate: text(i.dueDate, 10),
      ownerId: text(i.ownerId, 128), tenantUid: text(i.tenantUid, 128), propertyId: text(i.propertyId, 128), unitId: text(i.unitId, 128),
      status, bounceCount: Number(pdc.data()?.bounceCount || 0) + (status === "BOUNCED" ? 1 : 0),
      history: FieldValue.arrayUnion(entry), updatedAt: now, updatedBy: actor.uid,
      ...(pdc.exists ? {} : { createdAt: now }),
    }, { merge: true });
    tx.create(db.collection("audit_logs").doc(), {
      action: "PDC_STATUS_RECORDED", actorId: actor.uid, actorEmail: actor.email, targetType: "pdc_cheques", targetId: installmentId,
      metadata: { from: current, to: status, chequeNumberLast4: chequeNumber.slice(-4) }, createdAt: now,
    });
    if (status === "BOUNCED" && text(i.ownerId, 128)) {
      tx.set(db.collection("notifications").doc(`pdc_bounced_${installmentId}_${Date.now()}`), {
        userId: text(i.ownerId, 128), role: "owner", type: "PDC_BOUNCED", link: "/owner/financials", read: false, status: "PENDING",
        title: "A rent cheque bounced", body: `Cheque ending ${chequeNumber.slice(-4)} due ${text(i.dueDate, 10)} was returned by the bank. BIN GROUP finance will follow up with the tenant.`,
        titleAr: "تم إرجاع شيك إيجار", bodyAr: `أعاد البنك الشيك المنتهي بـ ${chequeNumber.slice(-4)} المستحق في ${text(i.dueDate, 10)}. سيتابع قسم المالية في BIN GROUP مع المستأجر.`,
        createdAt: now, source: "PDC_REGISTER",
      });
    }
    return { installmentId, status };
  });
});

export const getPdcRegister = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = text(request.auth?.token?.role || request.auth?.token?.userRole, 40).toLowerCase();
  const isAdmin = request.auth?.token?.admin === true || ADMIN_ROLES.has(role);
  if (role !== "owner" && !isAdmin) throw new HttpsError("permission-denied", "Owner access required.");
  const propertyId = text(request.data?.propertyId, 128);
  const db = admin.firestore();
  let q: FirebaseFirestore.Query = db.collection("rent_installments");
  if (!isAdmin) q = q.where("ownerId", "==", uid);
  else if (propertyId) q = q.where("propertyId", "==", propertyId);
  else throw new HttpsError("invalid-argument", "Admins must choose a property.");
  const rows = (await q.get()).docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => text(r.chequeNumber, 40) && (!propertyId || r.propertyId === propertyId));
  const pdcSnaps = rows.length ? await db.getAll(...rows.map((r) => db.collection("pdc_cheques").doc(r.id))) : [];
  const today = dubaiToday();
  const cheques = rows.map((r, idx) => {
    const p = pdcSnaps[idx]?.data() || {};
    return {
      installmentId: r.id, chequeNumber: text(r.chequeNumber, 40), amount: Number(r.amount || 0), dueDate: text(r.dueDate, 10),
      propertyId: text(r.propertyId, 128), unitId: text(r.unitId, 128), rentStatus: text(r.status, 30).toUpperCase(),
      chequeStatus: text(p.status, 20).toUpperCase() || "PENDING", bounceCount: Number(p.bounceCount || 0),
      maturity: maturityBucket(text(r.dueDate, 10), today),
    };
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { asOf: today, cheques, bounced: cheques.filter((c) => c.chequeStatus === "BOUNCED").length };
});
