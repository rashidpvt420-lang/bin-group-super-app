import { FieldValue } from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function text(value: unknown, max = 300) {
  return String(value || "").trim().slice(0, max);
}

function safeId(value: unknown, label: string) {
  const valueText = text(value, 180);
  if (!valueText || !/^[A-Za-z0-9_-]+$/.test(valueText)) {
    throw new HttpsError("invalid-argument", `${label} is invalid.`);
  }
  return valueText;
}

function roleOf(auth: any) {
  return text(
    auth?.token?.role ||
    auth?.token?.userRole ||
    auth?.token?.primaryRole,
    80,
  ).toLowerCase();
}

function positiveMoney(value: unknown, label: string) {
  const amount = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
    throw new HttpsError("invalid-argument", `${label} must be a positive AED amount.`);
  }
  return amount;
}

async function assertStoredTenantReceipt(
  tenantId: string,
  receiptPath: string,
  receiptHash: string,
) {
  try {
    const [metadata] = await admin.storage().bucket().file(receiptPath).getMetadata();
    const customMetadata = (metadata.metadata || {}) as Record<string, string>;
    const contentType = text(metadata.contentType, 120).toLowerCase();
    const size = Number(metadata.size || 0);
    if (
      customMetadata.tenantId !== tenantId ||
      text(customMetadata.receiptHash, 128).toLowerCase() !== receiptHash ||
      (!contentType.startsWith("image/") && contentType !== "application/pdf") ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > 10 * 1024 * 1024
    ) {
      throw new Error("receipt metadata mismatch");
    }
  } catch {
    throw new HttpsError(
      "failed-precondition",
      "The uploaded receipt could not be verified against tenant-owned Storage evidence.",
    );
  }
}

export const submitTenantPaymentProof = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Tenant login required.");
    if (roleOf(request.auth) !== "tenant") {
      throw new HttpsError("permission-denied", "Only a tenant can submit tenant payment evidence.");
    }

    const tenantId = request.auth.uid;
    const submissionId = safeId(request.data?.submissionId, "submissionId");
    const amount = positiveMoney(request.data?.amount, "Payment amount");
    const reference = text(request.data?.reference, 180);
    const bankName = text(request.data?.bankName, 180);
    const period = text(request.data?.period, 120);
    const notes = text(request.data?.notes, 1000);
    const receiptUrl = text(request.data?.receiptUrl, 2000);
    const receiptPath = text(request.data?.receiptPath, 500);
    const receiptHash = text(request.data?.receiptHash, 128).toLowerCase();
    if (
      reference.length < 4 ||
      !receiptUrl.startsWith("https://") ||
      !receiptPath.startsWith(`receipts/${tenantId}/`) ||
      !/^[a-f0-9]{64}$/.test(receiptHash)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "A tenant-scoped receipt, transfer reference, and SHA-256 receipt hash are required.",
      );
    }

    await assertStoredTenantReceipt(tenantId, receiptPath, receiptHash);

    const profileSnap = await db.collection("users").doc(tenantId).get();
    const profile = profileSnap.data() || {};
    const propertyId = text(profile.propertyId, 160);
    const unitId = text(profile.unitId, 160);
    if (
      !profileSnap.exists ||
      text(profile.status, 60).toLowerCase() !== "active" ||
      !propertyId ||
      !unitId
    ) {
      throw new HttpsError("failed-precondition", "Tenant must be bound to a property and unit before submitting rent evidence.");
    }
    const unitSnap = await db.collection("units").doc(unitId).get();
    const unit = unitSnap.data() || {};
    const unitTenantId = text(unit.tenantUid || unit.tenantId || unit.userId, 160);
    if (
      !unitSnap.exists ||
      text(unit.propertyId, 160) !== propertyId ||
      unitTenantId !== tenantId
    ) {
      throw new HttpsError("failed-precondition", "Tenant unit ownership could not be verified.");
    }

    const paymentId = `tenant_${tenantId}_${submissionId}`;
    const paymentRef = db.collection("payment_transactions").doc(paymentId);
    const auditRef = db.collection("auditLogs").doc(`tenant_payment_${tenantId}_${submissionId}`);
    const now = FieldValue.serverTimestamp();
    const idempotent = await db.runTransaction(async (transaction) => {
      const existingSnap = await transaction.get(paymentRef);
      if (existingSnap.exists) {
        const existing = existingSnap.data() || {};
        if (
          existing.tenantId !== tenantId ||
          Number(existing.amount || 0) !== amount ||
          text(existing.reference, 180) !== reference ||
          text(existing.receiptHash, 128) !== receiptHash
        ) {
          throw new HttpsError("already-exists", "This submission ID is already bound to different evidence.");
        }
        return true;
      }

      transaction.create(paymentRef, {
        paymentId,
        recordType: "TENANT_RENT_PAYMENT_PROOF",
        transactionType: "RENT_PAYMENT_PROOF",
        tenantId,
        tenantUid: tenantId,
        payerId: tenantId,
        userId: tenantId,
        tenantEmail: text(request.auth?.token?.email, 320).toLowerCase(),
        tenantName: text(profile.displayName || profile.name, 180),
        propertyId,
        unitId,
        ownerId: text(unit.ownerId || unit.ownerUid || profile.ownerId || profile.ownerUid, 160) || null,
        amount,
        currency: "AED",
        reference,
        bankName,
        period,
        notes,
        receiptUrl,
        receiptPath,
        receiptHash,
        status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
        paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
        verificationState: "ADMIN_VERIFICATION_REQUIRED",
        paymentVerified: false,
        approved: false,
        transferDestination: "OWNER_DIRECT_IBAN",
        binGroupFundsCustody: false,
        submittedByTenant: true,
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(auditRef, {
        action: "TENANT_PAYMENT_PROOF_SUBMITTED",
        actorId: tenantId,
        actorRole: "tenant",
        paymentId,
        propertyId,
        unitId,
        amount,
        currency: "AED",
        createdAt: now,
      });
      return false;
    });

    return { ok: true, paymentId, idempotent };
  },
);

