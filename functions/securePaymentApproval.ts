import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  adminApprovePayment as legacyAdminApprovePayment,
  adminRejectPayment as legacyAdminRejectPayment,
} from "./paymentTransactionApproval";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
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
  if (!authorized || token.suspended === true) {
    throw new HttpsError("permission-denied", "Finance Admin authority is required.");
  }
  if (token.email_verified !== true || !hasMfa(token)) {
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

async function assertPhase1InspectionAndEvidenceGate(paymentId: string, payment: any) {
  const intakeId = text(payment.intakeId);
  const ownerUid = text(payment.ownerUid || payment.ownerId);
  if (!intakeId || !ownerUid) throw new HttpsError("failed-precondition", "Payment is not bound to an Owner onboarding intake.");
  if (payment.inspectionVerified !== true) throw new HttpsError("failed-precondition", "All property visits must be verified before final approval.");

  const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
  if (!intakeSnap.exists) throw new HttpsError("failed-precondition", "The Owner onboarding intake is missing.");
  const intake = intakeSnap.data() || {};
  const properties = Array.isArray(intake.properties) ? intake.properties : [];
  const inspectionIds = Array.isArray(intake.inspectionIds)
    ? Array.from(new Set(intake.inspectionIds.map(text).filter(Boolean)))
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

  const expectedPropertyIds = new Set(properties.map((property: any) => text(property.propertyId || property.id)).filter(Boolean));
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
  if (text(metadata.generation) !== proofGeneration || lower(metadata.metadata?.sha256) !== proofHash) {
    throw new HttpsError("failed-precondition", "Stored payment receipt evidence failed its integrity check.");
  }
}

async function assertOwnerActivationGate(paymentId: string) {
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");

  const payment = paymentSnap.data() || {};
  if (isRentCollectionPayment(payment)) return;

  const intakeId = text(payment.intakeId);
  const ownerUid = text(payment.ownerUid || payment.ownerId);
  if (!intakeId || !ownerUid) throw new HttpsError("failed-precondition", "Payment is not bound to an Owner onboarding intake.");

  if (text(payment.workflowVersion) === WORKFLOW_VERSION) {
    await assertPhase1InspectionAndEvidenceGate(paymentId, payment);
  }

  const propertySnap = await db.collection("properties").where("intakeId", "==", intakeId).limit(100).get();
  if (propertySnap.empty) throw new HttpsError("failed-precondition", "No property records are bound to this onboarding intake.");

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
    throw new HttpsError("failed-precondition", "Owner activation is blocked until every property location is verified and dispatch-ready.");
  }

  const method = upper(payment.paymentMethod || payment.method);
  const manualMethods = text(payment.workflowVersion) === WORKFLOW_VERSION ? PHASE1_PAYMENT_METHODS : LEGACY_MANUAL_PAYMENT_METHODS;
  if (manualMethods.has(method)) {
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
      throw new HttpsError("failed-precondition", "The payment configuration evidence is missing, stale or no longer approved. Record a new receipt against the active configuration.");
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
