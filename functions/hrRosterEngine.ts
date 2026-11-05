/**
 * HR roster engine (pure, no Firestore). A roster is a weekly pattern of shifts in Asia/Dubai time.
 * Used by the HR roster callable, getMyRoster and the shift reminder / missed clock-out scheduler.
 */
export const ROSTER_SOURCE = "HR_ROSTER_V1";
export const START_REMINDER_LEAD_MINUTES = 30;
export const MISSED_CLOCK_OUT_GRACE_MINUTES = 60;
/** Fallback when no roster exists: a shift still open this long after clock-in is flagged. */
export const UNROSTERED_OPEN_SHIFT_LIMIT_MINUTES = 12 * 60;
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000; // UAE has no DST.

export type RosterDay = { start: string; end: string } | null;
export type WeeklyRoster = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", RosterDay>;
export type RosterResult = { ok: true; weekly: WeeklyRoster } | { ok: false; error: string };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export function minutesOf(hhmm: string) {
    const m = HHMM.exec(hhmm);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Validates a weekly pattern; keys are 0=Sunday..6=Saturday. Overnight shifts (end <= start) roll into the next day. */
export function validateWeeklyRoster(input: unknown): RosterResult {
    if (!input || typeof input !== "object") return { ok: false, error: "weekly roster object required" };
    const src = input as Record<string, unknown>;
    const weekly = {} as WeeklyRoster;
    let workDays = 0;
    for (const key of ["0", "1", "2", "3", "4", "5", "6"] as const) {
        const day = src[key];
        if (day === null || day === undefined || day === false) { weekly[key] = null; continue; }
        const d = day as Record<string, unknown>;
        const start = String(d.start || ""), end = String(d.end || "");
        const s = minutesOf(start), e = minutesOf(end);
        if (s === null || e === null) return { ok: false, error: `day ${key}: start/end must be HH:MM` };
        const length = e > s ? e - s : e + 1440 - s;
        if (length < 60 || length > 14 * 60) return { ok: false, error: `day ${key}: shift must be 1-14 hours` };
        weekly[key] = { start, end };
        workDays += 1;
    }
    if (workDays > 6) return { ok: false, error: "at least one rest day per week is required" };
    return { ok: true, weekly };
}

export function dubaiParts(ms: number) {
    const d = new Date(ms + DUBAI_OFFSET_MS);
    return { date: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** UTC ms of a Dubai wall-clock minute on a given YYYY-MM-DD. */
export function dubaiMs(date: string, minute: number) {
    return Date.parse(`${date}T00:00:00Z`) - DUBAI_OFFSET_MS + minute * 60000;
}

export function shiftWindow(weekly: WeeklyRoster, date: string) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const day = weekly[String(weekday) as keyof WeeklyRoster];
    if (!day) return null;
    const s = minutesOf(day.start)!, e = minutesOf(day.end)!;
    const startMs = dubaiMs(date, s);
    const endMs = dubaiMs(date, e > s ? e : e + 1440);
    return { date, start: day.start, end: day.end, startMs, endMs };
}

/** Start reminder is due from 30 min before shift start until start, if not clocked in. */
export function startReminderDue(weekly: WeeklyRoster, nowMs: number, clockedIn: boolean) {
    if (clockedIn) return null;
    const w = shiftWindow(weekly, dubaiParts(nowMs).date);
    if (!w) return null;
    return nowMs >= w.startMs - START_REMINDER_LEAD_MINUTES * 60000 && nowMs <= w.startMs ? w : null;
}

/** Missed clock-out: shift clocked in, not clocked out, and past rostered end + 60 min (or 12h after clock-in when unrostered). */
export function missedClockOutDue(args: { weekly: WeeklyRoster | null; shiftDate: string; clockInMs: number | null; clockOutMs: number | null; nowMs: number }) {
    const { weekly, shiftDate, clockInMs, clockOutMs, nowMs } = args;
    if (clockInMs === null || clockOutMs !== null) return false;
    const w = weekly ? shiftWindow(weekly, shiftDate) : null;
    const deadline = w ? w.endMs + MISSED_CLOCK_OUT_GRACE_MINUTES * 60000 : clockInMs + UNROSTERED_OPEN_SHIFT_LIMIT_MINUTES * 60000;
    return nowMs > deadline;
}
