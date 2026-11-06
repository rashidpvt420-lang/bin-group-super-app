/**
 * Payable attendance is staff_shifts/SHIFT_<uid>_<yyyy-mm-dd> (clockInTime / clockOutTime).
 * Home duty also keeps technician_shifts for dispatch breaks and the current shift id.
 * This helper decides the staff_shifts patch. It never reopens a completed day and never
 * invents a clock-in time that was not recorded.
 */
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
