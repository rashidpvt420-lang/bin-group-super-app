import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  adminApprovePayment as legacyAdminApprovePayment,
  adminRejectPayment as legacyAdminRejectPayment,
} from "./paymentTransactionApproval";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";
import { createBrokerCommissionForContract } from "./brokerCommissions";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => admin.firestore.FieldValue.serverTimestamp();
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const PHASE1_PAYMENT_METHODS = new Set(["CHEQUE", "CASH"]);
const LEGACY_MANUAL_PAYMENT_METHODS = new Set(["BANK_TRANSFER", "CHEQUE", "CASH"]);
const FINANCE_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin"]);

const text = (value: unknown) => String(value || "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const lower = (value: unknown) => text(value).toLowerCase();
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;

const isRentCollectionPayment = (payment: any) =>
  upper(payment?.recordType) === "OWNER_RENT_PAYMENT" ||
  upper(payment?.recordType) === "TENANT_RENT_PAYMENT_PROOF" ||
  upper(payment?.transactionType) === "RENT_COLLECTION" ||
  upper(payment?.transactionType) === "RENT_PAYMENT_PROOF" ||
  upper(payment?.paymentType) === "RENT_COLLECTION";

const resolvePaymentId = (data: any) => text(data?.paymentId || data?.id);

function hasMfa(token: any) {
  return Boolean(token?.firebase?.sign_in_second_factor || (Array.isArray(token?.amr) && token.amr.includes("mfa")));
}

async function requireMfaFinanceAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const role = lower(token.role || token.userRole || token.primaryRole);
  const authorized =
    token.admin === true ||
    token.isAdmin === true ||
    token.superAdmin === true ||
    token.super_admin === true ||
    token.ceo === true ||
    FINANCE_ADMIN_ROLES.has(role);
  if (!authorized || token.suspended === true) throw new HttpsError("permission-denied", "Finance Admin authority is required.");
  if (token.email_verified !== true || !hasMfa(token)) throw new HttpsError("permission-denied", "A verified Admin MFA session is required for payment decisions.");
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled || !record.emailVerified || !record.email) throw new HttpsError("permission-denied", "The Admin account is not active and verified.");
  return { uid: auth.uid as string, email: lower(record.email) };
}

const isFiniteCoordinate = (value: unknown, minimum: number, maximum: number) => {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum;
};

export const isPropertyLocationActivationReady = (property: any) => {
  const geo = property?.geo;
  return Boolean(
    geo &&
    geo.verified === true &&
    geo.dispatchReady === true &&
    geo.requiresGeoReview !== true &&
    isFiniteCoordinate(geo.lat, -90, 90) &&
    isFiniteCoordinate(geo.lng, -180, 180),
  );
};

