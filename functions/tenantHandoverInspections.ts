import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function asObject(value: any, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", `${label} is required.`);
  }
  return value;
}

function clean(value: any): any {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (typeof entry !== "function") out[key] = clean(entry);
    });
    return out;
  }
  return value;
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeInspectionType(value: unknown) {
  const text = String(value || "").toUpperCase().replace(/[\s-]+/g, "_");
  return text.includes("OUT") ? "MOVE_OUT" : "MOVE_IN";
}

function stringOrEmpty(value: unknown) {
  return String(value || "").trim();
}

export const submitTenantMoveInspection = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in before submitting a handover inspection.");
  }

  const uid = request.auth.uid;
  const email = normalizeEmail(request.auth.token?.email);
  const payload = asObject(request.data || {}, "Inspection payload");
  const unitId = stringOrEmpty(payload.unitId);
  const propertyId = stringOrEmpty(payload.propertyId);

  if (!unitId || !propertyId) {
    throw new HttpsError("invalid-argument", "Linked unit and property are required.");
  }

  const unitSnap = await db.collection("units").doc(unitId).get();
  if (!unitSnap.exists) {
    throw new HttpsError("not-found", "Linked unit was not found.");
  }

  const unit = unitSnap.data() || {};
  const tenantMatches =
    unit.tenantId === uid ||
    unit.tenantUid === uid ||
    unit.userId === uid ||
    unit.authUid === uid ||
    normalizeEmail(unit.tenantEmail) === email;

  if (!tenantMatches) {
    throw new HttpsError("permission-denied", "This tenant is not linked to the selected unit.");
  }

  if (unit.propertyId && unit.propertyId !== propertyId) {
    throw new HttpsError("permission-denied", "Selected unit does not belong to the submitted property.");
  }

  const inspectionType = normalizeInspectionType(payload.inspectionType || payload.type || payload.legacyType);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const ownerReviewRef = db.collection("propertyInspections").doc();
  const legacyRef = db.collection("inspections").doc();

  const normalized = clean({
    ...payload,
    tenantId: uid,
    tenantUid: uid,
    tenantEmail: email,
    unitId,
    propertyId,
    ownerId: payload.ownerId || unit.ownerId || "",
    ownerUid: payload.ownerUid || unit.ownerUid || unit.ownerId || "",
    ownerEmail: normalizeEmail(payload.ownerEmail || unit.ownerEmail),
    inspectionType,
    type: inspectionType,
    status: "SUBMITTED",
    ownerReviewStatus: "PENDING",
    source: "TENANT_PORTAL_CALLABLE",
    submittedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.runTransaction(async (transaction) => {
    transaction.set(ownerReviewRef, normalized);
    transaction.set(legacyRef, {
      ...normalized,
      status: "submitted",
      ownerReviewInspectionId: ownerReviewRef.id,
    });
  });

  return {
    ok: true,
    propertyInspectionId: ownerReviewRef.id,
    legacyInspectionId: legacyRef.id,
  };
});
