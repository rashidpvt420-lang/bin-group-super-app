import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const text = (value: unknown) => String(value || "").trim();
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
const safeId = (value: unknown, fallback: string) => text(value)
  .replace(/[^A-Za-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .slice(0, 160) || fallback;

async function requireAdmin(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = request.auth.token || {};
  if (
    token.suspended === true ||
    !(ADMIN_ROLES.has(roleOf(token)) || token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true)
  ) throw new HttpsError("permission-denied", "Admin permission required.");
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled) throw new HttpsError("permission-denied", "Disabled Admin account.");
  return { uid: request.auth.uid, email: text(token.email || user.email).toLowerCase() };
}

export const adminCreateOwnerPortfolioPropertyInspection = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const actor = await requireAdmin(request);
  const intakeId = safeId(request.data?.intakeId, "");
  const propertyIndex = Number(request.data?.propertyIndex);
  if (!intakeId || !Number.isInteger(propertyIndex) || propertyIndex < 0 || propertyIndex > 99) {
    throw new HttpsError("invalid-argument", "A valid intakeId and propertyIndex are required.");
  }

  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const intakeSnap = await intakeRef.get();
  if (!intakeSnap.exists) throw new HttpsError("not-found", "Owner application not found.");
  const intake = intakeSnap.data() || {};
  if (text(intake.workflowVersion) !== WORKFLOW_VERSION) {
    throw new HttpsError("failed-precondition", "This action is only for the protected five-page Owner workflow.");
  }
  const properties = Array.isArray(intake.properties) ? intake.properties : [];
  const property = properties[propertyIndex];
  if (!property) throw new HttpsError("not-found", `Property ${propertyIndex + 1} was not found in this application.`);
  const lat = Number(property?.geo?.lat ?? property?.geo?.point?.latitude);
  const lng = Number(property?.geo?.lng ?? property?.geo?.point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HttpsError("failed-precondition", "Owner-submitted GPS is required before creating a site visit.");
  }

  const ownerUid = text(intake.ownerUid || intake.ownerId);
  const propertyId = safeId(property.propertyId || property.id, `${intakeId}_property_${propertyIndex + 1}`);
  const deterministicKey = safeId(`${intakeId}_${propertyId}`, `${intakeId}_property_${propertyIndex + 1}`);
  const inspectionRef = db.collection("property_inspections").doc(`owner_inspection_${deterministicKey}`);
  const ticketRef = db.collection("maintenanceTickets").doc(`owner_inspection_ticket_${deterministicKey}`);
  const dispatchRef = db.collection("technician_dispatch_jobs").doc(`owner_inspection_dispatch_${deterministicKey}`);
  const point = new admin.firestore.GeoPoint(lat, lng);
  const location = {
    lat,
    lng,
    point,
    geohash: text(property?.geo?.geohash),
    address: text(property?.geo?.address || property.address),
    emirate: text(property?.geo?.emirate || property.emirate),
    area: text(property?.geo?.area || property.area),
    source: "OWNER_SUBMITTED_PENDING_ADMIN_VERIFICATION",
    mapUrl: `https://www.google.com/maps?q=${lat},${lng}`,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  };

  const result = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(inspectionRef);
    if (existing.exists && text(existing.data()?.intakeId) === intakeId) {
      return {
        idempotent: true,
        inspectionId: inspectionRef.id,
        ticketId: text(existing.data()?.ticketId || ticketRef.id),
        dispatchJobId: text(existing.data()?.dispatchJobId || dispatchRef.id),
      };
    }
    const now = FieldValue.serverTimestamp();
    transaction.set(inspectionRef, {
      id: inspectionRef.id,
      intakeId,
      workflowVersion: WORKFLOW_VERSION,
      ownerId: ownerUid,
      ownerUid,
      ownerName: text(intake.ownerName || intake.contactInfo?.name),
      ownerEmail: text(intake.ownerEmail || intake.contactInfo?.email).toLowerCase(),
      ownerMobile: text(intake.ownerMobile || intake.contactInfo?.phone),
      propertyIndex,
      propertyId,
      propertyName: location.address || `Property ${propertyIndex + 1}`,
      location,
      status: "READY_FOR_SITE_VISIT",
      inspectionStatus: "READY_FOR_SITE_VISIT",
      ticketId: ticketRef.id,
      dispatchJobId: dispatchRef.id,
      paymentCollectionRequired: false,
      paymentCollectionStage: "AFTER_ALL_PORTFOLIO_VISITS_COMPLETE",
      paymentAmount: null,
      createdBy: actor.uid,
      createdByEmail: actor.email,
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(ticketRef, {
      id: ticketRef.id,
      intakeId,
      workflowVersion: WORKFLOW_VERSION,
      inspectionId: inspectionRef.id,
      ownerId: ownerUid,
      ownerUid,
      propertyId,
      propertyIndex,
      title: "Owner onboarding property verification visit",
      category: "ONBOARDING_INSPECTION",
      status: "OPEN",
      priority: "HIGH",
      location,
      assignedTechnicianId: null,
      paymentCollectionRequired: false,
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(dispatchRef, {
      id: dispatchRef.id,
      intakeId,
      workflowVersion: WORKFLOW_VERSION,
      inspectionId: inspectionRef.id,
      ticketId: ticketRef.id,
      ownerId: ownerUid,
      ownerUid,
      propertyId,
      propertyIndex,
      jobType: "OWNER_ONBOARDING_SITE_INSPECTION",
      status: "PENDING_ASSIGNMENT",
      assignmentState: "UNASSIGNED_NEAREST_TECH_REQUIRED",
      location,
      paymentCollectionRequired: false,
      paymentCollectionStage: "AFTER_ALL_PORTFOLIO_VISITS_COMPLETE",
      createdAt: now,
      updatedAt: now,
    });
    transaction.set(db.collection("audit_logs").doc(), {
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: "admin",
      action: "CREATE_OWNER_PORTFOLIO_PROPERTY_INSPECTION",
      targetType: "property_inspections",
      targetId: inspectionRef.id,
      metadata: { intakeId, propertyId, propertyIndex, ticketId: ticketRef.id, dispatchJobId: dispatchRef.id, paymentCollectionRequired: false },
      createdAt: now,
    });
    return { idempotent: false, inspectionId: inspectionRef.id, ticketId: ticketRef.id, dispatchJobId: dispatchRef.id };
  });

  return { status: "CREATED", ...result, directionsUrl: location.directionsUrl };
});

export const adminLinkOwnerPropertyInspection = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const actor = await requireAdmin(request);
  const intakeId = text(request.data?.intakeId);
  const suppliedIds: unknown[] = Array.isArray(request.data?.inspectionIds)
    ? request.data.inspectionIds
    : [request.data?.inspectionId];
  const inspectionIds: string[] = Array.from(
    new Set(suppliedIds.map((value: unknown) => text(value)).filter(Boolean)),
  ).slice(0, 100);
  if (!intakeId || !inspectionIds.length) throw new HttpsError("invalid-argument", "intakeId and at least one inspection ID are required.");

  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const inspectionRefs = inspectionIds.map((inspectionId: string) => db.collection("property_inspections").doc(inspectionId));
  const [intakeSnap, ...inspectionSnaps] = await Promise.all([intakeRef.get(), ...inspectionRefs.map((ref) => ref.get())]);
  if (!intakeSnap.exists) throw new HttpsError("not-found", "Owner application not found.");
  inspectionSnaps.forEach((inspectionSnap, index) => {
    if (!inspectionSnap.exists) throw new HttpsError("not-found", `Property inspection ${inspectionIds[index]} was not found.`);
    if (text(inspectionSnap.data()?.intakeId) !== intakeId) throw new HttpsError("failed-precondition", "An inspection does not belong to this Owner application.");
  });

  const propertyCount = Array.isArray(intakeSnap.data()?.properties) ? intakeSnap.data()?.properties.length : 0;
  if (propertyCount > 0 && inspectionIds.length !== propertyCount) {
    throw new HttpsError("failed-precondition", `Create one site inspection for every property. Expected ${propertyCount}, received ${inspectionIds.length}.`);
  }

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(intakeRef, {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionStatus: "READY_FOR_SITE_VISITS",
    adminReviewState: "SITE_VISITS_CREATED_PENDING_COMPLETION",
    activationState: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("payment_transactions").doc(intakeId), {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionStatus: "READY_FOR_SITE_VISITS",
    inspectionVerified: false,
    status: "AWAITING_SITE_INSPECTION",
    paymentStatus: "AWAITING_SITE_INSPECTION",
    verificationState: "INSPECTION_REQUIRED_BEFORE_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("contracts").doc(intakeId), {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionStatus: "READY_FOR_SITE_VISITS",
    activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: "admin",
    action: "LINK_OWNER_PROPERTY_INSPECTIONS_TO_APPLICATION",
    targetType: "intake_submissions",
    targetId: intakeId,
    metadata: { inspectionIds, inspectionCount: inspectionIds.length },
    createdAt: now,
  });
  await batch.commit();
  return { status: "LINKED", intakeId, inspectionId: inspectionIds[0], inspectionIds };
});
