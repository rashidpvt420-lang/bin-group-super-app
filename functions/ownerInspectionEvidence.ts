import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const REQUIRED_CHECKLIST_KEYS = [
  "accessVerified",
  "exteriorReviewed",
  "utilitiesReviewed",
  "safetyReviewed",
  "occupancyConfirmed",
] as const;
const MAX_ARRIVAL_DISTANCE_METRES = 750;

type PlainRecord = Record<string, any>;

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown) => text(value).toUpperCase();
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const money = (value: unknown) => Math.round(finite(value) * 100) / 100;

function roleOf(token: PlainRecord | undefined) {
  return lower(token?.role || token?.userRole || token?.primaryRole);
}

function hasMfa(token: PlainRecord) {
  return Boolean(token?.firebase?.sign_in_second_factor || (Array.isArray(token?.amr) && token.amr.includes("mfa")));
}

async function requireAdmin(request: any, requireMfa = false) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = request.auth.token || {};
  if (
    token.suspended === true ||
    !(ADMIN_ROLES.has(roleOf(token)) || token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true)
  ) throw new HttpsError("permission-denied", "Admin permission required.");
  if (token.email_verified !== true) throw new HttpsError("permission-denied", "A verified Admin account is required.");
  if (requireMfa && !hasMfa(token)) throw new HttpsError("permission-denied", "A fresh Admin MFA session is required.");
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled || !user.emailVerified) throw new HttpsError("permission-denied", "Disabled or unverified Admin account.");
  return { uid: request.auth.uid as string, email: lower(token.email || user.email) };
}

function coordinate(value: unknown, minimum: number, maximum: number, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new HttpsError("invalid-argument", `${label} is invalid.`);
  }
  return parsed;
}

function radians(value: number) {
  return value * Math.PI / 180;
}

function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radius = 6_371_000;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function requiredChecklist(value: unknown) {
  const source = value && typeof value === "object" ? value as PlainRecord : {};
  const checklist = Object.fromEntries(REQUIRED_CHECKLIST_KEYS.map((key) => [key, source[key] === true])) as PlainRecord;
  const missing = REQUIRED_CHECKLIST_KEYS.filter((key) => checklist[key] !== true);
  if (missing.length) throw new HttpsError("failed-precondition", `Complete every required inspection item: ${missing.join(", ")}.`);
  return checklist;
}

function inspectionLocation(value: PlainRecord) {
  const lat = finite(value?.location?.lat ?? value?.location?.point?.latitude, Number.NaN);
  const lng = finite(value?.location?.lng ?? value?.location?.point?.longitude, Number.NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpsError("failed-precondition", "The inspection does not have a valid property location.");
  return { lat, lng };
}

function readinessFromInspection(id: string, value: PlainRecord) {
  return {
    inspectionId: id,
    propertyId: text(value.propertyId),
    propertyIndex: finite(value.propertyIndex),
    propertyName: text(value.propertyName || value.location?.address || `Property ${finite(value.propertyIndex) + 1}`),
    status: text(value.status || value.inspectionStatus),
    evidenceVerified: value.evidenceVerified === true,
    evidenceRecordedAt: value.evidenceRecordedAt?.toMillis?.() || null,
    arrivalDistanceMetres: finite(value.visitEvidence?.arrivalDistanceMetres, Number.NaN),
    photoCount: finite(value.visitEvidence?.photoCount),
    findings: text(value.visitEvidence?.findings),
    location: {
      lat: finite(value.location?.lat ?? value.location?.point?.latitude, Number.NaN),
      lng: finite(value.location?.lng ?? value.location?.point?.longitude, Number.NaN),
      address: text(value.location?.address),
      directionsUrl: text(value.location?.directionsUrl || value.directionsUrl),
    },
  };
}

export const adminGetOwnerPortfolioInspectionReadiness = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request);
    const intakeId = text(request.data?.intakeId);
    if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
    const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
    if (!intakeSnap.exists) throw new HttpsError("not-found", "Owner application not found.");
    const intake = intakeSnap.data() || {};
    if (text(intake.workflowVersion) !== WORKFLOW_VERSION) throw new HttpsError("failed-precondition", "This action is only for the protected five-page workflow.");
    const inspectionIds = Array.isArray(intake.inspectionIds)
      ? Array.from(new Set(intake.inspectionIds.map(text).filter(Boolean)))
      : [text(intake.inspectionId)].filter(Boolean);
    const inspections = await Promise.all(inspectionIds.map(async (inspectionId) => {
      const snap = await db.collection("property_inspections").doc(inspectionId).get();
      if (!snap.exists || text(snap.data()?.intakeId) !== intakeId) throw new HttpsError("failed-precondition", `Inspection ${inspectionId} is missing or invalid.`);
      return readinessFromInspection(snap.id, snap.data() || {});
    }));
    const expected = Array.isArray(intake.properties) ? intake.properties.length : 0;
    return {
      intakeId,
      expectedInspectionCount: expected,
      verifiedCount: inspections.filter((inspection) => inspection.evidenceVerified).length,
      allEvidenceVerified: expected > 0 && inspections.length === expected && inspections.every((inspection) => inspection.evidenceVerified),
      inspections,
    };
  },
);

