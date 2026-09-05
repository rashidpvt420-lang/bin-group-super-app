import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { calculateOwnerOnboardingQuote } from "./ownerOnboardingQuote";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const MAX_VISIT_RADIUS_METRES = 750;
const GYM_COMPLEXITIES = new Set(["STANDARD_DRY", "ENHANCED", "WET_RECOVERY"]);
const GYM_OPENING_SCHEDULES = new Set(["STANDARD_HOURS", "EXTENDED_HOURS", "24_7"]);
const GYM_DOCUMENT_STATUSES = new Set(["verified", "pending", "not_available", "not_applicable"]);
const text = (value: unknown) => String(value || "").trim();
const upper = (value: unknown) => text(value).toUpperCase();
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const finite = (value: unknown, fallback = NaN) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safeId = (value: unknown, fallback: string) => text(value).replace(/[^A-Za-z0-9_-]/g, "_").replace(/_+/g, "_").slice(0, 180) || fallback;

async function requireAdmin(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = request.auth.token || {};
  if (token.suspended === true || !(ADMIN_ROLES.has(roleOf(token)) || token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true)) {
    throw new HttpsError("permission-denied", "Admin permission required.");
  }
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled || !user.emailVerified) throw new HttpsError("permission-denied", "Active verified Admin account required.");
  return { uid: request.auth.uid, email: text(token.email || user.email).toLowerCase(), name: text(token.name || user.displayName || user.email) };
}

