import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { requirePrivilegedMfaSession } from "./adminMfaSession";

// Property onboarding (submitOwnerInspectionFirstOnboarding and the other
// owner/admin intake paths) stores only a declared unit count on the property
// (units / numberOfUnits / unitCount / totalUnits). Nothing created the
// matching units/{unitId} records: they existed only if the owner later ran
// the Units page "Generate Units" wizard (ownerGenerateUnits). Activated
// properties therefore had units > 0 but no unit records, so complaints could
// not name a unit, tenants could not be linked, and manual dispatch rejected
// the ticket. This module provisions the declared units, idempotently, when a
// property becomes ACTIVE, and gives admins an audited backfill for
// properties that were activated before this existed.

if (!admin.apps.length) admin.initializeApp();

type Data = FirebaseFirestore.DocumentData;
const text = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);
const upper = (value: unknown) => text(value, 80).toUpperCase();

export const MAX_AUTO_PROVISIONED_UNITS = 200;
const ADMIN_ROLES = new Set(["admin", "super_admin", "operations_admin", "operations_manager"]);

export function declaredUnitCount(property: Data | undefined | null): number | null {
  if (!property) return null;
  for (const value of [property.units, property.numberOfUnits, property.unitCount, property.totalUnits]) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if ((typeof value === "number" || typeof value === "string") && Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
    return null; // A malformed primary declaration must not fall through to an alias.
  }
  return null;
}

export function isActiveProperty(property: Data | undefined | null): boolean {
  if (!property) return false;
  const states = [upper(property.status), upper(property.activationStatus)].filter(Boolean);
  return states.includes("ACTIVE") && states.every((state) => state === "ACTIVE");
}

