import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertStoredOwnerPaymentReceipt } from "./paymentReceiptEvidence";
import {
  loadActivePaymentConfiguration,
  resolveActivePaymentConfiguration,
} from "./paymentConfiguration";
import {
  OwnerActivationPaymentPolicyError,
  resolveLockedOwnerActivationSchedule,
  resolveOwnerActivationPaymentBinding,
} from "./ownerActivationPaymentPolicy";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();

const roleOf = (value: unknown) => String(value || "").trim().toLowerCase();
const ADMIN_ROLES = new Set(["admin", "ceo", "super_admin", "manager", "operations_admin", "finance_admin"]);

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const claims = auth.token || {};
  if (claims.admin === true || claims.isAdmin === true || ADMIN_ROLES.has(roleOf(claims.role))) return;
  throw new HttpsError("permission-denied", "Admin permission required.");
}

export const adminApproveContractActivation = onCall({ cors: true }, async (request) => {
  await requireAdmin(request.auth);
  throw new HttpsError(
    "failed-precondition",
    "Legacy contract activation is disabled. Approve the bound payment transaction with adminApprovePayment.",
  );
});

const SIGNED_AWAITING_PAYMENT_STATUSES = new Set(["ready_for_activation", "owner_signed", "signed"]);

function enforceOwnerActivationPolicy<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof OwnerActivationPaymentPolicyError) {
      const invalidArgumentReasons = new Set([
        "INVALID_METHOD",
        "INVALID_PROVIDER",
        "INVALID_CURRENCY",
        "INVALID_SUBMITTED_AMOUNT",
      ]);
      throw new HttpsError(
        invalidArgumentReasons.has(error.reason) ? "invalid-argument" : "failed-precondition",
        error.message,
      );
    }
    throw error;
  }
}

