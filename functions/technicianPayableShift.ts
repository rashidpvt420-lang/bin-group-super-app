/**
 * Payable attendance is staff_shifts/SHIFT_<uid>_<yyyy-mm-dd> (clockInTime / clockOutTime).
 * Home duty also keeps technician_shifts for dispatch breaks and the current shift id.
 * This helper decides the staff_shifts patch. It never reopens a completed day and never
 * invents a clock-in time that was not recorded.
 *
 * Shifts that were opened before the payable clock shipped can be copied onto staff_shifts
 * only when technician_shifts already stored a real clockIn. If that timestamp is missing,
 * nothing is written and no hours are invented. A COMPLETED day is never reopened.
 */
export const SECOND_SAME_DAY_CLOCK_IN_MESSAGE =
  "Today's paid shift is already closed. Starting duty again today is not a new paid clock-in. Ask HR if the closed day must be corrected. No hours were added.";
export type PayableShiftAction = "CLOCK_IN" | "BREAK" | "RESUME" | "CLOCK_OUT";

export type PayableShiftDecision = {
  write: boolean;
  reason: string;
  fields: Record<string, unknown>;
  setClockIn: boolean;
  setClockOut: boolean;
};

const upper = (value: unknown) => String(value ?? "").trim().toUpperCase();

export function dubaiPayrollDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Unable to resolve company-local date.");
  return `${year}-${month}-${day}`;
}

export function payableShiftDocId(uid: string, date = new Date()): string {
  return `SHIFT_${uid}_${dubaiPayrollDateKey(date)}`;
}

const none = (reason: string): PayableShiftDecision => ({
  write: false,
  reason,
  fields: {},
  setClockIn: false,
  setClockOut: false,
});

export function payableShiftPatch(existing: Record<string, unknown> | null | undefined, action: PayableShiftAction): PayableShiftDecision {
  const status = upper(existing?.status);
  const open = status === "ACTIVE" || status === "ON_BREAK";
  const hasClockIn = Boolean(existing?.clockInTime);

  if (action === "CLOCK_IN") {
    if (status === "COMPLETED") return none("already_completed");
    if (open && hasClockIn) {
      return { write: true, reason: "already_open", fields: { status: "ACTIVE" }, setClockIn: false, setClockOut: false };
    }
    return { write: true, reason: "clocked_in", fields: { status: "ACTIVE" }, setClockIn: true, setClockOut: false };
  }

  if (action === "BREAK") {
    if (!open) return none("no_open_shift");
    return { write: true, reason: "on_break", fields: { status: "ON_BREAK" }, setClockIn: false, setClockOut: false };
  }

  if (action === "RESUME") {
    if (!open) return none("no_open_shift");
    return { write: true, reason: "resumed", fields: { status: "ACTIVE" }, setClockIn: false, setClockOut: false };
  }

  if (!open) return none("no_open_shift");
  return { write: true, reason: "clocked_out", fields: { status: "COMPLETED" }, setClockIn: false, setClockOut: true };
}

/**
 * Copy an already recorded clock-in onto today's payable shift.
 * Returns write:false when the day is closed or no real clock-in exists.
 */
export function legacyOpenShiftBackfill(existing: Record<string, unknown> | null | undefined, recordedClockIn: unknown): {
  write: boolean;
  reason: string;
  clockInTime?: unknown;
} {
  const status = upper(existing?.status);
  if (status === "COMPLETED") return { write: false, reason: "already_completed" };
  if (existing?.clockInTime) return { write: false, reason: "clock_already_recorded" };
  if (!recordedClockIn) return { write: false, reason: "no_recorded_clock_in" };
  return { write: true, reason: "copied_recorded_clock_in", clockInTime: recordedClockIn };
}

export function timestampToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "object") {
    const stamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof stamp.toDate === "function") {
      const date = stamp.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
    }
    const seconds = stamp.seconds ?? stamp._seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      const date = new Date(seconds * 1000);
      return Number.isFinite(date.getTime()) ? date : null;
    }
  }
  return null;
}

/** A technician_shifts clock-in counts only on the payable day it actually happened. */
export function sameDayRecordedClock(recordedClockIn: unknown, payableDateKey: string): unknown | null {
  const date = timestampToDate(recordedClockIn);
  if (!date || !payableDateKey) return null;
  return dubaiPayrollDateKey(date) === payableDateKey ? recordedClockIn : null;
}

export type PayableDutyWrite = PayableShiftDecision & { recordedClockIn?: unknown };

/**
 * Home duty and the advanced Clock In share this decision.
 * A same-day clock already stored on technician_shifts is copied onto staff_shifts.
 * A clock from another day is ignored, and a completed payable day is not reopened.
 */
export function payableDutyWrite(
  existing: Record<string, unknown> | null | undefined,
  action: PayableShiftAction,
  recordedClockIn: unknown,
  payableDateKey: string,
): PayableDutyWrite {
  const decision = payableShiftPatch(existing, action);
  if (decision.setClockIn) {
    const recorded = sameDayRecordedClock(recordedClockIn, payableDateKey);
    if (recorded) {
      return { ...decision, setClockIn: false, reason: "clocked_in_from_recorded_shift", recordedClockIn: recorded };
    }
  }
  if (!decision.write && action === "CLOCK_OUT") {
    const recorded = sameDayRecordedClock(recordedClockIn, payableDateKey);
    const backfill = legacyOpenShiftBackfill(existing, recorded);
    if (backfill.write) {
      return {
        write: true,
        reason: "clocked_out_from_recorded_shift",
        fields: { status: "COMPLETED" },
        setClockIn: false,
        setClockOut: true,
        recordedClockIn: backfill.clockInTime,
      };
    }
  }
  return decision;
}

/**
 * P1-3: break ledger on the payable staff_shifts day. Breaks are unpaid, so the
 * hours engine subtracts totalBreakMinutes before the overtime split.
 * Pure: returns the fields to merge for this action.
 */
export function payableBreakPatch(
  existing: Record<string, unknown> | null | undefined,
  action: PayableShiftAction,
  nowMs: number,
): Record<string, unknown> {
  const status = String(existing?.status || "").toUpperCase();
  const openStart = timestampToDate(existing?.breakStartedAt);
  const priorTotal = Number(existing?.totalBreakMinutes) || 0;
  const priorBreaks = Array.isArray(existing?.breaks) ? (existing?.breaks as unknown[]) : [];
  const closeOpenBreak = () => {
    if (!openStart) return {};
    const minutes = Math.max(0, Math.round((nowMs - openStart.getTime()) / 60_000));
    return {
      breakStartedAt: null,
      totalBreakMinutes: priorTotal + minutes,
      breaks: [...priorBreaks, { start: openStart.toISOString(), end: new Date(nowMs).toISOString(), minutes }].slice(-50),
    };
  };
  if (action === "BREAK") {
    if (status === "ON_BREAK" && openStart) return {};
    return { breakStartedAt: new Date(nowMs) };
  }
  if (action === "RESUME" || action === "CLOCK_OUT") return closeOpenBreak();
  return {};
}

/** Unpaid break minutes recorded on a staff_shifts document. */
export function recordedBreakMinutes(shift: Record<string, unknown> | null | undefined): number {
  const total = Number(shift?.totalBreakMinutes);
  return Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
}
