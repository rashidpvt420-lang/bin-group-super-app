import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { normalizeAedMoney } from "./shared/aedMoney";
import {
  adminApprovePayment as legacyAdminApprovePayment,
  adminRejectPayment as legacyAdminRejectPayment,
} from "./paymentTransactionApproval";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";
import {
  OwnerActivationPaymentPolicyError,
  resolveStoredOwnerActivationPaymentBinding,
} from "./ownerActivationPaymentPolicy";
import { hasDispatchReadyPropertyGeo } from "./propertyGeoAuthority";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const PHASE1_RENT_PAYMENT_METHODS = new Set(["CASH", "CHEQUE"]);
const FINANCE_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "finance_admin"]);

const text = (value: unknown) => String(value || "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const lower = (value: unknown) => text(value).toLowerCase();

const isRentCollectionPayment = (payment: any) =>
  upper(payment?.recordType) === "OWNER_RENT_PAYMENT" ||
  upper(payment?.recordType) === "TENANT_RENT_PAYMENT_PROOF" ||
  upper(payment?.transactionType) === "RENT_COLLECTION" ||
  upper(payment?.transactionType) === "RENT_PAYMENT_PROOF" ||
  upper(payment?.paymentType) === "RENT_COLLECTION";

const resolvePaymentId = (data: any) => text(data?.paymentId || data?.id);

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
  if (!authorized || token.suspended === true) {
    throw new HttpsError("permission-denied", "Finance Admin authority is required.");
  }
  if (token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified Admin MFA session is required for payment decisions.");
  }
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled || !record.emailVerified || !record.email) {
    throw new HttpsError("permission-denied", "The Admin account is not active and verified.");
  }
}


export const isPropertyLocationActivationReady = (property: any) =>
  hasDispatchReadyPropertyGeo(property);