async function assertPhase1InspectionAndEvidenceGate(paymentId: string, payment: any) {
  const intakeId = text(payment.intakeId);
  const ownerUid = text(payment.ownerUid || payment.ownerId);
  if (!intakeId || !ownerUid) throw new HttpsError("failed-precondition", "Payment is not bound to an Owner onboarding intake.");
  if (payment.inspectionVerified !== true) throw new HttpsError("failed-precondition", "All property visits must be verified before final approval.");

  const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
  if (!intakeSnap.exists) throw new HttpsError("failed-precondition", "The Owner onboarding intake is missing.");
  const intake = intakeSnap.data() || {};
  const properties = Array.isArray(intake.properties) ? intake.properties : [];
  const inspectionIds: string[] = Array.isArray(intake.inspectionIds)
    ? Array.from(new Set<string>(intake.inspectionIds.map((value: unknown) => text(value)).filter(Boolean)))
    : [];
  if (
    upper(intake.inspectionStatus) !== "COMPLETED" ||
    properties.length < 1 ||
    inspectionIds.length !== properties.length ||
    Number(intake.inspectionEvidenceVerifiedCount || 0) !== properties.length
  ) throw new HttpsError("failed-precondition", "Every property requires a completed visit with verified GPS, checklist, findings, timestamps and photo evidence.");

  const inspectionSnaps = await Promise.all(inspectionIds.map((inspectionId) => db.collection("property_inspections").doc(inspectionId).get()));
  const propertyIds = new Set<string>();
  inspectionSnaps.forEach((snapshot, index) => {
    const value = snapshot.data() || {};
    const evidence = value.visitEvidence || {};
    const propertyId = text(value.propertyId);
    if (
      !snapshot.exists ||
      text(value.intakeId) !== intakeId ||
      upper(value.status) !== "COMPLETED" ||
      value.evidenceVerified !== true ||
      evidence.gpsWithinRadius !== true ||
      evidence.checklistComplete !== true ||
      Number(evidence.photoCount || 0) < 1 ||
      text(evidence.findings).length < 8 ||
      !propertyId
    ) throw new HttpsError("failed-precondition", `Inspection ${index + 1} does not contain complete verified evidence.`);
    if (propertyIds.has(propertyId)) throw new HttpsError("failed-precondition", "Duplicate property inspection evidence was detected.");
    propertyIds.add(propertyId);
  });

  const expectedPropertyIds = new Set<string>(properties.map((property: any) => text(property.propertyId || property.id)).filter(Boolean));
  if (expectedPropertyIds.size !== propertyIds.size || [...expectedPropertyIds].some((id) => !propertyIds.has(id))) {
    throw new HttpsError("failed-precondition", "Inspection evidence does not match the submitted property portfolio.");
  }

  const method = upper(payment.paymentMethod || payment.method);
  if (!PHASE1_PAYMENT_METHODS.has(method)) throw new HttpsError("failed-precondition", "Phase 1 final approval accepts only Cash or Cheque.");
  const expectedAmount = money(payment.activationDeposit || payment.amount);
  if (expectedAmount <= 0 || Math.abs(money(payment.amountReceived) - expectedAmount) > 0.01) {
    throw new HttpsError("failed-precondition", "The received amount must equal the locked 15% mobilisation deposit.");
  }
  const proofPath = text(payment.paymentProofPath || payment.receiptPath);
  const proofHash = lower(payment.paymentProofHash || payment.receiptHash);
  const proofGeneration = text(payment.paymentProofGeneration || payment.receiptGeneration);
  if (!proofPath || !/^[a-f0-9]{64}$/.test(proofHash) || !/^\d+$/.test(proofGeneration)) {
    throw new HttpsError("failed-precondition", "Immutable 15% payment receipt evidence is required.");
  }

  const [metadata] = await admin.storage().bucket().file(proofPath, { generation: proofGeneration }).getMetadata();
  const storedHash = lower(metadata.metadata?.sha256 || metadata.metadata?.receiptHash);
  if (
    text(metadata.generation) !== proofGeneration ||
    storedHash !== proofHash ||
    text(metadata.metadata?.ownerUid) !== ownerUid ||
    text(metadata.metadata?.paymentId) !== paymentId
  ) throw new HttpsError("failed-precondition", "Stored payment receipt evidence failed its integrity check.");

  return { intake, inspectionIds, expectedAmount, method, proofPath, proofHash, proofGeneration };
}

