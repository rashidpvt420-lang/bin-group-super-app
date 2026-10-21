import test from 'node:test';
import assert from 'node:assert/strict';
import { splitAnnualRent } from '../src/owner/rentScheduleSplit.ts';

test('annual rent splits into exact-fils cheques that sum to the total', () => {
  const rows = splitAnnualRent(100000, 3, '2026-11-01');
  assert.deepEqual(rows.map((r) => r.dueDate), ['2026-11-01', '2027-03-01', '2027-07-01']);
  assert.deepEqual(rows.map((r) => r.amount), ['33333.33', '33333.33', '33333.34']);
  assert.equal(rows.reduce((s, r) => s + Math.round(Number(r.amount) * 100), 0), 10000000);
  assert.equal(splitAnnualRent(60000, 12, '2026-01-31')[1].dueDate, '2026-02-28');
  assert.deepEqual(splitAnnualRent(0, 4, '2026-11-01'), []);
  assert.deepEqual(splitAnnualRent(1000, 5, '2026-11-01'), []);
});
