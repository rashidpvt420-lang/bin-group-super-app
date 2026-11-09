/**
 * UAE overtime pay configuration (Federal Decree-Law No. 33 of 2021, Arts. 17-19;
 * Cabinet Resolution No. 1 of 2022). Values are policy config, not hard-coded in
 * the engine, so HR/legal can review them in one place.
 */
export const HR_PAY_CONFIG = Object.freeze({
  timeZone: "Asia/Dubai",
  /** Normal working day before overtime starts (Art. 17: 8 hours/day). */
  normalDailyMinutes: 8 * 60,
  /** Maximum payable overtime per day (Art. 19: max 2 hours/day). */
  maxOvertimeMinutesPerDay: 120,
  /** Ordinary overtime premium: at least 25% on top of basic hourly wage. */
  ordinaryOvertimePremium: 0.25,
  /** Overtime between 22:00 and 04:00: at least 50% premium. */
  nightOvertimePremium: 0.5,
  /** Work on the rest day (no substitute day given): at least 50% premium. */
  restDayPremium: 0.5,
  /** Night window, minutes from local midnight. */
  nightStartMinute: 22 * 60,
  nightEndMinute: 4 * 60,
  /** Weekly rest day(s) as JS weekday numbers (0 = Sunday). Default Sunday. */
  defaultRestDays: [0] as readonly number[],
  /** Basic hourly wage = basic monthly * 12 / 365 / 8. */
  daysPerYear: 365,
  hoursPerDay: 8,
});

/**
 * New-hire default schedule (Rashid, 9 Nov 2026): 8 AM - 5 PM with a 1 hour unpaid break = 8 working
 * hours. Used wherever the server fills in workingHours when HR leaves it blank.
 */
export const DEFAULT_SHIFT_START = "08:00";
export const DEFAULT_SHIFT_END = "17:00";
export const DEFAULT_UNPAID_BREAK_MINUTES = 60;
export const DEFAULT_WORKING_HOURS = "8 AM - 5 PM (1 h unpaid break)";
