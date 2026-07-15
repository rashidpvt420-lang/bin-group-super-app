import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { createBrokerCommissionForContract } from "./brokerCommissions";
import { assertStoredOwnerPaymentReceipt } from "./paymentReceiptEvidence";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();

const roleOf = (value: unknown) => String(value || "").trim().toLowerCase();
const upper = (value: unknown) => String(value || "").trim().toUpperCase();
const ADMIN_ROLES = new Set(["admin", "ceo", "super_admin", "operations_admin", "finance_admin"]);

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const claims = auth.token || {};
  if (claims.suspended === true) throw new HttpsError("permission-denied", "Suspended admin account.");
  const userRecord = await admin.auth().getUser(auth.uid);
  if (userRecord.disabled) throw new HttpsError("permission-denied", "Disabled admin account.");
  const role = roleOf(claims.role || claims.userRole || claims.primaryRole);
  if (
    ADMIN_ROLES.has(role) ||
    claims.superAdmin === true ||
    claims.super_admin === true ||
    claims.ceo === true ||
    (role === "" && (claims.admin === true || claims.isAdmin === true))
  ) return;
  throw new HttpsError("permission-denied", "Admin permission required.");
}

function resolvePaymentId(data: any) {
  return String(data?.paymentId || data?.id || "").trim();
}

function isRentCollectionPayment(payment: any) {
  return upper(payment?.recordType) === "OWNER_RENT_PAYMENT" ||
    upper(payment?.recordType) === "TENANT_RENT_PAYMENT_PROOF" ||
    upper(payment?.transactionType) === "RENT_COLLECTION" ||
    upper(payment?.transactionType) === "RENT_PAYMENT_PROOF" ||
    upper(payment?.paymentType) === "RENT_COLLECTION";
}

/**
 * Canonical onboarding and activation payments use the intake ID for the
 * payment, contract, and receipt path. Legacy records with divergent IDs must
 * be migrated before this approval path can activate an owner.
 */
function resolveActivationIds(paymentId: string, payment: any) {
  const intakeId = String(payment?.intakeId || "").trim();
  const contractId = String(payment?.contractId || intakeId || paymentId || "").trim();
  return { contractId, intakeId };
}

function resolveContractSignature(contract: any, payment?: any) {
  return String(
    contract?.signatureState?.ownerSignatureName ||
    contract?.signatureState?.ownerSignedName ||
    contract?.signatureName ||
    contract?.ownerSignature ||
    contract?.signature ||
    payment?.signatureName ||
    "",
  ).trim();
}

async function hasDurableOtpSignatureEvidence(
  verificationId: string,
  ownerUid: string,
  contractId: string,
  signature: string,
  contractHash: string,
) {
  if (!verificationId || !signature) return false;
  const evidenceSnap = await db.collection("contract_signature_otps").doc(verificationId).get();
  if (!evidenceSnap.exists) return false;
  const evidence = evidenceSnap.data() || {};
  return upper(evidence.status) === "VERIFIED" &&
    String(evidence.uid || "").trim() === ownerUid &&
    String(evidence.contractId || "").trim() === contractId &&
    String(evidence.contractHash || "").trim() === contractHash &&
    String(evidence.consumedFor || "").trim() === contractId &&
    String(evidence.signature || "").trim() === signature &&
    Boolean(evidence.verifiedAt) &&
    Boolean(evidence.consumedAt);
}

