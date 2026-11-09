import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as crypto from "crypto";
import { generateOwnerPaymentReceiptPdfArtifact } from "./pdfEngine";
import { buildOwnerSuspensionNotice, decideSuspension, type SuspensionDecision } from "./ownerServiceSuspension";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { requireMfaFinanceAdminActor } from "./financeAdminMfa";
import {
  assertChequeClearanceTransition,
  buildOwnerLedgerRow,
  buildChequeBounceReversal,
  buildReturnedChequeFeeInvoice,
  chequePayerOf,
  parseOwnerChequeDetails,
  RETURNED_CHEQUE_FEE_AED,
  returnedChequeFeeInvoiceId,
  summarizeOwnerLedger,
  type OwnerLedgerRow,
} from "./ownerPaymentLedger";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown) => String(value ?? "").trim();
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin"]);

function isAdminToken(token: Record<string, any>): boolean {
  const role = text(token.role || token.userRole || token.primaryRole).toLowerCase();
  return token.suspended !== true && (ADMIN_ROLES.has(role) || token.admin === true || token.isAdmin === true ||
    token.superAdmin === true || token.super_admin === true || token.ceo === true);
}

/**
 * Finance Admin marks a recorded owner cheque as CLEARED or BOUNCED by the bank.
 * CLEARED unlocks second-Admin approval (receipt is issued on approval).
 * BOUNCED blocks approval; the Admin then rejects the evidence (adminRejectPayment) and the
 * Owner must pay again. Contract consequences follow the signed agreement and UAE law.
 */
