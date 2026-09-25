import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { buildPropertyIdentities, PROPERTY_IDENTITY_VERSION } from "./propertyIdentity";
import { hasDispatchReadyPropertyGeo } from "./propertyGeoAuthority";
import { assertOnboardingTransition } from "./onboardingStateMachine";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const OWNER_WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const CANONICAL_FOUNDER_EMAIL = "ceo@bin-groups.com";
const FOUNDER_ROLES = new Set(["ceo", "super_admin"]);

type PlainRecord = Record<string, any>;

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();
const record = (value: unknown): PlainRecord => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as PlainRecord
    : {}
);
const normalizeStatus = (value: unknown) => lower(value, 100).replace(/[\s-]+/g, "_");
const safeId = (value: unknown, fallback: string) => text(value, 240)
  .replace(/[^A-Za-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .slice(0, 160) || fallback;

const OWNER_EDITABLE_FIELDS = new Set([
  "name",
  "propertyName",
  "address",
  "propertyAddress",
  "emirate",
  "city",
  "area",
  "community",
  "googlePlaceId",
  "titleDeedNumber",
  "titleDeedId",
  "titleDeedReference",
  "propertyDocumentNumber",
  "propertyReference",
  "submittedGeo",
  "documents",
  "documentRefs",
  "titleDeedUrl",
  "floorPlanUrl",
  "photoUrls",
]);

const SERVER_RESERVED_FIELDS = new Set([
  "id",
  "propertyId",
  "clientDraftId",
  "ownerId",
  "ownerUid",
  "ownerEmail",
  "intakeId",
  "contractId",
  "workflowVersion",
  "status",
  "approvalStatus",
  "onboardingStatus",
  "activationStatus",
  "paymentStatus",
  "paymentVerified",
  "adminApproved",
  "approved",
  "contractActivated",
  "dashboardUnlocked",
  "dashboardLocked",
  "dashboardUnlockApproved",
  "unlocksDashboard",
  "activeContractId",
  "quoteHash",
  "quoteSnapshot",
  "quoteVersion",
  "inspectionId",
  "inspectionIds",
  "inspectionStatus",
  "inspectionVerified",
  "inspectionEvidenceVerified",
  "adminSiteVisitVerified",
  "locationVerified",
  "geo",
  "geoVerification",
  "geoAnchor",
  "verifiedGeo",
  "verified",
  "verifiedBy",
  "verifiedAt",
  "dispatchReady",
  "requiresGeoReview",
  "geoReviewStatus",
  "geoVerifiedAt",
  "geoVerifiedBy",
  "activatedAt",
  "approvedAt",
  "approvedBy",
  "reviewedAt",
  "reviewedBy",
  "reviewedByRole",
  "rejectedAt",
  "rejectedBy",
  "createdAt",
  "updatedAt",
]);

function roleOf(token: PlainRecord = {}) {
  const role = lower(token.role || token.userRole || token.primaryRole, 80);
  if (role) return role;
  if (token.ceo === true) return "ceo";
  if (token.super_admin === true || token.superAdmin === true) return "super_admin";
  return "";
}

async function requireVerifiedFounder(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Founder authentication is required.");
  const token = record(auth.token);
  if (lower(token.email, 320) !== CANONICAL_FOUNDER_EMAIL || !FOUNDER_ROLES.has(roleOf(token))) {
    throw new HttpsError("permission-denied", "The canonical BIN GROUP founder account is required.");
  }
  if (token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified Founder MFA session is required.");
  }
  const user = await admin.auth().getUser(auth.uid);
  if (user.disabled || !user.emailVerified || lower(user.email, 320) !== CANONICAL_FOUNDER_EMAIL) {
    throw new HttpsError("permission-denied", "The canonical Founder account is not active and verified.");
  }
  return { uid: auth.uid as string, email: lower(user.email, 320), role: roleOf(token) };
}

async function requireVerifiedOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication is required.");
  const token = record(auth.token);
  if (roleOf(token) !== "owner" || token.email_verified !== true || token.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active Owner account is required.");
  }
  const user = await admin.auth().getUser(auth.uid);
  if (user.disabled || !user.emailVerified) {
    throw new HttpsError("permission-denied", "The Owner account is not active and verified.");
  }
  return { uid: auth.uid as string, email: lower(user.email || token.email, 320) };
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpsError("invalid-argument", `A valid ${label} is required.`);
  }
  return parsed;
}

