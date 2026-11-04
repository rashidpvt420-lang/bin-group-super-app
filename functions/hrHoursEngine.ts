import { HR_PAY_CONFIG } from "./hrPayConfig";

/**
 * Server-side hours engine. Pure functions only (no Firestore), so payroll and
 * tests use exactly the same maths.
 */
export type ShiftInput = {
  shiftDate: string; // YYYY-MM-DD (company-local)
  clockInMs: number;
  clockOutMs: number;
};

export type DayHours = {
  shiftDate: string;
  workedMinutes: number;
  overtimeMinutes: number; // capped at maxOvertimeMinutesPerDay
  uncappedOvertimeMinutes: number;
  nightOvertimeMinutes: number;
  ordinaryOvertimeMinutes: number;
  restDay: boolean;
  restDayMinutes: number; // payable rest-day minutes (capped as overtime rules allow)
};

const MINUTE = 60_000;

function localParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { minuteOfDay: Number(get("hour")) * 60 + Number(get("minute")), weekday };
}

export function isNightMinute(minuteOfDay: number, cfg = HR_PAY_CONFIG) {
  return minuteOfDay >= cfg.nightStartMinute || minuteOfDay < cfg.nightEndMinute;
}

export function weekdayOfDate(shiftDate: string) {
  const [y, m, d] = shiftDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Compute one shift's worked/overtime split. Overtime is the time after the normal day. */
export function computeShiftHours(
  shift: ShiftInput,
  opts: { restDays?: readonly number[]; cfg?: typeof HR_PAY_CONFIG } = {},
): DayHours {
  const cfg = opts.cfg || HR_PAY_CONFIG;
  const restDays = opts.restDays || cfg.defaultRestDays;
  const start = Math.floor(shift.clockInMs / MINUTE) * MINUTE;
  const end = Math.floor(shift.clockOutMs / MINUTE) * MINUTE;
  const workedMinutes = Number.isFinite(start) && Number.isFinite(end) && end > start
    ? Math.min(24 * 60, Math.round((end - start) / MINUTE))
    : 0;
  const restDay = restDays.includes(weekdayOfDate(shift.shiftDate));

  if (restDay) {
    // Rest-day work: all worked minutes earn the rest-day premium, but the
    // 2h/day overtime cap still bounds how much the engine treats as payable
    // beyond a normal day.
    const payable = Math.min(workedMinutes, cfg.normalDailyMinutes + cfg.maxOvertimeMinutesPerDay);
    return {
      shiftDate: shift.shiftDate, workedMinutes, restDay: true, restDayMinutes: payable,
      overtimeMinutes: 0, uncappedOvertimeMinutes: 0, nightOvertimeMinutes: 0, ordinaryOvertimeMinutes: 0,
    };
  }

  const uncappedOvertimeMinutes = Math.max(0, workedMinutes - cfg.normalDailyMinutes);
  const overtimeMinutes = Math.min(uncappedOvertimeMinutes, cfg.maxOvertimeMinutesPerDay);
  // Overtime minutes are the first `overtimeMinutes` minutes after the normal day ends.
  let night = 0;
  const otStart = start + cfg.normalDailyMinutes * MINUTE;
  for (let i = 0; i < overtimeMinutes; i += 1) {
    if (isNightMinute(localParts(otStart + i * MINUTE, cfg.timeZone).minuteOfDay, cfg)) night += 1;
  }
  return {
    shiftDate: shift.shiftDate, workedMinutes, restDay: false, restDayMinutes: 0,
    overtimeMinutes, uncappedOvertimeMinutes, nightOvertimeMinutes: night,
    ordinaryOvertimeMinutes: overtimeMinutes - night,
  };
}

export function basicHourlyRate(basicMonthly: number, cfg = HR_PAY_CONFIG) {
  return (basicMonthly * 12) / cfg.daysPerYear / cfg.hoursPerDay;
}

const fils = (n: number) => Math.round(n * 100) / 100;

export type OvertimePay = {
  ordinaryMinutes: number;
  nightMinutes: number;
  restDayMinutes: number;
  hourlyRate: number;
  ordinaryPay: number;
  nightPay: number;
  restDayPay: number;
  overtimePay: number;
};

/**
 * Pay for approved overtime. Ordinary OT = hourly * (1 + 25%), night OT = hourly * (1 + 50%).
 * Rest-day work = hourly * (1 + 50%) for each payable rest-day minute.
 */
export function overtimePayFor(days: DayHours[], basicMonthly: number, cfg = HR_PAY_CONFIG): OvertimePay {
  const hourly = basicHourlyRate(basicMonthly, cfg);
  const ordinaryMinutes = days.reduce((s, d) => s + d.ordinaryOvertimeMinutes, 0);
  const nightMinutes = days.reduce((s, d) => s + d.nightOvertimeMinutes, 0);
  const restDayMinutes = days.reduce((s, d) => s + d.restDayMinutes, 0);
  const ordinaryPay = fils((ordinaryMinutes / 60) * hourly * (1 + cfg.ordinaryOvertimePremium));
  const nightPay = fils((nightMinutes / 60) * hourly * (1 + cfg.nightOvertimePremium));
  const restDayPay = fils((restDayMinutes / 60) * hourly * (1 + cfg.restDayPremium));
  return {
    ordinaryMinutes, nightMinutes, restDayMinutes, hourlyRate: fils(hourly),
    ordinaryPay, nightPay, restDayPay, overtimePay: fils(ordinaryPay + nightPay + restDayPay),
  };
}

/**
 * Payable overtime requires BOTH clock evidence and a supervisor/HR approval:
 * per day, payable minutes = min(engine overtime, approved claim minutes).
 */
export function payableDays(days: DayHours[], approvedMinutesByDate: Record<string, number>): DayHours[] {
  return days.map((d) => {
    const approved = Math.max(0, Math.round(approvedMinutesByDate[d.shiftDate] || 0));
    if (d.restDay) {
      return { ...d, restDayMinutes: Math.min(d.restDayMinutes, approved) };
    }
    const ot = Math.min(d.overtimeMinutes, approved);
    const night = Math.min(d.nightOvertimeMinutes, ot);
    return { ...d, overtimeMinutes: ot, nightOvertimeMinutes: night, ordinaryOvertimeMinutes: ot - night };
  });
}

export function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}
