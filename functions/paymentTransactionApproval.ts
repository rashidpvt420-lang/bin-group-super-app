import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { createBrokerCommissionForContract } from "./brokerCommissions";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();

const roleOf = (value: unknown) => String(value || "").trim().toLowerCase();
const upper = (value: unknown) => String(value || "").trim().toUpperCase();
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

function resolvePaymentId(data: any) {
  return String(data?.paymentId || data?.id || "").trim();
}

function isRentCollectionPayment(payment: any) {
  return upper(payment?.recordType) === "OWNER_RENT_PAYMENT" ||
    upper(payment?.transactionType) === "RENT_COLLECTION" ||
    upper(payment?.paymentType) === "RENT_COLLECTION";
}

/**
 * payment_transactions/{paymentId} docs are written by three different callables:
 * submitOwnerOnboardingPaymentPackage (doc ID === intakeId, no separate contractId),
 * submitOwnerOnboarding (contractId = `${submissionId}_contract`, distinct from intakeId),
 * and createOwnerPaymentTransaction (contractId === intakeId). contractId must win for
 * contracts/{id} and owner activation whenever it's present; intakeId stays the key for
 * intake_submissions/{id}, which is never addressed by contractId.
 */
function resolveActivationIds(paymentId: string, payment: any) {
  const intakeId = String(payment?.intakeId || "").trim();
  const contractId = String(payment?.contractId || intakeId || paymentId || "").trim();
  return { contractId, intakeId };
}

