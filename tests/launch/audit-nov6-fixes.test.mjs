import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { payableShiftPatch, dubaiPayrollDateKey, payableShiftDocId } from '../../functions/technicianPayableShift.ts';
import { canonicalUnitNumber, selectTenantResidence } from '../../src/tenant/utils/selectTenantResidence.ts';
import { pendingSettlementAmount } from '../../src/broker/commissionTotals.ts';
import { employmentJoinValue } from '../../src/technician/utils/employmentJoinDate.ts';
import { unmeasuredRateLabel } from '../../src/utils/unmeasuredRateLabel.ts';
import { isPendingOwnerCostApproval } from '../../src/owner/utils/ownerPendingApprovals.ts';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('payable duty clock writes staff_shifts without reopening a finished day', () => {
  assert.equal(dubaiPayrollDateKey(new Date('2026-11-06T20:30:00Z')), '2026-11-07');
  assert.equal(payableShiftDocId('tech1', new Date('2026-11-06T08:00:00Z')), 'SHIFT_tech1_2026-11-06');
  const started = payableShiftPatch(null, 'CLOCK_IN');
  assert.equal(started.reason, 'clocked_in');
  assert.equal(started.setClockIn, true);
  const again = payableShiftPatch({ status: 'ACTIVE', clockInTime: { seconds: 1 } }, 'CLOCK_IN');
  assert.equal(again.setClockIn, false);
  assert.equal(again.fields.status, 'ACTIVE');
  assert.equal(payableShiftPatch({ status: 'COMPLETED', clockInTime: { seconds: 1 } }, 'CLOCK_IN').write, false);
  assert.equal(payableShiftPatch({ status: 'ACTIVE', clockInTime: { seconds: 1 } }, 'CLOCK_OUT').fields.status, 'COMPLETED');
  assert.equal(payableShiftPatch({ status: 'ACTIVE', clockInTime: { seconds: 1 } }, 'CLOCK_OUT').setClockOut, true);
  assert.equal(payableShiftPatch({ status: 'OFF_DUTY' }, 'CLOCK_OUT').write, false);
  assert.equal(payableShiftPatch({ status: 'ACTIVE', clockInTime: { seconds: 1 } }, 'BREAK').fields.status, 'ON_BREAK');
});

test('duplicate tenant units collapse to one residence', () => {
  assert.equal(canonicalUnitNumber('E2E-101'), '101');
  assert.equal(canonicalUnitNumber('101'), '101');
  const chosen = selectTenantResidence([
    { unit: { id: 'b', propertyId: 'p1', unitNumber: 'E2E-101' } },
    { unit: { id: 'a', propertyId: 'p1', unitNumber: '101', leaseVerified: true }, propertyHasDispatchGeo: true },
  ], 'b');
  assert.equal(chosen?.id, 'b');
  const geoWins = selectTenantResidence([
    { unit: { id: 'plain', propertyId: 'p1', unitNumber: '101' } },
    { unit: { id: 'geo', propertyId: 'p1', unitNumber: 'E2E-101' }, propertyHasDispatchGeo: true },
  ]);
  assert.equal(geoWins?.id, 'geo');
  assert.equal(selectTenantResidence([]), null);
});

test('broker pending settlement ignores VOID rows', () => {
  const rows = [
    { status: 'VOID', amount: 1500 },
    { status: 'voided', commissionAmount: 200 },
    { status: 'REJECTED', amount: 80 },
    { status: 'PAID', amount: 40 },
    { status: 'pending', amount: 25 },
    { status: 'APPROVED', amount: 900 },
  ];
  assert.equal(pendingSettlementAmount(rows), 25);
});

test('joining date prefers the HR profile and ignores account creation', () => {
  const created = new Date('2020-01-01');
  const hired = '2024-03-15';
  assert.equal(employmentJoinValue({ joiningDate: hired }, { createdAt: created, joiningDate: '2021-01-01' }), hired);
  assert.equal(employmentJoinValue({ createdAt: created }, { hireDate: '2022-02-02', createdAt: created }), '2022-02-02');
  assert.equal(employmentJoinValue({ createdAt: created }, { createdAt: created }), null);
});

test('unmeasured vendor rates are not printed as 0%', () => {
  assert.equal(unmeasuredRateLabel('SLA', 0), 'SLA: not enough data');
  assert.equal(unmeasuredRateLabel('Repeat', undefined), 'Repeat: not enough data');
  assert.equal(unmeasuredRateLabel('Proof', 0, 4), 'Proof 0%');
  assert.equal(unmeasuredRateLabel('SLA', 92), 'SLA 92%');
});

test('owner approval badge and page share the pending predicate', () => {
  assert.equal(isPendingOwnerCostApproval({ status: 'PENDING' }), true);
  assert.equal(isPendingOwnerCostApproval({ status: 'APPROVED', decision: 'APPROVED' }), false);
  assert.equal(isPendingOwnerCostApproval({ status: 'VOID' }), false);
  assert.equal(isPendingOwnerCostApproval({}), true);
});

test('audit wiring stays in the duty, payroll and owner home paths', async () => {
  const [duty, rules, home, request, design] = await Promise.all([
    read('functions/index.ts'),
    read('firestore.rules'),
    read('src/owner/pages/OwnerSimpleDashboardPage.tsx'),
    read('src/tenant/pages/TenantRequestPage.tsx'),
    read('src/pages/DesignStudioPage.tsx'),
  ]);
  assert.match(duty, /queuePayableShift\(batch, techId, "CLOCK_IN"\)/);
  assert.match(duty, /queuePayableShift\(batch, techId, "CLOCK_OUT"\)/);
  assert.match(rules, /match \/payroll\/\{payrollId\}/);
  assert.match(rules, /'payroll',\n\s+'staffPayslips',\n\s+'salaryHistory'/);
  assert.match(home, /OwnerPortfolioHomeCard/);
  assert.match(request, /selectTenantResidence/);
  assert.match(request, /RESIDENCE_LOOKUP_TIMEOUT_MS/);
  assert.match(design, /stopWaitingForDesign/);
  assert.match(design, /The design service did not return an image/);
});