async function assertOwnerActivationGate(paymentId: string) {
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = paymentSnap.data() || {};
  if (isRentCollectionPayment(payment)) return { payment, isRent: true, phase1: null };

  const intakeId = text(payment.intakeId);
  const ownerUid = text(payment.ownerUid || payment.ownerId);
  if (!intakeId || !ownerUid) throw new HttpsError("failed-precondition", "Payment is not bound to an Owner onboarding intake.");

  const phase1 = text(payment.workflowVersion) === WORKFLOW_VERSION
    ? await assertPhase1InspectionAndEvidenceGate(paymentId, payment)
    : null;

  const propertySnap = await db.collection("properties").where("intakeId", "==", intakeId).limit(100).get();
  if (propertySnap.empty) throw new HttpsError("failed-precondition", "No property records are bound to this onboarding intake.");
  const invalidProperties = propertySnap.docs.filter((propertyDoc) => {
    const property = propertyDoc.data() || {};
    return text(property.ownerUid || property.ownerId) !== ownerUid || !isPropertyLocationActivationReady(property);
  });
  if (invalidProperties.length > 0) {
    await db.collection("audit_logs").add({
      action: "OWNER_ACTIVATION_GEO_GATE_BLOCKED",
      actorId: "PAYMENT_APPROVAL_GATE",
      paymentId,
      intakeId,
      ownerUid,
      invalidPropertyIds: invalidProperties.map((propertyDoc) => propertyDoc.id),
      reason: "Property geo must be present, verified, dispatch-ready, review-cleared and contain finite coordinates.",
      createdAt: ts(),
    });
    throw new HttpsError("failed-precondition", "Owner activation is blocked until every property location is verified and dispatch-ready.");
  }

  const method = upper(payment.paymentMethod || payment.method);
  const manualMethods = phase1 ? PHASE1_PAYMENT_METHODS : LEGACY_MANUAL_PAYMENT_METHODS;
  if (manualMethods.has(method)) {
    const activeConfiguration = await loadActivePaymentConfiguration();
    const manifest = payment.paymentManifest || {};
    const submittedVersion = text(payment.paymentConfigVersion || payment.paymentConfigurationVersion || manifest.configVersion || manifest.paymentConfigVersion);
    const submittedHash = text(payment.paymentConfigHash || payment.paymentConfigurationHash || manifest.configHash || manifest.paymentConfigHash);
    if (submittedVersion !== activeConfiguration.version || submittedHash !== activeConfiguration.configHash || !activeConfiguration.approvedMethods.includes(method)) {
      throw new HttpsError("failed-precondition", "The payment configuration evidence is missing, stale or no longer approved. Record a new receipt against the active configuration.");
    }
  }
  return { payment, isRent: false, phase1 };
}