export const adminApprovePayment = onCall({ cors: true }, async (request) => {
  await requireAdmin(request.auth);

  const paymentId = resolvePaymentId(request.data);
  if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");

  const ref = db.collection("payment_transactions").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = snap.data() || {};
  if (roleOf(payment.status) === "approved") {
    return { status: "SUCCESS", paymentId, idempotent: true };
  }

  const paymentReferenceId = String(request.data?.paymentReferenceId || request.data?.referenceId || payment.paymentReference || payment.paymentReferenceId || "").trim();
  const amountReceived = Number(request.data?.amountReceived || payment.activationDeposit || payment.amount || payment.amountPaid || payment.rentPaid || 0);
  const notes = String(request.data?.notes || request.data?.internalNotes || "Approved by admin.").trim();
  const method = String(request.data?.method || payment.paymentMethod || "").trim();
  const receivedAt = String(request.data?.receivedAt || "").trim();
  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;

  if (isRentCollectionPayment(payment)) {
    await db.runTransaction(async (transaction) => {
      transaction.set(ref, {
        status: "APPROVED",
        paymentStatus: "APPROVED",
        verificationState: "ADMIN_VERIFIED",
        paymentVerified: true,
        approved: true,
        paymentReferenceId: paymentReferenceId || null,
        amountReceived,
        paymentMethod: method || payment.paymentMethod || null,
        receivedAt: receivedAt || null,
        adminNotes: notes,
        approvedBy: actorId,
        approvedByEmail: actorEmail,
        approvedAt: now,
        updatedAt: now,
      }, { merge: true });

      transaction.set(db.collection("auditLogs").doc(), {
        action: "ADMIN_APPROVE_RENT_PAYMENT",
        actorId,
        actorEmail,
        paymentId,
        ownerUid: payment.ownerUid || payment.ownerId || null,
        tenantName: payment.tenantName || null,
        propertyId: payment.propertyId || null,
        propertyName: payment.propertyName || null,
        paymentReferenceId: paymentReferenceId || null,
        amountReceived,
        createdAt: now,
      });
    });

    return {
      status: "SUCCESS",
      paymentId,
      paymentKind: "RENT_COLLECTION",
      idempotent: false,
    };
  }

  const { contractId, intakeId } = resolveActivationIds(paymentId, payment);
  const contractSnap = contractId ? await db.collection("contracts").doc(contractId).get() : null;
  const contractData = contractSnap?.data() || {};
  const ownerUid = String(request.data?.ownerUid || payment.ownerUid || payment.ownerId || "").trim();
  const batch = db.batch();

  batch.set(ref, {
    status: "APPROVED",
    verificationState: "ADMIN_VERIFIED",
    paymentReferenceId: paymentReferenceId || payment.paymentReferenceId || null,
    amountReceived,
    paymentMethod: method || payment.paymentMethod || null,
    receivedAt: receivedAt || null,
    adminNotes: notes,
    approvedBy: actorId,
    approvedByEmail: actorEmail,
    approvedAt: now,
    updatedAt: now,
  }, { merge: true });

  if (contractId) {
    const contractRef = db.collection("contracts").doc(contractId);
    batch.set(contractRef, {
      status: "ACTIVE",
      paymentStatus: "APPROVED",
      activationStatus: "ACTIVE",
      paymentVerified: true,
      dashboardUnlockApproved: true,
      paymentReferenceId: paymentReferenceId || payment.paymentReferenceId || null,
      amountReceived,
      approvedBy: actorId,
      approvedAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  if (intakeId) {
    batch.set(db.collection("intake_submissions").doc(intakeId), {
      status: "ACTIVE",
      paymentStatus: "APPROVED",
      activationState: "ACTIVE",
      updatedAt: now,
    }, { merge: true });
  }

  if (ownerUid) {
    const ownerPatch = {
      status: "active",
      paymentVerified: true,
      adminApproved: true,
      dashboardUnlocked: true,
      dashboardLocked: false,
      activeContractId: contractId || null,
      latestActivationContractId: contractId || null,
      activationStatus: "ACTIVE",
      approvedBy: actorId,
      approvedAt: now,
      updatedAt: now,
    };
    batch.set(db.collection("users").doc(ownerUid), ownerPatch, { merge: true });
    batch.set(db.collection("owners").doc(ownerUid), { ...ownerPatch, status: "ACTIVE" }, { merge: true });
  }

  batch.set(db.collection("auditLogs").doc(), {
    action: "ADMIN_APPROVE_PAYMENT",
    actorId,
    actorEmail,
    paymentId,
    contractId: contractId || null,
    intakeId: intakeId || null,
    ownerUid: ownerUid || null,
    paymentReferenceId: paymentReferenceId || null,
    amountReceived,
    createdAt: now,
  });

  if (payment.ownerEmail) {
    batch.set(db.collection("mail").doc(), {
      to: String(payment.ownerEmail).toLowerCase(),
      message: {
        from: "BIN GROUP <ceo@bin-groups.com>",
        replyTo: "BIN GROUP Admin <ceo@bin-groups.com>",
        subject: "BIN GROUP Payment Verified - Owner Dashboard Activated",
        html: `<p>Dear ${payment.signatureName || "Owner"},</p>
<p><b>Your BIN GROUP payment has been verified and your owner dashboard is now active.</b></p>
<p>You can now access your property passport, contracts, documents, tickets, tenants and financial records.</p>
<p>Support: support@bin-groups.com</p>
<p>BIN GROUP - Made in UAE 🇦🇪</p>`,
      },
      metadata: { type: "owner_payment_approved_dashboard_activated", paymentId, contractId, intakeId, ownerUid },
      createdAt: now,
    });
  }

  await batch.commit();

  if (contractId && contractData.commissionGenerated !== true) {
    try {
      const commissionResult = await createBrokerCommissionForContract(contractId, contractData, {
        amountReceived,
        annualContractValue: Number(contractData.annualContractValue || 0),
      });
      if (commissionResult) {
        await db.collection("contracts").doc(contractId).set({
          commissionGenerated: true,
          commissionId: commissionResult.commissionId,
          updatedAt: ts(),
        }, { merge: true });
      }
    } catch (commissionError) {
      console.error("Broker commission creation failed (non-fatal):", commissionError);
    }
  }

  return { status: "SUCCESS", paymentId, contractId: contractId || null, intakeId: intakeId || null, ownerUid: ownerUid || null, idempotent: false };
});

export const adminRejectPayment = onCall({ cors: true }, async (request) => {
  await requireAdmin(request.auth);

  const paymentId = resolvePaymentId(request.data);
  if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");

  const ref = db.collection("payment_transactions").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = snap.data() || {};
  const reason = String(request.data?.reason || "Rejected by admin.").trim();
  const now = ts();
  const actorId = request.auth?.uid || "admin";

  if (isRentCollectionPayment(payment)) {
    await db.runTransaction(async (transaction) => {
      transaction.set(ref, {
        status: "REJECTED",
        paymentStatus: "REJECTED",
        verificationState: "ADMIN_REJECTED",
        paymentVerified: false,
        approved: false,
        rejectionReason: reason,
        rejectedBy: actorId,
        rejectedAt: now,
        updatedAt: now,
      }, { merge: true });

      transaction.set(db.collection("auditLogs").doc(), {
        action: "ADMIN_REJECT_RENT_PAYMENT",
        actorId,
        paymentId,
        ownerUid: payment.ownerUid || payment.ownerId || null,
        tenantName: payment.tenantName || null,
        propertyId: payment.propertyId || null,
        reason,
        createdAt: now,
      });
    });

    return { status: "SUCCESS", paymentId, paymentKind: "RENT_COLLECTION", idempotent: false };
  }

  const { contractId, intakeId } = resolveActivationIds(paymentId, payment);
  const batch = db.batch();

  batch.set(ref, {
    status: "REJECTED",
    verificationState: "ADMIN_REJECTED",
    rejectionReason: reason,
    rejectedBy: actorId,
    rejectedAt: now,
    updatedAt: now,
  }, { merge: true });

  if (contractId) {
    batch.set(db.collection("contracts").doc(contractId), {
      status: "PAYMENT_REJECTED",
      paymentStatus: "REJECTED",
      activationStatus: "LOCKED_PAYMENT_REJECTED",
      paymentVerified: false,
      rejectionReason: reason,
      rejectedBy: actorId,
      rejectedAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  if (intakeId) {
    batch.set(db.collection("intake_submissions").doc(intakeId), {
      status: "payment_rejected",
      paymentStatus: "REJECTED",
      updatedAt: now,
    }, { merge: true });
  }

  batch.set(db.collection("auditLogs").doc(), {
    action: "ADMIN_REJECT_PAYMENT",
    actorId,
    paymentId,
    contractId: contractId || null,
    intakeId: intakeId || null,
    reason,
    createdAt: now,
  });

  await batch.commit();
  return { status: "SUCCESS", paymentId, idempotent: false };
});