function normalizeSubmittedGeo(value: unknown, fallback: PlainRecord = {}) {
  const input = record(value);
  const lat = finiteCoordinate(input.lat ?? fallback.lat, -90, 90, "latitude");
  const lng = finiteCoordinate(input.lng ?? fallback.lng, -180, 180, "longitude");
  if (lat === 0 && lng === 0) {
    throw new HttpsError("invalid-argument", "Zero/zero coordinates are not valid property evidence.");
  }
  return {
    ...input,
    lat,
    lng,
    point: new admin.firestore.GeoPoint(lat, lng),
    address: text(input.address ?? fallback.address, 500),
    emirate: text(input.emirate ?? fallback.emirate, 120),
    city: text(input.city ?? fallback.city, 160),
    area: text(input.area ?? fallback.area, 180),
    placeId: text(input.placeId ?? fallback.placeId, 220) || null,
    quality: "OWNER_SUBMITTED_REVIEW_REQUIRED",
    source: "owner_submission",
    verified: false,
    dispatchReady: false,
    requiresGeoReview: true,
    verifiedBy: null,
    verifiedAt: null,
  };
}

function sanitizeOwnerPatch(value: unknown) {
  const input = record(value);
  const output: PlainRecord = {};
  const keys = Object.keys(input);
  if (!keys.length) throw new HttpsError("invalid-argument", "Property corrections are required.");
  for (const key of keys) {
    if (SERVER_RESERVED_FIELDS.has(key)) {
      throw new HttpsError("permission-denied", `Owner resubmission cannot change server-authoritative field: ${key}.`);
    }
    if (!OWNER_EDITABLE_FIELDS.has(key)) {
      throw new HttpsError("invalid-argument", `Unsupported Owner property correction field: ${key}.`);
    }
    output[key] = input[key];
  }
  return output;
}

function deterministicInspectionId(intakeId: string, propertyId: string) {
  const key = safeId(`${intakeId}_${propertyId}`, `${intakeId}_property`);
  return `owner_inspection_${key}`;
}

function assertPreInspectionCorrectionState(property: PlainRecord, intake: PlainRecord, inspection: PlainRecord | null) {
  if (text(property.workflowVersion) !== OWNER_WORKFLOW_VERSION || text(intake.workflowVersion) !== OWNER_WORKFLOW_VERSION) {
    throw new HttpsError("failed-precondition", "Property corrections are limited to the canonical five-page inspection-first workflow.");
  }
  if (
    hasDispatchReadyPropertyGeo(property) ||
    property.locationVerified === true ||
    property.adminSiteVisitVerified === true ||
    ["completed", "verified"].includes(normalizeStatus(property.inspectionStatus)) ||
    ["active", "approved"].includes(normalizeStatus(property.activationStatus)) ||
    ["active", "approved"].includes(normalizeStatus(property.status))
  ) {
    throw new HttpsError("failed-precondition", "A physically verified or activated property cannot return to Owner correction.");
  }
  const linkedIds = Array.isArray(intake.inspectionIds) ? intake.inspectionIds.map((value: unknown) => text(value)).filter(Boolean) : [];
  if (linkedIds.length) {
    throw new HttpsError("failed-precondition", "Owner corrections must be requested before site inspections are linked.");
  }
  if (inspection && normalizeStatus(inspection.status) !== "cancelled") {
    throw new HttpsError("failed-precondition", "A site inspection already exists for this property. Resolve that inspection instead of reopening Owner corrections.");
  }
}