async function assertOwnerActivationGate(paymentId: string) {
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = paymentSnap.data() || {};
  const method = upper(payment.paymentMethod || payment.method);
  if (isRentCollectionPayment(payment)) {
    if (!PHASE1_RENT_PAYMENT_METHODS.has(method)) {
      throw new HttpsError("failed-precondition", "Phase 1 rent payments may be approved only when recorded as Cash or Cheque.");
    }
    return;
  }

  const intakeId = text(payment.intakeId);
  const ownerUid = text(payment.ownerUid || payment.ownerId);
  if (!intakeId || !ownerUid) {
    throw new HttpsError("failed-precondition", "Payment is not bound to an owner onboarding intake.");
  }

  if (upper(payment.workflowVersion) === "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1") {
    if (payment.inspectionVerified !== true) {
      throw new HttpsError("failed-precondition", "Every property visit must be verified before final payment approval.");
    }
    const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
    if (!intakeSnap.exists) throw new HttpsError("failed-precondition", "The five-page Owner intake is missing.");
    const intake = intakeSnap.data() || {};
    const properties = Array.isArray(intake.properties) ? intake.properties : [];
    const inspectionIds = Array.isArray(intake.inspectionIds)
      ? Array.from(new Set(intake.inspectionIds.map((value: unknown) => text(value)).filter(Boolean)))
      : [];
    if (upper(intake.inspectionStatus) !== "COMPLETED" || !properties.length || inspectionIds.length !== properties.length) {
      throw new HttpsError("failed-precondition", "All portfolio inspections must be completed and linked before final approval.");
    }
    const inspectionSnaps = await Promise.all(inspectionIds.map((inspectionId: string) => db.collection("property_inspections").doc(inspectionId).get()));
    const invalidInspection = inspectionSnaps.find((snapshot) => {
      const value = snapshot.data() || {};
      return !snapshot.exists ||
        text(value.intakeId) !== intakeId ||
        upper(value.status) !== "COMPLETED" ||
        upper(value.evidenceStatus) !== "VERIFIED" ||
        !/^[a-f0-9]{64}$/i.test(text(value.evidenceHash)) ||
        !text(value.evidenceGeneration) ||
        value.arrivalLocation?.withinRadius !== true ||
        value.checklistVerified !== true;
    });
    if (invalidInspection) {
      throw new HttpsError("failed-precondition", "A property visit is missing verified GPS, checklist, photo evidence, or completion proof.");
    }
    if (!/^[a-f0-9]{64}$/i.test(text(payment.paymentProofHash || payment.receiptHash)) ||
        !text(payment.paymentProofGeneration || payment.receiptGeneration)) {
      throw new HttpsError("failed-precondition", "Immutable 15% receipt evidence is required before final approval.");
    }
  }

  const propertySnap = await db.collection("properties").where("intakeId", "==", intakeId).limit(100).get();
  if (propertySnap.empty) {
    throw new HttpsError("failed-precondition", "No property records are bound to this onboarding intake.");
  }

  const invalidProperties = propertySnap.docs.filter((propertyDoc) => {
    const property = propertyDoc.data() || {};
    const boundOwner = text(property.ownerUid || property.ownerId);
    return boundOwner !== ownerUid || !isPropertyLocationActivationReady(property);
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new HttpsError(
      "failed-precondition",
      "Owner activation is blocked until every property location is verified and dispatch-ready.",
    );
  }

  const activeConfiguration = await loadActivePaymentConfiguration();
  if (!activeConfiguration.approvedMethods.includes(method)) {
    throw new HttpsError(
      "failed-precondition",
      "This Owner activation payment method is not approved by the active Phase 1 corporate payment policy.",
    );
  }
  try {
    const policyBinding = resolveStoredOwnerActivationPaymentBinding(payment, activeConfiguration);
    const submittedVersion = policyBinding.paymentConfigVersion;
    const submittedHash = policyBinding.paymentConfigHash;
    if (
      submittedVersion !== activeConfiguration.version ||
      submittedHash !== activeConfiguration.configHash
    ) {
      throw new OwnerActivationPaymentPolicyError(
        "STALE_POLICY_BINDING",
        "The stored Owner payment policy binding changed during approval.",
      );
    }
  } catch (error) {
    if (!(error instanceof OwnerActivationPaymentPolicyError)) throw error;
    throw new HttpsError(
      "failed-precondition",
      "The payment instructions used for this submission are missing, expired or no longer approved. Generate a new payment manifest.",
    );
  }
}

export const adminApprovePayment = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    await requireMfaFinanceAdmin(request.auth);
    const paymentId = resolvePaymentId(request.data);
    if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");

    await assertOwnerActivationGate(paymentId);

    const legacyRunner = (legacyAdminApprovePayment as any).run;
    if (typeof legacyRunner !== "function") {
      throw new HttpsError("internal", "The protected payment approval handler is unavailable.");
    }
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
    if (typeof legacyRunner !== "function") {
      throw new HttpsError("internal", "The protected payment rejection handler is unavailable.");
    }
    return legacyRunner(request);
  },
);


