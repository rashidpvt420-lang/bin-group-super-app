import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const MAX_VISIT_RADIUS_METRES = 750;
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
    metadata: { intakeId, propertyId, distanceMetres: distance, evidenceHash, generation, checklistVerified: true },
    createdAt: now,
  });
  await batch.commit();
  return { status: "VERIFIED", intakeId, inspectionId, propertyId, distanceMetres: distance, evidenceHash, generation };
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
  const propertyIds = new Set<string>();
  inspectionSnaps.forEach((snapshot, index) => {
    if (!snapshot.exists) throw new HttpsError("failed-precondition", `Inspection ${inspectionIds[index]} is missing.`);
    const value = snapshot.data() || {};
    const propertyId = text(value.propertyId);
    propertyIds.add(propertyId);
    if (text(value.intakeId) !== intakeId || upper(value.status) === "CANCELLED") throw new HttpsError("failed-precondition", "A linked inspection is invalid or cancelled.");
    if (upper(value.evidenceStatus) !== "VERIFIED" || !/^[a-f0-9]{64}$/i.test(text(value.evidenceHash)) || !text(value.evidenceGeneration) || value.arrivalLocation?.withinRadius !== true || value.checklistVerified !== true || !value.visitStartedAt || !value.visitCompletedAt) {
      throw new HttpsError("failed-precondition", `Inspection ${index + 1} requires verified GPS, checklist, photo evidence and timestamps before completion.`);
    }
  });
  if (propertyIds.size !== properties.length || propertyIds.has("")) throw new HttpsError("failed-precondition", "Every property must have one unique evidence-backed inspection.");
  const ownerUid = text(intake.ownerUid || intake.ownerId);
  const amount = money(paymentSnap.data()?.activationDeposit || paymentSnap.data()?.amount);
  if (!ownerUid || amount <= 0) throw new HttpsError("failed-precondition", "Owner binding or 15% mobilisation amount is missing.");
  const propertyQuery = await db.collection("properties").where("intakeId", "==", intakeId).limit(100).get();
  if (propertyQuery.size !== properties.length) throw new HttpsError("failed-precondition", "Canonical property records do not match the submitted portfolio.");
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  inspectionRefs.forEach((inspectionRef, index) => batch.set(inspectionRef, { status: "COMPLETED", inspectionStatus: "COMPLETED", portfolioInspectionIndex: index, portfolioNotes: notes, completedBy: actor.uid, completedByEmail: actor.email, completedAt: now, updatedAt: now }, { merge: true }));
  batch.set(intakeRef, { inspectionId: inspectionIds[0], inspectionIds, inspectionStatus: "COMPLETED", inspectionCompletedCount: inspectionIds.length, inspectionEvidenceVerifiedCount: inspectionIds.length, adminReviewState: "ALL_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT", activationState: "LOCKED_PENDING_15_PERCENT_PAYMENT", paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION", paymentCollectionStage: "15_PERCENT_DUE_AFTER_COMPLETED_VISITS", inspectionNotes: notes, inspectionCompletedAt: now, inspectionCompletedBy: actor.uid, updatedAt: now }, { merge: true });
  batch.set(paymentRef, { status: "PENDING_ADMIN_PAYMENT_VERIFICATION", paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION", verificationState: "ADMIN_PAYMENT_EVIDENCE_REQUIRED", adminApprovalRequired: true, unlocksDashboard: false, inspectionId: inspectionIds[0], inspectionIds, inspectionVerified: true, inspectionEvidenceVerified: true, paymentDueAfterInspection: true, updatedAt: now }, { merge: true });
  batch.set(contractRef, { status: "SIGNED_AWAITING_15_PERCENT_PAYMENT", contractStatus: "signed_awaiting_payment", activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT", inspectionId: inspectionIds[0], inspectionIds, inspectionVerified: true, inspectionEvidenceVerified: true, paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION", updatedAt: now }, { merge: true });
  propertyQuery.docs.forEach((document) => {
    const property = document.data() || {};
    batch.set(document.ref, { status: "AWAITING_15_PERCENT_PAYMENT", activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT", inspectionStatus: "COMPLETED", adminSiteVisitVerified: true, locationVerified: true, geo: { ...(property.geo || {}), verified: true, requiresGeoReview: false, dispatchReady: true, verifiedBy: actor.uid, verifiedAt: now }, updatedAt: now }, { merge: true });
  });
  batch.set(db.collection("users").doc(ownerUid), { status: "awaiting_activation_payment", onboardingStatus: "ALL_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT", dashboardLocked: true, dashboardUnlocked: false, updatedAt: now }, { merge: true });
  batch.set(db.collection("owners").doc(ownerUid), { status: "AWAITING_ACTIVATION_PAYMENT", onboardingStatus: "ALL_INSPECTIONS_COMPLETE_AWAITING_15_PERCENT_PAYMENT", updatedAt: now }, { merge: true });
  batch.set(db.collection("notifications").doc(), { userId: ownerUid, toRole: "owner", type: "OWNER_INSPECTIONS_COMPLETE_PAYMENT_DUE", title: "Property visits completed", body: `All evidence-backed property visits are complete. The 15% mobilisation payment of AED ${amount.toLocaleString("en-AE")} is now due for Admin verification.`, read: false, createdAt: now });
  batch.set(db.collection("audit_logs").doc(), { actorId: actor.uid, actorEmail: actor.email, actorRole: "admin", action: "COMPLETE_EVIDENCE_BACKED_OWNER_PORTFOLIO_INSPECTIONS", targetType: "intake_submissions", targetId: intakeId, metadata: { inspectionIds, inspectionCount: inspectionIds.length, paymentId: intakeId, amount }, createdAt: now });
  await batch.commit();
  return { status: "COMPLETED", intakeId, inspectionIds, paymentId: intakeId, activationDeposit: amount, nextState: "AWAITING_15_PERCENT_PAYMENT" };
});