export const adminRequestOwnerPropertyChanges = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireVerifiedFounder(request.auth);
    const propertyId = text(request.data?.propertyId, 240);
    const reason = text(request.data?.reason, 1000);
    if (!propertyId) throw new HttpsError("invalid-argument", "propertyId is required.");
    if (reason.length < 8) throw new HttpsError("invalid-argument", "A clear change request reason of at least 8 characters is required.");

    assertOnboardingTransition("admin_review", "changes_requested");

    const propertyRef = db.collection("properties").doc(propertyId);
    const auditRef = db.collection("audit_logs").doc();
    const notificationRef = db.collection("notifications").doc();
    const now = FieldValue.serverTimestamp();

    const result = await db.runTransaction(async (transaction) => {
      const propertySnap = await transaction.get(propertyRef);
      if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
      const property = propertySnap.data() || {};
      const ownerUid = text(property.ownerUid || property.ownerId, 240);
      const intakeId = text(property.intakeId, 240);
      if (!ownerUid || !intakeId) {
        throw new HttpsError("failed-precondition", "Property is not bound to a canonical Owner intake.");
      }

      const intakeRef = db.collection("intake_submissions").doc(intakeId);
      const inspectionRef = db.collection("property_inspections").doc(deterministicInspectionId(intakeId, propertyId));
      const paymentRef = db.collection("payment_transactions").doc(intakeId);
      const contractRef = db.collection("contracts").doc(text(property.contractId, 240) || intakeId);
      const [intakeSnap, inspectionSnap, paymentSnap, contractSnap] = await Promise.all([
        transaction.get(intakeRef),
        transaction.get(inspectionRef),
        transaction.get(paymentRef),
        transaction.get(contractRef),
      ]);
      if (!intakeSnap.exists) throw new HttpsError("failed-precondition", "Owner intake was not found.");
      const intake = intakeSnap.data() || {};
      if (text(intake.ownerUid || intake.ownerId, 240) !== ownerUid) {
        throw new HttpsError("failed-precondition", "Property and intake Owner bindings do not match.");
      }
      const propertyStatus = normalizeStatus(property.status || property.approvalStatus || property.onboardingStatus);
      if (!["pending_property_inspection", "submitted_for_property_inspection"].includes(propertyStatus)) {
        throw new HttpsError("failed-precondition", "Changes can be requested only while the property is awaiting its first physical inspection.");
      }

      assertPreInspectionCorrectionState(property, intake, inspectionSnap.exists ? (inspectionSnap.data() || {}) : null);

      transaction.set(propertyRef, {
        status: "CHANGES_REQUESTED",
        canonicalOnboardingState: "changes_requested",
        approvalStatus: "CHANGES_REQUESTED",
        onboardingStatus: "CHANGES_REQUESTED",
        inspectionStatus: "CHANGES_REQUESTED_BEFORE_SITE_VISIT",
        activationStatus: "LOCKED_PENDING_OWNER_CORRECTIONS",
        changeRequestReason: reason,
        changesRequestedAt: now,
        changesRequestedBy: actor.uid,
        changesRequestedByEmail: actor.email,
        reviewedAt: now,
        reviewedBy: actor.uid,
        reviewedByRole: actor.role,
        updatedAt: now,
      }, { merge: true });

      transaction.set(intakeRef, {
        status: "CHANGES_REQUESTED",
        canonicalOnboardingState: "changes_requested",
        adminReviewState: "CHANGES_REQUESTED_BEFORE_SITE_VISIT",
        inspectionStatus: "CHANGES_REQUESTED_BEFORE_SITE_VISIT",
        activationState: "LOCKED_PENDING_OWNER_CORRECTIONS",
        paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
        changeRequestPropertyId: propertyId,
        changeRequestReason: reason,
        changesRequestedAt: now,
        changesRequestedBy: actor.uid,
        updatedAt: now,
      }, { merge: true });

      if (paymentSnap.exists) {
        transaction.set(paymentRef, {
          status: "CHANGES_REQUESTED_BEFORE_INSPECTION",
          paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
          verificationState: "OWNER_CORRECTIONS_REQUIRED_BEFORE_INSPECTION",
          inspectionVerified: false,
          unlocksDashboard: false,
          updatedAt: now,
        }, { merge: true });
      }
      if (contractSnap.exists) {
        transaction.set(contractRef, {
          status: "SIGNED_PENDING_OWNER_CORRECTIONS",
          contractStatus: "signed_pending_owner_corrections",
          activationStatus: "LOCKED_PENDING_OWNER_CORRECTIONS",
          inspectionStatus: "CHANGES_REQUESTED_BEFORE_SITE_VISIT",
          paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
          updatedAt: now,
        }, { merge: true });
      }

      transaction.set(db.collection("users").doc(ownerUid), {
        status: "changes_requested",
        onboardingStatus: "CHANGES_REQUESTED",
        dashboardLocked: true,
        dashboardUnlocked: false,
        updatedAt: now,
      }, { merge: true });
      transaction.set(db.collection("owners").doc(ownerUid), {
        status: "CHANGES_REQUESTED",
        onboardingStatus: "CHANGES_REQUESTED",
        updatedAt: now,
      }, { merge: true });

      transaction.set(auditRef, {
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: "REQUEST_OWNER_PROPERTY_CHANGES",
        targetType: "PROPERTY",
        targetId: propertyId,
        metadata: { intakeId, ownerUid, reason, inspectionCreated: false },
        trustLevel: "SERVER_AUTHORITATIVE",
        createdAt: now,
      });
      transaction.set(notificationRef, {
        recipientId: ownerUid,
        userId: ownerUid,
        recipientRole: "owner",
        toRole: "owner",
        title: "PROPERTY CHANGES REQUESTED",
        body: `BIN GROUP requested corrections before the physical inspection. Reason: ${reason}`,
        type: "OWNER_PROPERTY_CHANGES_REQUESTED",
        link: `/owner/properties/${propertyId}/correct`,
        read: false,
        createdAt: now,
      });

      return { ownerUid, intakeId };
    });

    return {
      success: true,
      propertyId,
      intakeId: result.intakeId,
      status: "CHANGES_REQUESTED",
      hardLaunchClaim: false,
    };
  },
);

