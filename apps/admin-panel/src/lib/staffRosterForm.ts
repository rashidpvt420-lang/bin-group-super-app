// P1-9 (audit 9 Nov 2026): weekly roster form helpers for the Admin HR roster editor.
// Keys follow the server roster engine: 0 = Sunday … 6 = Saturday, times HH:MM in Dubai time (GST).

export type RosterDayForm = { off: boolean; start: string; end: string };
export type RosterForm = Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', RosterDayForm>;
export type WeeklyRosterPayload = Record<string, { start: string; end: string } | null>;

export const ROSTER_DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const;
export const ROSTER_DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Default pattern: 08:00–17:00 with a 1 h unpaid break = 8 working hours, matching the 8 h overtime baseline. Sunday off. */
export const DEFAULT_SHIFT_START = '08:00';
export const DEFAULT_SHIFT_END = '17:00';
export const DEFAULT_REST_DAY = '0';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function defaultRosterForm(): RosterForm {
  const form = {} as RosterForm;
  for (const key of ROSTER_DAY_KEYS) form[key] = { off: key === DEFAULT_REST_DAY, start: DEFAULT_SHIFT_START, end: DEFAULT_SHIFT_END };
  return form;
}

export function rosterFormFromWeekly(weekly: WeeklyRosterPayload | null | undefined): RosterForm {
  if (!weekly) return defaultRosterForm();
  const form = {} as RosterForm;
  for (const key of ROSTER_DAY_KEYS) {
    const day = weekly[key];
    form[key] = day ? { off: false, start: day.start, end: day.end } : { off: true, start: DEFAULT_SHIFT_START, end: DEFAULT_SHIFT_END };
  }
  return form;
}

export function shiftLengthMinutes(start: string, end: string): number | null {
  const s = HHMM.exec(start);
  const e = HHMM.exec(end);
  if (!s || !e) return null;
  const startMin = Number(s[1]) * 60 + Number(s[2]);
  const endMin = Number(e[1]) * 60 + Number(e[2]);
  return endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
}

/** Mirrors validateWeeklyRoster on the server so HR sees the problem before saving. */
export function rosterPayloadFromForm(form: RosterForm): { ok: true; weekly: WeeklyRosterPayload } | { ok: false; error: string } {
  const weekly: WeeklyRosterPayload = {};
  let workDays = 0;
  for (const [index, key] of ROSTER_DAY_KEYS.entries()) {
    const day = form[key];
    if (day.off) { weekly[key] = null; continue; }
    const length = shiftLengthMinutes(day.start, day.end);
    if (length === null) return { ok: false, error: `${ROSTER_DAY_LABELS[index]}: start and end must be HH:MM.` };
    if (length < 60 || length > 14 * 60) return { ok: false, error: `${ROSTER_DAY_LABELS[index]}: a shift must be 1 to 14 hours.` };
    weekly[key] = { start: day.start, end: day.end };
    workDays += 1;
  }
  if (workDays > 6) return { ok: false, error: 'Give at least one rest day a week.' };
  return { ok: true, weekly };
}