export const adminRecordOwnerPortfolioVisitEvidence = onCall(
  { cors: true, enforceAppCheck: true, memory: "512MiB" },
  async (request) => {
    const actor = await requireAdmin(request, true);
    const intakeId = text(request.data?.intakeId);
    const inspectionId = text(request.data?.inspectionId);
    const findings = text(request.data?.findings).slice(0, 4000);
    if (!intakeId || !inspectionId) throw new HttpsError("invalid-argument", "intakeId and inspectionId are required.");
    if (findings.length < 8) throw new HttpsError("invalid-argument", "Record clear property inspection findings.");

    const arrivalLat = coordinate(request.data?.arrivalLat, -90, 90, "Arrival latitude");
    const arrivalLng = coordinate(request.data?.arrivalLng, -180, 180, "Arrival longitude");
    const startedAtMs = finite(request.data?.startedAtMs);
    const completedAtMs = finite(request.data?.completedAtMs);
    const nowMs = Date.now();
    if (!startedAtMs || !completedAtMs || startedAtMs > completedAtMs || completedAtMs > nowMs + 5 * 60 * 1000) {
      throw new HttpsError("invalid-argument", "Valid visit start and completion times are required.");
    }
    const durationMs = completedAtMs - startedAtMs;
    if (durationMs < 60_000 || durationMs > 12 * 60 * 60 * 1000) {
      throw new HttpsError("failed-precondition", "The inspection duration must be between one minute and twelve hours.");
    }
    const checklist = requiredChecklist(request.data?.checklist);

    const encodedPhoto = text(request.data?.encodedPhoto);
    const filename = text(request.data?.filename || "property-visit.jpg").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
    const contentType = lower(request.data?.contentType || "image/jpeg");
    if (!contentType.match(/^image\/(jpeg|png|webp)$/)) throw new HttpsError("invalid-argument", "Visit evidence must be a JPG, PNG or WEBP photo.");
    const photoBuffer = Buffer.from(encodedPhoto.includes(",") ? encodedPhoto.split(",").pop() || "" : encodedPhoto, "base64");
    if (!photoBuffer.length || photoBuffer.length > 6 * 1024 * 1024) throw new HttpsError("invalid-argument", "Visit photo is empty or exceeds 6 MB.");

    const intakeRef = db.collection("intake_submissions").doc(intakeId);
    const inspectionRef = db.collection("property_inspections").doc(inspectionId);
    const [intakeSnap, inspectionSnap] = await Promise.all([intakeRef.get(), inspectionRef.get()]);
    if (!intakeSnap.exists || !inspectionSnap.exists) throw new HttpsError("not-found", "Owner application or property inspection was not found.");
    const intake = intakeSnap.data() || {};
    const inspection = inspectionSnap.data() || {};
    if (text(intake.workflowVersion) !== WORKFLOW_VERSION || text(inspection.workflowVersion) !== WORKFLOW_VERSION || text(inspection.intakeId) !== intakeId) {
      throw new HttpsError("failed-precondition", "The property inspection is not bound to this protected Owner workflow.");
    }
    if (upper(inspection.status) === "CANCELLED") throw new HttpsError("failed-precondition", "A cancelled inspection cannot receive evidence.");

    const expectedLocation = inspectionLocation(inspection);
    const arrivalDistanceMetres = Math.round(distanceMetres(arrivalLat, arrivalLng, expectedLocation.lat, expectedLocation.lng));
    if (arrivalDistanceMetres > MAX_ARRIVAL_DISTANCE_METRES) {
      throw new HttpsError("failed-precondition", `Arrival GPS is ${arrivalDistanceMetres} metres from the submitted property. Move closer than ${MAX_ARRIVAL_DISTANCE_METRES} metres.`);
    }

    const sha256 = crypto.createHash("sha256").update(photoBuffer).digest("hex");
    const propertyId = text(inspection.propertyId);
    const storagePath = `owner-inspection-evidence/${intakeId}/${inspectionId}/${Date.now()}_${crypto.randomUUID()}_${filename}`;
    const file = admin.storage().bucket().file(storagePath);
    await file.save(photoBuffer, {
      resumable: false,
      validation: "md5",
      metadata: {
        contentType,
        cacheControl: "private, no-store, max-age=0",
        metadata: {
          intakeId,
          inspectionId,
          propertyId,
          sha256,
          recordedBy: actor.uid,
          accessClass: "ADMIN_SIGNED_URL_ONLY",
          recordedAt: new Date().toISOString(),
        },
      },
    });
    const [metadata] = await file.getMetadata();
    const generation = text(metadata.generation);
    if (!generation) throw new HttpsError("internal", "Stored visit evidence has no immutable generation.");

    const visitEvidence = {
      schemaVersion: 1,
      arrival: {
        lat: arrivalLat,
        lng: arrivalLng,
        point: new admin.firestore.GeoPoint(arrivalLat, arrivalLng),
        expectedLat: expectedLocation.lat,
        expectedLng: expectedLocation.lng,
      },
      arrivalDistanceMetres,
      maximumAllowedDistanceMetres: MAX_ARRIVAL_DISTANCE_METRES,
      gpsWithinRadius: true,
      startedAt: admin.firestore.Timestamp.fromMillis(startedAtMs),
      completedAt: admin.firestore.Timestamp.fromMillis(completedAtMs),
      durationMs,
      checklist,
      checklistComplete: true,
      findings,
      photoCount: 1,
      photoEvidence: [{ storagePath, sha256, generation, contentType, filename, size: photoBuffer.length }],
      recordedBy: actor.uid,
      recordedByEmail: actor.email,
    };

    const now = ts();
    const batch = db.batch();
    batch.set(inspectionRef, {
      status: "EVIDENCE_RECORDED",
      inspectionStatus: "EVIDENCE_RECORDED",
      evidenceVerified: true,
      evidenceRecordedAt: now,
      evidenceRecordedBy: actor.uid,
      visitEvidence,
      updatedAt: now,
    }, { merge: true });
    if (text(inspection.ticketId)) {
      batch.set(db.collection("maintenanceTickets").doc(text(inspection.ticketId)), {
        status: "INSPECTION_EVIDENCE_RECORDED",
        evidenceVerified: true,
        updatedAt: now,
      }, { merge: true });
    }
    if (text(inspection.dispatchJobId)) {
      batch.set(db.collection("technician_dispatch_jobs").doc(text(inspection.dispatchJobId)), {
        status: "EVIDENCE_RECORDED",
        evidenceVerified: true,
        completedAt: now,
        updatedAt: now,
      }, { merge: true });
    }
    batch.set(db.collection("audit_logs").doc(), {
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: "admin",
      action: "RECORD_OWNER_PROPERTY_VISIT_EVIDENCE",
      targetType: "property_inspections",
      targetId: inspectionId,
      metadata: { intakeId, propertyId, arrivalDistanceMetres, sha256, generation, durationMs },
      createdAt: now,
    });
    await batch.commit();

    const refreshed = await Promise.all((Array.isArray(intake.inspectionIds) ? intake.inspectionIds : [inspectionId]).map(async (id: unknown) => {
      const snap = await db.collection("property_inspections").doc(text(id)).get();
      return snap.exists && snap.data()?.evidenceVerified === true;
    }));
    await intakeRef.set({ inspectionEvidenceVerifiedCount: refreshed.filter(Boolean).length, updatedAt: ts() }, { merge: true });

    return { status: "EVIDENCE_VERIFIED", intakeId, inspectionId, propertyId, arrivalDistanceMetres, sha256, generation };
  },
);

