/**
 * UAE leave engine (Federal Decree-Law No. 33 of 2021, Arts. 29 and 31). Pure functions.
 *
 * Annual leave: 2 days per completed month during the first year of service,
 * then 30 days per year (accrued at 2.5 days per completed month).
 * Sick leave: per service year, first 15 days full pay, next 30 days half pay,
 * next 45 days unpaid (90 days maximum).
 */
export const LEAVE_CONFIG = Object.freeze({
  firstYearDaysPerMonth: 2,
  annualDaysPerYearAfterFirst: 30,
  sickFullPayDays: 15,
  sickHalfPayDays: 30,
  sickUnpaidDays: 45,
  probationMonths: 6,
});

export type LeaveRecord = {
  leaveType: "annual_leave" | "sick_leave" | string;
  days: number;
  startDate: string; // YYYY-MM-DD
};

const DAY = 86_400_000;

export function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** Inclusive calendar-day count between two YYYY-MM-DD dates (0 when invalid). */
export function inclusiveDays(startDate: string, endDate: string): number {
  const a = parseDay(startDate);
  const b = parseDay(endDate);
  if (a === null || b === null || b < a) return 0;
  return Math.round((b - a) / DAY) + 1;
}

export function completedMonths(joinDate: string, asOf: string): number {
  const j = parseDay(joinDate);
  const t = parseDay(asOf);
  if (j === null || t === null || t < j) return 0;
  const [jy, jm, jd] = joinDate.split("-").map(Number);
  const [ty, tm, td] = asOf.split("-").map(Number);
  let months = (ty - jy) * 12 + (tm - jm);
  if (td < jd) months -= 1;
  return Math.max(0, months);
}

export function annualLeaveAccrued(joinDate: string, asOf: string, cfg = LEAVE_CONFIG): number {
  const m = completedMonths(joinDate, asOf);
  if (m < 12) return m * cfg.firstYearDaysPerMonth;
  const firstYear = 12 * cfg.firstYearDaysPerMonth;
  const later = ((m - 12) * cfg.annualDaysPerYearAfterFirst) / 12;
  return Math.floor((firstYear + later) * 2) / 2; // half-day precision
}

/** Start (YYYY-MM-DD) of the service year containing asOf. */
export function serviceYearStart(joinDate: string, asOf: string): string {
  const years = Math.floor(completedMonths(joinDate, asOf) / 12);
  const [jy, jm, jd] = joinDate.split("-").map(Number);
  return `${jy + years}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
}

export function splitSickDays(alreadyUsedThisYear: number, requestedDays: number, cfg = LEAVE_CONFIG) {
  const tiers = [
    ["fullPayDays", cfg.sickFullPayDays],
    ["halfPayDays", cfg.sickHalfPayDays],
    ["unpaidDays", cfg.sickUnpaidDays],
  ] as const;
  const out = { fullPayDays: 0, halfPayDays: 0, unpaidDays: 0, beyondStatutoryDays: 0 };
  let used = Math.max(0, alreadyUsedThisYear);
  let remaining = Math.max(0, requestedDays);
  let floor = 0;
  for (const [key, size] of tiers) {
    const ceiling = floor + size;
    const room = Math.max(0, ceiling - Math.max(used, floor));
    const take = Math.min(room, remaining);
    out[key] += take;
    remaining -= take;
    used += take;
    floor = ceiling;
  }
  out.beyondStatutoryDays = remaining;
  return out;
}

export function leaveSummary(joinDate: string, asOf: string, approved: LeaveRecord[], cfg = LEAVE_CONFIG) {
  const accrued = annualLeaveAccrued(joinDate, asOf, cfg);
  const annualTaken = approved.filter((r) => r.leaveType === "annual_leave").reduce((s, r) => s + Math.max(0, r.days), 0);
  const yearStart = serviceYearStart(joinDate, asOf);
  const sickUsed = approved
    .filter((r) => r.leaveType === "sick_leave" && r.startDate >= yearStart)
    .reduce((s, r) => s + Math.max(0, r.days), 0);
  const sickTotal = cfg.sickFullPayDays + cfg.sickHalfPayDays + cfg.sickUnpaidDays;
  const fullLeft = Math.max(0, cfg.sickFullPayDays - sickUsed);
  const halfLeft = Math.max(0, cfg.sickFullPayDays + cfg.sickHalfPayDays - Math.max(sickUsed, cfg.sickFullPayDays));
  const unpaidLeft = Math.max(0, sickTotal - Math.max(sickUsed, cfg.sickFullPayDays + cfg.sickHalfPayDays));
  const months = completedMonths(joinDate, asOf);
  return {
    monthsOfService: months,
    inProbation: months < cfg.probationMonths,
    annual: { accrued, taken: annualTaken, balance: accrued - annualTaken },
    sick: { serviceYearStart: yearStart, used: sickUsed, fullPayLeft: fullLeft, halfPayLeft: halfLeft, unpaidLeft },
  };
}

export const LEAVE_FORM_TYPES = ["annual_leave", "sick_leave", "emergency_leave", "unpaid_leave"] as const;
export const MAX_LEAVE_FORM_DAYS = 90;

export type LeaveFormResult =
    | { ok: true; leaveType: string; startDate: string; endDate: string; leaveDays: number; certificatePath: string | null }
    | { ok: false; error: string };

/**
 * Validates a structured leave form server-side. Day count is always recomputed here;
 * any client-sent count is ignored. A certificate must sit under the caller's own
 * protected staffDocuments/{uid}/medical_certificate/ path. Sick leave needs one.
 */
export function validateLeaveForm(input: unknown, uid: string, today: string): LeaveFormResult {
    const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    const leaveType = String(raw.leaveType || "");
    if (!(LEAVE_FORM_TYPES as readonly string[]).includes(leaveType)) return { ok: false, error: "Choose a leave type." };
    const startDate = String(raw.startDate || "");
    const endDate = String(raw.endDate || "");
    const start = parseDay(startDate);
    const end = parseDay(endDate);
    const now = parseDay(today);
    if (start === null || end === null || now === null) return { ok: false, error: "Start and end dates are required (YYYY-MM-DD)." };
    if (end < start) return { ok: false, error: "End date must be on or after the start date." };
    const day = 86400000;
    if (start < now - 60 * day) return { ok: false, error: "Start date is more than 60 days in the past. Ask HR directly." };
    if (start > now + 365 * day) return { ok: false, error: "Start date is more than a year ahead." };
    const leaveDays = inclusiveDays(startDate, endDate);
    if (leaveDays < 1 || leaveDays > MAX_LEAVE_FORM_DAYS) return { ok: false, error: `Leave must be 1 to ${MAX_LEAVE_FORM_DAYS} days.` };
    const certRaw = raw.certificatePath ? String(raw.certificatePath) : "";
    let certificatePath: string | null = null;
    if (certRaw) {
        const prefix = `staffDocuments/${uid}/medical_certificate/`;
        if (!certRaw.startsWith(prefix) || certRaw.includes("..") || certRaw.length > 400) return { ok: false, error: "Certificate must be uploaded from this screen." };
        certificatePath = certRaw;
    }
    if (leaveType === "sick_leave" && !certificatePath) return { ok: false, error: "Sick leave needs a medical certificate." };
    return { ok: true, leaveType, startDate, endDate, leaveDays, certificatePath };
}
