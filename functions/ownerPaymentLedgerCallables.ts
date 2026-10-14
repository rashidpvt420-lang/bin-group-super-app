import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { requireMfaFinanceAdminActor } from "./financeAdminMfa";
import {
  assertChequeClearanceTransition,
  buildOwnerLedgerRow,
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
    return { next, ownerUid: text(payment.ownerUid || payment.ownerId) };
  });
  return { status: "SUCCESS", paymentId, chequeClearanceState: result.next };
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
  const invoices = await db.collection("invoices").where("ownerId", "==", ownerUid).limit(200).get();
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
  return { ownerUid, rows: visibleRows, byContract, summary: summarizeOwnerLedger(visibleRows) };
});
