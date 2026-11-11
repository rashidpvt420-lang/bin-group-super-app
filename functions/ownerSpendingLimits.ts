/**
 * Owner Trust Centre — owner spending limits.
 *
 * Approved owner terms (Rashid, Oct 2026; audit D-02):
 * - FIXED per-job approval limit of AED 1,000. Owners cannot set or change it. Any job above it needs
 *   the owner's prior written approval (recorded in-app via submitOwnerApprovalDecision with
 *   `confirmOverLimit`).
 * - Genuine emergency: BIN-GROUPS may spend up to AED 2,500 per event without prior approval and must
 *   tell the owner within 24 hours (the owner is notified when the emergency RFQ is opened; the
 *   deadline is recorded). Above AED 2,500 the owner's written approval is still required.
 * - Owners may still set a re-approval tolerance for quotes that rise after approval.
 * - Re-approval: when a quote on an already-approved RFQ rises above approved × (1 + tolerance%),
 *   the approval request moves to `reapproval_required` and the owner is notified (EN/AR).
 * - Emergency exception: EMERGENCY_APPROVED needs a written reason and opens an
 *   `emergency_spend_reviews` record for later Admin review.
 * The AI never approves anything here; every decision is the owner's.
 */
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const MAX_TOLERANCE_PCT = 50;
/** Fixed per-job limit (AED). Not owner-configurable. */
export const FIXED_OWNER_APPROVAL_LIMIT_AED = 1000;
/** Emergency spend allowed without prior owner approval, per event (AED). */
export const EMERGENCY_SPEND_LIMIT_AED = 2500;
/** The owner must be told about emergency spend within this many hours. */
export const EMERGENCY_OWNER_NOTIFY_HOURS = 24;

export type SpendGate = "within_fixed_limit" | "owner_written_approval_required" | "three_quotes_required" | "emergency_within_allowance";

/** Server decision for a job's spend gate (fixed AED 1,000 limit; AED 2,500 emergency allowance). */
export function spendApprovalGate(amountAed: number, emergency: boolean): { gate: SpendGate; ownerApprovalRequired: boolean; minimumQuotes: number } {
  if (emergency && amountAed <= EMERGENCY_SPEND_LIMIT_AED) return { gate: "emergency_within_allowance", ownerApprovalRequired: false, minimumQuotes: 1 };
  if (emergency) return { gate: "owner_written_approval_required", ownerApprovalRequired: true, minimumQuotes: 1 };
  if (amountAed <= FIXED_OWNER_APPROVAL_LIMIT_AED) return { gate: "within_fixed_limit", ownerApprovalRequired: false, minimumQuotes: 1 };
  if (amountAed > 1500) return { gate: "three_quotes_required", ownerApprovalRequired: true, minimumQuotes: 3 };
  return { gate: "owner_written_approval_required", ownerApprovalRequired: true, minimumQuotes: 1 };
}
export const MIN_EMERGENCY_REASON = 10;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export type Limits = { perJobLimitAed: number; tolerancePct: number } | null;

export function evaluateApproval(limits: Limits, amountAed: number | null) {
  if (!limits) return { state: "NO_LIMIT_SET" as const };
  if (amountAed === null) return { state: "AMOUNT_UNKNOWN" as const };
  return { state: amountAed > limits.perJobLimitAed ? "OVER_LIMIT" as const : "WITHIN_LIMIT" as const };
}

export function needsReapproval(approvedAed: number, newAed: number, tolerancePct: number) {
  return newAed > approvedAed * (1 + tolerancePct / 100) + 1e-9;
}

/** The per-job limit is always the fixed AED 1,000; only the owner's re-approval tolerance is read. */
export async function readLimits(db: admin.firestore.Firestore, ownerId: string): Promise<Limits> {
  const d = (await db.doc(`owner_spending_limits/${ownerId}`).get()).data();
  return { perJobLimitAed: FIXED_OWNER_APPROVAL_LIMIT_AED, tolerancePct: d && Number.isFinite(d.tolerancePct) ? d.tolerancePct : 0 };
}

export async function lowestQuoteAed(db: admin.firestore.Firestore, ownerId: string, rfqId: string) {
  if (!rfqId) return null;
  const s = await db.collection("vendor_quotes").where("rfqId", "==", rfqId).limit(20).get();
  const amounts = s.docs.map((d) => d.data()).filter((q) => q.ownerId === ownerId).map((q) => Number(q.amountAed)).filter(Number.isFinite);
  return amounts.length ? Math.min(...amounts) : null;
}

