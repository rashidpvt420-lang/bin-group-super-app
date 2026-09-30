import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  adminCompleteOwnerPortfolioInspections as legacyAdminCompleteOwnerPortfolioInspections,
  requireAdmin as requireInspectionCompletionAdmin,
} from "./ownerInspectionCompletion";
import { buildInspectionVerifiedPropertyGeo, PropertyGeoAuthorityError } from "./propertyGeoAuthority";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const OWNER_WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const GEO_AUTHORITY_VERSION = "PHYSICAL_INSPECTION_EVIDENCE_V2";
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const isPlainObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function buildGeoOrFailedPrecondition(...args: Parameters<typeof buildInspectionVerifiedPropertyGeo>) {
  try {
    return buildInspectionVerifiedPropertyGeo(...args);
  } catch (error) {
    if (error instanceof PropertyGeoAuthorityError) throw new HttpsError("failed-precondition", error.message);
    throw error;
  }
}

/**
 * The legacy runner commits the completed inspections, final quote, contract and payment state in
 * its own batch; the canonical geo promotion below is a second batch. Validate the geo evidence
 * against the state the runner is about to write before it commits, so an address or arrival
 * coordinate problem fails the whole completion instead of leaving a half-completed portfolio.
 */
async function assertPortfolioGeoPromotable(intakeId: string, actorUid: string): Promise<void> {
  const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
  const intake = intakeSnap.data() || {};
  if (!intakeSnap.exists || text(intake.workflowVersion) !== OWNER_WORKFLOW_VERSION) return; // the runner rejects these itself
  const submittedProperties: Record<string, any>[] = Array.isArray(intake.properties) ? intake.properties.filter(isPlainObject) : [];
  const inspectionIds: string[] = Array.isArray(intake.inspectionIds)
    ? Array.from(new Set(intake.inspectionIds.map((value: unknown) => text(value, 240)).filter(Boolean)))
    : [];
  if (!submittedProperties.length || !inspectionIds.length) return;

  const [propertySnapshot, ...inspectionSnapshots] = await Promise.all([
    db.collection("properties").where("intakeId", "==", intakeId).limit(100).get(),
    ...inspectionIds.map((inspectionId) => db.collection("property_inspections").doc(inspectionId).get()),
  ]);
  const inspectionByPropertyId = new Map<string, Record<string, any>>();
  inspectionSnapshots.forEach((snapshot) => {
    if (!snapshot.exists) return;
    const value: Record<string, any> = { id: snapshot.id, ...(snapshot.data() || {}) };
    const propertyId = text(value.propertyId, 240);
    if (propertyId) inspectionByPropertyId.set(propertyId, value);
  });
  const submittedById = new Map(submittedProperties.map((property) => [text(property.propertyId || property.id, 240), property]));
  const now = admin.firestore.Timestamp.now();

  propertySnapshot.docs.forEach((document) => {
    const stored = document.data() || {};
    const propertyId = text(stored.propertyId || document.id, 240);
    const submitted = submittedById.get(document.id) || submittedById.get(propertyId);
    const inspection = inspectionByPropertyId.get(propertyId);
    if (!submitted || !inspection) return; // the runner rejects an unbound property itself
    // Mirror the runner's merge write: the verified snapshot (with the Admin-verified emirate) over the stored record.
    const verifiedEmirate = text(inspection.pricingVerification?.emirate, 120);
    const projected: Record<string, any> = { ...stored, ...submitted, ...(verifiedEmirate ? { emirate: verifiedEmirate } : {}) };
    for (const key of ["submittedGeo", "geo", "location"]) {
      if (isPlainObject(stored[key]) && isPlainObject(submitted[key])) projected[key] = { ...stored[key], ...submitted[key] };
    }
    const evidenceActor = text(inspection.evidenceRecordedBy || actorUid, 240);
    buildGeoOrFailedPrecondition(projected, { ...inspection, status: "COMPLETED" }, evidenceActor, now);
  });
}

