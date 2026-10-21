import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('renewal callables are exported with App Check and offers are server-written', async () => {
  const runtime = await readFile('functions/runtimeAll.ts', 'utf8');
  assert.match(runtime, /ownerProposeLeaseRenewal, tenantRespondLeaseRenewal/);
  const fn = await readFile('functions/leaseRenewals.ts', 'utf8');
  assert.match(fn, /enforceAppCheck: true/);
  const rules = await readFile('firestore.rules', 'utf8');
  assert.match(rules, /match \/lease_renewals\/\{renewalId\} \{[^}]*allow create, update, delete: if false;/);
});

test('owner Units page offers renewal and tenant payments page shows the offer', async () => {
  const page = await readFile('src/owner/pages/OwnerUnitRegistryPage.tsx', 'utf8');
  assert.match(page, /OwnerLeaseRenewalDialog/);
  const tenant = await readFile('src/tenant/pages/TenantPaymentsPage.tsx', 'utf8');
  assert.match(tenant, /<TenantRenewalOfferPanel uid=\{user\.uid\} \/>/);
});