export const ownerSetSpendingLimits = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const auth = request.auth;
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Owner access only. / للمالك فقط.");
  const db = admin.firestore();
  if ((await db.doc(`users/${auth.uid}`).get()).data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  const requestedLimit = request.data?.perJobLimitAed;
  if (requestedLimit !== undefined && requestedLimit !== null && Number(requestedLimit) !== FIXED_OWNER_APPROVAL_LIMIT_AED) {
    throw new HttpsError("invalid-argument", `The per-job approval limit is fixed at AED ${FIXED_OWNER_APPROVAL_LIMIT_AED} by your agreement and cannot be changed. / حد الموافقة لكل عمل ثابت عند ${FIXED_OWNER_APPROVAL_LIMIT_AED} درهم وفق الاتفاقية ولا يمكن تغييره.`);
  }
  const tol = Number(request.data?.tolerancePct);
  if (!Number.isFinite(tol) || tol < 0 || tol > MAX_TOLERANCE_PCT) {
    throw new HttpsError("invalid-argument", `Set a tolerance from 0 to ${MAX_TOLERANCE_PCT}%. / حدد هامشاً من 0 إلى ${MAX_TOLERANCE_PCT}%.`);
  }
  const now = FieldValue.serverTimestamp();
  await db.doc(`owner_spending_limits/${auth.uid}`).set({ ownerId: auth.uid, perJobLimitAed: FIXED_OWNER_APPROVAL_LIMIT_AED, perJobLimitFixed: true, tolerancePct: Math.round(tol * 10) / 10, updatedAt: now });
  await db.collection("audit_logs").add({ action: "OWNER_SET_SPENDING_LIMITS", actorId: auth.uid, actorRole: "owner", targetOwnerId: auth.uid, targetType: "owner_spending_limits", createdAt: now });
  return { status: "SUCCESS" };
});

/** Quote increases after approval beyond the owner's tolerance send the request back to the owner. */
export const onVendorQuoteChangedCheckReapproval = onDocumentWritten({ document: "vendor_quotes/{quoteId}", region: "europe-west3" }, async (event) => {
  await checkQuoteReapproval(event.params.quoteId, event.data?.before?.data(), event.data?.after?.data());
});

export async function checkQuoteReapproval(quoteId: string, before: admin.firestore.DocumentData | undefined, after: admin.firestore.DocumentData | undefined) {
  if (!after) return;
  if (before && Number(before.amountAed) === Number(after.amountAed)) return;
  const db = admin.firestore();
  const ownerId = text(after.ownerId, 180);
  const rfqId = text(after.rfqId, 180);
  if (!ownerId || !rfqId) return;
  const approvals = await db.collection("owner_approval_requests").where("rfqId", "==", rfqId).limit(5).get();
  for (const a of approvals.docs) {
    const d = a.data();
    if (d.ownerId !== ownerId || !["owner_approved", "owner_approved_emergency"].includes(d.status) || !Number.isFinite(d.approvedAmountAed)) continue;
    const limits = await readLimits(db, ownerId);
    const newAed = Number(after.amountAed);
    if (!Number.isFinite(newAed) || !needsReapproval(d.approvedAmountAed, newAed, limits?.tolerancePct ?? 0)) continue;
    await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(a.ref)).data();
      if (!fresh || fresh.status === "reapproval_required") return;
      tx.update(a.ref, { status: "reapproval_required", reapprovalReason: { approvedAmountAed: d.approvedAmountAed, newAmountAed: newAed, quoteId }, updatedAt: FieldValue.serverTimestamp() });
      tx.create(db.collection("notifications").doc(), {
        userId: ownerId, recipientId: ownerId, recipientRole: "owner", type: "SPEND_REAPPROVAL_REQUIRED", approvalRequestId: a.id, read: false,
        title: "Re-approval needed", body: `A quote rose from AED ${d.approvedAmountAed} to AED ${newAed}, above your tolerance. Nothing proceeds until you decide.`,
        titleEn: "Re-approval needed", titleAr: "مطلوب إعادة الموافقة",
        bodyEn: `A quote rose from AED ${d.approvedAmountAed} to AED ${newAed}, above your tolerance. Nothing proceeds until you decide.`,
        bodyAr: `ارتفع عرض سعر من ${d.approvedAmountAed} إلى ${newAed} درهم، فوق الهامش المحدد. لن يتم أي إجراء حتى تقرر.`,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(db.collection("audit_logs").doc(), { action: "SPEND_REAPPROVAL_REQUIRED", actorId: "system", actorRole: "system", targetOwnerId: ownerId, targetType: "owner_approval_requests", targetId: a.id, createdAt: FieldValue.serverTimestamp() });
    });
  }
}
