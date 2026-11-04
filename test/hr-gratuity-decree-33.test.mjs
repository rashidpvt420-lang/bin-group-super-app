import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const E = await loadTsModules('src/lib/uaeWorkforceComplianceEngine.ts');
const base = { basicMonthlySalaryAed: 3000, joiningDate: new Date('2023-01-01') };

for (const [label, last] of [['2 years', '2025-01-01'], ['4 years', '2027-01-01'], ['6 years', '2029-01-01']]) {
  test(`resignation after ${label} pays the same as termination (no 1/3 or 2/3 cut)`, () => {
    const r = E.calculateEosbEstimate({ ...base, lastWorkingDate: new Date(last), terminationReason: 'resignation' });
    const t = E.calculateEosbEstimate({ ...base, lastWorkingDate: new Date(last), terminationReason: 'employer_terminated' });
    assert.equal(r.resignationMultiplier, 1);
    assert.equal(r.finalEstimateAed, t.finalEstimateAed);
    assert.ok(r.finalEstimateAed > 0);
  });
}

test('2 years at AED 3,000 basic = 2 x 21 days x 100 = AED 4,200', () => {
  const r = E.calculateEosbEstimate({ ...base, lastWorkingDate: new Date('2025-01-01'), terminationReason: 'resignation' });
  assert.ok(Math.abs(r.finalEstimateAed - 4200) <= 15, String(r.finalEstimateAed));
});

test('under 1 year still pays nothing', () => {
  const r = E.calculateEosbEstimate({ ...base, lastWorkingDate: new Date('2023-10-01'), terminationReason: 'resignation' });
  assert.equal(r.finalEstimateAed, 0);
});

test('source no longer contains resignation reductions', () => {
  const src = readFileSync('src/lib/uaeWorkforceComplianceEngine.ts', 'utf8');
  assert.doesNotMatch(src, /1 \/ 3|2 \/ 3/);
});
