import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/technician/pages/TechnicianDashboardPage.tsx', 'utf8');

test('technician earnings never show an invented per-job estimate', () => {
  assert.doesNotMatch(source, /completedMonth \* 150/);
  assert.doesNotMatch(source, /helper="Approved payouts"/);
  assert.match(source, /label="Recorded Earnings" value=\{`AED \$\{earnings\.toLocaleString\(\)\}`\}/);
});

test('earnings still come only from the protected payroll_entries ledger', () => {
  assert.match(source, /collection\(db, 'payroll_entries'\), where\('technicianId', '==', user\.uid\)/);
});
