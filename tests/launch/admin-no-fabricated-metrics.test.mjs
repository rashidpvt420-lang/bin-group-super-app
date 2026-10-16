import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// Regression: admin cards showed hard-coded numbers and claims with no data source
// (fixed 70% / 28% progress bars, "Expected settlement within 14 days",
// a zero-progress "Not measured" pilot card, static "Run required" / "Pilot shell" statuses,
// and an unrouted demo owner page with AED 127,568 / ADMIN_001_CEO / Al-Mansoori fixtures).

test('profitability receivable bars come from ledger proportions', async () => {
  const cfo = await read('apps/admin-panel/src/pages/admin/ProfitabilityPage.tsx');
  assert.doesNotMatch(cfo, /LinearProgress[^>]*value=\{\d+\}/);
  assert.doesNotMatch(cfo, /Expected settlement within 14 days/);
  assert.match(cfo, /export function receivableShare\(/);
  const fn = cfo.slice(cfo.indexOf('export function receivableShare'), cfo.indexOf('export default'));
  assert.match(fn, /total > 0 \? Math\.round\(\(a \/ total\) \* 100\) : 0/);
  assert.equal((cfo.match(/value=\{receivableShare\(/g) || []).length, 2);
});

test('pilot proof card shows an honest empty state, not a fake progress value', async () => {
  const dash = await read('apps/admin-panel/src/pages/dashboard/AdminSimpleDashboardPage.tsx');
  assert.doesNotMatch(dash, /LinearProgress/);
  assert.match(dash, /No data source yet/);
});

test('premium command panel has no static fake statuses', async () => {
  const panel = await read('apps/admin-panel/src/components/AdminPremiumCommandPanel.tsx');
  assert.doesNotMatch(panel, /'Run required'|'Pilot shell'/);
});

test('unrouted demo owner details page with fixture data is gone', async () => {
  await assert.rejects(access(new URL('apps/admin-panel/src/pages/owners/OwnerDetailsPage.tsx', root)));
  const app = await read('apps/admin-panel/src/App.tsx');
  assert.doesNotMatch(app, /ADMIN_001_CEO|127,568|Al-Mansoori/);
});