export const resubmitOwnerProperty = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const owner = await requireVerifiedOwner(request.auth);
    const propertyId = text(request.data?.propertyId, 240);
    if (!propertyId) throw new HttpsError("invalid-argument", "propertyId is required.");
    const patch = sanitizeOwnerPatch(request.data?.property || request.data?.updates);

    assertOnboardingTransition("changes_requested", "admin_review");

    const propertyRef = db.collection("properties").doc(propertyId);
    const now = FieldValue.serverTimestamp();

    const result = await db.runTransaction(async (transaction) => {
      const propertySnap = await transaction.get(propertyRef);
      if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
      const property = propertySnap.data() || {};
      const boundOwner = text(property.ownerUid || property.ownerId, 240);
      if (boundOwner !== owner.uid) {
        throw new HttpsError("permission-denied", "Only the owning Owner can resubmit this property.");
      }
      if (normalizeStatus(property.status || property.approvalStatus || property.onboardingStatus) !== "changes_requested") {
        throw new HttpsError("failed-precondition", "Owner property resubmission is allowed only from CHANGES_REQUESTED.");
      }

      const intakeId = text(property.intakeId, 240);
      if (!intakeId) throw new HttpsError("failed-precondition", "Property is not bound to a canonical Owner intake.");
      const intakeRef = db.collection("intake_submissions").doc(intakeId);
      const inspectionRef = db.collection("property_inspections").doc(deterministicInspectionId(intakeId, propertyId));
      const paymentRef = db.collection("payment_transactions").doc(intakeId);
      const contractRef = db.collection("contracts").doc(text(property.contractId, 240) || intakeId);

      const [intakeSnap, inspectionSnap, paymentSnap, contractSnap] = await Promise.all([
        transaction.get(intakeRef),
        transaction.get(inspectionRef),
        transaction.get(paymentRef),
        transaction.get(contractRef),
      ]);
      if (!intakeSnap.exists) throw new HttpsError("failed-precondition", "Owner intake was not found.");
      const intake = intakeSnap.data() || {};
      if (text(intake.ownerUid || intake.ownerId, 240) !== owner.uid) {
        throw new HttpsError("permission-denied", "Only the owning Owner can resubmit this intake.");
      }
      if (normalizeStatus(intake.status) !== "changes_requested") {
        throw new HttpsError("failed-precondition", "The canonical Owner intake is not in CHANGES_REQUESTED.");
      }
      assertPreInspectionCorrectionState(property, intake, inspectionSnap.exists ? (inspectionSnap.data() || {}) : null);

      const existingSubmitted = record(property.submittedGeo || property.geo);
      const requestedSubmitted = Object.prototype.hasOwnProperty.call(patch, "submittedGeo")
        ? patch.submittedGeo
        : existingSubmitted;
      const submittedGeo = normalizeSubmittedGeo(requestedSubmitted, existingSubmitted);
      const nextProperty: PlainRecord = {
        ...property,
        ...patch,
        submittedGeo,
        geo: {
          ...submittedGeo,
          source: "owner_submission",
          verified: false,
          dispatchReady: false,
          requiresGeoReview: true,
          verifiedBy: null,
          verifiedAt: null,
        },
      };

      const identities = buildPropertyIdentities(nextProperty);
      if (!identities.length) {
        throw new HttpsError("failed-precondition", "Resubmitted property requires a stable title-deed, address, place or GPS identity.");
      }

      const existingClaimQuery = db.collection("property_identity_registry").where("propertyId", "==", propertyId).limit(20);
      const existingClaims = await transaction.get(existingClaimQuery);
      const newClaimRefs = identities.map((identity) => db.collection("property_identity_registry").doc(identity.hash));
      const newClaimSnaps = await Promise.all(newClaimRefs.map((ref) => transaction.get(ref)));

      const address = text(nextProperty.address || nextProperty.propertyAddress || submittedGeo.address, 500);
      const candidateQueries: FirebaseFirestore.Query[] = [
        db.collection("properties").where("submittedGeo.lat", "==", submittedGeo.lat).limit(50),
      ];
      if (address) {
        candidateQueries.push(db.collection("properties").where("address", "==", address).limit(50));
        candidateQueries.push(db.collection("properties").where("propertyAddress", "==", address).limit(50));
      }
      const duplicateSnapshots = await Promise.all(candidateQueries.map((query) => transaction.get(query)));
      const requestedKeys = new Set(identities.map((identity) => identity.raw));
      for (const snapshot of duplicateSnapshots) {
        for (const document of snapshot.docs) {
          if (document.id === propertyId) continue;
          const existingKeys = buildPropertyIdentities(document.data()).map((identity) => identity.raw);
          if (existingKeys.some((key) => requestedKeys.has(key))) {
            throw new HttpsError("already-exists", "This property already exists in BIN GROUP or is already being onboarded.");
          }
        }
      }

      newClaimSnaps.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const existing = snapshot.data() || {};
        const sameBinding =
          text(existing.ownerUid, 240) === owner.uid &&
          text(existing.intakeId, 240) === intakeId &&
          text(existing.propertyId, 240) === propertyId;
        if (!sameBinding) {
          throw new HttpsError("already-exists", "This property identity is already claimed by another BIN GROUP property.");
        }
      });

      const newHashes = new Set(identities.map((identity) => identity.hash));
      existingClaims.docs.forEach((claimDoc) => {
        const data = claimDoc.data() || {};
        const sameBinding =
          text(data.ownerUid, 240) === owner.uid &&
          text(data.intakeId, 240) === intakeId &&
          text(data.propertyId, 240) === propertyId;
        if (sameBinding && !newHashes.has(claimDoc.id)) transaction.delete(claimDoc.ref);
      });
      identities.forEach((identity, index) => {
        const ref = newClaimRefs[index];
        const snap = newClaimSnaps[index];
        const payload = {
          identityVersion: PROPERTY_IDENTITY_VERSION,
          identityKind: identity.kind,
          identityHash: identity.hash,
          ownerUid: owner.uid,
          intakeId,
          propertyId,
          workflowVersion: OWNER_WORKFLOW_VERSION,
          state: "CLAIMED",
          updatedAt: now,
        };
        if (snap.exists) {
          transaction.set(ref, payload, { merge: true });
        } else {
          transaction.create(ref, { ...payload, createdAt: now });
        }
      });

      const intakeProperties = Array.isArray(intake.properties) ? intake.properties : [];
      let matched = 0;
      const nextIntakeProperties = intakeProperties.map((entry: unknown) => {
        const value = record(entry);
        const id = text(value.propertyId || value.id, 240);
        if (id !== propertyId) return value;
        matched += 1;
        return {
          ...value,
          ...patch,
          submittedGeo,
          geo: nextProperty.geo,
          status: "PENDING_PROPERTY_INSPECTION",
          activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
          inspectionStatus: "PENDING_ADMIN_SITE_VISIT",
          locationVerified: false,
          paymentVerified: false,
          adminApproved: false,
        };
      });
      if (matched !== 1) {
        throw new HttpsError("failed-precondition", "Canonical intake must contain exactly one matching property.");
      }

      transaction.set(propertyRef, {
        ...patch,
        submittedGeo,
        geo: nextProperty.geo,
        status: "PENDING_PROPERTY_INSPECTION",
        canonicalOnboardingState: "admin_review",
        approvalStatus: "PENDING_REVIEW",
        onboardingStatus: "SUBMITTED_FOR_PROPERTY_INSPECTION",
        activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
        inspectionStatus: "PENDING_ADMIN_SITE_VISIT",
        locationVerified: false,
        adminSiteVisitVerified: false,
        paymentVerified: false,
        adminApproved: false,
        changeRequestReason: FieldValue.delete(),
        changesRequestedAt: FieldValue.delete(),
        changesRequestedBy: FieldValue.delete(),
        changesRequestedByEmail: FieldValue.delete(),
        resubmittedAt: now,
        resubmittedBy: owner.uid,
        updatedAt: now,
      }, { merge: true });

      transaction.set(intakeRef, {
        properties: nextIntakeProperties,
        status: "SUBMITTED_FOR_PROPERTY_INSPECTION",
        canonicalOnboardingState: "admin_review",
        adminReviewState: "AWAITING_PROPERTY_REVIEW_AND_SITE_VISIT",
        inspectionStatus: "PENDING_ADMIN_SITE_VISIT",
        activationState: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
        paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
        changeRequestPropertyId: FieldValue.delete(),
        changeRequestReason: FieldValue.delete(),
        changesRequestedAt: FieldValue.delete(),
        changesRequestedBy: FieldValue.delete(),
        resubmittedAt: now,
        resubmittedBy: owner.uid,
        updatedAt: now,
      }, { merge: true });

      if (paymentSnap.exists) {
        transaction.set(paymentRef, {
          status: "AWAITING_SITE_INSPECTION",
          paymentStatus: "AWAITING_SITE_INSPECTION",
          verificationState: "INSPECTION_REQUIRED_BEFORE_PAYMENT",
          inspectionVerified: false,
          unlocksDashboard: false,
          updatedAt: now,
        }, { merge: true });
      }
      if (contractSnap.exists) {
        transaction.set(contractRef, {
          properties: nextIntakeProperties,
          status: "SIGNED_PENDING_PROPERTY_INSPECTION",
          contractStatus: "signed_pending_inspection",
          activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
          inspectionStatus: "PENDING_ADMIN_SITE_VISIT",
          paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
          adminApproved: false,
          paymentVerified: false,
          updatedAt: now,
        }, { merge: true });
      }

      transaction.set(db.collection("users").doc(owner.uid), {
        status: "pending_property_inspection",
        onboardingStatus: "SUBMITTED_AWAITING_ADMIN_SITE_VISIT",
        dashboardLocked: true,
        dashboardUnlocked: false,
        paymentVerified: false,
        adminApproved: false,
        updatedAt: now,
      }, { merge: true });
      transaction.set(db.collection("owners").doc(owner.uid), {
        status: "PENDING_PROPERTY_INSPECTION",
        onboardingStatus: "SUBMITTED_AWAITING_ADMIN_SITE_VISIT",
        updatedAt: now,
      }, { merge: true });

      transaction.set(db.collection("audit_logs").doc(), {
        actorId: owner.uid,
        actorEmail: owner.email,
        actorRole: "owner",
        action: "RESUBMIT_OWNER_PROPERTY_FROM_CHANGES_REQUESTED",
        targetType: "PROPERTY",
        targetId: propertyId,
        metadata: {
          intakeId,
          identityVersion: PROPERTY_IDENTITY_VERSION,
          identityKinds: identities.map((identity) => identity.kind),
          submittedGeoTrusted: false,
        },
        trustLevel: "SERVER_AUTHORITATIVE",
        createdAt: now,
      });
      transaction.set(db.collection("notifications").doc(), {
        userId: owner.uid,
        recipientId: owner.uid,
        toRole: "owner",
        recipientRole: "owner",
        title: "PROPERTY RESUBMITTED",
        body: "Your corrected property was resubmitted for BIN GROUP review and physical inspection.",
        type: "OWNER_PROPERTY_RESUBMITTED",
        link: "/owner/properties",
        read: false,
        createdAt: now,
      });

      return { intakeId, identityCount: identities.length };
    });

    return {
      success: true,
      propertyId,
      intakeId: result.intakeId,
      status: "PENDING_PROPERTY_INSPECTION",
      propertyIdentityVersion: PROPERTY_IDENTITY_VERSION,
      propertyIdentityCount: result.identityCount,
      hardLaunchClaim: false,
    };
  },
);
