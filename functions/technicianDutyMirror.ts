import * as admin from "firebase-admin";

// Duty state is written by the duty callables to users/{uid}, but dispatch
// readiness (approvedAndReadyTechnician / technician operation readiness)
// evaluates {...users, ...technicians}, so any duty field left on the
// technicians profile (e.g. available:false / onDuty:false from provisioning)
// silently overrides the live duty state. These fields are always mirrored.
export const TECHNICIAN_DUTY_MIRROR_FIELDS = [
  "onDuty",
  "isAvailable",
  "available",
  "dutyStatus",
  "currentShiftId",
] as const;

type DutyRecord = Record<string, unknown>;

/** Mirror fields for the technicians profile, deleting any the users doc no longer carries. */
export function technicianDutyMirrorFromUser(user: DutyRecord): DutyRecord {
  const mirror: DutyRecord = {};
  for (const field of TECHNICIAN_DUTY_MIRROR_FIELDS) {
    const value = user[field];
    mirror[field] = value === undefined || value === null ? admin.firestore.FieldValue.delete() : value;
  }
  return mirror;
}

/** True when the technicians profile disagrees with the server-authoritative users duty state. */
export function technicianDutyMirrorStale(user: DutyRecord, technician: DutyRecord): boolean {
  return TECHNICIAN_DUTY_MIRROR_FIELDS.some((field) => (user[field] ?? null) !== (technician[field] ?? null));
}

/** The technicians profile as it reads once the users duty state is mirrored onto it. */
export function withTechnicianDutyMirror(technician: DutyRecord, user: DutyRecord): DutyRecord {
  const next: DutyRecord = { ...technician };
  for (const field of TECHNICIAN_DUTY_MIRROR_FIELDS) {
    const value = user[field];
    if (value === undefined || value === null) delete next[field];
    else next[field] = value;
  }
  return next;
}

/**
 * Adds a merge-write of the duty fields to technicians/{uid} when that
 * profile exists. Never creates a technicians profile.
 */
export async function mirrorTechnicianDutyState(
  batch: admin.firestore.WriteBatch,
  uid: string,
  fields: DutyRecord,
  technicianExists?: boolean,
): Promise<void> {
  const ref = admin.firestore().collection("technicians").doc(uid);
  const exists = technicianExists ?? (await ref.get()).exists;
  if (exists) batch.set(ref, fields, { merge: true });
}
