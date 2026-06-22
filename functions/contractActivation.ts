import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { createBrokerCommissionForContract } from "./brokerCommissions";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => admin.firestore.FieldValue.serverTimestamp();

const roleOf = (value: unknown) => String(value || "").trim().toLowerCase();
const ADMIN_ROLES = new Set(["admin", "ceo", "super_admin", "manager", "operations_admin", "finance_admin"]);

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const claims = auth.token || {};
  if (claims.admin === true || claims.isAdmin === true || ADMIN_ROLES.has(roleOf(claims.role))) return;

  const profile = await db.collection("users").doc(auth.uid).get();
  const data = profile.data() || {};
  if (data.isAdmin === true || data.admin === true || ADMIN_ROLES.has(roleOf(data.role))) return;

  throw new HttpsError("permission-denied", "Admin permission required.");
}

async function findOwnerUid(contract: FirebaseFirestore.DocumentData) {
  const direct = String(contract.ownerId || contract.ownerUid || contract.userId || contract.createdBy || "").trim();
  if (direct) return direct;

  const email = String(contract.ownerEmail || "").trim().toLowerCase();
  if (!email) return "";
  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  return snap.docs[0]?.id || "";
}

export const adminApproveContractActivation = onCall({ cors: true }, async (request) => {
  await requireAdmin(request.auth);

  const contractId = String(request.data?.contractId || "").trim();
  if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");

  const ref = db.collection("contracts").doc(contractId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Contract not found.");

  const contract = snap.data() || {};
  const ownerUid = await findOwnerUid(contract);
  if (!ownerUid) throw new HttpsError("failed-precondition", "Owner profile could not be resolved.");

  const amountReceived = Number(request.data?.amountReceived || contract.mobilizationAmount || contract.amount || 0);
  const paymentReferenceId = String(request.data?.paymentReferenceId || request.data?.referenceId || "").trim();
  if (!paymentReferenceId) throw new HttpsError("invalid-argument", "paymentReferenceId is required.");

  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;
  const batch = db.batch();

  batch.set(ref, {
    status: "ACTIVE",
    paymentStatus: "APPROVED",
    activationStatus: "ACTIVE",
    paymentVerified: true,
    approved: true,
    dashboardUnlockApproved: true,
    approvedBy: actorId,
    approvedByEmail: actorEmail,
    approvedAt: now,
    activatedAt: now,
    paymentReferenceId,
    amountReceived,
    adminPaymentNotes: String(request.data?.notes || "Approved by admin.").trim(),
    updatedAt: now,
  }, { merge: true });

  const ownerPatch = {
    status: "active",
    paymentVerified: true,
    adminApproved: true,
    dashboardUnlocked: true,
    dashboardLocked: false,
    activeContractId: contractId,
    latestActivationContractId: contractId,
    activationStatus: "ACTIVE",
    approvedBy: actorId,
    approvedAt: now,
    updatedAt: now,
  };

  batch.set(db.collection("users").doc(ownerUid), ownerPatch, { merge: true });
  batch.set(db.collection("owners").doc(ownerUid), { ...ownerPatch, status: "ACTIVE" }, { merge: true });

  if (contract.intakeId) {
    batch.set(db.collection("intake_submissions").doc(String(contract.intakeId)), {
      paymentStatus: "APPROVED",
      activationState: "ACTIVE",
      status: "ACTIVE",
      updatedAt: now,
    }, { merge: true });
  }

  batch.set(db.collection("auditLogs").doc(), {
    action: "ADMIN_APPROVE_CONTRACT_ACTIVATION",
    actorId,
    actorEmail,
    contractId,
    ownerUid,
    ownerEmail: contract.ownerEmail || null,
    paymentReferenceId,
    amountReceived,
    createdAt: now,
  });

  await batch.commit();

  // Generate the broker commission record for this deal (if a broker is attached),
  // exactly once. Non-fatal: a commission failure must never block owner activation.
  if (contract.commissionGenerated !== true) {
    try {
      const commissionResult = await createBrokerCommissionForContract(contractId, contract, {
        amountReceived,
        annualContractValue: Number(request.data?.annualContractValue || contract.annualContractValue || 0),
      });
      if (commissionResult) {
        await ref.set({
          commissionGenerated: true,
          commissionId: commissionResult.commissionId,
          updatedAt: ts(),
        }, { merge: true });
      }
    } catch (commissionError) {
      console.error("Broker commission creation failed (non-fatal):", commissionError);
    }
  }

  return { status: "SUCCESS", contractId, ownerUid };
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
  if (ownerUid && ownerUid !== request.auth.uid && contractEmail !== requesterEmail) {
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

  const method = String(request.data?.method || "BANK_TRANSFER").trim().toUpperCase();
  const provider = String(request.data?.provider || "MANUAL").trim().toUpperCase();
  const amount = Number(request.data?.amount || request.data?.mobilizationAmount || 0);
  const currency = String(request.data?.currency || "AED").trim().toUpperCase();
  const reference = String(request.data?.reference || request.data?.paymentReferenceId || "").trim();
  const paymentReferenceId = String(request.data?.paymentReferenceId || reference || `OWNER_PORTAL_${Date.now()}`).trim();
  const annualContractValue = Number(request.data?.annualContractValue || contract.annualContractValue || 0);
  const mobilizationAmount = Number(request.data?.mobilizationAmount || amount || 0);
  const paymentPlan = String(request.data?.paymentPlan || "").trim();
  const amountSource = String(request.data?.amountSource || "").trim();
  const commercialScheduleLocked = Boolean(request.data?.commercialScheduleLocked);

  const now = ts();
  const paymentRef = db.collection("payment_transactions").doc();
  const batch = db.batch();

  batch.set(paymentRef, {
    contractId,
    intakeId: contractId,
    ownerUid: request.auth.uid,
    ownerId: ownerUid || request.auth.uid,
    ownerEmail: contractEmail || requesterEmail,
    method,
    provider,
    amount,
    currency,
    reference,
    paymentReferenceId,
    annualContractValue,
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

  batch.set(ref, {
    paymentId: paymentRef.id,
    paymentStatus: "PENDING_VERIFICATION",
    status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    paymentMethod: method,
    provider,
    amountReceived: amount,
    paymentReferenceId,
    mobilizationAmount,
    annualContractValue: annualContractValue || contract.annualContractValue,
    paymentSubmittedAt: now,
    updatedAt: now,
  }, { merge: true });

  batch.set(db.collection("auditLogs").doc(), {
    action: "OWNER_CREATE_PAYMENT_TRANSACTION",
    actorId: request.auth.uid,
    actorRole: "owner",
    contractId,
    paymentId: paymentRef.id,
    amount,
    method,
    createdAt: now,
  });

  await batch.commit();

  return { paymentId: paymentRef.id, amountPendingAdminConfirmation: amount <= 0, idempotent: false };
});

export const adminRejectContractActivation = onCall({ cors: true }, async (request) => {
  await requireAdmin(request.auth);

  const contractId = String(request.data?.contractId || "").trim();
  if (!contractId) throw new HttpsError("invalid-argument", "contractId is required.");

  const ref = db.collection("contracts").doc(contractId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Contract not found.");

  const reason = String(request.data?.reason || "Rejected by admin.").trim();
  const now = ts();
  await ref.set({
    status: "PAYMENT_REJECTED",
    paymentStatus: "REJECTED",
    activationStatus: "LOCKED_PAYMENT_REJECTED",
    paymentVerified: false,
    rejectionReason: reason,
    rejectedBy: request.auth?.uid || "admin",
    rejectedAt: now,
    updatedAt: now,
  }, { merge: true });

  await db.collection("auditLogs").add({
    action: "ADMIN_REJECT_CONTRACT_ACTIVATION",
    actorId: request.auth?.uid || "admin",
    contractId,
    reason,
    createdAt: now,
  });

  return { status: "SUCCESS", contractId };
});
