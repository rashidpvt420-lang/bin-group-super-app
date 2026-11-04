import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const L = await loadTsModules('functions/hrLeaveEngine.ts');

test('inclusive day count', () => {
  assert.equal(L.inclusiveDays('2026-11-01', '2026-11-05'), 5);
  assert.equal(L.inclusiveDays('2026-11-05', '2026-11-01'), 0);
  assert.equal(L.inclusiveDays('bad', '2026-11-01'), 0);
});

test('annual leave: 2 days per month in year one', () => {
  assert.equal(L.annualLeaveAccrued('2026-01-15', '2026-01-20'), 0);
  assert.equal(L.annualLeaveAccrued('2026-01-15', '2026-04-15'), 6);
  assert.equal(L.annualLeaveAccrued('2026-01-15', '2026-12-14'), 20);
});

test('annual leave: 30 days per year after the first year', () => {
  assert.equal(L.annualLeaveAccrued('2025-01-01', '2026-01-01'), 24);
  assert.equal(L.annualLeaveAccrued('2024-01-01', '2026-01-01'), 54); // 24 + 30
  assert.equal(L.annualLeaveAccrued('2025-01-01', '2026-02-01'), 26.5);
});

test('sick leave tiers: 15 full, 30 half, 45 unpaid', () => {
  assert.deepEqual(L.splitSickDays(0, 10), { fullPayDays: 10, halfPayDays: 0, unpaidDays: 0, beyondStatutoryDays: 0 });
  assert.deepEqual(L.splitSickDays(10, 10), { fullPayDays: 5, halfPayDays: 5, unpaidDays: 0, beyondStatutoryDays: 0 });
  assert.deepEqual(L.splitSickDays(40, 10), { fullPayDays: 0, halfPayDays: 5, unpaidDays: 5, beyondStatutoryDays: 0 });
  assert.deepEqual(L.splitSickDays(85, 10), { fullPayDays: 0, halfPayDays: 0, unpaidDays: 5, beyondStatutoryDays: 5 });
});

test('summary deducts approved leave and resets sick use each service year', () => {
  const s = L.leaveSummary('2024-03-01', '2026-11-04', [
    { leaveType: 'annual_leave', days: 10, startDate: '2026-06-01' },
    { leaveType: 'sick_leave', days: 20, startDate: '2025-12-01' }, // previous service year
    { leaveType: 'sick_leave', days: 18, startDate: '2026-04-01' },
  ]);
  assert.equal(s.sick.serviceYearStart, '2026-03-01');
  assert.equal(s.sick.used, 18);
  assert.equal(s.sick.fullPayLeft, 0);
  assert.equal(s.sick.halfPayLeft, 27);
  assert.equal(s.sick.unpaidLeft, 45);
  assert.equal(s.annual.taken, 10);
  assert.equal(s.annual.balance, s.annual.accrued - 10);
});

test('approval writes the deduction server-side and the fixed "30" default is gone', () => {
  const fn = readFileSync('functions/hrAutomation.ts', 'utf8');
  assert.match(fn, /export const getMyLeaveBalance = onCall/);
  assert.match(fn, /await recordLeaveDeduction\(requestId, after\)/);
  assert.match(fn, /enforceAppCheck: true/);
  const page = readFileSync('src/technician/pages/TechnicianDashboardPage.tsx', 'utf8');
  assert.doesNotMatch(page, /leaveBalance,\s*'30'/);
  assert.match(page, /httpsCallable\(functions, 'getMyLeaveBalance'\)/);
});
