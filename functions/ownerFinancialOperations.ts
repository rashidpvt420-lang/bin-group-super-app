import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const text = (value: unknown, max = 300) => String(value ?? "").trim().slice(0, max);
const money = (value: unknown, label: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new HttpsError("invalid-argument", `${label} must be a valid non-negative amount.`);
  return Math.round(amount * 100) / 100;
};

export const ownerRecordRentPayment = onCall(
  { cors: true, region: "europe-west3" },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
    const role = text(request.auth.token?.role || request.auth.token?.userRole || request.auth.token?.primaryRole, 40).toLowerCase();
    if (role !== "owner") throw new HttpsError("permission-denied", "Only an owner account may record rent evidence.");

    const ownerUid = request.auth.uid;
    const propertyId = text(request.data?.propertyId, 160);
    const tenantName = text(request.data?.tenantName, 160);
    const unitNumber = text(request.data?.unitNumber, 80);
    const rentDue = money(request.data?.rentDue, "Rent due");
    const rentPaid = money(request.data?.rentPaid, "Rent paid");
    const paymentMethod = text(request.data?.paymentMethod || "BANK_TRANSFER", 60).toUpperCase();
    const paymentReference = text(request.data?.paymentReference, 180);
    const referenceFileUrl = text(request.data?.referenceFileUrl, 2000);
    const referenceFilePath = text(request.data?.referenceFilePath, 500);
    const referenceFileName = text(request.data?.referenceFileName, 180);
    const notes = text(request.data?.notes, 1000);
    const requestedRecordId = text(request.data?.paymentTransactionId || request.data?.tenantLedgerId, 180);

    if (!propertyId || !tenantName || rentPaid <= 0 || !requestedRecordId) {
      throw new HttpsError(
        "invalid-argument",
        "Property, tenant name, a positive paid amount, and a stable submission ID are required.",
      );
    }
    if (!["BANK_TRANSFER", "CARD", "CHEQUE", "CASH_MANUAL", "OTHER"].includes(paymentMethod)) {
      throw new HttpsError("invalid-argument", "Unsupported rent payment method.");
    }
    if (paymentReference.length < 4 && !referenceFileUrl) {
      throw new HttpsError("failed-precondition", "A payment reference or uploaded receipt is required.");
    }
    if (
      referenceFilePath &&
      !referenceFilePath.startsWith(`payment-references/owners/${ownerUid}/`)
    ) {
      throw new HttpsError("permission-denied", "Payment evidence path is not scoped to this owner.");
    }

    const propertyRef = db.collection("properties").doc(propertyId);
    const recordId = requestedRecordId;
    const paymentRef = db.collection("payment_transactions").doc(recordId);
    const ledgerRef = db.collection("tenant_ledger").doc(recordId);
    const auditRef = db.collection("auditLogs").doc(`owner_rent_${recordId}`);
    const now = FieldValue.serverTimestamp();
    const balance = Math.max(0, Math.round((rentDue - rentPaid) * 100) / 100);
    const status = balance > 0 ? "PARTIAL" : "PAID";

    const idempotent = await db.runTransaction(async (transaction) => {
      const [propertySnap, paymentSnap, ledgerSnap] = await Promise.all([
        transaction.get(propertyRef),
        transaction.get(paymentRef),
        transaction.get(ledgerRef),
      ]);
      if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
      const property = propertySnap.data() || {};
      if (text(property.ownerId || property.ownerUid, 160) !== ownerUid) {
        throw new HttpsError("permission-denied", "The selected property is not bound to this owner.");
      }
      if (paymentSnap.exists || ledgerSnap.exists) {
        const existing = paymentSnap.data() || ledgerSnap.data() || {};
        if (
          text(existing.ownerUid || existing.ownerId, 160) !== ownerUid ||
          text(existing.propertyId, 160) !== propertyId ||
          money(existing.rentPaid ?? existing.amountPaid ?? existing.amount, "Existing rent paid") !== rentPaid ||
          text(existing.paymentReference, 180) !== paymentReference
        ) {
          throw new HttpsError("already-exists", "Rent record ID is bound to different owner evidence.");
        }
        return true;
      }

      const shared = {
        recordType: "OWNER_RENT_PAYMENT",
        transactionType: "RENT_COLLECTION",
        paymentId: recordId,
        paymentTransactionId: recordId,
        tenantLedgerId: recordId,
        ownerId: ownerUid,
        ownerUid,
        ownerEmail: text(request.auth?.token?.email, 320).toLowerCase(),
        tenantName,
        propertyId,
        propertyName: text(property.propertyName || property.name || request.data?.propertyName || propertyId, 240),
        unitNumber,
        rentDue,
        rentPaid,
        amountDue: rentDue,
        amountPaid: rentPaid,
        amount: rentPaid,
        balance,
        status,
        paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
        verificationState: "PENDING_ADMIN_PAYMENT_VERIFICATION",
        paymentVerified: false,
        approved: false,
        contractActivated: false,
        unlocksDashboard: false,
        paymentMethod,
        paymentReference,
        referenceFileUrl,
        referenceFilePath,
        referenceFileName,
        notes,
        createdByOwnerUid: ownerUid,
        createdAt: now,
        updatedAt: now,
      };
      transaction.create(paymentRef, shared);
      transaction.create(ledgerRef, shared);
      transaction.create(auditRef, {
        action: "OWNER_RENT_PAYMENT_RECORDED",
        actorId: ownerUid,
        actorRole: "owner",
        targetType: "TENANT_LEDGER",
        targetId: recordId,
        propertyId,
        amountPaid: rentPaid,
        balance,
        createdAt: now,
      });
      return false;
    });

    return { ok: true, recordId, paymentId: recordId, ledgerId: recordId, idempotent };
  },
);
