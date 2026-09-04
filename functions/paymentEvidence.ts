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

export {
  createDesignPaymentRequest,
  getDesignPaymentInstructions,
  submitDesignOwnerDecision,
  adminReviewDesignPayment,
  adminHandoffDesignRequest,
} from './designPayments';
