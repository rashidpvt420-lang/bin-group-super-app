import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  adminApprovePayment as legacyAdminApprovePayment,
  adminRejectPayment,
} from "./paymentTransactionApproval";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const MANUAL_PAYMENT_METHODS = new Set(["BANK_TRANSFER", "CHEQUE", "CASH"]);

const text = (value: unknown) => String(value || "").trim();
const upper = (value: unknown) => text(value).toUpperCase();

const isRentCollectionPayment = (payment: any) =>
  upper(payment?.recordType) === "OWNER_RENT_PAYMENT" ||
  upper(payment?.recordType) === "TENANT_RENT_PAYMENT_PROOF" ||
  upper(payment?.transactionType) === "RENT_COLLECTION" ||
  upper(payment?.transactionType) === "RENT_PAYMENT_PROOF" ||
  upper(payment?.paymentType) === "RENT_COLLECTION";

const resolvePaymentId = (data: any) => text(data?.paymentId || data?.id);

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

export { adminRejectPayment };
