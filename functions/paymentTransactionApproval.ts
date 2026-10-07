import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { createBrokerCommissionForContract } from "./brokerCommissions";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { assertStoredOwnerPaymentReceipt, assertStoredTenantPaymentReceipt } from "./paymentReceiptEvidence";
import { normalizeAedMoney } from "./shared/aedMoney";
import { parseExactAedAmount } from "./shared/aedMoneyInput";
import { decideRentConfirmedAmount, rentApprovalDecision, rentRejectionDecision } from "./rentPaymentStatus";
import { generateMobilizationUnpaidInvoicePdfArtifact, generateOwnerPaymentReceiptPdfArtifact } from "./pdfEngine";
import { assertMobilizationInvoiceImmutable, buildMobilizationInvoiceSnapshot } from "./mobilizationInvoice";
import { resolveActivePaymentConfiguration } from "./paymentConfiguration";
import {
  assertOwnerOnboardingTransition,
  ownerOnboardingStatePatch,
  resolveOwnerOnboardingState,
  type OwnerOnboardingState,
} from "./ownerOnboardingLifecycle";
import {
  OwnerActivationPaymentPolicyError,
  resolveLockedOwnerActivationSchedule,
} from "./ownerActivationPaymentPolicy";
import { assertPaymentDualControl, PaymentDualControlError, paymentEvidenceRecorderUid } from "./paymentDualControl";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();

const roleOf = (value: unknown) => String(value || "").trim().toLowerCase();
const upper = (value: unknown) => String(value || "").trim().toUpperCase();
const money = normalizeAedMoney;
const ADMIN_ROLES = new Set(["admin", "ceo", "super_admin", "operations_admin", "finance_admin"]);

function lockedActivationSchedule(
  source: Record<string, any>,
  submittedAmount: unknown,
  errorCode: "failed-precondition" | "aborted",
  errorMessage: string,
) {
  try {
    return resolveLockedOwnerActivationSchedule(source, submittedAmount);
  } catch (error) {
    if (error instanceof OwnerActivationPaymentPolicyError) {
      throw new HttpsError(errorCode, errorMessage);
    }
    throw error;
  }
}

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

const INSPECTION_FIRST_WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";

/**
 * F-5: for inspection-first Owner applications, activation and rejection are lifecycle
 * transitions asserted against the transactionally-read intake / contract / payment.
 * Other (legacy / rent) payment kinds are not part of this lifecycle and return null.
 */
