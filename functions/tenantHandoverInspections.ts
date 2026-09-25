import { FieldValue } from "firebase-admin/firestore";
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
  if (text === "MOVE_IN" || text === "MOVE_OUT") return text;
  throw new HttpsError("invalid-argument", "inspectionType must be MOVE_IN or MOVE_OUT.");
}

async function requireCurrentTenant(auth: any) {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Please sign in before submitting a handover inspection.");
  }
  const tokenRole = stringOrEmpty(
    auth.token?.role || auth.token?.userRole || auth.token?.primaryRole,
  ).toLowerCase();
  if (tokenRole !== "tenant" || auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "Tenant access required.");
  }
  const account = await admin.auth().getUser(auth.uid);
  const claims = account.customClaims || {};
  const currentRole = stringOrEmpty(
    claims.role || claims.userRole || claims.primaryRole,
  ).toLowerCase();
  if (account.disabled || !account.emailVerified || claims.suspended === true || currentRole !== "tenant") {
    throw new HttpsError("permission-denied", "Current verified tenant authority is required.");
  }
  return {
    uid: auth.uid,
    email: normalizeEmail(account.email || auth.token?.email),
  };
}

function stringOrEmpty(value: unknown) {
  return String(value || "").trim();
}

export const submitTenantMoveInspection = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
  const actor = await requireCurrentTenant(request.auth);
  const uid = actor.uid;
  const email = actor.email;
  const payload = asObject(request.data || {}, "Inspection payload");
  const unitId = stringOrEmpty(payload.unitId);
  const propertyId = stringOrEmpty(payload.propertyId);

  if (!unitId || !propertyId) {
    throw new HttpsError("invalid-argument", "Linked unit and property are required.");
  }

  const [unitSnap, propertySnap] = await Promise.all([
    db.collection("units").doc(unitId).get(),
    db.collection("properties").doc(propertyId).get(),
  ]);
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
  if (!propertySnap.exists) {
    throw new HttpsError("not-found", "Linked property was not found.");
  }
  const property = propertySnap.data() || {};
  const canonicalOwnerId = stringOrEmpty(
    property.ownerUid || property.ownerId || unit.ownerUid || unit.ownerId,
  );
  const canonicalOwnerEmail = normalizeEmail(
    property.ownerEmail || unit.ownerEmail,
  );

  const inspectionType = normalizeInspectionType(payload.inspectionType || payload.type || payload.legacyType);
  const timestamp = FieldValue.serverTimestamp();
  const ownerReviewRef = db.collection("propertyInspections").doc();
  const legacyRef = db.collection("inspections").doc();

  const normalized = clean({
    ...payload,
    tenantId: uid,
    tenantUid: uid,
    tenantEmail: email,
    unitId,
    propertyId,
    ownerId: canonicalOwnerId,
    ownerUid: canonicalOwnerId,
    ownerEmail: canonicalOwnerEmail,
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

  await db.collection("audit_logs").add({
    actorId: uid,
    actorRole: "tenant",
    action: `TENANT_${inspectionType}_HANDOVER_SUBMITTED`,
    targetType: "propertyInspections",
    targetId: ownerReviewRef.id,
    metadata: { unitId, propertyId, legacyInspectionId: legacyRef.id },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    propertyInspectionId: ownerReviewRef.id,
    legacyInspectionId: legacyRef.id,
  };
});
