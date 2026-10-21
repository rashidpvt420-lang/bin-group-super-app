import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCsv, planBackfill, confirmTokenFor } from '../../scripts/backfill-lease-end-dates.mjs';

test('backfill plan only fills leases that exist and have no end date; dates are validated', () => {
  const rows = parseCsv('leaseId,startDate,endDate\nl1,2026-05-01,2027-04-30\nl2,2026-05-01,2026-04-30\nl3,2026-05-01,2027-04-30\nmissing,2026-05-01,2027-04-30\nbad id!,2026-05-01,2027-04-30\n');
  const existing = new Map([['l1', {}], ['l2', {}], ['l3', { leaseEndDate: '2027-01-01' }]]);
  const { plan, skipped } = planBackfill(rows, existing);
  assert.deepEqual(plan, [{ leaseId: 'l1', set: { leaseStartDate: '2026-05-01', leaseEndDate: '2027-04-30', endDate: '2027-04-30' } }]);
  assert.deepEqual(skipped.map((s) => s.reason), ['start/end must be YYYY-MM-DD with end after start', 'already has an end date', 'lease not found', 'invalid leaseId']);
  assert.equal(confirmTokenFor(plan).length, 12);
});

test('backfill is dry-run by default and needs --apply plus the exact confirm token', async () => {
  const s = await readFile('scripts/backfill-lease-end-dates.mjs', 'utf8');
  assert.match(s, /if \(!args\.apply\) return;/);
  assert.match(s, /timingSafeEqual\(given, expected\)\) throw/);
});

test('renewal watch reports leases missing an end date and alerts admins', async () => {
  const s = await readFile('functions/contractRenewalPdfSystem.ts', 'utf8');
  assert.match(s, /export function leaseMissingEndDate\(/);
  assert.match(s, /leasesMissingEndDate: missing/);
  assert.match(s, /DEGRADED_MISSING_END_DATES/);
  assert.match(s, /type: "LEASE_DATA_QUALITY"/);
});
