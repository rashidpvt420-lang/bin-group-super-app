import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const upper = (value: unknown) => String(value || "").trim().toUpperCase();

function isRentPayment(payment: any) {
  return upper(payment?.recordType) === "OWNER_RENT_PAYMENT" ||
    upper(payment?.transactionType) === "RENT_COLLECTION" ||
    upper(payment?.paymentType) === "RENT_COLLECTION";
}

function ledgerStatus(payment: any) {
  const state = upper(payment?.status || payment?.paymentStatus || payment?.verificationState);
  if (payment?.paymentVerified === true || state.includes("APPROVED") || state.includes("VERIFIED")) return "PAID_VERIFIED";
  if (state.includes("REJECTED") || state.includes("DENIED")) return "PAYMENT_REJECTED";
  if (Number(payment?.balance || 0) > 0) return "PENDING_VERIFICATION_PARTIAL";
  return "PENDING_VERIFICATION";
}

export const mirrorRentPaymentToTenantLedger = onDocumentWritten("payment_transactions/{paymentId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;

  const payment = after.data() || {};
  if (!isRentPayment(payment)) return;

  const paymentId = String(event.params.paymentId || payment.paymentId || payment.paymentTransactionId || "").trim();
  if (!paymentId) return;

  const rentDue = Number(payment.rentDue || payment.amountDue || 0);
  const rentPaid = Number(payment.rentPaid || payment.amountPaid || payment.amount || payment.amountReceived || 0);
  const balance = Number.isFinite(Number(payment.balance)) ? Number(payment.balance) : Math.max(0, rentDue - rentPaid);
  const ownerId = String(payment.ownerUid || payment.ownerId || payment.userId || payment.payerId || "").trim();

  await db.collection("tenant_ledger").doc(payment.tenantLedgerId || paymentId).set({
    recordType: "OWNER_RENT_PAYMENT",
    source: "payment_transactions_mirror",
    paymentId,
    paymentTransactionId: payment.paymentTransactionId || paymentId,
    tenantLedgerId: payment.tenantLedgerId || paymentId,
    ownerId,
    ownerUid: ownerId,
    ownerEmail: payment.ownerEmail || "",
    contractId: payment.contractId || "",
    tenantName: payment.tenantName || "",
    tenantId: payment.tenantId || payment.tenantUid || "",
    tenantUid: payment.tenantUid || payment.tenantId || "",
    propertyId: payment.propertyId || "",
    propertyName: payment.propertyName || "Property",
    unitNumber: payment.unitNumber || "",
    rentDue,
    rentPaid,
    amountDue: rentDue,
    amountPaid: rentPaid,
    due: rentDue,
    paid: rentPaid,
    balance,
    status: ledgerStatus(payment),
    paymentStatus: payment.paymentStatus || payment.status || "PENDING_ADMIN_PAYMENT_VERIFICATION",
    paymentVerified: payment.paymentVerified === true,
    paymentMethod: payment.paymentMethod || "BANK_TRANSFER",
    paymentReference: payment.paymentReference || payment.paymentReferenceId || payment.referenceId || "",
    notes: payment.notes || "",
    adminNotes: payment.adminNotes || "",
    approvedBy: payment.approvedBy || null,
    approvedAt: payment.approvedAt || null,
    rejectedBy: payment.rejectedBy || null,
    rejectedAt: payment.rejectedAt || null,
    rejectionReason: payment.rejectionReason || "",
    lastPaymentDate: payment.lastPaymentDate || payment.receivedAt || new Date().toISOString(),
    createdByOwnerUid: payment.createdByOwnerUid || ownerId,
    createdAt: payment.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
});