export const createDesignPaymentRequest = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Login required.");
    const payerRole = roleOf(request.auth);
    if (!["owner", "tenant"].includes(payerRole)) {
      throw new HttpsError("permission-denied", "Only the approved owner or tenant payer can request design payment.");
    }
    const designRequestId = safeId(request.data?.designRequestId, "designRequestId");
    const designRef = db.collection("design_requests").doc(designRequestId);
    const paymentRef = db.collection("payment_transactions").doc(`design_${designRequestId}`);
    const now = FieldValue.serverTimestamp();

    const idempotent = await db.runTransaction(async (transaction) => {
      const [designSnap, paymentSnap] = await Promise.all([
        transaction.get(designRef),
        transaction.get(paymentRef),
      ]);
      if (!designSnap.exists) throw new HttpsError("not-found", "Design request not found.");
      const design = designSnap.data() || {};
      const participants = new Set([
        text(design.userId, 160),
        text(design.payerId, 160),
        text(design.ownerId, 160),
        text(design.tenantId, 160),
      ].filter(Boolean));
      if (!participants.has(request.auth!.uid)) {
        throw new HttpsError("permission-denied", "This design request belongs to another account.");
      }
      const designStatus = text(design.status, 80).toUpperCase();
      if (![
        "OWNER_APPROVED_TENANT_TO_PAY",
        "OWNER_APPROVED_OWNER_TO_PAY",
        "DEPOSIT_PENDING",
        "AI_CONCEPT_READY",
        "PAYMENT_PENDING",
      ].includes(designStatus)) {
        throw new HttpsError("failed-precondition", "The design request is not approved for payment.");
      }
      const finalTotal = positiveMoney(
        design.quote?.finalTotal ||
        design.quotedAmount ||
        design.totalAmount,
        "Approved design quote",
      );
      const amount = Math.round(finalTotal * 0.15 * 100) / 100;
      if (paymentSnap.exists) {
        const payment = paymentSnap.data() || {};
        if (payment.payerId !== request.auth!.uid || Number(payment.amount || 0) !== amount) {
          throw new HttpsError("already-exists", "Design payment request is bound to different evidence.");
        }
        return true;
      }

      transaction.create(paymentRef, {
        paymentId: paymentRef.id,
        type: "DESIGN_STUDIO_EXECUTION",
        source: "AI_DESIGN_STUDIO",
        designRequestId,
        propertyId: design.propertyId || null,
        propertyName: design.propertyName || null,
        ownerId: design.ownerId || null,
        tenantId: design.tenantId || null,
        payerId: request.auth!.uid,
        payerRole,
        userId: request.auth!.uid,
        amount,
        amountReceived: 0,
        currency: "AED",
        status: "PAYMENT_REQUESTED",
        paymentStatus: "PAYMENT_REQUESTED",
        verificationState: "AWAITING_STRIPE_CHECKOUT",
        paymentVerified: false,
        approved: false,
        adminApprovalRequired: false,
        quoteTotal: finalTotal,
        quoteDepositRate: 0.15,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(designRef, {
        status: "PAYMENT_PENDING",
        workflowStage: "PAYMENT_PENDING",
        paymentId: paymentRef.id,
        paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
        executionStatus: "AWAITING_PAYMENT_VERIFICATION",
        adminHandoffStatus: "PAYMENT_QUEUE",
        engineerHandoffStatus: "WAITING_PAYMENT",
        paymentRequestedAt: now,
        updatedAt: now,
      }, { merge: true });
      transaction.create(db.collection("auditLogs").doc(`design_payment_${designRequestId}`), {
        action: "DESIGN_PAYMENT_REQUEST_CREATED",
        actorId: request.auth!.uid,
        actorRole: payerRole,
        designRequestId,
        paymentId: paymentRef.id,
        amount,
        currency: "AED",
        createdAt: now,
      });
      return false;
    });

    return { ok: true, paymentId: paymentRef.id, idempotent };
  },
);
