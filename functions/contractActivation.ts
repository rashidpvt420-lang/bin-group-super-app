import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

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
  return { status: "SUCCESS", contractId, ownerUid };
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