export const createOwnerPaymentTransaction = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  if (request.auth.token?.email_verified !== true || request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active owner account is required.");
  }

  const contractId = String(request.data?.contractId || "").trim();
  if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");

  const ref = db.collection("contracts").doc(contractId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Contract not found.");

  const contract = snap.data() || {};
  const ownerUid = String(contract.ownerId || contract.ownerUid || "").trim();
  const requesterEmail = String(request.auth.token?.email || "").trim().toLowerCase();
  const contractEmail = String(contract.ownerEmail || "").trim().toLowerCase();
  if (!ownerUid) {
    throw new HttpsError("failed-precondition", "Contract owner binding is missing.");
  }
  if (ownerUid !== request.auth.uid || (contractEmail && contractEmail !== requesterEmail)) {
    throw new HttpsError("permission-denied", "This contract belongs to another owner.");
  }

  const signed = SIGNED_AWAITING_PAYMENT_STATUSES.has(roleOf(contract.status)) || contract.ownerSigned === true || contract.signatureState?.ownerSigned === true;
  if (!signed) throw new HttpsError("failed-precondition", "Contract must be signed before submitting a payment verification request.");
  if (!String(contract.otpVerificationId || "").trim()) {
    throw new HttpsError("failed-precondition", "Verified contract OTP evidence is required before payment submission.");
  }

  const activeConfiguration = await loadActivePaymentConfiguration();
  const policyBinding = enforceOwnerActivationPolicy(() => resolveOwnerActivationPaymentBinding(
    request.data || {},
    activeConfiguration,
  ));
  const method = policyBinding.method;
  const provider = "MANUAL";
  const currency = "AED";
  const paymentConfigVersion = activeConfiguration.version;
  const paymentConfigHash = activeConfiguration.configHash;

  const submittedAmount = request.data?.amount ?? request.data?.mobilizationAmount;
  const { annualContractValue, mobilizationAmount } = enforceOwnerActivationPolicy(
    () => resolveLockedOwnerActivationSchedule(contract, submittedAmount),
  );

  if (contract.paymentVerified === true) {
    return { paymentId: contract.paymentId || contractId, amountPendingAdminConfirmation: false, idempotent: true };
  }

  const reference = String(request.data?.reference || request.data?.paymentReferenceId || "").trim();
  const paymentReferenceId = String(request.data?.paymentReferenceId || reference).trim();
  const paymentProofUrl = String(request.data?.paymentProofUrl || "").trim();
  const paymentProofPath = String(request.data?.paymentProofPath || "").trim();
  const paymentProofHash = String(request.data?.paymentProofHash || "").trim().toLowerCase();
  const paymentProofName = String(request.data?.paymentProofName || "").trim().slice(0, 180);
  const intakeId = String(contract.intakeId || "").trim();
  const paymentId = String(contract.paymentId || intakeId).trim();
  if (
    !intakeId ||
    !paymentId ||
    !String(contract.quoteHash || "").trim() ||
    intakeId !== contractId ||
    paymentId !== contractId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This contract does not use the canonical intake/payment ID and must be migrated by an administrator before payment submission.",
    );
  }
  const expectedProofPrefix = `payment-references/owners/${request.auth.uid}/${paymentId}/`;
  if (
    paymentReferenceId.length < 4 ||
    !paymentProofUrl ||
    !paymentProofPath.startsWith(expectedProofPrefix) ||
    !/^[a-f0-9]{64}$/.test(paymentProofHash)
  ) {
    throw new HttpsError("failed-precondition", "A payment reference and owner-scoped uploaded payment receipt are required.");
  }
  const paymentProofEvidence = await assertStoredOwnerPaymentReceipt({
    ownerUid: request.auth.uid,
    paymentId,
    storagePath: paymentProofPath,
    expectedHash: paymentProofHash,
  });
  const amount = mobilizationAmount;
  const paymentPlan = String(contract.paymentPlan || contract.quoteSnapshot?.paymentPlan || "").trim();
  const amountSource = "LOCKED_CONTRACT_SCHEDULE";
  const commercialScheduleLocked = true;

  const now = ts();
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const paymentConfigurationRef = db.collection("system_payment_config").doc("current");
  const idempotent = await db.runTransaction(async (transaction) => {
    const [freshContractSnap, paymentSnap, paymentConfigurationSnap] = await Promise.all([
      transaction.get(ref),
      transaction.get(paymentRef),
      transaction.get(paymentConfigurationRef),
    ]);
    if (!freshContractSnap.exists) throw new HttpsError("not-found", "Contract not found.");
    if (!paymentConfigurationSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Corporate payment instructions are not configured. Manual payment methods are disabled.",
      );
    }
    const freshContract = freshContractSnap.data() || {};
    if (
      String(freshContract.ownerId || freshContract.ownerUid || "").trim() !== request.auth?.uid ||
      String(freshContract.quoteHash || "").trim() !== String(contract.quoteHash || "").trim() ||
      String(freshContract.intakeId || "").trim() !== intakeId
    ) {
      throw new HttpsError("aborted", "Contract ownership or quote evidence changed during payment submission.");
    }
    const transactionalConfiguration = resolveActivePaymentConfiguration(paymentConfigurationSnap.data() || {});
    const transactionalBinding = enforceOwnerActivationPolicy(() => resolveOwnerActivationPaymentBinding(
      request.data || {},
      transactionalConfiguration,
    ));
    const transactionalSchedule = enforceOwnerActivationPolicy(
      () => resolveLockedOwnerActivationSchedule(freshContract, submittedAmount),
    );
    if (
      transactionalBinding.paymentConfigVersion !== paymentConfigVersion ||
      transactionalBinding.paymentConfigHash !== paymentConfigHash ||
      transactionalBinding.method !== method ||
      transactionalSchedule.annualContractValue !== annualContractValue ||
      transactionalSchedule.mobilizationAmount !== mobilizationAmount
    ) {
      throw new HttpsError("aborted", "The payment policy or locked schedule changed during submission. Reload and try again.");
    }
    if (paymentSnap.exists) {
      const existingPayment = paymentSnap.data() || {};
      if (
        String(existingPayment.ownerUid || existingPayment.ownerId || "").trim() !== request.auth?.uid ||
        String(existingPayment.contractId || "").trim() !== contractId ||
        String(existingPayment.quoteHash || "").trim() !== String(contract.quoteHash || "").trim()
      ) {
        throw new HttpsError("already-exists", "The canonical payment reference is bound to different evidence.");
      }
      const existingState = roleOf(
        existingPayment.status ||
        existingPayment.paymentStatus ||
        existingPayment.verificationState,
      );
      if (existingState === "rejected" || existingState === "payment_rejected") {
        transaction.set(paymentRef, {
          method,
          paymentMethod: method,
          provider,
          amount,
          activationDeposit: mobilizationAmount,
          currency,
          reference,
          paymentReferenceId,
          paymentProofUrl,
          paymentProofPath,
          paymentProofName,
          paymentProofHash: paymentProofEvidence.receiptHash,
          paymentProofGeneration: paymentProofEvidence.generation,
          paymentProofEvidence,
          paymentConfigVersion,
          paymentConfigHash,
          paymentManifest: {
            method,
            currency,
            amount,
            configVersion: paymentConfigVersion,
            configHash: paymentConfigHash,
          },
          status: "PENDING",
          paymentStatus: "PENDING",
          verificationState: "ADMIN_VERIFICATION_REQUIRED",
          rejectionReason: FieldValue.delete(),
          rejectedAt: FieldValue.delete(),
          rejectedBy: FieldValue.delete(),
          resubmittedAt: now,
          updatedAt: now,
        }, { merge: true });
        transaction.set(ref, {
          paymentId,
          paymentStatus: "PENDING_VERIFICATION",
          status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
          activationStatus: "PAYMENT_REVIEW_REQUIRED",
          paymentReferenceId,
          paymentProofUrl,
          paymentProofPath,
          paymentMethod: method,
          paymentConfigVersion,
          paymentConfigHash,
          amountReceived: amount,
          mobilizationAmount,
          annualContractValue,
          rejectionReason: FieldValue.delete(),
          rejectedAt: FieldValue.delete(),
          rejectedBy: FieldValue.delete(),
          paymentSubmittedAt: now,
          updatedAt: now,
        }, { merge: true });
        transaction.set(db.collection("audit_logs").doc(`owner_payment_request_${paymentId}`), {
          action: "OWNER_RESUBMIT_PAYMENT_TRANSACTION",
          actorId: request.auth?.uid,
          actorRole: "owner",
          contractId,
          paymentId,
          amount,
          method,
          paymentConfigVersion,
          paymentConfigHash,
          paymentProofPath,
          updatedAt: now,
        }, { merge: true });
        return false;
      }
      if (
        String(existingPayment.paymentMethod || existingPayment.method || "").trim().toUpperCase() !== method ||
        String(existingPayment.paymentConfigVersion || "").trim() !== paymentConfigVersion ||
        String(existingPayment.paymentConfigHash || "").trim() !== paymentConfigHash ||
        Number(existingPayment.amount) !== amount
      ) {
        throw new HttpsError("already-exists", "The existing payment request is bound to different policy, method, or amount evidence.");
      }
      return true;
    }

    transaction.create(paymentRef, {
      paymentId,
      contractId,
      intakeId,
      ownerUid: request.auth?.uid,
      ownerId: ownerUid,
      ownerEmail: contractEmail || requesterEmail,
      method,
      paymentMethod: method,
      provider,
      amount,
      activationDeposit: mobilizationAmount,
      currency,
      reference,
      paymentReferenceId,
      paymentProofUrl,
      paymentProofPath,
      paymentProofName,
      paymentProofHash: paymentProofEvidence.receiptHash,
      paymentProofGeneration: paymentProofEvidence.generation,
      paymentProofEvidence,
      paymentConfigVersion,
      paymentConfigHash,
      paymentManifest: {
        method,
        currency,
        amount,
        configVersion: paymentConfigVersion,
        configHash: paymentConfigHash,
      },
      annualContractValue,
      quoteSnapshot: contract.quoteSnapshot,
      quoteHash: contract.quoteHash,
      quoteVersion: contract.quoteVersion,
      otpVerificationId: contract.otpVerificationId,
      mobilizationAmount,
      paymentPlan,
      amountSource,
      commercialScheduleLocked,
      status: "PENDING",
      verificationState: "ADMIN_VERIFICATION_REQUIRED",
      source: "OWNER_PORTAL_MANUAL_VERIFICATION_BRIDGE",
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(ref, {
      paymentId,
      paymentStatus: "PENDING_VERIFICATION",
      status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
      paymentMethod: method,
      provider,
      paymentConfigVersion,
      paymentConfigHash,
      amountReceived: amount,
      paymentReferenceId,
      paymentProofUrl,
      paymentProofPath,
      mobilizationAmount,
      annualContractValue,
      paymentSubmittedAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.collection("audit_logs").doc(`owner_payment_request_${paymentId}`), {
      action: "OWNER_CREATE_PAYMENT_TRANSACTION",
      actorId: request.auth?.uid,
      actorRole: "owner",
      contractId,
      paymentId,
      amount,
      method,
      paymentConfigVersion,
      paymentConfigHash,
      paymentProofPath,
      createdAt: now,
    }, { merge: true });
    return false;
  });

  return { paymentId, amountPendingAdminConfirmation: false, idempotent };
});

export const adminRejectContractActivation = onCall({ cors: true }, async (request) => {
  await requireAdmin(request.auth);
  throw new HttpsError(
    "failed-precondition",
    "Legacy contract rejection is disabled. Reject the canonical payment transaction with adminRejectPayment.",
  );
});
