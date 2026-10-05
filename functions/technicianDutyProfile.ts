/**
 * Technician duty/availability authority.
 *
 * The duty callables (startTechnicianDuty, takeTechnicianBreak, resumeTechnicianDuty,
 * endTechnicianDuty) write the duty state to users/{uid}. The technicians/{uid} profile only
 * receives these fields from provisioning (available:false, onDuty:false) and from
 * adminSetStaffStatus, so it can be stale. Readiness used to merge the two records as
 * { ...users, ...technicians }, which let a stale technicians/{uid}.available === false
 * override a live users/{uid} ON_DUTY state, and every readiness check then failed with
 * "dispatch availability" (availability GPS, admin assignment, accept and lifecycle).
 *
 * Rule: for duty/availability fields the users/{uid} record wins whenever it carries the
 * field; technicians/{uid} is only a fallback. Every other field keeps the existing
 * technicians-over-users precedence (credentials, approval, device binding, GPS, capacity).
 */
export const TECHNICIAN_DUTY_FIELDS = [
  "onDuty",
  "isAvailable",
  "available",
  "dutyStatus",
  "shiftStatus",
  "currentShiftStatus",
  "currentShiftId",
  "activeShiftId",
] as const;

type ProfileRecord = Record<string, any>;

const present = (value: unknown) => value !== undefined;

export function mergeTechnicianProfiles(
  user: ProfileRecord | null | undefined,
  technician: ProfileRecord | null | undefined,
): ProfileRecord {
  const userRecord = user || {};
  const technicianRecord = technician || {};
  const merged: ProfileRecord = { ...userRecord, ...technicianRecord };
  for (const field of TECHNICIAN_DUTY_FIELDS) {
    if (present(userRecord[field])) merged[field] = userRecord[field];
  }
  return merged;
}

/**
 * Picks the duty/availability fields out of a users/{uid} duty update so the same state can be
 * mirrored to technicians/{uid}. Firestore sentinels (serverTimestamp, delete) pass through.
 */
export function technicianDutyMirror(update: ProfileRecord, extraFields: string[] = []): ProfileRecord {
  const mirror: ProfileRecord = {};
  for (const field of [...TECHNICIAN_DUTY_FIELDS, ...extraFields, "updatedAt"]) {
    if (present(update[field])) mirror[field] = update[field];
  }
  return mirror;
}
