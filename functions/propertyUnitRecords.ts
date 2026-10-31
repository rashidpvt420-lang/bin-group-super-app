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

/** Largest declaration created atomically in a single transaction. */
export const MAX_AUTO_PROVISIONED_UNITS = 200;
/** Larger buildings are created in resumable, idempotent batches of this size. */
export const UNIT_PROVISION_BATCH_SIZE = 200;
/** Hard ceiling for batched provisioning; anything above needs a manual import. */
export const MAX_BATCHED_PROVISIONED_UNITS = 2000;
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
  status: "CREATED" | "PROVISIONING_FAILED" | "ALREADY_HAS_UNITS" | "NO_DECLARED_UNITS" | "TOO_MANY_DECLARED_UNITS" | "PROPERTY_NOT_FOUND" | "PROPERTY_NOT_ACTIVE" | "OWNER_BINDING_MISSING" | "UNIT_ID_COLLISION";
  propertyId: string;
  createdCount: number;
  declaredUnits: number | null;
  batches?: number;
};

/**
 * Creates units/{propertyId}_{n} for n = 1..declared when the property has no
 * units record at all. Never touches a property that already has any unit,
 * creates up to MAX_AUTO_PROVISIONED_UNITS atomically (larger buildings, up to
 * MAX_BATCHED_PROVISIONED_UNITS, go through resumable batches), and only for ACTIVE
 * properties.
 */