function assertInspectionFirstPaymentTransition(
  intakeSnap: FirebaseFirestore.DocumentSnapshot | null,
  contract: any,
  payment: any,
  to: OwnerOnboardingState,
): OwnerOnboardingState | null {
  const inspectionFirst = String(payment?.workflowVersion || "").trim() === INSPECTION_FIRST_WORKFLOW_VERSION ||
    String(contract?.workflowVersion || "").trim() === INSPECTION_FIRST_WORKFLOW_VERSION ||
    String(intakeSnap?.data()?.workflowVersion || "").trim() === INSPECTION_FIRST_WORKFLOW_VERSION;
  if (!inspectionFirst) return null;
  if (!intakeSnap?.exists) throw new HttpsError("failed-precondition", "The Owner application for this payment is missing.");
  const from = resolveOwnerOnboardingState({ intake: intakeSnap.data() || {}, contract, payment });
  assertOwnerOnboardingTransition(from, to, "finance_admin");
  return from;
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

// D-5: a refused approval is itself an audited payment decision.
async function auditDualControlRefusal(
  paymentId: string,
  actorId: string,
  actorEmail: string | null,
  error: PaymentDualControlError,
  stage: "PRE_CHECK" | "TRANSACTION",
) {
  await db.collection("audit_logs").add({
    action: "ADMIN_APPROVE_PAYMENT_REFUSED_DUAL_CONTROL",
    actorId,
    actorEmail,
    targetType: "payment_transactions",
    targetId: paymentId,
    paymentId,
    reason: `DUAL_CONTROL_${error.violation}`,
    evidenceRecordedBy: error.recorderUid || null,
    stage,
    createdAt: ts(),
  });
}

export const adminApprovePayment = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  await requireAdmin(request.auth);
  await requirePrivilegedMfaSession(request.auth);

  const paymentId = resolvePaymentId(request.data);
  if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");

  const ref = db.collection("payment_transactions").doc(paymentId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = snap.data() || {};
  const paymentReferenceId = String(request.data?.paymentReferenceId || request.data?.referenceId || payment.paymentReference || payment.paymentReferenceId || "").trim();
  const notes = String(request.data?.notes || request.data?.internalNotes || "Approved by admin.").trim();
  const method = String(request.data?.method || payment.paymentMethod || "").trim();
  const receivedAt = String(request.data?.receivedAt || "").trim();
  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;

  if (isRentCollectionPayment(payment)) {
    const initialApprovalDecision = rentApprovalDecision(payment);
    if (initialApprovalDecision === "replay") {
      return {
        status: "SUCCESS",
        paymentId,
        paymentKind: "RENT_COLLECTION",
        idempotent: true,
      };
    }
    if (initialApprovalDecision === "refuse_rejected") {
      throw new HttpsError(
        "failed-precondition",
        "A rejected rent payment cannot be approved. Record a new rent payment instead of reopening a rejected ledger row.",
      );
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
      request.data?.amountReceived !== undefined &&
      request.data?.amountReceived !== null &&
      String(request.data.amountReceived).trim() !== ""
    ) {
      try {
        parseExactAedAmount(request.data.amountReceived);
      } catch {
        throw new HttpsError("invalid-argument", "Received amount must be a finite AED value exact to the fils (at most 2 decimals).");
      }
      const amountDecision = decideRentConfirmedAmount(
        payment.amount || payment.amountPaid || payment.rentPaid,
        request.data.amountReceived,
      );
      if (amountDecision === "invalid") {
        throw new HttpsError("invalid-argument", "Received amount must be a finite AED value.");
      }
      if (amountDecision === "mismatch") {
        throw new HttpsError("failed-precondition", "Admin approval cannot alter the tenant or owner submitted rent amount.");
      }
    }
    // The payment method is part of the submitted evidence; Admin approval confirms it, never changes it.
    const storedRentMethod = String(payment.paymentMethod || payment.method || "").trim().toUpperCase();
    if (method && storedRentMethod && method.toUpperCase() !== storedRentMethod) {
      throw new HttpsError("failed-precondition", "Admin approval cannot alter the submitted rent payment method.");
    }
    const isTenantProof = String(payment.recordType || "").trim().toUpperCase() === "TENANT_RENT_PAYMENT_PROOF";
    const receiptEvidence = isTenantProof
      ? await assertStoredTenantPaymentReceipt({
        tenantId: String(payment.tenantId || payment.tenantUid || "").trim(),
        storagePath: submittedProofPath,
        expectedHash: submittedProofHash,
      })
      : await assertStoredOwnerPaymentReceipt({
        ownerUid: rentOwnerUid,
        paymentId,
        storagePath: submittedProofPath,
        expectedHash: submittedProofHash,
      });
    let rentApprovalIdempotent = false;
    await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(ref);
      if (!freshSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
      const decision = rentApprovalDecision(freshSnap.data() || {});
      if (decision === "replay") {
        rentApprovalIdempotent = true;
        return;
      }
      if (decision === "refuse_rejected") {
        throw new HttpsError(
          "failed-precondition",
          "A rejected rent payment cannot be approved. Record a new rent payment instead of reopening a rejected ledger row.",
        );
      }
      transaction.set(ref, {
        status: "APPROVED",
        paymentStatus: "APPROVED",
        verificationState: "ADMIN_VERIFIED",
        paymentVerified: true,
        approved: true,
        paymentReferenceId: submittedReference,
        amountReceived: submittedRentAmount,
        receiptEvidence,
        paymentMethod: storedRentMethod || method || null,
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
      idempotent: rentApprovalIdempotent,
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
  // D-5: an Admin who recorded the payment evidence may not approve it (four-eyes).
  // Checked before any invoice repair or receipt read, then re-checked on the fresh
  // payment inside the approval transaction. Refusals are audited.
  if (!alreadyApproved) {
    try {
      assertPaymentDualControl(payment, actorId);
    } catch (error) {
      if (error instanceof PaymentDualControlError) {
        await auditDualControlRefusal(paymentId, actorId, actorEmail, error, "PRE_CHECK");
      }
      throw error;
    }
  }
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
  const storedPaymentAmount = payment.amount ?? payment.activationDeposit;
  const contractSchedule = lockedActivationSchedule(
    contractData,
    storedPaymentAmount,
    "failed-precondition",
    "The locked 15% mobilization schedule is invalid.",
  );
  const paymentSchedule = lockedActivationSchedule(
    payment,
    storedPaymentAmount,
    "failed-precondition",
    "The payment transaction does not match the locked 15% mobilization schedule.",
  );
  if (
    paymentSchedule.annualContractValue !== contractSchedule.annualContractValue ||
    paymentSchedule.mobilizationAmount !== contractSchedule.mobilizationAmount
  ) {
    throw new HttpsError("failed-precondition", "The locked 15% mobilization schedule is invalid.");
  }
  const expectedAnnual = contractSchedule.annualContractValue;
  const expectedAmount = contractSchedule.mobilizationAmount;
  if (request.data?.amountReceived !== undefined && request.data?.amountReceived !== null) {
    let submittedAmount: number;
    try {
      submittedAmount = money(parseExactAedAmount(request.data.amountReceived));
    } catch {
      throw new HttpsError("invalid-argument", "Received amount must be a finite AED value exact to the fils (at most 2 decimals).");
    }
    if (submittedAmount <= 0 || submittedAmount !== expectedAmount) {
      throw new HttpsError("failed-precondition", "Received amount does not match the locked mobilization deposit.");
    }
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
  const approvalIntakeRef = db.collection("intake_submissions").doc(intakeId);
  if (!alreadyApproved) {
    assertInspectionFirstPaymentTransition(await approvalIntakeRef.get(), contractData, payment, "ACTIVE");
  }
  const invoiceSnapshot = buildMobilizationInvoiceSnapshot({
    paymentId,
    contractId,
    intakeId,
    ownerUid,
    amount: expectedAmount,
    quoteHash: String(payment.quoteHash),
  });
  const { invoiceId, proofHash: invoiceHash } = invoiceSnapshot;
  const invoiceRef = db.collection("invoices").doc(invoiceId);
  // Approval must not fail closed solely because an earlier sign/replay missed
  // persisting the unpaid mobilisation invoice. Rebuild it from the locked
  // payment identity before the approval transaction.
  const preApproveInvoiceSnap = await invoiceRef.get();
  if (!preApproveInvoiceSnap.exists) {
    const unpaidInvoicePdf = await generateMobilizationUnpaidInvoicePdfArtifact({
      ...invoiceSnapshot,
      ownerId: ownerUid,
    });
    await invoiceRef.set({
      ...invoiceSnapshot,
      ownerId: ownerUid,
      ownerEmail: String(payment.ownerEmail || contractData.ownerEmail || "").trim() || null,
      amountPaid: 0,
      status: "PENDING",
      paymentStatus: "UNPAID",
      documentState: "AWAITING_PAYMENT",
      pdfUrl: unpaidInvoicePdf.pdfUrl,
      storagePath: unpaidInvoicePdf.storagePath,
      pdfSha256: unpaidInvoicePdf.pdfSha256,
      pdfGeneration: unpaidInvoicePdf.generation,
      canonicalPdfSource: "SERVER_PAYMENT_APPROVAL_INVOICE_REPAIR",
      issuedAt: ts(),
      createdAt: ts(),
      updatedAt: ts(),
    }, { merge: false });
    if (!String(contractData.invoiceId || "").trim()) {
      await contractRef.set({ invoiceId, updatedAt: ts() }, { merge: true });
    }
  }
  const propertyQuery = db.collection("properties").where("intakeId", "==", intakeId).limit(100);
  const paymentConfigurationRef = db.collection("system_payment_config").doc("current");
  let approvalWasIdempotent = false;
  let approvalUsesStripe = false;
  await db.runTransaction(async (transaction) => {
    const [freshPaymentSnap, freshContractSnap, propertySnap, paymentConfigurationSnap, invoiceSnap, freshIntakeSnap] = await Promise.all([
      transaction.get(ref),
      transaction.get(contractRef),
      transaction.get(propertyQuery),
      transaction.get(paymentConfigurationRef),
      transaction.get(invoiceRef),
      transaction.get(approvalIntakeRef),
    ]);
    if (!freshPaymentSnap.exists || !freshContractSnap.exists) {
      throw new HttpsError("failed-precondition", "Payment or contract disappeared during approval.");
    }
    if (!invoiceSnap.exists) {
      throw new HttpsError("failed-precondition", "The signed-contract 15% mobilisation invoice is missing.");
    }
    try {
      assertMobilizationInvoiceImmutable(invoiceSnap.data() || {}, invoiceSnapshot);
    } catch (error: any) {
      throw new HttpsError("aborted", error?.message || "The mobilisation invoice identity changed.");
    }
    if (!paymentConfigurationSnap.exists) {
      throw new HttpsError("failed-precondition", "The current payment policy is missing.");
    }
    const freshPayment = freshPaymentSnap.data() || {};
    const freshContract = freshContractSnap.data() || {};
    if (roleOf(freshPayment.status) === "approved" && roleOf(freshContract.status) === "active") {
      approvalWasIdempotent = true;
      return;
    }
    // D-5: evidence may have been re-recorded since the pre-check.
    assertPaymentDualControl(freshPayment, actorId);
    const evidenceRecordedBy = paymentEvidenceRecorderUid(freshPayment) || null;
    // F-5: activation is legal only from PAYMENT_EVIDENCE_PENDING_APPROVAL (never e.g. from a
    // pending final signature, a rejected payment, or an unrecognised state).
    const lifecycleFrom = assertInspectionFirstPaymentTransition(freshIntakeSnap, freshContract, freshPayment, "ACTIVE");
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

    const freshStoredPaymentAmount = freshPayment.amount ?? freshPayment.activationDeposit;
    const freshContractSchedule = lockedActivationSchedule(
      freshContract,
      freshStoredPaymentAmount,
      "aborted",
      "Locked payment amount changed during approval.",
    );
    const freshPaymentSchedule = lockedActivationSchedule(
      freshPayment,
      freshStoredPaymentAmount,
      "aborted",
      "Locked payment amount changed during approval.",
    );
    if (
      freshContractSchedule.annualContractValue !== expectedAnnual ||
      freshContractSchedule.mobilizationAmount !== expectedAmount ||
      freshPaymentSchedule.annualContractValue !== expectedAnnual ||
      freshPaymentSchedule.mobilizationAmount !== expectedAmount
    ) {
      throw new HttpsError("aborted", "Locked payment amount changed during approval.");
    }

    const freshMethod = upper(freshPayment.paymentMethod || freshPayment.method || normalizedMethod);
    const transactionalConfiguration = resolveActivePaymentConfiguration(paymentConfigurationSnap.data() || {});
    const freshConfigVersion = String(
      freshPayment.paymentConfigVersion ||
      freshPayment.paymentConfigurationVersion ||
      freshPayment.paymentManifest?.configVersion ||
      freshPayment.paymentManifest?.paymentConfigVersion ||
      "",
    ).trim();
    const freshConfigHash = String(
      freshPayment.paymentConfigHash ||
      freshPayment.paymentConfigurationHash ||
      freshPayment.paymentManifest?.configHash ||
      freshPayment.paymentManifest?.paymentConfigHash ||
      "",
    ).trim();
    if (
      freshConfigVersion !== transactionalConfiguration.version ||
      freshConfigHash !== transactionalConfiguration.configHash ||
      !transactionalConfiguration.approvedMethods.includes(freshMethod)
    ) {
      throw new HttpsError("aborted", "The payment policy binding changed during approval.");
    }
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
      paymentDualControl: {
        policy: "D5_RECORDER_IS_NOT_APPROVER",
        evidenceRecordedBy,
        approvedBy: actorId,
        verifiedAt: now,
      },
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
    transaction.set(approvalIntakeRef, {
      status: "ACTIVE",
      paymentStatus: "APPROVED",
      activationState: "ACTIVE",
      approvedAt: now,
      approvedBy: actorId,
      ...(lifecycleFrom ? ownerOnboardingStatePatch(lifecycleFrom, "ACTIVE", "finance_admin", actorId, now) : {}),
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
      if (property.geo?.verified === false) {
        throw new HttpsError(
          "failed-precondition",
          `Location verification is outstanding for property: ${property.address || propertyDoc.id}. Activation blocked.`,
        );
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

    transaction.set(invoiceRef, {
      amountPaid: expectedAmount,
      status: "PAID",
      paymentStatus: "PAID",
      documentState: "PAID_RECEIPT_PENDING",
      paymentMethod: normalizedMethod,
      paymentReferenceId: manualReference || payment.stripeSessionId,
      paidAt: now,
      approvedBy: actorId,
      approvedByEmail: actorEmail,
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
      evidenceRecordedBy,
      dualControlPolicy: "D5_RECORDER_IS_NOT_APPROVER",
      paymentReferenceId: manualReference || payment.stripeSessionId,
      amountReceived: expectedAmount,
      createdAt: now,
    });
    transaction.set(db.collection("notifications").doc(`owner_payment_approved_${paymentId}`), {
      recipientId: ownerUid,
      recipientRole: "owner",
      type: "PAYMENT_APPROVED",
      title: "PAYMENT APPROVED",
      body: `Your 15% mobilisation payment of AED ${expectedAmount.toFixed(2)} is approved. Your receipt is available in Financials.`,
      link: `/invoices/${invoiceId}`,
      metadata: { paymentId, contractId, invoiceId, amount: expectedAmount, state: "PAID" },
      read: false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
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
  }).catch(async (error) => {
    // D-5: a dual-control refusal inside the transaction is audited outside it.
    if (error instanceof PaymentDualControlError) {
      await auditDualControlRefusal(paymentId, actorId, actorEmail, error, "TRANSACTION");
    }
    throw error;
  });

  const approvedInvoiceSnap = await invoiceRef.get();
  if (!approvedInvoiceSnap.exists) {
    throw new HttpsError("internal", "The approved mobilisation invoice disappeared before receipt generation.");
  }
  const approvedInvoice = approvedInvoiceSnap.data() || {};
  try {
    assertMobilizationInvoiceImmutable(approvedInvoice, invoiceSnapshot);
  } catch (error: any) {
    throw new HttpsError("aborted", error?.message || "The approved mobilisation invoice identity changed.");
  }
  const receiptMissing =
    !String(approvedInvoice.receiptPdfUrl || "").trim() ||
    !String(approvedInvoice.receiptStoragePath || "").trim();
  const receiptNeedsRepair =
    receiptMissing ||
    ["PAID_RECEIPT_PENDING", "PAID_RECEIPT_FAILED"].includes(String(approvedInvoice.documentState || "").trim().toUpperCase());
  if (receiptNeedsRepair) {
    try {
      const receiptArtifact = await generateOwnerPaymentReceiptPdfArtifact({
        ...invoiceSnapshot,
        ownerId: ownerUid,
        paymentReferenceId: manualReference || payment.stripeSessionId,
      });
      await invoiceRef.set({
        receiptPdfUrl: receiptArtifact.pdfUrl,
        receiptStoragePath: receiptArtifact.storagePath,
        receiptPdfSha256: receiptArtifact.pdfSha256,
        receiptPdfGeneration: receiptArtifact.generation,
        receiptCanonicalSource: "SERVER_PAYMENT_APPROVAL",
        documentState: "PAID_RECEIPT_READY",
        receiptPdfError: FieldValue.delete(),
        updatedAt: ts(),
      }, { merge: true });
      await db.collection("invoice_registry").doc(invoiceHash).set({
        receiptPdfSha256: receiptArtifact.pdfSha256,
        receiptStoragePath: receiptArtifact.storagePath,
        receiptCanonicalSource: "SERVER_PAYMENT_APPROVAL",
        updatedAt: ts(),
      }, { merge: true });
    } catch (receiptError: any) {
      await invoiceRef.set({
        documentState: "PAID_RECEIPT_FAILED",
        receiptPdfError: String(receiptError?.message || receiptError || "Receipt PDF generation failed").slice(0, 500),
        updatedAt: ts(),
      }, { merge: true });
      throw receiptError;
    }
  }

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

export const adminRejectPayment = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  await requireAdmin(request.auth);
  await requirePrivilegedMfaSession(request.auth);

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
    let rentRejectionIdempotent = false;
    await db.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(ref);
      if (!freshSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
      const decision = rentRejectionDecision(freshSnap.data() || {});
      if (decision === "replay") {
        rentRejectionIdempotent = true;
        return;
      }
      if (decision === "refuse_approved") {
        throw new HttpsError(
          "failed-precondition",
          "An approved rent payment cannot be rejected. Reversal requires a separate finance adjustment and must not clear paymentVerified.",
        );
      }
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

    return { status: "SUCCESS", paymentId, paymentKind: "RENT_COLLECTION", idempotent: rentRejectionIdempotent };
  }

  const { contractId, intakeId } = resolveActivationIds(paymentId, payment);
  const ownerUid = String(payment.ownerUid || payment.ownerId || "").trim();
  const contractRef = contractId ? db.collection("contracts").doc(contractId) : null;
  const userRef = ownerUid ? db.collection("users").doc(ownerUid) : null;
  const ownerRef = ownerUid ? db.collection("owners").doc(ownerUid) : null;
  const rejectionIntakeRef = intakeId ? db.collection("intake_submissions").doc(intakeId) : null;
  await db.runTransaction(async (transaction) => {
    const [freshPaymentSnap, contractSnap, userSnap, ownerSnap, rejectionIntakeSnap] = await Promise.all([
      transaction.get(ref),
      contractRef ? transaction.get(contractRef) : Promise.resolve(null),
      userRef ? transaction.get(userRef) : Promise.resolve(null),
      ownerRef ? transaction.get(ownerRef) : Promise.resolve(null),
      rejectionIntakeRef ? transaction.get(rejectionIntakeRef) : Promise.resolve(null),
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
        "An activated payment cannot be rejected. Phase 1 refunds or contract-cancellation requests require manual Finance/Admin review under the signed contract; rejection must not mutate activated financial state.",
      );
    }
    // F-5: only recorded 15% payment evidence can be rejected (not a payment that was never due).
    const rejectionLifecycleFrom = assertInspectionFirstPaymentTransition(rejectionIntakeSnap, freshContract, freshPayment, "PAYMENT_REJECTED");

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
        ...(rejectionLifecycleFrom ? ownerOnboardingStatePatch(rejectionLifecycleFrom, "PAYMENT_REJECTED", "finance_admin", actorId, now) : {}),
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

    transaction.set(db.collection("notifications").doc(`owner_payment_rejected_${paymentId}`), {
      recipientId: ownerUid,
      recipientRole: "owner",
      type: "PAYMENT_REJECTED",
      title: "PAYMENT EVIDENCE REJECTED",
      body: `Your 15% mobilisation payment evidence was rejected: ${reason}`,
      link: "/owner/payment-proof",
      metadata: { paymentId, contractId: contractId || null, reason, state: "REJECTED" },
      read: false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
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
