import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  adminApprovePayment as legacyAdminApprovePayment,
  adminRejectPayment as legacyAdminRejectPayment,
} from "./paymentTransactionApproval";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const MANUAL_PAYMENT_METHODS = new Set(["BANK_TRANSFER", "CHEQUE", "CASH"]);
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

async function assertOwnerActivationGate(paymentId: string) {
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = paymentSnap.data() || {};
  if (isRentCollectionPayment(payment)) return;

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

  const method = upper(payment.paymentMethod || payment.method);
  if (MANUAL_PAYMENT_METHODS.has(method)) {
    const activeConfiguration = await loadActivePaymentConfiguration();
    const manifest = payment.paymentManifest || {};
    const submittedVersion = text(
      payment.paymentConfigVersion ||
      payment.paymentConfigurationVersion ||
      manifest.configVersion ||
      manifest.paymentConfigVersion,
    );
    const submittedHash = text(
      payment.paymentConfigHash ||
      payment.paymentConfigurationHash ||
      manifest.configHash ||
      manifest.paymentConfigHash,
    );

    if (
      submittedVersion !== activeConfiguration.version ||
      submittedHash !== activeConfiguration.configHash ||
      !activeConfiguration.approvedMethods.includes(method)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "The payment instructions used for this submission are missing, expired or no longer approved. Generate a new payment manifest.",
      );
    }
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