export async function provisionDeclaredUnitRecords(
  db: admin.firestore.Firestore,
  propertyId: string,
  actor: { actorId: string; actorRole: string; source: string },
): Promise<ProvisionResult> {
  const propertyRef = db.collection("properties").doc(propertyId);
  const preview = await propertyRef.get();
  const previewDeclared = declaredUnitCount(preview.data());
  const resuming = preview.data()?.unitRecordsProvisioning?.state === "IN_PROGRESS";
  if (preview.exists && (resuming || (previewDeclared !== null && previewDeclared > MAX_AUTO_PROVISIONED_UNITS && previewDeclared <= MAX_BATCHED_PROVISIONED_UNITS))) {
    return provisionDeclaredUnitRecordsBatched(db, propertyId, actor);
  }
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
    if (declared > MAX_AUTO_PROVISIONED_UNITS) {
      // Declaration changed between preview and transaction; never exceed one transaction here.
      return { ...base, status: declared > MAX_BATCHED_PROVISIONED_UNITS ? "TOO_MANY_DECLARED_UNITS" : "PROPERTY_NOT_ACTIVE", createdCount: 0 };
    }

    const { ownerId, ownerUid } = ownerBinding(property);
    if (!ownerId || !ownerUid) return { ...base, status: "OWNER_BINDING_MISSING", createdCount: 0 };
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
      transaction.create(db.collection("units").doc(unitId), unitRecord(propertyId, property, unitNumber, ownerId, ownerUid, actor, now));
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

const validOwnerBinding = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && value === value.trim() && !value.includes("/");
function ownerBinding(property: Data): { ownerId: string | null; ownerUid: string | null } {
  const ownerId = property.ownerId ?? property.ownerUid;
  const ownerUid = property.ownerUid ?? property.ownerId;
  return validOwnerBinding(ownerId) && validOwnerBinding(ownerUid) ? { ownerId, ownerUid } : { ownerId: null, ownerUid: null };
}

function unitRecord(propertyId: string, property: Data, unitNumber: string, ownerId: string, ownerUid: string, actor: { actorId: string; source: string }, now: FirebaseFirestore.FieldValue) {
  return {
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
  };
}

/**
 * Batched provisioning for buildings with more than MAX_AUTO_PROVISIONED_UNITS
 * (up to MAX_BATCHED_PROVISIONED_UNITS). A claim transaction marks the property
 * IN_PROGRESS (only if it has no units yet); each batch transaction re-reads the
 * claim and creates up to UNIT_PROVISION_BATCH_SIZE units, skipping units it
 * already created (resume after crash/retry) and stopping on any foreign
 * collision. A final transaction marks COMPLETE and writes exactly one audit log.
 */
async function provisionDeclaredUnitRecordsBatched(
  db: admin.firestore.Firestore,
  propertyId: string,
  actor: { actorId: string; actorRole: string; source: string },
): Promise<ProvisionResult> {
  const propertyRef = db.collection("properties").doc(propertyId);
  const claim = await db.runTransaction(async (transaction): Promise<ProvisionResult | { declared: number }> => {
    const [propertySnap, existingUnits] = await Promise.all([
      transaction.get(propertyRef),
      transaction.get(db.collection("units").where("propertyId", "==", propertyId).limit(1)),
    ]);
    if (!propertySnap.exists) return { status: "PROPERTY_NOT_FOUND", propertyId, createdCount: 0, declaredUnits: null };
    const property = propertySnap.data() || {};
    const declared = declaredUnitCount(property);
    const base = { propertyId, declaredUnits: declared };
    if (!isActiveProperty(property)) return { ...base, status: "PROPERTY_NOT_ACTIVE", createdCount: 0 };
    const state = property.unitRecordsProvisioning?.state;
    if (state === "IN_PROGRESS") {
      if (property.unitRecordsProvisioning.declared !== declared) return { ...base, status: "PROVISIONING_FAILED", createdCount: 0 };
      return { declared: declared as number };
    }
    if (!existingUnits.empty) return { ...base, status: "ALREADY_HAS_UNITS", createdCount: 0 };
    if (!declared) return { ...base, status: "NO_DECLARED_UNITS", createdCount: 0 };
    if (declared > MAX_BATCHED_PROVISIONED_UNITS) return { ...base, status: "TOO_MANY_DECLARED_UNITS", createdCount: 0 };
    const { ownerId } = ownerBinding(property);
    if (!ownerId) return { ...base, status: "OWNER_BINDING_MISSING", createdCount: 0 };
    const unitIds = Array.from({ length: declared }, (_, index) => provisionedUnitId(propertyId, String(index + 1)));
    if (new Set(unitIds).size !== declared || unitIds.some((id) => !id)) return { ...base, status: "UNIT_ID_COLLISION", createdCount: 0 };
    transaction.set(propertyRef, {
      unitRecordsProvisioning: { state: "IN_PROGRESS", declared, nextIndex: 1, source: actor.source, startedAt: FieldValue.serverTimestamp() },
    }, { merge: true });
    return { declared };
  });
  if ("status" in claim) return claim;
  const declared = claim.declared;
  let batches = 0;
  for (;;) {
    const step = await db.runTransaction(async (transaction): Promise<"DONE" | "MORE" | "COLLISION" | "ABORT"> => {
      const propertySnap = await transaction.get(propertyRef);
      const property = propertySnap.data() || {};
      const progress = property.unitRecordsProvisioning || {};
      if (progress.state !== "IN_PROGRESS" || progress.declared !== declared || !isActiveProperty(property)) return "ABORT";
      const { ownerId, ownerUid } = ownerBinding(property);
      if (!ownerId || !ownerUid) return "ABORT";
      const start = Number(progress.nextIndex) || 1;
      if (start > declared) return "DONE";
      const end = Math.min(declared, start + UNIT_PROVISION_BATCH_SIZE - 1);
      const numbers = Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
      const refs = numbers.map((n) => db.collection("units").doc(provisionedUnitId(propertyId, n)));
      const snaps = await transaction.getAll(...refs);
      const foreign = snaps.some((snap) => snap.exists && snap.data()?.propertyId !== propertyId);
      if (foreign) {
        transaction.set(propertyRef, { unitRecordsProvisioning: { state: "FAILED_COLLISION", failedAtIndex: start } }, { merge: true });
        return "COLLISION";
      }
      const now = FieldValue.serverTimestamp();
      snaps.forEach((snap, i) => {
        if (!snap.exists) transaction.create(refs[i], unitRecord(propertyId, property, numbers[i], ownerId, ownerUid, actor, now));
      });
      transaction.set(propertyRef, { unitRecordsProvisioning: { nextIndex: end + 1 } }, { merge: true });
      return end >= declared ? "DONE" : "MORE";
    });
    if (step === "COLLISION") return { propertyId, declaredUnits: declared, status: "UNIT_ID_COLLISION", createdCount: 0, batches };
    if (step === "ABORT") return { propertyId, declaredUnits: declared, status: "PROVISIONING_FAILED", createdCount: 0, batches };
    batches += 1;
    if (step === "DONE") break;
  }
  return db.runTransaction(async (transaction): Promise<ProvisionResult> => {
    const propertySnap = await transaction.get(propertyRef);
    const progress = propertySnap.data()?.unitRecordsProvisioning || {};
    const base = { propertyId, declaredUnits: declared, batches };
    if (progress.state === "COMPLETE") return { ...base, status: "ALREADY_HAS_UNITS", createdCount: 0 };
    if (progress.state !== "IN_PROGRESS") return { ...base, status: "PROVISIONING_FAILED", createdCount: 0 };
    const now = FieldValue.serverTimestamp();
    transaction.set(propertyRef, {
      unitRecordsProvisioning: { state: "COMPLETE", completedAt: now },
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
      metadata: {
        declaredUnits: declared,
        unitIds: Array.from({ length: declared }, (_, index) => provisionedUnitId(propertyId, String(index + 1))),
        source: actor.source,
        batched: true,
        batchSize: UNIT_PROVISION_BATCH_SIZE,
      },
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
