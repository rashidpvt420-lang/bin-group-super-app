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

function resolvePaymentId(data: any) {
  return String(data?.paymentId || data?.id || "").trim();
}

/**
 * payment_transactions/{paymentId} docs are written by submitOwnerOnboardingPaymentPackage with
 * doc ID === intakeId, and carry an `intakeId` field set to the same value - the linked
 * contracts/{intakeId} and intake_submissions/{intakeId} docs share that same ID.
 */
function resolveIntakeId(paymentId: string, payment: any) {
  return String(payment?.intakeId || paymentId || "").trim();
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

  const intakeId = resolveIntakeId(paymentId, payment);
  const ownerUid = String(request.data?.ownerUid || payment.ownerUid || payment.ownerId || "").trim();
  const paymentReferenceId = String(request.data?.paymentReferenceId || request.data?.referenceId || "").trim();
  const amountReceived = Number(request.data?.amountReceived || payment.activationDeposit || payment.amount || 0);
  const notes = String(request.data?.notes || request.data?.internalNotes || "Approved by admin.").trim();
  const method = String(request.data?.method || payment.paymentMethod || "").trim();
  const receivedAt = String(request.data?.receivedAt || "").trim();

  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;
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

  if (intakeId) {
    const contractRef = db.collection("contracts").doc(intakeId);
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
      activeContractId: intakeId || null,
      latestActivationContractId: intakeId || null,
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
      metadata: { type: "owner_payment_approved_dashboard_activated", paymentId, intakeId, ownerUid },
      createdAt: now,
    });
  }

  await batch.commit();
  return { status: "SUCCESS", paymentId, intakeId: intakeId || null, ownerUid: ownerUid || null, idempotent: false };
});

export const adminRejectPayment = onCall({ cors: true }, async (request) => {
  await requireAdmin(request.auth);

  const paymentId = resolvePaymentId(request.data);
  if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");

  const ref = db.collection("payment_transactions").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = snap.data() || {};
  const intakeId = resolveIntakeId(paymentId, payment);
  const reason = String(request.data?.reason || "Rejected by admin.").trim();
  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const batch = db.batch();

  batch.set(ref, {
    status: "REJECTED",
    verificationState: "ADMIN_REJECTED",
    rejectionReason: reason,
    rejectedBy: actorId,
    rejectedAt: now,
    updatedAt: now,
  }, { merge: true });

  if (intakeId) {
    batch.set(db.collection("contracts").doc(intakeId), {
      status: "PAYMENT_REJECTED",
      paymentStatus: "REJECTED",
      activationStatus: "LOCKED_PAYMENT_REJECTED",
      paymentVerified: false,
      rejectionReason: reason,
      rejectedBy: actorId,
      rejectedAt: now,
      updatedAt: now,
    }, { merge: true });

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
    intakeId: intakeId || null,
    reason,
    createdAt: now,
  });

  await batch.commit();
  return { status: "SUCCESS", paymentId, idempotent: false };
});