export const adminCompleteOwnerPortfolioInspectionsPhase1 = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    const actor = await requireAdmin(request, true);
    const intakeId = text(request.data?.intakeId);
    if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");

    const intakeRef = db.collection("intake_submissions").doc(intakeId);
    const paymentRef = db.collection("payment_transactions").doc(intakeId);
    const contractRef = db.collection("contracts").doc(intakeId);
    const [intakeSnap, paymentSnap, contractSnap] = await Promise.all([intakeRef.get(), paymentRef.get(), contractRef.get()]);
    if (!intakeSnap.exists || !paymentSnap.exists || !contractSnap.exists) throw new HttpsError("failed-precondition", "The inspection-first onboarding package is incomplete.");
    const intake = intakeSnap.data() || {};
    if (text(intake.workflowVersion) !== WORKFLOW_VERSION) throw new HttpsError("failed-precondition", "This action is only for the protected five-page workflow.");

    const properties = Array.isArray(intake.properties) ? intake.properties : [];
    const inspectionIds = Array.isArray(intake.inspectionIds)
      ? Array.from(new Set(intake.inspectionIds.map(text).filter(Boolean)))
      : [text(intake.inspectionId)].filter(Boolean);
    if (!properties.length || inspectionIds.length !== properties.length) {
      throw new HttpsError("failed-precondition", `Every property requires a linked site inspection. Expected ${properties.length}, found ${inspectionIds.length}.`);
    }
    const inspectionRefs = inspectionIds.map((inspectionId) => db.collection("property_inspections").doc(inspectionId));
    const inspectionSnaps = await Promise.all(inspectionRefs.map((ref) => ref.get()));
    const uniquePropertyIds = new Set<string>();
    inspectionSnaps.forEach((snapshot, index) => {
      if (!snapshot.exists) throw new HttpsError("failed-precondition", `Inspection ${inspectionIds[index]} is missing.`);
      const value = snapshot.data() || {};
      const propertyId = text(value.propertyId);
      const evidence = value.visitEvidence || {};
      if (
        text(value.intakeId) !== intakeId ||
        upper(value.status) === "CANCELLED" ||
        value.evidenceVerified !== true ||
        evidence.gpsWithinRadius !== true ||
        evidence.checklistComplete !== true ||
        finite(evidence.photoCount) < 1 ||
        text(evidence.findings).length < 8 ||
        !evidence.startedAt ||
        !evidence.completedAt ||
        !propertyId
      ) throw new HttpsError("failed-precondition", `Inspection ${index + 1} requires verified GPS, checklist, findings, timestamps and photo evidence.`);
      if (uniquePropertyIds.has(propertyId)) throw new HttpsError("failed-precondition", "Each property must have one unique verified inspection.");
      uniquePropertyIds.add(propertyId);
    });

    const expectedPropertyIds = new Set(properties.map((property: PlainRecord) => text(property.propertyId || property.id)).filter(Boolean));
    if (expectedPropertyIds.size !== properties.length || uniquePropertyIds.size !== expectedPropertyIds.size || [...expectedPropertyIds].some((id) => !uniquePropertyIds.has(id))) {
      throw new HttpsError("failed-precondition", "Verified inspections do not match the submitted property portfolio.");
    }

    const ownerUid = text(intake.ownerUid || intake.ownerId);
    const amount = money(paymentSnap.data()?.activationDeposit || paymentSnap.data()?.amount);
    if (!ownerUid || amount <= 0) throw new HttpsError("failed-precondition", "Owner binding or 15% mobilisation amount is missing.");
    const propertyQuery = await db.collection("properties").where("intakeId", "==", intakeId).limit(100).get();
    if (propertyQuery.size !== properties.length) throw new HttpsError("failed-precondition", "Canonical property records do not match the submitted portfolio.");

    const now = ts();
    const batch = db.batch();
    inspectionSnaps.forEach((snapshot, index) => {
      batch.set(snapshot.ref, {
        status: "COMPLETED",
        inspectionStatus: "COMPLETED",
        portfolioInspectionIndex: index,
        completedBy: actor.uid,
        completedByEmail: actor.email,
        completedAt: now,
        updatedAt: now,
      }, { merge: true });
    });
    batch.set(intakeRef, {
      inspectionId: inspectionIds[0],
      inspectionIds,
      inspectionStatus: "COMPLETED",
      inspectionCompletedCount: inspectionIds.length,
      inspectionEvidenceVerifiedCount: inspectionIds.length,
      adminReviewState: "ALL_VERIFIED_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
      activationState: "LOCKED_PENDING_15_PERCENT_PAYMENT",
      paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
      paymentCollectionStage: "15_PERCENT_DUE_AFTER_VERIFIED_VISITS",
      inspectionCompletedAt: now,
      inspectionCompletedBy: actor.uid,
      updatedAt: now,
    }, { merge: true });
    batch.set(paymentRef, {
      status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
      paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
      verificationState: "ADMIN_PAYMENT_EVIDENCE_REQUIRED",
      adminApprovalRequired: true,
      unlocksDashboard: false,
      inspectionId: inspectionIds[0],
      inspectionIds,
      inspectionVerified: true,
      inspectionEvidenceVerifiedCount: inspectionIds.length,
      paymentDueAfterInspection: true,
      updatedAt: now,
    }, { merge: true });
    batch.set(contractRef, {
      status: "SIGNED_AWAITING_15_PERCENT_PAYMENT",
      contractStatus: "signed_awaiting_payment",
      activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT",
      inspectionId: inspectionIds[0],
      inspectionIds,
      inspectionVerified: true,
      inspectionEvidenceVerifiedCount: inspectionIds.length,
      paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
      updatedAt: now,
    }, { merge: true });
    propertyQuery.docs.forEach((document) => {
      const property = document.data() || {};
      const inspection = inspectionSnaps.find((snapshot) => text(snapshot.data()?.propertyId) === document.id || text(snapshot.data()?.propertyId) === text(property.propertyId));
      if (!inspection) throw new HttpsError("failed-precondition", `No verified inspection exists for property ${document.id}.`);
      batch.set(document.ref, {
        status: "AWAITING_15_PERCENT_PAYMENT",
        activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT",
        inspectionStatus: "COMPLETED",
        inspectionId: inspection.id,
        locationVerified: true,
        adminSiteVisitVerified: true,
        visitEvidenceVerified: true,
        geo: {
          ...(property.geo || {}),
          verified: true,
          requiresGeoReview: false,
          dispatchReady: true,
          verifiedBy: actor.uid,
          verifiedAt: now,
        },
        updatedAt: now,
      }, { merge: true });
    });
    batch.set(db.collection("users").doc(ownerUid), {
      status: "awaiting_activation_payment",
      onboardingStatus: "VERIFIED_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
      dashboardLocked: true,
      dashboardUnlocked: false,
      updatedAt: now,
    }, { merge: true });
    batch.set(db.collection("owners").doc(ownerUid), {
      status: "AWAITING_ACTIVATION_PAYMENT",
      onboardingStatus: "VERIFIED_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
      updatedAt: now,
    }, { merge: true });
    batch.set(db.collection("notifications").doc(), {
      userId: ownerUid,
      toRole: "owner",
      type: "OWNER_VERIFIED_INSPECTIONS_COMPLETE_PAYMENT_DUE",
      title: "Verified property visits completed",
      body: `All verified property visits are complete. The exact 15% mobilisation payment of AED ${amount.toLocaleString("en-AE")} is now due for Admin verification.`,
      read: false,
      createdAt: now,
    });
    batch.set(db.collection("audit_logs").doc(), {
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: "admin",
      action: "COMPLETE_VERIFIED_OWNER_PORTFOLIO_INSPECTIONS",
      targetType: "intake_submissions",
      targetId: intakeId,
      metadata: { inspectionIds, inspectionCount: inspectionIds.length, paymentId: intakeId, amount },
      createdAt: now,
    });
    await batch.commit();

    return { status: "COMPLETED", intakeId, inspectionIds, paymentId: intakeId, activationDeposit: amount, nextState: "AWAITING_PHASE1_15_PERCENT_PAYMENT" };
  },
);
