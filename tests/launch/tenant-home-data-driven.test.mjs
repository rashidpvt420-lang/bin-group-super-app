import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('tenant home (R5 look) is wired to real rent, lease and building-notice data with loading and error states', async () => {
  const page = await readFile('src/tenant/pages/TenantSimpleDashboardPage.tsx', 'utf8');
  assert.match(page, /useTenantHomeExtras\(user\?\.uid \|\| '', String\(unit\?\.propertyId \|\| ''\), unitLoading\)/);
  for (const id of ['tenant-home-rent', 'tenant-home-lease', 'tenant-home-active-request', 'tenant-home-notices']) assert.ok(page.includes(`testId="${id}"`), id);
  for (const k of ['tenant.home.rentError', 'tenant.home.leaseError', 'tenant.home.noticesError', 'tenant.home.nothingDue']) assert.ok(page.includes(k), k);
  assert.doesNotMatch(page, /tenant\.home\.rentSoon/, 'rent is no longer a placeholder');
  const s = await readFile('src/tenant/components/TenantHomeSummary.tsx', 'utf8');
  for (const c of ['leases', 'rent_installments', 'systemLogs']) assert.ok(s.includes(`collection(db, '${c}')`), c);
  assert.ok(s.includes("where('propertyId', '==', propertyId)"), 'notices are scoped to the tenant building');
  assert.ok(s.includes("where('tenantUid', '==', uid)") && s.includes("where('tenantId', '==', uid)"), 'reads are bound to the signed-in tenant');
  assert.doesNotMatch(s + page, /updateDoc|setDoc|addDoc|httpsCallable/);
});

test('full tenant dashboard no longer falls back to any contract on the same property', async () => {
  const s = await readFile('src/tenant/pages/TenantDashboardPage.tsx', 'utf8');
  assert.doesNotMatch(s, /getFirstByField\('contracts', 'propertyId'/);
});
