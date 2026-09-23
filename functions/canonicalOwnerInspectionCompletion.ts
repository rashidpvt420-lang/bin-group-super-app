import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminCompleteOwnerPortfolioInspections as legacyAdminCompleteOwnerPortfolioInspections } from "./ownerInspectionCompletion";
import { buildInspectionVerifiedPropertyGeo } from "./propertyGeoAuthority";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const OWNER_WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const GEO_AUTHORITY_VERSION = "PHYSICAL_INSPECTION_EVIDENCE_V2";
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

export const adminCompleteOwnerPortfolioInspections = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    const runner = (legacyAdminCompleteOwnerPortfolioInspections as any).run;
    if (typeof runner !== "function") {
      throw new HttpsError("internal", "The protected portfolio inspection completion handler is unavailable.");
    }

    const legacyResult = await runner(request);
    const actorUid = text(request.auth?.uid, 240);
    const intakeId = text(request.data?.intakeId, 240);
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
      const canonical = buildInspectionVerifiedPropertyGeo(property, inspection, evidenceActor, now);
      batch.set(document.ref, {
        geo: canonical.geo,
        geoVerification: canonical.geoVerification,
        locationVerified: true,
        dispatchReady: true,
        requiresGeoReview: false,
        geoAuthorityVersion: GEO_AUTHORITY_VERSION,
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