/** Same id convention as ownerGenerateUnits, so the wizard skips provisioned units. */
export function provisionedUnitId(propertyId: string, unitNumber: string): string {
  return `${propertyId}_${unitNumber}`
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

export type ProvisionResult = {
  status: "CREATED" | "ALREADY_HAS_UNITS" | "NO_DECLARED_UNITS" | "TOO_MANY_DECLARED_UNITS" | "PROPERTY_NOT_FOUND" | "PROPERTY_NOT_ACTIVE" | "OWNER_BINDING_MISSING" | "UNIT_ID_COLLISION";
  propertyId: string;
  createdCount: number;
  declaredUnits: number | null;
};

/**
 * Creates units/{propertyId}_{n} for n = 1..declared when the property has no
 * units record at all. Never touches a property that already has any unit,
 * never creates more than MAX_AUTO_PROVISIONED_UNITS, and only for ACTIVE
 * properties.
 */
export async function provisionDeclaredUnitRecords(
  db: admin.firestore.Firestore,
  propertyId: string,
  actor: { actorId: string; actorRole: string; source: string },
): Promise<ProvisionResult> {
  const propertyRef = db.collection("properties").doc(propertyId);
  return db.runTransaction(async (transaction) => {
    const [propertySnap, existingUnits] = await Promise.all([
      transaction.get(propertyRef),
      transaction.get(db.collection("units").where("propertyId", "==", propertyId).limit(1)),
    ]);
    if (!propertySnap.exists) return { status: "PROPERTY_NOT_FOUND", propertyId, createdCount: 0, declaredUnits: null };
    const property = propertySnap.data() || {};
    const declared = declaredUnitCount(property);
    const base = { propertyId, declaredUnits: declared };
    if (!isActiveProperty(property)) return { ...base, status: "PROPERTY_NOT_ACTIVE", createdCount: 0 };
    if (!existingUnits.empty) return { ...base, status: "ALREADY_HAS_UNITS", createdCount: 0 };
    if (!declared) return { ...base, status: "NO_DECLARED_UNITS", createdCount: 0 };
    if (declared > MAX_AUTO_PROVISIONED_UNITS) return { ...base, status: "TOO_MANY_DECLARED_UNITS", createdCount: 0 };

    const ownerId = property.ownerId ?? property.ownerUid;
    const ownerUid = property.ownerUid ?? property.ownerId;
    const validOwnerBinding = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && value === value.trim() && !value.includes("/");
    if (!validOwnerBinding(ownerId) || !validOwnerBinding(ownerUid)) return { ...base, status: "OWNER_BINDING_MISSING", createdCount: 0 };
    const unitIds = Array.from({ length: declared }, (_, index) => provisionedUnitId(propertyId, String(index + 1)));
    if (new Set(unitIds).size !== declared || unitIds.some((id) => !id)) {
      return { ...base, status: "UNIT_ID_COLLISION", createdCount: 0 };
    }
    // Sanitised legacy IDs can collide across properties. Never overwrite or
    // silently adopt somebody else's unit; all reads precede any writes.
    const candidates = await transaction.getAll(...unitIds.map((id) => db.collection("units").doc(id)));
    if (candidates.some((snapshot) => snapshot.exists)) return { ...base, status: "UNIT_ID_COLLISION", createdCount: 0 };
    const now = FieldValue.serverTimestamp();
    for (let index = 1; index <= declared; index += 1) {
      const unitNumber = String(index);
      const unitId = provisionedUnitId(propertyId, unitNumber);
      transaction.create(db.collection("units").doc(unitId), {
        propertyId,
        propertyName: text(property.propertyName || property.name || property.address || propertyId),
        unitNumber,
        floor: null,
        floorNumber: null,
        ownerId,
        ownerUid,
        ownerEmail: text(property.ownerEmail, 320).toLowerCase() || null,
        propertyType: text(property.propertyType, 80) || null,
        occupancyStatus: "vacant",
        status: "VACANT",
        tenantStatus: "none",
        maintenanceStatus: "normal",
        source: actor.source,
        createdBy: actor.actorId,
        createdAt: now,
        updatedAt: now,
      });
    }
    transaction.set(propertyRef, {
      unitRecordsProvisionedAt: now,
      unitRecordsProvisionedCount: declared,
      unitRecordsProvisionedSource: actor.source,
    }, { merge: true });
    transaction.create(db.collection("audit_logs").doc(), {
      action: "PROPERTY_DECLARED_UNITS_PROVISIONED",
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      targetType: "properties",
      targetId: propertyId,
      metadata: { declaredUnits: declared, unitIds, source: actor.source },
      createdAt: now,
    });
    return { ...base, status: "CREATED", createdCount: declared };
  });
}

/** Provision declared units the moment a property becomes ACTIVE. */
export const provisionDeclaredUnitsOnPropertyActivation = onDocumentWritten(
  { document: "properties/{propertyId}", region: "europe-west3", retry: true },
  async (event) => {
    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;
    if (!after || !isActiveProperty(after) || isActiveProperty(before)) return null;
    return provisionDeclaredUnitRecords(admin.firestore(), event.params.propertyId, {
      actorId: "SYSTEM_PROPERTY_ACTIVATION",
      actorRole: "system",
      source: "PROPERTY_ACTIVATION_DECLARED_UNITS",
    });
  },
);

function requireUnitAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  if (token.suspended === true) throw new HttpsError("permission-denied", "Suspended admin account.");
  const callerRole = text(token.role || token.userRole || token.primaryRole, 60).toLowerCase();
  if (token.admin === true || token.isAdmin === true || token.superAdmin === true || ADMIN_ROLES.has(callerRole)) return;
  throw new HttpsError("permission-denied", "Admin access is required.");
}

/** Audited backfill for ACTIVE properties that were activated with a unit count but no unit records. */
export const adminProvisionDeclaredPropertyUnits = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    requireUnitAdmin(request.auth);
    await requirePrivilegedMfaSession(request.auth);
    const propertyId = typeof request.data?.propertyId === "string" ? request.data.propertyId.trim() : "";
    if (!propertyId || propertyId.length > 160 || propertyId.includes("/") || [".", ".."].includes(propertyId)) throw new HttpsError("invalid-argument", "propertyId is required.");
    const result = await provisionDeclaredUnitRecords(admin.firestore(), propertyId, {
      actorId: request.auth!.uid,
      actorRole: text(request.auth!.token?.role || "admin", 60).toLowerCase(),
      source: "ADMIN_DECLARED_UNITS_BACKFILL",
    });
    if (result.status === "PROPERTY_NOT_FOUND") throw new HttpsError("not-found", "Property not found.");
    if (result.status === "PROPERTY_NOT_ACTIVE") throw new HttpsError("failed-precondition", "Only ACTIVE properties can have declared units provisioned.");
    return result;
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";