function radians(value: number) { return value * Math.PI / 180; }
function distanceMetres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const earth = 6371000;
  const dLat = radians(bLat - aLat);
  const dLng = radians(bLng - aLng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(aLat)) * Math.cos(radians(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

function requiredChecklist(value: any) {
  const checklist = {
    propertyIdentityConfirmed: value?.propertyIdentityConfirmed === true,
    locationConfirmed: value?.locationConfirmed === true,
    accessAndSafetyReviewed: value?.accessAndSafetyReviewed === true,
    systemsAndConditionReviewed: value?.systemsAndConditionReviewed === true,
    serviceScopeConfirmed: value?.serviceScopeConfirmed === true,
  };
  if (Object.values(checklist).some((entry) => entry !== true)) {
    throw new HttpsError("failed-precondition", "Complete every required property-visit checklist item.");
  }
  return checklist;
}

function isGymProperty(property: any, inspection?: any) {
  return text(property?.propertyType || inspection?.propertyType) === "Gym / Fitness Centre";
}

function boundedCount(value: unknown, label: string, max = 100000) {
  const parsed = finite(value, 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new HttpsError("invalid-argument", `${label} is outside the accepted verification range.`);
  return Math.round(parsed);
}

function gymDocumentStatus(value: unknown, label: string) {
  const status = text(value || "pending").toLowerCase();
  if (!GYM_DOCUMENT_STATUSES.has(status)) throw new HttpsError("invalid-argument", `${label} verification status is invalid.`);
  return status;
}

function verifiedGymPayload(value: any) {
  const verifiedServiceAreaSqft = finite(value?.verifiedServiceAreaSqft);
  if (!Number.isFinite(verifiedServiceAreaSqft) || verifiedServiceAreaSqft <= 0 || verifiedServiceAreaSqft > 50_000_000) {
    throw new HttpsError("invalid-argument", "Gym verification requires a positive measured service area in square feet.");
  }
  const verifiedComplexity = upper(value?.verifiedComplexity);
  if (!GYM_COMPLEXITIES.has(verifiedComplexity)) throw new HttpsError("invalid-argument", "Select a verified Gym complexity band.");
  const openingSchedule = upper(value?.openingSchedule || "STANDARD_HOURS");
  if (!GYM_OPENING_SCHEDULES.has(openingSchedule)) throw new HttpsError("invalid-argument", "Select a valid verified Gym opening schedule.");
  const wetFacilities = Array.isArray(value?.wetFacilities)
    ? Array.from(new Set(value.wetFacilities.map((entry: unknown) => text(entry).toLowerCase()).filter(Boolean))).slice(0, 20)
    : [];
  return {
    verifiedServiceAreaSqft: Math.round(verifiedServiceAreaSqft * 100) / 100,
    verifiedComplexity,
    openingSchedule,
    equipmentCount: boundedCount(value?.equipmentCount, "Gym equipment count"),
    changingRooms: boundedCount(value?.changingRooms, "Changing-room count", 1000),
    showers: boundedCount(value?.showers, "Shower count", 10000),
    groupStudios: boundedCount(value?.groupStudios, "Group-studio count", 1000),
    wetFacilities,
    swimmingPool: value?.swimmingPool === true,
    treatmentRecoveryArea: value?.treatmentRecoveryArea === true,
    sportsEstablishmentApprovalStatus: gymDocumentStatus(value?.sportsEstablishmentApprovalStatus, "Sports establishment approval"),
    insuranceStatus: gymDocumentStatus(value?.insuranceStatus, "Insurance"),
    floorPlanStatus: gymDocumentStatus(value?.floorPlanStatus, "Floor plan"),
  };
}

export const adminRecordOwnerPropertyInspectionEvidence = onCall({ cors: true, enforceAppCheck: true, memory: "512MiB" }, async (request) => {
  const actor = await requireAdmin(request);
  const intakeId = safeId(request.data?.intakeId, "");
  const inspectionId = safeId(request.data?.inspectionId, "");
  const inspectorName = text(request.data?.inspectorName || actor.name).slice(0, 160);
  const findings = text(request.data?.findings || request.data?.notes).slice(0, 4000);
  const startedAtMs = finite(request.data?.startedAtMs);
  const completedAtMs = finite(request.data?.completedAtMs);
  const arrivalLat = finite(request.data?.arrivalLat);
  const arrivalLng = finite(request.data?.arrivalLng);
  const checklist = requiredChecklist(request.data?.checklist || {});
  const filename = text(request.data?.filename || "property-visit-evidence.jpg").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
  const contentType = text(request.data?.contentType || "image/jpeg");
  const encoded = text(request.data?.encodedDocument);
  if (!intakeId || !inspectionId) throw new HttpsError("invalid-argument", "intakeId and inspectionId are required.");
  if (inspectorName.length < 3 || findings.length < 8) throw new HttpsError("invalid-argument", "Inspector name and clear property findings are required.");
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs <= startedAtMs || completedAtMs - startedAtMs > 12 * 60 * 60 * 1000) {
    throw new HttpsError("invalid-argument", "Record a valid visit start and completion time within twelve hours.");
  }
  if (!Number.isFinite(arrivalLat) || !Number.isFinite(arrivalLng) || arrivalLat < -90 || arrivalLat > 90 || arrivalLng < -180 || arrivalLng > 180) {
    throw new HttpsError("invalid-argument", "Capture valid arrival GPS at the property.");
  }
  if (!contentType.match(/^image\//) && contentType !== "application/pdf") throw new HttpsError("invalid-argument", "Visit evidence must be an image or PDF.");
  const buffer = Buffer.from(encoded.includes(",") ? encoded.split(",").pop() || "" : encoded, "base64");
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new HttpsError("invalid-argument", "Visit evidence is empty or exceeds 10 MB.");

  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const inspectionRef = db.collection("property_inspections").doc(inspectionId);
  const [intakeSnap, inspectionSnap] = await Promise.all([intakeRef.get(), inspectionRef.get()]);
  if (!intakeSnap.exists || !inspectionSnap.exists) throw new HttpsError("not-found", "Owner intake or property inspection was not found.");
  const intake = intakeSnap.data() || {};
  const inspection = inspectionSnap.data() || {};
  if (text(intake.workflowVersion) !== WORKFLOW_VERSION || text(inspection.workflowVersion) !== WORKFLOW_VERSION || text(inspection.intakeId) !== intakeId) {
    throw new HttpsError("failed-precondition", "Inspection is not bound to this protected five-page Owner application.");
  }
  if (upper(inspection.status) === "CANCELLED") throw new HttpsError("failed-precondition", "Cancelled inspections cannot receive evidence.");
  const propertyId = text(inspection.propertyId);
  const properties = Array.isArray(intake.properties) ? intake.properties : [];
  const property = properties.find((entry: any) => text(entry?.propertyId || entry?.id) === propertyId);
  if (!property) throw new HttpsError("failed-precondition", "The inspection property is missing from the Owner portfolio.");
  const expectedLat = finite(property?.geo?.lat ?? property?.geo?.point?.latitude);
  const expectedLng = finite(property?.geo?.lng ?? property?.geo?.point?.longitude);
  if (!Number.isFinite(expectedLat) || !Number.isFinite(expectedLng)) throw new HttpsError("failed-precondition", "The submitted property GPS is missing.");
  const distance = distanceMetres(arrivalLat, arrivalLng, expectedLat, expectedLng);
  if (distance > MAX_VISIT_RADIUS_METRES) {
    throw new HttpsError("failed-precondition", `Arrival GPS is ${distance} metres from the submitted property. Capture evidence within ${MAX_VISIT_RADIUS_METRES} metres.`);
  }

  const gymVerification = isGymProperty(property, inspection) ? verifiedGymPayload(request.data?.gymVerification || {}) : null;
  const evidenceHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const ownerUid = text(intake.ownerUid || intake.ownerId);
  const storagePath = `inspection-evidence/owners/${safeId(ownerUid, "owner")}/${intakeId}/${inspectionId}/${Date.now()}_${filename}`;
  const file = admin.storage().bucket().file(storagePath);
  await file.save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: "private, no-store, max-age=0",
      metadata: { ownerUid, intakeId, inspectionId, propertyId, evidenceHash, uploadedByAdmin: actor.uid, uploadedAt: new Date().toISOString() },
    },
  });
  const [metadata] = await file.getMetadata();
  const generation = text(metadata.generation);
  if (!generation) throw new HttpsError("internal", "Stored visit evidence has no immutable generation.");
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(inspectionRef, {
    status: "EVIDENCE_RECORDED_PENDING_COMPLETION",
    inspectionStatus: "EVIDENCE_RECORDED_PENDING_COMPLETION",
    evidenceStatus: "VERIFIED",
    evidencePath: storagePath,
    evidenceHash,
    evidenceGeneration: generation,
    evidenceContentType: contentType,
    evidenceFileName: filename,
    evidenceRecordedAt: now,
    evidenceRecordedBy: actor.uid,
    inspectorName,
    findings,
    checklist,
    checklistVerified: true,
    ...(gymVerification ? {
      gymVerification: {
        ...gymVerification,
        source: "ADMIN_SITE_VISIT",
        verifiedBy: actor.uid,
        verifiedByEmail: actor.email,
        verifiedAt: now,
      },
      gymVerificationStatus: "VERIFIED",
    } : {}),
    arrivalLocation: { lat: arrivalLat, lng: arrivalLng, expectedLat, expectedLng, distanceMetres: distance, withinRadius: true, capturedAtMs: completedAtMs },
    visitStartedAt: admin.firestore.Timestamp.fromMillis(startedAtMs),
    visitCompletedAt: admin.firestore.Timestamp.fromMillis(completedAtMs),
    updatedAt: now,
  }, { merge: true });
  const ticketId = text(inspection.ticketId);
  const dispatchJobId = text(inspection.dispatchJobId);
  if (ticketId) batch.set(db.collection("maintenanceTickets").doc(ticketId), { status: "INSPECTION_EVIDENCE_RECORDED", updatedAt: now }, { merge: true });
  if (dispatchJobId) batch.set(db.collection("technician_dispatch_jobs").doc(dispatchJobId), { status: "INSPECTION_EVIDENCE_RECORDED", updatedAt: now }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: "admin",
    action: "RECORD_OWNER_PROPERTY_INSPECTION_EVIDENCE",
    targetType: "property_inspections",
    targetId: inspectionId,
    metadata: {
      intakeId,
      propertyId,
      propertyType: text(property.propertyType),
      distanceMetres: distance,
      evidenceHash,
      generation,
      checklistVerified: true,
      gymVerificationRequired: isGymProperty(property, inspection),
      gymVerifiedServiceAreaSqft: gymVerification?.verifiedServiceAreaSqft || null,
      gymVerifiedComplexity: gymVerification?.verifiedComplexity || null,
    },
    createdAt: now,
  });
  await batch.commit();
  return {
    status: "VERIFIED",
    intakeId,
    inspectionId,
    propertyId,
    distanceMetres: distance,
    evidenceHash,
    generation,
    gymVerification,
  };
});

