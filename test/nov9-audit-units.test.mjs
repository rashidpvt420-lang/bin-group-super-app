// Unit tests for the Nov 9 audit fixes (pure helpers).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const pins = await loadTsModules('src/components/onboarding/propertyPinStatus.ts', ['src/components/onboarding/ownerLocationRules.ts']);
const hours = await loadTsModules('functions/hrHoursEngine.ts', ['functions/hrPayConfig.ts']);
const shift = await loadTsModules('functions/technicianPayableShift.ts');
const sick = await loadTsModules('src/technician/utils/sickLeaveTiers.ts');
const payroll = await loadTsModules('functions/hrPayrollEligibility.ts');

const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+04:00`);

test('P1-1: review blocks when any property lacks its own exact pin', () => {
  const pinned = { geo: { lat: 25.0781, lng: 55.1405 } };
  const centroid = { geo: { lat: 25.2048, lng: 55.2708 } };
  assert.equal(pins.propertiesMissingGps([pinned]), false);
  assert.equal(pins.propertiesMissingGps([pinned, {}]), true);
  assert.equal(pins.propertiesMissingGps([pinned, centroid]), true);
  assert.equal(pins.firstUnpinnedPropertyIndex([pinned, {}, {}]), 1);
  assert.equal(pins.firstUnpinnedPropertyIndex([pinned, {}, {}], 1), 2);
  assert.equal(pins.hasValidPropertyPin({ geo: { lat: 0, lng: 0 } }), false);
});

test('P1-3: a 9 h span with a 60 min break is 480 worked and 0 overtime', () => {
  const d = hours.computeShiftHours({ shiftDate: '2026-11-10', clockInMs: at('2026-11-10', '08:00'), clockOutMs: at('2026-11-10', '17:00'), breakMinutes: 60 });
  assert.equal(d.workedMinutes, 480);
  assert.equal(d.overtimeMinutes, 0);
});

test('P1-3: a 9.5 h span with a 60 min break is 510 worked and 30 overtime', () => {
  const d = hours.computeShiftHours({ shiftDate: '2026-11-10', clockInMs: at('2026-11-10', '08:00'), clockOutMs: at('2026-11-10', '17:30'), breakMinutes: 60 });
  assert.equal(d.workedMinutes, 510);
  assert.equal(d.overtimeMinutes, 30);
});

test('P1-3: break ledger opens on BREAK and closes on RESUME / CLOCK_OUT', () => {
  const t0 = Date.parse('2026-11-10T08:00:00Z');
  const open = shift.payableBreakPatch({ status: 'ACTIVE' }, 'BREAK', t0);
  assert.ok(open.breakStartedAt instanceof Date);
  const closed = shift.payableBreakPatch({ status: 'ON_BREAK', breakStartedAt: open.breakStartedAt, totalBreakMinutes: 10 }, 'RESUME', t0 + 45 * 60000);
  assert.equal(closed.totalBreakMinutes, 55);
  assert.equal(closed.breakStartedAt, null);
  assert.equal(closed.breaks.length, 1);
  assert.equal(closed.breaks[0].minutes, 45);
  assert.deepEqual(shift.payableBreakPatch({ status: 'ACTIVE' }, 'RESUME', t0), {});
  assert.equal(shift.recordedBreakMinutes({ totalBreakMinutes: 55 }), 55);
  assert.equal(shift.recordedBreakMinutes({}), 0);
});

test('P2-15: 15 sick days used + 5 requested are 5 half-pay days', () => {
  assert.deepEqual(sick.splitSickDays(15, 5), { fullPayDays: 0, halfPayDays: 5, unpaidDays: 0, beyondStatutoryDays: 0 });
  assert.deepEqual(sick.splitSickDays(10, 10), { fullPayDays: 5, halfPayDays: 5, unpaidDays: 0, beyondStatutoryDays: 0 });
});

test('P1-2: payroll salary comes from the private HR profile, legacy only as a flagged fallback', () => {
  assert.deepEqual(payroll.resolvePayrollBasicSalary({ salaryPackage: { basicSalary: 4000 } }, { baseSalary: 9999 }), { raw: 4000, source: 'PRIVATE_HR_PROFILE', overtimeEligible: true });
  assert.deepEqual(payroll.resolvePayrollBasicSalary({}, { baseSalary: 3000 }), { raw: 3000, source: 'LEGACY_USERS_BASE_SALARY', overtimeEligible: true });
  assert.deepEqual(payroll.resolvePayrollBasicSalary(null, null), { raw: null, source: 'NONE', overtimeEligible: true });
  for (const role of ['technician', 'hr_staff', 'finance_manager', 'dispatcher']) assert.ok(payroll.PAYROLL_ELIGIBLE_ROLES.includes(role), role);
  for (const role of ['admin', 'super_admin', 'ceo']) assert.ok(!payroll.PAYROLL_ELIGIBLE_ROLES.includes(role), role);
});

test('Nov 9 follow-up (from #1992): salary package overtimeEligible flag is carried with the salary', () => {
  assert.equal(payroll.resolvePayrollBasicSalary({ salaryPackage: { basicSalary: 6000, overtimeEligible: false } }, {}).overtimeEligible, false);
  assert.equal(payroll.resolvePayrollBasicSalary({ salaryPackage: { basicSalary: 6000 } }, {}).overtimeEligible, true);
  assert.equal(payroll.resolvePayrollBasicSalary(null, { baseSalary: 5000 }).overtimeEligible, true);
});