async function activatePhase1Owner(paymentId: string, payment: any, actor: { uid: string; email: string }, requestData: any) {
  const intakeId = text(payment.intakeId);
  const contractId = text(payment.contractId || intakeId || paymentId);
  const ownerUid = text(payment.ownerUid || payment.ownerId);
  const expectedAmount = money(payment.quoteSnapshot?.activationDeposit || payment.activationDeposit || payment.amount);
  const expectedAnnual = money(payment.quoteSnapshot?.annualContractValue || payment.annualContractValue);
  const method = upper(payment.paymentMethod || payment.method);
  const paymentReferenceId = text(requestData?.paymentReferenceId || payment.paymentReferenceId || payment.paymentReference);
  if (!intakeId || !contractId || !ownerUid || expectedAmount <= 0 || expectedAnnual <= 0 || !paymentReferenceId) {
    throw new HttpsError("failed-precondition", "Canonical Owner activation bindings are incomplete.");
  }
  if (Math.abs(expectedAmount - money(expectedAnnual * 0.15)) > 0.01) {
    throw new HttpsError("failed-precondition", "The locked 15% mobilisation schedule is invalid.");
  }

  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const contractRef = db.collection("contracts").doc(contractId);
  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const propertyQuery = db.collection("properties").where("intakeId", "==", intakeId).limit(100);
  const invoiceId = `MOB-${crypto.createHash("sha256").update(paymentId).digest("hex").slice(0, 20).toUpperCase()}`;
  const invoiceCanonical = JSON.stringify({ invoiceId, paymentId, contractId, intakeId, ownerUid, amount: expectedAmount, currency: "AED", method, paymentReferenceId, quoteHash: text(payment.quoteHash) });
  const invoiceHash = crypto.createHash("sha256").update(invoiceCanonical).digest("hex");
  let idempotent = false;
  let commissionContract: any = null;

  await db.runTransaction(async (transaction) => {
    const [freshPaymentSnap, contractSnap, intakeSnap, propertySnap] = await Promise.all([
      transaction.get(paymentRef),
      transaction.get(contractRef),
      transaction.get(intakeRef),
      transaction.get(propertyQuery),
    ]);
    if (!freshPaymentSnap.exists || !contractSnap.exists || !intakeSnap.exists || propertySnap.empty) {
      throw new HttpsError("failed-precondition", "Payment, contract, intake or property records are missing during activation.");
    }
    const freshPayment = freshPaymentSnap.data() || {};
    const contract = contractSnap.data() || {};
    const intake = intakeSnap.data() || {};
    if (upper(freshPayment.status) === "APPROVED" && upper(contract.status) === "ACTIVE" && intake.activationState === "ACTIVE") {
      idempotent = true;
      return;
    }
    if (text(freshPayment.workflowVersion) !== WORKFLOW_VERSION || text(contract.workflowVersion) !== WORKFLOW_VERSION || text(intake.workflowVersion) !== WORKFLOW_VERSION) {
      throw new HttpsError("failed-precondition", "The records no longer belong to the Phase 1 Owner workflow.");
    }
    if (text(freshPayment.ownerUid || freshPayment.ownerId) !== ownerUid || text(contract.ownerUid || contract.ownerId) !== ownerUid || text(freshPayment.quoteHash) !== text(contract.quoteHash)) {
      throw new HttpsError("aborted", "Owner or quotation binding changed during approval.");
    }
    if (freshPayment.inspectionVerified !== true || upper(intake.inspectionStatus) !== "COMPLETED") {
      throw new HttpsError("aborted", "Inspection verification changed during approval.");
    }
    if (upper(freshPayment.paymentMethod || freshPayment.method) !== method || !PHASE1_PAYMENT_METHODS.has(method)) {
      throw new HttpsError("aborted", "Payment method changed during approval.");
    }
    if (Math.abs(money(freshPayment.amountReceived) - expectedAmount) > 0.01) {
      throw new HttpsError("aborted", "Received amount changed during approval.");
    }
    const otpVerificationId = text(contract.otpVerificationId || freshPayment.otpVerificationId);
    const signatureName = text(contract.signatureName || contract.signatureState?.ownerSignatureName || freshPayment.signatureName);
    if (!otpVerificationId || !signatureName || contract.ownerSigned !== true) throw new HttpsError("failed-precondition", "Durable Owner signature evidence is missing.");
    const otpSnap = await transaction.get(db.collection("contract_signature_otps").doc(otpVerificationId));
    const otp = otpSnap.data() || {};
    if (
      !otpSnap.exists ||
      upper(otp.status) !== "VERIFIED" ||
      text(otp.uid) !== ownerUid ||
      text(otp.contractId) !== contractId ||
      text(otp.contractHash) !== text(contract.quoteHash) ||
      text(otp.consumedFor) !== contractId ||
      text(otp.signature) !== signatureName ||
      !otp.verifiedAt ||
      !otp.consumedAt
    ) throw new HttpsError("failed-precondition", "Durable Owner OTP signature evidence changed during approval.");

    propertySnap.docs.forEach((propertyDoc) => {
      const property = propertyDoc.data() || {};
      if (text(property.ownerUid || property.ownerId) !== ownerUid || text(property.quoteHash) !== text(payment.quoteHash) || !isPropertyLocationActivationReady(property) || property.visitEvidenceVerified !== true) {
        throw new HttpsError("failed-precondition", `Property ${propertyDoc.id} is not ready for activation.`);
      }
    });

    const now = ts();
    transaction.set(paymentRef, {
      status: "APPROVED",
      paymentStatus: "APPROVED",
      verificationState: "PHASE1_PRIVATE_RECEIPT_ADMIN_APPROVED",
      paymentVerified: true,
      approved: true,
      unlocksDashboard: true,
      paymentReferenceId,
      amountReceived: expectedAmount,
      paymentMethod: method,
      adminNotes: text(requestData?.internalNotes || "Verified by Admin MFA."),
      approvedBy: actor.uid,
      approvedByEmail: actor.email,
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
      paymentReferenceId,
      amountReceived: expectedAmount,
      approvedBy: actor.uid,
      approvedAt: now,
      invoiceId,
      invoiceProofHash: invoiceHash,
      updatedAt: now,
    }, { merge: true });
    transaction.set(intakeRef, {
      status: "ACTIVE",
      paymentStatus: "APPROVED",
      activationState: "ACTIVE",
      approvedAt: now,
      approvedBy: actor.uid,
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
      approvedBy: actor.uid,
      approvedAt: now,
      updatedAt: now,
    };
    transaction.set(db.collection("users").doc(ownerUid), ownerPatch, { merge: true });
    transaction.set(db.collection("owners").doc(ownerUid), { ...ownerPatch, status: "ACTIVE" }, { merge: true });
    propertySnap.docs.forEach((propertyDoc) => {
      transaction.set(propertyDoc.ref, { status: "ACTIVE", activationStatus: "ACTIVE", activatedAt: now, updatedAt: now }, { merge: true });
      transaction.set(db.collection("propertyPassports").doc(propertyDoc.id), { status: "ACTIVE", activated: true, activatedAt: now, updatedAt: now }, { merge: true });
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
      paymentMethod: method,
      paymentReferenceId,
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
      reference: paymentReferenceId,
      proofHash: invoiceHash,
      issuedAt: now,
    }, { merge: true });
    transaction.set(db.collection("audit_logs").doc(), {
      action: "ADMIN_APPROVE_PHASE1_OWNER_PAYMENT",
      actorId: actor.uid,
      actorEmail: actor.email,
      paymentId,
      contractId,
      intakeId,
      ownerUid,
      paymentReferenceId,
      amountReceived: expectedAmount,
      receiptStoragePath: text(freshPayment.paymentProofPath || freshPayment.receiptPath),
      receiptHash: text(freshPayment.paymentProofHash || freshPayment.receiptHash),
      receiptGeneration: text(freshPayment.paymentProofGeneration || freshPayment.receiptGeneration),
      createdAt: now,
    });
    transaction.set(db.collection("notifications").doc(), {
      userId: ownerUid,
      toRole: "owner",
      type: "OWNER_PHASE1_ACTIVATED",
      title: "Owner dashboard activated",
      body: "Your exact 15% Cash/Cheque payment was verified. Your BIN GROUP Owner dashboard, contract and properties are now active.",
      read: false,
      createdAt: now,
    });
    if (payment.ownerEmail) {
      transaction.set(db.collection("mail").doc(`owner_payment_approved_${paymentId}`), {
        to: lower(payment.ownerEmail),
        message: {
          from: "BIN GROUP <ceo@bin-groups.com>",
          replyTo: "BIN GROUP Admin <ceo@bin-groups.com>",
          subject: "BIN GROUP Payment Verified - Owner Dashboard Activated",
          html: `<p>Dear ${signatureName || "Owner"},</p><p><b>Your exact 15% Cash/Cheque payment has been verified and your Owner dashboard is now active.</b></p><p>You can now access your property passport, contract, documents, tickets, tenants and financial records.</p><p>BIN GROUP - Made in UAE 🇦🇪</p>`,
        },
        metadata: { type: "owner_phase1_payment_approved", paymentId, contractId, intakeId, ownerUid, invoiceId, invoiceProofHash: invoiceHash },
        createdAt: now,
      }, { merge: true });
    }
    commissionContract = contract;
  });

  if (!idempotent && commissionContract && commissionContract.commissionGenerated !== true) {
    try {
      const commissionResult = await createBrokerCommissionForContract(contractId, commissionContract, { amountReceived: expectedAmount, annualContractValue: expectedAnnual });
      if (commissionResult) {
        await contractRef.set({ commissionGenerated: true, commissionId: commissionResult.commissionId, updatedAt: ts() }, { merge: true });
      }
    } catch (error) {
      console.error("Broker commission creation failed after Phase 1 activation (non-fatal):", error);
    }
  }
  return { status: "SUCCESS", paymentId, contractId, intakeId, ownerUid, idempotent, workflowVersion: WORKFLOW_VERSION, dashboardUnlocked: true };
}

export const adminApprovePayment = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    const actor = await requireMfaFinanceAdmin(request.auth);
    const paymentId = resolvePaymentId(request.data);
    if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");
    const gate = await assertOwnerActivationGate(paymentId);
    if (text(gate.payment.workflowVersion) === WORKFLOW_VERSION) {
      return activatePhase1Owner(paymentId, gate.payment, actor, request.data);
    }
    const legacyRunner = (legacyAdminApprovePayment as any).run;
    if (typeof legacyRunner !== "function") throw new HttpsError("internal", "The protected payment approval handler is unavailable.");
    return legacyRunner(request);
  },
);

export const adminRejectPayment = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    await requireMfaFinanceAdmin(request.auth);
    const paymentId = resolvePaymentId(request.data);
    if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");
    const legacyRunner = (legacyAdminRejectPayment as any).run;
    if (typeof legacyRunner !== "function") throw new HttpsError("internal", "The protected payment rejection handler is unavailable.");
    return legacyRunner(request);
  },
);