export const adminApprovePayment = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  await requireAdmin(request.auth);

  const paymentId = resolvePaymentId(request.data);
  if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");

  const ref = db.collection("payment_transactions").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = snap.data() || {};
  const paymentReferenceId = String(request.data?.paymentReferenceId || request.data?.referenceId || payment.paymentReference || payment.paymentReferenceId || "").trim();
  const amountReceived = Number(request.data?.amountReceived || payment.activationDeposit || payment.amount || payment.amountPaid || payment.rentPaid || 0);
  const notes = String(request.data?.notes || request.data?.internalNotes || "Approved by admin.").trim();
  const method = String(request.data?.method || payment.paymentMethod || "").trim();
  const receivedAt = String(request.data?.receivedAt || "").trim();
  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;

  if (isRentCollectionPayment(payment)) {
    if (roleOf(payment.status) === "approved" && payment.paymentVerified === true) {
      return {
        status: "SUCCESS",
        paymentId,
        paymentKind: "RENT_COLLECTION",
        idempotent: true,
      };
    }
    const submittedRentAmount = Number(payment.amount || payment.amountPaid || payment.rentPaid || 0);
    const submittedReference = String(payment.reference || payment.paymentReference || payment.paymentReferenceId || "").trim();
    const submittedProofPath = String(
      payment.receiptPath ||
      payment.referenceFilePath ||
      payment.paymentProofPath ||
      "",
    ).trim();
    const submittedProofHash = String(
      payment.referenceFileHash ||
      payment.receiptHash ||
      payment.paymentProofHash ||
      "",
    ).trim().toLowerCase();
    const rentOwnerUid = String(payment.ownerUid || payment.ownerId || "").trim();
    if (
      !Number.isFinite(submittedRentAmount) ||
      submittedRentAmount <= 0 ||
      !submittedReference ||
      !submittedProofPath ||
      !rentOwnerUid ||
      !/^[a-f0-9]{64}$/.test(submittedProofHash)
    ) {
      throw new HttpsError("failed-precondition", "Rent approval requires immutable submitted amount, reference, and receipt evidence.");
    }
    if (
      Number.isFinite(Number(request.data?.amountReceived)) &&
      Math.abs(Number(request.data.amountReceived) - submittedRentAmount) > 0.01
    ) {
      throw new HttpsError("failed-precondition", "Admin approval cannot alter the tenant or owner submitted rent amount.");
    }
    const receiptEvidence = await assertStoredOwnerPaymentReceipt({
      ownerUid: rentOwnerUid,
      paymentId,
      storagePath: submittedProofPath,
      expectedHash: submittedProofHash,
    });
    await db.runTransaction(async (transaction) => {
      transaction.set(ref, {
        status: "APPROVED",
        paymentStatus: "APPROVED",
        verificationState: "ADMIN_VERIFIED",
        paymentVerified: true,
        approved: true,
        paymentReferenceId: submittedReference,
        amountReceived: submittedRentAmount,
        receiptEvidence,
        paymentMethod: method || payment.paymentMethod || null,
        receivedAt: receivedAt || null,
        adminNotes: notes,
        approvedBy: actorId,
        approvedByEmail: actorEmail,
        approvedAt: now,
        updatedAt: now,
      }, { merge: true });

      transaction.set(db.collection("audit_logs").doc(), {
        action: "ADMIN_APPROVE_RENT_PAYMENT",
        actorId,
        actorEmail,
        paymentId,
        ownerUid: payment.ownerUid || payment.ownerId || null,
        tenantName: payment.tenantName || null,
        propertyId: payment.propertyId || null,
        propertyName: payment.propertyName || null,
        paymentReferenceId: submittedReference,
        amountReceived: submittedRentAmount,
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
  if (!contractId || !intakeId) {
    throw new HttpsError("failed-precondition", "Payment is not bound to a canonical intake and contract.");
  }
  const contractRef = db.collection("contracts").doc(contractId);
  const contractSnap = await contractRef.get();
  if (!contractSnap.exists) throw new HttpsError("failed-precondition", "Bound contract does not exist.");
  const contractData = contractSnap.data() || {};
  const alreadyApproved = roleOf(payment.status) === "approved" && roleOf(contractData.status) === "active";
  const ownerUid = String(payment.ownerUid || payment.ownerId || "").trim();
  const contractOwnerUid = String(contractData.ownerUid || contractData.ownerId || "").trim();
  if (!ownerUid || contractOwnerUid !== ownerUid) {
    throw new HttpsError("failed-precondition", "Payment and contract owner bindings do not match.");
  }
  if (!payment.quoteHash || payment.quoteHash !== contractData.quoteHash) {
    throw new HttpsError("failed-precondition", "Payment and contract quote hashes do not match.");
  }
  const otpVerificationId = String(
    contractData.otpVerificationId ||
    payment.otpVerificationId ||
    "",
  ).trim();
  const durableOtpEvidence = await hasDurableOtpSignatureEvidence(
    otpVerificationId,
    ownerUid,
    contractId,
    resolveContractSignature(contractData, payment),
    String(contractData.quoteHash || payment.quoteHash || "").trim(),
  );
  if (
    contractData.ownerSigned !== true ||
    !durableOtpEvidence ||
    !otpVerificationId
  ) {
    throw new HttpsError("failed-precondition", "A verified owner signature is required before payment approval.");
  }
  const expectedAnnual = Number(payment.quoteSnapshot?.annualContractValue || contractData.quoteSnapshot?.annualContractValue || contractData.annualContractValue || 0);
  const expectedAmount = Number(payment.quoteSnapshot?.activationDeposit || contractData.quoteSnapshot?.activationDeposit || payment.activationDeposit || payment.amount || 0);
  if (
    !Number.isFinite(expectedAnnual) ||
    expectedAnnual <= 0 ||
    !Number.isFinite(expectedAmount) ||
    expectedAmount <= 0 ||
    Math.abs(expectedAmount - Math.round(expectedAnnual * 0.15)) > 0.01
  ) {
    throw new HttpsError("failed-precondition", "The locked 15% mobilization schedule is invalid.");
  }
  if (Number.isFinite(Number(request.data?.amountReceived)) && Math.abs(Number(request.data.amountReceived) - expectedAmount) > 0.01) {
    throw new HttpsError("failed-precondition", "Received amount does not match the locked mobilization deposit.");
  }
  const normalizedMethod = upper(payment.paymentMethod || payment.method || method);
  const stripeVerified = normalizedMethod === "STRIPE" &&
    upper(payment.paymentStatus) === "PAID" &&
    payment.verified === true &&
    Boolean(payment.stripeSessionId);
  const manualReference = paymentReferenceId || String(payment.paymentReferenceId || "").trim();
  const manualProofPath = String(payment.paymentProofPath || payment.receiptPath || payment.paymentManifest?.receiptPath || "").trim();
  const manualProofHash = String(payment.paymentProofHash || payment.paymentProofEvidence?.receiptHash || "").trim().toLowerCase();
  const manualVerified =
    ["BANK_TRANSFER", "CHEQUE", "CASH"].includes(normalizedMethod) &&
    Boolean(manualReference) &&
    manualProofPath.startsWith(`payment-references/owners/${ownerUid}/${paymentId}/`) &&
    /^[a-f0-9]{64}$/.test(manualProofHash);
  if (!alreadyApproved && !stripeVerified && !manualVerified) {
    throw new HttpsError("failed-precondition", "Verified Stripe evidence or a manual payment receipt reference is required.");
  }
  const verifiedReceiptEvidence = manualVerified
    ? await assertStoredOwnerPaymentReceipt({
      ownerUid,
      paymentId,
      storagePath: manualProofPath,
      expectedHash: manualProofHash,
    })
    : null;
  const invoiceId = `MOB-${crypto.createHash("sha256").update(paymentId).digest("hex").slice(0, 20).toUpperCase()}`;
  const invoiceCanonical = JSON.stringify({
    invoiceId,
    paymentId,
    contractId,
    intakeId,
    amount: expectedAmount,
    currency: "AED",
    feeType: "MOBILIZATION_DEPOSIT",
    quoteHash: String(payment.quoteHash),
  });
  const invoiceHash = crypto.createHash("sha256").update(invoiceCanonical).digest("hex");
  const propertyQuery = db.collection("properties").where("intakeId", "==", intakeId).limit(100);
  let approvalWasIdempotent = false;
  let approvalUsesStripe = false;
  await db.runTransaction(async (transaction) => {
    const [freshPaymentSnap, freshContractSnap, propertySnap] = await Promise.all([
      transaction.get(ref),
      transaction.get(contractRef),
      transaction.get(propertyQuery),
    ]);
    if (!freshPaymentSnap.exists || !freshContractSnap.exists) {
      throw new HttpsError("failed-precondition", "Payment or contract disappeared during approval.");
    }
    const freshPayment = freshPaymentSnap.data() || {};
    const freshContract = freshContractSnap.data() || {};
    if (roleOf(freshPayment.status) === "approved" && roleOf(freshContract.status) === "active") {
      approvalWasIdempotent = true;
      return;
    }
    if (
      ["rejected", "payment_rejected"].includes(roleOf(freshPayment.status)) ||
      ["rejected", "payment_rejected"].includes(roleOf(freshPayment.paymentStatus)) ||
      ["rejected", "payment_rejected"].includes(roleOf(freshContract.status)) ||
      freshContract.adminApproved === false && roleOf(freshContract.activationStatus) === "locked_payment_rejected"
    ) {
      throw new HttpsError("aborted", "Payment was rejected while approval was in progress.");
    }
    if (freshPayment.quoteHash !== payment.quoteHash || freshContract.quoteHash !== payment.quoteHash) {
      throw new HttpsError("aborted", "Quote evidence changed during approval.");
    }
    const freshOwnerUid = String(freshPayment.ownerUid || freshPayment.ownerId || "").trim();
    const freshContractOwnerUid = String(freshContract.ownerUid || freshContract.ownerId || "").trim();
    if (freshOwnerUid !== ownerUid || freshContractOwnerUid !== ownerUid) {
      throw new HttpsError("aborted", "Owner binding changed during approval.");
    }

    const freshOtpVerificationId = String(
      freshContract.otpVerificationId ||
      freshPayment.otpVerificationId ||
      "",
    ).trim();
    const freshSignature = resolveContractSignature(freshContract, freshPayment);
    if (!freshOtpVerificationId || !freshSignature || freshContract.ownerSigned !== true) {
      throw new HttpsError("failed-precondition", "Durable signed OTP evidence is required.");
    }
    const otpEvidenceSnap = await transaction.get(
      db.collection("contract_signature_otps").doc(freshOtpVerificationId),
    );
    const otpEvidence = otpEvidenceSnap.data() || {};
    const freshDurableOtp =
      otpEvidenceSnap.exists &&
      upper(otpEvidence.status) === "VERIFIED" &&
      String(otpEvidence.uid || "").trim() === ownerUid &&
      String(otpEvidence.contractId || "").trim() === contractId &&
      String(otpEvidence.contractHash || "").trim() === String(freshPayment.quoteHash || "").trim() &&
      String(otpEvidence.consumedFor || "").trim() === contractId &&
      String(otpEvidence.signature || "").trim() === freshSignature &&
      Boolean(otpEvidence.verifiedAt) &&
      Boolean(otpEvidence.consumedAt);
    if (!freshDurableOtp) {
      throw new HttpsError("failed-precondition", "Durable signed OTP evidence changed during approval.");
    }

    const freshExpectedAnnual = Number(
      freshPayment.quoteSnapshot?.annualContractValue ||
      freshContract.quoteSnapshot?.annualContractValue ||
      freshContract.annualContractValue ||
      0,
    );
    const freshExpectedAmount = Number(
      freshPayment.quoteSnapshot?.activationDeposit ||
      freshContract.quoteSnapshot?.activationDeposit ||
      freshPayment.activationDeposit ||
      freshPayment.amount ||
      0,
    );
    if (
      !Number.isFinite(freshExpectedAnnual) ||
      freshExpectedAnnual <= 0 ||
      !Number.isFinite(freshExpectedAmount) ||
      freshExpectedAmount <= 0 ||
      Math.abs(freshExpectedAmount - Math.round(freshExpectedAnnual * 0.15)) > 0.01 ||
      Math.abs(freshExpectedAmount - expectedAmount) > 0.01
    ) {
      throw new HttpsError("aborted", "Locked payment amount changed during approval.");
    }

    const freshMethod = upper(freshPayment.paymentMethod || freshPayment.method || normalizedMethod);
    const freshStripeSessionId = String(freshPayment.stripeSessionId || "").trim();
    const freshStripeVerified =
      freshMethod === "STRIPE" &&
      upper(freshPayment.paymentStatus) === "PAID" &&
      freshPayment.verified === true &&
      freshPayment.paymentVerified === true &&
      Boolean(freshStripeSessionId) &&
      freshStripeSessionId !== String(freshPayment.invalidatedStripeSessionId || "").trim();
    const freshManualReference = String(
      freshPayment.paymentReferenceId ||
      freshPayment.paymentReference ||
      manualReference ||
      "",
    ).trim();
    const freshManualProofUrl = String(
      freshPayment.paymentProofUrl ||
      freshPayment.receiptUrl ||
      freshPayment.paymentManifest?.receiptUrl ||
      "",
    ).trim();
    const freshManualProofPath = String(
      freshPayment.paymentProofPath ||
      freshPayment.receiptPath ||
      freshPayment.paymentManifest?.receiptPath ||
      "",
    ).trim();
    const freshManualProofHash = String(
      freshPayment.paymentProofHash ||
      freshPayment.paymentProofEvidence?.receiptHash ||
      "",
    ).trim().toLowerCase();
    const freshManualVerified =
      ["BANK_TRANSFER", "CHEQUE", "CASH"].includes(freshMethod) &&
      Boolean(freshManualReference) &&
      Boolean(freshManualProofUrl) &&
      freshManualProofPath === verifiedReceiptEvidence?.storagePath &&
      freshManualProofHash === verifiedReceiptEvidence?.receiptHash &&
      String(freshPayment.paymentProofGeneration || freshPayment.paymentProofEvidence?.generation || "") ===
        verifiedReceiptEvidence?.generation;
    if (!freshStripeVerified && !freshManualVerified) {
      throw new HttpsError("aborted", "Payment evidence changed during approval.");
    }
    approvalUsesStripe = freshStripeVerified;

    transaction.set(ref, {
      status: "APPROVED",
      paymentStatus: "APPROVED",
      verificationState: approvalUsesStripe ? "STRIPE_VERIFIED_ADMIN_APPROVED" : "ADMIN_VERIFIED",
      paymentVerified: true,
      unlocksDashboard: true,
      paymentReferenceId: manualReference || payment.stripeSessionId,
      amountReceived: expectedAmount,
      paymentMethod: normalizedMethod,
      receivedAt: receivedAt || null,
      adminNotes: notes,
      approvedBy: actorId,
      approvedByEmail: actorEmail,
      approvedAt: now,
      invoiceId,
      invoiceProofHash: invoiceHash,
      updatedAt: now,
    }, { merge: true });

    transaction.set(contractRef, {
      status: "ACTIVE",
      contractStatus: "active",
      paymentStatus: "APPROVED",
      activationStatus: "ACTIVE",
      paymentVerified: true,
      adminApproved: true,
      dashboardUnlockApproved: true,
      paymentReferenceId: manualReference || payment.stripeSessionId,
      amountReceived: expectedAmount,
      approvedBy: actorId,
      approvedAt: now,
      invoiceId,
      invoiceProofHash: invoiceHash,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.collection("intake_submissions").doc(intakeId), {
      status: "ACTIVE",
      paymentStatus: "APPROVED",
      activationState: "ACTIVE",
      approvedAt: now,
      approvedBy: actorId,
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
    transaction.set(db.collection("users").doc(ownerUid), ownerPatch, { merge: true });
    transaction.set(db.collection("owners").doc(ownerUid), { ...ownerPatch, status: "ACTIVE" }, { merge: true });
    if (propertySnap.empty) {
      throw new HttpsError("failed-precondition", "No property records are bound to the approved onboarding intake.");
    }
    propertySnap.docs.forEach((propertyDoc) => {
      const property = propertyDoc.data() || {};
      if (String(property.ownerUid || property.ownerId || "") !== ownerUid || property.quoteHash !== payment.quoteHash) {
        throw new HttpsError("failed-precondition", "A property binding does not match the approved owner quote.");
      }
      transaction.set(propertyDoc.ref, {
        status: "ACTIVE",
        activationStatus: "ACTIVE",
        activatedAt: now,
        updatedAt: now,
      }, { merge: true });
      transaction.set(db.collection("propertyPassports").doc(propertyDoc.id), {
        status: "ACTIVE",
        activated: true,
        activatedAt: now,
        updatedAt: now,
      }, { merge: true });
    });

    transaction.set(db.collection("invoices").doc(invoiceId), {
      invoiceId,
      paymentId,
      contractId,
      intakeId,
      ownerId: ownerUid,
      ownerUid,
      ownerEmail: payment.ownerEmail || null,
      amount: expectedAmount,
      amountPaid: expectedAmount,
      currency: "AED",
      feeType: "MOBILIZATION_DEPOSIT",
      status: "PAID",
      paymentMethod: normalizedMethod,
      paymentReferenceId: manualReference || payment.stripeSessionId,
      quoteHash: payment.quoteHash,
      proofHash: invoiceHash,
      issuedAt: now,
      paidAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.collection("invoice_registry").doc(invoiceHash), {
      entityId: invoiceId,
      documentType: "MOBILIZATION_DEPOSIT_INVOICE",
      amount: expectedAmount,
      currency: "AED",
      status: "PAID",
      reference: manualReference || payment.stripeSessionId,
      proofHash: invoiceHash,
      issuedAt: now,
    });

    transaction.set(db.collection("audit_logs").doc(), {
      action: "ADMIN_APPROVE_PAYMENT",
      actorId,
      actorEmail,
      paymentId,
      contractId,
      intakeId,
      ownerUid,
      paymentReferenceId: manualReference || payment.stripeSessionId,
      amountReceived: expectedAmount,
      createdAt: now,
    });
    if (payment.ownerEmail) {
      transaction.set(db.collection("mail").doc(`owner_payment_approved_${paymentId}`), {
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
        metadata: {
          type: "owner_payment_approved_dashboard_activated",
          paymentId,
          contractId,
          intakeId,
          ownerUid,
          invoiceId,
          invoiceProofHash: invoiceHash,
        },
        createdAt: now,
      }, { merge: true });
    }
  });

  if (contractId && contractData.commissionGenerated !== true) {
    try {
      const commissionResult = await createBrokerCommissionForContract(contractId, contractData, {
        amountReceived: expectedAmount,
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

  return {
    status: "SUCCESS",
    paymentId,
    contractId: contractId || null,
    intakeId: intakeId || null,
    ownerUid: ownerUid || null,
    idempotent: approvalWasIdempotent,
  };
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

      transaction.set(db.collection("audit_logs").doc(), {
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
  const ownerUid = String(payment.ownerUid || payment.ownerId || "").trim();
  const contractRef = contractId ? db.collection("contracts").doc(contractId) : null;
  const userRef = ownerUid ? db.collection("users").doc(ownerUid) : null;
  const ownerRef = ownerUid ? db.collection("owners").doc(ownerUid) : null;
  await db.runTransaction(async (transaction) => {
    const [freshPaymentSnap, contractSnap, userSnap, ownerSnap] = await Promise.all([
      transaction.get(ref),
      contractRef ? transaction.get(contractRef) : Promise.resolve(null),
      userRef ? transaction.get(userRef) : Promise.resolve(null),
      ownerRef ? transaction.get(ownerRef) : Promise.resolve(null),
    ]);
    if (!freshPaymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
    const freshPayment = freshPaymentSnap.data() || {};
    const freshContract = contractSnap?.data() || {};
    if (
      roleOf(freshPayment.status) === "approved" ||
      roleOf(freshContract.status) === "active" ||
      freshContract.adminApproved === true
    ) {
      throw new HttpsError(
        "failed-precondition",
        "An activated payment cannot be rejected. Use the audited refund or contract-cancellation workflow.",
      );
    }

    transaction.set(ref, {
      status: "REJECTED",
      paymentStatus: "REJECTED",
      verificationState: "ADMIN_REJECTED",
      paymentVerified: false,
      verified: false,
      approved: false,
      unlocksDashboard: false,
      invalidatedStripeSessionId: freshPayment.stripeSessionId || null,
      invalidatedStripePaymentIntentId: freshPayment.stripePaymentIntentId || null,
      stripeSessionId: FieldValue.delete(),
      stripePaymentIntentId: FieldValue.delete(),
      stripeCheckoutStatus: "INVALIDATED",
      checkoutAttempt: FieldValue.increment(1),
      rejectionReason: reason,
      rejectedBy: actorId,
      rejectedAt: now,
      updatedAt: now,
    }, { merge: true });

    if (contractRef) {
      transaction.set(contractRef, {
        status: "PAYMENT_REJECTED",
        paymentStatus: "REJECTED",
        activationStatus: "LOCKED_PAYMENT_REJECTED",
        paymentVerified: false,
        adminApproved: false,
        dashboardUnlockApproved: false,
        dashboardUnlocked: false,
        rejectionReason: reason,
        rejectedBy: actorId,
        rejectedAt: now,
        updatedAt: now,
      }, { merge: true });
    }
    if (intakeId) {
      transaction.set(db.collection("intake_submissions").doc(intakeId), {
        status: "payment_rejected",
        paymentStatus: "REJECTED",
        activationState: "LOCKED_PAYMENT_REJECTED",
        updatedAt: now,
      }, { merge: true });
    }

    const profilePatch = {
      status: "payment_pending_admin_verification",
      paymentVerified: false,
      adminApproved: false,
      dashboardUnlocked: false,
      dashboardLocked: true,
      activationStatus: "LOCKED_PAYMENT_REJECTED",
      updatedAt: now,
    };
    if (userRef && userSnap?.exists) {
      const user = userSnap.data() || {};
      transaction.set(userRef, {
        ...profilePatch,
        ...(String(user.activeContractId || "") === contractId
          ? { activeContractId: FieldValue.delete() }
          : {}),
      }, { merge: true });
    }
    if (ownerRef && ownerSnap?.exists) {
      const owner = ownerSnap.data() || {};
      transaction.set(ownerRef, {
        ...profilePatch,
        status: "PAYMENT_PENDING_ADMIN_VERIFICATION",
        ...(String(owner.activeContractId || "") === contractId
          ? { activeContractId: FieldValue.delete() }
          : {}),
      }, { merge: true });
    }

    transaction.set(db.collection("audit_logs").doc(), {
      action: "ADMIN_REJECT_PAYMENT",
      actorId,
      paymentId,
      contractId: contractId || null,
      intakeId: intakeId || null,
      ownerUid: ownerUid || null,
      invalidatedStripeSessionId: freshPayment.stripeSessionId || null,
      reason,
      createdAt: now,
    });
  });
  return { status: "SUCCESS", paymentId, idempotent: false };
});
