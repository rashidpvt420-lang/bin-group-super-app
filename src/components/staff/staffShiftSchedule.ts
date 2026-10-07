/**
 * Pure helpers for the Staff TODAY shift header.
 *
 * Two sources are involved and they are intentionally different:
 *  - staff_shifts/SHIFT_<uid>_<yyyy-mm-dd> (server-written by
 *    submitStaffQuickAction CLOCK_IN) is the live duty state. It only exists
 *    after Clock In and carries staffId/status/clockInTime/shiftDate — no
 *    schedule text.
 *  - hrProfiles/{uid} (written by adminCreateUser / adminUpdateStaffProfile)
 *    holds HR's scheduled shift: shiftName, workingHours, offDay. The staff
 *    member may read their own hrProfiles doc.
 */

export const NO_SHIFT_SCHEDULE_LABEL = "No shift schedule recorded";

export interface HrShiftSchedule {
  shiftName?: unknown;
  workingHours?: unknown;
  offDay?: unknown;
}

export interface ShiftDocLike {
  shiftTime?: unknown;
  scheduledLabel?: unknown;
}

const clean = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export function staffShiftDocId(uid: string, dubaiDateKey: string): string {
  return `SHIFT_${uid}_${dubaiDateKey}`;
}

/** "Day Shift, 8 AM - 4 PM · Off day Friday" from the HR profile, or "" when HR recorded nothing. */
export function formatHrShiftSchedule(hr: HrShiftSchedule | null | undefined): string {
  if (!hr) return "";
  const name = clean(hr.shiftName);
  const hours = clean(hr.workingHours);
  const offDay = clean(hr.offDay);
  const main = [name, hours].filter(Boolean).join(", ");
  if (!main && !offDay) return "";
  return offDay ? `${main || "Scheduled"} · Off day ${offDay}` : main;
}

/** Live shift doc labels win; otherwise fall back to HR's scheduled shift. */
export function resolveShiftLabel(activeShift: ShiftDocLike | null | undefined, hr: HrShiftSchedule | null | undefined): string {
  return clean(activeShift?.shiftTime) || clean(activeShift?.scheduledLabel) || formatHrShiftSchedule(hr) || NO_SHIFT_SCHEDULE_LABEL;
}

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code.replace(/^(firestore|functions)\//, "") : "";
}

/**
 * Message for a failed shift listener. A Firestore listener that errors is
 * terminated by the SDK, so the dashboard must say its duty state is stale
 * instead of silently showing OFF DUTY.
 */
export function shiftSyncErrorMessage(error: unknown): string {
  const code = errorCode(error);
  if (code === "permission-denied") {
    return "Shift sync failed: today's shift record could not be read (permission denied). Duty status below may be out of date — reopen the dashboard after Clock In. Diagnostic: STAFF_SHIFTS_PERMISSION_DENIED";
  }
  const message = (error as { message?: unknown } | null)?.message;
  return `Shift sync failed: ${typeof message === "string" && message ? message : "unknown error"}`;
}

/**
 * CLOCK_IN outcomes that mean the server now has (or already had) today's
 * shift doc, so the listener must be re-attached to pick it up.
 */
export function shouldResubscribeShiftAfterQuickAction(actionType: string, error?: unknown): boolean {
  if (actionType !== "CLOCK_IN") return false;
  if (error === undefined) return true;
  return errorCode(error) === "already-exists";
}