export const adminCompleteOwnerPortfolioInspections = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    const runner = (legacyAdminCompleteOwnerPortfolioInspections as any).run;
    if (typeof runner !== "function") {
      throw new HttpsError("internal", "The protected portfolio inspection completion handler is unavailable.");
    }

    const actorUid = text(request.auth?.uid, 240);
    const intakeId = text(request.data?.intakeId, 240);
    if (actorUid && intakeId) {
      // Same Admin gate as the runner, so the preflight never reads or reports on intakes for non-Admins.
      await requireInspectionCompletionAdmin(request);
      await assertPortfolioGeoPromotable(intakeId, actorUid);
    }

    const legacyResult = await runner(request);
    if (!actorUid || !intakeId) {
      throw new HttpsError("failed-precondition", "Verified inspection completion context is missing.");
    }

    const intakeRef = db.collection("intake_submissions").doc(intakeId);
    const intakeSnap = await intakeRef.get();
    if (!intakeSnap.exists) throw new HttpsError("failed-precondition", "Completed Owner intake was not found.");
    const intake = intakeSnap.data() || {};
    if (text(intake.workflowVersion) !== OWNER_WORKFLOW_VERSION) {
      throw new HttpsError("failed-precondition", "Physical geo promotion is limited to the canonical inspection-first Owner workflow.");
    }

    const submittedProperties = Array.isArray(intake.properties) ? intake.properties : [];
    const inspectionIds = Array.isArray(intake.inspectionIds)
      ? Array.from(new Set(intake.inspectionIds.map((value: unknown) => text(value, 240)).filter(Boolean)))
      : [];
    if (!submittedProperties.length || inspectionIds.length !== submittedProperties.length) {
      throw new HttpsError("failed-precondition", "Every submitted property requires one completed inspection before geo promotion.");
    }

    const [propertySnapshot, ...inspectionSnapshots] = await Promise.all([
      db.collection("properties").where("intakeId", "==", intakeId).limit(100).get(),
      ...inspectionIds.map((inspectionId) => db.collection("property_inspections").doc(inspectionId).get()),
    ]);
    if (propertySnapshot.size !== submittedProperties.length) {
      throw new HttpsError("failed-precondition", "Canonical property records do not match the inspected portfolio.");
    }

    const inspectionByPropertyId = new Map<string, Record<string, any>>();
    inspectionSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) {
        throw new HttpsError("failed-precondition", `Inspection ${inspectionIds[index]} disappeared after completion.`);
      }
      const value: Record<string, any> = { id: snapshot.id, ...(snapshot.data() || {}) };
      const propertyId = text(value.propertyId, 240);
      if (!propertyId || inspectionByPropertyId.has(propertyId)) {
        throw new HttpsError("failed-precondition", "Every property must have exactly one evidence-backed inspection.");
      }
      inspectionByPropertyId.set(propertyId, value);
    });

    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    const promotedPropertyIds: string[] = [];
    propertySnapshot.docs.forEach((document) => {
      const property = document.data() || {};
      const propertyId = text(property.propertyId || document.id, 240);
      const inspection = inspectionByPropertyId.get(propertyId);
      if (!inspection) {
        throw new HttpsError("failed-precondition", `No completed inspection is bound to property ${propertyId || document.id}.`);
      }
      const evidenceActor = text(inspection.evidenceRecordedBy || actorUid, 240);
      const canonical = buildGeoOrFailedPrecondition(property, inspection, evidenceActor, now);
      batch.set(document.ref, {
        geo: canonical.geo,
        geoVerification: canonical.geoVerification,
        locationVerified: true,
        dispatchReady: true,
        requiresGeoReview: false,
        geoAuthorityVersion: GEO_AUTHORITY_VERSION,
        geoPromotionState: "CANONICAL_PHYSICAL_EVIDENCE_PROMOTED",
        geoVerifiedAt: now,
        geoVerifiedBy: evidenceActor,
        updatedAt: now,
      }, { merge: true });
      promotedPropertyIds.push(document.id);
    });

    batch.set(db.collection("audit_logs").doc(), {
      action: "PROMOTE_PHYSICAL_INSPECTION_GPS_TO_CANONICAL_PROPERTY_GEO",
      actorId: actorUid,
      actorRole: "admin",
      intakeId,
      propertyIds: promotedPropertyIds,
      inspectionIds,
      geoAuthorityVersion: GEO_AUTHORITY_VERSION,
      source: "CANONICAL_OWNER_INSPECTION_COMPLETION_WRAPPER",
      createdAt: now,
    });
    await batch.commit();

    return {
      ...(legacyResult || {}),
      geoAuthorityVersion: GEO_AUTHORITY_VERSION,
      geoVerifiedPropertyCount: promotedPropertyIds.length,
    };
  },
);
