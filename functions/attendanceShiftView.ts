/**
 * Admin attendance is a status sheet. Payable hours stay on staff_shifts.
 * This view joins the two so a home duty clock is visible to Admin even when
 * the status row was saved before the clock, or was never saved at all.
 * It does not invent a clock time.
 */

export type AttendanceStatusRow = {
  id?: unknown;
  uid?: unknown;
  workDate?: unknown;
  status?: unknown;
  note?: unknown;
  shiftClockIn?: unknown;
  shiftClockOut?: unknown;
};

export type PayableShiftRow = {
  id: string;
  data: Record<string, unknown>;
};

export type OfficialAttendanceRow = {
  id: string;
  uid: string | null;
  workDate: string | null;
  status: string | null;
  note: string | null;
  hoursSource: "staff_shifts";
  shiftClockRecorded: boolean;
};

const clean = (value: unknown) => String(value ?? "").trim();

export function shiftDocId(uid: string, workDate: string): string {
  return `SHIFT_${uid}_${workDate}`;
}

function snapshotClock(row: AttendanceStatusRow): boolean {
  return Boolean(row.shiftClockIn && row.shiftClockOut);
}

function clockOnFile(shift: Record<string, unknown> | undefined, fallback: boolean): boolean {
  if (shift) return Boolean(shift.clockInTime);
  return fallback;
}

/**
 * Status rows keep their admin status. The clock flag comes from the live
 * staff_shifts doc when that doc was loaded. Shift days with a real clock-in
 * and no status row are added so Admin sees the same clock Technician HR reads.
 */
export function mergeOfficialAttendance(
  statusRows: AttendanceStatusRow[],
  shifts: PayableShiftRow[],
  checkedShiftIds: ReadonlySet<string> | null = null,
): OfficialAttendanceRow[] {
  const byId = new Map(shifts.map((shift) => [shift.id, shift.data]));
  const seen = new Set<string>();
  const rows: OfficialAttendanceRow[] = [];

  for (const entry of statusRows) {
    const uid = clean(entry.uid);
    const workDate = clean(entry.workDate);
    const id = uid && /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? shiftDocId(uid, workDate) : "";
    const shift = id ? byId.get(id) : undefined;
    const checked = Boolean(id && checkedShiftIds?.has(id));
    if (id) seen.add(id);
    rows.push({
      id: clean(entry.id) || id || uid,
      uid: uid || null,
      workDate: workDate || null,
      status: clean(entry.status) || null,
      note: clean(entry.note) || null,
      hoursSource: "staff_shifts",
      shiftClockRecorded: clockOnFile(shift, checked ? false : snapshotClock(entry)),
    });
  }

  for (const shift of shifts) {
    if (seen.has(shift.id)) continue;
    const uid = clean(shift.data.staffId);
    const workDate = clean(shift.data.shiftDate);
    if (!uid || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !shift.data.clockInTime) continue;
    rows.push({
      id: shift.id,
      uid,
      workDate,
      status: clean(shift.data.status) || "ON_DUTY",
      note: null,
      hoursSource: "staff_shifts",
      shiftClockRecorded: true,
    });
  }

  rows.sort((left, right) => clean(right.workDate).localeCompare(clean(left.workDate)));
  return rows;
}
