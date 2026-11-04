import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const { computeShiftHours, overtimePayFor, payableDays, basicHourlyRate, monthDates } = await loadTsModules('functions/hrHoursEngine.ts', ['functions/hrPayConfig.ts']);
const { HR_PAY_CONFIG } = await loadTsModules('functions/hrPayConfig.ts');

// Dubai is UTC+4; build instants from local wall-clock times.
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+04:00`);
const shift = (date, from, to, toDate = date) => ({ shiftDate: date, clockInMs: at(date, from), clockOutMs: at(toDate, to) });

test('config matches UAE law: 25% / 50% premiums, 2h cap, 8h day, night 22:00-04:00', () => {
  assert.equal(HR_PAY_CONFIG.ordinaryOvertimePremium, 0.25);
  assert.equal(HR_PAY_CONFIG.nightOvertimePremium, 0.5);
  assert.equal(HR_PAY_CONFIG.restDayPremium, 0.5);
  assert.equal(HR_PAY_CONFIG.maxOvertimeMinutesPerDay, 120);
  assert.equal(HR_PAY_CONFIG.normalDailyMinutes, 480);
  assert.equal(HR_PAY_CONFIG.nightStartMinute, 1320);
  assert.equal(HR_PAY_CONFIG.nightEndMinute, 240);
});

test('normal 8h day has no overtime', () => {
  const d = computeShiftHours(shift('2026-11-02', '07:00', '15:00')); // Monday
  assert.equal(d.workedMinutes, 480);
  assert.equal(d.overtimeMinutes, 0);
});

test('overtime is capped at 2h per day', () => {
  const d = computeShiftHours(shift('2026-11-02', '07:00', '19:00'));
  assert.equal(d.uncappedOvertimeMinutes, 240);
  assert.equal(d.overtimeMinutes, 120);
  assert.equal(d.ordinaryOvertimeMinutes, 120);
  assert.equal(d.nightOvertimeMinutes, 0);
});

test('overtime after 22:00 is night overtime', () => {
  const d = computeShiftHours(shift('2026-11-02', '13:00', '23:00'));
  assert.equal(d.overtimeMinutes, 120); // 21:00-23:00
  assert.equal(d.ordinaryOvertimeMinutes, 60);
  assert.equal(d.nightOvertimeMinutes, 60);
});

test('rest day (Sunday) work is rest-day time, not ordinary overtime', () => {
  const d = computeShiftHours(shift('2026-11-01', '08:00', '12:00')); // Sunday
  assert.equal(d.restDay, true);
  assert.equal(d.restDayMinutes, 240);
  assert.equal(d.overtimeMinutes, 0);
});

test('pay: ordinary 1.25x, night 1.5x, rest day 1.5x of basic hourly', () => {
  const basic = 3650; // hourly = 3650*12/365/8 = 15
  assert.equal(basicHourlyRate(basic), 15);
  const days = [
    computeShiftHours(shift('2026-11-02', '13:00', '23:00')), // 60 ord + 60 night
    computeShiftHours(shift('2026-11-01', '08:00', '10:00')), // 120 rest day
  ];
  const pay = overtimePayFor(days, basic);
  assert.equal(pay.ordinaryPay, 18.75);
  assert.equal(pay.nightPay, 22.5);
  assert.equal(pay.restDayPay, 45);
  assert.equal(pay.overtimePay, 86.25);
});

test('payable overtime needs approval: bounded by approved minutes per day, zero without approval', () => {
  const days = [computeShiftHours(shift('2026-11-02', '07:00', '19:00'))];
  assert.equal(payableDays(days, {})[0].overtimeMinutes, 0);
  assert.equal(payableDays(days, { '2026-11-02': 45 })[0].overtimeMinutes, 45);
  assert.equal(payableDays(days, { '2026-11-02': 999 })[0].overtimeMinutes, 120);
});

test('monthDates lists every day of the month', () => {
  assert.equal(monthDates('2026-02').length, 28);
  assert.equal(monthDates('2026-11').at(-1), '2026-11-30');
});

test('payroll generation feeds server overtime instead of overtime: 0', () => {
  const src = readFileSync(new URL('../functions/hrAutomation.ts', import.meta.url), 'utf8');
  assert.match(src, /computeMonthlyOvertime\(tech\.id, month, base\)/);
  assert.match(src, /overtimePay,/);
  assert.match(src, /source: "SERVER_HOURS_ENGINE"/);
  assert.doesNotMatch(src, /overtime: 0,/);
  assert.match(src, /overtime: payrollOvertime/);
  // Settle stays MFA Finance Admin only.
  assert.match(src, /await requireMfaFinanceAdminActor\(request\);/);
});
