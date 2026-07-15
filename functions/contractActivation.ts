import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

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

export const createOwnerPaymentTransaction = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");

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

  if (contract.paymentVerified === true) {
    return { paymentId: contract.paymentId || contractId, amountPendingAdminConfirmation: false, idempotent: true };
  }
  if (roleOf(contract.paymentStatus) === "pending_verification" || roleOf(contract.status) === "pending_admin_payment_verification") {
    return {
      paymentId: contract.paymentId || contractId,
      amountPendingAdminConfirmation: Number(contract.amountReceived || contract.mobilizationAmount || 0) <= 0,
      idempotent: true,
    };
  }

  const signed = SIGNED_AWAITING_PAYMENT_STATUSES.has(roleOf(contract.status)) || contract.ownerSigned === true || contract.signatureState?.ownerSigned === true;
  if (!signed) throw new HttpsError("failed-precondition", "Contract must be signed before submitting a payment verification request.");
  if (!String(contract.otpVerificationId || "").trim()) {
    throw new HttpsError("failed-precondition", "Verified contract OTP evidence is required before payment submission.");
  }

  const method = String(request.data?.method || "BANK_TRANSFER").trim().toUpperCase();
  const provider = String(request.data?.provider || "MANUAL").trim().toUpperCase();
  const currency = String(request.data?.currency || "AED").trim().toUpperCase();
  if (!["BANK_TRANSFER", "CHEQUE", "CASH"].includes(method) || provider !== "MANUAL") {
    throw new HttpsError("invalid-argument", "This endpoint accepts manual bank transfer, cheque, or cash evidence only.");
  }
  if (currency !== "AED") throw new HttpsError("invalid-argument", "Owner activation payments must use AED.");
  const reference = String(request.data?.reference || request.data?.paymentReferenceId || "").trim();
  const paymentReferenceId = String(request.data?.paymentReferenceId || reference).trim();
  const paymentProofUrl = String(request.data?.paymentProofUrl || "").trim();
  const paymentProofPath = String(request.data?.paymentProofPath || "").trim();
  const paymentProofName = String(request.data?.paymentProofName || "").trim().slice(0, 180);
  const expectedProofPrefix = `payment-references/owners/${request.auth.uid}/${contractId}/`;
  if (
    paymentReferenceId.length < 4 ||
    !paymentProofUrl.startsWith("https://") ||
    !paymentProofPath.startsWith(expectedProofPrefix)
  ) {
    throw new HttpsError("failed-precondition", "A bank reference and owner-scoped uploaded payment receipt are required.");
  }
  const intakeId = String(contract.intakeId || "").trim();
  const paymentId = String(contract.paymentId || intakeId).trim();
  if (!intakeId || !paymentId || !String(contract.quoteHash || "").trim()) {
    throw new HttpsError(
      "failed-precondition",
      "This contract predates the locked quote workflow and must be migrated by an administrator before payment submission.",
    );
  }
  const annualContractValue = Number(contract.quoteSnapshot?.annualContractValue || contract.annualContractValue || 0);
  const mobilizationAmount = Number(
    contract.quoteSnapshot?.activationDeposit ||
    contract.activationDeposit ||
    contract.mobilizationAmount ||
    (annualContractValue > 0 ? Math.round(annualContractValue * 0.15) : 0),
  );
  if (!Number.isFinite(annualContractValue) || annualContractValue <= 0 || !Number.isFinite(mobilizationAmount) || mobilizationAmount <= 0) {
    throw new HttpsError("failed-precondition", "The contract has no locked server payment schedule.");
  }
  const submittedAmount = Number(request.data?.amount || request.data?.mobilizationAmount || mobilizationAmount);
  if (!Number.isFinite(submittedAmount) || Math.abs(submittedAmount - mobilizationAmount) > 0.01) {
    throw new HttpsError("failed-precondition", "Submitted amount does not match the locked 15% mobilization deposit.");
  }
  const amount = mobilizationAmount;
  const paymentPlan = String(contract.paymentPlan || contract.quoteSnapshot?.paymentPlan || "").trim();
  const amountSource = "LOCKED_CONTRACT_SCHEDULE";
  const commercialScheduleLocked = true;

  const now = ts();
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const idempotent = await db.runTransaction(async (transaction) => {
    const [freshContractSnap, paymentSnap] = await Promise.all([
      transaction.get(ref),
      transaction.get(paymentRef),
    ]);
    if (!freshContractSnap.exists) throw new HttpsError("not-found", "Contract not found.");
    const freshContract = freshContractSnap.data() || {};
    if (
      String(freshContract.ownerId || freshContract.ownerUid || "").trim() !== request.auth?.uid ||
      String(freshContract.quoteHash || "").trim() !== String(contract.quoteHash || "").trim() ||
      String(freshContract.intakeId || "").trim() !== intakeId
    ) {
      throw new HttpsError("aborted", "Contract ownership or quote evidence changed during payment submission.");
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
          rejectionReason: FieldValue.delete(),
          rejectedAt: FieldValue.delete(),
          rejectedBy: FieldValue.delete(),
          paymentSubmittedAt: now,
          updatedAt: now,
        }, { merge: true });
        transaction.set(db.collection("auditLogs").doc(`owner_payment_request_${paymentId}`), {
          action: "OWNER_RESUBMIT_PAYMENT_TRANSACTION",
          actorId: request.auth?.uid,
          actorRole: "owner",
          contractId,
          paymentId,
          amount,
          method,
          paymentProofPath,
          updatedAt: now,
        }, { merge: true });
        return false;
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
      amountReceived: amount,
      paymentReferenceId,
      paymentProofUrl,
      paymentProofPath,
      mobilizationAmount,
      annualContractValue,
      paymentSubmittedAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.collection("auditLogs").doc(`owner_payment_request_${paymentId}`), {
      action: "OWNER_CREATE_PAYMENT_TRANSACTION",
      actorId: request.auth?.uid,
      actorRole: "owner",
      contractId,
      paymentId,
      amount,
      method,
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
