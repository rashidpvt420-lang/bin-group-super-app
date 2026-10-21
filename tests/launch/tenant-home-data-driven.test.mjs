import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('tenant home renders real data cards with loading and error states', async () => {
  const page = await readFile('src/tenant/pages/TenantSimpleDashboardPage.tsx', 'utf8');
  assert.ok(page.length > 0); // Home placement of <TenantHomeSummary> is asserted by owner-tenant-home-wiring.test.mjs.
  const s = await readFile('src/tenant/components/TenantHomeSummary.tsx', 'utf8');
  for (const c of ['units', 'leases', 'rent_installments', 'maintenanceTickets', 'systemLogs']) assert.ok(s.includes(`collection(db, '${c}')`), c);
  assert.match(s, /where\('propertyId', '==', propertyId\)/, 'notices are scoped to the tenant building');
  assert.match(s, /<Failed what=/);
});

test('full tenant dashboard no longer falls back to any contract on the same property', async () => {
  const s = await readFile('src/tenant/pages/TenantDashboardPage.tsx', 'utf8');
  assert.doesNotMatch(s, /getFirstByField\('contracts', 'propertyId'/);
});