export const adminRecordOwnerPaymentRefund = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    await requireMfaFinanceAdmin(request.auth);
    const paymentId = text(request.data?.paymentId);
    const refundReferenceId = text(request.data?.refundReferenceId || request.data?.reference);
    const note = text(request.data?.note || request.data?.reason);
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(paymentId)) {
      throw new HttpsError("invalid-argument", "A valid canonical paymentId is required.");
    }
    if (refundReferenceId.length < 4) {
      throw new HttpsError("invalid-argument", "A durable Cash/Cheque refund reference is required.");
    }
    if (note.length < 8) {
      throw new HttpsError("invalid-argument", "A refund audit note of at least 8 characters is required.");
    }

    const paymentRef = db.collection("payment_transactions").doc(paymentId);
    const refundId = `refund_${paymentId}`;
    const refundRef = db.collection("payment_transactions").doc(refundId);
    const actorId = request.auth!.uid;
    const actorEmail = text(request.auth?.token?.email).toLowerCase();

    return db.runTransaction(async (transaction) => {
      const paymentSnap = await transaction.get(paymentRef);
      if (!paymentSnap.exists) throw new HttpsError("not-found", "Approved Owner payment not found.");
      const payment = paymentSnap.data() || {};
      const method = upper(payment.paymentMethod || payment.method);
      const paymentState = upper(payment.paymentStatus || payment.status);
      if (payment.paymentVerified !== true || !["APPROVED", "PAID", "VERIFIED"].includes(paymentState)) {
        throw new HttpsError("failed-precondition", "Only an approved Owner activation payment can be refunded.");
      }
      if (!["CASH", "CHEQUE"].includes(method)) {
        throw new HttpsError("failed-precondition", "Phase 1 refunds may be recorded only for Cash or Cheque payments.");
      }

      let refundAmount: number;
      try {
        refundAmount = normalizeAedMoney(
          payment.amountReceived ?? payment.amount ?? payment.activationDeposit,
        );
      } catch {
        throw new HttpsError("failed-precondition", "The approved payment has no valid locked AED amount.");
      }
      if (refundAmount <= 0) {
        throw new HttpsError("failed-precondition", "The approved payment has no refundable amount.");
      }

      const existingRefundSnap = await transaction.get(refundRef);
      if (existingRefundSnap.exists) {
        const existing = existingRefundSnap.data() || {};
        if (
          text(existing.originalPaymentId) === paymentId &&
          Number(existing.refundAmount) === refundAmount &&
          text(existing.refundReferenceId) === refundReferenceId &&
          upper(existing.status) === "REFUNDED"
        ) {
          return { status: "SUCCESS", paymentId, refundId, refundAmount, currency: "AED", idempotent: true };
        }
        throw new HttpsError("already-exists", "This payment already has different refund evidence.");
      }
      if (upper(payment.refundStatus) === "FULL_REFUND_RECORDED") {
        throw new HttpsError("already-exists", "This payment is already marked as fully refunded.");
      }

      const contractId = text(payment.contractId);
      const invoiceId = text(payment.invoiceId);
      const contractRef = contractId ? db.collection("contracts").doc(contractId) : null;
      const invoiceRef = invoiceId ? db.collection("invoices").doc(invoiceId) : null;
      const now = admin.firestore.FieldValue.serverTimestamp();

      transaction.create(refundRef, {
        paymentId: refundId,
        recordType: "REFUND",
        transactionType: "OWNER_ACTIVATION_REFUND",
        originalPaymentId: paymentId,
        contractId: contractId || null,
        intakeId: text(payment.intakeId) || null,
        invoiceId: invoiceId || null,
        ownerUid: text(payment.ownerUid || payment.ownerId) || null,
        ownerId: text(payment.ownerId || payment.ownerUid) || null,
        currency: "AED",
        paymentMethod: method,
        method,
        amount: -refundAmount,
        refundAmount,
        refundReferenceId,
        refundNote: note,
        status: "REFUNDED",
        paymentStatus: "REFUNDED",
        refundStatus: "FULL_REFUND_RECORDED",
        paymentVerified: false,
        verified: true,
        source: "ADMIN_RECORDED_PHASE1_MANUAL_REFUND",
        recordedBy: actorId,
        recordedByEmail: actorEmail || null,
        recordedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      transaction.set(paymentRef, {
        refundStatus: "FULL_REFUND_RECORDED",
        refundedAmount: refundAmount,
        refundRecordId: refundId,
        refundReferenceId,
        refundReviewRequired: false,
        financialDisposition: "FULL_REFUND_RECORDED",
        refundedBy: actorId,
        refundedAt: now,
        updatedAt: now,
      }, { merge: true });

      if (contractRef) {
        transaction.set(contractRef, {
          refundStatus: "FULL_REFUND_RECORDED",
          refundedAmount: refundAmount,
          refundRecordId: refundId,
          refundReferenceId,
          refundReviewRequired: false,
          financialDisposition: "FULL_REFUND_RECORDED",
          updatedAt: now,
        }, { merge: true });
      }
      if (invoiceRef) {
        transaction.set(invoiceRef, {
          refundStatus: "FULL_REFUND_RECORDED",
          refundedAmount: refundAmount,
          refundRecordId: refundId,
          refundReferenceId,
          updatedAt: now,
        }, { merge: true });
      }

      transaction.set(db.collection("audit_logs").doc(), {
        action: "ADMIN_RECORD_OWNER_PAYMENT_FULL_REFUND",
        actorId,
        actorEmail: actorEmail || null,
        paymentId,
        refundId,
        contractId: contractId || null,
        invoiceId: invoiceId || null,
        refundAmount,
        currency: "AED",
        paymentMethod: method,
        refundReferenceId,
        note,
        createdAt: now,
      });

      return { status: "SUCCESS", paymentId, refundId, refundAmount, currency: "AED", idempotent: false };
    });
  },
);