export const adminCompleteOwnerPortfolioInspections = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const actor = await requireAdmin(request);
  const intakeId = text(request.data?.intakeId);
  const notes = text(request.data?.notes || request.data?.inspectionNotes);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  if (notes.length < 8) throw new HttpsError("invalid-argument", "Record clear portfolio inspection notes.");
  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const paymentRef = db.collection("payment_transactions").doc(intakeId);
  const contractRef = db.collection("contracts").doc(intakeId);
  const [intakeSnap, paymentSnap, contractSnap] = await Promise.all([intakeRef.get(), paymentRef.get(), contractRef.get()]);
  if (!intakeSnap.exists || !paymentSnap.exists || !contractSnap.exists) throw new HttpsError("failed-precondition", "The inspection-first onboarding package is incomplete.");
  const intake = intakeSnap.data() || {};
  if (text(intake.workflowVersion) !== WORKFLOW_VERSION) throw new HttpsError("failed-precondition", "This action is only for the five-page inspection-first workflow.");
  const properties = Array.isArray(intake.properties) ? intake.properties : [];
  const inspectionIds = Array.isArray(intake.inspectionIds) ? Array.from(new Set(intake.inspectionIds.map(text).filter(Boolean))) : [text(intake.inspectionId)].filter(Boolean);
  if (!properties.length || inspectionIds.length !== properties.length) throw new HttpsError("failed-precondition", `Every property requires a linked site inspection. Expected ${properties.length}, found ${inspectionIds.length}.`);
  const inspectionRefs = inspectionIds.map((inspectionId) => db.collection("property_inspections").doc(inspectionId));
  const inspectionSnaps = await Promise.all(inspectionRefs.map((ref) => ref.get()));
  const inspectionByPropertyId = new Map<string, any>();
  inspectionSnaps.forEach((snapshot, index) => {
    if (!snapshot.exists) throw new HttpsError("failed-precondition", `Inspection ${inspectionIds[index]} is missing.`);
    const value = snapshot.data() || {};
    const propertyId = text(value.propertyId);
    if (!propertyId || inspectionByPropertyId.has(propertyId)) throw new HttpsError("failed-precondition", "Every property must have one unique evidence-backed inspection.");
    if (text(value.intakeId) !== intakeId || upper(value.status) === "CANCELLED") throw new HttpsError("failed-precondition", "A linked inspection is invalid or cancelled.");
    if (upper(value.evidenceStatus) !== "VERIFIED" || !/^[a-f0-9]{64}$/i.test(text(value.evidenceHash)) || !text(value.evidenceGeneration) || value.arrivalLocation?.withinRadius !== true || value.checklistVerified !== true || !value.visitStartedAt || !value.visitCompletedAt) {
      throw new HttpsError("failed-precondition", `Inspection ${index + 1} requires verified GPS, checklist, photo evidence and timestamps before completion.`);
    }
    inspectionByPropertyId.set(propertyId, value);
  });
  if (inspectionByPropertyId.size !== properties.length) throw new HttpsError("failed-precondition", "Every property must have one unique evidence-backed inspection.");

  const verifiedProperties = properties.map((property: any) => {
    const propertyId = text(property?.propertyId || property?.id);
    const inspection = inspectionByPropertyId.get(propertyId);
    if (!inspection) throw new HttpsError("failed-precondition", `No verified inspection is linked to property ${propertyId || "unknown"}.`);
    if (!isGymProperty(property, inspection)) return property;
    if (upper(inspection.gymVerificationStatus) !== "VERIFIED" || !inspection.gymVerification) {
      throw new HttpsError("failed-precondition", `Gym / Fitness Centre ${propertyId} requires verified service area and complexity before the final quote can be issued.`);
    }
    const verified = verifiedGymPayload(inspection.gymVerification);
    const existingProfile = property.gymProfile && typeof property.gymProfile === "object" ? property.gymProfile : {};
    return {
      ...property,
      verifiedServiceAreaSqft: verified.verifiedServiceAreaSqft,
      gymProfile: {
        ...existingProfile,
        ownerDeclaredServiceAreaSqft: Number(existingProfile.declaredServiceAreaSqft || property.sqft || 0),
        ownerDeclaredOpeningSchedule: existingProfile.openingSchedule || null,
        ownerDeclaredEquipmentCount: Number(existingProfile.equipmentCount || 0),
        verifiedServiceAreaSqft: verified.verifiedServiceAreaSqft,
        verifiedComplexity: verified.verifiedComplexity,
        openingSchedule: verified.openingSchedule,
        verifiedOpeningSchedule: verified.openingSchedule,
        equipmentCount: verified.equipmentCount,
        verifiedEquipmentCount: verified.equipmentCount,
        changingRooms: verified.changingRooms,
        showers: verified.showers,
        groupStudios: verified.groupStudios,
        wetFacilities: verified.wetFacilities,
        swimmingPool: verified.swimmingPool,
        treatmentRecoveryArea: verified.treatmentRecoveryArea,
        sportsEstablishmentApprovalStatus: verified.sportsEstablishmentApprovalStatus,
        insuranceStatus: verified.insuranceStatus,
        floorPlanStatus: verified.floorPlanStatus,
        verificationSource: "ADMIN_SITE_VISIT",
        verificationInspectionId: text(inspection.id),
        verificationEvidenceHash: text(inspection.evidenceHash),
      },
    };
  });

  const finalQuotedAtMs = Date.now();
  let finalQuote: ReturnType<typeof calculateOwnerOnboardingQuote>;
  try {
    finalQuote = calculateOwnerOnboardingQuote(verifiedProperties, Array.isArray(intake.selectedAddOns) ? intake.selectedAddOns : [], finalQuotedAtMs);
  } catch (error: any) {
    throw new HttpsError("failed-precondition", `Final verified portfolio quote failed: ${error?.message || String(error)}`);
  }
  const ownerUid = text(intake.ownerUid || intake.ownerId);
  const amount = money(finalQuote.activationDeposit);
  const annualContractValue = money(finalQuote.annualContractValue);
  const signedQuoteHash = text(intake.quoteHash || contractSnap.data()?.quoteHash || paymentSnap.data()?.quoteHash).toLowerCase();
  if (!ownerUid || amount <= 0 || annualContractValue <= 0 || !/^[a-f0-9]{64}$/.test(signedQuoteHash) || !/^[a-f0-9]{64}$/.test(text(finalQuote.quoteHash))) {
    throw new HttpsError("failed-precondition", "Owner binding, signed quote evidence, or final verified commercial schedule is invalid.");
  }

  const propertyQuery = await db.collection("properties").where("intakeId", "==", intakeId).limit(100).get();
  if (propertyQuery.size !== properties.length) throw new HttpsError("failed-precondition", "Canonical property records do not match the submitted portfolio.");
  const verifiedPropertyById = new Map(verifiedProperties.map((property: any) => [text(property.propertyId || property.id), property]));
  const now = FieldValue.serverTimestamp();
  const finalCommercial = {
    signedPreInspectionQuoteHash: signedQuoteHash,
    finalVerifiedQuoteHash: finalQuote.quoteHash,
    finalVerifiedQuoteSnapshot: finalQuote,
    finalVerifiedQuotedAtMs: finalQuote.quotedAtMs,
    finalVerifiedExpiresAtMs: finalQuote.expiresAtMs,
    finalAnnualContractValue: annualContractValue,
    finalActivationDeposit: amount,
    quoteRepricedAfterInspection: true,
    quoteVerificationState: "FINAL_VERIFIED_AFTER_ALL_SITE_VISITS",
  };
  const batch = db.batch();
  inspectionRefs.forEach((inspectionRef, index) => batch.set(inspectionRef, {
    status: "COMPLETED",
    inspectionStatus: "COMPLETED",
    portfolioInspectionIndex: index,
    portfolioNotes: notes,
    finalVerifiedQuoteHash: finalQuote.quoteHash,
    completedBy: actor.uid,
    completedByEmail: actor.email,
    completedAt: now,
    updatedAt: now,
  }, { merge: true }));
  batch.set(intakeRef, {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionStatus: "COMPLETED",
    inspectionCompletedCount: inspectionIds.length,
    inspectionEvidenceVerifiedCount: inspectionIds.length,
    adminReviewState: "ALL_INSPECTIONS_COMPLETE_FINAL_QUOTE_VERIFIED_AWAITING_15_PERCENT_PAYMENT",
    activationState: "LOCKED_PENDING_15_PERCENT_PAYMENT",
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    paymentCollectionStage: "15_PERCENT_DUE_AFTER_COMPLETED_VISITS_AND_FINAL_REQUOTE",
    inspectionNotes: notes,
    inspectionCompletedAt: now,
    inspectionCompletedBy: actor.uid,
    properties: verifiedProperties,
    annualContractValue,
    mobilizationAmount: amount,
    portfolioSummary: {
      ...(intake.portfolioSummary || {}),
      estimatedACV: annualContractValue,
      finalVerifiedACV: annualContractValue,
    },
    ...finalCommercial,
    updatedAt: now,
  }, { merge: true });
  batch.set(paymentRef, {
    status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    verificationState: "ADMIN_PAYMENT_EVIDENCE_REQUIRED_AFTER_FINAL_VERIFIED_QUOTE",
    adminApprovalRequired: true,
    unlocksDashboard: false,
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionVerified: true,
    inspectionEvidenceVerified: true,
    paymentDueAfterInspection: true,
    annualContractValue,
    activationDeposit: amount,
    amount,
    ...finalCommercial,
    updatedAt: now,
  }, { merge: true });
  batch.set(contractRef, {
    status: "SIGNED_AWAITING_15_PERCENT_PAYMENT",
    contractStatus: "signed_awaiting_payment",
    activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT",
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionVerified: true,
    inspectionEvidenceVerified: true,
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    annualContractValue,
    activationDeposit: amount,
    depositAmount: amount,
    mobilizationAmount: amount,
    properties: verifiedProperties,
    ...finalCommercial,
    updatedAt: now,
  }, { merge: true });
  propertyQuery.docs.forEach((document) => {
    const property = document.data() || {};
    const verifiedProperty = verifiedPropertyById.get(document.id) || verifiedPropertyById.get(text(property.propertyId));
    if (!verifiedProperty) throw new HttpsError("failed-precondition", `No final verified property snapshot exists for ${document.id}.`);
    batch.set(document.ref, {
      ...verifiedProperty,
      status: "AWAITING_15_PERCENT_PAYMENT",
      activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT",
      inspectionStatus: "COMPLETED",
      adminSiteVisitVerified: true,
      locationVerified: true,
      finalVerifiedQuoteHash: finalQuote.quoteHash,
      geo: {
        ...(property.geo || verifiedProperty.geo || {}),
        verified: true,
        requiresGeoReview: false,
        dispatchReady: true,
        verifiedBy: actor.uid,
        verifiedAt: now,
      },
      updatedAt: now,
    }, { merge: true });
  });
  batch.set(db.collection("users").doc(ownerUid), { status: "awaiting_activation_payment", onboardingStatus: "FINAL_QUOTE_VERIFIED_AWAITING_15_PERCENT_PAYMENT", dashboardLocked: true, dashboardUnlocked: false, updatedAt: now }, { merge: true });
  batch.set(db.collection("owners").doc(ownerUid), { status: "AWAITING_ACTIVATION_PAYMENT", onboardingStatus: "FINAL_QUOTE_VERIFIED_AWAITING_15_PERCENT_PAYMENT", updatedAt: now }, { merge: true });
  batch.set(db.collection("notifications").doc(), {
    userId: ownerUid,
    toRole: "owner",
    type: "OWNER_INSPECTIONS_COMPLETE_FINAL_QUOTE_PAYMENT_DUE",
    title: "Property visits completed and final quote verified",
    body: `All evidence-backed property visits are complete. The final verified annual value is AED ${annualContractValue.toLocaleString("en-AE")} and the exact 15% mobilisation payment of AED ${amount.toLocaleString("en-AE")} is now due for Admin verification.`,
    read: false,
    createdAt: now,
  });
  batch.set(db.collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: "admin",
    action: "COMPLETE_EVIDENCE_BACKED_OWNER_PORTFOLIO_INSPECTIONS_AND_FINAL_REQUOTE",
    targetType: "intake_submissions",
    targetId: intakeId,
    metadata: {
      inspectionIds,
      inspectionCount: inspectionIds.length,
      paymentId: intakeId,
      signedPreInspectionQuoteHash: signedQuoteHash,
      finalVerifiedQuoteHash: finalQuote.quoteHash,
      annualContractValue,
      amount,
      gymPropertyCount: verifiedProperties.filter((property: any) => isGymProperty(property)).length,
    },
    createdAt: now,
  });
  await batch.commit();
  return {
    status: "COMPLETED",
    intakeId,
    inspectionIds,
    paymentId: intakeId,
    annualContractValue,
    activationDeposit: amount,
    signedPreInspectionQuoteHash: signedQuoteHash,
    finalVerifiedQuoteHash: finalQuote.quoteHash,
    nextState: "AWAITING_15_PERCENT_PAYMENT",
  };
});