export const adminSetOwnerChequeClearance = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  await requirePrivilegedMfaSession(request.auth);
  const actor = await requireMfaFinanceAdminActor(request);
  const paymentId = text(request.data?.paymentId);
  const clearance = text(request.data?.clearance).toUpperCase();
  const note = text(request.data?.note).slice(0, 500);
  if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(paymentRef);
    if (!snap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
    const payment = snap.data() || {};
    let next;
    try {
      next = assertChequeClearanceTransition(payment, clearance);
    } catch (error: any) {
      throw new HttpsError("failed-precondition", error?.message || "Invalid cheque clearance.");
    }
    if (next === "BOUNCED" && note.length < 4) {
      throw new HttpsError("invalid-argument", "Record the bank's return reason for a bounced cheque.");
    }
    // A bounce after the payment was accepted reopens it (tenant rent -> UNPAID; owner 15% invoice ->
    // UNPAID, activation left for Admin review). Receipts are marked REVERSED, never deleted.
    const reversal = next === "BOUNCED"
      ? buildChequeBounceReversal(payment, { actorUid: actor.uid, bankReason: note, atIso: new Date().toISOString() })
      : null;
    let invoiceRef: FirebaseFirestore.DocumentReference | null = null;
    let invoiceAmount = 0;
    if (reversal?.invoicePatch) {
      const invoiceQuery = await transaction.get(db.collection("invoices").where("paymentId", "==", paymentId).limit(5));
      const mobilization = invoiceQuery.docs.find((doc) => text(doc.data()?.feeType).toUpperCase() === "MOBILIZATION_DEPOSIT");
      if (!mobilization) throw new HttpsError("failed-precondition", "The verified mobilisation invoice for this cheque was not found.");
      invoiceRef = mobilization.ref;
      invoiceAmount = Number(mobilization.data()?.amount || 0);
    }
    if (reversal) {
      transaction.set(paymentRef, { ...reversal.paymentPatch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (invoiceRef && reversal.invoicePatch) {
        transaction.set(invoiceRef, { ...reversal.invoicePatch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      if (reversal.reversesVerifiedPayment) {
        transaction.set(db.collection("audit_logs").doc(), {
          actorId: actor.uid,
          actorRole: "admin",
          action: reversal.payerType === "TENANT" ? "TENANT_RENT_PAYMENT_REVERSED_CHEQUE_RETURNED" : "OWNER_MOBILISATION_PAYMENT_REVERSED_CHEQUE_RETURNED",
          targetType: "payment_transactions",
          targetId: paymentId,
          metadata: { ...reversal.auditMetadata, invoiceId: invoiceRef?.id || null, chequeDetails: payment.chequeDetails || payment.cheque || null },
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }
    let feeInvoiceId: string | null = null;
    if (next === "BOUNCED") {
      // Approved: AED 500 returned-cheque fee per bounced cheque, owner or tenant, on top of the unpaid amount.
      const payer = chequePayerOf(payment);
      let fee;
      try {
        fee = buildReturnedChequeFeeInvoice({ paymentId, ...payer, contractId: text(payment.contractId) || null, chequeDetails: payment.chequeDetails || payment.cheque || null });
      } catch (error: any) {
        throw new HttpsError("failed-precondition", error?.message || "Cheque payer unknown.");
      }
      feeInvoiceId = returnedChequeFeeInvoiceId(paymentId);
      transaction.create(db.collection("invoices").doc(feeInvoiceId), {
        ...fee,
        issuedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: actor.uid,
      });
    }
    // Owner 15% returned after activation: written suspension notice (clause 9F, 15 days), in-app only.
    let suspensionNoticeId: string | null = null;
    if (reversal?.reversesVerifiedPayment && reversal.payerType === "OWNER" && invoiceRef && feeInvoiceId) {
      const notice = buildOwnerSuspensionNotice({
        contractId: text(payment.contractId) || paymentId,
        ownerUid: text(payment.ownerUid || payment.ownerId),
        paymentId,
        invoiceIds: [invoiceRef.id, feeInvoiceId],
        amountsAed: [invoiceAmount, RETURNED_CHEQUE_FEE_AED],
        issuedAtMs: Date.now(),
        issuedBy: actor.uid,
        bankReason: note,
      });
      suspensionNoticeId = notice.noticeId;
      transaction.create(db.collection("owner_service_suspensions").doc(notice.noticeId), { ...notice, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      writeSuspensionNotifications(transaction, notice, "NOTICE_ISSUED");
      transaction.set(db.collection("audit_logs").doc(), {
        actorId: actor.uid, actorRole: "admin", action: "OWNER_SUSPENSION_NOTICE_ISSUED",
        targetType: "owner_service_suspensions", targetId: notice.noticeId,
        metadata: { contractId: notice.contractId, ownerUid: notice.ownerUid, invoiceIds: notice.invoiceIds, totalAed: notice.totalAed, deadlineAt: notice.deadlineAt },
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.set(paymentRef, {
      chequeClearanceState: next,
      chequeClearedBy: actor.uid,
      chequeClearanceAt: FieldValue.serverTimestamp(),
      chequeClearanceNote: note || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(db.collection("audit_logs").doc(), {
      actorId: actor.uid,
      actorRole: "admin",
      action: next === "CLEARED" ? "OWNER_CHEQUE_CLEARED" : "OWNER_CHEQUE_BOUNCED",
      targetType: "payment_transactions",
      targetId: paymentId,
      metadata: { chequeDetails: payment.chequeDetails || null, note: note || null },
      createdAt: FieldValue.serverTimestamp(),
    });
    return { next, feeInvoiceId, suspensionNoticeId, reversed: Boolean(reversal?.reversesVerifiedPayment), activationReviewRequired: Boolean(reversal?.reversesVerifiedPayment && reversal.payerType === "OWNER") };
  });
  return { status: "SUCCESS", paymentId, chequeClearanceState: result.next, returnedChequeFeeInvoiceId: result.feeInvoiceId, paymentReversed: result.reversed, activationReviewRequired: result.activationReviewRequired, suspensionNoticeId: result.suspensionNoticeId };
});

/**
 * Per-contract owner payment ledger (invoices joined with their payment records).
 * Owners see only their own invoices; Admins may pass ownerUid.
 */
export const getOwnerPaymentLedger = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login required.");
  const requestedOwner = text(request.data?.ownerUid);
  const adminCaller = isAdminToken(request.auth?.token || {});
  const ownerUid = adminCaller && requestedOwner ? requestedOwner : uid;
  if (!adminCaller && requestedOwner && requestedOwner !== uid) {
    throw new HttpsError("permission-denied", "Owners can view only their own payments.");
  }
  // Owner invoices plus fees raised against this user as a tenant payer (e.g. returned-cheque fee).
  const [ownerInvoices, payerInvoices] = await Promise.all([
    db.collection("invoices").where("ownerId", "==", ownerUid).limit(200).get(),
    db.collection("invoices").where("payerUid", "==", ownerUid).limit(100).get(),
  ]);
  const seen = new Set<string>();
  const invoices = { docs: [...ownerInvoices.docs, ...payerInvoices.docs].filter((doc) => !seen.has(doc.id) && seen.add(doc.id)) };
  const paymentIds = Array.from(new Set(invoices.docs.map((doc) => text(doc.data()?.paymentId)).filter(Boolean)));
  const paymentSnaps = paymentIds.length
    ? await db.getAll(...paymentIds.map((id) => db.collection("payment_transactions").doc(id)))
    : [];
  const payments = new Map(paymentSnaps.filter((snap) => snap.exists).map((snap) => [snap.id, snap.data() || {}]));
  const now = Date.now();
  const rows: OwnerLedgerRow[] = invoices.docs.map((doc) => {
    const invoice = doc.data() || {};
    return buildOwnerLedgerRow(doc.id, invoice, payments.get(text(invoice.paymentId)) || null, now);
  });
  // Owners do not need the internal Admin uid.
  const visibleRows = adminCaller ? rows : rows.map((row) => ({ ...row, receivedByAdminUid: null }));
  const byContract: Record<string, OwnerLedgerRow[]> = {};
  for (const row of visibleRows) (byContract[row.contractId || "UNASSIGNED"] ||= []).push(row);
  const noticeSnap = await db.collection("owner_service_suspensions").where("ownerUid", "==", ownerUid).limit(20).get();
  const suspensionNotices = noticeSnap.docs.map((doc) => {
    const n = doc.data() || {};
    return { noticeId: doc.id, contractId: n.contractId, status: n.status, issuedAt: n.issuedAt, deadlineAt: n.deadlineAt, totalAed: n.totalAed, invoiceIds: n.invoiceIds, textEn: n.textEn, textAr: n.textAr, suspendedAt: n.suspendedAt || null, liftedAt: n.liftedAt || null };
  });
  return { ownerUid, rows: visibleRows, byContract, summary: summarizeOwnerLedger(visibleRows), suspensionNotices };
});

type Notice = ReturnType<typeof buildOwnerSuspensionNotice> | Record<string, any>;

/** In-app notifications only (no email/SMS): owner + admin queue. */
function writeSuspensionNotifications(transaction: FirebaseFirestore.Transaction, notice: Notice, event: "NOTICE_ISSUED" | "SUSPENDED" | "LIFTED" | "RESOLVED") {
  const titles: Record<string, { en: string; ar: string }> = {
    NOTICE_ISSUED: { en: "Written notice: payment due within 15 days", ar: "إشعار كتابي: السداد مستحق خلال 15 يوماً" },
    SUSPENDED: { en: "Services suspended for non-payment", ar: "تم تعليق الخدمات لعدم السداد" },
    LIFTED: { en: "Services restored: payment verified", ar: "تمت إعادة الخدمات: تم التحقق من السداد" },
    RESOLVED: { en: "Payment verified: suspension notice closed", ar: "تم التحقق من السداد: أُغلق إشعار التعليق" },
  };
  const title = titles[event];
  const body = event === "NOTICE_ISSUED" ? `${notice.textEn}\n${notice.textAr}` : `${title.en} / ${title.ar}`;
  const base = { type: `OWNER_SUSPENSION_${event}`, title: title.en, titleAr: title.ar, body, read: false, noticeId: notice.noticeId, contractId: notice.contractId, deadlineAt: notice.deadlineAt, link: "/owner/financials", createdAt: FieldValue.serverTimestamp() };
  transaction.set(db.collection("notifications").doc(`${notice.noticeId}_${event}_owner`), { ...base, userId: notice.ownerUid, recipientId: notice.ownerUid, toRole: "owner" });
  transaction.set(db.collection("notifications").doc(`${notice.noticeId}_${event}_admin`), { ...base, toRole: "admin", audience: "admin", ownerUid: notice.ownerUid, link: "/admin/financials/payments" });
}

/**
 * Apply the suspension decision for one notice inside a transaction. Idempotent: the decision is
 * re-derived from fresh state, and a notice in SUSPENDED/LIFTED/RESOLVED is never re-applied.
 * Contract status uses the canonical ACTIVE <-> SUSPENDED transition; the owner's user doc gets
 * serviceSuspended (the account itself is never disabled).
 */
export async function applyOwnerSuspensionDecision(noticeId: string, actor: string, nowMs: number = Date.now()): Promise<SuspensionDecision> {
  const noticeRef = db.collection("owner_service_suspensions").doc(noticeId);
  return db.runTransaction(async (transaction) => {
    const noticeSnap = await transaction.get(noticeRef);
    if (!noticeSnap.exists) return "NOOP" as SuspensionDecision;
    const notice = { noticeId, ...(noticeSnap.data() || {}) } as Record<string, any>;
    const invoiceSnaps = await Promise.all((notice.invoiceIds || []).map((id: string) => transaction.get(db.collection("invoices").doc(id))));
    const contractRef = db.collection("contracts").doc(text(notice.contractId));
    const contractSnap = await transaction.get(contractRef);
    const decision = decideSuspension(notice, invoiceSnaps.map((snap) => (snap.exists ? snap.data() || {} : null)), nowMs);
    if (decision === "WAIT" || decision === "NOOP") return decision;
    const contract = contractSnap.data() || {};
    const userRef = db.collection("users").doc(text(notice.ownerUid));
    const at = new Date(nowMs).toISOString();
    if (decision === "SUSPEND") {
      const contractWasActive = contractSnap.exists && text(contract.status).toUpperCase() === "ACTIVE";
      if (contractWasActive) {
        transaction.set(contractRef, { status: "SUSPENDED", serviceSuspended: true, serviceSuspension: { noticeId, reason: "UNPAID_AFTER_RETURNED_CHEQUE", suspendedAt: at, previousStatus: contract.status }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      transaction.set(userRef, { serviceSuspended: true, serviceSuspension: { noticeId, contractId: notice.contractId, suspendedAt: at }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(noticeRef, { status: "SUSPENDED", suspendedAt: at, contractStatusChanged: contractWasActive, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writeSuspensionNotifications(transaction, notice, "SUSPENDED");
    } else if (decision === "LIFT") {
      const suspendedByThisNotice = text(contract.serviceSuspension?.noticeId) === noticeId && text(contract.status).toUpperCase() === "SUSPENDED";
      if (suspendedByThisNotice) {
        transaction.set(contractRef, { status: text(contract.serviceSuspension?.previousStatus) || "ACTIVE", serviceSuspended: false, serviceSuspension: { ...contract.serviceSuspension, liftedAt: at }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      transaction.set(userRef, { serviceSuspended: false, serviceSuspension: { noticeId, contractId: notice.contractId, liftedAt: at }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(noticeRef, { status: "LIFTED", liftedAt: at, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writeSuspensionNotifications(transaction, notice, "LIFTED");
    } else if (decision === "RESOLVE") {
      transaction.set(noticeRef, { status: "RESOLVED", resolvedAt: at, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writeSuspensionNotifications(transaction, notice, "RESOLVED");
    }
    transaction.set(db.collection("audit_logs").doc(), {
      actorId: actor, actorRole: actor === "SYSTEM_SUSPENSION_JOB" ? "system" : "admin",
      action: `OWNER_SERVICE_${decision === "SUSPEND" ? "SUSPENDED" : decision === "LIFT" ? "SUSPENSION_LIFTED" : "SUSPENSION_NOTICE_RESOLVED"}`,
      targetType: "owner_service_suspensions", targetId: noticeId,
      metadata: { contractId: notice.contractId, ownerUid: notice.ownerUid, invoiceIds: notice.invoiceIds, deadlineAt: notice.deadlineAt, at },
      createdAt: FieldValue.serverTimestamp(),
    });
    return decision;
  });
}

/** Daily enforcement of clause 9F: suspend after 15 days if the 15% + AED 500 fee are still unpaid. */
export const enforceOwnerPaymentSuspensions = onSchedule({ schedule: "every day 06:00", timeZone: "Asia/Dubai" }, async () => {
  // Single-field equality query (no composite index); the deadline is filtered here and re-checked in the transaction.
  const open = await db.collection("owner_service_suspensions").where("status", "==", "NOTICE_ISSUED").limit(500).get();
  const nowIso = new Date().toISOString();
  for (const doc of open.docs.filter((item) => String(item.data()?.deadlineAt || "") <= nowIso)) {
    try {
      await applyOwnerSuspensionDecision(doc.id, "SYSTEM_SUSPENSION_JOB");
    } catch (error: any) {
      console.error("[OWNER_SUSPENSION] enforcement failed", doc.id, error?.message || error);
    }
  }
});

/** Finance Admin records a replacement CASH/CHEQUE payment against a reopened 15% invoice or a returned-cheque fee. */
export const adminRecordReplacementInvoicePayment = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  await requirePrivilegedMfaSession(request.auth);
  const actor = await requireMfaFinanceAdminActor(request);
  const invoiceId = text(request.data?.invoiceId);
  const method = text(request.data?.paymentMethod || request.data?.method).toUpperCase();
  const reference = text(request.data?.paymentReferenceId || request.data?.reference).slice(0, 180);
  if (!invoiceId || reference.length < 4) throw new HttpsError("invalid-argument", "invoiceId and a receipt reference are required.");
  if (!["CASH", "CHEQUE"].includes(method)) throw new HttpsError("invalid-argument", "Only CASH or CHEQUE is accepted.");
  let chequeDetails = null;
  if (method === "CHEQUE") {
    try { chequeDetails = parseOwnerChequeDetails(request.data || {}); } catch (error: any) { throw new HttpsError("invalid-argument", error?.message || "Cheque details are invalid."); }
  }
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(invoiceRef);
    if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
    const invoice = snap.data() || {};
    const reopened = text(invoice.receiptState).toUpperCase() === "REVERSED" || text(invoice.feeType).toUpperCase() === "RETURNED_CHEQUE_FEE";
    if (!reopened) throw new HttpsError("failed-precondition", "Replacement payments apply only to a reopened (returned-cheque) invoice or a returned-cheque fee.");
    if (invoice.replacementPayment) throw new HttpsError("failed-precondition", "A replacement payment is already recorded on this invoice.");
    transaction.set(invoiceRef, {
      replacementPayment: { method, chequeDetails, reference, amount: Number(invoice.amount || 0), recordedBy: actor.uid, recordedAt: new Date().toISOString(), verifiedAt: null, verifiedBy: null },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(db.collection("audit_logs").doc(), { actorId: actor.uid, actorRole: "admin", action: "RECORD_REPLACEMENT_INVOICE_PAYMENT", targetType: "invoices", targetId: invoiceId, metadata: { method, chequeDetails, reference }, createdAt: FieldValue.serverTimestamp() });
  });
  return { status: "RECORDED", invoiceId };
});

/**
 * A second Finance Admin verifies the replacement payment (cheques must be confirmed cleared).
 * Issues a new receipt (the reversed one is kept) and lifts / resolves any suspension notice.
 */
export const adminVerifyReplacementInvoicePayment = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  await requirePrivilegedMfaSession(request.auth);
  const actor = await requireMfaFinanceAdminActor(request);
  const invoiceId = text(request.data?.invoiceId);
  if (!invoiceId) throw new HttpsError("invalid-argument", "invoiceId is required.");
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  const verified = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(invoiceRef);
    if (!snap.exists) throw new HttpsError("not-found", "Invoice not found.");
    const invoice = snap.data() || {};
    const replacement = invoice.replacementPayment;
    if (!replacement) throw new HttpsError("failed-precondition", "No replacement payment is recorded on this invoice.");
    if (replacement.verifiedAt) return { invoice, replacement, idempotent: true };
    if (replacement.recordedBy === actor.uid) throw new HttpsError("permission-denied", "A different Finance Admin must verify this payment (dual control).");
    if (replacement.method === "CHEQUE" && request.data?.chequeCleared !== true) throw new HttpsError("failed-precondition", "Confirm the replacement cheque has been cleared by the bank.");
    const at = new Date().toISOString();
    const verifiedReplacement = { ...replacement, verifiedAt: at, verifiedBy: actor.uid, chequeClearanceState: replacement.method === "CHEQUE" ? "CLEARED" : null };
    transaction.set(invoiceRef, { replacementPayment: verifiedReplacement, status: "PAID", paymentStatus: "PAID", amountPaid: Number(invoice.amount || 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.collection("audit_logs").doc(), { actorId: actor.uid, actorRole: "admin", action: "VERIFY_REPLACEMENT_INVOICE_PAYMENT", targetType: "invoices", targetId: invoiceId, metadata: { method: replacement.method, reference: replacement.reference }, createdAt: FieldValue.serverTimestamp() });
    return { invoice, replacement: verifiedReplacement, idempotent: false };
  });
  if (!verified.idempotent) {
    const invoice = verified.invoice;
    const proofHash = crypto.createHash("sha256").update(JSON.stringify({ invoiceId, replacement: verified.replacement })).digest("hex");
    try {
      const receipt = await generateOwnerPaymentReceiptPdfArtifact({
        invoiceId, paymentId: `${invoiceId}-REPLACEMENT`, contractId: text(invoice.contractId) || invoiceId,
        ownerId: text(invoice.ownerId || invoice.payerUid), amount: Number(invoice.amount || 0), proofHash,
        paymentReferenceId: verified.replacement.reference, paymentMethod: verified.replacement.method,
        chequeDetails: verified.replacement.chequeDetails, chequeClearanceState: verified.replacement.chequeClearanceState, verifiedAt: verified.replacement.verifiedAt,
      });
      await invoiceRef.set({ replacementReceiptPdfUrl: receipt.pdfUrl, replacementReceiptStoragePath: receipt.storagePath, replacementReceiptPdfSha256: receipt.pdfSha256, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } catch (error: any) {
      await invoiceRef.set({ replacementReceiptError: String(error?.message || error).slice(0, 500) }, { merge: true });
    }
  }
  const notices = await db.collection("owner_service_suspensions").where("invoiceIds", "array-contains", invoiceId).limit(10).get();
  const outcomes: Record<string, SuspensionDecision> = {};
  for (const doc of notices.docs) outcomes[doc.id] = await applyOwnerSuspensionDecision(doc.id, actor.uid);
  return { status: "VERIFIED", invoiceId, idempotent: verified.idempotent, suspension: outcomes };
});
