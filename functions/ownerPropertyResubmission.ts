import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { assertOnboardingTransition, normalizeOnboardingState } from "./onboardingStateMachine";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();
const finiteCoordinate = (value: unknown, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

async function requireVerifiedOwner(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const token = request.auth.token || {};
  const role = lower(token.role || token.userRole || token.primaryRole, 80);
  if (role !== "owner" || token.email_verified !== true || token.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active Owner account is required.");
  }
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled || !user.emailVerified) {
    throw new HttpsError("permission-denied", "The Owner account is not active and verified.");
  }
  return request.auth.uid as string;
}

function ownerBound(data: Record<string, any>, uid: string) {
  return text(data.ownerId || data.ownerUid, 240) === uid;
}

function optionalSubmittedGeo(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "submittedGeo must be an object.");
  }
  const geo = value as Record<string, unknown>;
  const lat = finiteCoordinate(geo.lat ?? geo.latitude, -90, 90);
  const lng = finiteCoordinate(geo.lng ?? geo.longitude, -180, 180);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    throw new HttpsError("invalid-argument", "A valid submitted location is required.");
  }
  return {
    lat,
    lng,
    address: text(geo.address, 500),
    placeId: text(geo.placeId, 220) || null,
    source: "owner_submission",
    verified: false,
    dispatchReady: false,
    requiresGeoReview: true,
    verifiedBy: null,
    verifiedAt: null,
  };
}

export const resubmitOwnerProperty = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    const ownerUid = await requireVerifiedOwner(request);
    const propertyId = text(request.data?.propertyId, 240);
    const note = text(request.data?.note || request.data?.resubmissionNote, 1200);
    const submittedGeo = optionalSubmittedGeo(request.data?.submittedGeo);

    if (!propertyId) throw new HttpsError("invalid-argument", "propertyId is required.");
    if (note.length < 3) throw new HttpsError("invalid-argument", "A short resubmission note is required.");

    const propertyRef = db.collection("properties").doc(propertyId);

    return db.runTransaction(async (transaction) => {
      const propertySnap = await transaction.get(propertyRef);
      if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");

      const property = propertySnap.data() || {};
      if (!ownerBound(property, ownerUid)) {
        throw new HttpsError("permission-denied", "This property belongs to another owner.");
      }
      if (text(property.workflowVersion, 120) !== WORKFLOW_VERSION) {
        throw new HttpsError("failed-precondition", "Only the canonical inspection-first property workflow can be resubmitted.");
      }

      const propertyState = normalizeOnboardingState(
        property.lifecycleStatus || property.onboardingState || property.status,
      );
      if (propertyState !== "CHANGES_REQUESTED") {
        throw new HttpsError(
          "failed-precondition",
          "Owner resubmission is allowed only from CHANGES_REQUESTED.",
        );
      }
      assertOnboardingTransition(propertyState, "UNDER_REVIEW");

      const intakeId = text(property.intakeId, 240);
      if (!intakeId) {
        throw new HttpsError("failed-precondition", "The canonical intake binding is missing.");
      }
      const intakeRef = db.collection("intake_submissions").doc(intakeId);
      const intakeSnap = await transaction.get(intakeRef);
      if (!intakeSnap.exists) throw new HttpsError("failed-precondition", "The linked Owner intake is missing.");
      const intake = intakeSnap.data() || {};
      if (!ownerBound(intake, ownerUid)) {
        throw new HttpsError("permission-denied", "The linked intake belongs to another owner.");
      }
      if (text(intake.workflowVersion, 120) !== WORKFLOW_VERSION) {
        throw new HttpsError("failed-precondition", "The linked intake is not the canonical inspection-first workflow.");
      }
      const intakeState = normalizeOnboardingState(
        intake.lifecycleStatus || intake.onboardingState || intake.status,
      );
      if (intakeState !== "CHANGES_REQUESTED") {
        throw new HttpsError(
          "failed-precondition",
          "The linked intake must also be CHANGES_REQUESTED before resubmission.",
        );
      }
      assertOnboardingTransition(intakeState, "UNDER_REVIEW");

      const now = admin.firestore.FieldValue.serverTimestamp();
      const count = admin.firestore.FieldValue.increment(1);
      const commonPatch = {
        lifecycleStatus: "UNDER_REVIEW",
        onboardingState: "UNDER_REVIEW",
        status: "UNDER_REVIEW",
        adminApproved: false,
        approved: false,
        resubmittedAt: now,
        resubmittedBy: ownerUid,
        resubmissionCount: count,
        ownerResubmissionNote: note,
        updatedAt: now,
      };

      transaction.update(propertyRef, {
        ...commonPatch,
        ...(submittedGeo ? { submittedGeo } : {}),
      });
      transaction.update(intakeRef, commonPatch);

      const auditRef = db.collection("audit_logs").doc();
      transaction.set(auditRef, {
        action: "OWNER_PROPERTY_RESUBMITTED",
        actorId: ownerUid,
        actorRole: "owner",
        targetType: "properties",
        targetId: propertyId,
        propertyId,
        intakeId,
        workflowVersion: WORKFLOW_VERSION,
        fromState: "CHANGES_REQUESTED",
        toState: "UNDER_REVIEW",
        submittedGeoUpdated: Boolean(submittedGeo),
        createdAt: now,
      });

      return {
        success: true,
        propertyId,
        intakeId,
        fromState: "CHANGES_REQUESTED",
        state: "UNDER_REVIEW",
        submittedGeoVerified: false,
        dispatchReady: false,
      };
    });
  },
);
